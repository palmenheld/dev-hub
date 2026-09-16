import { NextResponse } from "next/server";
import { regenerateEbayCopy } from "@/services/ebay/drafts";
import { assertSameOrigin } from "@/services/requestSecurity";

export const maxDuration = 360;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    assertSameOrigin(request);
    const { id } = await params;
    return NextResponse.json({ draft: await regenerateEbayCopy(id) });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Der eBay-Text konnte nicht neu erzeugt werden.",
      },
      { status: 400 }
    );
  }
}
