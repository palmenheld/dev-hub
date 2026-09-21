import {
  ProductCandidate,
  ProductResearch,
  ResearchSource,
} from "@/types/shopwarePublishing";
import { getResearchConfiguration } from "./publishingCandidates";
import { preferredGermanCommonName } from "./plantNames";
import {
  readCachedResearch,
  researchCacheKey,
  saveCachedResearch,
} from "./researchCache";
import {
  isSpeciesGroupCandidate,
  speciesGroupLatinName,
  speciesGroupPrompt,
} from "@/services/plantSpeciesGroup";

type OpenAIResponse = {
  status?: string;
  error?: { message?: string } | null;
  output?: unknown[];
};

const RESEARCH_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    researchComplete: { type: "boolean" },
    gaps: { type: "array", items: { type: "string" } },
    confirmedLatinName: { type: "string" },
    confirmedGermanName: { type: "string" },
    metaTitle: { type: "string" },
    metaDescription: { type: "string" },
    keywords: { type: "array", items: { type: "string" } },
    winterHardy: { type: "boolean" },
    minTemperatureC: { type: "number" },
    blocks: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          key: {
            type: "string",
            enum: [
              "identity",
              "appearance",
              "light",
              "water",
              "fertilizer",
              "winter_hardiness",
              "minimum_temperature",
              "growth",
            ],
          },
          heading: { type: "string" },
          text: { type: "string" },
          sourceIds: { type: "array", items: { type: "string" } },
        },
        required: ["key", "heading", "text", "sourceIds"],
      },
    },
    care: {
      type: "object",
      additionalProperties: false,
      properties: {
        light: {
          type: "object",
          additionalProperties: false,
          properties: {
            text: { type: "string" },
            sourceIds: { type: "array", items: { type: "string" } },
          },
          required: ["text", "sourceIds"],
        },
        water: {
          type: "object",
          additionalProperties: false,
          properties: {
            text: { type: "string" },
            sourceIds: { type: "array", items: { type: "string" } },
          },
          required: ["text", "sourceIds"],
        },
        fertilizer: {
          type: "object",
          additionalProperties: false,
          properties: {
            text: { type: "string" },
            sourceIds: { type: "array", items: { type: "string" } },
          },
          required: ["text", "sourceIds"],
        },
        winter: {
          type: "object",
          additionalProperties: false,
          properties: {
            text: { type: "string" },
            sourceIds: { type: "array", items: { type: "string" } },
          },
          required: ["text", "sourceIds"],
        },
      },
      required: ["light", "water", "fertilizer", "winter"],
    },
  },
  required: [
    "researchComplete",
    "gaps",
    "confirmedLatinName",
    "confirmedGermanName",
    "metaTitle",
    "metaDescription",
    "keywords",
    "winterHardy",
    "minTemperatureC",
    "blocks",
    "care",
  ],
};

export function extractOutputText(response: OpenAIResponse) {
  const texts: string[] = [];
  for (const rawItem of response.output ?? []) {
    if (typeof rawItem !== "object" || rawItem === null) continue;
    const content = (rawItem as { content?: unknown }).content;
    if (!Array.isArray(content)) continue;
    for (const rawContent of content) {
      if (typeof rawContent !== "object" || rawContent === null) continue;
      const item = rawContent as {
        type?: string;
        text?: unknown;
        refusal?: unknown;
      };
      if (item.type === "refusal") {
        throw new Error(
          typeof item.refusal === "string"
            ? item.refusal
            : "Die Recherche wurde vom Modell abgelehnt."
        );
      }
      if (item.type === "output_text" && typeof item.text === "string") {
        texts.push(item.text);
      }
    }
  }
  const text = texts.join("\n").trim();
  if (!text) throw new Error("Die Recherche hat keinen Text zurückgegeben.");
  return text;
}

function normalizeUrl(value: string) {
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Unzulässige Quellenadresse.");
  }
  url.hash = "";
  return url.toString();
}

function sourceDomain(value: string) {
  return new URL(value).hostname.toLowerCase().replace(/^www\./, "");
}

const BLOCKED_SOURCE_DOMAINS = [
  "chatgpt.com",
  "openai.com",
  "claude.ai",
  "perplexity.ai",
  "gemini.google.com",
  "copilot.microsoft.com",
  "writesonic.com",
  "jasper.ai",
  "copy.ai",
  "articleforge.com",
  "reddit.com",
  "quora.com",
  "medium.com",
  "wikipedia.org",
  "pinterest.com",
  "facebook.com",
  "instagram.com",
  "tiktok.com",
  "harmanapps.com",
];

