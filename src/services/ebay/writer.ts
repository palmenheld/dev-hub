import type { EbayListingDraft } from "@/types/ebay";
import { getArticleImage } from "@/services/weclapp";
import { withEbayMutationLock } from "./lock";
import { getEbayCandidate } from "./candidates";
import { ebayFormDataRequest, ebayRequest } from "./client";
import { getEbayConnection, missingPublishingSettings } from "./config";
import { getEbayDraft, getEbaySettings, saveEbayDraft } from "./store";

type Offer = {
  offerId?: string;
  status?: string;
  listing?: { listingId?: string; listingStatus?: string };
};
type OffersResponse = { offers?: Offer[] };
type ImageResponse = { imageId?: string; imageUrl?: string };

function changedSourceFields(
  saved: EbayListingDraft["source"],
  current: EbayListingDraft["source"]
) {
  const changes: string[] = [];
  const compare = (label: string, left: unknown, right: unknown) => {
    if (JSON.stringify(left) !== JSON.stringify(right)) changes.push(label);
  };
  compare("Artikelnummer", saved.articleNumber, current.articleNumber);
  compare("Name", saved.germanName, current.germanName);
  compare("lateinischer Name", saved.latinName, current.latinName);
  compare("Höhe", [saved.heightMinCm, saved.heightMaxCm], [
    current.heightMinCm,
    current.heightMaxCm,
  ]);
  compare("Topfgröße", saved.potSize, current.potSize);
  compare("Preis", saved.price, current.price);
  compare("Bestand", saved.stock, current.stock);
  compare("Bilder", saved.imageUrls, current.imageUrls);
  return changes;
}

function assertDraftTarget(
  draft: EbayListingDraft,
  settings: Awaited<ReturnType<typeof getEbaySettings>>
) {
  const connection = getEbayConnection(settings);
  if (
    draft.environment !== connection.environment ||
    draft.marketplaceId !== settings.marketplaceId
  ) {
    throw new Error(
      "Dieser Entwurf gehört zu einer anderen eBay-Umgebung oder einem anderen Marktplatz."
    );
  }
}

async function offersForSku(sku: string) {
  const result = await ebayRequest<OffersResponse>(
    "sell/inventory/v1/offer?sku=" + encodeURIComponent(sku)
  );
  return result?.offers ?? [];
}

function offerStatus(offer: Offer | undefined) {
  return offer?.status?.trim().toUpperCase() ?? "";
}

function managedStateFromOffer(
  draft: EbayListingDraft,
  offer: Offer,
  options: { lastError?: string; pendingAction?: "pause" | "reactivate" } = {}
) {
  const now = new Date().toISOString();
  const currentStatus = offerStatus(offer);
  const listingId = offer.listing?.listingId || draft.listingId;
  const common = {
    ...draft,
    offerId: offer.offerId || draft.offerId,
    listingId,
    ebayOfferStatus: offer.status,
    ebayListingStatus: offer.listing?.listingStatus,
    lastSyncedAt: now,
    updatedAt: now,
  };
  if (currentStatus === "PUBLISHED" && listingId) {
    return {
      ...common,
      status: "published" as const,
      pendingManagementAction: undefined,
      lastError: options.lastError,
    };
  }
  if (currentStatus === "UNPUBLISHED") {
    return {
      ...common,
      status: "paused" as const,
      pendingManagementAction: undefined,
      lastError: options.lastError,
    };
  }
  return {
    ...common,
    status: "management_reconciliation_required" as const,
    pendingManagementAction: options.pendingAction,
    lastError:
      options.lastError ||
      `eBay meldet den Angebotsstatus ${offer.status || "unbekannt"}. Bitte erneut abgleichen.`,
  };
}

