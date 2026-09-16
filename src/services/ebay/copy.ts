import type { ProductCandidate, ProductResearch, ResearchSource } from "@/types/shopwarePublishing";
import type { EbayGeneratedCopy } from "@/types/ebay";
import { extractOutputText, openAIResponse } from "@/services/shopware/research";
import { getResearchConfiguration } from "@/services/shopware/publishingCandidates";

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
  required: ["version", "title", "intro", "sellingPoints", "appearance", "location", "care", "winter", "searchTerms", "evidence"],
} as const;

function normalizedText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function assertLength(value: string, label: string, minimum: number, maximum: number) {
  const length = normalizedText(value).length;
  if (length < minimum || length > maximum) {
    throw new Error(`Der automatisch erzeugte eBay-${label} ist nicht im erlaubten Bereich (${minimum}–${maximum} Zeichen).`);
  }
}

function rootDomain(domain: string) {
  const parts = domain.toLowerCase().replace(/^www\./, "").split(".");
  const lastTwo = parts.slice(-2).join(".");
  const commonSecondLevel = new Set(["co.uk", "org.uk", "com.au", "co.nz"]);
  return commonSecondLevel.has(lastTwo) && parts.length >= 3
    ? parts.slice(-3).join(".")
    : lastTwo;
}

function assertEvidence(
  ids: string[],
  sources: ResearchSource[],
  label: string,
  minimum: number
) {
  const sourceMap = new Map(sources.map((source) => [source.id, source]));
  const unknown = [...new Set(ids)].filter((id) => !sourceMap.has(id));
  if (unknown.length) {
    throw new Error(
      `Der eBay-${label} verweist auf unbekannte Quellen: ${unknown.join(", ")}.`
    );
  }
  const domains = new Set(
    ids
      .map((id) => sourceMap.get(id))
      .filter((source): source is ResearchSource => Boolean(source))
      .map((source) => rootDomain(source.domain))
  );
  if (domains.size < minimum) {
    throw new Error(
      `Der eBay-${label} ist nur durch ${domains.size} von ${minimum} unabhängigen Quellen belegt.`
    );
  }
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
  copy.intro = normalizedText(copy.intro);
  copy.appearance = normalizedText(copy.appearance);
  copy.location = normalizedText(copy.location);
  copy.care = normalizedText(copy.care);
  copy.winter = normalizedText(copy.winter);
  copy.sellingPoints = copy.sellingPoints.map(normalizedText);
  if (new Set(copy.sellingPoints).size !== copy.sellingPoints.length) {
    throw new Error("Der eBay-Text enthält doppelte Verkaufspunkte.");
  }
  copy.searchTerms = [...new Set(copy.searchTerms.map(normalizedText))];

  assertLength(copy.title, "Titel", 20, 80);
  assertLength(copy.intro, "Einleitung", 80, 360);
  assertLength(copy.appearance, "Abschnitt Erscheinungsbild", 80, 650);
  assertLength(copy.location, "Abschnitt Standort", 60, 500);
  assertLength(copy.care, "Abschnitt Pflege", 100, 700);
  assertLength(copy.winter, "Abschnitt Überwinterung", 100, 750);
  if (copy.sellingPoints.length < 3 || copy.sellingPoints.length > 5) {
    throw new Error("Der eBay-Text benötigt drei bis fünf Verkaufspunkte.");
  }
  for (const point of copy.sellingPoints) assertLength(point, "Verkaufspunkt", 15, 180);
  if (copy.searchTerms.length < 4 || copy.searchTerms.length > 12) {
    throw new Error("Der eBay-Text benötigt vier bis zwölf Suchbegriffe.");
  }
  if (copy.evidence.sellingPoints.length !== copy.sellingPoints.length) {
    throw new Error("Die Quellenzuordnung der eBay-Verkaufspunkte ist unvollständig.");
  }
  assertEvidence(copy.evidence.intro, sources, "Einleitung", 2);
  copy.evidence.sellingPoints.forEach((ids, index) =>
    assertEvidence(ids, sources, `Verkaufspunkt ${index + 1}`, 2)
  );
  assertEvidence(copy.evidence.appearance, sources, "Erscheinungsbild", 2);
  assertEvidence(copy.evidence.location, sources, "Standorttext", 2);
  assertEvidence(copy.evidence.care, sources, "Pflegetext", 2);
  assertEvidence(copy.evidence.winter, sources, "Wintertext", 3);

  const visibleText = [copy.title, copy.intro, ...copy.sellingPoints, copy.appearance, copy.location, copy.care, copy.winter].join(" ");
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
    blocks: research.blocks,
    care: research.care,
  };
}

