import { NextResponse } from "next/server";
import { removeEbayTemplate } from "@/services/ebay/templates";
import { assertSameOrigin } from "@/services/requestSecurity";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    assertSameOrigin(request);
    const { id } = await params;
    return NextResponse.json({ template: await removeEbayTemplate(id) });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "eBay-Template konnte nicht gelöscht werden.",
      },
      { status: 400 }
    );
  }
}
