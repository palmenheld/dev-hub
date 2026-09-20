import { randomUUID } from "node:crypto";
import {
  DraftValidation,
  ProductResearch,
  ResearchSource,
  ShopwareProductDraft,
} from "@/types/shopwarePublishing";
import { getProductCandidate } from "./publishingCandidates";
import { parseHeightRange, parsePotDiameter } from "./fieldMapping";
import { isAllowedResearchSource, researchProduct } from "./research";
import { getDraft, listDrafts, saveDraft } from "./dataStore";
import { withMutationLock } from "./mutationLock";
import { customerSafePlantText } from "./customerText";
import { applyProductTemplate, resolveProductTemplate } from "./templates";
import {
  channelContentReuse,
  findReusableChannelContent,
} from "@/services/channelContent";

const REQUIRED_BLOCKS = [
  "identity",
  "appearance",
  "light",
  "water",
  "fertilizer",
  "winter_hardiness",
  "minimum_temperature",
] as const;

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function rootDomain(hostname: string) {
  const host = hostname.toLowerCase().replace(/^www\./, "");
  const parts = host.split(".");
  const commonSecondLevel = new Set(["co.uk", "org.uk", "com.au", "co.nz"]);
  const lastTwo = parts.slice(-2).join(".");
  if (commonSecondLevel.has(lastTwo) && parts.length >= 3) {
    return parts.slice(-3).join(".");
  }
  return lastTwo;
}

function independentDomains(sourceIds: string[], sources: ResearchSource[]) {
  const sourceMap = new Map(sources.map((source) => [source.id, source]));
  return new Set(
    sourceIds
      .map((id) => sourceMap.get(id))
      .filter((source): source is ResearchSource => Boolean(source))
      .map((source) => rootDomain(source.domain))
  );
}

function checkEvidence(
  label: string,
  sourceIds: string[],
  sources: ResearchSource[],
  minimum: number,
  errors: string[]
) {
  const validIds = new Set(sources.map((source) => source.id));
  const uniqueIds = [...new Set(sourceIds)];
  const unknown = uniqueIds.filter((id) => !validIds.has(id));
  if (unknown.length) {
    errors.push(`${label}: unbekannte Quellenverweise (${unknown.join(", ")}).`);
  }
  const domains = independentDomains(uniqueIds, sources);
  if (domains.size < minimum) {
    errors.push(
      `${label}: nur ${domains.size} von ${minimum} unabhängigen Quellen belegt.`
    );
  }
}

export function validateDraft(
  research: ProductResearch,
  sources: ResearchSource[]
): DraftValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!research.researchComplete) {
    warnings.push(
      `Die Recherche meldet offene Punkte: ${research.gaps.join("; ") || "nicht näher bezeichnet"}.`
    );
  }
  const citedIds = new Set([
    ...research.blocks.flatMap((block) => block.sourceIds),
    ...research.care.light.sourceIds,
    ...research.care.water.sourceIds,
    ...research.care.fertilizer.sourceIds,
    ...research.care.winter.sourceIds,
  ]);
  const disallowedSources = sources.filter(
    (source) => citedIds.has(source.id) && !isAllowedResearchSource(source)
  );
  if (disallowedSources.length) {
    errors.push(
      `Nicht zugelassene Quellen wurden zitiert: ${disallowedSources
        .map((source) => source.domain)
        .join(", ")}.`
    );
  }
  for (const key of REQUIRED_BLOCKS) {
    const blocks = research.blocks.filter((block) => block.key === key);
    if (!blocks.length) {
      errors.push(`Pflichtabschnitt fehlt: ${key}.`);
      continue;
    }
    for (const block of blocks) {
      checkEvidence(
        block.heading || key,
        block.sourceIds,
        sources,
        key === "winter_hardiness" || key === "minimum_temperature" ? 3 : 2,
        errors
      );
    }
  }

  checkEvidence("Lichtbedarf", research.care.light.sourceIds, sources, 2, errors);
  checkEvidence("Wasserbedarf", research.care.water.sourceIds, sources, 2, errors);
  checkEvidence(
    "Düngebedarf",
    research.care.fertilizer.sourceIds,
    sources,
    2,
    errors
  );
  checkEvidence(
    "Winterhärte-Kurztext",
    research.care.winter.sourceIds,
    sources,
    3,
    errors
  );

  if (!Number.isFinite(research.minTemperatureC)) {
    errors.push("Die bestätigte Minimaltemperatur fehlt.");
  }
  if (research.metaTitle.length < 40 || research.metaTitle.length > 65) {
    warnings.push(
      `Der Meta-Titel hat ${research.metaTitle.length} Zeichen (Ziel: 45–60).`
    );
  }
  if (
    research.metaDescription.length < 130 ||
    research.metaDescription.length > 170
  ) {
    warnings.push(
      `Die Meta-Beschreibung hat ${research.metaDescription.length} Zeichen (Ziel: 140–160).`
    );
  }
  if (sources.length < 3) {
    errors.push("Weniger als drei Quellen wurden dokumentiert.");
  }

  const overridableErrors = errors.filter((error) =>
    /(?:nur \d+ von \d+ unabhängigen Quellen belegt|unbekannte Quellenverweise|weniger als drei Quellen wurden dokumentiert)/iu.test(
      error
    )
  );
  const blockingErrors = errors.filter(
    (error) => !overridableErrors.includes(error)
  );
  return {
    valid: blockingErrors.length === 0,
    errors: blockingErrors,
    warnings: [
      ...overridableErrors.map(
        (error) => `Manuell prüfbarer Quellenhinweis: ${error}`
      ),
      ...warnings,
    ],
  };
}

