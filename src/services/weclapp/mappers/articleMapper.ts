import { Article } from "@/types/article";
import { WeclappArticle } from "../types/article";

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function mapWeclappArticle(
  item: WeclappArticle
): Article {
  return {
    id: item.id,

    sku:
      stringValue(item.articleNumber) ||
      item.id,

    name:
      stringValue(item.name) ||
      "Ohne Namen",

    subtitle:
      stringValue(item.description),

    stock: 0,

    basePrice: 0,

    active:
  typeof item.active === "boolean"
    ? item.active
    : true,

    channels: {
      shop: "missing",
      ebay: "missing",
      kleinanzeigen: "missing",


	
    },
  };
}
