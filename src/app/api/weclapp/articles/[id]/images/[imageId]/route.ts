import { NextResponse } from "next/server";
import { getArticleImage, WeclappHttpError } from "@/services/weclapp";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; imageId: string }> }
) {
  try {
    const { id, imageId } = await params;
    const image = await getArticleImage(id, imageId);
    if (!image.contentType.startsWith("image/")) {
      return NextResponse.json(
        { error: "Weclapp hat für diesen Eintrag keine Bilddatei geliefert." },
        { status: 502 }
      );
    }
    return new Response(image.body, {
      headers: {
        "Content-Type": image.contentType,
        "Content-Length": String(image.body.byteLength),
        "Cache-Control": "private, max-age=300",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    const status = error instanceof WeclappHttpError ? error.status : 500;
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Das Weclapp-Bild konnte nicht geladen werden.",
      },
      { status }
    );
  }
}
