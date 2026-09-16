import {
  ShopwareSyncSettings,
  SyncCapability,
  SyncDirection,
} from "@/types/shopwareSync";

const WECLAPP_DOCUMENTATION =
  "https://doc.weclapp.com/documentation/erste-schritte-shopanbindung/shopware-6/";
const SHOPWARE_STORE =
  "https://store.shopware.com/de/wecla27500632504f/weclapp-cloud-erp-kostenlose-shopware-schnittstelle.html";

export const SYNC_CAPABILITIES: SyncCapability[] = [
  {
    id: "products",
    group: "Artikel",
    title: "Artikelstammdaten",
    description:
      "Artikel einzeln oder gesammelt vergleichen, anlegen und aktualisieren; Datenhoheit je Richtung.",
    direction: "bidirectional",
    state: "configuration_required",
    correctionSupported: true,
    sourceUrl: SHOPWARE_STORE,
  },
  {
    id: "variants",
    group: "Artikel",
    title: "Varianten",
    description:
      "Elternartikel, Varianten, Variantenartikelnummern und ihre Zuordnung.",
    direction: "bidirectional",
    state: "configuration_required",
    correctionSupported: true,
    sourceUrl: WECLAPP_DOCUMENTATION,
  },
  {
    id: "product_translations",
    group: "Artikel",
    title: "Übersetzungen",
    description:
      "Mehrsprachige Artikelnamen, Beschreibungen, Varianten und Eigenschaften.",
    direction: "bidirectional",
    state: "configuration_required",
    correctionSupported: true,
    sourceUrl: WECLAPP_DOCUMENTATION,
  },
  {
    id: "properties",
    group: "Artikel",
    title: "Eigenschaften",
    description:
      "Shopware-Eigenschaften und Optionen mit weclapp-Attributen abgleichen.",
    direction: "bidirectional",
    state: "configuration_required",
    correctionSupported: true,
    sourceUrl: SHOPWARE_STORE,
  },
  {
    id: "media",
    group: "Artikel",
    title: "Bilder & Medien",
    description:
      "Freigegebene Artikelbilder übernehmen, Reihenfolge prüfen und Titel dokumentieren.",
    direction: "weclapp_to_shopware",
    state: "available",
    correctionSupported: true,
    sourceUrl: SHOPWARE_STORE,
  },
  {
    id: "categories",
    group: "Artikel",
    title: "Kategorien",
    description: "Artikel- und Shopkategorien über feste Zuordnungen verbinden.",
    direction: "bidirectional",
    state: "configuration_required",
    correctionSupported: true,
    sourceUrl: SHOPWARE_STORE,
  },
  {
    id: "manufacturers",
    group: "Artikel",
    title: "Hersteller",
    description: "Hersteller anhand expliziter Zuordnungen synchronisieren.",
    direction: "bidirectional",
    state: "configuration_required",
    correctionSupported: true,
    sourceUrl: WECLAPP_DOCUMENTATION,
  },
  {
    id: "units",
    group: "Artikel",
    title: "Einheiten",
    description:
      "Mengeneinheiten abbilden; Verpackungseinheiten werden nicht als direkte Shopware-Funktion behauptet.",
    direction: "bidirectional",
    state: "configuration_required",
    correctionSupported: true,
    sourceUrl: WECLAPP_DOCUMENTATION,
  },
  {
    id: "base_prices",
    group: "Preise & Bestand",
    title: "Grundpreise",
    description:
      "Grundpreisfelder und die dokumentierte Preisstaffel 0 kontrolliert abbilden.",
    direction: "bidirectional",
    state: "configuration_required",
    correctionSupported: true,
    sourceUrl: WECLAPP_DOCUMENTATION,
  },
  {
    id: "prices",
    group: "Preise & Bestand",
    title: "Verkaufspreise",
    description:
      "Brutto-/Nettopreise, Währungen, Verkaufskanäle und Kundengruppenpreise.",
    direction: "bidirectional",
    state: "configuration_required",
    correctionSupported: true,
    sourceUrl: WECLAPP_DOCUMENTATION,
  },
  {
    id: "tier_prices",
    group: "Preise & Bestand",
    title: "Staffelpreise",
    description:
      "Erweiterte Preise ab Staffel 1, je Währung und Kundengruppe abgleichen.",
    direction: "bidirectional",
    state: "configuration_required",
    correctionSupported: true,
    sourceUrl: WECLAPP_DOCUMENTATION,
  },
  {
    id: "stock",
    group: "Preise & Bestand",
    title: "Lagerbestand",
    description:
      "Ausgewählte weclapp-Lagerbestände mit optionalem Sicherheitsbestand an Shopware melden.",
    direction: "weclapp_to_shopware",
    state: "available",
    correctionSupported: true,
    sourceUrl: SHOPWARE_STORE,
  },
  {
    id: "customers",
    group: "Kunden & Bestellungen",
    title: "Kunden",
    description:
      "Kunden anhand E-Mail oder Shop-Kundennummer erkennen und zuordnen.",
    direction: "bidirectional",
    state: "configuration_required",
    correctionSupported: true,
    sourceUrl: WECLAPP_DOCUMENTATION,
  },
  {
    id: "orders",
    group: "Kunden & Bestellungen",
    title: "Bestellungen",
    description:
      "Ausgewählte Shopware-Status, Sicherheitszeitraum, Zahlungsart und Auftragsart nach weclapp.",
    direction: "shopware_to_weclapp",
    state: "available",
    correctionSupported: true,
    sourceUrl: SHOPWARE_STORE,
  },
  {
    id: "order_confirmation",
    group: "Kunden & Bestellungen",
    title: "Auftragsbestätigung",
    description:
      "Auf Wunsch nach erfolgreichem Bestellimport in weclapp erzeugen.",
    direction: "shopware_to_weclapp",
    state: "configuration_required",
    correctionSupported: true,
    sourceUrl: SHOPWARE_STORE,
  },
  {
    id: "deliveries",
    group: "Kunden & Bestellungen",
    title: "Lieferungen",
    description: "weclapp-Lieferstatus kontrolliert an Shopware zurückmelden.",
    direction: "weclapp_to_shopware",
    state: "configuration_required",
    correctionSupported: true,
    sourceUrl: SHOPWARE_STORE,
  },
  {
    id: "tracking",
    group: "Kunden & Bestellungen",
    title: "Paket & Tracking",
    description:
      "Tracking-ID, Tracking-Link und Versandart aus weclapp nach Shopware übertragen.",
    direction: "weclapp_to_shopware",
    state: "configuration_required",
    correctionSupported: true,
    sourceUrl: WECLAPP_DOCUMENTATION,
  },
  {
    id: "cancellations",
    group: "Kunden & Bestellungen",
    title: "Stornierungen",
    description: "Stornierungen mit klarer Datenhoheit und Vorschau abgleichen.",
    direction: "bidirectional",
    state: "configuration_required",
    correctionSupported: true,
    sourceUrl: SHOPWARE_STORE,
  },
  {
    id: "status",
    group: "Kunden & Bestellungen",
    title: "Statusregeln",
    description:
      "Prioritäten, Abhängigkeiten und Wartebedingungen für Bestell-, Zahlungs- und Lieferstatus.",
    direction: "bidirectional",
    state: "configuration_required",
    correctionSupported: true,
    sourceUrl: WECLAPP_DOCUMENTATION,
  },
  {
    id: "monitoring",
    group: "Betrieb",
    title: "Protokoll, Fehler & Wiederholung",
    description:
      "Jede Planung, Korrektur, Freigabe und Ausführung protokollieren; fehlgeschlagene Vorgänge gezielt wiederholen.",
    direction: "bidirectional",
    state: "configuration_required",
    correctionSupported: true,
    sourceUrl: WECLAPP_DOCUMENTATION,
  },
];

