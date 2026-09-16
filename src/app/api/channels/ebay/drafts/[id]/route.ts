import { NextResponse } from "next/server";
import { updateEbayDraft } from "@/services/ebay/drafts";
import { assertSameOrigin } from "@/services/requestSecurity";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    assertSameOrigin(request);
    const { id } = await params;
    return NextResponse.json({
      draft: await updateEbayDraft(id, await request.json()),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Korrekturen konnten nicht gespeichert werden." },
      { status: 400 }
    );
  }
}