async function managedOfferForDraft(draft: EbayListingDraft) {
  if (draft.offerId) {
    const offer = await ebayRequest<Offer>(
      `sell/inventory/v1/offer/${encodeURIComponent(draft.offerId)}`
    );
    if (!offer) throw new Error("Das eBay-Angebot wurde nicht gefunden.");
    return offer;
  }
  const offers = await offersForSku(draft.source.articleNumber);
  if (offers.length !== 1) {
    throw new Error(
      offers.length
        ? "Für diese SKU wurden mehrere eBay-Angebote gefunden. Eine automatische Zuordnung wäre unsicher."
        : "Für diese SKU wurde kein eBay-Angebot gefunden."
    );
  }
  return offers[0];
}

function trustedImageHosts() {
  const hosts = new Set<string>();
  const baseUrl = process.env.WECLAPP_BASE_URL?.trim();
  if (baseUrl) {
    try {
      hosts.add(new URL(baseUrl).hostname.toLowerCase());
    } catch {}
  }
  for (const host of (process.env.WECLAPP_IMAGE_HOSTS ?? "").split(",")) {
    if (host.trim()) hosts.add(host.trim().toLowerCase());
  }
  return hosts;
}

async function downloadImage(urlValue: string) {
  const internalImage = urlValue.match(
    /^\/api\/weclapp\/articles\/(\d+)\/images\/(\d+)$/
  );
  if (internalImage) {
    const image = await getArticleImage(internalImage[1], internalImage[2]);
    const contentType = image.contentType.toLowerCase();
    if (
      !["image/jpeg", "image/png", "image/gif", "image/webp"].includes(
        contentType
      )
    ) {
      throw new Error(
        `Nicht unterstütztes Bildformat: ${contentType || "unbekannt"}.`
      );
    }
    if (image.body.byteLength > 12 * 1024 * 1024) {
      throw new Error("Ein Bild ist größer als 12 MB.");
    }
    const extensions: Record<string, string> = {
      "image/jpeg": "jpg",
      "image/png": "png",
      "image/gif": "gif",
      "image/webp": "webp",
    };
    return {
      body: image.body,
      contentType,
      extension: extensions[contentType],
    };
  }
  const url = new URL(urlValue);
  if (url.protocol !== "https:") {
    throw new Error("Bilder dürfen nur über HTTPS importiert werden.");
  }
  if (!trustedImageHosts().has(url.hostname.toLowerCase())) {
    throw new Error(
      `Bildquelle ${url.hostname} ist nicht freigegeben. Ergänze WECLAPP_IMAGE_HOSTS.`
    );
  }
  const headers: Record<string, string> = { Accept: "image/*" };
  const baseUrl = process.env.WECLAPP_BASE_URL?.trim();
  const token = process.env.WECLAPP_API_TOKEN?.trim();
  if (
    baseUrl &&
    token &&
    new URL(baseUrl).origin.toLowerCase() === url.origin.toLowerCase()
  ) {
    headers.AuthenticationToken = token;
  }
  const response = await fetch(url, {
    headers,
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    throw new Error(
      `Weclapp-Bild konnte nicht geladen werden (HTTP ${response.status}).`
    );
  }
  const contentType = (response.headers.get("content-type") || "")
    .split(";")[0]
    .trim()
    .toLowerCase();
  if (
    !["image/jpeg", "image/png", "image/gif", "image/webp"].includes(
      contentType
    )
  ) {
    throw new Error(
      `Nicht unterstütztes Bildformat: ${contentType || "unbekannt"}.`
    );
  }
  const body = await response.arrayBuffer();
  if (body.byteLength > 12 * 1024 * 1024) {
    throw new Error("Ein Bild ist größer als 12 MB.");
  }
  const extensions: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/gif": "gif",
    "image/webp": "webp",
  };
  return { body, contentType, extension: extensions[contentType] };
}

