import { NextResponse } from "next/server";
import { getKleinanzeigenListing, updateKleinanzeigenListing } from "@/services/kleinanzeigen";
import { assertSameOrigin } from "@/services/requestSecurity";
import type { UpdateKleinanzeigenListingInput } from "@/types/kleinanzeigen";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const listing = await getKleinanzeigenListing((await params).id);
  return listing
    ? NextResponse.json({ listing })
    : NextResponse.json({ error: "Anzeige nicht gefunden." }, { status: 404 });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const listing = await updateKleinanzeigenListing(
      (await params).id,
      (await request.json()) as UpdateKleinanzeigenListingInput
    );
    return listing
      ? NextResponse.json({ listing })
      : NextResponse.json({ error: "Anzeige nicht gefunden." }, { status: 404 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Anzeige konnte nicht gespeichert werden." }, { status: 400 });
  }
}
