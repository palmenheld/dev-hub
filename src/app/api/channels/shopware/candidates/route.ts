import { NextResponse } from "next/server";
import { getProductCandidates } from "@/services/shopware/publishingCandidates";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const requestedLimit = Number(url.searchParams.get("limit") ?? 40);
    const limit = Number.isFinite(requestedLimit)
      ? Math.min(100, Math.max(1, Math.floor(requestedLimit)))
      : 40;
    const requestedPage = Number(url.searchParams.get("page") ?? 1);
    const page = Number.isFinite(requestedPage)
      ? Math.max(1, Math.floor(requestedPage))
      : 1;
    const candidates = await getProductCandidates(limit, undefined, page);
    return NextResponse.json({
      candidates,
      eligible: candidates.filter((candidate) => candidate.eligible).length,
      page,
      hasMore: candidates.length >= Math.min(100, Math.max(1, limit)),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Die Weclapp-Artikel konnten nicht geprüft werden.",
      },
      { status: 500 }
    );
  }
}
