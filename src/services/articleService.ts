import { getArticle, getArticles } from "@/services/weclapp";
import { mapWeclappArticle } from "@/services/weclapp/mappers/articleMapper";

export async function getAllArticles() {
  const response = await getArticles({
    page: 1,
    pageSize: 100,
  });

  return (response.result ?? []).map(mapWeclappArticle);
}

export async function getArticleById(id: string) {
  const article = await getArticle(id);

  return mapWeclappArticle(article);
}
