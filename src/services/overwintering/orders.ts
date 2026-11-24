import type {
  OverwinteringOrderCandidate,
  OverwinteringRecord,
  OverwinteringWeclappOrder,
} from "@/types/overwintering";
import {
  getWeclappConfiguration,
  WeclappHttpError,
  weclappRequest,
} from "@/services/weclapp/client";
import {
  createWeclappSalesOrder,
  findWeclappArticleByNumber,
  findWeclappOrderByCustomerReference,
  getSalesOrderDefaults,
} from "@/services/weclapp/orders";
import {
  getOverwinteringRecord,
  updateOverwinteringOrder,
} from "./store";

const OVERWINTERING_ARTICLE_NUMBER = "102000012";
const activeCreations = new Set<string>();

type UnknownRecord = Record<string, unknown>;
type ListResponse = { result?: UnknownRecord[] };

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function unwrap(value: UnknownRecord) {
  return value.result &&
    typeof value.result === "object" &&
    !Array.isArray(value.result)
    ? (value.result as UnknownRecord)
    : value;
}

function decimal(value: number) {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(
      "Bitte für jede Pflanze einen gültigen Preis ab 0,00 € eingeben."
    );
  }
  return value.toFixed(5);
}

function cleanDefaults(defaults: UnknownRecord) {
  const result = { ...defaults };
  for (const key of [
    "id",
    "version",
    "createdDate",
    "lastModifiedDate",
    "cost",
    "grossAmount",
    "grossAmountInCompanyCurrency",
    "netAmount",
    "netAmountInCompanyCurrency",
    "paid",
    "invoiced",
    "shipped",
    "servicesFinished",
    "statusHistory",
  ]) {
    delete result[key];
  }
  return result;
}

function referenceFor(recordId: string) {
  return `PH-UEB-${recordId}`;
}

function weclappViewUrl(entity: "salesOrder" | "salesInvoice", id: string) {
  const { tenantBaseUrl } = getWeclappConfiguration();
  return `${tenantBaseUrl}/webapp/view/${entity}/${encodeURIComponent(id)}`;
}

function dateFrom(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    const milliseconds = value < 10_000_000_000 ? value * 1_000 : value;
    return new Date(milliseconds).toISOString();
  }
  const valueText = text(value);
  if (!valueText) return undefined;
  const numeric = Number(valueText);
  if (Number.isFinite(numeric)) {
    const milliseconds = numeric < 10_000_000_000 ? numeric * 1_000 : numeric;
    return new Date(milliseconds).toISOString();
  }
  const parsed = Date.parse(valueText);
  return Number.isNaN(parsed) ? undefined : new Date(parsed).toISOString();
}

function parsePrices(record: OverwinteringRecord, input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("Bitte für jede Pflanze einen Preis eingeben.");
  }
  const values = input as Record<string, unknown>;
  return record.plants.map((plant) => {
    const raw = values[plant.id];
    const normalized =
      typeof raw === "number"
        ? raw
        : Number(String(raw ?? "").trim().replace(",", "."));
    if (raw === "" || raw === null || raw === undefined) {
      throw new Error(`Bitte den Preis für „${plant.name}“ eingeben.`);
    }
    return { plant, price: normalized };
  });
}

async function persistCreatedOrder(
  record: OverwinteringRecord,
  order: UnknownRecord,
  reference: string
) {
  const id = text(order.id);
  if (!id) {
    throw new Error("weclapp hat nach dem Anlegen keine Auftrags-ID geliefert.");
  }
  const now = new Date().toISOString();
  const state: OverwinteringWeclappOrder = {
    id,
    orderNumber: text(order.orderNumber) || undefined,
    url: weclappViewUrl("salesOrder", id),
    reference,
    createdAt: now,
    checkedAt: now,
    status: text(order.status) || undefined,
    invoiceStatus: text(order.invoiceStatus) || undefined,
    invoiceCreated: false,
  };
  const saved = await updateOverwinteringOrder(record.id, state);
  if (!saved) {
    throw new Error("Die Überwinterungsakte wurde nicht mehr gefunden.");
  }
  return saved;
}

function belongsToCustomer(order: UnknownRecord, customerId: string) {
  const nestedCustomer =
    order.customer &&
    typeof order.customer === "object" &&
    !Array.isArray(order.customer)
      ? (order.customer as UnknownRecord)
      : undefined;
  return (
    text(order.customerId) === customerId ||
    text(order.customerPartyId) === customerId ||
    text(nestedCustomer?.id) === customerId
  );
}

