import { NextResponse } from "next/server";
import {
  backfillAutomaticEbayDefaults,
  createEbayDraft,
} from "@/services/ebay/drafts";
import { assertSameOrigin } from "@/services/requestSecurity";
import type { EbayCandidateInput } from "@/types/ebay";

export const maxDuration = 360;

export async function GET() {
  try {
    return NextResponse.json({ drafts: await backfillAutomaticEbayDefaults() });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "eBay-Entwürfe konnten nicht geladen werden." },
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
      candidateInput?: EbayCandidateInput;
    };
    if (typeof body.articleId !== "string" || !/^\d+$/.test(body.articleId.trim())) {
      throw new Error("Eine gültige Weclapp-Artikel-ID ist erforderlich.");
    }
    return NextResponse.json({
      draft: await createEbayDraft(
        body.articleId.trim(),
        body.replaceExisting === true,
        typeof body.templateId === "string" && body.templateId
          ? body.templateId
          : undefined,
        body.candidateInput
      ),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "eBay-Entwurf konnte nicht erstellt werden." },
      { status: 400 }
    );
  }
}
