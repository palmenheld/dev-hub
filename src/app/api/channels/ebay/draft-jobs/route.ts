import { NextResponse } from "next/server";
import {
  createEbayDraftJob,
  getEbayDraftJob,
  runEbayDraftJob,
} from "@/services/ebay/draftJobs";
import { getEbayCandidate } from "@/services/ebay/candidates";
import { getEbayDraft } from "@/services/ebay/store";
import { assertSameOrigin } from "@/services/requestSecurity";

export async function GET(request: Request) {
  try {
    const id = new URL(request.url).searchParams.get("id") || "";
    const result = await getEbayDraftJob(id);
    if (!result) {
      return NextResponse.json(
        { error: "Der KI-Auftrag wurde nicht gefunden." },
        { status: 404 }
      );
    }
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Der KI-Auftrag konnte nicht gelesen werden.",
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
      draftId?: unknown;
      templateId?: unknown;
    };
    const draftId =
      typeof body.draftId === "string" &&
      /^[0-9a-f-]{36}$/i.test(body.draftId.trim())
        ? body.draftId.trim()
        : undefined;
    const existingDraft = draftId ? await getEbayDraft(draftId) : null;
    const articleId = existingDraft
      ? existingDraft.source.articleId
      : typeof body.articleId === "string" && /^\d+$/.test(body.articleId.trim())
        ? body.articleId.trim()
        : "";
    if (!articleId) {
      throw new Error(
        draftId
          ? "Der eBay-Entwurf wurde nicht gefunden."
          : "Eine gültige Weclapp-Artikel-ID ist erforderlich."
      );
    }
    const candidate = existingDraft?.source ?? (await getEbayCandidate(articleId));
    const job = await createEbayDraftJob(
      articleId,
      candidate.articleNumber || articleId
    );
    const templateId =
      typeof body.templateId === "string" && body.templateId
        ? body.templateId
        : undefined;
    void runEbayDraftJob(job.id, articleId, templateId, draftId);
    return NextResponse.json({ job }, { status: 202 });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Der KI-Auftrag konnte nicht gestartet werden.",
      },
      { status: 400 }
    );
  }
}
