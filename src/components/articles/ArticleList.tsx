import { getAllArticles } from "@/services/articleService";
import ArticleListClient from "./ArticleListClient";

export default async function ArticleList() {
  const articles = await getAllArticles();

  return (
    <ArticleListClient articles={articles} />
  );
}
