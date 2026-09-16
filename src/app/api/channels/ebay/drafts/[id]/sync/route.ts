import { NextResponse } from "next/server";
import { syncManagedEbayOffer } from "@/services/ebay/writer";
import { getEbayDraft } from "@/services/ebay/store";
import { assertSameOrigin } from "@/services/requestSecurity";

export const maxDuration = 120;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    assertSameOrigin(request);
    return NextResponse.json({ draft: await syncManagedEbayOffer(id) });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "eBay-Status konnte nicht abgeglichen werden.",
        draft: await getEbayDraft(id),
      },
      { status: 400 }
    );
  }
}
