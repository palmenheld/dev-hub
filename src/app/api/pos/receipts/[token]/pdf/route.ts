import { NextResponse } from "next/server";
import { fetchPosReceiptPdf } from "@/services/pos/checkout";
import { getReceipt, getReceiptPdf, saveReceiptPdf } from "@/services/pos/receiptStore";

export async function GET(_: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const receipt = await getReceipt(token);
  if (!receipt) return new NextResponse("Bon nicht gefunden", { status: 404 });
  let pdf = await getReceiptPdf(token);
  if (!pdf) {
    const fetched = await fetchPosReceiptPdf(receipt.saleId);
    if (fetched) {
      await saveReceiptPdf(token, fetched);
      pdf = Buffer.from(fetched);
    }
  }
  if (!pdf) return new NextResponse("Der Originalbeleg ist noch nicht als PDF verfügbar.", { status: 404 });
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="Palmenheld-Bon-${receipt.saleId.replace(/[^A-Za-z0-9_-]/g, "-")}.pdf"`,
      "cache-control": "private, max-age=3600",
    },
  });
}
