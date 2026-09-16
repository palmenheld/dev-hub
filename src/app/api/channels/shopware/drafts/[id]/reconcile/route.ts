import { NextResponse } from "next/server";
import { reconcileDraft } from "@/services/shopware/productWriter";
import { assertSameOrigin } from "@/services/requestSecurity";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    assertSameOrigin(request);
    const { id } = await params;
    const draft = await reconcileDraft(id);
    return NextResponse.json({ draft });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Der Shopware-Status konnte nicht eindeutig geprüft werden.",
      },
      { status: 400 }
    );
  }
}
