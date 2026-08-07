import { Article } from "@/types/article";

export const articles: Article[] = [
  {
    id: "trachycarpus-fortunei",
    sku: "PH-10001",
    name: "Trachycarpus fortunei",
    subtitle: "Hanfpalme - Lieferhoehe 100-120 cm",
    stock: 8,
    basePrice: 59.99,
    active: true,
    channels: {
      shop: "online",
      ebay: "draft",
      kleinanzeigen: "online",
    },
  },
  {
    id: "yucca-rostrata",
    sku: "PH-10002",
    name: "Yucca rostrata",
    subtitle: "Blaue Palmlilie - Lieferhoehe 80-100 cm",
    stock: 2,
    basePrice: 249,
    active: true,
    channels: {
      shop: "online",
      ebay: "online",
      kleinanzeigen: "missing",
    },
  },
  {
    id: "citrus-limon",
    sku: "PH-10003",
    name: "Citrus limon",
    subtitle: "Zitronenbaum - Lieferhoehe 80-100 cm",
    stock: 5,
    basePrice: 44.99,
    active: true,
    channels: {
      shop: "draft",
      ebay: "missing",
      kleinanzeigen: "draft",
    },
  },
];
