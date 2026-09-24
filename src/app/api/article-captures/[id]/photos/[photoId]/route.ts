import { NextResponse } from "next/server";
import {
  deleteArticleCapturePhoto,
  getArticleCapturePhoto,
} from "@/services/articleCapture/store";
import { assertSameOrigin } from "@/services/requestSecurity";

type Context = { params: Promise<{ id: string; photoId: string }> };

export async function GET(_request: Request, { params }: Context) {
  try {
    const { id, photoId } = await params;
    const result = await getArticleCapturePhoto(id, photoId);
    if (!result) return NextResponse.json({ error: "Foto nicht gefunden." }, { status: 404 });
    return new Response(result.body, {
      headers: {
        "Content-Type": result.photo.contentType,
        "Content-Length": String(result.body.byteLength),
        "Cache-Control": "private, max-age=300",
        "Content-Disposition": `inline; filename="${result.photo.fileName}"`,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Das Foto konnte nicht geladen werden." },
      { status: 400 }
    );
  }
}

export async function DELETE(request: Request, { params }: Context) {
  try {
    assertSameOrigin(request);
    const { id, photoId } = await params;
    const article = await deleteArticleCapturePhoto(id, photoId);
    if (!article) return NextResponse.json({ error: "Artikel nicht gefunden." }, { status: 404 });
    return NextResponse.json({ article });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Das Foto konnte nicht gelöscht werden." },
      { status: 400 }
    );
  }
}