async function uploadImages(urls: string[], marketplaceId: string) {
  const selected = urls.slice(0, 24);
  const uploaded: string[] = [];
  for (let offset = 0; offset < selected.length; offset += 3) {
    const batch = await Promise.all(
      selected.slice(offset, offset + 3).map(async (sourceUrl, batchIndex) => {
        const image = await downloadImage(sourceUrl);
        const form = new FormData();
        form.append(
          "image",
          new Blob([image.body], { type: image.contentType }),
          `palmenheld-${offset + batchIndex + 1}.${image.extension}`
        );
        const result = await ebayFormDataRequest<ImageResponse>(
          "commerce/media/v1_beta/image/create_image_from_file",
          form,
          {
            headers: { "X-EBAY-C-MARKETPLACE-ID": marketplaceId },
            timeoutMs: 60_000,
          }
        );
        if (!result.imageUrl) {
          throw new Error(
            "eBay hat für ein Bild keine nutzbare Bildadresse geliefert."
          );
        }
        return result.imageUrl;
      })
    );
    uploaded.push(...batch);
  }
  if (!uploaded.length) {
    throw new Error("Es konnte kein Bild zu eBay übertragen werden.");
  }
  return uploaded;
}

async function publishUnlocked(id: string) {
  const draft = await getEbayDraft(id);
  if (!draft) throw new Error("Der eBay-Entwurf wurde nicht gefunden.");
  if (draft.status === "published") return draft;
  if (draft.status !== "ready" || !draft.validation.valid || !draft.approvedAt) {
    throw new Error("Der Entwurf muss fehlerfrei sein und ausdrücklich freigegeben werden.");
  }

  const settings = await getEbaySettings();
  assertDraftTarget(draft, settings);
  if (JSON.stringify(draft.publishingSettings) !== JSON.stringify(settings)) {
    throw new Error(
      "Das eBay-Ziel oder eine Geschäftsrichtlinie wurde seit der Freigabe geändert. Bitte den Entwurf erneut freigeben."
    );
  }
  const missing = missingPublishingSettings(settings);
  if (missing.length) {
    throw new Error(`Vor dem Veröffentlichen fehlen: ${missing.join(", ")}.`);
  }
  const current = await getEbayCandidate(draft.source.articleId);
  const changes = changedSourceFields(draft.source, current);
  if (changes.length) {
    throw new Error(
      `Weclapp-Daten haben sich geändert (${changes.join(", ")}). Bitte den Entwurf neu erstellen.`
    );
  }
  const sku = draft.source.articleNumber;
  const encodedSku = encodeURIComponent(sku);
  const [existingItem, existingOffers] = await Promise.all([
    ebayRequest<Record<string, unknown>>(
      `sell/inventory/v1/inventory_item/${encodedSku}`,
      { allowNotFound: true }
    ),
    offersForSku(sku),
  ]);
  if (existingItem || existingOffers.length) {
    throw new Error(
      `SKU ${sku} existiert bereits im eBay-Inventar. Es wurde nichts überschrieben.`
    );
  }

  const publishing: EbayListingDraft = {
    ...draft,
    status: "publishing",
    updatedAt: new Date().toISOString(),
    lastError: undefined,
  };
  await saveEbayDraft(publishing);

  let inventoryCreated = false;
  let offerId = "";
  try {
    const options = draft.options;
    const selectedImages = options?.imageUrls?.length
      ? options.imageUrls
      : draft.source.imageUrls;
    const imageUrls = await uploadImages(
      selectedImages,
      settings.marketplaceId
    );
    await ebayRequest(
      `sell/inventory/v1/inventory_item/${encodedSku}`,
      {
        method: "PUT",
        timeoutMs: 45_000,
        body: {
          availability: {
            shipToLocationAvailability: { quantity: draft.quantity },
          },
          condition: options?.condition || draft.condition,
          ...(options?.conditionDescription &&
          (options.condition || draft.condition) !== "NEW"
            ? { conditionDescription: options.conditionDescription }
            : {}),
          ...(options?.packageDetails
            ? {
                packageWeightAndSize: {
                  packageType: options.packageDetails.packageType,
                  shippingIrregular: options.packageDetails.shippingIrregular,
                  dimensions: {
                    unit: "CENTIMETER",
                    length: options.packageDetails.lengthCm,
                    width: options.packageDetails.widthCm,
                    height: options.packageDetails.heightCm,
                  },
                  weight: {
                    unit: "KILOGRAM",
                    value: options.packageDetails.weightKg,
                  },
                },
              }
            : {}),
          product: {
            title: draft.title,
            ...(options?.subtitle ? { subtitle: options.subtitle } : {}),
            description: draft.descriptionHtml,
            aspects: draft.aspects,
            imageUrls,
            ...(options?.brand ? { brand: options.brand } : {}),
            ...(options?.mpn ? { mpn: options.mpn } : {}),
            ...(options?.ean ? { ean: [options.ean] } : {}),
          },
        },
      }
    );
    inventoryCreated = true;

    const offer = await ebayRequest<{ offerId?: string }>(
      "sell/inventory/v1/offer",
      {
        method: "POST",
        timeoutMs: 45_000,
        body: {
          sku,
          marketplaceId: settings.marketplaceId,
          format: "FIXED_PRICE",
          listingDuration: "GTC",
          availableQuantity: draft.quantity,
          categoryId: draft.categoryId,
          merchantLocationKey: settings.merchantLocationKey,
          listingDescription: draft.descriptionHtml,
          listingPolicies: {
            fulfillmentPolicyId: settings.fulfillmentPolicyId,
            paymentPolicyId: settings.paymentPolicyId,
            returnPolicyId: settings.returnPolicyId,
            ...(options?.bestOfferEnabled
              ? {
                  bestOfferTerms: {
                    bestOfferEnabled: true,
                    ...(options.bestOfferAutoAcceptPrice !== undefined
                      ? {
                          autoAcceptPrice: {
                            currency: settings.currency,
                            value: options.bestOfferAutoAcceptPrice.toFixed(2),
                          },
                        }
                      : {}),
                    ...(options.bestOfferAutoDeclinePrice !== undefined
                      ? {
                          autoDeclinePrice: {
                            currency: settings.currency,
                            value: options.bestOfferAutoDeclinePrice.toFixed(2),
                          },
                        }
                      : {}),
                  },
                }
              : {}),
          },
          ...(options?.quantityLimitPerBuyer !== undefined
            ? { quantityLimitPerBuyer: options.quantityLimitPerBuyer }
            : {}),
          includeCatalogProductDetails:
            options?.includeCatalogProductDetails ?? false,
          pricingSummary: {
            price: {
              currency: settings.currency,
              value: draft.price.toFixed(2),
            },
          },
        },
      }
    );
    offerId = offer?.offerId ?? "";
    if (!offerId) throw new Error("eBay hat keine Angebots-ID zurückgegeben.");

    await saveEbayDraft({
      ...publishing,
      pendingOfferId: offerId,
      updatedAt: new Date().toISOString(),
    });

    const published = await ebayRequest<{ listingId?: string }>(
      `sell/inventory/v1/offer/${encodeURIComponent(offerId)}/publish`,
      { method: "POST", timeoutMs: 60_000 }
    );
    if (!published?.listingId) {
      throw new Error("eBay hat keine veröffentlichte Anzeigen-ID zurückgegeben.");
    }

    const complete: EbayListingDraft = {
      ...draft,
      status: "published",
      offerId,
      listingId: published.listingId,
      pendingOfferId: undefined,
      updatedAt: new Date().toISOString(),
      lastError: undefined,
    };
    await saveEbayDraft(complete);
    return complete;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unbekannter eBay-Fehler";
    if (!offerId && !inventoryCreated) {
      let inventoryAbsent = false;
      try {
        const item = await ebayRequest<Record<string, unknown>>(
          `sell/inventory/v1/inventory_item/${encodedSku}`,
          { allowNotFound: true }
        );
        if (item) inventoryCreated = true;
        else inventoryAbsent = true;
      } catch {
        // Without a reliable read-back, retrying could overwrite unknown state.
      }
      if (inventoryAbsent) {
        const retryable: EbayListingDraft = {
          ...draft,
          status: "ready",
          updatedAt: new Date().toISOString(),
          lastError: message,
        };
        await saveEbayDraft(retryable);
        throw error;
      }
    }

    let cleanedUp = false;
    if (!offerId && inventoryCreated) {
      try {
        const offers = await offersForSku(sku);
        if (!offers.length) {
          await ebayRequest(
            `sell/inventory/v1/inventory_item/${encodedSku}`,
            { method: "DELETE" }
          );
          const retryable: EbayListingDraft = {
            ...draft,
            status: "ready",
            updatedAt: new Date().toISOString(),
            lastError: message,
          };
          await saveEbayDraft(retryable);
          cleanedUp = true;
        } else {
          offerId = offers[0]?.offerId ?? "";
        }
      } catch {
        // The final state is deliberately treated as uncertain below.
      }
    }
    if (cleanedUp) throw error;
    if (offerId) {
      try {
        const offer = await ebayRequest<Offer>(
          `sell/inventory/v1/offer/${encodeURIComponent(offerId)}`
        );
        if (offer?.listing?.listingId) {
          const complete: EbayListingDraft = {
            ...draft,
            status: "published",
            offerId,
            listingId: offer.listing.listingId,
            pendingOfferId: undefined,
            updatedAt: new Date().toISOString(),
            lastError: undefined,
          };
          await saveEbayDraft(complete);
          return complete;
        }
      } catch {}
    }

    const uncertain: EbayListingDraft = {
      ...draft,
      status: "reconciliation_required",
      pendingOfferId: offerId || undefined,
      updatedAt: new Date().toISOString(),
      lastError: message,
    };
    await saveEbayDraft(uncertain);
    throw new Error(
      "eBay hat den Vorgang nicht eindeutig abgeschlossen. Es wird nicht automatisch erneut gesendet; bitte den Status abgleichen."
    );
  }
}

