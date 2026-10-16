import { NextResponse } from "next/server";
import {
  deleteOverwinteringPhoto,
  getOverwinteringPhoto,
} from "@/services/overwintering/store";
import { assertSameOrigin } from "@/services/requestSecurity";

type Context = {
  params: Promise<{ id: string; plantId: string; photoId: string }>;
};

export async function GET(_request: Request, { params }: Context) {
  try {
    const { id, plantId, photoId } = await params;
    const result = await getOverwinteringPhoto(id, plantId, photoId);
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
    const { id, plantId, photoId } = await params;
    const record = await deleteOverwinteringPhoto(id, plantId, photoId);
    if (!record) return NextResponse.json({ error: "Überwinterung nicht gefunden." }, { status: 404 });
    return NextResponse.json({ record });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Das Foto konnte nicht gelöscht werden." },
      { status: 400 }
    );
  }
}