function citationLinks(sourceIds: string[], sources: ResearchSource[]) {
  const sourceMap = new Map(sources.map((source) => [source.id, source]));
  return [...new Set(sourceIds)]
    .map((id) => sourceMap.get(id))
    .filter((source): source is ResearchSource => Boolean(source))
    .map(
      (source) =>
        `<a href="${escapeHtml(source.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(source.id)}</a>`
    )
    .join(", ");
}

export function renderDescription(
  research: ProductResearch,
  sources: ResearchSource[]
) {
  const blocks = research.blocks
    .map((block) => {
      const text = customerSafePlantText(block.text);
      return text
        ? `<h2>${escapeHtml(block.heading)}</h2><p>${escapeHtml(text)} <small>Quellen: ${citationLinks(block.sourceIds, sources)}</small></p>`
        : "";
    })
    .join("");
  const citedIds = new Set([
    ...research.blocks.flatMap((block) => block.sourceIds),
    ...research.care.light.sourceIds,
    ...research.care.water.sourceIds,
    ...research.care.fertilizer.sourceIds,
    ...research.care.winter.sourceIds,
  ]);
  const sourceList = sources
    .filter((source) => citedIds.has(source.id))
    .map(
      (source) =>
        `<li><a href="${escapeHtml(source.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(source.title)}</a> – ${escapeHtml(source.publisher)}</li>`
    )
    .join("");

  return `<p><strong>${escapeHtml(research.confirmedGermanName)}</strong> (<em>${escapeHtml(research.confirmedLatinName)}</em>) – fachlich recherchierte Pflanzeninformationen für Standort, Pflege und Überwinterung.</p>${blocks}<h2>Pflege auf einen Blick</h2><ul><li><strong>Licht:</strong> ${escapeHtml(customerSafePlantText(research.care.light.text))}</li><li><strong>Wasser:</strong> ${escapeHtml(customerSafePlantText(research.care.water.text))}</li><li><strong>Düngung:</strong> ${escapeHtml(customerSafePlantText(research.care.fertilizer.text))}</li><li><strong>Winter:</strong> ${escapeHtml(customerSafePlantText(research.care.winter.text))}</li></ul><p><small>Temperaturangaben sind Richtwerte. Standort, Pflanzengröße, Wind, Feuchtigkeit, Wurzelraum und Kübelhaltung beeinflussen die tatsächliche Frostverträglichkeit.</small></p><h2>Verwendete Fachquellen</h2><ol>${sourceList}</ol>`;
}

function draftTitle(
  germanName: string,
  heightLabel: string,
  potSize: string | undefined
) {
  const specifications: string[] = [];
  if (!parseHeightRange(germanName, false)) specifications.push(heightLabel);
  if (potSize && !parsePotDiameter(germanName)) {
    specifications.push("Topf " + potSize);
  }
  return specifications.length
    ? germanName + " – " + specifications.join(", ")
    : germanName;
}

