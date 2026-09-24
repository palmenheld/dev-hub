import { getArticlePage } from "@/services/articleService";
import { DEFAULT_ARTICLE_LIST_QUERY } from "@/types/articleList";
import ArticleListClient from "./ArticleListClient";

export default async function ArticleList() {
  const initialPage = await getArticlePage(DEFAULT_ARTICLE_LIST_QUERY);

  return <ArticleListClient initialPage={initialPage} />;
}
