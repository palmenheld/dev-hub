import { NextResponse } from "next/server";
import { pauseEbayOffer } from "@/services/ebay/writer";
import { getEbayDraft } from "@/services/ebay/store";
import {
  assertEbayPublishKey,
  assertSameOrigin,
} from "@/services/requestSecurity";

export const maxDuration = 120;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    assertSameOrigin(request);
    assertEbayPublishKey(request);
    return NextResponse.json({ draft: await pauseEbayOffer(id) });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "eBay-Angebot konnte nicht pausiert werden.",
        draft: await getEbayDraft(id),
      },
      { status: 400 }
    );
  }
}
