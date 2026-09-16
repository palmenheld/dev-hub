import { randomUUID } from "node:crypto";
import {
  ShopwareProductDraft,
  ShopwarePublishingSettings,
} from "@/types/shopwarePublishing";
import {
  getDraft,
  getPublishingSettings,
  saveDraft,
} from "./dataStore";
import {
  ShopwareHttpError,
  shopwareBinaryRequest,
  shopwareRequest,
} from "./client";
import { findShopwareProductByNumber } from "./products";
import { getProductCandidate } from "./publishingCandidates";
import { withMutationLock } from "./mutationLock";

type EntityResponse<T> = { data?: T };
type TaxRecord = { id?: string; taxRate?: number };
type CustomFieldSetRecord = { id?: string; name?: string };

const CUSTOM_FIELD_SET_NAME = "palmenheld_product_data";

const CUSTOM_FIELDS = [
  ["palmenheld_latin_name", "Lateinischer Name", "text"],
  ["palmenheld_german_name", "Deutscher Name", "text"],
  ["palmenheld_height_cm", "Versandmaß/Maximalhöhe in cm", "float"],
  ["palmenheld_height_min_cm", "Minimale Verkaufshöhe in cm", "float"],
  ["palmenheld_height_max_cm", "Maximale Verkaufshöhe in cm", "float"],
  ["palmenheld_height_range", "Verkaufshöhe als Bereich", "text"],
  ["palmenheld_pot_size", "Topfgröße", "text"],
  ["palmenheld_pot_diameter_cm", "Topfdurchmesser in cm", "float"],
  ["palmenheld_winter_hardy", "Winterhart", "bool"],
  ["palmenheld_min_temperature_c", "Minimaltemperatur in °C", "float"],
  ["palmenheld_light", "Lichtbedarf", "text"],
  ["palmenheld_water", "Wasserbedarf", "text"],
  ["palmenheld_fertilizer", "Düngebedarf", "text"],
  ["palmenheld_shipping_class", "Versandklasse", "text"],
  ["palmenheld_weclapp_article_id", "Weclapp Artikel-ID", "text"],
  ["palmenheld_weclapp_article_number", "Weclapp Artikelnummer", "text"],
  ["palmenheld_researched_at", "Recherche vom", "text"],
] as const;

function shopwareId() {
  return randomUUID().replaceAll("-", "");
}

function requireSettings(
  settings: ShopwarePublishingSettings
): ShopwarePublishingSettings {
  for (const [key, value] of Object.entries(settings)) {
    if (!/^[0-9a-f]{32}$/i.test(value)) {
      throw new Error(
        `Die Shopware-Einstellung ${key} fehlt. Bitte die Einrichtung speichern.`
      );
    }
  }
  return settings;
}

