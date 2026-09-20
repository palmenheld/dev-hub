import { randomUUID } from "node:crypto";
import type {
  DraftValidation,
  ProductCandidate,
} from "@/types/shopwarePublishing";
import type {
  EbayCandidateInput,
  EbayAspect,
  EbayGeneratedCopy,
  EbayListingDraft,
  EbayListingOptions,
} from "@/types/ebay";
import { validateDraft as validateResearch } from "@/services/shopware/drafts";
import { researchProduct } from "@/services/shopware/research";
import { RESEARCH_POLICY_VERSION } from "@/services/shopware/researchCache";
import { containsInternalQualityLanguage } from "@/services/shopware/customerText";
import {
  descriptionWithoutTrustedAssets,
  renderEbayDescription,
} from "./description";
import { withEbayMutationLock } from "./lock";
import {
  EBAY_COPY_POLICY_VERSION,
  generateEbayCopy,
  generatedEbayAspects,
} from "./copy";
import { getEbayCandidate } from "./candidates";
import {
  applyEbayCandidateOverrides,
  ebayCreationMissing,
  prepareEbayCandidate,
} from "./candidateOverrides";
import {
  getEbayCategoryAspects,
  getEbayCategoryConditions,
} from "./metadata";
import { ebaySuggestedPrice } from "./pricing";
import { getEbayConnection } from "./config";
import { getEbaySettings } from "./store";
import { applyEbayTemplate, resolveEbayTemplate } from "./templates";
import {
  getEbayDraft,
  listEbayDrafts,
  saveEbayDraft,
} from "./store";

function validateDescriptionHtml(value: string) {
  if (/<\s*(script|iframe|form|object|embed|style)\b|\son\w+\s*=|javascript:/i.test(value)) {
    throw new Error("Die Beschreibung enthält nicht erlaubte aktive HTML-Inhalte.");
  }
  const descriptionForPolicyCheck = descriptionWithoutTrustedAssets(value);
  if (
    /<\s*a\b|https?:\/\/|www\.|\b[a-z0-9-]+\.(?:de|com|org|net)\b|\S+@\S+/i.test(
      descriptionForPolicyCheck
    )
  ) {
    throw new Error(
      "Externe Links sind in der eBay-Beschreibung gesperrt. Die Fachquellen bleiben im Hub dokumentiert."
    );
  }
  if (containsInternalQualityLanguage(value.replace(/<[^>]*>/g, " "))) {
    throw new Error(
      "Interne Prüf- oder Verifikationshinweise dürfen nicht im eBay-Kundentext stehen."
    );
  }
}
function compactTitle(candidate: ProductCandidate, germanName: string) {
  const specs = [
    candidate.heightLabel,
    candidate.potSize ? `Topf ${candidate.potSize}` : "",
  ].filter(Boolean);
  const wanted = [germanName, ...specs].join(" – ").trim();
  if (wanted.length <= 80) return wanted;
  const shortened = wanted.slice(0, 80);
  return shortened.includes(" ")
    ? shortened.slice(0, shortened.lastIndexOf(" ")).trim()
    : shortened;
}
function normalizedLatinName(value: string) {
  return value
    .normalize("NFKC")
    .replace(/[‘’]/g, "'")
    .replace(/×/g, "x")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("de-DE");
}

function truncateEbayTitle(value: string) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= 80) return normalized;
  const shortened = normalized.slice(0, 80);
  return shortened.includes(" ")
    ? shortened.slice(0, shortened.lastIndexOf(" ")).trim()
    : shortened;
}

function adaptGeneratedCopy(
  copy: EbayGeneratedCopy,
  candidate: ProductCandidate,
  research: EbayListingDraft["research"]
): EbayGeneratedCopy {
  const germanName = research.confirmedGermanName || candidate.germanName;
  const latinName = research.confirmedLatinName || candidate.latinName;
  const titleParts = [
    germanName,
    normalizedLatinName(germanName) === normalizedLatinName(latinName)
      ? ""
      : latinName,
    candidate.heightLabel,
    candidate.potSize ? `Topf ${candidate.potSize}` : "",
  ].filter(Boolean);
  const specifications = [
    candidate.heightLabel
      ? `in der Verkaufsgröße ${candidate.heightLabel}`
      : "",
    candidate.potSize ? `im Topf ${candidate.potSize}` : "",
  ].filter(Boolean);

  return {
    ...structuredClone(copy),
    title: truncateEbayTitle(titleParts.join(" ")),
    intro: `Angeboten wird ein Exemplar von ${germanName} (${latinName})${specifications.length ? ` ${specifications.join(" ")}` : ""}.`,
  };
}

