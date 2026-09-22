import { NextResponse } from "next/server";
import { importLegacyWarehouseState } from "@/services/warehouse/state";
import { assertSameOrigin } from "@/services/requestSecurity";
import type { LegacyWarehousePayload } from "@/types/warehouse";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const payload = await request.json() as LegacyWarehousePayload;
    return NextResponse.json({ state: await importLegacyWarehouseState(payload) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Altdaten konnten nicht importiert werden." }, { status: 400 });
  }
}
