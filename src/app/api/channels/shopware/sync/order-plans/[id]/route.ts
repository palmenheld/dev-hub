import { NextResponse } from "next/server";
import { correctOrderImportItem } from "@/services/shopware/orderPlans";
import { assertSameOrigin } from "@/services/requestSecurity";
import { OrderImportCorrection } from "@/types/shopwareOrders";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    assertSameOrigin(request);
    const { id } = await context.params;
    const body = (await request.json()) as {
      itemId?: unknown;
      field?: unknown;
      value?: unknown;
    };
    if (typeof body.itemId !== "string" || typeof body.field !== "string") {
      throw new Error("Die Korrektur ist unvollständig.");
    }
    const plan = await correctOrderImportItem(
      id,
      body.itemId,
      body.field as keyof OrderImportCorrection,
      body.value
    );
    return NextResponse.json({ plan });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Korrektur fehlgeschlagen.",
      },
      { status: 400 }
    );
  }
}
