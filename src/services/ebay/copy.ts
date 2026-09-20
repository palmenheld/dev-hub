import type { ProductCandidate, ProductResearch, ResearchSource } from "@/types/shopwarePublishing";
import type { EbayGeneratedCopy } from "@/types/ebay";
import { extractOutputText, openAIResponse } from "@/services/shopware/research";
import { getResearchConfiguration } from "@/services/shopware/publishingCandidates";
import { preferredGermanCommonName } from "@/services/shopware/plantNames";
import {
  containsInternalQualityLanguage,
  customerSafePlantText,
} from "@/services/shopware/customerText";
import { speciesGroupPrompt } from "@/services/plantSpeciesGroup";

const EBAY_COPY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    version: { type: "string", enum: ["ebay-v2"] },
    title: { type: "string" },
    intro: { type: "string" },
    sellingPoints: { type: "array", items: { type: "string" } },
    appearance: { type: "string" },
    location: { type: "string" },
    care: { type: "string" },
    winter: { type: "string" },
    searchTerms: { type: "array", items: { type: "string" } },
    itemSpecifics: {
      type: "object",
      additionalProperties: false,
      properties: {
        commonName: { type: "string" },
        features: {
          type: "array",
          items: {
            type: "string",
            enum: [
              "Biologisch",
              "Blühend",
              "Eingetopft",
              "Einjährig",
              "Eßbar",
              "Hirschresistent",
              "Hitzebeständig",
              "Immergrün",
              "Kleinwüchsig",
              "Laubabwerfend",
              "Luftreinigung",
              "Mehrjährig",
              "Schnellwüchsig",
              "Trockenresistent",
              "Variegated",
              "Winterhart",
              "Zweijährig",
            ],
          },
        },
        waterRequirement: {
          type: "string",
          enum: ["Hoch", "Mittel", "Niedrig"],
        },
        sunlight: {
          type: "array",
          items: {
            type: "string",
            enum: [
              "Mittlere Sonne",
              "Schwache Sonne",
              "Volle Sonne",
              "Vollschatten",
            ],
          },
        },
        productType: {
          type: "string",
          enum: [
            "Bambus",
            "Bäume",
            "Bonsai",
            "Farne",
            "Gemüse",
            "Kakteen & Sukkulenten",
            "Karnivoren",
            "Kletterpflanzen",
            "Kräuter",
            "Obst",
            "Orchideen",
            "Rosen",
            "Sträucher & Hecken",
            "Wasserpflanzen",
            "Ziergräser",
            "Zimmerpflanzen",
          ],
        },
      },
      required: [
        "commonName",
        "features",
        "waterRequirement",
        "sunlight",
        "productType",
      ],
    },
    evidence: {
      type: "object",
      additionalProperties: false,
      properties: {
        intro: { type: "array", items: { type: "string" } },
        sellingPoints: {
          type: "array",
          items: { type: "array", items: { type: "string" } },
        },
        appearance: { type: "array", items: { type: "string" } },
        location: { type: "array", items: { type: "string" } },
        care: { type: "array", items: { type: "string" } },
        winter: { type: "array", items: { type: "string" } },
      },
      required: ["intro", "sellingPoints", "appearance", "location", "care", "winter"],
    },
  },
  required: ["version", "title", "intro", "sellingPoints", "appearance", "location", "care", "winter", "searchTerms", "itemSpecifics", "evidence"],
} as const;

const EBAY_FEATURES = new Set([
  "Biologisch",
  "Blühend",
  "Eingetopft",
  "Einjährig",
  "Eßbar",
  "Hirschresistent",
  "Hitzebeständig",
  "Immergrün",
  "Kleinwüchsig",
  "Laubabwerfend",
  "Luftreinigung",
  "Mehrjährig",
  "Schnellwüchsig",
  "Trockenresistent",
  "Variegated",
  "Winterhart",
  "Zweijährig",
]);
const EBAY_SUNLIGHT = new Set([
  "Mittlere Sonne",
  "Schwache Sonne",
  "Volle Sonne",
  "Vollschatten",
]);
const EBAY_PRODUCT_TYPES = new Set([
  "Bambus",
  "Bäume",
  "Bonsai",
  "Farne",
  "Gemüse",
  "Kakteen & Sukkulenten",
  "Karnivoren",
  "Kletterpflanzen",
  "Kräuter",
  "Obst",
  "Orchideen",
  "Rosen",
  "Sträucher & Hecken",
  "Wasserpflanzen",
  "Ziergräser",
  "Zimmerpflanzen",
]);