function findReusablePlantDraft(
  drafts: EbayListingDraft[],
  candidate: ProductCandidate
) {
  const wantedLatinName = normalizedLatinName(candidate.latinName);
  if (!wantedLatinName) return undefined;

  return drafts.find((draft) => {
    if (
      draft.source.articleId === candidate.articleId ||
      !draft.generatedCopy ||
      draft.copyPolicyVersion !== EBAY_COPY_POLICY_VERSION ||
      draft.researchPolicyVersion !== RESEARCH_POLICY_VERSION ||
      !draft.researchValidation.valid
    ) {
      return false;
    }
    const matchesLatinName = [
      draft.source.latinName,
      draft.research.confirmedLatinName,
    ].some((name) => normalizedLatinName(name) === wantedLatinName);
    return (
      matchesLatinName &&
      validateResearch(draft.research, draft.sources).valid
    );
  });
}


const EBAY_PLANT_CATEGORY = {
  id: "19617",
  name: "Pflanzen, Bäume & Sträucher",
} as const;

function isPlantArticle(
  candidate: ProductCandidate,
  copy: EbayGeneratedCopy,
  research: EbayListingDraft["research"]
) {
  const latinName = (research.confirmedLatinName || candidate.latinName).trim();
  const hasBotanicalName =
    latinName.split(/\s+/).length >= 2 &&
    /^[A-Za-zÀ-ÖØ-öø-ÿ×'’ -]+$/.test(latinName);
  if (hasBotanicalName) return true;

  const searchText = [
    candidate.germanName,
    candidate.latinName,
    research.confirmedGermanName,
    research.confirmedLatinName,
    copy.itemSpecifics.commonName,
    copy.itemSpecifics.productType,
  ].join(" ");

  return (
    /\b(?:pflanzen?|palmen?|baum|bäume|bäumchen|sträucher?|hecken?|bambus|bonsai|farne?|gemüse|kakteen?|sukkulenten?|karnivoren?|kletterpflanzen?|kräuter?|obstgehölz|orchideen?|rosen?|wasserpflanzen?|ziergräser?|zimmerpflanzen?|stauden?|gewächs)\b/i.test(
      searchText
    )
  );
}

function sanitizeAspects(value: unknown) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {} as Record<string, string[]>;
  }
  const result: Record<string, string[]> = {};
  for (const [rawName, rawValues] of Object.entries(value).slice(0, 80)) {
    const name = rawName.trim().slice(0, 65);
    if (!name || !Array.isArray(rawValues)) continue;
    const values = rawValues
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim().slice(0, 200))
      .filter(Boolean)
      .slice(0, 30);
    if (values.length) result[name] = [...new Set(values)];
  }
  return result;
}


const CONDITION_VALUES = new Set([
  "NEW",
  "NEW_OTHER",
  "NEW_WITH_DEFECTS",
  "CERTIFIED_REFURBISHED",
  "EXCELLENT_REFURBISHED",
  "VERY_GOOD_REFURBISHED",
  "GOOD_REFURBISHED",
  "SELLER_REFURBISHED",
  "LIKE_NEW",
  "PRE_OWNED_EXCELLENT",
  "USED_EXCELLENT",
  "PRE_OWNED_FAIR",
  "USED_VERY_GOOD",
  "USED_GOOD",
  "USED_ACCEPTABLE",
  "FOR_PARTS_OR_NOT_WORKING",
]);

function optionalNumber(
  value: unknown,
  minimum: number,
  maximum: number,
  integer = false
) {
  if (value === undefined || value === null || value === "") return undefined;
  const result = Number(value);
  if (
    !Number.isFinite(result) ||
    result < minimum ||
    result > maximum ||
    (integer && !Number.isInteger(result))
  ) {
    throw new Error("Eine numerische eBay-Option ist ungültig.");
  }
  return result;
}

function readOption(
  input: Record<string, unknown>,
  key: string,
  maximum: number,
  fallback = ""
) {
  return typeof input[key] === "string"
    ? input[key].trim().slice(0, maximum)
    : fallback;
}