async function ensureCustomFields() {
  const search = await shopwareRequest<{ data?: CustomFieldSetRecord[] }>(
    "search/custom-field-set",
    {
      method: "POST",
      body: {
        page: 1,
        limit: 1,
        filter: [
          {
            type: "equals",
            field: "name",
            value: CUSTOM_FIELD_SET_NAME,
          },
        ],
        includes: { custom_field_set: ["id", "name"] },
      },
    }
  );
  if ((search.data ?? []).some((set) => set.name === CUSTOM_FIELD_SET_NAME)) {
    return;
  }

  await shopwareRequest("custom-field-set", {
    method: "POST",
    body: {
      name: CUSTOM_FIELD_SET_NAME,
      config: {
        label: {
          "de-DE": "Palmenheld Produktdaten",
          "en-GB": "Palmenheld product data",
        },
      },
      relations: [{ entityName: "product" }],
      customFields: CUSTOM_FIELDS.map(([name, label, type], position) => ({
        name,
        type,
        config: {
          label: { "de-DE": label, "en-GB": label },
          position,
        },
      })),
    },
  });
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

function hasImageSignature(body: ArrayBuffer, contentType: string) {
  const bytes = new Uint8Array(body);
  if (contentType === "image/jpeg") {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (contentType === "image/png") {
    const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    return signature.every((value, index) => bytes[index] === value);
  }
  if (contentType === "image/gif") {
    const header = String.fromCharCode(...bytes.slice(0, 6));
    return header === "GIF87a" || header === "GIF89a";
  }
  if (contentType === "image/webp") {
    return (
      bytes.length >= 12 &&
      String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
      String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
    );
  }
  return false;
}

async function downloadImage(urlValue: string) {
  const url = new URL(urlValue);
  if (url.protocol !== "https:") {
    throw new Error("Bilder dürfen nur über HTTPS importiert werden.");
  }
  const allowedHosts = trustedImageHosts();
  if (!allowedHosts.has(url.hostname.toLowerCase())) {
    throw new Error(
      `Bildquelle ${url.hostname} ist nicht freigegeben. Ergänze WECLAPP_IMAGE_HOSTS.`
    );
  }

  const headers: Record<string, string> = { Accept: "image/*" };
  const baseUrl = process.env.WECLAPP_BASE_URL?.trim();
  const apiToken = process.env.WECLAPP_API_TOKEN?.trim();
  if (
    baseUrl &&
    apiToken &&
    new URL(baseUrl).origin.toLowerCase() === url.origin.toLowerCase()
  ) {
    headers.AuthenticationToken = apiToken;
  }

  const response = await fetch(url, {
    headers,
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    throw new Error(`Bild konnte nicht geladen werden (HTTP ${response.status}).`);
  }

  const contentType = (response.headers.get("content-type") ?? "")
    .split(";")[0]
    .trim()
    .toLowerCase();
  const extensions: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
  };
  const extension = extensions[contentType];
  if (!extension) {
    throw new Error(`Nicht unterstütztes Bildformat: ${contentType || "unbekannt"}.`);
  }

  const declaredLength = Number(response.headers.get("content-length") ?? 0);
  if (declaredLength > 12 * 1024 * 1024) {
    throw new Error("Ein Bild ist größer als 12 MB.");
  }
  const body = await response.arrayBuffer();
  if (body.byteLength > 12 * 1024 * 1024) {
    throw new Error("Ein Bild ist größer als 12 MB.");
  }
  if (!hasImageSignature(body, contentType)) {
    throw new Error("Die Bilddatei stimmt nicht mit ihrem angegebenen Format überein.");
  }
  return { body, contentType, extension };
}

async function uploadImages(draft: ShopwareProductDraft) {
  const uploaded: Array<{
    mediaId: string;
    productMediaId: string;
    position: number;
  }> = [];

  try {
    for (const [position, imageUrl] of draft.source.imageUrls
      .slice(0, 8)
      .entries()) {
      const image = await downloadImage(imageUrl);
      const mediaId = shopwareId();
      const media = {
        mediaId,
        productMediaId: shopwareId(),
        position,
      };
      await shopwareRequest("media", {
        method: "POST",
        body: { id: mediaId },
      });
      uploaded.push(media);
      const fileName = `${draft.source.articleNumber
        .replace(/[^a-z0-9_-]+/gi, "-")
        .slice(0, 60)}-${position + 1}`;
      await shopwareBinaryRequest(
        `_action/media/${mediaId}/upload?extension=${image.extension}&fileName=${encodeURIComponent(fileName)}`,
        image.body,
        image.contentType
      );
    }
    return uploaded;
  } catch (error) {
    await Promise.allSettled(
      uploaded.map((media) =>
        shopwareRequest(`media/${media.mediaId}`, { method: "DELETE" })
      )
    );
    throw error;
  }
}

async function taxRate(taxId: string) {
  const response = await shopwareRequest<EntityResponse<TaxRecord>>(
    `tax/${taxId}`
  );
  const rate = Number(response.data?.taxRate);
  if (!Number.isFinite(rate) || rate < 0) {
    throw new Error("Der gewählte Shopware-Steuersatz konnte nicht gelesen werden.");
  }
  return rate;
}

function roundPrice(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

async function productExistsById(productId: string) {
  try {
    const response = await shopwareRequest<EntityResponse<{ id?: string }>>(
      `product/${productId}`
    );
    return response.data?.id === productId;
  } catch (error) {
    if (error instanceof ShopwareHttpError && error.status === 404) {
      return false;
    }
    throw error;
  }
}

async function cleanupMedia(mediaIds: string[]) {
  await Promise.allSettled(
    mediaIds.map((mediaId) =>
      shopwareRequest(`media/${mediaId}`, { method: "DELETE" })
    )
  );
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unbekannter Shopware-Fehler";
}

function changedSourceFields(
  saved: ShopwareProductDraft["source"],
  current: ShopwareProductDraft["source"]
) {
  const changes: string[] = [];
  const compare = (label: string, left: unknown, right: unknown) => {
    if (JSON.stringify(left) !== JSON.stringify(right)) changes.push(label);
  };
  compare("Artikelnummer", saved.articleNumber, current.articleNumber);
  compare("deutscher Name", saved.germanName, current.germanName);
  compare("lateinischer Name", saved.latinName, current.latinName);
  compare("Höhe", saved.heightCm, current.heightCm);
  compare(
    "Höhenbereich",
    [saved.heightMinCm, saved.heightMaxCm],
    [current.heightMinCm, current.heightMaxCm]
  );
  compare("Topfgröße", saved.potSize ?? "", current.potSize ?? "");
  compare("Topfdurchmesser", saved.potDiameterCm, current.potDiameterCm);
  compare("Preis", saved.price, current.price);
  compare("Preisquelle", saved.priceSource, current.priceSource);
  compare("Preis-Fallback", saved.priceFallback, current.priceFallback);
  compare("Bestand", saved.stock, current.stock);
  compare("Bilder", saved.imageUrls, current.imageUrls);
  compare(
    "Versandklasse",
    saved.shippingClass?.key,
    current.shippingClass?.key
  );
  return changes;
}

async function publishDraftUnlocked(draftId: string) {
  const draft = await getDraft(draftId);
  if (!draft) throw new Error("Der Produktentwurf wurde nicht gefunden.");
  if (draft.status === "published") {
    throw new Error("Dieser Produktentwurf wurde bereits veröffentlicht.");
  }
  if (!draft.validation.valid || draft.status !== "ready") {
    throw new Error(
      "Dieser Entwurf ist wegen fehlender oder unzureichender Belege gesperrt."
    );
  }
  if (!draft.approvedAt) {
    throw new Error(
      "Bitte Inhalt und Quellen vor der Shopware-Übergabe ausdrücklich freigeben."
    );
  }
  const source = draft.source;
  const currentSource = await getProductCandidate(source.articleId);
  const sourceChanges = changedSourceFields(source, currentSource);
  if (sourceChanges.length > 0) {
    throw new Error(
      "Weclapp-Daten haben sich seit der Entwurfserstellung geändert (" +
        sourceChanges.join(", ") +
        "). Bitte Artikel aktualisieren und den KI-Entwurf erneut erstellen."
    );
  }
  if (
    !source.articleNumber ||
    source.price === undefined ||
    source.price === null ||
    !Number.isFinite(source.price) ||
    source.price < 0 ||
    !source.heightCm ||
    !source.shippingClass
  ) {
    throw new Error("Dem Entwurf fehlen Pflichtdaten aus Weclapp.");
  }
  if (await findShopwareProductByNumber(source.articleNumber)) {
    throw new Error(
      `Artikelnummer ${source.articleNumber} ist bereits in Shopware vorhanden.`
    );
  }

  const settings = requireSettings(await getPublishingSettings());
  await ensureCustomFields();
  const rate = await taxRate(settings.taxId);
  const productId = shopwareId();
  await saveDraft({
    ...draft,
    status: "publishing",
    updatedAt: new Date().toISOString(),
    pendingShopwareProductId: productId,
    pendingMediaIds: [],
    lastError: undefined,
  });
  let uploadedMedia: Awaited<ReturnType<typeof uploadImages>> = [];
  try {
    uploadedMedia = await uploadImages(draft);
    await saveDraft({
      ...draft,
      status: "publishing",
      updatedAt: new Date().toISOString(),
      pendingShopwareProductId: productId,
      pendingMediaIds: uploadedMedia.map((media) => media.mediaId),
      lastError: undefined,
    });
    await shopwareRequest("product", {
      method: "POST",
      timeoutMs: 45_000,
      body: {
        id: productId,
        productNumber: source.articleNumber,
        name: draft.title,
        description: draft.descriptionHtml,
        metaTitle: draft.research.metaTitle,
        metaDescription: draft.research.metaDescription,
        keywords: draft.research.keywords.join(", "),
        active: false,
        stock: Math.max(0, Math.floor(source.stock ?? 0)),
        taxId: settings.taxId,
        price: [
          {
            currencyId: settings.currencyId,
            gross: roundPrice(source.price),
            net: roundPrice(source.price / (1 + rate / 100)),
            linked: true,
          },
        ],
        visibilities: [
          {
            salesChannelId: settings.salesChannelId,
            visibility: 30,
          },
        ],
        media: uploadedMedia.map((media) => ({
          id: media.productMediaId,
          mediaId: media.mediaId,
          position: media.position,
        })),
        coverId: uploadedMedia[0]?.productMediaId,
        customFields: {
          palmenheld_latin_name: draft.research.confirmedLatinName,
          palmenheld_german_name: draft.research.confirmedGermanName,
          palmenheld_height_cm: source.heightCm,
          palmenheld_height_min_cm: source.heightMinCm ?? source.heightCm,
          palmenheld_height_max_cm: source.heightMaxCm ?? source.heightCm,
          palmenheld_height_range:
            source.heightLabel ?? String(source.heightCm) + " cm",
          palmenheld_pot_size: source.potSize ?? "",
          palmenheld_pot_diameter_cm: source.potDiameterCm,
          palmenheld_winter_hardy: draft.research.winterHardy,
          palmenheld_min_temperature_c: draft.research.minTemperatureC,
          palmenheld_light: draft.research.care.light.text,
          palmenheld_water: draft.research.care.water.text,
          palmenheld_fertilizer: draft.research.care.fertilizer.text,
          palmenheld_shipping_class: source.shippingClass.key,
          palmenheld_weclapp_article_id: source.articleId,
          palmenheld_weclapp_article_number: source.articleNumber,
          palmenheld_researched_at: draft.createdAt,
        },
      },
    });
  } catch (error) {
    const message = errorMessage(error);
    let productExists: boolean;
    try {
      productExists = await productExistsById(productId);
    } catch (reconciliationError) {
      const uncertain: ShopwareProductDraft = {
        ...draft,
        status: "reconciliation_required",
        updatedAt: new Date().toISOString(),
        pendingShopwareProductId: productId,
        pendingMediaIds: uploadedMedia.map((media) => media.mediaId),
        lastError: `${message} Wiederabgleich: ${errorMessage(reconciliationError)}`,
      };
      await saveDraft(uncertain);
      throw new Error(
        "Shopware hat nicht eindeutig geantwortet. Der Entwurf wurde nicht erneut gesendet und muss über „Status prüfen“ abgeglichen werden."
      );
    }

    if (productExists) {
      const published: ShopwareProductDraft = {
        ...draft,
        status: "published",
        updatedAt: new Date().toISOString(),
        shopwareProductId: productId,
        pendingShopwareProductId: undefined,
        pendingMediaIds: undefined,
        lastError: undefined,
      };
      await saveDraft(published);
      return published;
    }

    await cleanupMedia(uploadedMedia.map((media) => media.mediaId));
    const ready: ShopwareProductDraft = {
      ...draft,
      status: "ready",
      updatedAt: new Date().toISOString(),
      pendingShopwareProductId: undefined,
      pendingMediaIds: undefined,
      lastError: message,
    };
    await saveDraft(ready);
    throw error;
  }

  const published: ShopwareProductDraft = {
    ...draft,
    status: "published",
    updatedAt: new Date().toISOString(),
    shopwareProductId: productId,
    pendingShopwareProductId: undefined,
    pendingMediaIds: undefined,
    lastError: undefined,
  };
  await saveDraft(published);
  return published;
}

async function reconcileDraftUnlocked(draftId: string) {
  const draft = await getDraft(draftId);
  if (!draft) throw new Error("Der Produktentwurf wurde nicht gefunden.");
  if (draft.status === "published") return draft;

  if (
    draft.status !== "reconciliation_required" &&
    draft.status !== "publishing"
  ) {
    throw new Error("Für diesen Entwurf ist kein Wiederabgleich erforderlich.");
  }

  const productId = draft.pendingShopwareProductId;
  if (!productId) {
    throw new Error("Die vorgemerkte Shopware-Produkt-ID fehlt.");
  }

  if (await productExistsById(productId)) {
    const published: ShopwareProductDraft = {
      ...draft,
      status: "published",
      updatedAt: new Date().toISOString(),
      shopwareProductId: productId,
      pendingShopwareProductId: undefined,
      pendingMediaIds: undefined,
      lastError: undefined,
    };
    await saveDraft(published);
    return published;
  }

  await cleanupMedia(draft.pendingMediaIds ?? []);
  const ready: ShopwareProductDraft = {
    ...draft,
    status: "ready",
    updatedAt: new Date().toISOString(),
    pendingShopwareProductId: undefined,
    pendingMediaIds: undefined,
    lastError: undefined,
  };
  await saveDraft(ready);
  return ready;
}

export async function publishDraft(draftId: string) {
  return withMutationLock(`product-draft:${draftId}`, () =>
    publishDraftUnlocked(draftId)
  );
}

export async function reconcileDraft(draftId: string) {
  return withMutationLock(`product-draft:${draftId}`, () =>
    reconcileDraftUnlocked(draftId)
  );
}
