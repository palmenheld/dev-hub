import { NextResponse } from "next/server";
import {
  getKleinanzeigenConnection,
  updateKleinanzeigenListingStatus,
} from "@/services/kleinanzeigen";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const connection = getKleinanzeigenConnection();

  if (!connection.canPublish || connection.mode !== "mock") {
    return NextResponse.json(
      {
        success: false,
        error:
          "Produktives Pausieren ist erst mit einem freigegebenen Kleinanzeigen-Partneradapter möglich.",
      },
      { status: 503 }
    );
  }

  const listing = await updateKleinanzeigenListingStatus(id, "paused");

  if (!listing) {
    return NextResponse.json(
      { success: false, error: "Anzeige nicht gefunden." },
      { status: 404 }
    );
  }

  return NextResponse.json({ success: true, listing });
}
