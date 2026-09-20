import type { EbayGeneratedCopy } from "@/types/ebay";
import type {
  ChannelContentReuse,
  ProductCandidate,
  ProductResearch,
  ResearchSource,
  SalesChannel,
} from "@/types/shopwarePublishing";
import { listEbayDrafts } from "@/services/ebay/store";
import { getKleinanzeigenListings } from "@/services/kleinanzeigen/listingStore";
import { customerSafePlantText } from "@/services/shopware/customerText";
import { listDrafts } from "@/services/shopware/dataStore";

export type ReusableChannelContent = {
  channel: SalesChannel;
  id: string;
  articleId?: string;
  articleNumber: string;
  latinName: string;
  title: string;
  description: string;
  research: ProductResearch;
  sources: ResearchSource[];
  ebayCopy?: EbayGeneratedCopy;
  updatedAt: string;
};

function normalized(value: string) {
  return value
    .normalize("NFKC")
    .replace(/[‘’]/gu, "'")
    .replace(/×/gu, "x")
    .replace(/\s+/gu, " ")
    .trim()
    .toLocaleLowerCase("de-DE");
}

function hasReusableResearch(
  research: ProductResearch | undefined,
  sources: ResearchSource[] | undefined
): research is ProductResearch {
  return Boolean(
    research &&
      sources &&
      research.confirmedLatinName.trim() &&
      research.confirmedGermanName.trim() &&
      research.blocks.length &&
      research.care.light.text.trim() &&
      research.care.water.text.trim() &&
      research.care.fertilizer.text.trim() &&
      research.care.winter.text.trim()
  );
}

export async function findReusableChannelContent(
  candidate: ProductCandidate,
  targetChannel: SalesChannel
): Promise<ReusableChannelContent | undefined> {
  const [shopwareDrafts, ebayDrafts, kleinanzeigenListings] =
    await Promise.all([
      listDrafts(1000).catch(() => []),
      listEbayDrafts(1000).catch(() => []),
      getKleinanzeigenListings().catch(() => []),
    ]);

  const content: ReusableChannelContent[] = [];
  for (const draft of shopwareDrafts) {
    if (!hasReusableResearch(draft.research, draft.sources)) continue;
    content.push({
      channel: "shopware",
      id: draft.id,
      articleId: draft.source.articleId,
      articleNumber: draft.source.articleNumber,
      latinName:
        draft.research.confirmedLatinName || draft.source.latinName,
      title: draft.title,
      description: draft.descriptionHtml,
      research: draft.research,
      sources: draft.sources,
      updatedAt: draft.updatedAt,
    });
  }
  for (const draft of ebayDrafts) {
    if (!hasReusableResearch(draft.research, draft.sources)) continue;
    content.push({
      channel: "ebay",
      id: draft.id,
      articleId: draft.source.articleId,
      articleNumber: draft.source.articleNumber,
      latinName:
        draft.research.confirmedLatinName || draft.source.latinName,
      title: draft.title,
      description: draft.descriptionHtml,
      research: draft.research,
      sources: draft.sources,
      ebayCopy: draft.generatedCopy,
      updatedAt: draft.updatedAt,
    });
  }
  for (const listing of kleinanzeigenListings) {
    if (!hasReusableResearch(listing.research, listing.sources)) continue;
    content.push({
      channel: "kleinanzeigen",
      id: listing.id,
      articleId: listing.articleId,
      articleNumber: listing.sku,
      latinName: listing.research.confirmedLatinName,
      title: listing.title,
      description: listing.description,
      research: listing.research,
      sources: listing.sources!,
      updatedAt: listing.updatedAt,
    });
  }

  const wantedArticleId = normalized(candidate.articleId);
  const wantedArticleNumber = normalized(candidate.articleNumber);
  const wantedLatinName = normalized(candidate.latinName);
  return content
    .map((item) => {
      const exactArticle =
        Boolean(wantedArticleId) && normalized(item.articleId || "") === wantedArticleId;
      const exactNumber =
        Boolean(wantedArticleNumber) &&
        normalized(item.articleNumber) === wantedArticleNumber;
      const samePlant =
        Boolean(wantedLatinName) && normalized(item.latinName) === wantedLatinName;
      const score = exactArticle
        ? 30_000
        : exactNumber
          ? 20_000
          : samePlant
            ? 10_000
            : 0;
      return {
        item,
        score:
          score +
          Number(item.channel !== targetChannel) * 100 +
          Number(item.research.researchComplete) * 10,
      };
    })
    .filter(({ score }) => score >= 10_000)
    .sort(
      (left, right) =>
        right.score - left.score ||
        right.item.updatedAt.localeCompare(left.item.updatedAt)
    )[0]?.item;
}

export function channelContentReuse(
  source: ReusableChannelContent,
  reusedAt = new Date().toISOString()
): ChannelContentReuse {
  return {
    sourceChannel: source.channel,
    sourceId: source.id,
    sourceDraftId: source.id,
    sourceArticleNumber: source.articleNumber,
    latinName: source.latinName,
    reusedAt,
  };
}

function shorten(value: string, maximum: number) {
  const clean = customerSafePlantText(value).replace(/\s+/gu, " ").trim();
  if (clean.length <= maximum) return clean;
  const slice = clean.slice(0, maximum - 1);
  const sentence = Math.max(
    slice.lastIndexOf(". "),
    slice.lastIndexOf("! "),
    slice.lastIndexOf("? ")
  );
  if (sentence >= Math.floor(maximum * 0.55)) {
    return slice.slice(0, sentence + 1).trim();
  }
  const word = slice.lastIndexOf(" ");
  return `${slice.slice(0, word > 0 ? word : slice.length).trim()}…`;
}

export function renderKleinanzeigenContent(
  candidate: ProductCandidate,
  research: ProductResearch
) {
  const germanName = research.confirmedGermanName || candidate.germanName;
  const latinName = research.confirmedLatinName || candidate.latinName;
  const facts = [
    candidate.heightLabel ? `Höhe: ${candidate.heightLabel}` : "",
    candidate.potSize ? `Topfgröße: ${candidate.potSize}` : "",
    `Botanischer Name: ${latinName}`,
  ].filter(Boolean);
  const appearance = research.blocks.find(
    (block) => block.key === "appearance" || block.key === "growth"
  )?.text;
  const titleParts = [germanName, candidate.heightLabel, candidate.potSize]
    .filter(Boolean)
    .join(" – ");
  const title = shorten(titleParts, 65);
  const sections = [
    `${germanName} (${latinName})`,
    facts.join("\n"),
    appearance ? `Beschreibung\n${shorten(appearance, 650)}` : "",
    `Standort und Pflege\n${shorten(research.care.light.text, 350)}\n${shorten(research.care.water.text, 350)}\n${shorten(research.care.fertilizer.text, 350)}`,
    `Überwinterung\n${shorten(research.care.winter.text, 500)}`,
    "Pflanzen sind Naturprodukte. Erscheinungsbild und Wuchsform können je nach Saison vom Foto abweichen.",
  ].filter(Boolean);
  return {
    title,
    description: shorten(sections.join("\n\n"), 3_800),
  };
}
