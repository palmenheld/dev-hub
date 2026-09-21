import { NextResponse } from "next/server";
import { assertSameOrigin } from "@/services/requestSecurity";
import { createAutomaticKleinanzeigenDraft } from "@/services/kleinanzeigen/drafts";

export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const body = (await request.json()) as { articleId?: unknown };
    if (typeof body.articleId !== "string" || !body.articleId.trim()) {
      return NextResponse.json(
        { error: "Eine Weclapp-Artikel-ID ist erforderlich." },
        { status: 400 }
      );
    }
    const listing = await createAutomaticKleinanzeigenDraft(
      body.articleId.trim()
    );
    return NextResponse.json({ listing });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Der Kleinanzeigen-Entwurf konnte nicht erstellt werden.",
      },
      { status: 400 }
    );
  }
}