async function reconcileUnlocked(id: string) {
  const draft = await getEbayDraft(id);
  if (!draft) throw new Error("Der eBay-Entwurf wurde nicht gefunden.");
  if (draft.status === "published") return draft;
  if (draft.status !== "reconciliation_required" && draft.status !== "publishing") {
    throw new Error("Für diesen Entwurf ist kein Statusabgleich nötig.");
  }
  const settings = await getEbaySettings();
  assertDraftTarget(draft, settings);
  let offer: Offer | undefined;
  if (draft.pendingOfferId) {
    offer =
      (await ebayRequest<Offer>(
        `sell/inventory/v1/offer/${encodeURIComponent(draft.pendingOfferId)}`
      )) ?? undefined;
  } else {
    offer = (await offersForSku(draft.source.articleNumber))[0];
  }
  if (offer?.listing?.listingId) {
    const complete: EbayListingDraft = {
      ...draft,
      status: "published",
      offerId: offer.offerId || draft.pendingOfferId,
      listingId: offer.listing.listingId,
      pendingOfferId: undefined,
      updatedAt: new Date().toISOString(),
      lastError: undefined,
    };
    await saveEbayDraft(complete);
    return complete;
  }
  const unresolved: EbayListingDraft = {
    ...draft,
    status: "reconciliation_required",
    pendingOfferId: offer?.offerId || draft.pendingOfferId,
    updatedAt: new Date().toISOString(),
    lastError:
      "Es existiert ein noch nicht veröffentlichtes eBay-Angebot. Es wurde nichts doppelt angelegt.",
  };
  await saveEbayDraft(unresolved);
  return unresolved;
}

