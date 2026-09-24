import { NextResponse } from "next/server";
import {
  createArticleCapture,
  getArticleCapture,
  listArticleCaptures,
} from "@/services/articleCapture/store";
import { syncArticleCaptureToWeclapp } from "@/services/articleCapture/weclapp";
import { assertSameOrigin } from "@/services/requestSecurity";
import type { ArticleCaptureInput } from "@/types/articleCapture";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json({ articles: await listArticleCaptures() });
  } catch (error) {
    console.error("Artikelaufnahmen konnten nicht geladen werden:", error);
    return NextResponse.json({ error: "Artikelaufnahmen konnten nicht geladen werden." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const input = (await request.json()) as Partial<ArticleCaptureInput>;
    const local = await createArticleCapture({ ...input, articleNumber: "" });
    try {
      const article = await syncArticleCaptureToWeclapp(local.id);
      return NextResponse.json({ article }, { status: 201 });
    } catch (error) {
      const article = await getArticleCapture(local.id);
      return NextResponse.json(
        {
          article,
          error: error instanceof Error ? error.message : "Weclapp-Synchronisierung fehlgeschlagen.",
        },
        { status: 502 }
      );
    }
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Der Artikel konnte nicht gespeichert werden." },
      { status: 400 }
    );
  }
}
