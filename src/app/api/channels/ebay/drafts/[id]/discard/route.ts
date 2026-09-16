import { NextResponse } from "next/server";
import { discardEbayIntermediate } from "@/services/ebay/writer";
import { getEbayDraft } from "@/services/ebay/store";
import {
  assertEbayPublishKey,
  assertSameOrigin,
} from "@/services/requestSecurity";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    assertSameOrigin(request);
    assertEbayPublishKey(request);
    return NextResponse.json({ draft: await discardEbayIntermediate(id) });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Verwerfen fehlgeschlagen.",
        draft: await getEbayDraft(id),
      },
      { status: 400 }
    );
  }
}
