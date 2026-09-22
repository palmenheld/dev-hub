import { randomBytes, timingSafeEqual } from "node:crypto";
import { weclappRequest } from "@/services/weclapp/client";
import { clearWarehouseArticleCache, loadWarehouseArticles } from "./catalog";
import { warehouseLiveWritesEnabled } from "./movements";

type Row = Record<string, unknown>;
type ListResponse = { result?: Row[] };
type TopUpRow = { articleId: string; articleNumber: string; name: string; current: number; needed: number; increase: number; storagePlaceId: string; place: string; bookable: boolean; needsActivation: boolean };
type InvoiceRow = { orderId: string; orderNumber: string; orderDate: number; orderDateLabel: string; done: boolean };

type PreviewStore = {
  topUps: Map<string, { expiresAt: number; warehouse: string; rows: TopUpRow[] }>;
  invoices: Map<string, { expiresAt: number; from: string; to: string; rows: InvoiceRow[] }>;
  resets: Map<string, { expiresAt: number; warehouse: string }>;
};

const globalStore = globalThis as typeof globalThis & { __palmenheldWarehousePreviews?: PreviewStore };
const previews: PreviewStore = globalStore.__palmenheldWarehousePreviews ?? {
  topUps: new Map<string, { expiresAt: number; warehouse: string; rows: TopUpRow[] }>(),
  invoices: new Map<string, { expiresAt: number; from: string; to: string; rows: InvoiceRow[] }>(),
  resets: new Map<string, { expiresAt: number; warehouse: string }>(),
};
globalStore.__palmenheldWarehousePreviews = previews;

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : value === null || value === undefined ? "" : String(value).trim();
}

function number(value: unknown) {
  const result = Number(value);
  return Number.isFinite(result) ? result : 0;
}

async function allRows(endpoint: string, query: Record<string, string | number | boolean | undefined> = {}, maximumPages = 100) {
  const rows: Row[] = [];
  for (let page = 1; page <= maximumPages; page += 1) {
    const response = await weclappRequest<ListResponse>(endpoint, { query: { ...query, page, pageSize: 1000 } });
    const batch = response.result ?? [];
    rows.push(...batch);
    if (batch.length < 1000) return rows;
  }
  throw new Error(`${endpoint} konnte nicht vollständig geladen werden.`);
}

async function salesOrdersWithItems() {
  try {
    return await allRows("salesOrder", { additionalProperties: "orderItems" });
  } catch (error) {
    const status = Number((error as { status?: unknown }).status || 0);
    if (status && ![400, 404, 422].includes(status)) throw error;
    return allRows("salesOrder");
  }
}

function openOrder(order: Row) {
  return !/(CANCEL|CLOSED|COMPLETELY_DELIVERED|MANUALLY_CLOSED)/u.test(text(order.status).toUpperCase());
}

function openQuantity(item: Row) {
  return Math.max(0, number(item.quantity) - number(item.shippedQuantity || item.deliveredQuantity));
}

function token() {
  return randomBytes(32).toString("base64url");
}

function requireLiveWrites() {
  if (!warehouseLiveWritesEnabled()) throw new Error("Live-Buchungen sind serverseitig gesperrt. Die Vorschau hat Weclapp nicht verändert.");
}