export async function listOverwinteringCustomerOrders(recordId: string) {
  const record = await getOverwinteringRecord(recordId);
  if (!record) throw new Error("Die Überwinterungsakte wurde nicht gefunden.");

  const article = await findWeclappArticleByNumber(
    OVERWINTERING_ARTICLE_NUMBER
  ).catch(() => null);
  const rows: UnknownRecord[] = [];
  const pageSize = 100;
  let includeOrderItems = true;
  for (let page = 1; page <= 10; page += 1) {
    let response: ListResponse;
    try {
      response = await weclappRequest<ListResponse>("salesOrder", {
        query: {
          page,
          pageSize,
          "customerId-eq": record.customer.id,
          ...(includeOrderItems
            ? { additionalProperties: "orderItems" }
            : {}),
        },
      });
    } catch (error) {
      if (!(error instanceof WeclappHttpError) || error.status !== 400) {
        throw error;
      }
      includeOrderItems = false;
      response = await weclappRequest<ListResponse>("salesOrder", {
        query: {
          page,
          pageSize,
          "customerId-eq": record.customer.id,
        },
      });
    }
    const pageRows = response.result ?? [];
    rows.push(...pageRows);
    if (pageRows.length < pageSize) break;
  }

  return rows
    .filter((order) => text(order.id))
    .map((order): OverwinteringOrderCandidate => {
      const id = text(order.id);
      const customerReference = text(order.orderNumberAtCustomer);
      const note = text(order.note).toLocaleLowerCase("de");
      const items = Array.isArray(order.orderItems)
        ? (order.orderItems as UnknownRecord[])
        : [];
      const likelyOverwintering =
        customerReference.startsWith("PH-UEB-") ||
        note.includes("überwinter") ||
        items.some((item) => article?.id && text(item.articleId) === article.id);
      return {
        id,
        orderNumber: text(order.orderNumber) || id,
        orderDate: dateFrom(order.orderDate ?? order.createdDate),
        customerReference: customerReference || undefined,
        status: text(order.status) || undefined,
        grossAmount: text(order.grossAmount) || undefined,
        currency:
          text(order.currencyName) || text(order.currencyCode) || undefined,
        likelyOverwintering,
        url: weclappViewUrl("salesOrder", id),
      };
    })
    .sort((a, b) => {
      if (a.likelyOverwintering !== b.likelyOverwintering) {
        return a.likelyOverwintering ? -1 : 1;
      }
      return (b.orderDate ?? "").localeCompare(a.orderDate ?? "");
    });
}

export async function attachExistingOverwinteringOrder(
  recordId: string,
  orderId: string
) {
  const record = await getOverwinteringRecord(recordId);
  if (!record) throw new Error("Die Überwinterungsakte wurde nicht gefunden.");
  if (record.weclappOrder?.id) {
    throw new Error("Diese Überwinterung ist bereits mit einem Auftrag verknüpft.");
  }
  const normalizedOrderId = orderId.trim();
  if (!/^[A-Za-z0-9_-]{1,100}$/u.test(normalizedOrderId)) {
    throw new Error("Bitte einen gültigen weclapp-Auftrag auswählen.");
  }
  const order = unwrap(
    await weclappRequest<UnknownRecord>(
      `salesOrder/id/${encodeURIComponent(normalizedOrderId)}`
    )
  );
  if (!belongsToCustomer(order, record.customer.id)) {
    throw new Error(
      "Der ausgewählte Auftrag gehört nicht zum Kunden dieser Überwinterungsakte."
    );
  }
  const saved = await persistCreatedOrder(
    record,
    order,
    text(order.orderNumberAtCustomer) || `WECLAPP-${normalizedOrderId}`
  );
  return refreshOverwinteringInvoiceStatus(saved.id);
}

