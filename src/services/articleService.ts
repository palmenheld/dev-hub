import {
  getArticle,
  getArticles,
  getGross1PriceMap,
} from "@/services/weclapp";

import { mapWeclappArticle } from "@/services/weclapp/mappers/articleMapper";

export async function getAllArticles() {
  const [articleResponse, gross1Prices] =
    await Promise.all([
      getArticles({
        page: 1,
        pageSize: 500,
      }),

      getGross1PriceMap(),
    ]);

  return (articleResponse.result ?? []).map(
    (article) =>
      mapWeclappArticle(
        article,
        gross1Prices.get(article.id) ?? 0
      )
  );
}

export async function getArticleById(
  id: string
) {
  const [article, gross1Prices] =
    await Promise.all([
      getArticle(id),
      getGross1PriceMap(),
    ]);

  return mapWeclappArticle(
    article,
    gross1Prices.get(article.id) ?? 0
  );
}