async function resumeUnlocked(id: string) {
  const draft = await getEbayDraft(id);
  if (!draft) throw new Error("Der eBay-Entwurf wurde nicht gefunden.");
  if (draft.status !== "reconciliation_required") {
    throw new Error("Dieser Entwurf hat kein offenes eBay-Angebot.");
  }
  const settings = await getEbaySettings();
  assertDraftTarget(draft, settings);
  if (JSON.stringify(draft.publishingSettings) !== JSON.stringify(settings)) {
    throw new Error(
      "Das eBay-Ziel oder eine Geschäftsrichtlinie wurde seit der Freigabe geändert. Bitte den Zwischenstand prüfen und erneut freigeben."
    );
  }
  const offer =
    (draft.pendingOfferId
      ? await ebayRequest<Offer>(
          `sell/inventory/v1/offer/${encodeURIComponent(draft.pendingOfferId)}`
        )
      : (await offersForSku(draft.source.articleNumber))[0]) || undefined;
  const offerId = offer?.offerId || draft.pendingOfferId;
  if (!offerId) {
    throw new Error("Bei eBay wurde kein fortsetzbares Angebot gefunden.");
  }
  if (offer?.listing?.listingId) {
    const complete: EbayListingDraft = {
      ...draft,
      status: "published",
      offerId,
      listingId: offer.listing.listingId,
      pendingOfferId: undefined,
      updatedAt: new Date().toISOString(),
      lastError: undefined,
    };
    await saveEbayDraft(complete);
    return complete;
  }
  try {
    const published = await ebayRequest<{ listingId?: string }>(
      `sell/inventory/v1/offer/${encodeURIComponent(offerId)}/publish`,
      { method: "POST", timeoutMs: 60_000 }
    );
    if (!published?.listingId) {
      throw new Error("eBay hat keine veröffentlichte Anzeigen-ID zurückgegeben.");
    }
    const complete: EbayListingDraft = {
      ...draft,
      status: "published",
      offerId,
      listingId: published.listingId,
      pendingOfferId: undefined,
      updatedAt: new Date().toISOString(),
      lastError: undefined,
    };
    await saveEbayDraft(complete);
    return complete;
  } catch (error) {
    await saveEbayDraft({
      ...draft,
      status: "reconciliation_required",
      pendingOfferId: offerId,
      updatedAt: new Date().toISOString(),
      lastError: error instanceof Error ? error.message : "eBay-Fehler",
    });
    throw error;
  }
}