function defaultListingOptions(source: ProductCandidate): EbayListingOptions {
  return {
    subtitle: "",
    condition: "NEW",
    conditionDescription: "",
    brand: "",
    mpn: "",
    ean: "",
    imageUrls: source.imageUrls.slice(0, 24),
    includeCatalogProductDetails: false,
    bestOfferEnabled: false,
  };
}

function sanitizeListingOptions(
  value: unknown,
  draft: EbayListingDraft
): EbayListingOptions {
  const input =
    typeof value === "object" && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const current = draft.options ?? defaultListingOptions(draft.source);
  const condition = readOption(
    input,
    "condition",
    40,
    current.condition || draft.condition
  );
  if (!CONDITION_VALUES.has(condition)) {
    throw new Error("Der gewählte eBay-Artikelzustand ist ungültig.");
  }
  const allowedImages = new Set(draft.source.imageUrls);
  const requestedImages = Array.isArray(input.imageUrls)
    ? input.imageUrls
        .filter((item): item is string => typeof item === "string")
        .filter((item) => allowedImages.has(item))
    : current.imageUrls;
  const packageInput =
    typeof input.packageDetails === "object" &&
    input.packageDetails !== null &&
    !Array.isArray(input.packageDetails)
      ? (input.packageDetails as Record<string, unknown>)
      : null;
  const packageDetails = packageInput
    ? {
        packageType: readOption(
          packageInput,
          "packageType",
          50,
          "PARCEL_OR_PADDED_ENVELOPE"
        ),
        lengthCm: optionalNumber(packageInput.lengthCm, 0.1, 10_000),
        widthCm: optionalNumber(packageInput.widthCm, 0.1, 10_000),
        heightCm: optionalNumber(packageInput.heightCm, 0.1, 10_000),
        weightKg: optionalNumber(packageInput.weightKg, 0.001, 10_000),
        shippingIrregular: packageInput.shippingIrregular === true,
      }
    : undefined;
  return {
    subtitle: readOption(input, "subtitle", 55, current.subtitle),
    condition,
    conditionDescription: readOption(
      input,
      "conditionDescription",
      1_000,
      current.conditionDescription
    ),
    brand: readOption(input, "brand", 65, current.brand),
    mpn: readOption(input, "mpn", 65, current.mpn),
    ean: readOption(input, "ean", 14, current.ean),
    imageUrls: [...new Set(requestedImages)].slice(0, 24),
    quantityLimitPerBuyer: optionalNumber(
      input.quantityLimitPerBuyer,
      1,
      1_000_000,
      true
    ),
    includeCatalogProductDetails: input.includeCatalogProductDetails === true,
    bestOfferEnabled: input.bestOfferEnabled === true,
    bestOfferAutoAcceptPrice: optionalNumber(
      input.bestOfferAutoAcceptPrice,
      0.01,
      1_000_000
    ),
    bestOfferAutoDeclinePrice: optionalNumber(
      input.bestOfferAutoDeclinePrice,
      0.01,
      1_000_000
    ),
    packageDetails,
  };
}
export function validateEbayDraft(
  draft: Pick<
    EbayListingDraft,
    | "title"
    | "descriptionHtml"
    | "categoryId"
    | "price"
    | "quantity"
    | "source"
    | "researchValidation"
    | "aspects"
    | "condition"
    | "options"
    | "generatedCopy"
  >,
  definitions: EbayAspect[] = [],
  supportedConditions: string[] = []
): DraftValidation {
  const overridableResearchErrors = draft.researchValidation.errors.filter(
    (error) =>
      /(?:nur \d+ von \d+ unabhängigen Quellen belegt|unbekannte Quellenverweise|weniger als drei Quellen wurden dokumentiert)/iu.test(
        error
      )
  );
  const errors = draft.researchValidation.errors.filter(
    (error) => !overridableResearchErrors.includes(error)
  );
  const warnings = [
    ...overridableResearchErrors.map(
      (error) => `Manuell prüfbarer Quellenhinweis: ${error}`
    ),
    ...draft.researchValidation.warnings,
    ...(draft.generatedCopy?.qualityWarnings ?? []).map(
      (warning) => `Manuell prüfbarer Quellenhinweis: ${warning}`
    ),
  ];
  const options = draft.options ?? defaultListingOptions(draft.source);
  const condition = options.condition || draft.condition;

  if (!draft.title.trim()) errors.push("Der eBay-Titel fehlt.");
  if (draft.title.length > 80) {
    errors.push(`Der eBay-Titel hat ${draft.title.length} statt höchstens 80 Zeichen.`);
  }
  if (draft.descriptionHtml.trim().length < 100) {
    errors.push("Die eBay-Beschreibung ist zu kurz.");
  }
  const plainDescription = draft.descriptionHtml
    .replace(/<[^>]*>/g, " ")
    .replace(/&[a-z#0-9]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  const wordCount = plainDescription
    ? plainDescription.split(/\s+/).length
    : 0;
  if (wordCount < 180 || wordCount > 550) {
    warnings.push(
      `Die eBay-Beschreibung hat ${wordCount} Wörter (Ziel: 250–450).`
    );
  }
  if (draft.title.length < 60) {
    warnings.push(
      `Der eBay-Titel nutzt nur ${draft.title.length} von 80 möglichen Zeichen.`
    );
  }
  const descriptionForPolicyCheck = descriptionWithoutTrustedAssets(
    draft.descriptionHtml
  );
  if (
    /<\s*(script|iframe|form|object|embed|style|a)\b|\son\w+\s*=|javascript:|https?:\/\/|www\.|\b[a-z0-9-]+\.(?:de|com|org|net)\b|\S+@\S+/i.test(
      descriptionForPolicyCheck
    )
  ) {
    errors.push(
      "Die eBay-Beschreibung enthält aktive Inhalte, externe Adressen oder Kontaktdaten."
    );
  }
  if (!/^\d+$/.test(draft.categoryId)) {
    errors.push("Bitte eine von eBay vorgeschlagene Kategorie wählen.");
  }
  if (!Number.isFinite(draft.price) || draft.price <= 0) {
    errors.push("Der Verkaufspreis ist ungültig.");
  }
  if (!Number.isInteger(draft.quantity) || draft.quantity < 0) {
    errors.push("Der verfügbare Bestand ist ungültig.");
  }
  if (!draft.source.articleNumber || draft.source.articleNumber.length > 50) {
    errors.push("Die Weclapp-Artikelnummer fehlt oder ist für eBay zu lang.");
  }
  if (!options.imageUrls.length) errors.push("Mindestens ein Bild muss ausgewählt sein.");
  if (options.imageUrls.length > 24) errors.push("eBay erlaubt höchstens 24 Bilder.");
  if (supportedConditions.length && !supportedConditions.includes(condition)) {
    errors.push("Der gewählte Artikelzustand ist in dieser eBay-Kategorie nicht erlaubt.");
  }
  if (options.subtitle.length > 55) {
    errors.push("Der eBay-Untertitel darf höchstens 55 Zeichen haben.");
  }
  if (options.subtitle) {
    warnings.push("Ein eBay-Untertitel kann eine zusätzliche Angebotsgebühr verursachen.");
  }
  if (condition !== "NEW" && !options.conditionDescription) {
    warnings.push("Für diesen Zustand empfiehlt eBay eine Zustandsbeschreibung.");
  }
  if (options.ean && !/^\d{8,14}$/.test(options.ean)) {
    errors.push("Die EAN muss aus 8 bis 14 Ziffern bestehen.");
  }
  if (
    options.quantityLimitPerBuyer !== undefined &&
    (!Number.isInteger(options.quantityLimitPerBuyer) ||
      options.quantityLimitPerBuyer < 1)
  ) {
    errors.push("Die Höchstmenge pro Käufer ist ungültig.");
  }
  if (options.bestOfferEnabled) {
    if (
      options.bestOfferAutoAcceptPrice !== undefined &&
      options.bestOfferAutoAcceptPrice >= draft.price
    ) {
      errors.push("Die automatische Annahme muss unter dem Sofort-Kaufen-Preis liegen.");
    }
    if (
      options.bestOfferAutoDeclinePrice !== undefined &&
      options.bestOfferAutoAcceptPrice !== undefined &&
      options.bestOfferAutoDeclinePrice >= options.bestOfferAutoAcceptPrice
    ) {
      errors.push("Die automatische Ablehnung muss unter der automatischen Annahme liegen.");
    }
  }
  if (options.packageDetails) {
    const packageValues = [
      options.packageDetails.lengthCm,
      options.packageDetails.widthCm,
      options.packageDetails.heightCm,
      options.packageDetails.weightKg,
    ];
    if (packageValues.some((value) => value === undefined)) {
      errors.push("Für Versandmaße werden Länge, Breite, Höhe und Gewicht benötigt.");
    }
  }

  const definitionNames = new Set(definitions.map((item) => item.name));
  for (const aspect of definitions) {
    const values = (draft.aspects[aspect.name] ?? []).filter((value) =>
      value.trim()
    );
    if (aspect.required && !values.length) {
      errors.push(`eBay-Pflichtmerkmal fehlt: ${aspect.name}.`);
    }
    if (values.length > aspect.maxValues) {
      errors.push(
        `${aspect.name}: höchstens ${aspect.maxValues} Wert(e) erlaubt.`
      );
    }
    if (
      aspect.mode === "selection_only" &&
      values.some((value) => !aspect.values.includes(value))
    ) {
      errors.push(`${aspect.name}: bitte nur einen eBay-Auswahlwert verwenden.`);
    }
    if (
      aspect.maxLength > 0 &&
      values.some((value) => value.length > aspect.maxLength)
    ) {
      errors.push(
        `${aspect.name}: ein Wert überschreitet ${aspect.maxLength} Zeichen.`
      );
    }
  }
  const missingRecommended = definitions
    .filter(
      (aspect) =>
        aspect.recommended &&
        !(draft.aspects[aspect.name] ?? []).some((value) => value.trim())
    )
    .map((aspect) => aspect.name);
  if (missingRecommended.length) {
    const visible = missingRecommended.slice(0, 8).join(", ");
    const more = missingRecommended.length > 8
      ? ` und ${missingRecommended.length - 8} weitere`
      : "";
    warnings.push(
      `Für mehr eBay-Sichtbarkeit empfohlen: ${visible}${more}.`
    );
  }
  if (
    definitions.length &&
    Object.keys(draft.aspects).some((name) => !definitionNames.has(name))
  ) {
    errors.push("Ein oder mehrere Merkmale gehören nicht mehr zur gewählten Kategorie.");
  }
  if (/^\d+$/.test(draft.categoryId) && !definitions.length) {
    warnings.push(
      "Die Kategorie-Pflichtmerkmale konnten noch nicht mit eBay abgeglichen werden."
    );
  }

  return {
    valid: errors.length === 0,
    errors: [...new Set(errors)],
    warnings: [...new Set(warnings)],
  };
}

async function applyAutomaticEbayDefaults(draft: EbayListingDraft) {
  if (
    (draft.status !== "ready" && draft.status !== "blocked")
  ) {
    return draft;
  }

  const automaticCategory =
    !draft.categoryId &&
    draft.generatedCopy &&
    isPlantArticle(draft.source, draft.generatedCopy, draft.research)
      ? EBAY_PLANT_CATEGORY
      : null;
  const standardPrice = draft.source.price;
  const heightCm = draft.source.heightCm;
  const automaticPrice =
    !draft.manuallyEdited &&
    !draft.templateId &&
    standardPrice !== undefined &&
    heightCm !== undefined &&
    Math.abs(draft.price - standardPrice) < 0.005
      ? ebaySuggestedPrice(standardPrice, heightCm)
      : null;
  if (!automaticCategory && automaticPrice === null) {
    return draft;
  }

  const next: EbayListingDraft = {
    ...draft,
    categoryId: automaticCategory?.id || draft.categoryId,
    categoryName: automaticCategory?.name || draft.categoryName,
    price: automaticPrice ?? draft.price,
    approvedAt: undefined,
    updatedAt: new Date().toISOString(),
  };
  next.validation = validateEbayDraft(next);
  next.status = next.validation.valid ? "ready" : "blocked";
  await saveEbayDraft(next);
  return next;
}

export async function backfillAutomaticEbayDefaults() {
  const drafts = await listEbayDrafts();
  return Promise.all(drafts.map((draft) => applyAutomaticEbayDefaults(draft)));
}

async function createUnlocked(
  articleId: string,
  replaceExisting: boolean,
  templateId?: string,
  candidateInput?: EbayCandidateInput
) {
  const savedDrafts = await listEbayDrafts();
  const existing = savedDrafts.find(
    (item) => item.source.articleId === articleId
  );
  if (
    existing?.status === "publishing" ||
    existing?.status === "reconciliation_required" ||
    existing?.status === "management_reconciliation_required"
  ) {
    throw new Error("Dieser eBay-Vorgang muss zuerst abgeglichen werden.");
  }
  if (existing?.status === "published" || existing?.status === "paused") {
    throw new Error(
      "Dieser Artikel wird bereits als eBay-Angebot verwaltet. Nutze die Angebotsaktionen im gespeicherten Vorgang."
    );
  }
  if (existing && !replaceExisting) {
    return applyAutomaticEbayDefaults(existing);
  }

  const template = await resolveEbayTemplate(templateId);
  const prepared = prepareEbayCandidate(
    await getEbayCandidate(articleId),
    candidateInput
  );
  const candidate = prepared.candidate;
  const creationMissing = ebayCreationMissing(candidate);
  if (creationMissing.length) {
    throw new Error(
      `Bitte ergänze vor der KI-Erstellung: ${creationMissing.join(", ")}.`
    );
  }
  const reuseSource = findReusablePlantDraft(savedDrafts, candidate);
  const { research, sources } = reuseSource
    ? {
        research: structuredClone(reuseSource.research),
        sources: structuredClone(reuseSource.sources),
      }
    : await researchProduct(candidate);
  const generatedCopy = reuseSource
    ? adaptGeneratedCopy(reuseSource.generatedCopy!, candidate, research)
    : await generateEbayCopy(candidate, research, sources);
  const generatedAspects = generatedEbayAspects(generatedCopy, research);
  const researchValidation = validateResearch(research, sources);
  const now = new Date().toISOString();
  const settings = await getEbaySettings();
  const connection = getEbayConnection(settings);
  const generatedTitle = generatedCopy.title || compactTitle(
    candidate,
    research.confirmedGermanName || candidate.germanName
  );
  const templateValues = template
    ? applyEbayTemplate(template, {
        candidate,
        germanName: research.confirmedGermanName || candidate.germanName,
        latinName: research.confirmedLatinName || candidate.latinName,
        generatedTitle,
      })
    : null;
  const options =
    templateValues?.listingOptions ?? defaultListingOptions(candidate);
  const automaticCategory = isPlantArticle(candidate, generatedCopy, research)
    ? EBAY_PLANT_CATEGORY
    : null;

  const base: EbayListingDraft = {
    id: existing?.id ?? randomUUID(),
    status: "blocked",
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    environment: connection.environment,
    marketplaceId: settings.marketplaceId,
    publishingSettings: settings,
    source: candidate,
    sourceOverrides: prepared.overrides,
    title: templateValues?.title || generatedTitle,
    descriptionHtml: renderEbayDescription(
      generatedCopy,
      candidate,
      research
    ),
    categoryId:
      templateValues?.categoryId || automaticCategory?.id || "",
    categoryName:
      templateValues?.categoryName || automaticCategory?.name || "",
    condition: options.condition,
    options,
    aspects: {
      ...generatedAspects,
      ...(templateValues?.aspects || {}),
    },
    price:
      templateValues?.price ||
      ebaySuggestedPrice(candidate.price!, candidate.heightCm!),
    quantity:
      templateValues?.quantity ??
      Math.max(0, Math.floor(candidate.stock ?? 0)),
    generatedCopy,
    copyPolicyVersion: EBAY_COPY_POLICY_VERSION,
    research,
    researchPolicyVersion: RESEARCH_POLICY_VERSION,
    contentReuse: reuseSource
      ? {
          sourceDraftId: reuseSource.id,
          sourceArticleNumber: reuseSource.source.articleNumber,
          latinName: research.confirmedLatinName || candidate.latinName,
          reusedAt: now,
        }
      : undefined,
    sources,
    researchValidation,
    validation: { valid: false, errors: [], warnings: [] },
    manuallyEdited: false,
    templateId: template?.id,
    templateName: template?.name,
  };
  const draft = {
    ...base,
    validation: validateEbayDraft(base),
  };
  await saveEbayDraft(draft);
  return draft;
}

type EditableInput = {
  title?: unknown;
  descriptionHtml?: unknown;
  categoryId?: unknown;
  categoryName?: unknown;
  aspects?: unknown;
  price?: unknown;
  quantity?: unknown;
  options?: unknown;
};

function text(value: unknown, label: string, minimum: number, maximum: number) {
  if (typeof value !== "string") throw new Error(`${label} ist ungültig.`);
  const result = value.trim();
  if (result.length < minimum || result.length > maximum) {
    throw new Error(
      `${label} muss zwischen ${minimum} und ${maximum} Zeichen lang sein.`
    );
  }
  return result;
}

async function updateUnlocked(id: string, input: EditableInput) {
  const draft = await getEbayDraft(id);
  if (!draft) throw new Error("Der eBay-Entwurf wurde nicht gefunden.");
  if (draft.status !== "ready" && draft.status !== "blocked") {
    throw new Error("Dieser Entwurf kann jetzt nicht bearbeitet werden.");
  }
  const categoryId =
    typeof input.categoryId === "string" ? input.categoryId.trim() : "";
  if (categoryId && !/^\d+$/.test(categoryId)) {
    throw new Error("Bitte eine gültige eBay-Kategorie wählen.");
  }
  const price = Number(input.price);
  const quantity = Number(input.quantity);
  if (!Number.isFinite(price) || price <= 0 || price > 1_000_000) {
    throw new Error("Der eBay-Preis ist ungültig.");
  }
  if (!Number.isInteger(quantity) || quantity < 0 || quantity > 1_000_000) {
    throw new Error("Der eBay-Bestand ist ungültig.");
  }
  const options = sanitizeListingOptions(input.options, draft);
  const settings = await getEbaySettings();
  const [definitions, conditions] = categoryId
    ? await Promise.all([
        getEbayCategoryAspects(categoryId, settings.marketplaceId),
        getEbayCategoryConditions(categoryId, settings.marketplaceId),
      ])
    : [[], []];
  const descriptionHtml = text(input.descriptionHtml, "Beschreibung", 100, 12_000);
  validateDescriptionHtml(descriptionHtml);
  const title = text(input.title, "eBay-Titel", 4, 80);
  const generatedCopy =
    title === draft.title && descriptionHtml === draft.descriptionHtml
      ? draft.generatedCopy
      : undefined;
  const next: EbayListingDraft = {
    ...draft,
    title,
    descriptionHtml,
    categoryId,
    categoryName:
      typeof input.categoryName === "string"
        ? input.categoryName.trim().slice(0, 200)
        : "",
    aspects: Object.fromEntries(
      Object.entries(sanitizeAspects(input.aspects)).filter(([name]) =>
        definitions.some((definition) => definition.name === name)
      )
    ),
    price,
    quantity,
    condition: options.condition,
    options,
    generatedCopy,
    manuallyEdited: true,
    approvedAt: undefined,
    updatedAt: new Date().toISOString(),
  };
  next.validation = validateEbayDraft(
    next,
    definitions,
    conditions.map((condition) => condition.value)
  );
  next.status = next.validation.valid ? "ready" : "blocked";
  await saveEbayDraft(next);
  return next;
}

async function approveUnlocked(id: string) {
  const draft = await getEbayDraft(id);
  if (!draft) throw new Error("Der eBay-Entwurf wurde nicht gefunden.");
  if (draft.status !== "ready" || !draft.validation.valid) {
    throw new Error("Der Entwurf hat noch offene Prüffehler.");
  }
  const settings = await getEbaySettings();
  const [definitions, conditions] = await Promise.all([
    getEbayCategoryAspects(draft.categoryId, settings.marketplaceId),
    getEbayCategoryConditions(draft.categoryId, settings.marketplaceId),
  ]);
  const validation = validateEbayDraft(
    draft,
    definitions,
    conditions.map((condition) => condition.value)
  );
  if (!validation.valid) {
    const blocked = {
      ...draft,
      status: "blocked" as const,
      validation,
      approvedAt: undefined,
      updatedAt: new Date().toISOString(),
    };
    await saveEbayDraft(blocked);
    throw new Error(validation.errors.join(" "));
  }
  const approved: EbayListingDraft = {
    ...draft,
    validation,
    publishingSettings: settings,
    approvedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await saveEbayDraft(approved);
  return approved;
}

async function revalidateUnlocked(id: string) {
  const draft = await getEbayDraft(id);
  if (!draft) throw new Error("Der eBay-Entwurf wurde nicht gefunden.");
  if (draft.status !== "ready" && draft.status !== "blocked") {
    throw new Error("Dieser eBay-Entwurf kann jetzt nicht neu geprüft werden.");
  }
  const settings = await getEbaySettings();
  const [definitions, conditions] = draft.categoryId
    ? await Promise.all([
        getEbayCategoryAspects(draft.categoryId, settings.marketplaceId),
        getEbayCategoryConditions(draft.categoryId, settings.marketplaceId),
      ])
    : [[], []];
  const researchValidation = validateResearch(draft.research, draft.sources);
  const next: EbayListingDraft = {
    ...draft,
    researchValidation,
    approvedAt: undefined,
    updatedAt: new Date().toISOString(),
  };
  next.validation = validateEbayDraft(
    next,
    definitions,
    conditions.map((condition) => condition.value)
  );
  next.status = next.validation.valid ? "ready" : "blocked";
  await saveEbayDraft(next);
  return next;
}

async function regenerateCopyUnlocked(id: string) {
  const draft = await getEbayDraft(id);
  if (!draft) throw new Error("Der eBay-Entwurf wurde nicht gefunden.");
  if (draft.status !== "ready" && draft.status !== "blocked") {
    throw new Error(
      "Der Text kann während oder nach einer eBay-Übertragung nicht neu erzeugt werden."
    );
  }
  const candidate = applyEbayCandidateOverrides(
    await getEbayCandidate(draft.source.articleId),
    draft.sourceOverrides
  );
  const creationMissing = ebayCreationMissing(candidate);
  if (creationMissing.length) {
    throw new Error(
      `Der Artikel ist nicht mehr vollständig: ${creationMissing.join(", ")}.`
    );
  }
  const identityChanged =
    candidate.latinName.trim().toLocaleLowerCase("de-DE") !==
      draft.source.latinName.trim().toLocaleLowerCase("de-DE") ||
    candidate.germanName.trim().toLocaleLowerCase("de-DE") !==
      draft.source.germanName.trim().toLocaleLowerCase("de-DE") ||
    draft.researchPolicyVersion !== RESEARCH_POLICY_VERSION;
  const { research, sources } = identityChanged
    ? await researchProduct(candidate)
    : { research: draft.research, sources: draft.sources };
  const generatedCopy = await generateEbayCopy(candidate, research, sources);
  const generatedAspects = generatedEbayAspects(generatedCopy, research);
  const researchValidation = validateResearch(research, sources);
  const settings = await getEbaySettings();
  const [definitions, conditions] = draft.categoryId
    ? await Promise.all([
        getEbayCategoryAspects(draft.categoryId, settings.marketplaceId),
        getEbayCategoryConditions(draft.categoryId, settings.marketplaceId),
      ])
    : [[], []];
  const next: EbayListingDraft = {
    ...draft,
    status: "blocked",
    updatedAt: new Date().toISOString(),
    environment: getEbayConnection(settings).environment,
    marketplaceId: settings.marketplaceId,
    publishingSettings: settings,
    source: candidate,
    title: generatedCopy.title,
    descriptionHtml: renderEbayDescription(generatedCopy, candidate, research),
    generatedCopy,
    copyPolicyVersion: EBAY_COPY_POLICY_VERSION,
    contentReuse: undefined,
    aspects: {
      ...generatedAspects,
      ...draft.aspects,
    },
    researchPolicyVersion: RESEARCH_POLICY_VERSION,
    research,
    sources,
    researchValidation,
    manuallyEdited: false,
    approvedAt: undefined,
    lastError: undefined,
  };
  next.validation = validateEbayDraft(
    next,
    definitions,
    conditions.map((condition) => condition.value)
  );
  next.status = next.validation.valid ? "ready" : "blocked";
  await saveEbayDraft(next);
  return next;
}

export async function createEbayDraft(
  articleId: string,
  replaceExisting = false,
  templateId?: string,
  candidateInput?: EbayCandidateInput
) {
  const existing = (await listEbayDrafts()).find(
    (item) => item.source.articleId === articleId
  );
  const lockKey = existing
    ? `ebay-draft:${existing.id}`
    : `ebay-article:${articleId}`;
  return withEbayMutationLock(lockKey, () =>
    createUnlocked(articleId, replaceExisting, templateId, candidateInput)
  );
}

export function updateEbayDraft(id: string, input: EditableInput) {
  return withEbayMutationLock(`ebay-draft:${id}`, () => updateUnlocked(id, input));
}

export function approveEbayDraft(id: string) {
  return withEbayMutationLock(`ebay-draft:${id}`, () => approveUnlocked(id));
}

export function revalidateEbayDraft(id: string) {
  return withEbayMutationLock(`ebay-draft:${id}`, () =>
    revalidateUnlocked(id)
  );
}

export function regenerateEbayCopy(id: string) {
  return withEbayMutationLock(`ebay-draft:${id}`, () =>
    regenerateCopyUnlocked(id)
  );
}
