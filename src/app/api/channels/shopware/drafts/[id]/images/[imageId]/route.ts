import { NextResponse } from "next/server";
import { getShopwareDraftImage } from "@/services/shopware/images";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; imageId: string }> }
) {
  try {
    const { id, imageId } = await params;
    const result = await getShopwareDraftImage(id, imageId);
    if (!result) return NextResponse.json({ error: "Bild nicht gefunden." }, { status: 404 });
    return new Response(result.body, {
      headers: {
        "Content-Type": result.image.contentType,
        "Content-Length": String(result.body.byteLength),
        "Cache-Control": "private, max-age=300",
        "Content-Disposition": `inline; filename="${result.image.fileName}"`,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Das Bild konnte nicht geladen werden." },
      { status: 500 }
    );
  }
}
