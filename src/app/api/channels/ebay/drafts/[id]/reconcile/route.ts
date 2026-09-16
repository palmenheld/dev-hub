import { NextResponse } from "next/server";
import { reconcileEbayDraft } from "@/services/ebay/writer";
import { assertSameOrigin } from "@/services/requestSecurity";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    assertSameOrigin(request);
    const { id } = await params;
    return NextResponse.json({ draft: await reconcileEbayDraft(id) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Statusabgleich fehlgeschlagen." },
      { status: 400 }
    );
  }
}
