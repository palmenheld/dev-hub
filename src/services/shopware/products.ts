import { ShopwareProduct, ShopwareProductPage } from "@/types/shopware";
import { shopwareRequest } from "./client";

type ShopwareProductRecord = {
  id?: string;
  productNumber?: string;
  name?: string | null;
  translated?: { name?: string | null };
  active?: boolean;
  stock?: number;
  availableStock?: number;
  updatedAt?: string | null;
  cover?: { media?: { url?: string | null } | null } | null;
};

type ShopwareProductSearchResponse = {
  data?: ShopwareProductRecord[];
  total?: number;
  meta?: { total?: number };
};

function mapProduct(product: ShopwareProductRecord): ShopwareProduct | null {
  if (!product.id) return null;

  return {
    id: product.id,
    productNumber: product.productNumber || "Ohne Artikelnummer",
    name: product.translated?.name || product.name || "Unbenanntes Produkt",
    active: Boolean(product.active),
    stock: Number(product.stock ?? 0),
    availableStock:
      product.availableStock === undefined
        ? undefined
        : Number(product.availableStock),
    imageUrl: product.cover?.media?.url || undefined,
    updatedAt: product.updatedAt || undefined,
  };
}

export async function getShopwareProducts({
  page = 1,
  limit = 50,
  query = "",
}: {
  page?: number;
  limit?: number;
  query?: string;
} = {}): Promise<ShopwareProductPage> {
  const safePage = Math.max(1, Math.floor(page));
  const safeLimit = Math.min(100, Math.max(1, Math.floor(limit)));
  const normalizedQuery = query.trim();
  const filter = normalizedQuery
    ? [
        {
          type: "multi",
          operator: "or",
          queries: [
            { type: "contains", field: "productNumber", value: normalizedQuery },
            { type: "contains", field: "name", value: normalizedQuery },
          ],
        },
      ]
    : undefined;

  const response = await shopwareRequest<ShopwareProductSearchResponse>(
    "search/product",
    {
      method: "POST",
      body: {
        page: safePage,
        limit: safeLimit,
        "total-count-mode": 1,
        filter,
        sort: [{ field: "updatedAt", order: "DESC", naturalSorting: false }],
        associations: {
          cover: { associations: { media: {} } },
        },
        includes: {
          product: [
            "id",
            "productNumber",
            "name",
            "translated",
            "active",
            "stock",
            "availableStock",
            "updatedAt",
            "cover",
          ],
          product_media: ["media"],
          media: ["url"],
        },
      },
    }
  );

  return {
    products: (response.data ?? [])
      .map(mapProduct)
      .filter((product): product is ShopwareProduct => product !== null),
    total: Number(response.total ?? response.meta?.total ?? 0),
    page: safePage,
    limit: safeLimit,
  };
}

export async function testShopwareConnection() {
  const result = await getShopwareProducts({ page: 1, limit: 1 });

  return { productCount: result.total };
}

export async function getExistingProductNumbers(productNumbers: string[]) {
  const uniqueNumbers = [...new Set(productNumbers.map((value) => value.trim()))]
    .filter(Boolean)
    .slice(0, 100);

  if (uniqueNumbers.length === 0) return new Set<string>();

  const response = await shopwareRequest<ShopwareProductSearchResponse>(
    "search/product",
    {
      method: "POST",
      body: {
        page: 1,
        limit: uniqueNumbers.length,
        "total-count-mode": 0,
        filter: [
          {
            type: "multi",
            operator: "or",
            queries: uniqueNumbers.map((productNumber) => ({
              type: "equals",
              field: "productNumber",
              value: productNumber,
            })),
          },
        ],
        includes: {
          product: ["productNumber"],
        },
      },
    }
  );

  return new Set(
    (response.data ?? [])
      .map((product) => product.productNumber?.trim())
      .filter((value): value is string => Boolean(value))
  );
}

export async function findShopwareProductByNumber(productNumber: string) {
  const existing = await getExistingProductNumbers([productNumber]);
  return existing.has(productNumber);
}
export type ShopwareSyncProduct = {
  id: string;
  productNumber: string;
  name: string;
  stock: number;
  taxId?: string;
  price: Array<{
    currencyId: string;
    gross: number;
    net: number;
    linked: boolean;
  }>;
};

export async function getShopwareSyncProductByNumber(
  productNumber: string
): Promise<ShopwareSyncProduct | null> {
  const normalized = productNumber.trim();
  if (!normalized || normalized.length > 100) {
    throw new Error("Die Artikelnummer ist ungültig.");
  }

  const response = await shopwareRequest<{
    data?: Array<{
      id?: string;
      productNumber?: string;
      name?: string | null;
      translated?: { name?: string | null };
      stock?: number;
      taxId?: string;
      price?: Array<{
        currencyId?: string;
        gross?: number;
        net?: number;
        linked?: boolean;
      }>;
    }>;
  }>("search/product", {
    method: "POST",
    body: {
      page: 1,
      limit: 1,
      filter: [
        {
          type: "equals",
          field: "productNumber",
          value: normalized,
        },
      ],
      includes: {
        product: [
          "id",
          "productNumber",
          "name",
          "translated",
          "stock",
          "taxId",
          "price",
        ],
      },
    },
  });

  const product = response.data?.[0];
  if (!product?.id || product.productNumber !== normalized) return null;

  return {
    id: product.id,
    productNumber: product.productNumber,
    name: product.translated?.name || product.name || "",
    stock: Number(product.stock ?? 0),
    taxId: product.taxId,
    price: (product.price ?? [])
      .filter(
        (entry) =>
          typeof entry.currencyId === "string" &&
          Number.isFinite(Number(entry.gross)) &&
          Number.isFinite(Number(entry.net))
      )
      .map((entry) => ({
        currencyId: String(entry.currencyId),
        gross: Number(entry.gross),
        net: Number(entry.net),
        linked: Boolean(entry.linked),
      })),
  };
}
