import { weclappRequest } from "@/services/weclapp/client";
import { getGross1PriceMap } from "@/services/weclapp/prices";
import type { WarehouseArticle, WarehouseStockPlace } from "@/types/warehouse";

type UnknownRow = Record<string, unknown>;
type ListResponse = { result?: UnknownRow[] };

let cache: { expiresAt: number; articles: WarehouseArticle[] } = { expiresAt: 0, articles: [] };

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : value === undefined || value === null ? "" : String(value).trim();
}

function number(value: unknown) {
  const result = Number(value);
  return Number.isFinite(result) ? result : 0;
}

async function allRows(resource: string, maximumPages = 100, pageSize = 1000) {
  const rows: UnknownRow[] = [];
  for (let page = 1; page <= maximumPages; page += 1) {
    const response = await weclappRequest<ListResponse>(resource, { query: { page, pageSize } });
    const batch = response.result ?? [];
    rows.push(...batch);
    if (batch.length < pageSize) return rows;
  }
  throw new Error(`${resource} enthält mehr Datensätze als sicher vollständig geladen werden können.`);
}

async function optionalRows(resource: string, maximumPages = 100) {
  try {
    return await allRows(resource, maximumPages);
  } catch {
    return [];
  }
}

export async function loadWarehouseArticles(force = false) {
  if (!force && cache.expiresAt > Date.now() && cache.articles.length) return cache.articles;
  const [articleRows, stockRows, warehouses, storagePlaces, storageLocations, grossPrices] = await Promise.all([
    allRows("article"),
    allRows("warehouseStock"),
    optionalRows("warehouse", 20),
    optionalRows("storagePlace"),
    optionalRows("storageLocation"),
    getGross1PriceMap().catch(() => new Map<string, number>()),
  ]);
  const warehouseNames = new Map(warehouses.map((row) => [text(row.id), text(row.name) || text(row.description) || text(row.warehouseNumber) || text(row.id)]));
  const storageNames = new Map([...storagePlaces, ...storageLocations].map((row) => [text(row.id), text(row.name) || text(row.description) || text(row.storagePlaceNumber) || text(row.storageLocationNumber) || text(row.id)]));
  const stockByArticle = new Map<string, Map<string, WarehouseStockPlace>>();

  for (const row of stockRows) {
    const articleId = text(row.articleId);
    if (!articleId) continue;
    const warehouseId = text(row.warehouseId);
    const warehouseLevelId = text(row.storagePlaceId || row.warehouseLevelId || row.warehouseStorageLocationId || row.storageLocationId);
    const warehouseName = text(row.warehouseName) || warehouseNames.get(warehouseId) || "Lager";
    const locationName = text(row.storagePlaceName || row.warehouseLevelName || row.warehouseStorageLocationName || row.storageLocationName) || storageNames.get(warehouseLevelId) || "";
    const name = [warehouseName, locationName].filter(Boolean).join(" · ");
    const articleStocks = stockByArticle.get(articleId) || new Map<string, WarehouseStockPlace>();
    const existing = articleStocks.get(name) || { name, warehouseName, quantity: 0, reservedQuantity: 0, warehouseLevelId };
    existing.quantity += number(row.quantity);
    existing.reservedQuantity += number(row.reservedQuantity);
    if (!existing.warehouseLevelId) existing.warehouseLevelId = warehouseLevelId;
    articleStocks.set(name, existing);
    stockByArticle.set(articleId, articleStocks);
  }

  const articles = articleRows.map((row): WarehouseArticle => {
    const id = text(row.id);
    const warehouseStocks = [...(stockByArticle.get(id)?.values() ?? [])]
      .sort((left, right) => left.name.localeCompare(right.name, "de"));
    const stockQuantity = warehouseStocks.reduce((sum, item) => sum + item.quantity, 0);
    const reservedQuantity = warehouseStocks.reduce((sum, item) => sum + item.reservedQuantity, 0);
    const price = grossPrices.get(id);
    return {
      id,
      articleNumber: text(row.articleNumber) || id,
      name: text(row.name) || text(row.shortDescription1) || "Unbenannter Artikel",
      description: text(row.shortDescription1) || text(row.description) || "weclapp Artikel",
      active: row.active !== false,
      articleType: text(row.articleType),
      stockQuantity,
      reservedQuantity,
      availableQuantity: stockQuantity - reservedQuantity,
      standardGrossPrice: price !== undefined ? { value: price, currency: "EUR" } : undefined,
      warehouseStocks,
      barcode: text(row.ean) || text(row.manufacturerPartNumber),
    };
  }).sort((left, right) => left.articleNumber.localeCompare(right.articleNumber, "de", { numeric: true }));

  cache = { articles, expiresAt: Date.now() + 5 * 60_000 };
  return articles;
}

export function clearWarehouseArticleCache() {
  cache = { expiresAt: 0, articles: [] };
}

export function warehouseNames(articles: WarehouseArticle[]) {
  return [...new Set(articles.flatMap((article) => article.warehouseStocks.map((stock) => stock.warehouseName)).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right, "de"));
}