export const EBAY_COPY_POLICY_VERSION = "ebay-copy-v6-natural-mobile";

function normalizedText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function sourceDescriptionText(value: string) {
  return customerSafePlantText(
    value
      .replace(/<\s*br\s*\/?>/giu, "\n")
      .replace(/<\/(?:p|li|h[1-6]|div)>/giu, "\n")
      .replace(/<[^>]+>/gu, " ")
      .replace(/&nbsp;/giu, " ")
      .replace(/&amp;/giu, "&")
      .replace(/&lt;/giu, "<")
      .replace(/&gt;/giu, ">")
      .replace(/&quot;/giu, '"')
      .replace(/&#0?39;/giu, "'")
  )
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, 6_000);
}

function resolvedCommonName(
  copy: EbayGeneratedCopy,
  research: ProductResearch
) {
  const latin = normalizedText(research.confirmedLatinName).toLocaleLowerCase(
    "de-DE"
  );
  const latinParts = latin.split(/\s+/).slice(0, 2);
  const genus = latinParts[0] || "";
  const isBotanicalName = (value: string) => {
    const normalized = normalizedText(value).toLocaleLowerCase("de-DE");
    return (
      normalized === latin ||
      (latinParts.length > 1 &&
        latinParts.every((part) => normalized.includes(part))) ||
      Boolean(genus && normalized.startsWith(`${genus} `))
    );
  };
  const isProductPhrase = (value: string) =>
    /\b(?:zimmerpflanze|kübelpflanze|topf|c\d+|\d+\s*(?:cm|m))\b/i.test(
      value
    );
  return (
    [
      preferredGermanCommonName(
        research.confirmedLatinName,
        research.confirmedGermanName
      ),
      copy.itemSpecifics.commonName,
      ...copy.searchTerms,
    ]
      .map(normalizedText)
      .find(
        (value) =>
          value.length >= 2 &&
          !isBotanicalName(value) &&
          !isProductPhrase(value)
      ) || normalizedText(copy.itemSpecifics.commonName)
  );
}

function assertLength(value: string, label: string, minimum: number, maximum: number) {
  const length = normalizedText(value).length;
  if (length < minimum || length > maximum) {
    throw new Error(`Der automatisch erzeugte eBay-${label} ist nicht im erlaubten Bereich (${minimum}–${maximum} Zeichen).`);
  }
}

function fitSection(value: string, maximum: number) {
  const clean = normalizedText(value);
  if (clean.length <= maximum) return clean;
  const sentences = clean.match(/[^.!?]+(?:[.!?]+|$)/gu) ?? [];
  let result = "";
  for (const sentence of sentences) {
    const next = normalizedText(`${result} ${sentence}`);
    if (next.length > maximum) break;
    result = next;
  }
  if (result.length >= Math.min(60, Math.floor(maximum * 0.4))) return result;
  const slice = clean.slice(0, maximum - 1);
  const lastSpace = slice.lastIndexOf(" ");
  const boundary = lastSpace >= Math.floor(maximum * 0.7) ? lastSpace : slice.length;
  return `${slice.slice(0, boundary).replace(/[,:;\s-]+$/u, "")}.`;
}

function rootDomain(domain: string) {
  const parts = domain.toLowerCase().replace(/^www\./, "").split(".");
  const lastTwo = parts.slice(-2).join(".");
  const commonSecondLevel = new Set(["co.uk", "org.uk", "com.au", "co.nz"]);
  return commonSecondLevel.has(lastTwo) && parts.length >= 3
    ? parts.slice(-3).join(".")
    : lastTwo;
}

