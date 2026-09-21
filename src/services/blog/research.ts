import type { BlogArticleContent, BlogParagraph } from "@/types/blog";
import type { ResearchSource } from "@/types/shopwarePublishing";
import { getResearchConfiguration } from "@/services/shopware/publishingCandidates";
import {
  collectResearchSources,
  extractOutputText,
  openAIResponse,
} from "@/services/shopware/research";

const ARTICLE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    title: { type: "string" },
    teaser: { type: "string" },
    metaTitle: { type: "string" },
    metaDescription: { type: "string" },
    keywords: { type: "array", items: { type: "string" } },
    intro: { $ref: "#/$defs/paragraph" },
    sections: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          heading: { type: "string" },
          paragraphs: {
            type: "array",
            items: { $ref: "#/$defs/paragraph" },
          },
        },
        required: ["heading", "paragraphs"],
      },
    },
    conclusion: { $ref: "#/$defs/paragraph" },
  },
  required: [
    "title",
    "teaser",
    "metaTitle",
    "metaDescription",
    "keywords",
    "intro",
    "sections",
    "conclusion",
  ],
  $defs: {
    paragraph: {
      type: "object",
      additionalProperties: false,
      properties: {
        text: { type: "string" },
        importantClaim: { type: "boolean" },
        sourceIds: { type: "array", items: { type: "string" } },
      },
      required: ["text", "importantClaim", "sourceIds"],
    },
  },
} as const;

type StructuredArticle = Omit<BlogArticleContent, "slug" | "wordCount" | "html">;

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 160);
}

function countWords(value: string) {
  return value.trim().split(/\s+/u).filter(Boolean).length;
}

function articleText(article: StructuredArticle) {
  return [
    article.intro.text,
    ...article.sections.flatMap((section) =>
      section.paragraphs.map((paragraph) => paragraph.text)
    ),
    article.conclusion.text,
  ].join(" ");
}

function validateParagraph(
  paragraph: BlogParagraph,
  sources: ResearchSource[],
  label: string
) {
  const sourceMap = new Map(sources.map((source) => [source.id, source]));
  const domains = new Set(
    paragraph.sourceIds.map((id) => sourceMap.get(id)?.domain).filter(Boolean)
  );
  const required = paragraph.importantClaim ? 3 : 2;
  if (domains.size < required) {
    throw new Error(
      `${label} ist nur durch ${domains.size} von ${required} erforderlichen unabhängigen Quellen belegt.`
    );
  }
  if (paragraph.text.trim().length < 90) {
    throw new Error(`${label} ist für einen hochwertigen Blogbeitrag zu kurz.`);
  }
}

function validateArticle(article: StructuredArticle, sources: ResearchSource[]) {
  if (sources.length < 6 || new Set(sources.map((source) => source.domain)).size < 5) {
    throw new Error(
      "Die Recherche lieferte weniger als fünf unabhängige, belastbare Quellen."
    );
  }
  if (!article.title.trim() || article.title.length > 90) {
    throw new Error("Der erzeugte Blogtitel ist leer oder länger als 90 Zeichen.");
  }
  if (article.sections.length < 4 || article.sections.length > 9) {
    throw new Error("Der Blogbeitrag braucht vier bis neun klar gegliederte Abschnitte.");
  }
  validateParagraph(article.intro, sources, "Die Einleitung");
  article.sections.forEach((section, sectionIndex) => {
    if (!section.heading.trim() || section.paragraphs.length < 1) {
      throw new Error(`Abschnitt ${sectionIndex + 1} ist unvollständig.`);
    }
    section.paragraphs.forEach((paragraph, paragraphIndex) =>
      validateParagraph(
        paragraph,
        sources,
        `Abschnitt ${sectionIndex + 1}, Absatz ${paragraphIndex + 1}`
      )
    );
  });
  validateParagraph(article.conclusion, sources, "Das Fazit");

  const words = countWords(articleText(article));
  if (words < 700 || words > 1_800) {
    throw new Error(
      `Der Blogbeitrag hat ${words} Wörter; erlaubt sind 700 bis 1.800 Wörter.`
    );
  }
  if (article.metaTitle.length < 35 || article.metaTitle.length > 65) {
    throw new Error("Der Meta-Titel muss 35 bis 65 Zeichen lang sein.");
  }
  if (article.metaDescription.length < 120 || article.metaDescription.length > 170) {
    throw new Error("Die Meta-Beschreibung muss 120 bis 170 Zeichen lang sein.");
  }
  if (/(?:als ki|künstliche intelligenz|laut meinem wissen|ich kann nicht)/iu.test(articleText(article))) {
    throw new Error("Der Beitrag enthält eine ungeeignete KI- oder Unsicherheitsformulierung.");
  }
  return words;
}

