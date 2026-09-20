import { NextResponse } from "next/server";
import { addEbayDraftImage } from "@/services/ebay/images";
import { assertSameOrigin } from "@/services/requestSecurity";

export const maxDuration = 60;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    assertSameOrigin(request);
    const { id } = await params;
    const formData = await request.formData();
    const file = formData.get("image");
    if (!(file instanceof File)) {
      throw new Error("Bitte eine Bilddatei auswählen.");
    }
    return NextResponse.json({ draft: await addEbayDraftImage(id, file) });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Das Bild konnte nicht gespeichert werden.",
      },
      { status: 400 }
    );
  }
}
