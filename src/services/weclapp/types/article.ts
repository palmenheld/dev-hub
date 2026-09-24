export type WeclappArticle = {
  id: string;

  articleNumber?: string;
  name?: string;

  shortDescription1?: string;
  description?: string;

  active?: boolean;

  ean?: string;
  manufacturerPartNumber?: string;

  articlePrices?: unknown[];

  createdDate?: number;
  lastModifiedDate?: number;

  [key: string]: unknown;
};

export type WeclappArticleListResponse = {
  result: WeclappArticle[];

  meta?: {
    page?: number;
    pageSize?: number;
    totalCount?: number;
  };

  [key: string]: unknown;
};
