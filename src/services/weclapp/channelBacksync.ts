import type { EbayListingDraft } from "@/types/ebay";
import type { KleinanzeigenListing } from "@/types/kleinanzeigen";
import type {
  ProductCandidate,
  ProductResearch,
  ShopwareProductDraft,
} from "@/types/shopwarePublishing";
import type { WeclappBacksyncResult } from "@/types/weclappBacksync";
import { getArticle } from "./articles";
import { weclappRequest } from "./client";

export type BacksyncChannel = "shopware" | "ebay" | "kleinanzeigen";

type UnknownRow = Record<string, unknown>;
type ListResponse = { result?: UnknownRow[] };
type ActiveSalesChannel = { key: string; name: string };
type AttributeDefinition = {
  id: string;
  attributeKey?: string;
  label: string;
  attributeType: string;
  entities?: string[];
  active?: boolean;
  readOnly?: boolean;
  selectableValues?: Array<{ id?: string; value?: string }>;
};
type DefinitionSpec = {
  key: string;
  label: string;
  type: "STRING" | "LARGE_TEXT";
};
type SyncPayload = {
  channel: BacksyncChannel;
  articleId: string;
  articleNumber: string;
  title: string;
  description: string;
  price?: number;
  status: string;
  source?: ProductCandidate;
  research?: ProductResearch;
  metaTitle?: string;
  metaDescription?: string;
  category?: string;
  externalId?: string;
  attributes?: Record<string, string | string[]>;
};

const CHANNEL_LABELS: Record<BacksyncChannel, string> = {
  shopware: "Shopware",
  ebay: "eBay",
  kleinanzeigen: "Kleinanzeigen",
};

const CHANNEL_ENV: Record<BacksyncChannel, string> = {
  shopware: "WECLAPP_SHOPWARE_PRICE_CHANNEL",
  ebay: "WECLAPP_EBAY_PRICE_CHANNEL",
  kleinanzeigen: "WECLAPP_KLEINANZEIGEN_PRICE_CHANNEL",
};

const CHANNEL_MATCH: Record<BacksyncChannel, RegExp> = {
  shopware: /shopware/iu,
  ebay: /ebay/iu,
  kleinanzeigen: /kleinanzeigen|anzeigenchef/iu,
};

const COMMON_SPECS: DefinitionSpec[] = [
  { key: "ph_hub_german_name", label: "Palmenheld Hub – Deutscher Name", type: "STRING" },
  { key: "ph_hub_plant_height", label: "Palmenheld Hub – Pflanzenhöhe", type: "STRING" },
  { key: "ph_hub_fertilizer", label: "Palmenheld Hub – Düngebedarf", type: "LARGE_TEXT" },
];

const CHANNEL_SPECS: Record<BacksyncChannel, DefinitionSpec[]> = {
  shopware: [
    { key: "ph_hub_shopware_title", label: "Palmenheld Hub – Shopware Titel", type: "STRING" },
    { key: "ph_hub_shopware_meta_title", label: "Palmenheld Hub – Shopware Meta-Titel", type: "STRING" },
    { key: "ph_hub_shopware_meta_description", label: "Palmenheld Hub – Shopware Meta-Beschreibung", type: "LARGE_TEXT" },
    { key: "ph_hub_shopware_status", label: "Palmenheld Hub – Shopware Status", type: "STRING" },
    { key: "ph_hub_shopware_product_id", label: "Palmenheld Hub – Shopware Produkt-ID", type: "STRING" },
  ],
  ebay: [
    { key: "ph_hub_ebay_title", label: "Palmenheld Hub – eBay Titel", type: "STRING" },
    { key: "ph_hub_ebay_description", label: "Palmenheld Hub – eBay Beschreibung", type: "LARGE_TEXT" },
    { key: "ph_hub_ebay_category", label: "Palmenheld Hub – eBay Kategorie", type: "STRING" },
    { key: "ph_hub_ebay_status", label: "Palmenheld Hub – eBay Status", type: "STRING" },
    { key: "ph_hub_ebay_listing_id", label: "Palmenheld Hub – eBay Listing-ID", type: "STRING" },
  ],
  kleinanzeigen: [
    { key: "ph_hub_kleinanzeigen_title", label: "Palmenheld Hub – Kleinanzeigen Titel", type: "STRING" },
    { key: "ph_hub_kleinanzeigen_description", label: "Palmenheld Hub – Kleinanzeigen Beschreibung", type: "LARGE_TEXT" },
    { key: "ph_hub_kleinanzeigen_category", label: "Palmenheld Hub – Kleinanzeigen Kategorie", type: "STRING" },
    { key: "ph_hub_kleinanzeigen_status", label: "Palmenheld Hub – Kleinanzeigen Status", type: "STRING" },
    { key: "ph_hub_kleinanzeigen_external_id", label: "Palmenheld Hub – Kleinanzeigen Anzeigen-ID", type: "STRING" },
  ],
};