function citations(paragraph: BlogParagraph, sources: ResearchSource[]) {
  const sourceMap = new Map(sources.map((source) => [source.id, source]));
  return paragraph.sourceIds
    .map((id) => sourceMap.get(id))
    .filter((source): source is ResearchSource => Boolean(source))
    .filter(
      (source, index, all) =>
        all.findIndex((candidate) => candidate.domain === source.domain) === index
    )
    .map(
      (source) =>
        `<a href="${escapeHtml(source.url)}" target="_blank" rel="noopener noreferrer" title="${escapeHtml(
          source.title
        )}" style="color:#17652e;text-decoration:none;">[${escapeHtml(source.id)}]</a>`
    )
    .join(" ");
}

function renderParagraph(paragraph: BlogParagraph, sources: ResearchSource[]) {
  return `<p style="margin:0 0 1.1rem;line-height:1.75;color:#24312a;">${escapeHtml(
    paragraph.text
  )} <sup style="white-space:nowrap;font-size:.7em;">${citations(
    paragraph,
    sources
  )}</sup></p>`;
}

function renderHtml(article: StructuredArticle, sources: ResearchSource[]) {
  const sections = article.sections
    .map(
      (section) => `<section style="margin:2rem 0;">
  <h2 style="margin:0 0 .8rem;color:#0f4f24;font-size:1.55rem;line-height:1.25;">${escapeHtml(
    section.heading
  )}</h2>
  ${section.paragraphs.map((paragraph) => renderParagraph(paragraph, sources)).join("\n")}
</section>`
    )
    .join("\n");
  const sourceList = sources
    .map(
      (source) => `<li style="margin:.45rem 0;"><a href="${escapeHtml(
        source.url
      )}" target="_blank" rel="noopener noreferrer" style="color:#17652e;">${escapeHtml(
        source.title
      )}</a> <span style="color:#66736b;">(${escapeHtml(source.publisher)})</span></li>`
    )
    .join("\n");

  return `<article style="max-width:900px;margin:0 auto;font-family:Arial,Helvetica,sans-serif;color:#24312a;">
  <header style="padding:2rem;border-radius:18px;background:linear-gradient(135deg,#0f4f24,#17652e);color:#fff;margin-bottom:2rem;">
    <div style="font-size:.78rem;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#ffd76a;margin-bottom:.75rem;">Palmenheld Ratgeber</div>
    <h1 style="margin:0 0 1rem;font-size:clamp(2rem,5vw,3.25rem);line-height:1.08;color:#fff;">${escapeHtml(
      article.title
    )}</h1>
    <p style="margin:0;font-size:1.12rem;line-height:1.65;color:#eef8f0;">${escapeHtml(
      article.teaser
    )}</p>
  </header>
  <div style="padding:0 .5rem;">
    <div style="font-size:1.08rem;">${renderParagraph(article.intro, sources)}</div>
    ${sections}
    <aside style="margin:2.25rem 0;padding:1.4rem;border-left:5px solid #e4a300;background:#fff5d8;border-radius:0 14px 14px 0;">
      <h2 style="margin:0 0 .7rem;color:#0f4f24;font-size:1.35rem;">Das Wichtigste zum Schluss</h2>
      ${renderParagraph(article.conclusion, sources)}
    </aside>
    <section style="margin-top:2.5rem;padding-top:1.25rem;border-top:1px solid #dce6df;">
      <h2 style="color:#0f4f24;font-size:1.2rem;">Quellen und weiterführende Informationen</h2>
      <ol style="padding-left:1.4rem;line-height:1.5;">${sourceList}</ol>
      <p style="font-size:.82rem;color:#66736b;">Redaktionell geprüft und auf Basis voneinander unabhängiger Fachquellen erstellt.</p>
    </section>
  </div>
</article>`;
}

function sourceCatalogue(sources: ResearchSource[]) {
  return sources
    .map(
      (source) =>
        `${source.id} | ${source.publisher} | ${source.title} | ${source.url}`
    )
    .join("\n");
}

