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

async function getAllArticlePrices(pageSize = 1000) {
  const result: WeclappArticlePrice[] = [];
  for (let page = 1; page <= 100; page += 1) {
    const batch = await getArticlePrices(page, pageSize);
    result.push(...batch);
    if (batch.length < pageSize) return result;
  }
  throw new Error(
    "Die Weclapp-Preisliste ist größer als 100.000 Einträge und wurde aus Sicherheitsgründen nicht unvollständig verwendet."
  );
}

function dateInMilliseconds(value: number | undefined) {
  if (!value) return undefined;
  return value < 10_000_000_000 ? value * 1000 : value;
}

function isCurrentlyEffective(item: WeclappArticlePrice, now = Date.now()) {
  const start = dateInMilliseconds(Number(item.startDate) || undefined);
  const end = dateInMilliseconds(Number(item.endDate) || undefined);
  return (!start || start <= now) && (!end || end >= now);
}

function newestFirst(left: WeclappArticlePrice, right: WeclappArticlePrice) {
  return (dateInMilliseconds(Number(right.startDate) || undefined) || 0) -
    (dateInMilliseconds(Number(left.startDate) || undefined) || 0);
}

export async function getPriceMap(
  salesChannel = "GROSS1"
): Promise<Map<string, number>> {
  const prices = (await getAllArticlePrices())
    .filter((item) => isCurrentlyEffective(item))
    .sort(newestFirst);
  const wantedChannel = salesChannel.trim().toUpperCase();
  const result = new Map<string, number>();

  for (const item of prices) {
    if (
      !item.articleId ||
      String(item.salesChannel ?? "").toUpperCase() !== wantedChannel ||
      result.has(item.articleId)
    ) {
      continue;
    }
    const value = Number(item.price);
    if (Number.isFinite(value)) result.set(item.articleId, value);
  }

  return result;
}

export async function getGross1PriceMap() {
  return getPriceMap("GROSS1");
}

export type ResolvedShopwarePrice = {
  price: number;
  salesChannel: string;
  fallback: boolean;
};

function isGrossSalesChannel(value: unknown) {
  const channel = String(value ?? "").trim().toUpperCase();
  return channel.startsWith("GROSS") || channel.includes("BRUTTO");
}

export async function getShopwarePriceMap(
  preferredChannel = "GROSS1",
  currencyId = process.env.WECLAPP_SHOPWARE_CURRENCY_ID?.trim()
): Promise<Map<string, ResolvedShopwarePrice>> {
  const activePrices = (await getAllArticlePrices()).filter((item) =>
    isCurrentlyEffective(item)
  );
  if (!currencyId) {
    const currencies = new Set(
      activePrices
        .map((item) => String(item.currencyId ?? "").trim())
        .filter(Boolean)
    );
    if (currencies.size > 1) {
      throw new Error(
        "Weclapp enthält mehrere Preiswährungen. Bitte die eBay-Währung über WECLAPP_EBAY_CURRENCY_ID eindeutig zuordnen."
      );
    }
  }
  const prices = activePrices
    .filter(
      (item) =>
        !currencyId || String(item.currencyId ?? "").trim() === currencyId
    )
    .sort(newestFirst);
  const preferred = preferredChannel.trim().toUpperCase();
  const result = new Map<string, ResolvedShopwarePrice>();

  for (const item of prices) {
    const articleId = String(item.articleId ?? "").trim();
    const salesChannel = String(item.salesChannel ?? "").trim();
    const price = Number(item.price);
    if (
      !articleId ||
      salesChannel.toUpperCase() !== preferred ||
      !Number.isFinite(price) ||
      price <= 0 ||
      result.has(articleId)
    ) {
      continue;
    }
    result.set(articleId, { price, salesChannel, fallback: false });
  }

  for (const item of prices) {
    const articleId = String(item.articleId ?? "").trim();
    const salesChannel = String(item.salesChannel ?? "").trim();
    const price = Number(item.price);
    if (
      !articleId ||
      result.has(articleId) ||
      !isGrossSalesChannel(salesChannel) ||
      !Number.isFinite(price) ||
      price <= 0
    ) {
      continue;
    }
    result.set(articleId, { price, salesChannel, fallback: true });
  }

  return result;
}

function gross1PriceFromArticle(article: Record<string, unknown>) {
  if (!Array.isArray(article.articlePrices)) return undefined;
  const price = article.articlePrices.find(
    (entry) =>
      typeof entry === "object" &&
      entry !== null &&
      String((entry as Record<string, unknown>).salesChannel ?? "").toUpperCase() ===
        "GROSS1"
  ) as Record<string, unknown> | undefined;
  const value = Number(price?.price);
  return Number.isFinite(value) ? value : undefined;
}

export async function getGross1Price(articleId: string) {
  const article = await getArticle(articleId);
  const price = gross1PriceFromArticle(article);
  if (price === undefined) {
    throw new Error("Für diesen Artikel wurde kein GROSS1-Preis gefunden.");
  }
  return { article, price };
}

export async function updateGross1Price(
  articleId: string,
  newPrice: number,
  expectedCurrentPrice?: number
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

  const currentPrice = gross1PriceFromArticle(article);
  if (currentPrice === undefined) {
    throw new Error("Für diesen Artikel wurde kein GROSS1-Preis gefunden.");
  }
  if (
    expectedCurrentPrice !== undefined &&
    (!Number.isFinite(expectedCurrentPrice) ||
      Math.abs(currentPrice - expectedCurrentPrice) >= 0.005)
  ) {
    throw new Error(
      "Der GROSS1-Preis wurde seit der Vorschau geändert. Bitte eine neue Vorschau erstellen."
    );
  }

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
