import { NextResponse } from "next/server";
import { getPosBootstrap } from "@/services/pos/catalog";
import { getPosConfig } from "@/services/pos/config";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const config = getPosConfig();
    const bootstrap = await getPosBootstrap();
    return NextResponse.json({
      ...bootstrap,
      liveWritesEnabled: config.liveWritesEnabled,
      checkoutPinConfigured: config.checkoutPinConfigured,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Die POS-Verbindung konnte nicht geladen werden." },
      { status: 503 }
    );
  }
}
