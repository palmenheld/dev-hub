export type WeclappArticle = {
  id: string;

  articleNumber?: string;
  name?: string;
  description?: string;

  ean?: string;
  manufacturerPartNumber?: string;

  createdDate?: number;
  lastModifiedDate?: number;
  
  active?: boolean;

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
