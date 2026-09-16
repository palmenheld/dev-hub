import {
  getArticle,
  getArticles,
  getPriceMap,
  getShopwarePriceMap,
} from "@/services/weclapp";
import { WeclappArticle } from "@/services/weclapp/types/article";
import {
  ProductCandidate,
  PublishingSetup,
  WeclappFieldMap,
} from "@/types/shopwarePublishing";
import { getFieldMap, getPublishingSettings } from "./dataStore";
import { getShopwarePublishingOptions } from "./publishingOptions";
import {
  inferFieldMap,
  listFieldOptions,
  mapCandidate,
} from "./fieldMapping";
import { getExistingProductNumbers } from "./products";

async function loadDetailedArticles(limit: number, page = 1) {
  const response = await getArticles({ page, pageSize: limit });
  const summaries = response.result ?? [];
  const details: WeclappArticle[] = [];

  for (let index = 0; index < summaries.length; index += 5) {
    const batch = summaries.slice(index, index + 5);
    const resolved = await Promise.all(
      batch.map(async (article) => {
        try {
          return await getArticle(article.id);
        } catch {
          return article;
        }
      })
    );
    details.push(...resolved);
  }

  return details;
}

export function getResearchConfiguration() {
  return {
    configured: Boolean(process.env.OPENAI_API_KEY?.trim()),
    model: process.env.OPENAI_RESEARCH_MODEL?.trim() || "gpt-5.2",
  };
}

export async function getPublishingSetup(): Promise<PublishingSetup> {
  const articles = await loadDetailedArticles(12);
  const fieldOptions = listFieldOptions(articles);
  const fieldMap = inferFieldMap(await getFieldMap(), fieldOptions);
  const research = getResearchConfiguration();
  const [storedSettings, options] = await Promise.all([
    getPublishingSettings(),
    getShopwarePublishingOptions(),
  ]);
  const shopwareSettings = {
    taxId: storedSettings.taxId || options.suggested.taxId,
    currencyId: storedSettings.currencyId || options.suggested.currencyId,
    salesChannelId:
      storedSettings.salesChannelId || options.suggested.salesChannelId,
  };

  return {
    fieldMap,
    fieldOptions,
    researchConfigured: research.configured,
    researchModel: research.model,
    shopwareSettings,
    shopwareOptions: {
      taxes: options.taxes,
      currencies: options.currencies,
      salesChannels: options.salesChannels,
    },
  };
}

export async function getProductCandidates(
  limit = 40,
  suppliedFieldMap?: WeclappFieldMap,
  page = 1
): Promise<ProductCandidate[]> {
  const safeLimit = Math.max(1, Math.min(100, Math.floor(limit)));
  const [articles, prices, fieldMap] = await Promise.all([
    loadDetailedArticles(safeLimit, Math.max(1, Math.floor(page))),
    getShopwarePriceMap(),
    suppliedFieldMap ? Promise.resolve(suppliedFieldMap) : getFieldMap(),
  ]);
  const articleNumbers = articles
    .map((article) => String(article.articleNumber ?? "").trim())
    .filter(Boolean);
  const existing = await getExistingProductNumbers(articleNumbers);

  return articles.map((article) => {
    const articleNumber = String(article.articleNumber ?? "").trim();
    const resolvedPrice = prices.get(article.id);
    return mapCandidate(
      article,
      resolvedPrice?.price,
      fieldMap,
      existing.has(articleNumber),
      resolvedPrice?.salesChannel,
      resolvedPrice?.fallback
    );
  });
}

export async function getProductCandidate(articleId: string) {
  const [article, prices, fieldMap] = await Promise.all([
    getArticle(articleId),
    getShopwarePriceMap(),
    getFieldMap(),
  ]);
  const articleNumber = String(article.articleNumber ?? "").trim();
  const existing = await getExistingProductNumbers(
    articleNumber ? [articleNumber] : []
  );
  const resolvedPrice = prices.get(article.id);
  return mapCandidate(
    article,
    resolvedPrice?.price,
    fieldMap,
    existing.has(articleNumber),
    resolvedPrice?.salesChannel,
    resolvedPrice?.fallback
  );
}
export async function getProductCandidatesByIds(
  articleIds: string[],
  priceChannel = "GROSS1"
) {
  const ids = [...new Set(articleIds.map((id) => id.trim()))]
    .filter((id) => /^[0-9]+$/.test(id))
    .slice(0, 100);
  if (!ids.length) return [];

  const [articles, prices, fieldMap] = await Promise.all([
    Promise.all(ids.map((id) => getArticle(id))),
    getPriceMap(priceChannel),
    getFieldMap(),
  ]);
  const articleNumbers = articles
    .map((article) => String(article.articleNumber ?? "").trim())
    .filter(Boolean);
  const existing = await getExistingProductNumbers(articleNumbers);

  return articles.map((article) => {
    const articleNumber = String(article.articleNumber ?? "").trim();
    return mapCandidate(
      article,
      prices.get(article.id),
      fieldMap,
      existing.has(articleNumber),
      priceChannel,
      false
    );
  });
}
