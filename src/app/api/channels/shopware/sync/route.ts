import { NextResponse } from "next/server";
import {
  getSyncSettings,
  saveSyncSettings,
} from "@/services/shopware/dataStore";
import { SYNC_CAPABILITIES } from "@/services/shopware/syncCatalog";
import { assertSameOrigin } from "@/services/requestSecurity";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json({
      settings: await getSyncSettings(),
      capabilities: SYNC_CAPABILITIES,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Das Sync-Center konnte nicht geladen werden.",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const settings = await saveSyncSettings(await request.json());
    return NextResponse.json({ settings, capabilities: SYNC_CAPABILITIES });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Die Sync-Einstellungen konnten nicht gespeichert werden.",
      },
      { status: 400 }
    );
  }
}