function evidenceWarning(
  ids: string[],
  sources: ResearchSource[],
  label: string,
  minimum: number
) {
  const sourceMap = new Map(sources.map((source) => [source.id, source]));
  const unknown = [...new Set(ids)].filter((id) => !sourceMap.has(id));
  if (unknown.length) {
    return `Der eBay-${label} verweist auf unbekannte Quellen: ${unknown.join(", ")}.`;
  }
  const domains = new Set(
    ids
      .map((id) => sourceMap.get(id))
      .filter((source): source is ResearchSource => Boolean(source))
      .map((source) => rootDomain(source.domain))
  );
  if (domains.size < minimum) {
    return `Der eBay-${label} ist nur durch ${domains.size} von ${minimum} unabhängigen Quellen belegt.`;
  }
  return undefined;
}

function titleContainsOfferFacts(
  title: string,
  candidate: ProductCandidate,
  research: ProductResearch
) {
  const normalized = title.toLocaleLowerCase("de-DE");
  const germanName = research.confirmedGermanName.toLocaleLowerCase("de-DE");
  const latinGenus = research.confirmedLatinName
    .split(/\s+/)[0]
    ?.toLocaleLowerCase("de-DE");
  const heightValues = [candidate.heightMinCm, candidate.heightMaxCm, candidate.heightCm]
    .filter((value): value is number => Number.isFinite(value));
  const potTokens = (candidate.potSize?.match(/[a-z]?\d+(?:[.,]\d+)?/gi) ?? [])
    .map((value) => value.toLocaleLowerCase("de-DE"));
  return (
    (normalized.includes(germanName) ||
      Boolean(latinGenus && normalized.includes(latinGenus))) &&
    (!heightValues.length ||
      heightValues.some((value) => normalized.includes(String(Math.round(value))))) &&
    (!potTokens.length || potTokens.some((value) => normalized.includes(value)))
  );
}

function reliableTitle(
  proposed: string,
  candidate: ProductCandidate,
  research: ProductResearch
) {
  const clean = normalizedText(proposed)
    .replace(/[©®™]/g, "")
    .replace(/\s{2,}/g, " ");
  if (clean.length <= 80 && titleContainsOfferFacts(clean, candidate, research)) {
    return clean;
  }
  const german = normalizedText(research.confirmedGermanName);
  const latin = normalizedText(research.confirmedLatinName);
  const height = candidate.heightLabel || `${Math.round(candidate.heightCm || 0)} cm`;
  const pot = candidate.potSize || "";
  const candidates = [
    [german, latin, height, pot],
    [latin, german, height, pot],
    [german, latin, height],
    [german, height, pot],
    [latin, height, pot],
  ]
    .map((parts) => parts.filter(Boolean).join(" - "))
    .filter((value) => value.length <= 80);
  if (candidates[0]) return candidates[0];
  const suffix = [height, pot].filter(Boolean).join(" - ");
  const available = Math.max(10, 80 - suffix.length - 3);
  return `${german.slice(0, available).trim()} - ${suffix}`.slice(0, 80);
}

