import { randomUUID } from "node:crypto";
import {
  OrderImportCorrection,
  OrderImportLine,
  OrderImportPlan,
  OrderImportPlanItem,
  ShopwareOrderCandidate,
} from "@/types/shopwareOrders";
import { WeclappHttpError } from "@/services/weclapp/client";
import {
  createWeclappSalesOrder,
  findWeclappArticleByNumber,
  findWeclappCustomer,
  findWeclappOrderByShopwareNumber,
  getSalesOrderDefaults,
  toWeclappAddress,
} from "@/services/weclapp/orders";
import { getSyncSettings } from "./dataStore";
import { getOrderImportPlan, saveOrderImportPlan } from "./orderPlanStore";
import { getShopwareOrderById, getShopwareOrdersForImport } from "./orders";
import { withMutationLock } from "./mutationLock";
import { appendSyncAudit } from "./syncStore";

function message(error: unknown) {
  return error instanceof Error ? error.message : "Unbekannter Bestellfehler";
}

function mappingFromShopware(
  mappings: Array<{ sourceId: string; targetId: string }>,
  shopwareId?: string
) {
  if (!shopwareId) return undefined;
  return mappings.find((pair) => pair.targetId === shopwareId)?.sourceId || undefined;
}

function orderTimestamp(value: string) {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) throw new Error("Das Shopware-Bestelldatum ist ungültig.");
  return timestamp;
}

function decimal(value: number) {
  if (!Number.isFinite(value)) throw new Error("Ein Auftragsbetrag ist ungültig.");
  return value.toFixed(5);
}

