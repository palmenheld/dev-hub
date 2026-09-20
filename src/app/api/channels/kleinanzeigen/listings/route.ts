import { NextResponse } from "next/server";
import {
  createKleinanzeigenListing,
  getKleinanzeigenListings,
} from "@/services/kleinanzeigen";
import { CreateKleinanzeigenListingInput } from "@/types/kleinanzeigen";
import { getProductCandidate } from "@/services/shopware/publishingCandidates";
import {
  channelContentReuse,
  findReusableChannelContent,
} from "@/services/channelContent";

function validateInput(input: Partial<CreateKleinanzeigenListingInput>) {
  if (!input.sku?.trim()) return "Artikelnummer fehlt.";
  if (!input.title?.trim()) return "Titel fehlt.";
  if (!input.description?.trim()) return "Beschreibung fehlt.";
  if (!input.category?.trim()) return "Kategorie fehlt.";
  if (!input.location?.trim()) return "Standort fehlt.";
  if (!Number.isFinite(input.price) || Number(input.price) < 0) {
    return "Preis ist ungültig.";
  }

  return null;
}

export async function GET() {
  try {
    return NextResponse.json({
      success: true,
      listings: await getKleinanzeigenListings(),
    });
  } catch (error) {
    console.error("Kleinanzeigen konnten nicht geladen werden:", error);

    return NextResponse.json(
      { success: false, error: "Anzeigen konnten nicht geladen werden." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const input =
      (await request.json()) as Partial<CreateKleinanzeigenListingInput>;
    const validationError = validateInput(input);

    if (validationError) {
      return NextResponse.json(
        { success: false, error: validationError },
        { status: 400 }
      );
    }

    const candidate = input.articleId
      ? await getProductCandidate(input.articleId).catch(() => null)
      : null;
    const reuseSource = candidate
      ? await findReusableChannelContent(candidate, "kleinanzeigen")
      : undefined;
    const listing = await createKleinanzeigenListing({
      articleId: input.articleId,
      sku: input.sku!,
      title: input.title!,
      description: input.description!,
      price: Number(input.price),
      category: input.category!,
      location: input.location!,
      research: reuseSource
        ? structuredClone(reuseSource.research)
        : undefined,
      sources: reuseSource
        ? structuredClone(reuseSource.sources)
        : undefined,
      contentReuse: reuseSource
        ? channelContentReuse(reuseSource)
        : undefined,
    });

    return NextResponse.json({ success: true, listing }, { status: 201 });
  } catch (error) {
    console.error("Kleinanzeigen-Entwurf konnte nicht erstellt werden:", error);

    return NextResponse.json(
      { success: false, error: "Entwurf konnte nicht gespeichert werden." },
      { status: 500 }
    );
  }
}
