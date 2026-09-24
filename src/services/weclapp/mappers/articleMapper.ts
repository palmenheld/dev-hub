import { Article } from "@/types/article";
import { WeclappArticle } from "../types/article";
import { GrossPrice } from "../prices";
import { ArticleInventory } from "../stock";

function stringValue(
  value: unknown
): string {
  return typeof value === "string"
    ? value
    : "";
}

export function mapWeclappArticle(
  item: WeclappArticle,
  grossPrice:
    | GrossPrice
    | undefined,
  inventory:
    | ArticleInventory
    | undefined
): Article {
  const safeInventory =
    inventory ?? {
      quantity: 0,
      reserved: 0,
      places: new Map(),
    };

  return {
    id: item.id,

    sku:
      stringValue(
        item.articleNumber
      ) || item.id,

    name:
      stringValue(item.name) ||
      stringValue(
        item.shortDescription1
      ) ||
      "Unbenannter Artikel",

    subtitle:
      stringValue(
        item.shortDescription1
      ) ||
      stringValue(
        item.description
      ),

    active:
      item.active !== false,

    stock:
      safeInventory.quantity,

    reservedStock:
      safeInventory.reserved,

    basePrice:
      grossPrice?.value ?? 0,

    currency:
      grossPrice?.currency ??
      "EUR",

    barcode:
      stringValue(item.ean) ||
      stringValue(
        item.manufacturerPartNumber
      ),

    warehouseStocks: [
      ...safeInventory.places.entries(),
    ].map(([name, place]) => ({
      name,
      quantity: place.quantity,
      reservedQuantity:
        place.reserved,

      storagePlaceId:
        place.storagePlaceId,
    })),

    channels: {
      shop: "missing",
      ebay: "missing",
      kleinanzeigen: "missing",
    },
  };
}
