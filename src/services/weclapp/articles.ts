import { weclappRequest } from "./client";
import {
  WeclappArticle,
  WeclappArticleListResponse,
} from "./types/article";

export type GetArticlesOptions = {
  page?: number;
  pageSize?: number;
  active?: boolean;
  properties?: string;
};

export async function getArticles(
  options: GetArticlesOptions = {}
): Promise<WeclappArticleListResponse> {
  return weclappRequest<WeclappArticleListResponse>("article", {
    query: {
      page: options.page ?? 1,
      pageSize: options.pageSize ?? 20,
      "active-eq": options.active,
      properties: options.properties,
    },
  });
}

export async function getArticle(
  id: string
): Promise<WeclappArticle> {
  return weclappRequest<WeclappArticle>(
    `article/id/${encodeURIComponent(id)}`
  );
}
