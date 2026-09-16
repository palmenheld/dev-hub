import { NextResponse } from "next/server";
import { correctSyncItem } from "@/services/shopware/syncPlans";
import { assertSameOrigin } from "@/services/requestSecurity";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    assertSameOrigin(request);
    const { id } = await params;
    const body = (await request.json()) as {
      itemId?: unknown;
      field?: unknown;
      proposed?: unknown;
    };
    if (typeof body.itemId !== "string" || typeof body.field !== "string") {
      throw new Error("Die Korrektur ist unvollständig.");
    }
    const plan = await correctSyncItem(
      id,
      body.itemId,
      body.field,
      body.proposed
    );
    return NextResponse.json({ plan });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Die Korrektur konnte nicht gespeichert werden.",
      },
      { status: 400 }
    );
  }
}
