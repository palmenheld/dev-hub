import { NextResponse } from "next/server";
import { listShopwareOrderCandidates } from "@/services/shopware/orderPlans";
import { assertSameOrigin } from "@/services/requestSecurity";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const orders = await listShopwareOrderCandidates();
    return NextResponse.json({ orders });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Shopware-Bestellungen konnten nicht geladen werden.",
      },
      { status: 400 }
    );
  }
}
