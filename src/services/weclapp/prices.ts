import { weclappRequest } from "./client";
import {
  getDistributionChannels,
  getSalesChannels,
  rowIsGross1,
  WeclappChannel,
} from "./channels";
import { WeclappArticle } from "./types/article";

export type WeclappArticlePrice = {
  id?: string;
  articleId?: string;

  salesChannelId?: string;
  distributionChannelId?: string;
  channelId?: string;

  salesChannel?: unknown;
  distributionChannel?: unknown;

  price?: string | number;
  salesPrice?: string | number;
  value?: string | number;
  amount?: string | number;
  priceValue?: string | number;

  currencyCode?: string;
  currencyName?: string;

  fromQuantity?: string | number;
  quantity?: string | number;

  [key: string]: unknown;
};

type PriceListResponse = {
  result?: WeclappArticlePrice[];
};

async function getAllArticlePrices(
  maxPages = 100
): Promise<WeclappArticlePrice[]> {
  const all:
    WeclappArticlePrice[] = [];

  for (
    let page = 1;
    page <= maxPages;
    page += 1
  ) {
    let response:
      PriceListResponse;

    try {
      response =
        await weclappRequest<
          PriceListResponse
        >("articlePrice", {
          query: {
            page,
            pageSize: 100,
          },
        });
    } catch {
      return [];
    }

    const batch =
      response.result ?? [];

    all.push(...batch);

    if (batch.length < 100) {
      break;
    }
  }

  return all;
}

function channelIdsForGross1(
  channels: WeclappChannel[]
) {
  return new Set(
    channels
      .filter(rowIsGross1)
      .map((channel) =>
        String(channel.id)
      )
  );
}

function priceChannelId(
  price: WeclappArticlePrice
) {
  const salesChannel =
    price.salesChannel;

  const distributionChannel =
    price.distributionChannel;

  if (
    salesChannel &&
    typeof salesChannel === "object"
  ) {
    const id = (
      salesChannel as Record<
        string,
        unknown
      >
    ).id;

    if (id) {
      return String(id);
    }
  }

  if (
    distributionChannel &&
    typeof distributionChannel ===
      "object"
  ) {
    const id = (
      distributionChannel as Record<
        string,
        unknown
      >
    ).id;

    if (id) {
      return String(id);
    }
  }

  return String(
    price.salesChannelId ??
      price.distributionChannelId ??
      price.channelId ??
      ""
  );
}

function numericPrice(
  price: WeclappArticlePrice
) {
  const value = Number(
    price.price ??
      price.salesPrice ??
      price.value ??
      price.amount ??
      price.priceValue
  );

  return Number.isFinite(value)
    ? value
    : null;
}

export type GrossPrice = {
  value: number;
  currency: string;
  threshold: number;
};

export async function buildGross1PriceMap(
  articles: WeclappArticle[]
): Promise<Map<string, GrossPrice>> {
  const [
    salesChannels,
    distributionChannels,
    separatePrices,
  ] = await Promise.all([
    getSalesChannels(),
    getDistributionChannels(),
    getAllArticlePrices(),
  ]);

  const grossChannelIds =
    channelIdsForGross1([
      ...salesChannels,
      ...distributionChannels,
    ]);

  /*
   * Genau wie in der Lager-PWA:
   * separate articlePrice-Datensätze
   * PLUS eingebettete articlePrices.
   */
  const embeddedPrices =
    articles.flatMap((article) => {
      if (
        !Array.isArray(
          article.articlePrices
        )
      ) {
        return [];
      }

      return article.articlePrices.map(
        (rawPrice) => ({
          ...(rawPrice as Record<
            string,
            unknown
          >),

          articleId:
            (
              rawPrice as Record<
                string,
                unknown
              >
            ).articleId ??
            article.id,
        })
      ) as WeclappArticlePrice[];
    });

  const priceRows = [
    ...separatePrices,
    ...embeddedPrices,
  ];

  const grossPrices = new Map<
    string,
    GrossPrice
  >();

  for (const price of priceRows) {
    const channelId =
      priceChannelId(price);

    const belongsToGross1 =
      grossChannelIds.has(channelId) ||
      rowIsGross1(price);

    if (!belongsToGross1) {
      continue;
    }

    if (!price.articleId) {
      continue;
    }

    const value =
      numericPrice(price);

    if (value === null) {
      continue;
    }

    const threshold = Number(
      price.fromQuantity ??
        price.quantity ??
        1
    );

    const articleId = String(
      price.articleId
    );

    const current =
      grossPrices.get(articleId);

    /*
     * Bevorzugt den Standardpreis
     * ab Menge 1.
     */
    if (
      !current ||
      threshold <= 1
    ) {
      grossPrices.set(articleId, {
        value,

        currency:
          price.currencyCode ??
          price.currencyName ??
          "EUR",

        threshold,
      });
    }
  }

  return grossPrices;
}
