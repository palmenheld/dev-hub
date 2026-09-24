import { weclappRequest } from "./client";

type WeclappRow = {
  id?: string;
  name?: string;
  description?: string;

  [key: string]: unknown;
};

type WeclappListResponse<T> = {
  result?: T[];
};

export type ArticleInventory = {
  quantity: number;
  reserved: number;

  places: Map<
    string,
    {
      quantity: number;
      reserved: number;
      storagePlaceId: string;
    }
  >;
};

async function getAll<T>(
  resource: string,
  maxPages = 100
): Promise<T[]> {
  const all: T[] = [];

  for (
    let page = 1;
    page <= maxPages;
    page += 1
  ) {
    const response =
      await weclappRequest<
        WeclappListResponse<T>
      >(resource, {
        query: {
          page,
          pageSize: 100,
        },
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

async function getOptional<T>(
  resource: string,
  maxPages = 100
): Promise<T[]> {
  try {
    return await getAll<T>(
      resource,
      maxPages
    );
  } catch {
    return [];
  }
}

export async function buildStockMap(): Promise<
  Map<string, ArticleInventory>
> {
  const [
    stockRows,
    warehouses,
    storagePlaces,
    storageLocations,
  ] = await Promise.all([
    getAll<WeclappRow>(
      "warehouseStock",
      100
    ),

    getOptional<WeclappRow>(
      "warehouse",
      20
    ),

    getOptional<WeclappRow>(
      "storagePlace",
      100
    ),

    getOptional<WeclappRow>(
      "storageLocation",
      100
    ),
  ]);

  const warehouseNames =
    new Map(
      warehouses.map((warehouse) => [
        String(warehouse.id),

        String(
          warehouse.name ??
            warehouse.description ??
            warehouse.warehouseNumber ??
            warehouse.id
        ),
      ])
    );

  const storageLocationNames =
    new Map(
      [
        ...storagePlaces,
        ...storageLocations,
      ].map((location) => [
        String(location.id),

        String(
          location.name ??
            location.description ??
            location.storagePlaceNumber ??
            location.storageLocationNumber ??
            location.id
        ),
      ])
    );

  const stocks = new Map<
    string,
    ArticleInventory
  >();

  for (const stock of stockRows) {
    const articleId =
      stock.articleId;

    if (!articleId) {
      continue;
    }

    const id = String(articleId);

    const current =
      stocks.get(id) ?? {
        quantity: 0,
        reserved: 0,
        places: new Map(),
      };

    const quantity = Number(
      stock.quantity ?? 0
    );

    const reserved = Number(
      stock.reservedQuantity ?? 0
    );

    current.quantity +=
      Number.isFinite(quantity)
        ? quantity
        : 0;

    current.reserved +=
      Number.isFinite(reserved)
        ? reserved
        : 0;

    const warehouseId = String(
      stock.warehouseId ?? ""
    );

    const warehouseName =
      String(
        stock.warehouseName ??
          warehouseNames.get(
            warehouseId
          ) ??
          ""
      );

    const storagePlaceId =
      String(
        stock.storagePlaceId ??
          stock.warehouseLevelId ??
          stock.warehouseStorageLocationId ??
          stock.storageLocationId ??
          ""
      );

    const locationName =
      String(
        stock.storagePlaceName ??
          stock.warehouseLevelName ??
          stock.warehouseStorageLocationName ??
          stock.storageLocationName ??
          storageLocationNames.get(
            storagePlaceId
          ) ??
          ""
      );

    const placeName =
      [
        warehouseName,
        locationName,
      ]
        .filter(Boolean)
        .join(" · ") || "Lager";

    const existing =
      current.places.get(
        placeName
      ) ?? {
        quantity: 0,
        reserved: 0,
        storagePlaceId,
      };

    existing.quantity +=
      Number.isFinite(quantity)
        ? quantity
        : 0;

    existing.reserved +=
      Number.isFinite(reserved)
        ? reserved
        : 0;

    current.places.set(
      placeName,
      existing
    );

    stocks.set(id, current);
  }

  return stocks;
}
