import { NextResponse } from "next/server";
import {
  channelContentReuse,
  findReusableChannelContent,
  renderKleinanzeigenContent,
} from "@/services/channelContent";
import { getProductCandidate } from "@/services/shopware/publishingCandidates";

export async function GET(request: Request) {
  try {
    const articleId = new URL(request.url).searchParams.get("articleId")?.trim();
    if (!articleId) {
      return NextResponse.json(
        { success: false, error: "Artikel-ID fehlt." },
        { status: 400 }
      );
    }
    const candidate = await getProductCandidate(articleId);
    const source = await findReusableChannelContent(candidate, "kleinanzeigen");
    if (!source) {
      return NextResponse.json({ success: true, reused: false });
    }
    return NextResponse.json({
      success: true,
      reused: true,
      content: renderKleinanzeigenContent(candidate, source.research),
      reuse: channelContentReuse(source),
    });
  } catch (error) {
    console.error("Kanalinhalt für Kleinanzeigen konnte nicht geladen werden:", error);
    return NextResponse.json(
      { success: false, error: "Vorhandener Kanalinhalt konnte nicht geladen werden." },
      { status: 500 }
    );
  }
}
