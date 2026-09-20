import { NextResponse } from "next/server";
import {
  getEbayCandidate,
  getEbayCandidates,
} from "@/services/ebay/candidates";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const articleId = url.searchParams.get("articleId")?.trim() || "";
    if (articleId) {
      if (!/^\d+$/.test(articleId)) {
        throw new Error("Eine gültige Weclapp-Artikel-ID ist erforderlich.");
      }
      return NextResponse.json({ candidate: await getEbayCandidate(articleId) });
    }
    const limit = Math.max(1, Math.min(100, Number(url.searchParams.get("limit")) || 40));
    const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
    const onlyActive = ["1", "true"].includes(
      url.searchParams.get("onlyActive") || ""
    );
    const candidates = await getEbayCandidates(
      Math.floor(limit),
      Math.floor(page),
      onlyActive
    );
    return NextResponse.json({
      candidates,
      page,
      hasMore: candidates.length >= limit,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Weclapp-Artikel konnten nicht geladen werden." },
      { status: 500 }
    );
  }
}
