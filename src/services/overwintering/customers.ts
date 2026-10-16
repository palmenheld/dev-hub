import { weclappRequest } from "@/services/weclapp/client";
import type {
  OverwinteringAddress,
  WeclappCustomerSearchResult,
} from "@/types/overwintering";

type UnknownRecord = Record<string, unknown>;
type ListResponse = { result?: UnknownRecord[] };

function record(value: unknown): UnknownRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : {};
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function addressFromParty(party: UnknownRecord): OverwinteringAddress {
  const addresses = Array.isArray(party.addresses)
    ? party.addresses.map(record)
    : [];
  const deliveryAddress = record(party.deliveryAddress);
  const invoiceAddress = record(party.invoiceAddress);
  const address =
    addresses.find((item) => item.primaryAddress === true) ??
    addresses.find((item) => item.deliveryAddress === true) ??
    addresses[0] ??
    (Object.keys(deliveryAddress).length ? deliveryAddress : invoiceAddress);
  return {
    street: [text(address.street1 || address.street), text(address.street2)]
      .filter(Boolean)
      .join(", "),
    zipcode: text(address.zipcode || address.postalCode),
    city: text(address.city),
    country: text(address.countryCode || address.country) || "DE",
  };
}

function customerFromParty(party: UnknownRecord): WeclappCustomerSearchResult | null {
  const id = text(party.id);
  if (!id) return null;
  return {
    id,
    customerNumber: text(party.customerNumber),
    displayName:
      text(party.company) ||
      [text(party.firstName), text(party.lastName)].filter(Boolean).join(" ") ||
      text(party.customerNumber) ||
      id,
    address: addressFromParty(party),
  };
}

async function searchField(field: string, query: string) {
  const response = await weclappRequest<ListResponse>("party", {
    query: {
      page: 1,
      pageSize: 25,
      "customer-eq": true,
      [`${field}-like`]: query,
    },
  });
  return response.result ?? [];
}

export async function searchWeclappCustomers(query: string) {
  const value = query.trim().slice(0, 120);
  if (value.length < 2) {
    throw new Error("Bitte mindestens zwei Zeichen für die Kundensuche eingeben.");
  }
  const fields = ["customerNumber", "company", "firstName", "lastName"];
  const searches = await Promise.allSettled(
    fields.map((field) => searchField(field, value))
  );
  const successful = searches.filter(
    (result): result is PromiseFulfilledResult<UnknownRecord[]> =>
      result.status === "fulfilled"
  );
  if (!successful.length) {
    const failure = searches.find(
      (result): result is PromiseRejectedResult => result.status === "rejected"
    );
    throw failure?.reason instanceof Error
      ? failure.reason
      : new Error("Die Weclapp-Kundensuche ist fehlgeschlagen.");
  }
  const customers = new Map<string, WeclappCustomerSearchResult>();
  for (const party of successful.flatMap((result) => result.value)) {
    const customer = customerFromParty(party);
    if (customer) customers.set(customer.id, customer);
  }
  return [...customers.values()]
    .sort((a, b) => a.displayName.localeCompare(b.displayName, "de"))
    .slice(0, 30);
}
