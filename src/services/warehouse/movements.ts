import { weclappRequest } from "@/services/weclapp/client";
import { clearWarehouseArticleCache, loadWarehouseArticles } from "./catalog";

type UnknownRow = Record<string, unknown>;
type ListResponse = { result?: UnknownRow[] };

export function warehouseLiveWritesEnabled() {
  return process.env.WAREHOUSE_LIVE_WRITES_ENABLED?.trim().toLowerCase() === "true";
}

export type WarehouseMovementInput = {
  articleId: string;
  articleNumber: string;
  action: "plus" | "minus" | "set";
  amount: number;
  warehouse: string;
};

function validate(input: WarehouseMovementInput) {
  if (!input.articleId.trim() || !input.articleNumber.trim() || !input.warehouse.trim()) throw new Error("Artikel, Artikelnummer und Lagerort sind erforderlich.");
  if (!(["plus", "minus", "set"] as const).includes(input.action)) throw new Error("Ungültige Buchungsart.");
  const minimum = input.action === "set" ? 0 : 1;
  if (!Number.isInteger(input.amount) || input.amount < minimum || input.amount > 999_999) throw new Error("Ungültige Lagermenge.");
}

export async function applyWarehouseMovement(input: WarehouseMovementInput) {
  validate(input);
  const articles = await loadWarehouseArticles();
  const article = articles.find((item) => item.id === input.articleId && item.articleNumber === input.articleNumber);
  if (!article) throw new Error("Der Artikel wurde in Weclapp nicht eindeutig gefunden.");
  if (!article.active || (article.articleType && article.articleType !== "STORABLE")) throw new Error("Dieser Artikel ist nicht für Lagerbuchungen freigegeben.");
  const place = article.warehouseStocks.find((item) => item.name === input.warehouse);
  if (!place?.warehouseLevelId) throw new Error("Der gewählte Lagerort besitzt keine buchbare Weclapp-Lagerplatz-ID.");
  const oldQuantity = place.quantity;
  const newQuantity = input.action === "plus" ? oldQuantity + input.amount : input.action === "minus" ? oldQuantity - input.amount : input.amount;
  if (newQuantity < 0) throw new Error("Der Bestand kann nicht unter 0 fallen.");
  const difference = newQuantity - oldQuantity;

  if (!warehouseLiveWritesEnabled()) {
    return {
      ok: true,
      live: false,
      testMode: true,
      action: input.action,
      articleNumber: input.articleNumber,
      warehouse: input.warehouse,
      oldQuantity,
      newQuantity,
      difference,
      message: `Testvorschau: Bestand würde von ${oldQuantity} auf ${newQuantity} Stück geändert. Weclapp wurde nicht verändert.`,
    };
  }

  const liveArticleResponse = await weclappRequest<UnknownRow>(`article/id/${encodeURIComponent(input.articleId)}`);
  const liveArticle = (liveArticleResponse.result as UnknownRow | undefined) || liveArticleResponse;
  if (String(liveArticle.articleNumber || "") !== input.articleNumber || liveArticle.active === false || liveArticle.articleType !== "STORABLE") {
    throw new Error("Der Artikel wurde seit dem Laden geändert und kann nicht sicher gebucht werden.");
  }
  const stockResponse = await weclappRequest<ListResponse>("warehouseStock", {
    query: { "articleId-eq": input.articleId, page: 1, pageSize: 1000 },
  });
  const stock = (stockResponse.result || []).find((row) => String(row.storagePlaceId || row.warehouseLevelId || row.warehouseStorageLocationId || row.storageLocationId || "") === place.warehouseLevelId);
  const freshQuantity = Number(stock?.quantity || 0);
  if (freshQuantity !== oldQuantity) throw new Error("Der Lagerbestand wurde seit dem Laden verändert. Bitte Artikel neu laden.");
  if (difference !== 0) {
    const incoming = difference > 0;
    await weclappRequest(`warehouseStockMovement/${incoming ? "bookIncomingMovement" : "bookOutgoingMovement"}`, {
      method: "POST",
      body: {
        articleId: input.articleId,
        quantity: Math.abs(difference),
        [incoming ? "targetStoragePlaceId" : "sourceStoragePlaceId"]: place.warehouseLevelId,
        movementNote: "Bestandskorrektur über Palmenheld Hub Lager-App",
      },
    });
  }
  clearWarehouseArticleCache();
  return {
    ok: true,
    live: true,
    action: input.action,
    articleNumber: input.articleNumber,
    warehouse: input.warehouse,
    oldQuantity,
    newQuantity,
    difference,
    bookedAt: new Date().toISOString(),
    message: `Weclapp-Bestand von ${oldQuantity} auf ${newQuantity} Stück geändert.`,
  };
}
