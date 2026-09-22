import { NextResponse } from "next/server";
import { createAnzeigenchefCsv } from "@/services/kleinanzeigen/anzeigenchef";
import { getKleinanzeigenListings, updateKleinanzeigenListingStatus } from "@/services/kleinanzeigen";
import { assertSameOrigin } from "@/services/requestSecurity";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const body = (await request.json()) as { ids?: string[] };
    const ids = new Set(body.ids || []);
    const listings = (await getKleinanzeigenListings()).filter((listing) => ids.has(listing.id));
    if (!listings.length) return NextResponse.json({ error: "Keine Anzeigen ausgewählt." }, { status: 400 });
    const blocked = listings.filter((listing) => !listing.validation.valid || !listing.approvedAt);
    if (blocked.length) {
      return NextResponse.json({ error: `${blocked.length} Anzeige(n) sind noch nicht vollständig geprüft und freigegeben.` }, { status: 409 });
    }
    const exportedAt = new Date().toISOString();
    await Promise.all(listings.map((listing) => updateKleinanzeigenListingStatus(listing.id, "exported", { exportedAt, lastError: undefined })));
    return new NextResponse(createAnzeigenchefCsv(listings), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="anzeigenchef-palmenheld-${exportedAt.slice(0, 10)}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Export fehlgeschlagen." }, { status: 400 });
  }
}