export async function generateEbayCopy(
  candidate: ProductCandidate,
  research: ProductResearch,
  sources: ResearchSource[]
): Promise<EbayGeneratedCopy> {
  const { model: researchModel } = getResearchConfiguration();
  const model =
    process.env.OPENAI_EBAY_COPY_MODEL?.trim() || researchModel;
  const sourceSummary = sources.map(({ id, publisher, domain }) => ({ id, publisher, domain }));
  const response = await openAIResponse({
    model,
    store: false,
    reasoning: { effort: "low" },
    input: [
      {
        role: "developer",
        content: "Du bist ein präziser deutscher eBay-Redakteur für lebende Pflanzen. Schreibe einen eigenständigen, mobil gut scanbaren Verkaufstext ausschließlich aus den gelieferten Fakten. Erfinde nichts. Keine Superlative, Garantien, Heilversprechen, künstliche Verknappung, Preis- oder Versandversprechen. Keine Quellen, Quellen-IDs, URLs, Domains, E-Mail-Adressen, Telefonnummern, Emojis, fremde Marken oder Kontaktaufforderungen im Kundentext. Vermeide Keyword-Wiederholungen. Unterscheide Freiland und Kübelhaltung. Frostwerte sind Richtwerte, niemals Zusagen.",
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

REGELN:
- Titel: 65–80 Zeichen anstreben, maximal 80. Wichtigste zutreffende Suchbegriffe zuerst. Deutschen und botanischen Pflanzennamen, Verkaufsgröße und falls vorhanden Topfgröße verwenden. Keine Artikelnummer, Füllwörter, Doppelungen oder Symbole wie ©, ®, ™.
- intro: Sofort eindeutig sagen, welche Pflanze in welcher Verkaufsgröße und Topfgröße angeboten wird.
- sellingPoints: drei bis fünf kurze, konkrete, belegte Eigenschaften.
- appearance: Aussehen und Wuchs sachlich beschreiben.
- location: passenden Standort klar erklären.
- care: Wasser und Düngung praktisch erklären.
- winter: Winterhärte, konservative Minimaltemperatur ${research.minTemperatureC} °C, Freiland/Kübel und Richtwertcharakter nennen.
- Insgesamt ungefähr 250–450 Wörter. Kaufentscheidende Artikeldaten innerhalb der ersten etwa 800 Zeichen.
- searchTerms: vier bis zwölf passende Begriffe nur zur internen Qualitätsprüfung.
- evidence: Ordne Einleitung, jeden Verkaufspunkt und jeden Textabschnitt den verwendeten Quellen-IDs zu. Jede Zuordnung braucht mindestens zwei unabhängige Organisationen; winter mindestens drei. Die IDs werden nicht veröffentlicht.
- Keine neuen Fakten. Konkrete Liefermerkmale nur aus Weclapp.

GEPRÜFTE FORSCHUNG:
${JSON.stringify(researchForPrompt(research))}

INTERN DOKUMENTIERTE QUELLEN, NICHT IM KUNDENTEXT NENNEN:
${JSON.stringify(sourceSummary)}`,
      },
    ],
    text: {
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
