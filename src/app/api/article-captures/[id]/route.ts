import { NextResponse } from "next/server";
import {
  getArticleCapture,
  updateArticleCapture,
} from "@/services/articleCapture/store";
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
    const input = (await request.json()) as Partial<ArticleCaptureInput> & {
      photoOrder?: string[];
      primaryPhotoId?: string | null;
    };
    const article = await updateArticleCapture((await params).id, input);
    if (!article) return NextResponse.json({ error: "Artikel nicht gefunden." }, { status: 404 });
    return NextResponse.json({ article });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Der Artikel konnte nicht gespeichert werden." },
      { status: 400 }
    );
  }
}
