import {
  getArticle,
  getArticleCategoryMap,
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

async function loadAllArticleSummaries() {
  const articles: WeclappArticle[] = [];
  const pageSize = 500;
  for (let page = 1; page <= 100; page += 1) {
    const response = await getArticles({ page, pageSize });
    const pageArticles = response.result ?? [];
    articles.push(...pageArticles);
    if (pageArticles.length < pageSize) break;
  }
  return articles;
}

async function existingProductNumbers(articleNumbers: string[]) {
  const result = new Set<string>();
  const chunks: string[][] = [];
  for (let index = 0; index < articleNumbers.length; index += 100) {
    chunks.push(articleNumbers.slice(index, index + 100));
  }
  for (let index = 0; index < chunks.length; index += 4) {
    const batch = await Promise.all(
      chunks
        .slice(index, index + 4)
        .map((chunk) => getExistingProductNumbers(chunk))
    );
    batch.forEach((found) =>
      found.forEach((articleNumber) => result.add(articleNumber))
    );
  }
  return result;
}

async function categoryNames() {
  try {
    return await getArticleCategoryMap();
  } catch {
    return new Map<string, string>();
  }
}

async function mapArticles(
  articles: WeclappArticle[],
  suppliedFieldMap?: WeclappFieldMap
) {
  const [prices, fieldMap, categories] = await Promise.all([
    getShopwarePriceMap(),
    suppliedFieldMap ? Promise.resolve(suppliedFieldMap) : getFieldMap(),
    categoryNames(),
  ]);
  const articleNumbers = articles
    .map((article) => String(article.articleNumber ?? "").trim())
    .filter(Boolean);
  const existing = await existingProductNumbers(articleNumbers);

  return articles.map((article) => {
    const articleNumber = String(article.articleNumber ?? "").trim();
    const categoryId = String(article.articleCategoryId ?? "").trim();
    const resolvedPrice = prices.get(article.id);
    return mapCandidate(
      article,
      resolvedPrice?.price,
      fieldMap,
      existing.has(articleNumber),
      resolvedPrice?.salesChannel,
      resolvedPrice?.fallback,
      categories.get(categoryId)
    );
  });
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
  const articles = await loadDetailedArticles(
    safeLimit,
    Math.max(1, Math.floor(page))
  );
  return mapArticles(articles, suppliedFieldMap);
}

export async function getAllProductCandidates() {
  return mapArticles(await loadAllArticleSummaries());
}

export async function getProductCandidate(articleId: string) {
  const [article, prices, fieldMap, categories] = await Promise.all([
    getArticle(articleId),
    getShopwarePriceMap(),
    getFieldMap(),
    categoryNames(),
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
    resolvedPrice?.fallback,
    categories.get(String(article.articleCategoryId ?? "").trim())
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

  const [articles, prices, fieldMap, categories] = await Promise.all([
    Promise.all(ids.map((id) => getArticle(id))),
    getPriceMap(priceChannel),
    getFieldMap(),
    categoryNames(),
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
      false,
      categories.get(String(article.articleCategoryId ?? "").trim())
    );
  });
}