async function discardUnlocked(id: string) {
  const draft = await getEbayDraft(id);
  if (!draft) throw new Error("Der eBay-Entwurf wurde nicht gefunden.");
  if (draft.status !== "reconciliation_required") {
    throw new Error("Dieser Entwurf hat keinen verwerfbaren Zwischenstand.");
  }
  const settings = await getEbaySettings();
  assertDraftTarget(draft, settings);
  const offers = await offersForSku(draft.source.articleNumber);
  if (offers.some((offer) => offer.listing?.listingId)) {
    throw new Error("Das Angebot ist bereits live und kann hier nicht verworfen werden.");
  }
  const matchingOffers = draft.pendingOfferId
    ? offers.filter((offer) => offer.offerId === draft.pendingOfferId)
    : offers;
  if (!draft.pendingOfferId && matchingOffers.length > 1) {
    throw new Error(
      "Für diese SKU existieren mehrere eBay-Zwischenstände. Aus Sicherheitsgründen wurde nichts gelöscht."
    );
  }
  if (
    draft.pendingOfferId &&
    (matchingOffers.length === 0 || offers.length !== matchingOffers.length)
  ) {
    throw new Error(
      "Der gespeicherte eBay-Zwischenstand stimmt nicht eindeutig mit den vorhandenen Angeboten überein. Es wurde nichts gelöscht."
    );
  }
  const offerToDelete = matchingOffers[0];
  if (offerToDelete?.offerId) {
    await ebayRequest(
      `sell/inventory/v1/offer/${encodeURIComponent(offerToDelete.offerId)}`,
      { method: "DELETE" }
    );
  }
  await ebayRequest(
    `sell/inventory/v1/inventory_item/${encodeURIComponent(
      draft.source.articleNumber
    )}`,
    { method: "DELETE", allowNotFound: true }
  );
  const reset: EbayListingDraft = {
    ...draft,
    status: "ready",
    approvedAt: undefined,
    offerId: undefined,
    pendingOfferId: undefined,
    updatedAt: new Date().toISOString(),
    lastError: undefined,
  };
  await saveEbayDraft(reset);
  return reset;
}
async function syncManagedUnlocked(id: string) {
  const draft = await getEbayDraft(id);
  if (!draft) throw new Error("Der eBay-Vorgang wurde nicht gefunden.");
  if (
    draft.status !== "published" &&
    draft.status !== "paused" &&
    draft.status !== "management_reconciliation_required"
  ) {
    throw new Error("Für diesen Vorgang gibt es noch kein verwaltbares eBay-Angebot.");
  }
  const settings = await getEbaySettings();
  assertDraftTarget(draft, settings);
  const synced = managedStateFromOffer(
    draft,
    await managedOfferForDraft(draft)
  );
  await saveEbayDraft(synced);
  return synced;
}

