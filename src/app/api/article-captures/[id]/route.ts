import { NextResponse } from "next/server";
import {
  getArticleCapture,
  updateArticleCapture,
} from "@/services/articleCapture/store";
import { syncArticleCaptureToWeclapp } from "@/services/articleCapture/weclapp";
import { assertSameOrigin } from "@/services/requestSecurity";
import type { ArticleCaptureInput } from "@/types/articleCapture";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Context) {
  try {
    const article = await getArticleCapture((await params).id);
    if (!article) return NextResponse.json({ error: "Artikel nicht gefunden." }, { status: 404 });
    return NextResponse.json({ article });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Der Artikel konnte nicht geladen werden." },
      { status: 400 }
    );
  }
}

export async function PUT(request: Request, { params }: Context) {
  try {
    assertSameOrigin(request);
    const { id } = await params;
    const input = (await request.json()) as Partial<ArticleCaptureInput> & {
      photoOrder?: string[];
      primaryPhotoId?: string | null;
    };
    const local = await updateArticleCapture(id, input);
    if (!local) return NextResponse.json({ error: "Artikel nicht gefunden." }, { status: 404 });
    try {
      const article = await syncArticleCaptureToWeclapp(id);
      return NextResponse.json({ article });
    } catch (error) {
      const article = await getArticleCapture(id);
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
