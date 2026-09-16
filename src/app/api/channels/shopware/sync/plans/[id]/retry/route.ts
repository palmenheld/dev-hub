import { NextResponse } from "next/server";
import { retryFailedSyncPlan } from "@/services/shopware/syncPlans";
import { assertSameOrigin } from "@/services/requestSecurity";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    assertSameOrigin(request);
    const { id } = await params;
    return NextResponse.json({ plan: await retryFailedSyncPlan(id) });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Der neue Prüflauf konnte nicht erstellt werden.",
      },
      { status: 400 }
    );
  }
}
