import { NextResponse } from "next/server";
import { getKleinanzeigenListing, replaceKleinanzeigenListingSource } from "@/services/kleinanzeigen";
import { getProductCandidate } from "@/services/shopware/publishingCandidates";
import { assertSameOrigin } from "@/services/requestSecurity";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const id = (await params).id;
    const current = await getKleinanzeigenListing(id);
    if (!current?.articleId) return NextResponse.json({ error: "Keine Weclapp-Verknüpfung vorhanden." }, { status: 400 });
    const listing = await replaceKleinanzeigenListingSource(id, await getProductCandidate(current.articleId));
    return NextResponse.json({ listing });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Weclapp-Daten konnten nicht geladen werden." }, { status: 400 });
  }
}