function validateGeneratedCopy(
  copy: EbayGeneratedCopy,
  sources: ResearchSource[],
  candidate: ProductCandidate,
  research: ProductResearch
) {
  if (copy.version !== "ebay-v2") throw new Error("Die eBay-Textversion ist ungültig.");
  copy.title = reliableTitle(copy.title, candidate, research);
  copy.intro = customerSafePlantText(copy.intro);
  copy.appearance = customerSafePlantText(copy.appearance);
  copy.location = customerSafePlantText(copy.location);
  copy.care = customerSafePlantText(copy.care);
  copy.winter = customerSafePlantText(copy.winter);
  copy.sellingPoints = copy.sellingPoints
    .map(customerSafePlantText)
    .filter(Boolean);
  if (new Set(copy.sellingPoints).size !== copy.sellingPoints.length) {
    throw new Error("Der eBay-Text enthält doppelte Verkaufspunkte.");
  }
  copy.searchTerms = [...new Set(copy.searchTerms.map(normalizedText))];
  copy.itemSpecifics.commonName = normalizedText(
    copy.itemSpecifics.commonName
  );
  copy.itemSpecifics.features = [
    ...new Set(copy.itemSpecifics.features.map(normalizedText)),
  ];
  copy.itemSpecifics.sunlight = [
    ...new Set(copy.itemSpecifics.sunlight.map(normalizedText)),
  ] as EbayGeneratedCopy["itemSpecifics"]["sunlight"];
  copy.itemSpecifics.commonName = resolvedCommonName(copy, research);

  copy.intro = fitSection(copy.intro, 280);
  copy.appearance = fitSection(copy.appearance, 420);
  copy.location = fitSection(copy.location, 320);
  copy.care = fitSection(copy.care, 450);
  copy.winter = fitSection(copy.winter, 500);
  copy.sellingPoints = copy.sellingPoints.map((point) =>
    fitSection(point, 120)
  );

  assertLength(copy.title, "Titel", 20, 80);
  assertLength(copy.intro, "Einleitung", 60, 360);
  assertLength(copy.appearance, "Abschnitt Erscheinungsbild", 60, 650);
  assertLength(copy.location, "Abschnitt Standort", 50, 500);
  assertLength(copy.care, "Abschnitt Pflege", 80, 700);
  assertLength(copy.winter, "Abschnitt Überwinterung", 80, 750);
  if (copy.sellingPoints.length < 3 || copy.sellingPoints.length > 5) {
    throw new Error("Der eBay-Text benötigt drei bis fünf Verkaufspunkte.");
  }
  for (const point of copy.sellingPoints) assertLength(point, "Verkaufspunkt", 15, 180);
  if (copy.searchTerms.length < 4 || copy.searchTerms.length > 12) {
    throw new Error("Der eBay-Text benötigt vier bis zwölf Suchbegriffe.");
  }
  assertLength(copy.itemSpecifics.commonName, "Allgemeiner Name", 2, 100);
  if (
    copy.itemSpecifics.features.length < 1 ||
    copy.itemSpecifics.features.length > 6 ||
    copy.itemSpecifics.features.some((value) => !EBAY_FEATURES.has(value))
  ) {
    throw new Error("Die KI hat keine gültigen eBay-Besonderheiten gewählt.");
  }
  if (
    copy.itemSpecifics.sunlight.length < 1 ||
    copy.itemSpecifics.sunlight.length > 3 ||
    copy.itemSpecifics.sunlight.some((value) => !EBAY_SUNLIGHT.has(value))
  ) {
    throw new Error("Die KI hat keinen gültigen eBay-Sonnenlichtwert gewählt.");
  }
  if (!EBAY_PRODUCT_TYPES.has(copy.itemSpecifics.productType)) {
    throw new Error("Die KI hat keine gültige eBay-Produktart gewählt.");
  }
  if (copy.evidence.sellingPoints.length !== copy.sellingPoints.length) {
    throw new Error("Die Quellenzuordnung der eBay-Verkaufspunkte ist unvollständig.");
  }
  const qualityWarnings = [
    evidenceWarning(copy.evidence.intro, sources, "Einleitung", 2),
    ...copy.evidence.sellingPoints.map((ids, index) =>
      evidenceWarning(ids, sources, `Verkaufspunkt ${index + 1}`, 2)
    ),
    evidenceWarning(copy.evidence.appearance, sources, "Erscheinungsbild", 2),
    evidenceWarning(copy.evidence.location, sources, "Standorttext", 2),
    evidenceWarning(copy.evidence.care, sources, "Pflegetext", 2),
    evidenceWarning(copy.evidence.winter, sources, "Wintertext", 3),
  ].filter((warning): warning is string => Boolean(warning));
  copy.qualityWarnings = [...new Set(qualityWarnings)];

  const visibleText = [copy.title, copy.intro, ...copy.sellingPoints, copy.appearance, copy.location, copy.care, copy.winter].join(" ");
  if (containsInternalQualityLanguage(visibleText)) {
    throw new Error(
      "Der automatisch erzeugte eBay-Kundentext enthält interne Prüf- oder Verifikationshinweise."
    );
  }
  if (/https?:\/\/|www\.|\b[a-z0-9-]+\.(?:de|com|org|net)\b|\S+@\S+/i.test(visibleText)) {
    throw new Error("Der automatisch erzeugte eBay-Text enthält eine externe Adresse oder Kontaktdaten.");
  }
  return copy;
}