const globalState = globalThis as typeof globalThis & {
  __palmenheldBacksyncLocks?: Map<string, Promise<void>>;
  __palmenheldDefinitionLocks?: Map<string, Promise<AttributeDefinition | null>>;
};
const locks = globalState.__palmenheldBacksyncLocks ??= new Map<string, Promise<void>>();
const definitionLocks = globalState.__palmenheldDefinitionLocks ??= new Map<string, Promise<AttributeDefinition | null>>();
let definitionsCache: { expiresAt: number; values: AttributeDefinition[] } = { expiresAt: 0, values: [] };
let channelsCache: { expiresAt: number; values: ActiveSalesChannel[] } = { expiresAt: 0, values: [] };

function normalized(value: string) {
  return value.normalize("NFKC").toLocaleLowerCase("de-DE").replace(/[^a-z0-9äöüß]+/gu, " ").trim();
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : value === undefined || value === null ? "" : String(value).trim();
}

function resultRow(value: UnknownRow) {
  return value.result && typeof value.result === "object" ? value.result as UnknownRow : value;
}

async function withArticleLock<T>(articleId: string, task: () => Promise<T>) {
  const previous = locks.get(articleId) ?? Promise.resolve();
  let release = () => {};
  const current = new Promise<void>((resolve) => { release = resolve; });
  const chained = previous.then(() => current);
  locks.set(articleId, chained);
  await previous;
  try {
    return await task();
  } finally {
    release();
    if (locks.get(articleId) === chained) locks.delete(articleId);
  }
}

async function activeSalesChannels(force = false) {
  if (!force && channelsCache.expiresAt > Date.now()) return channelsCache.values;
  const response = await weclappRequest<ListResponse>("salesChannel/activeSalesChannels");
  const values = (response.result ?? []).map((row) => ({ key: text(row.key), name: text(row.name) })).filter((row) => row.key && row.name);
  channelsCache = { values, expiresAt: Date.now() + 5 * 60_000 };
  return values;
}

async function customDefinitions(force = false) {
  if (!force && definitionsCache.expiresAt > Date.now()) return definitionsCache.values;
  const values: AttributeDefinition[] = [];
  for (let page = 1; page <= 20; page += 1) {
    const response = await weclappRequest<ListResponse>("customAttributeDefinition", { query: { page, pageSize: 1000 } });
    const batch = response.result ?? [];
    values.push(...batch.map((row) => ({
      id: text(row.id),
      attributeKey: text(row.attributeKey),
      label: text(row.label),
      attributeType: text(row.attributeType),
      entities: Array.isArray(row.entities) ? row.entities.map(text) : [],
      active: row.active !== false,
      readOnly: row.readOnly === true,
      selectableValues: Array.isArray(row.selectableValues)
        ? (row.selectableValues as UnknownRow[]).map((item) => ({ id: text(item.id), value: text(item.value) }))
        : [],
    })).filter((item) => item.id && item.label));
    if (batch.length < 1000) break;
  }
  definitionsCache = { values, expiresAt: Date.now() + 5 * 60_000 };
  return values;
}

function articleDefinitions(definitions: AttributeDefinition[]) {
  return definitions.filter((item) => item.active !== false && item.readOnly !== true && (item.entities ?? []).includes("article"));
}

function definitionByLabel(definitions: AttributeDefinition[], label: string) {
  const wanted = normalized(label);
  return definitions.find((item) => normalized(item.label) === wanted);
}

