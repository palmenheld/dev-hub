import { NextResponse } from "next/server";
import { updateProductDraft } from "@/services/shopware/drafts";
import { assertSameOrigin } from "@/services/requestSecurity";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    assertSameOrigin(request);
    const { id } = await params;
    const body = (await request.json()) as Record<string, unknown>;
    const draft = await updateProductDraft(id, body);
    return NextResponse.json({ draft });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Die Korrekturen konnten nicht gespeichert werden.",
      },
      { status: 400 }
    );
  }
}
