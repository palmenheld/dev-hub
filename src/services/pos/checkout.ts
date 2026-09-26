import { setTimeout as wait } from "node:timers/promises";
import { posGet, posPost } from "@/services/pos/client";
import { getPosBootstrap, quotePosCart } from "@/services/pos/catalog";
import { completeCheckout, getReceipt, releaseCheckout, reserveCheckout, saveReceipt } from "@/services/pos/receiptStore";
import type { PosCartInput } from "@/types/pos";

type CheckoutInput = {
  items: PosCartInput[];
  customerId?: string;
  paymentMethodId: number;
  amountTendered: number;
  idempotencyKey: string;
  cashierName: string;
};

export async function fetchPosReceiptPdf(saleId: string) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    if (attempt) await wait(700 * attempt);
    try {
      const response = await posGet(`/sales?action=getInvoicePdf&weclapp_sales_id=${encodeURIComponent(saleId)}`);
      const contentType = response.headers.get("content-type") || "";
      const bytes = new Uint8Array(await response.arrayBuffer());
      if ((contentType.includes("pdf") || String.fromCharCode(...bytes.slice(0, 4)) === "%PDF") && bytes.byteLength > 100) return bytes;
    } catch {
      // weclapp may need a moment to finish the invoice after the sale.
    }
  }
  return undefined;
}

export async function checkoutPos(input: CheckoutInput) {
  const reservation = await reserveCheckout(input.idempotencyKey);
  if (!reservation.fresh) {
    const receipt = await getReceipt(reservation.token);
    if (!receipt) throw new Error("Der bereits abgeschlossene Bon konnte nicht geladen werden.");
    return receipt;
  }

  let saleAttempted = false;
  try {
    const [bootstrap, quote] = await Promise.all([getPosBootstrap(), quotePosCart(input.items, input.customerId)]);
    const payment = bootstrap.paymentMethods.find((method) => method.id === input.paymentMethodId);
    if (!payment) throw new Error("Die gewählte Zahlart ist in POS nicht mehr freigeschaltet.");
    if (payment.isInvoice) throw new Error("Kauf auf Rechnung wird in der Hub-Kasse noch nicht unterstützt.");
    if (/sumup/i.test(payment.name)) throw new Error("SumUp muss wegen der Terminal-Weiterleitung derzeit direkt in weclappPOS genutzt werden.");

    const tendered = Math.round(input.amountTendered * 100) / 100;
    if (!Number.isFinite(tendered) || tendered < quote.total || (!payment.isCash && tendered !== quote.total)) {
      throw new Error(payment.isCash ? "Der erhaltene Betrag reicht nicht aus." : "Bei Kartenzahlung muss der Zahlbetrag exakt stimmen.");
    }
    saleAttempted = true;

    const result = await posPost("/order", {
      action: "createOrder",
      articles: quote.lines.map((line) => ({
        article: { id: line.id, name: line.name, unitPrice: line.unitPrice, taxId: line.taxId, serviceItem: line.serviceItem },
        discount: 0,
        quantity: line.quantity,
        manualPrice: null,
        serialNumbers: [],
      })),
      orderDiscount: 0,
      paymentMethods: [{
        paymentMethod: { id: payment.id, name: payment.name, iscash: payment.isInvoice ? 2 : payment.isCash ? 1 : 0 },
        payed: tendered,
        isActive: true,
      }],
      customAttributes: [],
      matchingPayment: false,
      fulfillmentProviderId: quote.fulfillmentProviderId,
      idCustomer: input.customerId || undefined,
    });
    const saleId = String(result.weclapp_sales_id || "");
    if (!saleId) throw new Error("POS hat den Verkauf nicht mit einer Belegnummer bestätigt.");

    await posPost("/order", { action: "fetchSalesInvoice", weclappSaleId: saleId }).catch(() => undefined);
    const pdf = await fetchPosReceiptPdf(saleId);
    const receipt = await saveReceipt({
      saleId,
      createdAt: new Date().toISOString(),
      cashierName: input.cashierName,
      registerName: bootstrap.registerName,
      locationName: bootstrap.locationName,
      salesChannel: bootstrap.salesChannel,
      paymentMethod: payment.name,
      amountTendered: tendered,
      change: Math.max(0, Math.round((tendered - quote.total) * 100) / 100),
      total: quote.total,
      lines: quote.lines.map((line) => ({
        articleNumber: line.articleNumber,
        name: line.name,
        quantity: line.quantity,
        unitPrice: line.lineTotal / line.quantity,
        lineTotal: line.lineTotal,
      })),
    }, pdf);
    await completeCheckout(reservation.file, receipt.token);
    return receipt;
  } catch (error) {
    if (!saleAttempted) await releaseCheckout(reservation.file);
    throw error;
  }
}