const AI_SOURCE_MARKERS =
  /\b(?:ai[- ]generated|generated by ai|ki[- ]generiert|chatgpt|claude|gemini|perplexity|writesonic|jasper ai|copy\.ai)\b/iu;

export function isAllowedResearchSource(source: {
  domain: string;
  title: string;
  url: string;
}) {
  const domain = source.domain.toLowerCase().replace(/^www\./, "");
  if (
    BLOCKED_SOURCE_DOMAINS.some(
      (blocked) => domain === blocked || domain.endsWith(`.${blocked}`)
    )
  ) {
    return false;
  }
  return !AI_SOURCE_MARKERS.test(`${source.title} ${source.url}`);
}

export function collectResearchSources(
  response: OpenAIResponse,
  dossierText = ""
): ResearchSource[] {
  const found = new Map<string, { title: string; publisher: string }>();

  function add(urlValue: unknown, titleValue: unknown) {
    if (typeof urlValue !== "string") return;
    try {
      const url = normalizeUrl(urlValue);
      const domain = sourceDomain(url);
      const title =
        typeof titleValue === "string" && titleValue.trim()
          ? titleValue.trim()
          : domain;
      if (!isAllowedResearchSource({ domain, title, url })) return;
      if (!found.has(url)) found.set(url, { title, publisher: domain });
    } catch {}
  }

  function visit(value: unknown, key = "", depth = 0) {
    if (depth > 8 || value === null || value === undefined) return;
    if (Array.isArray(value)) {
      for (const item of value) visit(item, key, depth + 1);
      return;
    }
    if (typeof value !== "object") return;
    const record = value as Record<string, unknown>;
    if (
      (key === "sources" || record.type === "url_citation") &&
      typeof record.url === "string"
    ) {
      add(record.url, record.title);
    }
    for (const [childKey, child] of Object.entries(record)) {
      if (
        childKey === "sources" ||
        childKey === "annotations" ||
        childKey === "action" ||
        childKey === "content" ||
        childKey === "output"
      ) {
        visit(child, childKey, depth + 1);
      }
    }
  }

  for (const match of dossierText.matchAll(/https?:\/\/[^\s<>"']+/gi)) {
    const url = match[0].replace(/[\])},.;:!?]+$/g, "");
    add(url, "");
  }
  visit(response.output, "output");

  return [...found.entries()].slice(0, 30).map(([url, details], index) => ({
    id: `S${index + 1}`,
    title: details.title,
    url,
    publisher: details.publisher,
    domain: sourceDomain(url),
  }));
}

export async function openAIResponse(body: Record<string, unknown>) {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) {
    throw new Error(
      "Für die Quellenrecherche fehlt OPENAI_API_KEY in der Server-Konfiguration."
    );
  }

  const configuredTimeout = Number(process.env.OPENAI_REQUEST_TIMEOUT_MS);
  const timeoutMs =
    Number.isFinite(configuredTimeout) && configuredTimeout >= 30_000
      ? Math.min(configuredTimeout, 600_000)
      : 300_000;
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(timeoutMs),
  });

  const payload = (await response.json()) as OpenAIResponse;
  if (!response.ok) {
    throw new Error(
      payload.error?.message ||
        `Die Recherche-API antwortet mit Status ${response.status}.`
    );
  }
  if (payload.status && payload.status !== "completed") {
    throw new Error(
      `Die Recherche wurde nicht abgeschlossen (${payload.status}).`
    );
  }
  return payload;
}

function sourceCatalogue(sources: ResearchSource[]) {
  return sources
    .map(
      (source) =>
        `${source.id} | ${source.publisher} | ${source.title} | ${source.url}`
    )
    .join("\n");
}

