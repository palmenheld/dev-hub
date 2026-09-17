import { getArticle, getArticles, getShopwarePriceMap } from "@/services/weclapp";
import type { WeclappArticle } from "@/services/weclapp/types/article";
import {
  getFieldMap,
  getPublishingSettings,
} from "@/services/shopware/dataStore";
import { mapCandidate } from "@/services/shopware/fieldMapping";

async function detailedArticles(
  limit: number,
  page: number,
  onlyActive: boolean
) {
  const response = await getArticles({
    page,
    pageSize: limit,
    active: onlyActive || undefined,
  });
  const summaries = response.result ?? [];
  const details: WeclappArticle[] = [];
  for (let index = 0; index < summaries.length; index += 5) {
    const batch = summaries.slice(index, index + 5);
    details.push(
      ...(await Promise.all(
        batch.map(async (article) => {
          try {
            return await getArticle(article.id);
          } catch {
            return article;
          }
        })
      ))
    );
  }
  return details;
}

export async function getEbayCandidates(
  limit = 40,
  page = 1,
  onlyActive = false
) {
  const safeLimit = Math.max(1, Math.min(100, Math.floor(limit)));
  const [articles, fieldMap, publishingSettings] = await Promise.all([
    detailedArticles(safeLimit, Math.max(1, Math.floor(page)), onlyActive),
    getFieldMap(),
    getPublishingSettings(),
  ]);
  const prices = await getShopwarePriceMap(
    "GROSS1",
    process.env.WECLAPP_EBAY_CURRENCY_ID?.trim() ||
      process.env.WECLAPP_SHOPWARE_CURRENCY_ID?.trim() ||
      publishingSettings.currencyId
  );
  return articles.map((article) => {
    const resolvedPrice = prices.get(article.id);
    return mapCandidate(
      article,
      resolvedPrice?.price,
      fieldMap,
      false,
      resolvedPrice?.salesChannel,
      resolvedPrice?.fallback
    );
  });
}

export async function getEbayCandidate(articleId: string) {
  const [article, fieldMap, publishingSettings] = await Promise.all([
    getArticle(articleId),
    getFieldMap(),
    getPublishingSettings(),
  ]);
  const prices = await getShopwarePriceMap(
    "GROSS1",
    process.env.WECLAPP_EBAY_CURRENCY_ID?.trim() ||
      process.env.WECLAPP_SHOPWARE_CURRENCY_ID?.trim() ||
      publishingSettings.currencyId
  );
  const resolvedPrice = prices.get(article.id);
  return mapCandidate(
    article,
    resolvedPrice?.price,
    fieldMap,
    false,
    resolvedPrice?.salesChannel,
    resolvedPrice?.fallback
  );
}
