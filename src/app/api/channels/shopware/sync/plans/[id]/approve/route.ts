import { NextResponse } from "next/server";
import { approveSyncPlan } from "@/services/shopware/syncPlans";
import { assertSameOrigin } from "@/services/requestSecurity";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    assertSameOrigin(request);
    const { id } = await params;
    const plan = await approveSyncPlan(id);
    return NextResponse.json({ plan });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Der Sync-Plan konnte nicht freigegeben werden.",
      },
      { status: 400 }
    );
  }
}
