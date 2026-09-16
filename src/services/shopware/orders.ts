import { createHash } from "node:crypto";
import {
  ShopwareOrderAddress,
  ShopwareOrderCandidate,
  ShopwareOrderLine,
} from "@/types/shopwareOrders";
import { shopwareRequest } from "./client";

type UnknownRecord = Record<string, unknown>;

function record(value: unknown): UnknownRecord {
  return typeof value === "object" && value !== null
    ? (value as UnknownRecord)
    : {};
}

function records(value: unknown): UnknownRecord[] {
  if (Array.isArray(value)) return value.map(record);
  const data = record(value).data;
  return Array.isArray(data) ? data.map(record) : [];
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function number(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function translatedName(value: unknown) {
  const entity = record(value);
  return (
    text(record(entity.translated).name) ||
    text(entity.name) ||
    text(entity.technicalName)
  );
}

function mapAddress(value: unknown): ShopwareOrderAddress | null {
  const address = record(value);
  const country = record(address.country);
  const firstName = text(address.firstName);
  const lastName = text(address.lastName);
  const street = text(address.street);
  const zipcode = text(address.zipcode);
  const city = text(address.city);
  const countryCode = text(country.iso) || text(address.countryCode);
  if (!firstName || !lastName || !street || !zipcode || !city || !countryCode) {
    return null;
  }
  return {
    company: text(address.company) || undefined,
    firstName,
    lastName,
    street,
    additionalAddressLine1: text(address.additionalAddressLine1) || undefined,
    additionalAddressLine2: text(address.additionalAddressLine2) || undefined,
    zipcode,
    city,
    countryCode,
    phoneNumber: text(address.phoneNumber) || undefined,
  };
}

function mapLine(value: unknown): ShopwareOrderLine | null {
  const line = record(value);
  const product = record(line.product);
  const payload = record(line.payload);
  const id = text(line.id);
  const label = text(line.label);
  if (!id || !label) return null;
  return {
    id,
    productNumber:
      text(product.productNumber) || text(payload.productNumber) || undefined,
    label,
    quantity: number(line.quantity),
    unitPrice: number(line.unitPrice),
    totalPrice: number(line.totalPrice),
    type: text(line.type) || "unknown",
  };
}

function fingerprint(order: Omit<ShopwareOrderCandidate, "fingerprint">) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        id: order.id,
        updatedAt: order.updatedAt,
        amountTotal: order.amountTotal,
        shippingTotal: order.shippingTotal,
        stateId: order.stateId,
        customer: order.customer,
        billingAddress: order.billingAddress,
        shippingAddress: order.shippingAddress,
        paymentMethodId: order.paymentMethod?.id,
        shippingMethodId: order.shippingMethod?.id,
        lines: order.lines,
      })
    )
    .digest("hex");
}

