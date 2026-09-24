import { NextResponse } from "next/server";
import { addArticleCapturePhoto, getArticleCapture } from "@/services/articleCapture/store";
import { syncArticleCapturePhotoToWeclapp } from "@/services/articleCapture/weclapp";
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
    const file = formData.get("photo");
    if (!(file instanceof File)) throw new Error("Bitte ein Foto auswählen.");
    const local = await addArticleCapturePhoto(id, file);
    const photo = local.photos.at(-1);
    if (!photo || !local.weclappArticleId) {
      return NextResponse.json(
        { article: local, error: "Das Foto wurde gespeichert, aber der Weclapp-Artikel ist noch nicht verknüpft." },
        { status: 502 }
      );
    }
    try {
      const article = await syncArticleCapturePhotoToWeclapp(local, photo);
      return NextResponse.json({ article });
    } catch (error) {
      const article = await getArticleCapture(id);
      return NextResponse.json(
        {
          article,
          error: error instanceof Error ? error.message : "Der Weclapp-Bildtransfer ist fehlgeschlagen.",
        },
        { status: 502 }
      );
    }
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Das Foto konnte nicht gespeichert werden." },
      { status: 400 }
    );
  }
}
