import { NextResponse } from "next/server";
import { executeInvoices, previewInvoices } from "@/services/warehouse/operations";
import { assertSameOrigin } from "@/services/requestSecurity";

export const maxDuration = 300;
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const body = await request.json() as { action?: string; from?: string; to?: string; authorization?: string };
    return NextResponse.json(body.action === "execute" ? await executeInvoices(body.authorization || "") : await previewInvoices(body.from || "", body.to || ""));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Rechnungslauf konnte nicht verarbeitet werden." }, { status: 400 });
  }
}
