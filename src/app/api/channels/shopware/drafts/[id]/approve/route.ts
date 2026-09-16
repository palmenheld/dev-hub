import { NextResponse } from "next/server";
import { approveProductDraft } from "@/services/shopware/drafts";
import { assertSameOrigin } from "@/services/requestSecurity";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    assertSameOrigin(request);
    const { id } = await params;
    const draft = await approveProductDraft(id);
    return NextResponse.json({ draft });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Der Entwurf konnte nicht freigegeben werden.",
      },
      { status: 400 }
    );
  }
}
