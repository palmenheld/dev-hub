import { NextResponse } from "next/server";
import { applyOrderImportPlan } from "@/services/shopware/orderPlans";
import { assertSameOrigin } from "@/services/requestSecurity";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    assertSameOrigin(request);
    const { id } = await context.params;
    return NextResponse.json({ plan: await applyOrderImportPlan(id) });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Bestellimport fehlgeschlagen.",
      },
      { status: 400 }
    );
  }
}
