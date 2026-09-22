import { NextResponse } from "next/server";
import {
  createKleinanzeigenListing,
  getKleinanzeigenListings,
} from "@/services/kleinanzeigen";
import type { CreateKleinanzeigenListingInput } from "@/types/kleinanzeigen";
import { getProductCandidate } from "@/services/shopware/publishingCandidates";
import { channelContentReuse, findReusableChannelContent } from "@/services/channelContent";
import { assertSameOrigin } from "@/services/requestSecurity";

export async function GET() {
  try {
    return NextResponse.json({ success: true, listings: await getKleinanzeigenListings() });
  } catch (error) {
    console.error("Kleinanzeigen konnten nicht geladen werden:", error);
    return NextResponse.json({ success: false, error: "Anzeigen konnten nicht geladen werden." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const input = (await request.json()) as Partial<CreateKleinanzeigenListingInput>;
    if (!input.sku?.trim() || !input.title?.trim() || !input.description?.trim()) {
      return NextResponse.json({ success: false, error: "Artikelnummer, Titel und Beschreibung sind erforderlich." }, { status: 400 });
    }
    const candidate = input.articleId ? await getProductCandidate(input.articleId).catch(() => null) : null;
    const reuseSource = candidate ? await findReusableChannelContent(candidate, "kleinanzeigen") : undefined;
    const listing = await createKleinanzeigenListing({
      articleId: input.articleId,
      source: candidate || input.source,
      sku: input.sku,
      title: input.title,
      description: input.description,
      price: Number(input.price) || 0,
      priceType: input.priceType,
      adType: input.adType,
      category: input.category || "Pflanzen, Bäume & Sträucher",
      categoryId: input.categoryId,
      attributes: input.attributes,
      location: input.location || "Nordkirchen",
      postalCode: input.postalCode,
      street: input.street,
      contactName: input.contactName,
      phone: input.phone,
      shippingProvided: input.shippingProvided,
      commercial: input.commercial,
      stock: candidate?.stock ?? input.stock,
      selectedImageUrls: input.selectedImageUrls || candidate?.imageUrls,
      uploadedImages: input.uploadedImages,
      research: reuseSource ? structuredClone(reuseSource.research) : input.research,
      sources: reuseSource ? structuredClone(reuseSource.sources) : input.sources,
      contentReuse: reuseSource ? channelContentReuse(reuseSource) : input.contentReuse,
    });
    return NextResponse.json({ success: true, listing }, { status: 201 });
  } catch (error) {
    console.error("Kleinanzeigen-Entwurf konnte nicht erstellt werden:", error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Entwurf konnte nicht gespeichert werden." }, { status: 500 });
  }
}