async function createProductDraftUnlocked(
  articleId: string,
  replaceExisting: boolean,
  templateId?: string
) {
  const existing = (await listDrafts(1000)).find(
    (item) => item.source.articleId === articleId
  );
  if (
    existing?.status === "publishing" ||
    existing?.status === "reconciliation_required"
  ) {
    throw new Error(
      "Für diesen Artikel muss zuerst der laufende Shopware-Vorgang abgeglichen werden."
    );
  }
  if (existing?.status === "published") {
    throw new Error("Dieser Artikel wurde bereits in Shopware angelegt.");
  }
  if (existing && !replaceExisting) return existing;

  const candidate = await getProductCandidate(articleId);
  if (candidate.alreadyInShopware) {
    throw new Error("Dieser Artikel ist bereits in Shopware vorhanden.");
  }
  if (!candidate.eligible || !candidate.heightCm) {
    throw new Error(
      `Der Artikel ist noch nicht bereit: ${candidate.missing.join(", ")}.`
    );
  }

  const reuseSource = await findReusableChannelContent(candidate, "shopware");
  const { research, sources } = reuseSource
    ? {
        research: structuredClone(reuseSource.research),
        sources: structuredClone(reuseSource.sources),
      }
    : await researchProduct(candidate);
  const generatedTitle = draftTitle(
    research.confirmedGermanName || candidate.germanName,
    candidate.heightLabel ?? String(Math.round(candidate.heightCm)) + " cm",
    candidate.potSize
  );
  const template = await resolveProductTemplate(templateId);
  const templateValues = template
    ? applyProductTemplate(template, {
        generatedTitle,
        candidate,
        germanName: research.confirmedGermanName || candidate.germanName,
        latinName: research.confirmedLatinName || candidate.latinName,
        price: candidate.price!,
        stock: Math.max(0, Math.floor(candidate.stock ?? 0)),
      })
    : null;
  const finalResearch =
    templateValues?.keywords.length
      ? { ...research, keywords: templateValues.keywords }
      : research;
  const validation = validateDraft(finalResearch, sources);
  const now = new Date().toISOString();
  const draft: ShopwareProductDraft = {
    id: existing?.id ?? randomUUID(),
    status: validation.valid ? "ready" : "blocked",
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    source: candidate,
    price: templateValues?.price ?? candidate.price,
    stock:
      templateValues?.stock ?? Math.max(0, Math.floor(candidate.stock ?? 0)),
    active: templateValues?.active ?? false,
    selectedImageUrls: candidate.imageUrls.slice(0, 20),
    title: templateValues?.title ?? generatedTitle,
    descriptionHtml: renderDescription(finalResearch, sources),
    research: finalResearch,
    contentReuse: reuseSource
      ? channelContentReuse(reuseSource, now)
      : undefined,
    sources,
    validation,
    manuallyEdited: false,
    templateId: template?.id,
    templateName: template?.name,
  };

  await saveDraft(draft);
  return draft;
}

type EditableDraftInput = {
  title?: unknown;
  confirmedGermanName?: unknown;
  confirmedLatinName?: unknown;
  metaTitle?: unknown;
  metaDescription?: unknown;
  keywords?: unknown;
  winterHardy?: unknown;
  minTemperatureC?: unknown;
  blocks?: unknown;
  care?: unknown;
  price?: unknown;
  stock?: unknown;
  active?: unknown;
  selectedImageUrls?: unknown;
};

function correctedText(
  value: unknown,
  label: string,
  minimum: number,
  maximum: number
) {
  if (typeof value !== "string") {
    throw new Error(`${label} ist ungültig.`);
  }
  const text = value.trim();
  if (text.length < minimum || text.length > maximum) {
    throw new Error(
      `${label} muss zwischen ${minimum} und ${maximum} Zeichen lang sein.`
    );
  }
  return text;
}

