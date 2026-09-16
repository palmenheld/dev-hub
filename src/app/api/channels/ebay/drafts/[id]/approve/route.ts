import { NextResponse } from "next/server";
import { approveEbayDraft } from "@/services/ebay/drafts";
import { assertSameOrigin } from "@/services/requestSecurity";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    assertSameOrigin(request);
    const { id } = await params;
    return NextResponse.json({ draft: await approveEbayDraft(id) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Freigabe konnte nicht gespeichert werden." },
      { status: 400 }
    );
  }
}