function mapOrder(value: unknown): ShopwareOrderCandidate | null {
  const order = record(value);
  const orderCustomer = record(order.orderCustomer);
  const customer = record(orderCustomer.customer);
  const state = record(order.stateMachineState);
  const currency = record(order.currency);
  const deliveries = records(order.deliveries);
  const delivery = deliveries[0] ?? {};
  const transactions = records(order.transactions).sort((left, right) =>
    text(right.createdAt).localeCompare(text(left.createdAt))
  );
  const transaction = transactions[0] ?? {};
  const paymentMethod = record(transaction.paymentMethod);
  const shippingMethod = record(delivery.shippingMethod);
  const shippingCosts = record(delivery.shippingCosts);
  const billingAddress = mapAddress(order.billingAddress);
  const shippingAddress =
    mapAddress(delivery.shippingOrderAddress) || billingAddress;
  const lines = records(order.lineItems)
    .map(mapLine)
    .filter((line): line is ShopwareOrderLine => Boolean(line));

  const id = text(order.id);
  const orderNumber = text(order.orderNumber);
  const orderDateTime = text(order.orderDateTime);
  const email = text(orderCustomer.email);
  const firstName = text(orderCustomer.firstName);
  const lastName = text(orderCustomer.lastName);
  const currencyId = text(order.currencyId) || text(currency.id);
  const currencyCode = text(currency.isoCode) || text(currency.shortName);
  const salesChannelId = text(order.salesChannelId);
  const stateId = text(order.stateId) || text(order.stateMachineStateId) || text(state.id);

  if (
    !id ||
    !orderNumber ||
    !orderDateTime ||
    !email ||
    !firstName ||
    !lastName ||
    !billingAddress ||
    !shippingAddress ||
    !currencyId ||
    !salesChannelId ||
    !stateId
  ) {
    return null;
  }

  const mapped: Omit<ShopwareOrderCandidate, "fingerprint"> = {
    id,
    orderNumber,
    orderDateTime,
    updatedAt: text(order.updatedAt) || undefined,
    amountTotal: number(order.amountTotal),
    shippingTotal: number(shippingCosts.totalPrice),
    currencyId,
    currencyCode,
    salesChannelId,
    customerGroupId: text(customer.groupId) || undefined,
    stateId,
    stateName: translatedName(state) || stateId,
    customer: {
      customerNumber: text(orderCustomer.customerNumber) || undefined,
      email,
      firstName,
      lastName,
      company: text(orderCustomer.company) || undefined,
    },
    billingAddress,
    shippingAddress,
    paymentMethod:
      text(paymentMethod.id)
        ? { id: text(paymentMethod.id), name: translatedName(paymentMethod) || text(paymentMethod.id) }
        : undefined,
    shippingMethod:
      text(shippingMethod.id)
        ? { id: text(shippingMethod.id), name: translatedName(shippingMethod) || text(shippingMethod.id) }
        : undefined,
    lines,
  };
  return { ...mapped, fingerprint: fingerprint(mapped) };
}

const ORDER_ASSOCIATIONS = {
  stateMachineState: {},
  currency: {},
  orderCustomer: { associations: { customer: {} } },
  billingAddress: { associations: { country: {} } },
  lineItems: { associations: { product: {} } },
  transactions: {
    associations: { paymentMethod: {}, stateMachineState: {} },
  },
  deliveries: {
    associations: {
      shippingMethod: {},
      stateMachineState: {},
      shippingOrderAddress: { associations: { country: {} } },
    },
  },
};

export async function getShopwareOrdersForImport(options: {
  safetyDays: number;
  statusIds: string[];
  limit: number;
}) {
  if (!options.statusIds.length) {
    throw new Error("Bitte zuerst mindestens einen Shopware-Bestellstatus auswählen und speichern.");
  }
  const since = new Date(
    Date.now() - Math.max(2, options.safetyDays) * 24 * 60 * 60 * 1000
  ).toISOString();
  const response = await shopwareRequest<{ data?: unknown[] }>("search/order", {
    method: "POST",
    body: {
      page: 1,
      limit: Math.min(100, Math.max(1, options.limit)),
      "total-count-mode": 0,
      filter: [
        { type: "range", field: "orderDateTime", parameters: { gte: since } },
        {
          type: "multi",
          operator: "or",
          queries: options.statusIds.map((id) => ({
            type: "equals",
            field: "stateId",
            value: id,
          })),
        },
      ],
      sort: [{ field: "orderDateTime", order: "DESC", naturalSorting: false }],
      associations: ORDER_ASSOCIATIONS,
    },
  });
  return (response.data ?? [])
    .map(mapOrder)
    .filter((order): order is ShopwareOrderCandidate => Boolean(order));
}

export async function getShopwareOrderById(id: string) {
  if (!/^[0-9a-f]{32}$/i.test(id)) throw new Error("Ungültige Shopware-Bestell-ID.");
  const response = await shopwareRequest<{ data?: unknown[] }>("search/order", {
    method: "POST",
    body: {
      page: 1,
      limit: 1,
      filter: [{ type: "equals", field: "id", value: id }],
      associations: ORDER_ASSOCIATIONS,
    },
  });
  return mapOrder(response.data?.[0]);
}