async function createDefinition(spec: DefinitionSpec, warnings: string[]) {
  const definitions = await customDefinitions();
  const existing = definitions.find((item) => item.attributeKey === spec.key) || definitionByLabel(definitions, spec.label);
  if (existing) return existing;
  try {
    const response = await weclappRequest<UnknownRow>("customAttributeDefinition", {
      method: "POST",
      body: {
        active: true,
        attributeKey: spec.key,
        attributeLabels: [{ labelText: spec.label, locale: "de" }],
        attributeType: spec.type,
        defaultBooleanValue: false,
        entities: ["article"],
        legacyEntities: [],
        inheritOnCopy: true,
        label: spec.label,
        mandatory: false,
        permissions: [],
        publicPageTypes: [],
        readOnly: false,
        selectableValues: [],
        showAttributeEntityType: false,
        showInOverview: true,
        showOnCreationDialog: false,
      },
    });
    const row = resultRow(response);
    const created: AttributeDefinition = {
      id: text(row.id),
      attributeKey: text(row.attributeKey) || spec.key,
      label: text(row.label) || spec.label,
      attributeType: text(row.attributeType) || spec.type,
      entities: ["article"],
      active: true,
      readOnly: false,
      selectableValues: [],
    };
    if (!created.id) throw new Error("Weclapp hat keine Zusatzfeld-ID zurückgegeben.");
    definitionsCache = { expiresAt: 0, values: [] };
    return created;
  } catch (error) {
    warnings.push(`${spec.label} konnte nicht eingerichtet werden: ${error instanceof Error ? error.message : "unbekannter Fehler"}`);
    return null;
  }
}

async function ensureDefinition(spec: DefinitionSpec, warnings: string[]) {
  const existingLock = definitionLocks.get(spec.key);
  if (existingLock) return existingLock;
  const pending = createDefinition(spec, warnings).finally(() => {
    if (definitionLocks.get(spec.key) === pending) definitionLocks.delete(spec.key);
  });
  definitionLocks.set(spec.key, pending);
  return pending;
}

function setAttribute(attributes: UnknownRow[], definition: AttributeDefinition | null | undefined, value: unknown) {
  if (!definition || value === undefined || value === null || text(value) === "") return false;
  const current = attributes.find((item) => text(item.attributeDefinitionId) === definition.id) ?? { attributeDefinitionId: definition.id };
  const next: UnknownRow = { attributeDefinitionId: definition.id };
  const values = Array.isArray(value) ? value.map(text).filter(Boolean) : [text(value)].filter(Boolean);
  if (definition.attributeType === "BOOLEAN") {
    next.booleanValue = value === true || ["true", "ja", "1"].includes(text(value).toLocaleLowerCase("de-DE"));
  } else if (["INTEGER", "DECIMAL"].includes(definition.attributeType)) {
    const numberValue = Number(value);
    if (!Number.isFinite(numberValue)) return false;
    next.numberValue = String(numberValue);
  } else if (definition.attributeType === "LIST") {
    const selected = definition.selectableValues?.find((item) => values.some((entry) => normalized(entry) === normalized(item.value ?? "")));
    if (!selected?.id) return false;
    next.selectedValueId = selected.id;
  } else if (definition.attributeType === "MULTISELECT_LIST") {
    const selected = (definition.selectableValues ?? []).filter((item) => item.id && values.some((entry) => normalized(entry) === normalized(item.value ?? ""))).map((item) => ({ id: item.id }));
    if (!selected.length) return false;
    next.selectedValues = selected;
  } else {
    next.stringValue = text(value).slice(0, definition.attributeType === "LARGE_TEXT" ? 50_000 : 2_000);
  }
  const index = attributes.indexOf(current);
  if (index === -1) attributes.push(next);
  else attributes[index] = next;
  return true;
}

function lightValues(research?: ProductResearch) {
  const value = research?.care.light.text ?? "";
  const result: string[] = [];
  if (/sonne|sonnig/iu.test(value)) result.push("Sonne");
  if (/halbschatten|halbschattig/iu.test(value)) result.push("Halbschatten");
  if (/schatten|schattig/iu.test(value) && !/halbschatten|halbschattig/iu.test(value)) result.push("Schatten");
  return [...new Set(result)];
}

