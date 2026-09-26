import { NextResponse } from "next/server";
import { searchPosArticles } from "@/services/pos/catalog";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const query = url.searchParams.get("query")?.trim() || "";
    const customerId = url.searchParams.get("customerId")?.trim() || undefined;
    if (query.length < 3 || query.length > 120) throw new Error("Bitte mindestens 3 Zeichen eingeben.");
    return NextResponse.json({ articles: await searchPosArticles(query, customerId) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Die POS-Artikel konnten nicht geladen werden." },
      { status: 400 }
    );
  }
}
