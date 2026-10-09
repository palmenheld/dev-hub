import { NextResponse } from "next/server";
import { assertSameOrigin } from "@/services/requestSecurity";
import { backfillChannelTexts } from "@/services/weclapp/textBackfill";
import type { BacksyncChannel } from "@/services/weclapp/channelBacksync";

const CHANNELS = new Set<BacksyncChannel>(["shopware", "ebay", "kleinanzeigen"]);

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const body = await request.json() as {
      channel?: string;
      offset?: number;
      limit?: number;
    };
    if (!CHANNELS.has(body.channel as BacksyncChannel)) {
      throw new Error("Der Verkaufskanal ist ungültig.");
    }
    const offset = Number(body.offset ?? 0);
    const limit = Number(body.limit ?? 5);
    if (!Number.isFinite(offset) || !Number.isFinite(limit)) {
      throw new Error("Die Stapelangaben sind ungültig.");
    }
    return NextResponse.json(await backfillChannelTexts(
      body.channel as BacksyncChannel,
      offset,
      limit
    ));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Die Texte konnten nicht übertragen werden." },
      { status: 400 }
    );
  }
}
