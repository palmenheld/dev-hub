import { posPost } from "@/services/pos/client";
import type { PosArticle, PosCustomer, PosPaymentMethod, PosCartInput, PosQuote } from "@/types/pos";

type AnyRecord = Record<string, unknown>;

function number(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeArticle(value: unknown): PosArticle | null {
  if (!value || typeof value !== "object") return null;
  const row = value as AnyRecord;
  if (!row.id || !row.articleNumber || !row.name) return null;
  return {
    id: String(row.id),
    articleNumber: String(row.articleNumber),
    name: String(row.name),
    price: number(row.price),
    unitPrice: number(row.unitPrice ?? row.price),
    stock: number(row.stock),
    type: String(row.type || ""),
    taxId: row.taxId ? String(row.taxId) : undefined,
    serviceItem: Boolean(row.serviceItem),
    isSerialNumber: Boolean(row.isSerialNumber),
  };
}

export async function getPosBootstrap() {
  const [selected, payments, channel] = await Promise.all([
    posPost("/getPos", {}),
    posPost("/getPos", { action: "getPosPaymentmethods" }),
    posPost("/getPos", { action: "getCurrentDistributionChannel" }),
  ]);
  const pos = (selected.pos && typeof selected.pos === "object" ? selected.pos : {}) as AnyRecord;
  const methods = Array.isArray(payments.paymentMethods) ? payments.paymentMethods : [];
  return {
    registerName: String(pos.name || "Kasse"),
    locationName: String(pos.locationName || ""),
    salesChannel: String(channel.currentSalesChannel || ""),
    paymentMethods: methods.map((entry): PosPaymentMethod | null => {
      if (!entry || typeof entry !== "object") return null;
      const method = entry as AnyRecord;
      const id = number(method.id);
      if (!id || !method.name) return null;
      return { id, name: String(method.name), isCash: number(method.iscash) === 1, isInvoice: number(method.iscash) === 2 };
    }).filter((entry): entry is PosPaymentMethod => Boolean(entry)),
  };
}

export async function searchPosArticles(query: string, customerId?: string) {
  const result = await posPost("/article", {
    action: "getArticles",
    searchSubject: query,
    searchName: true,
    searchAnr: true,
    searchEan: true,
    searchZeroPrice: false,
    customerId: customerId || undefined,
    articleCategoryId: undefined,
    quantity: 1,
  });
  const rows = result.articles && typeof result.articles === "object" ? Object.values(result.articles as AnyRecord) : [];
  return rows.map(normalizeArticle).filter((entry): entry is PosArticle => Boolean(entry)).slice(0, 30);
}

export async function searchPosCustomers(query: string) {
  const result = await posPost("/customer", {
    action: "searchCustomer",
    searchvalue: query,
    searchName: true,
    searchNumber: true,
  });
  const rows = Array.isArray(result.customers) ? result.customers : [];
  return rows.map((value): PosCustomer | null => {
    if (!value || typeof value !== "object") return null;
    const row = value as AnyRecord;
    if (!row.id) return null;
    const displayName = String(row.company || `${row.firstName || ""} ${row.lastName || ""}`).trim();
    return {
      id: String(row.id),
      customerNumber: String(row.customerNumber || ""),
      displayName: displayName || "Unbenannter Kunde",
      blocked: row.invoiceBlock === true || row.deliveryBlock === true,
    };
  }).filter((entry): entry is PosCustomer => Boolean(entry)).slice(0, 20);
}

async function verifiedArticle(input: PosCartInput, customerId?: string) {
  const results = await searchPosArticles(input.articleNumber, customerId);
  const article = results.find((entry) => entry.id === input.articleId && entry.articleNumber === input.articleNumber);
  if (!article) throw new Error(`Artikel ${input.articleNumber} wurde in POS nicht mehr gefunden.`);
  if (article.isSerialNumber) throw new Error(`Artikel ${input.articleNumber} benötigt eine Seriennummer und muss direkt in POS kassiert werden.`);
  return article;
}

export async function quotePosCart(items: PosCartInput[], customerId?: string): Promise<PosQuote> {
  if (!items.length || items.length > 100) throw new Error("Der Warenkorb muss 1 bis 100 Positionen enthalten.");
  const verified = await Promise.all(items.map(async (item) => {
    if (!Number.isFinite(item.quantity) || item.quantity <= 0 || item.quantity > 999) throw new Error("Eine Artikelmenge ist ungültig.");
    return { article: await verifiedArticle(item, customerId), quantity: Math.round(item.quantity * 1000) / 1000 };
  }));
  const saleArticles = verified.map(({ article, quantity }) => ({
    article: { id: article.id, unitPrice: article.unitPrice, taxId: article.taxId, serialNumbers: [], serviceItem: article.serviceItem, name: article.name },
    discount: 0,
    quantity,
    manualPrice: null,
  }));
  const result = await posPost("/order", {
    action: "calculateSalesOrder",
    saleArticles,
    customerId: customerId || undefined,
    headerDiscount: 0,
  });
  const salesOrder = (result.salesOrder && typeof result.salesOrder === "object" ? result.salesOrder : {}) as AnyRecord;
  const orderItems = Array.isArray(salesOrder.orderItems) ? salesOrder.orderItems as AnyRecord[] : [];
  const lines = verified.map(({ article, quantity }, index) => {
    const orderItem = orderItems[index] || {};
    const lineTotal = number(orderItem.grossAmount) || Math.round(article.price * quantity * 100) / 100;
    return { ...article, quantity, lineTotal };
  });
  return {
    lines,
    total: number(salesOrder.grossAmount) || Math.round(lines.reduce((sum, line) => sum + line.lineTotal, 0) * 100) / 100,
    fulfillmentProviderId: salesOrder.fulfillmentProviderId ? String(salesOrder.fulfillmentProviderId) : undefined,
    customerId,
  };
}
