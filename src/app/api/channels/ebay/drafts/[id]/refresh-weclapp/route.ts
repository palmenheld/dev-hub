import { NextResponse } from "next/server";
import { refreshEbayDraftFromWeclapp } from "@/services/ebay/drafts";
import { assertSameOrigin } from "@/services/requestSecurity";

export const maxDuration = 120;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    assertSameOrigin(request);
    const { id } = await params;
    return NextResponse.json(await refreshEbayDraftFromWeclapp(id));
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Die Weclapp-Daten konnten nicht neu geladen werden.",
      },
      { status: 400 }
    );
  }
}
