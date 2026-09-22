import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type {
  CreateKleinanzeigenListingInput,
  CreateKleinanzeigenTemplateInput,
  KleinanzeigenListing,
  KleinanzeigenListingStatus,
  KleinanzeigenTemplate,
  UpdateKleinanzeigenListingInput,
} from "@/types/kleinanzeigen";

const dataDirectory =
  process.env.KLEINANZEIGEN_DATA_DIR ??
  path.join(process.cwd(), ".data", "kleinanzeigen");
const listingsFile = path.join(dataDirectory, "listings.json");
const templatesFile = path.join(dataDirectory, "templates.json");

function isMissingFile(error: unknown) {
  return Boolean(
    typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "ENOENT"
  );
}

async function atomicWrite(file: string, value: unknown) {
  await mkdir(dataDirectory, { recursive: true });
  const temporaryFile = `${file}.${randomUUID()}.tmp`;
  await writeFile(temporaryFile, JSON.stringify(value, null, 2), "utf8");
  await rename(temporaryFile, file);
}

export function validateKleinanzeigenListing(
  listing: Pick<
    KleinanzeigenListing,
    | "sku"
    | "title"
    | "description"
    | "price"
    | "priceType"
    | "category"
    | "postalCode"
    | "selectedImageUrls"
    | "uploadedImages"
  >
) {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!listing.sku.trim()) errors.push("Artikelnummer fehlt.");
  if (!listing.title.trim()) errors.push("Titel fehlt.");
  if (listing.title.trim().length > 65) errors.push("Der Titel darf höchstens 65 Zeichen lang sein.");
  if (listing.title.trim().length < 10) warnings.push("Der Titel ist sehr kurz.");
  if (listing.description.trim().length < 20) errors.push("Die Beschreibung ist zu kurz.");
  if (listing.description.length > 4_000) errors.push("Die Beschreibung darf höchstens 4.000 Zeichen lang sein.");
  if (listing.priceType !== "free" && (!Number.isFinite(listing.price) || listing.price <= 0)) {
    errors.push("Ein gültiger Preis fehlt.");
  }
  if (!listing.category.trim()) errors.push("Kategorie fehlt.");
  if (listing.postalCode && !/^\d{5}$/u.test(listing.postalCode)) {
    errors.push("Die Postleitzahl muss fünfstellig sein.");
  }
  const imageCount = new Set([
    ...listing.selectedImageUrls,
    ...listing.uploadedImages.map((image) => image.url),
  ]).size;
  if (imageCount === 0) errors.push("Mindestens ein Bild muss ausgewählt sein.");
  if (imageCount > 20) errors.push("AnzeigenChef unterstützt höchstens 20 Bilder je Anzeige.");
  if (!listing.postalCode) warnings.push("Postleitzahl fehlt; AnzeigenChef muss sie aus dem Konto ergänzen.");
  return { valid: errors.length === 0, errors, warnings };
}

function normalizeListing(raw: Partial<KleinanzeigenListing>): KleinanzeigenListing {
  const now = new Date().toISOString();
  const selectedImageUrls = Array.isArray(raw.selectedImageUrls)
    ? raw.selectedImageUrls.filter(Boolean).slice(0, 20)
    : raw.source?.imageUrls?.filter(Boolean).slice(0, 20) ?? [];
  const listing: KleinanzeigenListing = {
    id: raw.id || randomUUID(),
    articleId: raw.articleId,
    source: raw.source,
    sku: raw.sku || "",
    title: raw.title || "",
    description: raw.description || "",
    research: raw.research,
    sources: raw.sources,
    contentReuse: raw.contentReuse,
    price: Number(raw.price) || 0,
    priceType: raw.priceType || "fixed",
    adType: raw.adType || "offer",
    category: raw.category || "Pflanzen, Bäume & Sträucher",
    categoryId: raw.categoryId,
    attributes: raw.attributes || {},
    location: raw.location || process.env.KLEINANZEIGEN_LOCATION?.trim() || "Nordkirchen",
    postalCode: raw.postalCode || process.env.KLEINANZEIGEN_POSTAL_CODE?.trim() || "",
    street: raw.street,
    contactName: raw.contactName,
    phone: raw.phone,
    shippingProvided: raw.shippingProvided ?? true,
    commercial: raw.commercial ?? true,
    stock: raw.stock,
    selectedImageUrls,
    uploadedImages: raw.uploadedImages || [],
    templateId: raw.templateId,
    templateName: raw.templateName,
    status: raw.status || "draft",
    validation: raw.validation || { valid: false, errors: [], warnings: [] },
    manuallyEdited: raw.manuallyEdited ?? false,
    approvedAt: raw.approvedAt,
    exportedAt: raw.exportedAt,
    anzeigenchefKey: raw.anzeigenchefKey || `palmenheld-${raw.sku || raw.id || randomUUID()}`,
    externalId: raw.externalId,
    externalUrl: raw.externalUrl,
    lastError: raw.lastError,
    createdAt: raw.createdAt || now,
    updatedAt: raw.updatedAt || now,
  };
  listing.validation = validateKleinanzeigenListing(listing);
  if (!listing.validation.valid && listing.status === "ready") listing.status = "draft";
  return listing;
}

