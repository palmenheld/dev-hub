import { weclappRequest } from "@/services/weclapp/client";
import { shopwareRequest } from "./client";

export type IntegrationOption = {
  id: string;
  label: string;
  detail?: string;
};

type OptionRecord = {
  id?: string;
  key?: string | null;
  name?: string | null;
  number?: string | null;
  code?: string | null;
  shortCode?: string | null;
  technicalName?: string | null;
  taxRate?: number;
  currencyCode?: string | null;
  translated?: {
    name?: string | null;
  };
  stateMachine?: {
    technicalName?: string | null;
    translated?: { name?: string | null };
  };
};

function mapOption(record: OptionRecord): IntegrationOption | null {
  const id = record.id || record.key;
  if (!id) return null;
  const label =
    record.translated?.name ||
    record.name ||
    record.number ||
    record.code ||
    record.shortCode ||
    record.technicalName ||
    id;
  const details = [
    record.currencyCode,
    record.taxRate === undefined ? null : `${record.taxRate} %`,
    record.stateMachine?.translated?.name,
    record.stateMachine?.technicalName,
    record.technicalName && record.technicalName !== label
      ? record.technicalName
      : null,
  ].filter((value): value is string => Boolean(value));

  return {
    id,
    label,
    detail: details.length ? details.join(" · ") : undefined,
  };
}

async function shopwareOptions(
  entity: string,
  associations?: Record<string, unknown>
) {
  const response = await shopwareRequest<{ data?: OptionRecord[] }>(
    `search/${entity}`,
    {
      method: "POST",
      body: {
        page: 1,
        limit: 250,
        associations,
      },
    }
  );
  return (response.data ?? [])
    .map(mapOption)
    .filter((option): option is IntegrationOption => Boolean(option));
}

async function weclappOptions(entity: string) {
  const response = await weclappRequest<{ result?: OptionRecord[] }>(entity, {
    query: { page: 1, pageSize: 1000 },
  });
  return (response.result ?? [])
    .map(mapOption)
    .filter((option): option is IntegrationOption => Boolean(option));
}

async function settledOptions(
  label: string,
  promise: Promise<IntegrationOption[]>,
  errors: string[]
) {
  try {
    return await promise;
  } catch (error) {
    errors.push(
      `${label}: ${error instanceof Error ? error.message : "nicht verfügbar"}`
    );
    return [];
  }
}

export async function getIntegrationOptions() {
  const errors: string[] = [];
  const [
    shopwareTaxes,
    shopwareCurrencies,
    shopwareUnits,
    shopwareManufacturers,
    shopwareCustomerGroups,
    shopwareSalesChannels,
    shopwarePaymentMethods,
    shopwareShippingMethods,
    shopwareStates,
    weclappTaxes,
    weclappCurrencies,
    weclappUnits,
    weclappManufacturers,
    weclappSalesChannels,
    weclappPaymentMethods,
    weclappShippingMethods,
    weclappWarehouses,
  ] = await Promise.all([
    settledOptions("Shopware Steuern", shopwareOptions("tax"), errors),
    settledOptions("Shopware Währungen", shopwareOptions("currency"), errors),
    settledOptions("Shopware Einheiten", shopwareOptions("unit"), errors),
    settledOptions(
      "Shopware Hersteller",
      shopwareOptions("product-manufacturer"),
      errors
    ),
    settledOptions(
      "Shopware Kundengruppen",
      shopwareOptions("customer-group"),
      errors
    ),
    settledOptions(
      "Shopware Verkaufskanäle",
      shopwareOptions("sales-channel"),
      errors
    ),
    settledOptions(
      "Shopware Zahlungsarten",
      shopwareOptions("payment-method"),
      errors
    ),
    settledOptions(
      "Shopware Versandarten",
      shopwareOptions("shipping-method"),
      errors
    ),
    settledOptions(
      "Shopware Status",
      shopwareOptions("state-machine-state", { stateMachine: {} }).then(
        (options) =>
          options.filter(
            (option) =>
              option.detail?.split(" · ").includes("order.state") ?? false
          )
      ),
      errors
    ),
    settledOptions("weclapp Steuern", weclappOptions("tax"), errors),
    settledOptions("weclapp Währungen", weclappOptions("currency"), errors),
    settledOptions("weclapp Einheiten", weclappOptions("unit"), errors),
    settledOptions("weclapp Hersteller", weclappOptions("manufacturer"), errors),
    settledOptions(
      "weclapp Verkaufskanäle",
      weclappOptions("salesChannel/activeSalesChannels"),
      errors
    ),
    settledOptions(
      "weclapp Zahlungsarten",
      weclappOptions("paymentMethod"),
      errors
    ),
    settledOptions(
      "weclapp Versandarten",
      weclappOptions("shipmentMethod"),
      errors
    ),
    settledOptions("weclapp Lager", weclappOptions("warehouse"), errors),
  ]);

  return {
    errors,
    shopware: {
      taxes: shopwareTaxes,
      currencies: shopwareCurrencies,
      units: shopwareUnits,
      manufacturers: shopwareManufacturers,
      customerGroups: shopwareCustomerGroups,
      salesChannels: shopwareSalesChannels,
      paymentMethods: shopwarePaymentMethods,
      shippingMethods: shopwareShippingMethods,
      statuses: shopwareStates,
    },
    weclapp: {
      taxes: weclappTaxes,
      currencies: weclappCurrencies,
      units: weclappUnits,
      manufacturers: weclappManufacturers,
      salesChannels: weclappSalesChannels,
      paymentMethods: weclappPaymentMethods,
      shippingMethods: weclappShippingMethods,
      warehouses: weclappWarehouses,
    },
  };
}