export async function previewOrderTopUp(warehouse: string) {
  if (!warehouse.trim()) throw new Error("Bitte ein Lager auswählen.");
  const [articles, orders, warehouses] = await Promise.all([
    loadWarehouseArticles(),
    salesOrdersWithItems(),
    allRows("warehouse", {}, 20).catch(() => []),
  ]);
  if (orders.length && !orders.some((order) => Array.isArray(order.orderItems))) {
    throw new Error("Weclapp liefert keine Auftragspositionen. Bitte die API-Berechtigung für Verkaufsaufträge prüfen.");
  }
  const warehouseIds = new Set(warehouses.filter((row) => text(row.name || row.description) === warehouse).map((row) => text(row.id)));
  const demand = new Map<string, number>();
  let consideredOrders = 0;
  for (const order of orders) {
    if (!openOrder(order)) continue;
    if (warehouseIds.size && !warehouseIds.has(text(order.warehouseId))) continue;
    let used = false;
    for (const item of Array.isArray(order.orderItems) ? order.orderItems as Row[] : []) {
      const articleId = text(item.articleId);
      const quantity = openQuantity(item);
      if (!articleId || quantity <= 0) continue;
      demand.set(articleId, (demand.get(articleId) || 0) + quantity);
      used = true;
    }
    if (used) consideredOrders += 1;
  }
  const fallback = articles.flatMap((article) => article.warehouseStocks).find((place) => place.warehouseName === warehouse && place.warehouseLevelId);
  const rows: TopUpRow[] = [];
  for (const article of articles) {
    const needed = demand.get(article.id) || 0;
    if (needed <= 0 || (article.articleType && article.articleType !== "STORABLE")) continue;
    const places = article.warehouseStocks.filter((place) => place.warehouseName === warehouse);
    const current = places.reduce((sum, place) => sum + place.quantity, 0);
    if (current >= needed) continue;
    const target = places.find((place) => place.warehouseLevelId) || fallback;
    rows.push({
      articleId: article.id,
      articleNumber: article.articleNumber,
      name: article.name,
      current,
      needed,
      increase: needed - current,
      storagePlaceId: target?.warehouseLevelId || "",
      place: target?.name || warehouse,
      bookable: Boolean(target?.warehouseLevelId),
      needsActivation: !article.active,
    });
  }
  rows.sort((left, right) => right.increase - left.increase || left.articleNumber.localeCompare(right.articleNumber, "de"));
  const authorization = token();
  previews.topUps.set(authorization, { expiresAt: Date.now() + 5 * 60_000, warehouse, rows });
  return {
    authorization,
    warehouse,
    consideredOrders,
    affectedArticles: rows.length,
    articlesToActivate: rows.filter((row) => row.needsActivation).length,
    totalIncrease: rows.reduce((sum, row) => sum + row.increase, 0),
    unbookableArticles: rows.filter((row) => !row.bookable).length,
    rows: rows.map((row) => ({
      articleId: row.articleId,
      articleNumber: row.articleNumber,
      name: row.name,
      current: row.current,
      needed: row.needed,
      increase: row.increase,
      place: row.place,
      bookable: row.bookable,
      needsActivation: row.needsActivation,
    })),
    liveWritesEnabled: warehouseLiveWritesEnabled(),
  };
}

export async function executeOrderTopUp(authorization: string) {
  requireLiveWrites();
  const preview = previews.topUps.get(authorization);
  if (!preview || preview.expiresAt < Date.now()) throw new Error("Freigabe ist abgelaufen. Bitte Vorschau neu laden.");
  preview.expiresAt = Date.now() + 15 * 60_000;
  const pending = preview.rows.filter((row) => row.increase > 0);
  const unbookable = pending.find((row) => !row.storagePlaceId);
  if (unbookable) throw new Error(`${unbookable.articleNumber} besitzt keinen buchbaren Lagerplatz.`);
  let completedPositions = 0;
  let addedQuantity = 0;
  let reactivatedArticles = 0;
  for (const row of pending.slice(0, 5)) {
    if (row.needsActivation) {
      const response = await weclappRequest<Row>(`article/id/${encodeURIComponent(row.articleId)}`);
      const article = (response.result as Row | undefined) || response;
      if (text(article.articleNumber) !== row.articleNumber || text(article.articleType) !== "STORABLE") throw new Error(`${row.articleNumber} wurde seit der Vorschau geändert.`);
      if (article.active === false) {
        await weclappRequest(`article/id/${encodeURIComponent(row.articleId)}`, { method: "PUT", body: { ...article, active: true } });
        reactivatedArticles += 1;
      }
      row.needsActivation = false;
    }
    await weclappRequest("warehouseStockMovement/bookIncomingMovement", {
      method: "POST",
      body: { articleId: row.articleId, quantity: row.increase, targetStoragePlaceId: row.storagePlaceId, movementNote: "Auffüllung für offene Aufträge über Palmenheld Hub Lager-App" },
    });
    addedQuantity += row.increase;
    row.increase = 0;
    completedPositions += 1;
  }
  const remainingPositions = preview.rows.filter((row) => row.increase > 0).length;
  if (!remainingPositions) previews.topUps.delete(authorization);
  clearWarehouseArticleCache();
  return { done: remainingPositions === 0, warehouse: preview.warehouse, completedPositions, addedQuantity, reactivatedArticles, remainingPositions };
}

