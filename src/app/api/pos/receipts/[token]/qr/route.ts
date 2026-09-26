import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { getReceipt } from "@/services/pos/receiptStore";
import { getPosConfig } from "@/services/pos/config";

export async function GET(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const receipt = await getReceipt(token);
  if (!receipt) return new NextResponse("Bon nicht gefunden", { status: 404 });
  const origin = getPosConfig().receiptBaseUrl || new URL(request.url).origin;
  const svg = await QRCode.toString(`${origin}/receipt/${token}`, {
    type: "svg",
    errorCorrectionLevel: "M",
    margin: 1,
    color: { dark: "#0f4f24", light: "#ffffff" },
  });
  return new NextResponse(svg, {
    headers: { "content-type": "image/svg+xml; charset=utf-8", "cache-control": "public, max-age=86400" },
  });
}
