import { NextResponse } from "next/server";
import { revalidateEbayDraft } from "@/services/ebay/drafts";
import { assertSameOrigin } from "@/services/requestSecurity";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    assertSameOrigin(request);
    const { id } = await params;
    return NextResponse.json({ draft: await revalidateEbayDraft(id) });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Der eBay-Entwurf konnte nicht neu geprüft werden.",
      },
      { status: 400 }
    );
  }
}
