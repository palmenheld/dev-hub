import type { Article, ChannelStatus } from "@/types/article";
import {
  ARTICLE_PAGE_SIZES,
  DEFAULT_ARTICLE_LIST_QUERY,
  type ArticleListPage,
  type ArticleListQuery,
  type ArticlePageSize,
} from "@/types/articleList";
import {
  getArticle,
  getArticles,
  getGross1PriceMap,
} from "@/services/weclapp";
import { mapWeclappArticle } from "@/services/weclapp/mappers/articleMapper";
import type { WeclappArticle } from "@/services/weclapp/types/article";

const INDEX_PAGE_SIZE = 1000;
const CACHE_TTL_MS = 30_000;
const INDEX_PROPERTIES = "id,articleNumber,name,description,active";

let articleIndexCache:
  | { expiresAt: number; value: Promise<WeclappArticle[]> }
  | undefined;
let gross1PriceCache:
  | { expiresAt: number; value: Promise<Map<string, number>> }
  | undefined;
let articleRowsCache:
  | { expiresAt: number; value: Promise<Article[]> }
  | undefined;

function normalized(value: unknown) {
  return String(value ?? "")
    .normalize("NFKC")
    .toLocaleLowerCase("de-DE")
    .replace(/\s+/gu, " ")
    .trim();
}

function channelStatus(): ChannelStatus {
  return "missing";
}

async function loadArticleIndex() {
  const rows: WeclappArticle[] = [];
  for (let page = 1; page <= 100; page += 1) {
    const response = await getArticles({
      page,
      pageSize: INDEX_PAGE_SIZE,
      properties: INDEX_PROPERTIES,
    });
    const batch = response.result ?? [];
    rows.push(...batch);
    const totalCount = Number(response.meta?.totalCount);
    if (
      batch.length < INDEX_PAGE_SIZE ||
      (Number.isFinite(totalCount) && rows.length >= totalCount)
    ) {
      return rows;
    }
  }
  throw new Error(
    "Der Weclapp-Artikelbestand überschreitet 100.000 Artikel und wurde nicht unvollständig geladen."
  );
}

function cachedArticleIndex() {
  if (articleIndexCache && articleIndexCache.expiresAt > Date.now()) {
    return articleIndexCache.value;
  }
  const value = loadArticleIndex().catch((error) => {
    articleIndexCache = undefined;
    throw error;
  });
  articleIndexCache = { expiresAt: Date.now() + CACHE_TTL_MS, value };
  return value;
}

function cachedGross1Prices() {
  if (gross1PriceCache && gross1PriceCache.expiresAt > Date.now()) {
    return gross1PriceCache.value;
  }
  const value = getGross1PriceMap().catch((error) => {
    gross1PriceCache = undefined;
    throw error;
  });
  gross1PriceCache = { expiresAt: Date.now() + CACHE_TTL_MS, value };
  return value;
}

function validPageSize(value: number): ArticlePageSize {
  return ARTICLE_PAGE_SIZES.includes(value as ArticlePageSize)
    ? value as ArticlePageSize
    : DEFAULT_ARTICLE_LIST_QUERY.pageSize;
}

function rowForIndex(item: WeclappArticle, prices: Map<string, number>): Article {
  return {
    ...mapWeclappArticle(item, prices.get(item.id) ?? 0),
    channels: {
      shop: channelStatus(),
      ebay: channelStatus(),
      kleinanzeigen: channelStatus(),
    },
  };
}

function cachedArticleRows() {
  if (articleRowsCache && articleRowsCache.expiresAt > Date.now()) {
    return articleRowsCache.value;
  }
  const value = Promise.all([cachedArticleIndex(), cachedGross1Prices()])
    .then(([index, prices]) => index.map((item) => rowForIndex(item, prices)))
    .catch((error) => {
      articleRowsCache = undefined;
      throw error;
    });
  articleRowsCache = { expiresAt: Date.now() + CACHE_TTL_MS, value };
  return value;
}

export function invalidateArticleListCache() {
  articleIndexCache = undefined;
  gross1PriceCache = undefined;
  articleRowsCache = undefined;
}

export async function getArticlePage(
  input: Partial<ArticleListQuery> = {}
): Promise<ArticleListPage> {
  const query: ArticleListQuery = {
    ...DEFAULT_ARTICLE_LIST_QUERY,
    ...input,
    page: Math.max(1, Math.floor(Number(input.page) || 1)),
    pageSize: validPageSize(Number(input.pageSize)),
  };
  const rows = await cachedArticleRows();
  const queryText = normalized(query.query);
  const nameText = normalized(query.name);
  const skuText = normalized(query.sku);
  const inactiveTotal = rows.filter((item) => !item.active).length;

  const matches = rows.filter((article) => {
      if (query.activity === "active" && !article.active) return false;
      if (query.activity === "inactive" && article.active) return false;
      if (query.minStock !== null && article.stock < query.minStock) return false;
      if (query.maxStock !== null && article.stock > query.maxStock) return false;
      if (query.minPrice !== null && article.basePrice < query.minPrice) return false;
      if (query.maxPrice !== null && article.basePrice > query.maxPrice) return false;
      if (query.shop !== "all" && article.channels.shop !== query.shop) return false;
      if (query.ebay !== "all" && article.channels.ebay !== query.ebay) return false;
      if (
        query.kleinanzeigen !== "all" &&
        article.channels.kleinanzeigen !== query.kleinanzeigen
      ) return false;
      if (
        nameText &&
        !normalized(`${article.name} ${article.subtitle}`).includes(nameText)
      ) return false;
      if (skuText && !normalized(article.sku).includes(skuText)) return false;
      if (
        queryText &&
        !normalized(
          `${article.name} ${article.sku} ${article.subtitle}`
        ).includes(queryText)
      ) return false;
      return true;
    });

  matches.sort((left, right) => {
    let comparison = 0;
    if (query.sortKey === "sku") {
      comparison = left.sku.localeCompare(right.sku, "de", { numeric: true });
    } else if (query.sortKey === "stock") {
      comparison = left.stock - right.stock;
    } else if (query.sortKey === "price") {
      comparison = left.basePrice - right.basePrice;
    } else if (query.sortKey === "status") {
      comparison = Number(right.active) - Number(left.active);
    } else {
      comparison = left.name.localeCompare(right.name, "de");
    }
    return query.sortDirection === "asc" ? comparison : -comparison;
  });

  const total = matches.length;
  const totalPages = Math.max(1, Math.ceil(total / query.pageSize));
  const page = Math.min(query.page, totalPages);
  const offset = (page - 1) * query.pageSize;
  return {
    articles: matches.slice(offset, offset + query.pageSize),
    page,
    pageSize: query.pageSize,
    total,
    totalPages,
    totalArticles: rows.length,
    inactiveTotal,
  };
}

export async function getAllArticles() {
  const [articleResponse, gross1Prices] = await Promise.all([
    getArticles({
      page: 1,
      pageSize: 500,
    }),
    getGross1PriceMap(),
  ]);

  return (articleResponse.result ?? []).map((article) =>
    mapWeclappArticle(article, gross1Prices.get(article.id) ?? 0)
  );
}

export async function getArticleById(id: string) {
  const [article, gross1Prices] = await Promise.all([
    getArticle(id),
    getGross1PriceMap(),
  ]);

  return mapWeclappArticle(article, gross1Prices.get(article.id) ?? 0);
}
