import { NextResponse } from "next/server";
import { addArticleCapturePhoto } from "@/services/articleCapture/store";
import { assertSameOrigin } from "@/services/requestSecurity";

export const maxDuration = 60;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    assertSameOrigin(request);
    const formData = await request.formData();
    const file = formData.get("photo");
    if (!(file instanceof File)) throw new Error("Bitte ein Foto auswählen.");
    const article = await addArticleCapturePhoto((await params).id, file);
    return NextResponse.json({ article });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Das Foto konnte nicht gespeichert werden." },
      { status: 400 }
    );
  }
}
