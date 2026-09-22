import type { KleinanzeigenListing } from "@/types/kleinanzeigen";

const headers = [
  "id", "account", "itemid", "price", "title", "category", "categoryId",
  "image", ...Array.from({ length: 19 }, (_, index) => `image${index + 2}`),
  "state", "shippingprovided", "folder", "adtype", "attribute", "pricetype",
  "postalcode", "street", "myname", "myphone", "desc", "company", "notes",
  "free01", "free02", "free03", "free04", "free05",
];

function csvCell(value: unknown) {
  return `"${String(value ?? "").replace(/"/gu, '""')}"`;
}

function attributeValue(attributes: Record<string, string>) {
  return Object.entries(attributes)
    .filter(([key, value]) => key.trim() && value.trim())
    .map(([key, value]) => `attributeMap[${key.trim()}]=${value.trim()}`)
    .join("|");
}

function row(listing: KleinanzeigenListing, account: string, folder: string) {
  const images = [
    ...listing.selectedImageUrls,
    ...listing.uploadedImages.map((image) => image.url),
  ].filter((url, index, values) => Boolean(url) && values.indexOf(url) === index).slice(0, 20);
  const values: Record<string, unknown> = {
    id: "",
    account,
    itemid: listing.externalId || "",
    price: listing.priceType === "free" ? 0 : Math.round(listing.price),
    title: listing.title,
    category: listing.category,
    categoryId: listing.categoryId || "",
    state: listing.status === "paused" ? "paused" : listing.status === "active" ? "active" : "stopped",
    shippingprovided: listing.shippingProvided ? "true" : "false",
    folder,
    adtype: listing.adType === "wanted" ? 1 : 0,
    attribute: attributeValue(listing.attributes),
    pricetype: listing.priceType === "negotiable" ? 2 : listing.priceType === "free" ? 3 : 1,
    postalcode: listing.postalCode,
    street: listing.street || "",
    myname: listing.contactName || "",
    myphone: listing.phone || "",
    desc: listing.description,
    company: listing.commercial ? 1 : 0,
    notes: `Palmenheld Hub · SKU ${listing.sku}`,
    free01: listing.anzeigenchefKey,
    free02: listing.sku,
    free03: listing.articleId || "",
    free04: listing.templateName || "",
    free05: "Palmenheld Hub",
  };
  images.forEach((image, index) => {
    values[index === 0 ? "image" : `image${index + 1}`] = image;
  });
  return headers.map((header) => csvCell(values[header])).join(";");
}

export function createAnzeigenchefCsv(
  listings: KleinanzeigenListing[],
  options: { account?: string; folder?: string } = {}
) {
  const account = options.account || process.env.ANZEIGENCHEF_ACCOUNT?.trim() || "";
  const folder = options.folder || process.env.ANZEIGENCHEF_FOLDER?.trim() || "Palmenheld Hub";
  return `\uFEFF${headers.map(csvCell).join(";")}\r\n${listings
    .map((listing) => row(listing, account, folder))
    .join("\r\n")}\r\n`;
}
