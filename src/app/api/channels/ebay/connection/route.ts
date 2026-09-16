import { NextResponse } from "next/server";
import { getEbayConnection } from "@/services/ebay/config";
import { loadEbaySetup } from "@/services/ebay/metadata";
import { getEbaySettings } from "@/services/ebay/store";
import { assertSameOrigin } from "@/services/requestSecurity";

export async function GET() {
  const settings = await getEbaySettings();
  return NextResponse.json({ connection: getEbayConnection(settings) });
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    return NextResponse.json({ setup: await loadEbaySetup() });
  } catch (error) {
    const settings = await getEbaySettings();
    return NextResponse.json(
      {
        connection: {
          ...getEbayConnection(settings),
          state: "error",
          label: "eBay-Verbindung fehlgeschlagen",
          description:
            error instanceof Error ? error.message : "Unbekannter eBay-Fehler",
        },
        error: error instanceof Error ? error.message : "Verbindungstest fehlgeschlagen.",
      },
      { status: 400 }
    );
  }
}
