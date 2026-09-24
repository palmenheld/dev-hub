import {
  getArticle,
  getArticles,
} from "@/services/weclapp";

import { mapWeclappArticle } from "@/services/weclapp/mappers/articleMapper";
import { buildGross1PriceMap } from "@/services/weclapp/prices";
import { buildStockMap } from "@/services/weclapp/stock";
import { WeclappArticle } from "@/services/weclapp/types/article";

async function loadRawArticles(): Promise<
  WeclappArticle[]
> {
  const all:
    WeclappArticle[] = [];

  for (
    let page = 1;
    page <= 100;
    page += 1
  ) {
    const response =
      await getArticles({
        page,
        pageSize: 100,
      });

    const batch =
      response.result ?? [];

    all.push(...batch);

    if (batch.length < 100) {
      break;
    }
  }

  return all;
}

export async function getAllArticles() {
  const articles =
    await loadRawArticles();

  const [
    grossPrices,
    stockMap,
  ] = await Promise.all([
    buildGross1PriceMap(
      articles
    ),

    buildStockMap(),
  ]);

  return articles.map(
    (article) =>
      mapWeclappArticle(
        article,

        grossPrices.get(
          String(article.id)
        ),

        stockMap.get(
          String(article.id)
        )
      )
  );
}

export async function getArticleById(
  id: string
) {
  /*
   * Für den Moment benutzen wir
   * dieselbe zentrale Datenbasis.
   *
   * Das ist etwas aufwendiger,
   * stellt aber sicher, dass Detail-
   * und Listenansicht exakt dieselben
   * Preise und Bestände verwenden.
   *
   * Danach bauen wir Cache.
   */

  const articles =
    await getAllArticles();

  return (
    articles.find(
      (article) =>
        article.id === id
    ) ?? null
  );
}