function waterValue(payload: SyncPayload) {
  const explicit = payload.attributes?.Wasserbedarf;
  const candidate = Array.isArray(explicit) ? explicit[0] : explicit;
  if (candidate && /hoch|mittel|niedrig/iu.test(candidate)) return candidate;
  const value = payload.research?.care.water.text ?? "";
  if (/reichlich|viel wasser|stets feucht|hoher wasser/iu.test(value)) return "Hoch";
  if (/sparsam|wenig wasser|trocken|niedriger wasser/iu.test(value)) return "Niedrig";
  return value ? "Mittel" : "";
}

function effective(price: UnknownRow, now = Date.now()) {
  const milliseconds = (value: unknown) => {
    const number = Number(value || 0);
    return number && number < 10_000_000_000 ? number * 1000 : number;
  };
  const start = milliseconds(price.startDate);
  const end = milliseconds(price.endDate);
  return (!start || start <= now) && (!end || end >= now);
}

async function resolveSalesChannel(channel: BacksyncChannel) {
  const active = await activeSalesChannels();
  const configured = process.env[CHANNEL_ENV[channel]]?.trim().toUpperCase();
  if (configured) return active.find((item) => item.key.toUpperCase() === configured) ?? null;
  return active.find((item) => CHANNEL_MATCH[channel].test(item.name)) ?? null;
}

function updatePrice(articlePrices: UnknownRow[], channel: ActiveSalesChannel | null, price: number | undefined, warnings: string[]) {
  if (!Number.isFinite(price) || (price ?? 0) <= 0) return false;
  if (!channel) {
    warnings.push("Für diesen Kanal fehlt in Weclapp ein aktiver eigener Brutto-Vertriebskanal; der Standardpreis wurde nicht verändert.");
    return false;
  }
  if (!channel.key.toUpperCase().startsWith("GROSS") || channel.key.toUpperCase() === "GROSS1") {
    warnings.push(`Der Vertriebskanal ${channel.name} (${channel.key}) ist kein separater Brutto-Kanal; der Preis wurde aus Sicherheitsgründen nicht geschrieben.`);
    return false;
  }
  const candidates = articlePrices.map((item, index) => ({ item, index })).filter(({ item }) => text(item.salesChannel).toUpperCase() === channel.key.toUpperCase() && effective(item)).sort((left, right) => Number(right.item.startDate || 0) - Number(left.item.startDate || 0));
  const formatted = (Math.round((price ?? 0) * 100) / 100).toFixed(2);
  if (candidates[0]) {
    articlePrices[candidates[0].index] = { ...candidates[0].item, price: formatted };
    return true;
  }
  const currencySource = articlePrices.find((item) => text(item.salesChannel).toUpperCase() === "GROSS1" && effective(item)) ?? articlePrices.find((item) => text(item.currencyId));
  const currencyId = text(currencySource?.currencyId);
  if (!currencyId) {
    warnings.push(`Für ${channel.name} konnte keine Währung aus einem bestehenden Artikelpreis abgeleitet werden.`);
    return false;
  }
  articlePrices.push({ currencyId, price: formatted, priceScaleType: "SCALE_FROM", priceScaleValue: "0", salesChannel: channel.key });
  return true;
}