export const DEFAULT_SYNC_SETTINGS: ShopwareSyncSettings = {
  schemaVersion: 1,
  global: {
    automationEnabled: false,
    dryRunRequired: true,
    batchLimit: 25,
  },
  products: {
    enabled: false,
    direction: "weclapp_to_shopware",
    master: "weclapp",
    createInactive: true,
    overwriteDescriptions: false,
  },
  prices: {
    enabled: false,
    direction: "weclapp_to_shopware",
    grossPriceSource: "GROSS1",
    basePriceTier: 0,
  },
  stock: {
    enabled: false,
    direction: "weclapp_to_shopware",
    warehouseIds: [],
    safetyStock: 0,
  },
  customers: {
    enabled: false,
    direction: "bidirectional",
    matchBy: ["email", "customer_number"],
  },
  orders: {
    enabled: false,
    direction: "shopware_to_weclapp",
    safetyDays: 2,
    shopwareStatusIds: [],
    createOrderConfirmation: false,
  },
  deliveries: {
    enabled: false,
    direction: "weclapp_to_shopware",
    transferTracking: true,
  },
  cancellations: {
    enabled: false,
    direction: "bidirectional",
  },
  status: {
    enabled: false,
    direction: "bidirectional",
    waitForDependencies: true,
    priority: ["cancellation", "delivery", "payment", "order"],
  },
  mappings: {
    taxes: [],
    currencies: [],
    units: [],
    manufacturers: [],
    customerGroups: [],
    salesChannels: [],
    paymentMethods: [],
    orderTypes: [],
    shippingMethods: [],
    orderStatuses: [],
    deliveryStatuses: [],
    transactionStatuses: [],
  },
};