function cleanDefaults(defaults: Record<string, unknown>) {
  const result = { ...defaults };
  for (const key of [
    "id",
    "version",
    "createdDate",
    "lastModifiedDate",
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

function buildCorrection(
  order: ShopwareOrderCandidate,
  customerId: string
): OrderImportCorrection {
  return {
    customerId,
    note: `Import aus Shopware · Bestellung ${order.orderNumber}`,
  };
}

async function resolveLines(order: ShopwareOrderCandidate) {
  const cache = new Map<string, string | null>();
  const lines: OrderImportLine[] = [];
  for (const line of order.lines) {
    if (line.quantity <= 0 || !Number.isFinite(line.unitPrice)) {
      lines.push({ ...line, error: "Menge oder Preis ist ungültig." });
      continue;
    }
    if (line.type !== "product") {
      lines.push({ ...line });
      continue;
    }
    if (!line.productNumber) {
      lines.push({ ...line, error: "Die Produktposition besitzt keine Artikelnummer." });
      continue;
    }
    let articleId = cache.get(line.productNumber);
    if (articleId === undefined) {
      articleId = (await findWeclappArticleByNumber(line.productNumber))?.id ?? null;
      cache.set(line.productNumber, articleId);
    }
    lines.push(
      articleId
        ? { ...line, weclappArticleId: articleId }
        : {
            ...line,
            error: `Artikel ${line.productNumber} wurde in weclapp nicht eindeutig gefunden.`,
          }
    );
  }
  return lines;
}

async function previewOrder(order: ShopwareOrderCandidate): Promise<OrderImportPlanItem> {
  const settings = await getSyncSettings();
  const errors: string[] = [];
  const warnings: string[] = [];
  const duplicate = await findWeclappOrderByShopwareNumber(order.orderNumber);
  if (duplicate) {
    errors.push(
      `Bereits als weclapp-Auftrag ${duplicate.orderNumber || duplicate.id} vorhanden.`
    );
  }

  const customer = await findWeclappCustomer({
    ...order.customer,
    matchBy: settings.customers.matchBy,
  });
  if (!customer.id) errors.push(customer.error || "weclapp-Kunde nicht gefunden.");

  const lines = await resolveLines(order);
  errors.push(
    ...lines
      .map((line) => line.error)
      .filter((value): value is string => Boolean(value))
  );
  if (!lines.length) errors.push("Die Bestellung enthält keine übertragbaren Positionen.");

  const calculatedTotal =
    lines.reduce((sum, line) => sum + line.totalPrice, 0) + order.shippingTotal;
  if (Math.abs(calculatedTotal - order.amountTotal) > 0.02) {
    errors.push(
      `Die kontrollierte Summe (${calculatedTotal.toFixed(2)}) weicht vom Shopware-Gesamtbetrag (${order.amountTotal.toFixed(2)}) ab.`
    );
  }

  const correction = buildCorrection(order, customer.id || "");
  correction.recordCurrencyId = mappingFromShopware(
    settings.mappings.currencies,
    order.currencyId
  );
  correction.salesChannel =
    mappingFromShopware(settings.mappings.salesChannels, order.salesChannelId) ||
    mappingFromShopware(settings.mappings.customerGroups, order.customerGroupId);
  correction.paymentMethodId = mappingFromShopware(
    settings.mappings.paymentMethods,
    order.paymentMethod?.id
  );
  correction.shipmentMethodId = mappingFromShopware(
    settings.mappings.shippingMethods,
    order.shippingMethod?.id
  );
  correction.warehouseId = settings.stock.warehouseIds[0];

  if (!correction.recordCurrencyId) {
    warnings.push("Keine Währungszuordnung: Der weclapp-Kundenstandard wird verwendet.");
  }
  if (order.paymentMethod && !correction.paymentMethodId) {
    warnings.push("Keine Zahlungsart-Zuordnung: Der weclapp-Kundenstandard wird verwendet.");
  }
  if (order.shippingMethod && !correction.shipmentMethodId) {
    warnings.push("Keine Versandart-Zuordnung: Der weclapp-Kundenstandard wird verwendet.");
  }
  if (!correction.salesChannel) {
    warnings.push("Kein Verkaufskanal zugeordnet: Der weclapp-Kundenstandard wird verwendet.");
  }

  if (customer.id && order.shippingTotal > 0) {
    const defaults = await getSalesOrderDefaults(customer.id);
    const shippingItems = Array.isArray(defaults.shippingCostItems)
      ? defaults.shippingCostItems
      : [];
    if (!shippingItems.length) {
      errors.push(
        "Shopware berechnet Versandkosten, aber weclapp liefert keine Standard-Versandkostenposition."
      );
    }
  }

  return {
    id: randomUUID(),
    shopwareOrder: order,
    state: errors.length ? "blocked" : "pending",
    correction,
    lines,
    warnings,
    errors,
  };
}

export async function listShopwareOrderCandidates() {
  const settings = await getSyncSettings();
  return getShopwareOrdersForImport({
    safetyDays: settings.orders.safetyDays,
    statusIds: settings.orders.shopwareStatusIds,
    limit: settings.global.batchLimit,
  });
}

export async function createOrderImportPlan(orderIds: string[]) {
  const settings = await getSyncSettings();
  const uniqueIds = [...new Set(orderIds.map((id) => id.trim()))].filter(Boolean);
  if (!uniqueIds.length) throw new Error("Bitte mindestens eine Bestellung auswählen.");
  if (uniqueIds.length > settings.global.batchLimit) {
    throw new Error(
      `Dieser Lauf darf höchstens ${settings.global.batchLimit} Bestellungen enthalten.`
    );
  }

  const candidates = await getShopwareOrdersForImport({
    safetyDays: settings.orders.safetyDays,
    statusIds: settings.orders.shopwareStatusIds,
    limit: settings.global.batchLimit,
  });
  const byId = new Map(candidates.map((order) => [order.id, order]));
  const missing = uniqueIds.filter((id) => !byId.has(id));
  if (missing.length) {
    throw new Error(
      "Mindestens eine Bestellung gehört nicht mehr zur gespeicherten Status-/Zeitauswahl."
    );
  }

  const items: OrderImportPlanItem[] = [];
  for (const id of uniqueIds) items.push(await previewOrder(byId.get(id)!));

  const now = new Date().toISOString();
  const plan: OrderImportPlan = {
    id: randomUUID(),
    createdAt: now,
    updatedAt: now,
    state: "draft",
    dryRun: true,
    items,
  };
  await saveOrderImportPlan(plan);
  await appendSyncAudit({
    process: "orders",
    action: "plan_created",
    planId: plan.id,
    message: `Bestellvorschau mit ${items.length} ausdrücklich ausgewählten Bestellungen erstellt.`,
  });
  return plan;
}

const CORRECTABLE_FIELDS = new Set<keyof OrderImportCorrection>([
  "customerId",
  "recordCurrencyId",
  "salesChannel",
  "paymentMethodId",
  "shipmentMethodId",
  "warehouseId",
  "note",
]);

export async function correctOrderImportItem(
  planId: string,
  itemId: string,
  field: keyof OrderImportCorrection,
  rawValue: unknown
) {
  const plan = await getOrderImportPlan(planId);
  if (!plan) throw new Error("Die Bestellvorschau wurde nicht gefunden.");
  if (plan.state !== "draft") throw new Error("Nur offene Vorschauen können korrigiert werden.");
  const item = plan.items.find((candidate) => candidate.id === itemId);
  if (!item || item.state !== "pending") {
    throw new Error("Nur übertragbare, noch nicht freigegebene Bestellungen können korrigiert werden.");
  }
  if (!CORRECTABLE_FIELDS.has(field)) throw new Error("Dieses Feld ist nicht korrigierbar.");
  const value = typeof rawValue === "string" ? rawValue.trim() : "";
  if (field === "customerId" && !/^[A-Za-z0-9_-]{1,80}$/.test(value)) {
    throw new Error("Die weclapp-Kunden-ID ist ungültig.");
  }
  if (field === "note" && value.length > 512) throw new Error("Die Notiz ist zu lang.");
  if (field !== "note" && value && !/^[A-Za-z0-9_.:-]{1,100}$/.test(value)) {
    throw new Error("Der Zuordnungswert enthält ungültige Zeichen.");
  }
  switch (field) {
    case "customerId":
      item.correction.customerId = value;
      break;
    case "recordCurrencyId":
      item.correction.recordCurrencyId = value || undefined;
      break;
    case "salesChannel":
      item.correction.salesChannel = value || undefined;
      break;
    case "paymentMethodId":
      item.correction.paymentMethodId = value || undefined;
      break;
    case "shipmentMethodId":
      item.correction.shipmentMethodId = value || undefined;
      break;
    case "warehouseId":
      item.correction.warehouseId = value || undefined;
      break;
    case "note":
      item.correction.note = value;
      break;
  }
  plan.updatedAt = new Date().toISOString();
  await saveOrderImportPlan(plan);
  await appendSyncAudit({
    process: "orders",
    action: "item_corrected",
    planId: plan.id,
    itemId,
    message: `${field} für Shopware-Bestellung ${item.shopwareOrder.orderNumber} korrigiert.`,
  });
  return plan;
}

export async function approveOrderImportPlan(planId: string) {
  const plan = await getOrderImportPlan(planId);
  if (!plan) throw new Error("Die Bestellvorschau wurde nicht gefunden.");
  if (plan.state !== "draft") throw new Error("Diese Vorschau kann nicht mehr freigegeben werden.");
  const pending = plan.items.filter((item) => item.state === "pending");
  if (!pending.length) throw new Error("Es gibt keine fehlerfreien Bestellungen zur Freigabe.");
  for (const item of pending) item.state = "approved";
  plan.state = "approved";
  plan.updatedAt = new Date().toISOString();
  await saveOrderImportPlan(plan);
  await appendSyncAudit({
    process: "orders",
    action: "plan_approved",
    planId: plan.id,
    message: `${pending.length} Bestellungen ausdrücklich freigegeben.`,
  });
  return plan;
}

function buildOrderBody(
  item: OrderImportPlanItem,
  defaults: Record<string, unknown>
) {
  const order = item.shopwareOrder;
  const correction = item.correction;
  const shippingCostItems = Array.isArray(defaults.shippingCostItems)
    ? defaults.shippingCostItems.map((entry) =>
        typeof entry === "object" && entry !== null
          ? { ...(entry as Record<string, unknown>) }
          : entry
      )
    : [];

  if (order.shippingTotal > 0) {
    if (!shippingCostItems.length || typeof shippingCostItems[0] !== "object") {
      throw new Error("weclapp besitzt keine verwendbare Standard-Versandkostenposition.");
    }
    shippingCostItems[0] = {
      ...(shippingCostItems[0] as Record<string, unknown>),
      unitPrice: decimal(order.shippingTotal),
      manualUnitPrice: true,
      manualUnitCost: false,
      discountPercentage: "0.00000",
    };
  }

  const body: Record<string, unknown> = {
    ...cleanDefaults(defaults),
    customerId: correction.customerId,
    orderDate: orderTimestamp(order.orderDateTime),
    orderNumberAtCustomer: order.orderNumber,
    note: correction.note,
    recordAddress: toWeclappAddress(order.billingAddress),
    invoiceAddress: toWeclappAddress(order.billingAddress),
    deliveryAddress: toWeclappAddress(order.shippingAddress),
    recordEmailAddresses: { toAddresses: order.customer.email },
    deliveryEmailAddresses: { toAddresses: order.customer.email },
    salesInvoiceEmailAddresses: { toAddresses: order.customer.email },
    orderItems: item.lines.map((line, index) => ({
      articleId: line.weclappArticleId,
      title: line.label.slice(0, 1000),
      quantity: decimal(line.quantity),
      unitPrice: decimal(line.unitPrice),
      manualUnitPrice: true,
      positionNumber: index + 1,
    })),
    shippingCostItems,
  };
  for (const field of [
    "recordCurrencyId",
    "salesChannel",
    "paymentMethodId",
    "shipmentMethodId",
    "warehouseId",
  ] as const) {
    const value = correction[field];
    if (value) body[field] = value;
  }
  return body;
}

async function applyOrderImportPlanUnlocked(planId: string) {
  const plan = await getOrderImportPlan(planId);
  if (!plan) throw new Error("Die Bestellvorschau wurde nicht gefunden.");
  if (plan.state !== "approved") throw new Error("Die Bestellvorschau wurde nicht freigegeben.");
  const settings = await getSyncSettings();
  if (!settings.orders.enabled) {
    throw new Error("Der Bestellprozess ist in den Sync-Regeln nicht als eingerichtet markiert.");
  }

  plan.state = "applying";
  plan.updatedAt = new Date().toISOString();
  await saveOrderImportPlan(plan);
  await appendSyncAudit({
    process: "orders",
    action: "apply_started",
    planId: plan.id,
    message: "Freigegebener Bestellimport gestartet.",
  });

  for (const item of plan.items.filter((candidate) => candidate.state === "approved")) {
    try {
      const current = await getShopwareOrderById(item.shopwareOrder.id);
      if (!current || current.fingerprint !== item.shopwareOrder.fingerprint) {
        throw new Error(
          "Die Shopware-Bestellung wurde seit der Vorschau verändert. Bitte neu prüfen."
        );
      }
      const duplicate = await findWeclappOrderByShopwareNumber(current.orderNumber);
      if (duplicate) {
        throw new Error(
          `Diese Bestellung existiert bereits als weclapp-Auftrag ${duplicate.orderNumber || duplicate.id}.`
        );
      }
      const defaults = await getSalesOrderDefaults(item.correction.customerId);
      const created = await createWeclappSalesOrder(buildOrderBody(item, defaults));
      const id = typeof created.id === "string" ? created.id : "";
      if (!id) throw new Error("weclapp hat nach dem Anlegen keine Auftrags-ID geliefert.");
      item.state = "applied";
      item.weclappOrderId = id;
      item.weclappOrderNumber =
        typeof created.orderNumber === "string" ? created.orderNumber : undefined;
      await appendSyncAudit({
        process: "orders",
        action: "item_applied",
        planId: plan.id,
        itemId: item.id,
        message: `Shopware-Bestellung ${current.orderNumber} als weclapp-Auftrag ${item.weclappOrderNumber || id} angelegt.`,
      });
    } catch (error) {
      let reconciled: Awaited<ReturnType<typeof findWeclappOrderByShopwareNumber>> = null;
      try {
        reconciled = await findWeclappOrderByShopwareNumber(
          item.shopwareOrder.orderNumber
        );
      } catch {
        // Der Read-back ist ebenfalls unsicher; der Vorgang bleibt gesperrt.
      }
      if (reconciled) {
        item.state = "applied";
        item.weclappOrderId = reconciled.id;
        item.weclappOrderNumber = reconciled.orderNumber;
      } else if (
        error instanceof WeclappHttpError &&
        error.status >= 400 &&
        error.status < 500 &&
        error.status !== 408 &&
        error.status !== 429
      ) {
        item.state = "failed";
        item.errors = [...item.errors, message(error)];
      } else {
        item.state = "reconciliation_required";
        item.errors = [
          ...item.errors,
          `${message(error)} Der Ausgang ist unklar; nicht erneut senden, sondern mit einer neuen Vorschau auf die Auftragsnummer prüfen.`,
        ];
      }
      await appendSyncAudit({
        process: "orders",
        action: item.state === "applied" ? "item_applied" : "item_failed",
        planId: plan.id,
        itemId: item.id,
        message:
          item.state === "applied"
            ? `Shopware-Bestellung ${item.shopwareOrder.orderNumber} beim Kontrolllesen in weclapp gefunden.`
            : `Shopware-Bestellung ${item.shopwareOrder.orderNumber}: ${item.errors.at(-1)}`,
      });
    }
    plan.updatedAt = new Date().toISOString();
    await saveOrderImportPlan(plan);
  }

  plan.state = plan.items.some(
    (item) => item.state === "failed" || item.state === "reconciliation_required"
  )
    ? "partially_failed"
    : "completed";
  plan.updatedAt = new Date().toISOString();
  await saveOrderImportPlan(plan);
  return plan;
}

export async function applyOrderImportPlan(planId: string) {
  return withMutationLock(`order-plan:${planId}`, () =>
    applyOrderImportPlanUnlocked(planId)
  );
}