function parseDateRange(from: string, to: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(from) || !/^\d{4}-\d{2}-\d{2}$/u.test(to)) throw new Error("Bitte einen gültigen Zeitraum auswählen.");
  const start = Date.parse(`${from}T00:00:00.000Z`);
  const end = Date.parse(`${to}T23:59:59.999Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end) throw new Error("Der Zeitraum ist ungültig.");
  return { start, end };
}

function invoiceCandidate(order: Row) {
  const status = text(order.status).toUpperCase();
  const invoiceStatus = text(order.invoiceStatus).toUpperCase();
  return Boolean(order.id) && number(order.orderDate) > 0 && order.invoiced !== true && invoiceStatus !== "INVOICED" && !/(CANCEL|MANUALLY_CLOSED|INVOICED)/u.test(status) && status !== "ORDER_ENTRY_IN_PROGRESS";
}

export async function previewInvoices(from: string, to: string) {
  const range = parseDateRange(from, to);
  const orders = await allRows("salesOrder");
  const rows: InvoiceRow[] = orders.filter(invoiceCandidate).filter((order) => number(order.orderDate) >= range.start && number(order.orderDate) <= range.end).map((order) => ({
    orderId: text(order.id),
    orderNumber: text(order.orderNumber || order.salesOrderNumber || order.id),
    orderDate: number(order.orderDate),
    orderDateLabel: new Date(number(order.orderDate)).toLocaleDateString("de-DE", { timeZone: "UTC" }),
    done: false,
  })).sort((left, right) => left.orderDate - right.orderDate || left.orderNumber.localeCompare(right.orderNumber, "de"));
  const authorization = token();
  previews.invoices.set(authorization, { expiresAt: Date.now() + 5 * 60_000, from, to, rows });
  return {
    authorization,
    from,
    to,
    affectedOrders: rows.length,
    rows: rows.map((row) => ({ orderNumber: row.orderNumber, orderDate: row.orderDate, orderDateLabel: row.orderDateLabel })),
    liveWritesEnabled: warehouseLiveWritesEnabled(),
  };
}

export async function executeInvoices(authorization: string) {
  requireLiveWrites();
  const preview = previews.invoices.get(authorization);
  if (!preview || preview.expiresAt < Date.now()) throw new Error("Freigabe ist abgelaufen. Bitte Vorschau neu laden.");
  preview.expiresAt = Date.now() + 15 * 60_000;
  let completedInvoices = 0;
  let skippedOrders = 0;
  const createdInvoices: Array<{ orderNumber: string; invoiceNumber: string }> = [];
  for (const row of preview.rows.filter((item) => !item.done).slice(0, 3)) {
    const response = await weclappRequest<Row>(`salesOrder/id/${encodeURIComponent(row.orderId)}`);
    const order = (response.result as Row | undefined) || response;
    if (text(order.orderNumber || order.salesOrderNumber || order.id) !== row.orderNumber || number(order.orderDate) !== row.orderDate) throw new Error(`Auftrag ${row.orderNumber} wurde seit der Vorschau geändert.`);
    if (!invoiceCandidate(order)) { row.done = true; skippedOrders += 1; continue; }
    const created = await weclappRequest<Row>(`salesOrder/id/${encodeURIComponent(row.orderId)}/createSalesInvoice`, { method: "POST", body: { invoiceDate: row.orderDate } });
    const invoice = (created.result as Row | undefined) || created;
    row.done = true;
    completedInvoices += 1;
    createdInvoices.push({ orderNumber: row.orderNumber, invoiceNumber: text(invoice.invoiceNumber || invoice.id) });
  }
  const remainingOrders = preview.rows.filter((row) => !row.done).length;
  if (!remainingOrders) previews.invoices.delete(authorization);
  return { done: remainingOrders === 0, completedInvoices, skippedOrders, remainingOrders, createdInvoices };
}

function sameSecret(value: string, expected: string) {
  const left = Buffer.from(value);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function previewInventoryReset(warehouse: string, code: string) {
  if (!warehouse.trim()) throw new Error("Bitte ein Lager auswählen.");
  const expected = process.env.WAREHOUSE_RESET_PIN?.trim() || "";
  if (warehouseLiveWritesEnabled()) {
    if (!/^\d{6}$/u.test(expected)) throw new Error("Der sechsstellige Lager-Sicherheitscode ist noch nicht eingerichtet.");
    if (!sameSecret(code, expected)) throw new Error("Der Sicherheitscode ist nicht richtig.");
  }
  const articles = await loadWarehouseArticles();
  const rows = articles.flatMap((article) => article.warehouseStocks.filter((stock) => stock.warehouseName === warehouse && stock.quantity > 0).map((stock) => ({ articleId: article.id, articleNumber: article.articleNumber, name: article.name, place: stock.name, storagePlaceId: stock.warehouseLevelId, quantity: stock.quantity })));
  const authorization = token();
  previews.resets.set(authorization, { expiresAt: Date.now() + 5 * 60_000, warehouse });
  return {
    authorization,
    warehouse,
    affectedArticles: new Set(rows.map((row) => row.articleNumber)).size,
    affectedPositions: rows.length,
    totalQuantity: rows.reduce((sum, row) => sum + row.quantity, 0),
    sample: rows.slice(0, 20).map(({ articleNumber, name, place, quantity }) => ({ articleNumber, name, place, quantity })),
    liveWritesEnabled: warehouseLiveWritesEnabled(),
  };
}

export async function executeInventoryReset(authorization: string) {
  requireLiveWrites();
  const preview = previews.resets.get(authorization);
  if (!preview || preview.expiresAt < Date.now()) throw new Error("Freigabe ist abgelaufen. Bitte Vorschau neu laden.");
  preview.expiresAt = Date.now() + 15 * 60_000;
  const articles = await loadWarehouseArticles(true);
  const rows = articles.flatMap((article) => article.warehouseStocks.filter((stock) => stock.warehouseName === preview.warehouse && stock.quantity > 0 && stock.warehouseLevelId).map((stock) => ({ article, stock })));
  let completedPositions = 0;
  let clearedQuantity = 0;
  for (const { article, stock } of rows.slice(0, 5)) {
    await weclappRequest("warehouseStockMovement/bookOutgoingMovement", { method: "POST", body: { articleId: article.id, quantity: stock.quantity, sourceStoragePlaceId: stock.warehouseLevelId, movementNote: `Inventarreset ${preview.warehouse} über Palmenheld Hub Lager-App` } });
    completedPositions += 1;
    clearedQuantity += stock.quantity;
  }
  const remainingPositions = Math.max(0, rows.length - completedPositions);
  if (!remainingPositions) previews.resets.delete(authorization);
  clearWarehouseArticleCache();
  return { done: remainingPositions === 0, warehouse: preview.warehouse, completedPositions, clearedQuantity, remainingPositions };
}
