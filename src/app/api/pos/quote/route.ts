import { NextResponse } from "next/server";
import { quotePosCart } from "@/services/pos/catalog";
import { assertSameOrigin } from "@/services/requestSecurity";
import type { PosCartInput } from "@/types/pos";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const body = await request.json() as { items?: PosCartInput[]; customerId?: string };
    return NextResponse.json({ quote: await quotePosCart(body.items || [], body.customerId?.trim() || undefined) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Der Warenkorb konnte nicht berechnet werden." },
      { status: 400 }
    );
  }
}
