import { Article } from "@/types/article";

export function mapWeclappArticle(item: any): Article {

    return {

        id: item.id,

        sku: item.articleNumber,

        name: item.name,

        subtitle: item.description ?? "",

        stock: 0,

        basePrice: 0,

        channels: {

            shop: "missing",

            ebay: "missing",

            kleinanzeigen: "missing"

        }

    };

}
