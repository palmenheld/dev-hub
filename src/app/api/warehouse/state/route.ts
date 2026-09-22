import { NextResponse } from "next/server";
import { getWarehouseState, saveWarehouseState } from "@/services/warehouse/state";
import { assertSameOrigin } from "@/services/requestSecurity";

export async function GET() {
  return NextResponse.json({ state: await getWarehouseState() });
}

export async function PUT(request: Request) {
  try {
    assertSameOrigin(request);
    return NextResponse.json({ state: await saveWarehouseState(await request.json()) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Lagerentwurf konnte nicht gespeichert werden." }, { status: 400 });
  }
}