async function pauseUnlocked(id: string) {
  const draft = await getEbayDraft(id);
  if (!draft) throw new Error("Der eBay-Vorgang wurde nicht gefunden.");
  if (draft.status === "paused") return draft;
  if (draft.status !== "published") {
    throw new Error(
      "Nur ein eindeutig aktives eBay-Angebot kann pausiert werden. Bitte zuerst den Status abgleichen."
    );
  }
  const settings = await getEbaySettings();
  assertDraftTarget(draft, settings);
  const offer = await managedOfferForDraft(draft);
  const currentStatus = offerStatus(offer);
  if (currentStatus === "UNPUBLISHED") {
    const alreadyPaused = {
      ...managedStateFromOffer(draft, offer),
      pausedAt: draft.pausedAt || new Date().toISOString(),
    };
    await saveEbayDraft(alreadyPaused);
    return alreadyPaused;
  }
  if (currentStatus !== "PUBLISHED") {
    throw new Error(
      `eBay meldet den Status ${offer.status || "unbekannt"}. Bitte zuerst den Status abgleichen.`
    );
  }
  const offerId = offer.offerId || draft.offerId;
  if (!offerId) throw new Error("Die eBay-Angebots-ID fehlt.");

  try {
    await ebayRequest(
      `sell/inventory/v1/offer/${encodeURIComponent(offerId)}/withdraw`,
      { method: "POST", timeoutMs: 60_000 }
    );
    const now = new Date().toISOString();
    const paused: EbayListingDraft = {
      ...draft,
      status: "paused",
      offerId,
      ebayOfferStatus: "UNPUBLISHED",
      lastSyncedAt: now,
      pausedAt: now,
      pendingManagementAction: undefined,
      updatedAt: now,
      lastError: undefined,
    };
    await saveEbayDraft(paused);
    return paused;
  } catch (error) {
    const message = error instanceof Error ? error.message : "eBay-Fehler";
    let readBack: Offer | undefined;
    try {
      readBack = await managedOfferForDraft({ ...draft, offerId });
    } catch {}
    if (readBack && offerStatus(readBack) === "UNPUBLISHED") {
      const paused = {
        ...managedStateFromOffer(draft, readBack),
        pausedAt: draft.pausedAt || new Date().toISOString(),
      };
      await saveEbayDraft(paused);
      return paused;
    }
    if (readBack && offerStatus(readBack) === "PUBLISHED") {
      await saveEbayDraft(managedStateFromOffer(draft, readBack, { lastError: message }));
      throw error;
    }
    await saveEbayDraft({
      ...draft,
      status: "management_reconciliation_required",
      offerId,
      pendingManagementAction: "pause",
      updatedAt: new Date().toISOString(),
      lastError: message,
    });
    throw new Error(
      "eBay hat das Pausieren nicht eindeutig bestätigt. Es wird nicht automatisch wiederholt; bitte den Status abgleichen."
    );
  }
}

