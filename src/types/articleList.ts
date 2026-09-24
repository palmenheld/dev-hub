import type { Article, ChannelStatus } from "./article";

export const ARTICLE_PAGE_SIZES = [25, 50, 100, 250, 500] as const;

export type ArticlePageSize = (typeof ARTICLE_PAGE_SIZES)[number];
export type ArticleSortKey = "name" | "sku" | "stock" | "price" | "status";
export type ArticleSortDirection = "asc" | "desc";
export type ArticleActivityFilter = "active" | "inactive" | "all";
export type ArticleChannelFilter = "all" | ChannelStatus;

export type ArticleListQuery = {
  page: number;
  pageSize: ArticlePageSize;
  query: string;
  activity: ArticleActivityFilter;
  name: string;
  sku: string;
  minStock: number | null;
  maxStock: number | null;
  minPrice: number | null;
  maxPrice: number | null;
  shop: ArticleChannelFilter;
  ebay: ArticleChannelFilter;
  kleinanzeigen: ArticleChannelFilter;
  sortKey: ArticleSortKey;
  sortDirection: ArticleSortDirection;
};

export type ArticleListPage = {
  articles: Article[];
  page: number;
  pageSize: ArticlePageSize;
  total: number;
  totalPages: number;
  totalArticles: number;
  inactiveTotal: number;
};

export const DEFAULT_ARTICLE_LIST_QUERY: ArticleListQuery = {
  page: 1,
  pageSize: 25,
  query: "",
  activity: "active",
  name: "",
  sku: "",
  minStock: null,
  maxStock: null,
  minPrice: null,
  maxPrice: null,
  shop: "all",
  ebay: "all",
  kleinanzeigen: "all",
  sortKey: "name",
  sortDirection: "asc",
};