async function researchProductFresh(
  candidate: ProductCandidate
): Promise<{ research: ProductResearch; sources: ResearchSource[] }> {
  const { model } = getResearchConfiguration();
  const groupGuidance = speciesGroupPrompt(candidate);
  const dossierResponse = await openAIResponse({
    model,
    store: false,
    prompt_cache_key: "palmenheld-plant-dossier-v5",
    reasoning: { effort: "low" },
    tools: [
      {
        type: "web_search",
        search_context_size: "medium",
        filters: {
          blocked_domains: [
            "pinterest.com",
            "facebook.com",
            "instagram.com",
            "amazon.de",
            "ebay.de",
            "reddit.com",
            "quora.com",
            "medium.com",
            "wikipedia.org",
            "chatgpt.com",
            "openai.com",
            "claude.ai",
            "perplexity.ai",
            "writesonic.com",
            "jasper.ai",
            "copy.ai",
          ],
        },
      },
    ],
    tool_choice: "required",
    include: ["web_search_call.action.sources"],
    text: { verbosity: "low" },
    input: [
      {
        role: "developer",
        content:
          "Du recherchierst Pflanzen fachlich, quellenkritisch und kompakt. Priorität haben botanische Gärten, Universitäten, staatliche Beratung, Fachgesellschaften, wissenschaftliche Publikationen und etablierte gärtnerische Institutionen. Händler dürfen nur den deutschen Handelsnamen und praxisnahe Kulturhinweise ergänzen, aber keine Kernaussage oder Frosttemperatur allein tragen. Verwende niemals KI-generierte Artikel, KI-Antwortseiten, anonyme SEO-/Affiliate-Texte, soziale Netzwerke, Foren, Marktplätze oder Wikipedia als Beleg. Eine Quelle braucht eine erkennbare fachlich verantwortliche Institution oder Redaktion. Ermittle den in Deutschland häufigsten Endkunden- und Verkaufsnamen. Trenne ausgepflanzte, etablierte Exemplare von Kübelpflanzen. Dokumentiere bei Frosthärte die belastbare Spanne und leite aus mindestens drei unabhängigen Fachquellen einen praxisnahen zentralen Richtwert ab: nicht automatisch den wärmsten und vorsichtigsten Grenzwert wählen, aber auch keinen isolierten Kälterekord. Bevorzuge Median, Mehrheitskonsens oder Mitte einer gut belegten Überlappung. Halte das Dossier bei ungefähr 700–1.200 Wörtern und 8–18 wirklich relevanten Quellen.",
      },
      {
        role: "user",
        content: `Erstelle ein deutsches Evidenz-Dossier für genau einen manuell ausgewählten Shopartikel.
Ausgangsdaten:
- hinterlegter lateinischer Name: ${candidate.latinName}
- hinterlegter deutscher Name: ${candidate.germanName}
- Verkaufsgröße: ${candidate.heightLabel || candidate.heightCm + " cm"}
- Topfgröße: ${candidate.potSize || "nicht angegeben"}
${groupGuidance}

Prüfe zuerst die botanische Identität. Ermittle danach den in Deutschland üblichsten Trivial- und Verkaufsnamen anhand der tatsächlichen Verwendung bei etablierten deutschen Fachquellen und Pflanzenhändlern. Verwende den häufigsten Endkundenbegriff als Hauptnamen und führe botanisch korrekte, aber weniger gebräuchliche Namen nur als Synonyme. Beispiel: Olea europaea heißt im deutschen Verkauf und allgemeinen Sprachgebrauch primär Olivenbaum; Echter Ölbaum ist nur ein nachrangiges Synonym. Recherchiere danach Erscheinungsbild/Wuchs, Licht, Wasser, Düngung und Winterhärte. Jede Kernaussage braucht mindestens zwei unabhängige Organisationen; Winterhärte, belegte Temperaturspanne und zentraler Temperatur-Richtwert mindestens drei. Für Olea europaea ist eine belastbare Spanne um etwa −12 bis −16 °C zu prüfen; wenn die Fachquellen sie tragen, ist ein zentraler Wert wie −14 °C praxisnäher als pauschal −5 °C. Unterscheide kurzzeitige Lufttemperatur, Dauerkälte, Nässe, Wind, Alter/Akklimatisation und Kübelhaltung. Nenne pro Aussage die vollständigen URLs. Nutze keine KI-generierten oder redaktionell nicht verantworteten Artikel. Wenn die Beleglage nicht reicht, sage das klar und erfinde keinen Ersatz.`,
      },
    ],
  });

  const dossier = extractOutputText(dossierResponse);
  const sources = collectResearchSources(dossierResponse, dossier);
  if (sources.length < 3) {
    throw new Error(
      "Die Recherche lieferte zu wenige nachvollziehbare Quellen. Der Entwurf wurde nicht erstellt."
    );
  }

  const structuredResponse = await openAIResponse({
    model,
    store: false,
    reasoning: { effort: "low" },
    prompt_cache_key: "palmenheld-plant-structure-v5",
    input: [
      {
        role: "developer",
        content:
          "Du bist ein strenger Faktenprüfer und SEO-Redakteur für den deutschen Pflanzenhandel. Nutze ausschließlich Aussagen aus dem Dossier und IDs aus dem bereits qualitätsgefilterten Quellenkatalog. Jede Textpassage trägt ihre Quellen-IDs. Der Hauptname entspricht dem in Deutschland üblichsten Such-, Alltags- und Verkaufsnamen. Interne Unsicherheiten bleiben in gaps und nie im Kundentext. Leite die Minimaltemperatur als praxisnahen zentralen Richtwert aus mindestens drei unabhängigen Fachquellen ab. Wähle nicht pauschal die höchste, wärmste und damit übervorsichtige Temperatur; ignoriere zugleich isolierte Kälterekorde. Nutze Median, Mehrheitskonsens oder die Mitte der belegten Überlappung und erkläre die belastbare Spanne im Winterabschnitt. Markiere researchComplete=false, wenn eine Pflichtaussage nicht ausreichend belegt ist. Schreibe sachlich und ohne Garantien.",
      },
      {
        role: "user",
        content: `Erzeuge aus dem Dossier strukturierte deutsche Produktinhalte.

Anforderungen:
- confirmedGermanName muss der in Deutschland am häufigsten verwendete Trivial- und Verkaufsname sein und darf nicht einfach den botanischen/lateinischen Namen wiederholen.
- Entscheide nach tatsächlichem deutschem Sprach-, Such- und Handelsgebrauch, nicht danach, welcher Name wie eine direkte taxonomische Übersetzung klingt.
- Seltenere oder fachsprachliche Synonyme dürfen im Identitätsabschnitt erwähnt werden, aber nicht confirmedGermanName, Titel oder führender Suchbegriff werden.
- Verbindliches Beispiel: Olea europaea → confirmedGermanName "Olivenbaum"; "Echter Ölbaum" höchstens als nachrangiges Synonym.
- Meta-Titel idealerweise 45–60 Zeichen.
- Meta-Beschreibung idealerweise 140–160 Zeichen.
- 5–8 klare Textblöcke mit insgesamt ungefähr 350–650 Wörtern.
- Pflichtkategorien: identity, appearance, light, water, fertilizer, winter_hardiness, minimum_temperature.
- Jede Kategorie mindestens 2 unabhängige Quellen-IDs.
- winter_hardiness und minimum_temperature jeweils mindestens 3 unabhängige Quellen-IDs.
- Die Pflege-Kurztexte light, water, fertilizer brauchen je 2; winter braucht 3 unabhängige Quellen.
- minTemperatureC ist der praxisnahe zentrale Richtwert für ein etabliertes, ausgepflanztes Exemplar, nicht der wärmste Einzelwert und nicht die absolute Überlebensgrenze.
- Bei mehreren belastbaren Werten den Median, Mehrheitskonsens oder die Mitte der gut belegten Überlappung verwenden; Ausreißer in beide Richtungen verwerfen.
- Für Olea europaea bei bestätigter Beleglage typischerweise einen Wert innerhalb −12 bis −16 °C wählen, häufig etwa −14 °C, statt automatisch −5 °C.
- Kübel- und Jungpflanzenrisiken getrennt als Schutzempfehlung beschreiben und nicht durch einen künstlich wärmeren Artwert ersetzen.
- Kübelpflanzen-Hinweis berücksichtigen.
- Keine Aussage ergänzen, die nicht im Dossier belegt ist.
${groupGuidance}

QUELLENKATALOG:
${sourceCatalogue(sources)}

DOSSIER:
${dossier}`,
      },
    ],
    text: {
      verbosity: "low",
      format: {
        type: "json_schema",
        name: "palmenheld_product_research",
        strict: true,
        schema: RESEARCH_SCHEMA,
      },
    },
  });

  const research = JSON.parse(
    extractOutputText(structuredResponse)
  ) as ProductResearch;
  if (isSpeciesGroupCandidate(candidate)) {
    research.confirmedLatinName = speciesGroupLatinName(candidate);
  }
  research.confirmedGermanName = preferredGermanCommonName(
    research.confirmedLatinName || candidate.latinName,
    research.confirmedGermanName
  );
  return { research, sources };
}

type ResearchResult = { research: ProductResearch; sources: ResearchSource[] };
const researchInFlight = new Map<string, Promise<ResearchResult>>();

export async function researchProduct(
  candidate: ProductCandidate
): Promise<ResearchResult> {
  const cached = await readCachedResearch(candidate);
  if (cached) return cached;

  const key = researchCacheKey(candidate);
  const running = researchInFlight.get(key);
  if (running) return running;

  const request = researchProductFresh(candidate)
    .then(async (result) => {
      await saveCachedResearch(
        candidate,
        result.research,
        result.sources
      ).catch(() => undefined);
      return result;
    })
    .finally(() => {
      researchInFlight.delete(key);
    });
  researchInFlight.set(key, request);
  return request;
}