export async function createOverwinteringSalesOrder(
  recordId: string,
  pricesInput: unknown
) {
  if (activeCreations.has(recordId)) {
    throw new Error("Für diese Überwinterung wird bereits ein Auftrag angelegt.");
  }
  activeCreations.add(recordId);
  try {
    const record = await getOverwinteringRecord(recordId);
    if (!record) throw new Error("Die Überwinterungsakte wurde nicht gefunden.");
    if (record.weclappOrder?.id) {
      throw new Error(
        `Für diese Überwinterung existiert bereits der weclapp-Auftrag ${record.weclappOrder.orderNumber || record.weclappOrder.id}.`
      );
    }
    if (!record.plants.length) {
      throw new Error("Bitte zuerst mindestens eine Pflanze speichern.");
    }
    const pricedPlants = parsePrices(record, pricesInput);
    pricedPlants.forEach(({ price }) => decimal(price));

    const reference = referenceFor(record.id);
    const duplicate = await findWeclappOrderByCustomerReference(reference);
    if (duplicate?.id) {
      const existing = unwrap(
        await weclappRequest<UnknownRecord>(
          `salesOrder/id/${encodeURIComponent(duplicate.id)}`
        )
      );
      return persistCreatedOrder(record, existing, reference);
    }

    const article = await findWeclappArticleByNumber(
      OVERWINTERING_ARTICLE_NUMBER
    );
    if (!article?.id) {
      throw new Error(
        `Der weclapp-Artikel ${OVERWINTERING_ARTICLE_NUMBER} wurde nicht eindeutig gefunden.`
      );
    }
    const defaults = await getSalesOrderDefaults(record.customer.id);
    const body: UnknownRecord = {
      ...cleanDefaults(defaults),
      customerId: record.customer.id,
      orderDate: Date.now(),
      orderNumberAtCustomer: reference,
      note: `Überwinterung · ${record.customer.displayName}`,
      orderItems: pricedPlants.map(({ plant, price }, index) => ({
        articleId: article.id,
        title: plant.name.slice(0, 1_000),
        quantity: "1.00000",
        unitPrice: decimal(price),
        manualUnitPrice: true,
        positionNumber: index + 1,
      })),
    };

    try {
      const created = unwrap(await createWeclappSalesOrder(body));
      return await persistCreatedOrder(record, created, reference);
    } catch (error) {
      // Ein Read-back verhindert Doppelaufträge, falls weclapp den Auftrag
      // angelegt hat, die Antwort aber nicht mehr sicher zugestellt wurde.
      const reconciled = await findWeclappOrderByCustomerReference(
        reference
      ).catch(() => null);
      if (reconciled?.id) {
        const existing = unwrap(
          await weclappRequest<UnknownRecord>(
            `salesOrder/id/${encodeURIComponent(reconciled.id)}`
          )
        );
        return persistCreatedOrder(record, existing, reference);
      }
      throw error;
    }
  } finally {
    activeCreations.delete(recordId);
  }
}

function invoiceFromStatus(order: UnknownRecord) {
  const invoiceStatus = text(order.invoiceStatus).toUpperCase();
  return (
    order.invoiced === true ||
    invoiceStatus === "INVOICED" ||
    invoiceStatus === "PARTIALLY_INVOICED"
  );
}

async function findInvoice(orderId: string) {
  try {
    const response = await weclappRequest<ListResponse>("salesInvoice", {
      query: {
        page: 1,
        pageSize: 10,
        "salesOrderId-eq": orderId,
      },
    });
    return (response.result ?? [])[0];
  } catch (error) {
    // Bei fehlenden Rechnungs-Leserechten bleibt der Status am Auftrag nutzbar.
    if (error instanceof WeclappHttpError) return undefined;
    throw error;
  }
}

export async function refreshOverwinteringInvoiceStatus(recordId: string) {
  const record = await getOverwinteringRecord(recordId);
  if (!record) throw new Error("Die Überwinterungsakte wurde nicht gefunden.");
  if (!record.weclappOrder?.id) {
    throw new Error(
      "Für diese Überwinterung wurde noch kein weclapp-Auftrag angelegt."
    );
  }
  const raw = unwrap(
    await weclappRequest<UnknownRecord>(
      `salesOrder/id/${encodeURIComponent(record.weclappOrder.id)}`
    )
  );
  const invoice = await findInvoice(record.weclappOrder.id);
  const invoiceCreated = invoiceFromStatus(raw) || Boolean(invoice?.id);
  const now = new Date().toISOString();
  const state: OverwinteringWeclappOrder = {
    ...record.weclappOrder,
    orderNumber: text(raw.orderNumber) || record.weclappOrder.orderNumber,
    url: weclappViewUrl("salesOrder", record.weclappOrder.id),
    checkedAt: now,
    status: text(raw.status) || undefined,
    invoiceStatus: text(raw.invoiceStatus) || undefined,
    invoiceCreated,
    invoiceId: text(invoice?.id) || record.weclappOrder.invoiceId,
    invoiceNumber:
      text(invoice?.invoiceNumber) || record.weclappOrder.invoiceNumber,
    invoiceUrl: text(invoice?.id)
      ? weclappViewUrl("salesInvoice", text(invoice?.id))
      : record.weclappOrder.invoiceUrl,
    invoiceCreatedAt: invoiceCreated
      ? record.weclappOrder.invoiceCreatedAt || now
      : undefined,
  };
  const saved = await updateOverwinteringOrder(record.id, state);
  if (!saved) {
    throw new Error("Die Überwinterungsakte wurde nicht mehr gefunden.");
  }
  return saved;
}

export { OVERWINTERING_ARTICLE_NUMBER };
