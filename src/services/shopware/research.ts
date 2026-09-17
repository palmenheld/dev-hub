import {
  ProductCandidate,
  ProductResearch,
  ResearchSource,
} from "@/types/shopwarePublishing";
import { getResearchConfiguration } from "./publishingCandidates";

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

function collectSources(response: OpenAIResponse): ResearchSource[] {
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

  visit(response.output, "output");

  return [...found.entries()].slice(0, 60).map(([url, details], index) => ({
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

export async function researchProduct(
  candidate: ProductCandidate
): Promise<{ research: ProductResearch; sources: ResearchSource[] }> {
  const { model } = getResearchConfiguration();
  const dossierResponse = await openAIResponse({
    model,
    store: false,
    reasoning: { effort: "medium" },
    tools: [
      {
        type: "web_search",
        search_context_size: "high",
        filters: {
          blocked_domains: [
            "pinterest.com",
            "facebook.com",
            "instagram.com",
            "amazon.de",
            "ebay.de",
          ],
        },
      },
    ],
    tool_choice: "required",
    include: ["web_search_call.action.sources"],
    input: [
      {
        role: "developer",
        content:
          "Du recherchierst Pflanzen fachlich und skeptisch. Bevorzuge botanische Gärten, Universitäten, staatliche Beratungsstellen, Fachgesellschaften und etablierte gärtnerische Institutionen. Händlertexte dürfen keine Kernaussage allein tragen. Trenne Freiland und Kübelhaltung. Erfinde keine Werte. Bei widersprüchlichen Angaben dokumentiere Spannweite und konservative Empfehlung.",
      },
      {
        role: "user",
        content: `Erstelle ein deutsches Evidenz-Dossier für genau einen manuell ausgewählten Shopartikel.
Ausgangsdaten:
- hinterlegter lateinischer Name: ${candidate.latinName}
- hinterlegter deutscher Name: ${candidate.germanName}
- Verkaufsgröße: ${candidate.heightLabel || candidate.heightCm + " cm"}
- Topfgröße: ${candidate.potSize || "nicht angegeben"}

Prüfe zuerst die botanische Identität. Recherchiere danach Erscheinungsbild/Wuchs, Licht, Wasser, Düngung und Winterhärte. Jede Kernaussage braucht mindestens zwei voneinander unabhängige Organisationen. Die Aussage zur Winterhärte und eine konkrete konservative Minimaltemperatur in °C brauchen mindestens drei unabhängige Organisationen. Nenne pro Aussage die vollständigen URLs direkt im Dossier. Wenn die Beleglage nicht reicht, sage das klar und erfinde keinen Ersatz. Schreibe keine medizinischen oder garantierten Erfolgsversprechen.`,
      },
    ],
  });

  const dossier = extractOutputText(dossierResponse);
  const sources = collectSources(dossierResponse);
  if (sources.length < 3) {
    throw new Error(
      "Die Recherche lieferte zu wenige nachvollziehbare Quellen. Der Entwurf wurde nicht erstellt."
    );
  }

  const structuredResponse = await openAIResponse({
    model,
    store: false,
    reasoning: { effort: "low" },
    input: [
      {
        role: "developer",
        content:
          "Du bist ein strenger Faktenprüfer und SEO-Redakteur. Nutze ausschließlich Aussagen aus dem Dossier und ausschließlich IDs aus dem Quellenkatalog. Jede Textpassage muss ihre Quellen-IDs tragen. Markiere researchComplete=false, sobald eine Pflichtaussage nicht ausreichend unabhängig belegt ist. Schreibe sachlich, hilfreich und ohne Superlative oder Garantien.",
      },
      {
        role: "user",
        content: `Erzeuge aus dem Dossier strukturierte deutsche Produktinhalte.

Anforderungen:
- confirmedGermanName muss der belegte gebräuchliche deutsche Trivialname sein und darf nicht einfach den botanischen/lateinischen Namen wiederholen.
- Meta-Titel idealerweise 45–60 Zeichen.
- Meta-Beschreibung idealerweise 140–160 Zeichen.
- 5–8 klare Textblöcke mit insgesamt ungefähr 350–650 Wörtern.
- Pflichtkategorien: identity, appearance, light, water, fertilizer, winter_hardiness, minimum_temperature.
- Jede Kategorie mindestens 2 unabhängige Quellen-IDs.
- winter_hardiness und minimum_temperature jeweils mindestens 3 unabhängige Quellen-IDs.
- Die Pflege-Kurztexte light, water, fertilizer brauchen je 2; winter braucht 3 unabhängige Quellen.
- Eine Zahl zur Minimaltemperatur nur aus der konservativ belegten Schnittmenge ableiten.
- Kübelpflanzen-Hinweis berücksichtigen.
- Keine Aussage ergänzen, die nicht im Dossier belegt ist.

QUELLENKATALOG:
${sourceCatalogue(sources)}

DOSSIER:
${dossier}`,
      },
    ],
    text: {
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
  return { research, sources };
}
