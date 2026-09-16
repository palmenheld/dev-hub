import {
  ShopwareEntityOption,
  ShopwarePublishingSettings,
} from "@/types/shopwarePublishing";
import { shopwareRequest } from "./client";

type SearchRecord = {
  id?: string;
  name?: string | null;
  translated?: { name?: string | null };
  taxRate?: number;
  symbol?: string | null;
  isoCode?: string | null;
  isSystemDefault?: boolean;
  active?: boolean;
};

type SearchResponse = {
  data?: SearchRecord[];
};

async function searchOptions(
  entity: "tax" | "currency" | "sales-channel",
  includes: string[],
  sortField = "name"
) {
  const response = await shopwareRequest<SearchResponse>(`search/${entity}`, {
    method: "POST",
    body: {
      page: 1,
      limit: 100,
      "total-count-mode": 0,
      sort: [{ field: sortField, order: "ASC" }],
      includes: { [entity.replace("-", "_")]: includes },
    },
  });
  return response.data ?? [];
}

export async function getShopwarePublishingOptions(): Promise<{
  taxes: ShopwareEntityOption[];
  currencies: ShopwareEntityOption[];
  salesChannels: ShopwareEntityOption[];
  suggested: ShopwarePublishingSettings;
}> {
  const [taxRecords, currencyRecords, salesChannelRecords] = await Promise.all([
    searchOptions("tax", ["id", "name", "taxRate"], "taxRate"),
    searchOptions(
      "currency",
      ["id", "name", "symbol", "isoCode", "isSystemDefault"],
      "name"
    ),
    searchOptions("sales-channel", ["id", "name", "active"], "name"),
  ]);

  const taxes = taxRecords
    .filter((item): item is SearchRecord & { id: string } => Boolean(item.id))
    .map((item) => ({
      id: item.id,
      label: item.name || item.translated?.name || "Steuersatz",
      detail:
        typeof item.taxRate === "number" ? `${item.taxRate} %` : undefined,
    }));
  const currencies = currencyRecords
    .filter((item): item is SearchRecord & { id: string } => Boolean(item.id))
    .map((item) => ({
      id: item.id,
      label: item.name || item.isoCode || "Währung",
      detail: [item.isoCode, item.symbol].filter(Boolean).join(" · "),
    }));
  const salesChannels = salesChannelRecords
    .filter((item): item is SearchRecord & { id: string } => Boolean(item.id))
    .map((item) => ({
      id: item.id,
      label: item.name || item.translated?.name || "Verkaufskanal",
      detail: item.active === false ? "inaktiv" : "aktiv",
    }));

  return {
    taxes,
    currencies,
    salesChannels,
    suggested: {
      taxId: taxes.length === 1 ? taxes[0].id : "",
      currencyId:
        currencyRecords.find((item) => item.isSystemDefault)?.id ||
        (currencies.length === 1 ? currencies[0].id : ""),
      salesChannelId:
        salesChannels.length === 1 ? salesChannels[0].id : "",
    },
  };
}