async function writeListings(listings: KleinanzeigenListing[]) {
  await atomicWrite(listingsFile, listings);
}

export async function getKleinanzeigenListings() {
  try {
    const parsed = JSON.parse(await readFile(listingsFile, "utf8")) as KleinanzeigenListing[];
    return parsed.map(normalizeListing).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  } catch (error) {
    if (isMissingFile(error)) return [];
    throw error;
  }
}

export async function getKleinanzeigenListing(id: string) {
  return (await getKleinanzeigenListings()).find((listing) => listing.id === id) || null;
}

export async function createKleinanzeigenListing(input: CreateKleinanzeigenListingInput) {
  const listings = await getKleinanzeigenListings();
  const now = new Date().toISOString();
  const listing = normalizeListing({
    ...input,
    id: randomUUID(),
    selectedImageUrls: input.selectedImageUrls || input.source?.imageUrls || [],
    uploadedImages: input.uploadedImages || [],
    status: "draft",
    manuallyEdited: false,
    createdAt: now,
    updatedAt: now,
  });
  await writeListings([listing, ...listings]);
  return listing;
}

export async function updateKleinanzeigenListing(id: string, input: UpdateKleinanzeigenListingInput) {
  const listings = await getKleinanzeigenListings();
  const index = listings.findIndex((listing) => listing.id === id);
  if (index === -1) return null;
  const current = listings[index];
  const approvedAt = input.approved === undefined
    ? current.approvedAt
    : input.approved
      ? new Date().toISOString()
      : undefined;
  const updated = normalizeListing({
    ...current,
    ...input,
    approvedAt,
    manuallyEdited: true,
    status: input.approved ? "ready" : current.status === "exported" ? "draft" : current.status,
    updatedAt: new Date().toISOString(),
  });
  if (input.approved && !updated.validation.valid) {
    updated.approvedAt = undefined;
    updated.status = "draft";
  }
  listings[index] = updated;
  await writeListings(listings);
  return updated;
}

export async function replaceKleinanzeigenListingSource(
  id: string,
  source: NonNullable<KleinanzeigenListing["source"]>
) {
  const listings = await getKleinanzeigenListings();
  const index = listings.findIndex((listing) => listing.id === id);
  if (index === -1) return null;
  const current = listings[index];
  const updated = normalizeListing({
    ...current,
    source,
    sku: source.articleNumber || current.sku,
    price: source.price || current.price,
    stock: source.stock,
    selectedImageUrls: source.imageUrls.length ? source.imageUrls : current.selectedImageUrls,
    approvedAt: undefined,
    status: "draft",
    updatedAt: new Date().toISOString(),
  });
  listings[index] = updated;
  await writeListings(listings);
  return updated;
}

export async function updateKleinanzeigenListingStatus(
  id: string,
  status: KleinanzeigenListingStatus,
  additions: Partial<Pick<KleinanzeigenListing, "externalId" | "externalUrl" | "lastError" | "exportedAt">> = {}
) {
  const listings = await getKleinanzeigenListings();
  const index = listings.findIndex((listing) => listing.id === id);
  if (index === -1) return null;
  const updated = normalizeListing({
    ...listings[index],
    ...additions,
    status,
    updatedAt: new Date().toISOString(),
  });
  listings[index] = updated;
  await writeListings(listings);
  return updated;
}

export async function listKleinanzeigenTemplates() {
  try {
    return (JSON.parse(await readFile(templatesFile, "utf8")) as KleinanzeigenTemplate[])
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  } catch (error) {
    if (isMissingFile(error)) return [];
    throw error;
  }
}

export async function createKleinanzeigenTemplate(input: CreateKleinanzeigenTemplateInput) {
  const templates = await listKleinanzeigenTemplates();
  const now = new Date().toISOString();
  const template: KleinanzeigenTemplate = { ...input, id: randomUUID(), createdAt: now, updatedAt: now };
  const normalized = input.isDefault
    ? templates.map((item) => ({ ...item, isDefault: false }))
    : templates;
  await atomicWrite(templatesFile, [template, ...normalized]);
  return template;
}

export async function deleteKleinanzeigenTemplate(id: string) {
  const templates = await listKleinanzeigenTemplates();
  const next = templates.filter((template) => template.id !== id);
  if (next.length === templates.length) return false;
  await atomicWrite(templatesFile, next);
  return true;
}