function researchForPrompt(research: ProductResearch) {
  return {
    confirmedLatinName: research.confirmedLatinName,
    confirmedGermanName: research.confirmedGermanName,
    winterHardy: research.winterHardy,
    minTemperatureC: research.minTemperatureC,
    blocks: research.blocks
      .map((block) => ({
        ...block,
        text: customerSafePlantText(block.text),
      }))
      .filter((block) => block.text),
    care: {
      light: {
        ...research.care.light,
        text: customerSafePlantText(research.care.light.text),
      },
      water: {
        ...research.care.water,
        text: customerSafePlantText(research.care.water.text),
      },
      fertilizer: {
        ...research.care.fertilizer,
        text: customerSafePlantText(research.care.fertilizer.text),
      },
      winter: {
        ...research.care.winter,
        text: customerSafePlantText(research.care.winter.text),
      },
    },
  };
}

export async function generateEbayCopy(
  candidate: ProductCandidate,
  research: ProductResearch,
  sources: ResearchSource[],
  sourceContent?: {
    channel: "shopware" | "ebay" | "kleinanzeigen";
    title: string;
    description: string;
  }
): Promise<EbayGeneratedCopy> {
  const { model: researchModel } = getResearchConfiguration();
  const model =
    process.env.OPENAI_EBAY_COPY_MODEL?.trim() || researchModel;
  const sourceSummary = sources.map(({ id, publisher, domain }) => ({ id, publisher, domain }));
  const groupGuidance = speciesGroupPrompt(candidate);
  const existingContent = sourceContent
    ? `\nVORHANDENER, BEREITS RECHERCHIERTER AUSGANGSTEXT AUS ${sourceContent.channel.toUpperCase()}:\nTitel: ${sourceContent.title}\nBeschreibung: ${sourceDescriptionText(sourceContent.description)}\n\nPasse diesen Inhalt nur an eBay-Sprache, eBay-Struktur und die unten vorgegebenen Zeichenbereiche an. Übernimm die Aussagen sinngemäß; recherchiere nichts neu und ergänze keine neuen Pflanzenfakten.\n`
    : "";
  const response = await openAIResponse({
    model,
    store: false,
    prompt_cache_key: "palmenheld-ebay-copy-v6",
    reasoning: { effort: "low" },
    input: [
      {
        role: "developer",
        content: "Du schreibst wie ein erfahrener deutscher Pflanzenhändler, der sein Sortiment selbst kennt und bei eBay verkauft. Der Text soll menschlich, konkret, unaufgeregt und mobil leicht lesbar sein. Schreibe kurze bis mittellange, natürlich variierte Sätze und nenne zuerst die kaufentscheidenden Angaben. Keine typische KI-Sprache und keine austauschbaren Werbefloskeln wie „Entdecken Sie“, „tauchen Sie ein“, „ein echter Blickfang“, „die perfekte Wahl“, „besticht durch“, „verleiht jedem Raum“, „ideal für alle“, „nicht nur … sondern auch“ oder „ob … oder“. Keine Einleitung mit einer rhetorischen Frage, kein Fazit, keine Meta-Kommentare und keine Wiederholung derselben Aussage in mehreren Abschnitten. Verwende Suchbegriffe nur dort, wo sie natürlich passen. Schreibe einen eigenständigen Verkaufstext ausschließlich aus den gelieferten Fakten und erfinde nichts. Keine Superlative, Garantien, Heilversprechen, künstliche Verknappung, Preis- oder Versandversprechen. Keine Quellen, Quellen-IDs, URLs, Domains, E-Mail-Adressen, Telefonnummern, Emojis, fremde Marken oder Kontaktaufforderungen im Kundentext. Unterscheide Freiland und Kübelhaltung. Frostwerte sind Richtwerte, niemals Zusagen. Interne Unsicherheiten, Recherchegrenzen, fehlende Nachweise, Sortenechtheits- oder Verifikationshinweise gehören ausschließlich in die interne Qualitätsprüfung und niemals in Titel, Einleitung, Verkaufspunkte oder Beschreibung. Eine Sortenbezeichnung aus den verbindlichen Weclapp-Artikeldaten wird als Angebotsmerkmal übernommen und im Kundentext nicht angezweifelt.",
      },
      {
        role: "user",
        content: `Erzeuge die strukturierte Fassung ebay-v2 für dieses konkrete Angebot.

VERBINDLICHE ARTIKELDATEN AUS WECLAPP:
- deutscher Ausgangsname: ${candidate.germanName}
- lateinischer Ausgangsname: ${candidate.latinName}
- bestätigter deutscher Name: ${research.confirmedGermanName}
- bestätigter lateinischer Name: ${research.confirmedLatinName}
- Verkaufsgröße: ${candidate.heightLabel || "nicht angegeben"}
- Topfgröße: ${candidate.potSize || "nicht angegeben"}
- Artikelnummer: ${candidate.articleNumber}
${groupGuidance}
${existingContent}

REGELN:
- Titel: 65–80 Zeichen anstreben, maximal 80. Wichtigste zutreffende Suchbegriffe zuerst. Deutschen und botanischen Pflanzennamen, Verkaufsgröße und falls vorhanden Topfgröße verwenden. Keine Artikelnummer, Füllwörter, Doppelungen oder Symbole wie ©, ®, ™.
- intro: In 100–240 Zeichen sofort eindeutig sagen, welche Pflanze in welcher Verkaufsgröße und Topfgröße angeboten wird. Ohne Begrüßung, Werbespruch oder leere Einleitung.
- sellingPoints: drei bis fünf kurze, konkrete Eigenschaften mit jeweils ungefähr 25–100 Zeichen. Keine ganzen Absätze und keine Wiederholung aus der Einleitung.
- appearance: In ungefähr 140–360 Zeichen Aussehen und Wuchs anschaulich, aber sachlich beschreiben.
- location: In ungefähr 100–260 Zeichen den passenden Standort klar erklären.
- care: In ungefähr 160–400 Zeichen Wasser und Düngung praktisch erklären. Konkrete Handgriffe sind wichtiger als botanische Allgemeinplätze.
- winter: In ungefähr 160–450 Zeichen die Winterhärte mit dem praxisnah belegten zentralen Temperatur-Richtwert ${research.minTemperatureC} °C nennen. Die belegte Spanne, Freiland/Kübel und den Richtwertcharakter verständlich erklären. Den Wert nicht durch eine pauschal wärmere, übervorsichtige Angabe abschwächen.
- Insgesamt ungefähr 220–380 Wörter. Kaufentscheidende Artikeldaten innerhalb der ersten etwa 500 Zeichen. Absätze nicht künstlich aufblähen, nur um eine Länge zu erreichen.
- Sprachstil: natürliches, heutiges Deutsch eines fachkundigen Händlers. Konkret statt werblich, verständlich statt akademisch. Keine Floskelketten, kein Keyword-Stuffing, keine künstliche Begeisterung und keine gleichförmigen Satzanfänge.
- searchTerms: vier bis zwölf passende Begriffe nur zur internen Qualitätsprüfung.
- itemSpecifics.commonName: exakt den bestätigten, in Deutschland gebräuchlichsten Trivial- und Verkaufsnamen angeben. Seltenere fachsprachliche Synonyme nicht bevorzugen und niemals den botanischen/lateinischen Namen wiederholen. Beispiele: Strelitzia reginae → Paradiesvogelblume; Olea europaea → Olivenbaum, nicht Echter Ölbaum.
- itemSpecifics.features: eine bis sechs belegte Besonderheiten ausschließlich aus dieser eBay-Liste wählen: Biologisch, Blühend, Eingetopft, Einjährig, Eßbar, Hirschresistent, Hitzebeständig, Immergrün, Kleinwüchsig, Laubabwerfend, Luftreinigung, Mehrjährig, Schnellwüchsig, Trockenresistent, Variegated, Winterhart, Zweijährig. Nur tatsächlich durch die Forschung gestützte Werte wählen; bei einer blühenden Strelitzie insbesondere Blühend.
- itemSpecifics.waterRequirement: den belegten Wasserbedarf exakt als Hoch, Mittel oder Niedrig einordnen.
- itemSpecifics.sunlight: ein bis drei passende Werte ausschließlich aus Mittlere Sonne, Schwache Sonne, Volle Sonne, Vollschatten wählen.
- itemSpecifics.productType: exakt eine passende Produktart aus Bambus, Bäume, Bonsai, Farne, Gemüse, Kakteen & Sukkulenten, Karnivoren, Kletterpflanzen, Kräuter, Obst, Orchideen, Rosen, Sträucher & Hecken, Wasserpflanzen, Ziergräser, Zimmerpflanzen wählen.
- evidence: Ordne Einleitung, jeden Verkaufspunkt und jeden Textabschnitt den verwendeten Quellen-IDs zu. Jede Zuordnung braucht mindestens zwei unabhängige Organisationen; winter mindestens drei. Die IDs werden nicht veröffentlicht.
- Keine neuen Fakten. Konkrete Liefermerkmale nur aus Weclapp.
- Interne Recherchelücken, Zweifel an der Sortenechtheit, fehlende Einzelpflanzen-, Herkunfts-, Chargen- oder Genetiknachweise sowie Formulierungen wie „nicht verifizierbar“ niemals im Kundentext erwähnen. Solche Hinweise bleiben ausschließlich intern. Die Sortenbezeichnung aus Weclapp ist für dieses Angebot verbindlich.
- Bei einer spp.-Artengruppe einen allgemeinen Verkaufstext zur Gattung schreiben und die belegten verbreitetsten Arten nur als typische Vertreter nennen. Keine davon als Identität des konkreten Artikels ausgeben und keine nur für eine Art geltende Eigenschaft verallgemeinern.

GEPRÜFTE FORSCHUNG:
${JSON.stringify(researchForPrompt(research))}

INTERN DOKUMENTIERTE QUELLEN, NICHT IM KUNDENTEXT NENNEN:
${JSON.stringify(sourceSummary)}`,
      },
    ],
    text: {
      verbosity: "low",
      format: {
        type: "json_schema",
        name: "palmenheld_ebay_copy",
        strict: true,
        schema: EBAY_COPY_SCHEMA,
      },
    },
  });
  return validateGeneratedCopy(
    JSON.parse(extractOutputText(response)) as EbayGeneratedCopy,
    sources,
    candidate,
    research
  );
}

export function generatedEbayAspects(
  copy: EbayGeneratedCopy,
  research: ProductResearch
) {
  const genus = normalizedText(research.confirmedLatinName).split(/\s+/)[0];
  return {
    Marke: ["Palmenheld"],
    "Allgemeiner Name": [copy.itemSpecifics.commonName],
    "Anzahl pro Packung": ["1"],
    Besonderheiten: copy.itemSpecifics.features,
    Gattung: genus ? [genus] : [],
    "Innen-/Außenbereich": ["Innen- & Außenbereich"],
    Wasserbedarf: [copy.itemSpecifics.waterRequirement],
    Sonnenlicht: copy.itemSpecifics.sunlight,
    Produktart: [copy.itemSpecifics.productType],
  };
}
