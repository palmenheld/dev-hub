import type {
  OverwinteringRecord,
  OverwinteringWeclappOrder,
} from "@/types/overwintering";
import { WeclappHttpError, weclappRequest } from "@/services/weclapp/client";
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
    checkedAt: now,
    status: text(raw.status) || undefined,
    invoiceStatus: text(raw.invoiceStatus) || undefined,
    invoiceCreated,
    invoiceId: text(invoice?.id) || record.weclappOrder.invoiceId,
    invoiceNumber:
      text(invoice?.invoiceNumber) || record.weclappOrder.invoiceNumber,
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
