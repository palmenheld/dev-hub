import { NextResponse } from "next/server";
import { applyWarehouseMovement } from "@/services/warehouse/movements";
import { assertSameOrigin } from "@/services/requestSecurity";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    return NextResponse.json(await applyWarehouseMovement(await request.json()));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Bestandsänderung fehlgeschlagen." }, { status: 400 });
  }
}
