import { NextResponse } from "next/server";
import { applySyncPlan } from "@/services/shopware/syncPlans";
import { assertSameOrigin } from "@/services/requestSecurity";

export const maxDuration = 120;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    assertSameOrigin(request);
    const { id } = await params;
    const plan = await applySyncPlan(id);
    return NextResponse.json({ plan });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Der Sync-Plan konnte nicht ausgeführt werden.",
      },
      { status: 400 }
    );
  }
}
