import { NextResponse } from "next/server";
import { executeOrderTopUp, previewOrderTopUp } from "@/services/warehouse/operations";
import { assertSameOrigin } from "@/services/requestSecurity";

export const maxDuration = 300;
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const body = await request.json() as { action?: string; warehouse?: string; authorization?: string };
    return NextResponse.json(body.action === "execute" ? await executeOrderTopUp(body.authorization || "") : await previewOrderTopUp(body.warehouse || ""));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Auftragsbedarf konnte nicht verarbeitet werden." }, { status: 400 });
  }
}