async function syncUnlocked(payload: SyncPayload): Promise<WeclappBacksyncResult> {
  const syncedAt = new Date().toISOString();
  if (process.env.WECLAPP_CHANNEL_BACKSYNC_ENABLED?.trim().toLowerCase() === "false") {
    return { state: "disabled", syncedAt, priceSynced: false, fieldCount: 0, warnings: [], message: "Weclapp-Rücksync ist serverseitig deaktiviert." };
  }
  if (!payload.articleId || !payload.articleNumber) throw new Error("Weclapp-Artikelverknüpfung fehlt.");
  const warnings: string[] = [];
  const desiredSpecs = [...COMMON_SPECS, ...CHANNEL_SPECS[payload.channel]];
  const ensured: Array<AttributeDefinition | null> = [];
  for (const spec of desiredSpecs) {
    ensured.push(await ensureDefinition(spec, warnings));
  }
  const allDefinitions = articleDefinitions(await customDefinitions(true));
  const definitions = [...allDefinitions, ...ensured.filter((item): item is AttributeDefinition => Boolean(item))];
  const article = await getArticle(payload.articleId) as UnknownRow;
  if (text(article.articleNumber) !== payload.articleNumber) throw new Error("Die Weclapp-Artikelnummer hat sich geändert; Rücksync wurde abgebrochen.");
  const attributes = Array.isArray(article.customAttributes) ? structuredClone(article.customAttributes as UnknownRow[]) : [];
  let fieldCount = 0;
  const setLabel = (label: string, value: unknown) => { if (setAttribute(attributes, definitionByLabel(definitions, label), value)) fieldCount += 1; };
  const byKey = (key: string) => definitions.find((item) => item.attributeKey === key);
  const setKey = (key: string, value: unknown) => { if (setAttribute(attributes, byKey(key), value)) fieldCount += 1; };

  setLabel("Botanischer Name", payload.research?.confirmedLatinName || payload.source?.latinName);
  setKey("ph_hub_german_name", payload.research?.confirmedGermanName || payload.source?.germanName);
  setKey("ph_hub_plant_height", payload.source?.heightLabel || (payload.source?.heightCm ? `${payload.source.heightCm} cm` : ""));
  setLabel("Temperaturminimum", Number.isFinite(payload.research?.minTemperatureC) ? `${payload.research?.minTemperatureC} °C` : "");
  setLabel("Winterhart", payload.research ? (payload.research.winterHardy ? "Ja" : "Nein") : "");
  setLabel("Lichtbedarf", lightValues(payload.research));
  setLabel("Wasserbedarf", waterValue(payload));
  setKey("ph_hub_fertilizer", payload.research?.care.fertilizer.text);
  setLabel("Topfdurchmesser", payload.source?.potDiameterCm ? `${payload.source.potDiameterCm} cm` : "");
  setLabel("Topfvolumen", payload.source?.potVolumeLiters ? `${payload.source.potVolumeLiters} l` : "");

  if (payload.channel === "shopware") {
    setKey("ph_hub_shopware_title", payload.title);
    setLabel("Artikelbeschreibung (Shopware6_shop)", payload.description);
    setKey("ph_hub_shopware_meta_title", payload.metaTitle);
    setKey("ph_hub_shopware_meta_description", payload.metaDescription);
    setKey("ph_hub_shopware_status", payload.status);
    setKey("ph_hub_shopware_product_id", payload.externalId);
  } else if (payload.channel === "ebay") {
    setKey("ph_hub_ebay_title", payload.title);
    setKey("ph_hub_ebay_description", payload.description);
    setKey("ph_hub_ebay_category", payload.category);
    setKey("ph_hub_ebay_status", payload.status);
    setKey("ph_hub_ebay_listing_id", payload.externalId);
  } else {
    setKey("ph_hub_kleinanzeigen_title", payload.title);
    setKey("ph_hub_kleinanzeigen_description", payload.description);
    setKey("ph_hub_kleinanzeigen_category", payload.category);
    setKey("ph_hub_kleinanzeigen_status", payload.status);
    setKey("ph_hub_kleinanzeigen_external_id", payload.externalId);
  }
  for (const [label, value] of Object.entries(payload.attributes ?? {})) setLabel(label, value);

  const salesChannel = await resolveSalesChannel(payload.channel);
  const articlePrices = Array.isArray(article.articlePrices) ? structuredClone(article.articlePrices as UnknownRow[]) : [];
  const priceSynced = updatePrice(articlePrices, salesChannel, payload.price, warnings);
  if (!fieldCount && !priceSynced) {
    return { state: warnings.length ? "partial" : "synced", syncedAt, salesChannel: salesChannel?.key, salesChannelName: salesChannel?.name, priceSynced, fieldCount, warnings, message: warnings[0] || "Keine geänderten Weclapp-Werte vorhanden." };
  }
  await weclappRequest(`article/id/${encodeURIComponent(payload.articleId)}`, { method: "PUT", body: { customAttributes: attributes, articlePrices } });
  const state = warnings.length ? "partial" : "synced";
  return {
    state,
    syncedAt,
    salesChannel: salesChannel?.key,
    salesChannelName: salesChannel?.name,
    priceSynced,
    fieldCount,
    warnings,
    message: state === "synced"
      ? `${CHANNEL_LABELS[payload.channel]}-Felder und Preis wurden nach Weclapp zurückgeschrieben.`
      : `${CHANNEL_LABELS[payload.channel]}-Felder wurden nach Weclapp geschrieben; ${warnings.join(" ")}`,
  };
}