async function updateProductDraftUnlocked(
  draftId: string,
  input: EditableDraftInput
) {
  const draft = await getDraft(draftId);
  if (!draft) throw new Error("Der Produktentwurf wurde nicht gefunden.");
  if (draft.status !== "ready" && draft.status !== "blocked") {
    throw new Error(
      "Dieser Entwurf kann während oder nach einer Shopware-Übertragung nicht geändert werden."
    );
  }

  if (
    !Array.isArray(input.blocks) ||
    input.blocks.length !== draft.research.blocks.length
  ) {
    throw new Error("Die Textabschnitte sind unvollständig.");
  }
  const blockCorrections = input.blocks as Array<Record<string, unknown>>;
  const care =
    typeof input.care === "object" && input.care !== null
      ? (input.care as Record<string, unknown>)
      : {};
  const readCareText = (key: keyof ProductResearch["care"]) => {
    const item =
      typeof care[key] === "object" && care[key] !== null
        ? (care[key] as Record<string, unknown>)
        : {};
    return correctedText(item.text, `Pflegeangabe ${key}`, 3, 900);
  };

  const minTemperatureC = Number(input.minTemperatureC);
  if (
    !Number.isFinite(minTemperatureC) ||
    minTemperatureC < -80 ||
    minTemperatureC > 60
  ) {
    throw new Error("Die Minimaltemperatur ist ungültig.");
  }
  if (typeof input.winterHardy !== "boolean") {
    throw new Error("Die Angabe zur Winterhärte ist ungültig.");
  }
  if (!Array.isArray(input.keywords) || input.keywords.length > 15) {
    throw new Error("Die SEO-Schlagwörter sind ungültig.");
  }
  const price = Number(input.price ?? draft.price ?? draft.source.price);
  if (!Number.isFinite(price) || price <= 0 || price > 1_000_000) {
    throw new Error("Der Shopware-Verkaufspreis ist ungültig.");
  }
  const stock = Number(input.stock ?? draft.stock ?? draft.source.stock ?? 0);
  if (!Number.isInteger(stock) || stock < 0 || stock > 1_000_000) {
    throw new Error("Der Shopware-Bestand ist ungültig.");
  }
  if (input.active !== undefined && typeof input.active !== "boolean") {
    throw new Error("Der Shopware-Aktivstatus ist ungültig.");
  }
  const allowedImages = new Set([
    ...draft.source.imageUrls,
    ...(draft.uploadedImages ?? []).map((image) => image.url),
  ]);
  const selectedImageUrls = Array.isArray(input.selectedImageUrls)
    ? [...new Set(
        input.selectedImageUrls.filter(
          (item): item is string =>
            typeof item === "string" && allowedImages.has(item)
        )
      )].slice(0, 20)
    : draft.selectedImageUrls ?? draft.source.imageUrls.slice(0, 20);

  const research: ProductResearch = {
    ...draft.research,
    confirmedGermanName: correctedText(
      input.confirmedGermanName,
      "Deutscher Name",
      2,
      140
    ),
    confirmedLatinName: correctedText(
      input.confirmedLatinName,
      "Lateinischer Name",
      2,
      140
    ),
    metaTitle: correctedText(input.metaTitle, "Meta-Titel", 10, 100),
    metaDescription: correctedText(
      input.metaDescription,
      "Meta-Beschreibung",
      30,
      240
    ),
    keywords: input.keywords.map((keyword, index) =>
      correctedText(keyword, `SEO-Schlagwort ${index + 1}`, 1, 60)
    ),
    winterHardy: input.winterHardy,
    minTemperatureC,
    blocks: draft.research.blocks.map((block, index) => {
      const correction = blockCorrections[index];
      return {
        ...block,
        heading: correctedText(
          correction?.heading,
          `Überschrift ${index + 1}`,
          2,
          100
        ),
        text: correctedText(
          correction?.text,
          `Textabschnitt ${index + 1}`,
          20,
          2500
        ),
      };
    }),
    care: {
      light: {
        ...draft.research.care.light,
        text: readCareText("light"),
      },
      water: {
        ...draft.research.care.water,
        text: readCareText("water"),
      },
      fertilizer: {
        ...draft.research.care.fertilizer,
        text: readCareText("fertilizer"),
      },
      winter: {
        ...draft.research.care.winter,
        text: readCareText("winter"),
      },
    },
  };

  const validation = validateDraft(research, draft.sources);
  const updated: ShopwareProductDraft = {
    ...draft,
    price,
    stock,
    active: input.active === true,
    selectedImageUrls,
    title: correctedText(input.title, "Produkttitel", 4, 180),
    research,
    descriptionHtml: renderDescription(research, draft.sources),
    validation,
    status: validation.valid ? "ready" : "blocked",
    manuallyEdited: true,
    approvedAt: undefined,
    updatedAt: new Date().toISOString(),
  };
  await saveDraft(updated);
  return updated;
}

async function approveProductDraftUnlocked(draftId: string) {
  const draft = await getDraft(draftId);
  if (!draft) throw new Error("Der Produktentwurf wurde nicht gefunden.");
  if (draft.status === "published") {
    throw new Error("Dieser Entwurf wurde bereits in Shopware angelegt.");
  }
  if (!draft.validation.valid || draft.status !== "ready") {
    throw new Error(
      "Der Entwurf kann wegen offener Prüffehler nicht freigegeben werden."
    );
  }

  const now = new Date().toISOString();
  const approved: ShopwareProductDraft = {
    ...draft,
    approvedAt: now,
    updatedAt: now,
  };
  await saveDraft(approved);
  return approved;
}

function sameNumber(left?: number, right?: number) {
  if (left === undefined || right === undefined) return left === right;
  return Math.abs(left - right) < 0.005;
}

