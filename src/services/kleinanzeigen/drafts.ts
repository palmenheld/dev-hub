import {
  channelContentReuse,
  findReusableChannelContent,
  renderKleinanzeigenContent,
} from "@/services/channelContent";
import { getProductCandidate } from "@/services/shopware/publishingCandidates";
import { researchProduct } from "@/services/shopware/research";
import { createKleinanzeigenListing, getKleinanzeigenListings } from "./listingStore";

export async function createAutomaticKleinanzeigenDraft(articleId: string) {
  const candidate = await getProductCandidate(articleId);
  const existing = (await getKleinanzeigenListings()).find(
    (listing) =>
      listing.articleId === candidate.articleId ||
      listing.sku === candidate.articleNumber
  );
  if (existing) return existing;

  const missing = [
    !candidate.articleNumber ? "Artikelnummer" : "",
    !candidate.germanName ? "deutscher Name" : "",
    !candidate.price || candidate.price <= 0 ? "Verkaufspreis" : "",
  ].filter(Boolean);
  if (missing.length) {
    throw new Error(
      `Kleinanzeigen-Entwurf nicht möglich. Bitte ergänze: ${missing.join(", ")}.`
    );
  }

  const reuseSource = await findReusableChannelContent(
    candidate,
    "kleinanzeigen"
  );
  const { research, sources } = reuseSource
    ? {
        research: structuredClone(reuseSource.research),
        sources: structuredClone(reuseSource.sources),
      }
    : await researchProduct(candidate);
  const content = renderKleinanzeigenContent(candidate, research);
  return createKleinanzeigenListing({
    articleId: candidate.articleId,
    source: candidate,
    sku: candidate.articleNumber,
    title: content.title,
    description: content.description,
    price: candidate.price!,
    category: "Pflanzen, Bäume & Sträucher",
    location: process.env.KLEINANZEIGEN_LOCATION?.trim() || "Nordkirchen",
    postalCode: process.env.KLEINANZEIGEN_POSTAL_CODE?.trim() || "",
    stock: candidate.stock,
    selectedImageUrls: candidate.imageUrls.slice(0, 20),
    commercial: true,
    shippingProvided: true,
    research,
    sources,
    contentReuse: reuseSource
      ? channelContentReuse(reuseSource)
      : undefined,
  });
}
