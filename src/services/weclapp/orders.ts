import { ShopwareOrderAddress } from "@/types/shopwareOrders";
import { weclappRequest } from "./client";

type UnknownRecord = Record<string, unknown>;
type ListResponse = { result?: UnknownRecord[] };

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

async function exactList(
  entity: string,
  field: string,
  value: string,
  pageSize = 3
) {
  const normalized = value.trim();
  if (!normalized) return [];
  const response = await weclappRequest<ListResponse>(entity, {
    query: {
      page: 1,
      pageSize,
      [`${field}-eq`]: normalized,
      ...(entity === "party" ? { "customer-eq": true } : {}),
    },
  });
  return response.result ?? [];
}

export type WeclappCustomerMatch = {
  id?: string;
  customerNumber?: string;
  displayName?: string;
  error?: string;
};

export async function findWeclappCustomer(input: {
  email: string;
  customerNumber?: string;
  matchBy: Array<"email" | "customer_number">;
}): Promise<WeclappCustomerMatch> {
  const matches = await Promise.all(
    input.matchBy.map(async (method) => {
      const value = method === "email" ? input.email : input.customerNumber ?? "";
      if (!value) return [];
      return exactList(
        "party",
        method === "email" ? "email" : "customerNumber",
        value
      );
    })
  );
  const byId = new Map<string, UnknownRecord>();
  for (const match of matches.flat()) {
    const id = text(match.id);
    if (id) byId.set(id, match);
  }
  if (byId.size === 0) {
    return {
      error:
        "Kein bestehender weclapp-Kunde passt eindeutig zu E-Mail oder Kundennummer.",
    };
  }
  if (byId.size > 1) {
    return {
      error:
        "E-Mail und Kundennummer führen zu unterschiedlichen weclapp-Kunden.",
    };
  }
  const party = [...byId.values()][0];
  return {
    id: text(party.id),
    customerNumber: text(party.customerNumber) || undefined,
    displayName:
      text(party.company) ||
      [text(party.firstName), text(party.lastName)].filter(Boolean).join(" ") ||
      text(party.customerNumber) ||
      text(party.id),
  };
}

export async function findWeclappArticleByNumber(articleNumber: string) {
  const matches = await exactList("article", "articleNumber", articleNumber);
  if (matches.length !== 1) return null;
  const id = text(matches[0].id);
  return id ? { id, articleNumber: text(matches[0].articleNumber) } : null;
}

export async function findWeclappOrderByShopwareNumber(orderNumber: string) {
  const matches = await exactList(
    "salesOrder",
    "orderNumberAtCustomer",
    orderNumber,
    2
  );
  if (matches.length === 0) return null;
  const order = matches[0];
  const id = text(order.id);
  return id
    ? {
        id,
        orderNumber: text(order.orderNumber) || undefined,
        duplicateCount: matches.length,
      }
    : null;
}

export async function getSalesOrderDefaults(customerId: string) {
  const response = await weclappRequest<{ result?: UnknownRecord }>(
    "salesOrder/defaultValuesForCreate",
    { query: { customerId } }
  );
  if (!response.result || typeof response.result !== "object") {
    throw new Error("weclapp hat keine Standardwerte für den Auftrag geliefert.");
  }
  return response.result;
}

export function toWeclappAddress(address: ShopwareOrderAddress) {
  return {
    company: address.company,
    firstName: address.firstName,
    lastName: address.lastName,
    street1: address.street,
    street2:
      [address.additionalAddressLine1, address.additionalAddressLine2]
        .filter(Boolean)
        .join(", ") || undefined,
    zipcode: address.zipcode,
    city: address.city,
    countryCode: address.countryCode,
    phoneNumber: address.phoneNumber,
  };
}

export async function createWeclappSalesOrder(body: UnknownRecord) {
  return weclappRequest<UnknownRecord>("salesOrder", { method: "POST", body });
}