function refreshedSourceFields(
  previous: ShopwareProductDraft["source"],
  current: ShopwareProductDraft["source"]
) {
  const changes: string[] = [];
  const add = (changed: boolean, label: string) => {
    if (changed) changes.push(label);
  };
  add(previous.articleNumber !== current.articleNumber, "Artikelnummer");
  add(previous.germanName !== current.germanName, "deutscher Name");
  add(previous.latinName !== current.latinName, "lateinischer Name");
  add(
    previous.heightCm !== current.heightCm ||
      previous.heightMinCm !== current.heightMinCm ||
      previous.heightMaxCm !== current.heightMaxCm ||
      previous.heightLabel !== current.heightLabel,
    "Größe"
  );
  add(
    previous.potSize !== current.potSize ||
      previous.potDiameterCm !== current.potDiameterCm,
    "Topfmaß"
  );
  add(!sameNumber(previous.price, current.price), "Standardpreis");
  add(!sameNumber(previous.stock, current.stock), "Bestand");
  add(previous.active !== current.active, "Aktivstatus");
  add(
    JSON.stringify(previous.imageUrls) !== JSON.stringify(current.imageUrls),
    "Bilder"
  );
  add(
    previous.articleCategoryId !== current.articleCategoryId ||
      previous.articleCategoryName !== current.articleCategoryName,
    "Artikelkategorie"
  );
  return changes;
}

async function refreshProductDraftUnlocked(draftId: string) {
  const draft = await getDraft(draftId);
  if (!draft) throw new Error("Der Produktentwurf wurde nicht gefunden.");
  if (draft.status !== "ready" && draft.status !== "blocked") {
    throw new Error(
      "Weclapp-Daten können nur bei einem noch nicht übertragenen Entwurf neu geladen werden."
    );
  }
  const source = await getProductCandidate(draft.source.articleId);
  const changes = refreshedSourceFields(draft.source, source);
  const contentChanged = changes.some((field) =>
    ["deutscher Name", "lateinischer Name", "Größe", "Topfmaß"].includes(field)
  );
  if (!changes.length) return { draft, changes, contentChanged };

  const previousSelected = draft.selectedImageUrls ?? draft.source.imageUrls;
  const previousSourceUrls = new Set(draft.source.imageUrls);
  const currentSourceUrls = new Set(source.imageUrls);
  const uploadedUrls = new Set(
    (draft.uploadedImages ?? []).map((image) => image.url)
  );
  const selectedImageUrls = [
    ...previousSelected.filter(
      (url) => currentSourceUrls.has(url) || uploadedUrls.has(url)
    ),
    ...source.imageUrls.filter((url) => !previousSourceUrls.has(url)),
  ].filter((url, index, all) => all.indexOf(url) === index).slice(0, 20);
  const priceWasAutomatic = sameNumber(
    draft.price ?? draft.source.price,
    draft.source.price
  );
  const previousAutomaticStock = Math.max(
    0,
    Math.floor(draft.source.stock ?? 0)
  );
  const stockWasAutomatic =
    (draft.stock ?? previousAutomaticStock) === previousAutomaticStock;
  const next: ShopwareProductDraft = {
    ...draft,
    source,
    price: priceWasAutomatic ? source.price : draft.price,
    stock: stockWasAutomatic
      ? Math.max(0, Math.floor(source.stock ?? 0))
      : draft.stock,
    selectedImageUrls:
      draft.source.imageUrls.length === 0 && selectedImageUrls.length === 0
        ? source.imageUrls.slice(0, 20)
        : selectedImageUrls,
    approvedAt: undefined,
    updatedAt: new Date().toISOString(),
    lastError: undefined,
  };
  next.status = next.validation.valid ? "ready" : "blocked";
  await saveDraft(next);
  return { draft: next, changes, contentChanged };
}

export async function createProductDraft(
  articleId: string,
  replaceExisting = false,
  templateId?: string
) {
  const existing = (await listDrafts(1000)).find(
    (item) => item.source.articleId === articleId
  );
  const lockKey = existing
    ? "product-draft:" + existing.id
    : "product-article:" + articleId;
  return withMutationLock(lockKey, () =>
    createProductDraftUnlocked(articleId, replaceExisting, templateId)
  );
}

export async function updateProductDraft(
  draftId: string,
  input: EditableDraftInput
) {
  return withMutationLock("product-draft:" + draftId, () =>
    updateProductDraftUnlocked(draftId, input)
  );
}

export async function approveProductDraft(draftId: string) {
  return withMutationLock("product-draft:" + draftId, () =>
    approveProductDraftUnlocked(draftId)
  );
}

export async function refreshProductDraft(draftId: string) {
  return withMutationLock("product-draft:" + draftId, () =>
    refreshProductDraftUnlocked(draftId)
  );
}
