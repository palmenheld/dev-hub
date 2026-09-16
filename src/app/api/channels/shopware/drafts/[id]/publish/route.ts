import { NextResponse } from "next/server";
import { publishDraft } from "@/services/shopware/productWriter";
import { assertSameOrigin } from "@/services/requestSecurity";
import { getDraft } from "@/services/shopware/dataStore";

export const maxDuration = 120;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    assertSameOrigin(request);
    const draft = await publishDraft(id);
    return NextResponse.json({ draft });
  } catch (error) {
    const draft = await getDraft(id);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Das Produkt konnte nicht in Shopware angelegt werden.",
        draft,
      },
      { status: 400 }
    );
  }
}