const DIRECTIONS: SyncDirection[] = [
  "weclapp_to_shopware",
  "shopware_to_weclapp",
  "bidirectional",
];

function stringArray(value: unknown, maximum = 100) {
  return Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, maximum)
    : [];
}

function bool(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function object(value: unknown) {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : {};
}

function direction(value: unknown, fallback: SyncDirection) {
  return DIRECTIONS.includes(value as SyncDirection)
    ? (value as SyncDirection)
    : fallback;
}

export function normalizeSyncSettings(input: unknown): ShopwareSyncSettings {
  const root = object(input);
  const global = object(root.global);
  const products = object(root.products);
  const prices = object(root.prices);
  const stock = object(root.stock);
  const customers = object(root.customers);
  const orders = object(root.orders);
  const deliveries = object(root.deliveries);
  const cancellations = object(root.cancellations);
  const status = object(root.status);
  const rawMappings = object(root.mappings);

  const mappings = Object.fromEntries(
    Object.keys(DEFAULT_SYNC_SETTINGS.mappings).map((key) => {
      const pairs = Array.isArray(rawMappings[key]) ? rawMappings[key] : [];
      return [
        key,
        pairs
          .map(object)
          .filter(
            (pair) =>
              typeof pair.sourceId === "string" &&
              typeof pair.targetId === "string"
          )
          .slice(0, 250)
          .map((pair) => ({
            sourceId: String(pair.sourceId).trim(),
            targetId: String(pair.targetId).trim(),
            label:
              typeof pair.label === "string"
                ? pair.label.trim().slice(0, 160)
                : undefined,
          })),
      ];
    })
  ) as ShopwareSyncSettings["mappings"];

  const customerMatch = stringArray(customers.matchBy, 2).filter(
    (item): item is "email" | "customer_number" =>
      item === "email" || item === "customer_number"
  );

  return {
    schemaVersion: 1,
    global: {
      automationEnabled: false,
      dryRunRequired: true,
      batchLimit: Math.min(
        100,
        Math.max(1, Math.floor(Number(global.batchLimit) || 25))
      ),
    },
    products: {
      enabled: bool(products.enabled, false),
      direction: direction(products.direction, "weclapp_to_shopware"),
      master: products.master === "shopware" ? "shopware" : "weclapp",
      createInactive: bool(products.createInactive, true),
      overwriteDescriptions: bool(products.overwriteDescriptions, false),
    },
    prices: {
      enabled: bool(prices.enabled, false),
      direction: direction(prices.direction, "weclapp_to_shopware"),
      grossPriceSource:
        typeof prices.grossPriceSource === "string"
          ? prices.grossPriceSource.trim().slice(0, 80) || "GROSS1"
          : "GROSS1",
      basePriceTier: Math.max(0, Math.floor(Number(prices.basePriceTier) || 0)),
    },
    stock: {
      enabled: bool(stock.enabled, false),
      direction: "weclapp_to_shopware",
      warehouseIds: stringArray(stock.warehouseIds),
      safetyStock: Math.max(0, Math.floor(Number(stock.safetyStock) || 0)),
    },
    customers: {
      enabled: false,
      direction: direction(customers.direction, "bidirectional"),
      matchBy: customerMatch.length
        ? customerMatch
        : ["email", "customer_number"],
    },
    orders: {
      enabled: bool(orders.enabled, false),
      direction: "shopware_to_weclapp",
      safetyDays: Math.min(
        60,
        Math.max(2, Math.floor(Number(orders.safetyDays) || 2))
      ),
      shopwareStatusIds: stringArray(orders.shopwareStatusIds),
      createOrderConfirmation: false,
    },
    deliveries: {
      enabled: false,
      direction: "weclapp_to_shopware",
      transferTracking: bool(deliveries.transferTracking, true),
    },
    cancellations: {
      enabled: false,
      direction: direction(cancellations.direction, "bidirectional"),
    },
    status: {
      enabled: false,
      direction: direction(status.direction, "bidirectional"),
      waitForDependencies: bool(status.waitForDependencies, true),
      priority: stringArray(status.priority, 10),
    },
    mappings,
  };
}
