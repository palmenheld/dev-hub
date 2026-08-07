import { articles } from "@/data/articles";

export async function getArticles() {
  return articles;
}

export async function getArticleById(id: string) {
  return articles.find((article) => article.id === id) ?? null;
}
