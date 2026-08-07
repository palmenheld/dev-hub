import { Article } from "@/types/article";
import { WeclappArticle } from "../types/article";

export function mapWeclappArticle(item: WeclappArticle): Article {
  return {
    id: item.id,
    sku: item.articleNumber ?? item.id,
    name: item.name ?? "Ohne Namen",
    subtitle:
      typeof item.description === "string"
        ? item.description
        : "",
    stock: 0,
    basePrice: 0,
    channels: {
      shop: "missing",
      ebay: "missing",
      kleinanzeigen: "missing",
    },
  };
}
