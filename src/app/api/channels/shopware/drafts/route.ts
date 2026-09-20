import { NextResponse } from "next/server";
import { createProductDraft } from "@/services/shopware/drafts";
import { listDrafts } from "@/services/shopware/dataStore";
import { assertSameOrigin } from "@/services/requestSecurity";

export const maxDuration = 120;

export async function GET() {
  try {
    return NextResponse.json({ drafts: await listDrafts(1000) });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Die Produktentwürfe konnten nicht geladen werden.",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const body = (await request.json()) as {
      articleId?: unknown;
      replaceExisting?: unknown;
      templateId?: unknown;
    };
    if (typeof body.articleId !== "string" || !body.articleId.trim()) {
      return NextResponse.json(
        { error: "Eine Weclapp-Artikel-ID ist erforderlich." },
        { status: 400 }
      );
    }
    const draft = await createProductDraft(
      body.articleId.trim(),
      body.replaceExisting === true,
      typeof body.templateId === "string" && body.templateId.trim()
        ? body.templateId.trim()
        : undefined
    );
    return NextResponse.json({ draft });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Der Produktentwurf konnte nicht erstellt werden.",
      },
      { status: 500 }
    );
  }
}
