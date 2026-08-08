import { weclappRequest } from "./client";
import { getArticle } from "./articles";

export type WeclappArticlePrice = {
  id?: string;
  articleId?: string;
  salesChannel?: string;
  price?: string | number;
  currencyId?: string;
  startDate?: number;
  endDate?: number;

  [key: string]: unknown;
};

type ArticlePriceResponse = {
  result?: WeclappArticlePrice[];

  [key: string]: unknown;
};

export async function getArticlePrices(
  page = 1,
  pageSize = 1000
): Promise<WeclappArticlePrice[]> {
  const response = await weclappRequest<ArticlePriceResponse>(
    "articlePrice",
    {
      query: {
        page,
        pageSize,
      },
    }
  );

  return response.result ?? [];
}

export async function getGross1PriceMap(): Promise<
  Map<string, number>
> {
  const prices = await getArticlePrices();

  const result = new Map<string, number>();

  for (const item of prices) {
    if (!item.articleId) {
      continue;
    }

    if (
      String(item.salesChannel ?? "").toUpperCase() !==
      "GROSS1"
    ) {
      continue;
    }

    const value = Number(item.price);

    if (Number.isFinite(value)) {
      result.set(item.articleId, value);
    }
  }

  return result;
}
export async function updateGross1Price(
  articleId: string,
  newPrice: number
) {
  if (
    !Number.isFinite(newPrice) ||
    newPrice < 0
  ) {
    throw new Error(
      "Ungültiger Verkaufspreis."
    );
  }

  const article = await getArticle(articleId);

  if (!Array.isArray(article.articlePrices)) {
    throw new Error(
      "Der Artikel enthält keine Preisstruktur."
    );
  }

  const articlePrices = article.articlePrices.map(
    (rawPrice) => {
      if (
        typeof rawPrice !== "object" ||
        rawPrice === null
      ) {
        return rawPrice;
      }

      const price =
        rawPrice as Record<string, unknown>;

      if (
        String(
          price.salesChannel ?? ""
        ).toUpperCase() !== "GROSS1"
      ) {
        return price;
      }

      return {
        ...price,
        price: newPrice,
      };
    }
  );

  const gross1Exists =
    articlePrices.some((rawPrice) => {
      if (
        typeof rawPrice !== "object" ||
        rawPrice === null
      ) {
        return false;
      }

      return (
        String(
          (
            rawPrice as Record<
              string,
              unknown
            >
          ).salesChannel ?? ""
        ).toUpperCase() === "GROSS1"
      );
    });

  if (!gross1Exists) {
    throw new Error(
      "Für diesen Artikel wurde kein GROSS1-Preis gefunden."
    );
  }

  return weclappRequest(
    `article/id/${encodeURIComponent(articleId)}`,
    {
      method: "PUT",

      body: {
        articlePrices,
      },
    }
  );
}