async function reactivateUnlocked(id: string) {
  const draft = await getEbayDraft(id);
  if (!draft) throw new Error("Der eBay-Vorgang wurde nicht gefunden.");
  if (draft.status === "published") return draft;
  if (draft.status !== "paused") {
    throw new Error(
      "Nur ein eindeutig pausiertes eBay-Angebot kann reaktiviert werden. Bitte zuerst den Status abgleichen."
    );
  }
  const settings = await getEbaySettings();
  assertDraftTarget(draft, settings);
  const offer = await managedOfferForDraft(draft);
  if (offerStatus(offer) === "PUBLISHED" && offer.listing?.listingId) {
    const alreadyPublished = managedStateFromOffer(draft, offer);
    await saveEbayDraft(alreadyPublished);
    return alreadyPublished;
  }
  if (offerStatus(offer) !== "UNPUBLISHED") {
    throw new Error(
      `eBay meldet den Status ${offer.status || "unbekannt"}. Bitte zuerst den Status abgleichen.`
    );
  }
  const offerId = offer.offerId || draft.offerId;
  if (!offerId) throw new Error("Die eBay-Angebots-ID fehlt.");

  try {
    const result = await ebayRequest<{ listingId?: string }>(
      `sell/inventory/v1/offer/${encodeURIComponent(offerId)}/publish`,
      { method: "POST", timeoutMs: 60_000 }
    );
    if (!result?.listingId) {
      throw new Error("eBay hat keine aktive Anzeigen-ID zurückgegeben.");
    }
    const now = new Date().toISOString();
    const published: EbayListingDraft = {
      ...draft,
      status: "published",
      offerId,
      listingId: result.listingId,
      ebayOfferStatus: "PUBLISHED",
      lastSyncedAt: now,
      reactivatedAt: now,
      pendingManagementAction: undefined,
      updatedAt: now,
      lastError: undefined,
    };
    await saveEbayDraft(published);
    return published;
  } catch (error) {
    const message = error instanceof Error ? error.message : "eBay-Fehler";
    let readBack: Offer | undefined;
    try {
      readBack = await managedOfferForDraft({ ...draft, offerId });
    } catch {}
    if (
      readBack &&
      offerStatus(readBack) === "PUBLISHED" &&
      readBack.listing?.listingId
    ) {
      const published = {
        ...managedStateFromOffer(draft, readBack),
        reactivatedAt: new Date().toISOString(),
      };
      await saveEbayDraft(published);
      return published;
    }
    if (readBack && offerStatus(readBack) === "UNPUBLISHED") {
      await saveEbayDraft(managedStateFromOffer(draft, readBack, { lastError: message }));
      throw error;
    }
    await saveEbayDraft({
      ...draft,
      status: "management_reconciliation_required",
      offerId,
      pendingManagementAction: "reactivate",
      updatedAt: new Date().toISOString(),
      lastError: message,
    });
    throw new Error(
      "eBay hat die Reaktivierung nicht eindeutig bestätigt. Es wird nicht automatisch erneut veröffentlicht; bitte den Status abgleichen."
    );
  }
}


export function publishEbayDraft(id: string) {
  return withEbayMutationLock(`ebay-draft:${id}`, () => publishUnlocked(id));
}

export function reconcileEbayDraft(id: string) {
  return withEbayMutationLock(`ebay-draft:${id}`, () => reconcileUnlocked(id));
}

export function resumeEbayOffer(id: string) {
  return withEbayMutationLock(`ebay-draft:${id}`, () => resumeUnlocked(id));
}

export function discardEbayIntermediate(id: string) {
  return withEbayMutationLock(`ebay-draft:${id}`, () => discardUnlocked(id));
}
export function syncManagedEbayOffer(id: string) {
  return withEbayMutationLock(`ebay-draft:${id}`, () => syncManagedUnlocked(id));
}

export function pauseEbayOffer(id: string) {
  return withEbayMutationLock(`ebay-draft:${id}`, () => pauseUnlocked(id));
}

export function reactivateEbayOffer(id: string) {
  return withEbayMutationLock(`ebay-draft:${id}`, () => reactivateUnlocked(id));
}