export async function researchBlogArticle(prompt: string) {
  const { model } = getResearchConfiguration();
  const dossierResponse = await openAIResponse({
    model,
    store: false,
    prompt_cache_key: "palmenheld-blog-dossier-v1",
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
            "tiktok.com",
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
          "Du erstellst ein deutschsprachiges Recherche-Dossier für den Palmenheld-Ratgeber. Bevorzuge Universitäten, botanische Gärten, Behörden, Fachgesellschaften, wissenschaftliche Veröffentlichungen sowie etablierte Gartenbau-Institutionen. Händlerquellen dürfen nur praktische oder marktrelevante Hinweise ergänzen. Nutze keine KI-Texte, sozialen Netzwerke, Foren, Marktplätze, Wikipedia oder anonyme SEO-/Affiliate-Seiten. Prüfe jede Kernaussage mit mindestens zwei voneinander unabhängigen Organisationen; sicherheitsrelevante, gesundheitliche oder konkrete Zahlenangaben mit mindestens drei. Notiere zu jeder Aussage vollständige URLs. Recherchiere gezielt statt das Thema unnötig auszuweiten.",
      },
      {
        role: "user",
        content: `Erstelle ein belastbares Dossier für einen hilfreichen, natürlich klingenden deutschen Blogartikel. Thema und redaktionelle Stichwörter:\n\n${prompt}\n\nZielgruppe sind Pflanzenliebhaber und Kunden eines spezialisierten deutschen Pflanzenhändlers. Das Dossier soll praktische Fragen beantworten, Fehlannahmen vermeiden und 8 bis 18 wirklich relevante Quellen verwenden. Werbung darf Fakten niemals verdrängen.`,
      },
    ],
  });
  const dossier = extractOutputText(dossierResponse);
  const sources = collectResearchSources(dossierResponse, dossier);
  if (sources.length < 6) {
    throw new Error(
      "Die Recherche lieferte zu wenige nachvollziehbare Fachquellen. Es wurde nichts veröffentlicht."
    );
  }

  const structuredResponse = await openAIResponse({
    model,
    store: false,
    prompt_cache_key: "palmenheld-blog-article-v1",
    reasoning: { effort: "low" },
    input: [
      {
        role: "developer",
        content:
          "Du bist ein erfahrener deutscher Gartenbau-Redakteur und strenger Faktenprüfer. Schreibe konkret, warm, souverän und abwechslungsreich, ohne KI-Floskeln, aufgeblähte Einleitungen, erfundene Erfahrungen oder interne Unsicherheit. Nutze ausschließlich belegte Inhalte aus dem Dossier. Der Text soll wie von einer fachkundigen Palmenheld-Redaktion klingen, für Leser einen echten praktischen Nutzen haben und organisch für Suchmaschinen strukturiert sein. Keine Quelle darf eine Aussage allein tragen. importantClaim=true gilt für Zahlen, Temperaturen, Sicherheit, Gesundheit, Giftigkeit und andere folgenreiche Aussagen; dafür sind mindestens drei unabhängige Quellen-IDs nötig. Quellen-IDs gehören in die Datenstruktur, nicht in den Fließtext.",
      },
      {
        role: "user",
        content: `Verfasse den fertigen Blogartikel aus dem folgenden Material.\n\nVORGABEN:\n- 900 bis 1.400 Wörter, zulässiger Prüfbereich 700 bis 1.800.\n- Vier bis neun aussagekräftige H2-Abschnitte mit je ein bis drei Absätzen.\n- Jeder Absatz enthält 100 bis etwa 220 Wörter und mindestens zwei unabhängige Quellen-IDs.\n- Für importantClaim=true mindestens drei unabhängige Quellen-IDs.\n- Natürliches Deutsch, Sie-Ansprache nur wo sinnvoll, keine Keyword-Stapelung und keine Formulierungen über KI oder Rechercheunsicherheit.\n- Titel höchstens 90 Zeichen.\n- Meta-Titel 35 bis 65 Zeichen.\n- Meta-Beschreibung 120 bis 170 Zeichen.\n- Teaser ungefähr 140 bis 300 Zeichen.\n- Das Fazit soll praktisch sein und nicht bloß die Einleitung wiederholen.\n\nREDAKTIONELLE STICHWÖRTER:\n${prompt}\n\nQUELLENKATALOG:\n${sourceCatalogue(
          sources
        )}\n\nDOSSIER:\n${dossier}`,
      },
    ],
    text: {
      verbosity: "low",
      format: {
        type: "json_schema",
        name: "palmenheld_blog_article",
        strict: true,
        schema: ARTICLE_SCHEMA,
      },
    },
  });

  const structured = JSON.parse(
    extractOutputText(structuredResponse)
  ) as StructuredArticle;
  const wordCount = validateArticle(structured, sources);
  const slug = slugify(structured.title);
  if (!slug) throw new Error("Aus dem Blogtitel konnte keine URL erzeugt werden.");
  const article: BlogArticleContent = {
    ...structured,
    slug,
    wordCount,
    html: renderHtml(structured, sources),
  };
  return { article, sources, dossier };
}
