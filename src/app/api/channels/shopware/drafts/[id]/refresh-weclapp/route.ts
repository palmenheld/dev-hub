import { NextResponse } from "next/server";
import { refreshProductDraft } from "@/services/shopware/drafts";
import { assertSameOrigin } from "@/services/requestSecurity";

export const maxDuration = 120;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    assertSameOrigin(request);
    const { id } = await params;
    return NextResponse.json(await refreshProductDraft(id));
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
