import { NextResponse } from "next/server";
import { createOrderImportPlan } from "@/services/shopware/orderPlans";
import { listOrderImportPlans } from "@/services/shopware/orderPlanStore";
import { assertSameOrigin } from "@/services/requestSecurity";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json({ plans: await listOrderImportPlans(20) });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Bestellverlauf konnte nicht geladen werden.",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const body = (await request.json()) as { orderIds?: unknown };
    if (!Array.isArray(body.orderIds)) {
      throw new Error("Die Bestellauswahl ist ungültig.");
    }
    const plan = await createOrderImportPlan(body.orderIds.map(String));
    return NextResponse.json({ plan });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Bestellvorschau konnte nicht erstellt werden.",
      },
      { status: 400 }
    );
  }
}