export async function syncChannelPayload(payload: SyncPayload) {
  try {
    return await withArticleLock(payload.articleId, () => syncUnlocked(payload));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unbekannter Weclapp-Fehler";
    return { state: "failed", syncedAt: new Date().toISOString(), priceSynced: false, fieldCount: 0, warnings: [message], message: `Weclapp-Rücksync fehlgeschlagen: ${message}` } satisfies WeclappBacksyncResult;
  }
}

export function syncShopwareDraft(draft: ShopwareProductDraft) {
  return syncChannelPayload({
    channel: "shopware",
    articleId: draft.source.articleId,
    articleNumber: draft.source.articleNumber,
    title: draft.title,
    description: draft.descriptionHtml,
    price: draft.price ?? draft.source.price,
    status: draft.status,
    source: draft.source,
    research: draft.research,
    metaTitle: draft.research.metaTitle,
    metaDescription: draft.research.metaDescription,
    externalId: draft.shopwareProductId || draft.pendingShopwareProductId,
  });
}

export function syncEbayDraft(draft: EbayListingDraft) {
  const attributes: Record<string, string | string[]> = { ...draft.aspects };
  if (draft.options?.brand) attributes.Marke = draft.options.brand;
  if (draft.generatedCopy?.itemSpecifics.waterRequirement) attributes.Wasserbedarf = draft.generatedCopy.itemSpecifics.waterRequirement;
  if (draft.generatedCopy?.itemSpecifics.productType) attributes.Produktart = draft.generatedCopy.itemSpecifics.productType;
  if (draft.generatedCopy?.itemSpecifics.features.length) attributes.Besonderheiten = draft.generatedCopy.itemSpecifics.features.join(", ");
  return syncChannelPayload({
    channel: "ebay",
    articleId: draft.source.articleId,
    articleNumber: draft.source.articleNumber,
    title: draft.title,
    description: draft.descriptionHtml,
    price: draft.price,
    status: draft.status,
    source: draft.source,
    research: draft.research,
    category: [draft.categoryId, draft.categoryName].filter(Boolean).join(" · "),
    externalId: draft.listingId || draft.offerId || draft.pendingOfferId,
    attributes,
  });
}

export function syncKleinanzeigenListing(listing: KleinanzeigenListing) {
  if (!listing.articleId) {
    return Promise.resolve({ state: "failed", syncedAt: new Date().toISOString(), priceSynced: false, fieldCount: 0, warnings: ["Weclapp-Artikelverknüpfung fehlt."], message: "Weclapp-Rücksync nicht möglich: Artikelverknüpfung fehlt." } satisfies WeclappBacksyncResult);
  }
  return syncChannelPayload({
    channel: "kleinanzeigen",
    articleId: listing.articleId,
    articleNumber: listing.sku,
    title: listing.title,
    description: listing.description,
    price: listing.price,
    status: listing.status,
    source: listing.source,
    research: listing.research,
    category: [listing.categoryId, listing.category].filter(Boolean).join(" · "),
    externalId: listing.externalId,
    attributes: listing.attributes,
  });
}

export async function getWeclappBacksyncStatus() {
  try {
    const channels = await activeSalesChannels();
    const result = await Promise.all((Object.keys(CHANNEL_LABELS) as BacksyncChannel[]).map(async (channel) => {
      const resolved = await resolveSalesChannel(channel);
      return { channel, label: CHANNEL_LABELS[channel], salesChannel: resolved?.key, salesChannelName: resolved?.name, ready: Boolean(resolved) };
    }));
    return { enabled: process.env.WECLAPP_CHANNEL_BACKSYNC_ENABLED?.trim().toLowerCase() !== "false", channels: result, activeSalesChannels: channels };
  } catch (error) {
    return { enabled: false, channels: [], activeSalesChannels: [], error: error instanceof Error ? error.message : "Weclapp-Vertriebskanäle konnten nicht gelesen werden." };
  }
}
