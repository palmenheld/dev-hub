import { NextResponse } from "next/server";
import { executeInventoryReset, previewInventoryReset } from "@/services/warehouse/operations";
import { assertSameOrigin } from "@/services/requestSecurity";

export const maxDuration = 300;
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const body = await request.json() as { action?: string; warehouse?: string; code?: string; authorization?: string };
    return NextResponse.json(body.action === "execute" ? await executeInventoryReset(body.authorization || "") : await previewInventoryReset(body.warehouse || "", body.code || ""));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Lager-Nullsetzung konnte nicht verarbeitet werden." }, { status: 400 });
  }
}
