export type SyncProcessId =
  | "products"
  | "variants"
  | "product_translations"
  | "properties"
  | "media"
  | "categories"
  | "manufacturers"
  | "units"
  | "base_prices"
  | "prices"
  | "tier_prices"
  | "stock"
  | "customers"
  | "orders"
  | "order_confirmation"
  | "deliveries"
  | "tracking"
  | "cancellations"
  | "status"
  | "monitoring";

export type SyncDirection =
  | "weclapp_to_shopware"
  | "shopware_to_weclapp"
  | "bidirectional";

export type CapabilityState = "available" | "configuration_required";

export type SyncCapability = {
  id: SyncProcessId;
  group: "Artikel" | "Preise & Bestand" | "Kunden & Bestellungen" | "Betrieb";
  title: string;
  description: string;
  direction: SyncDirection;
  state: CapabilityState;
  correctionSupported: boolean;
  sourceUrl: string;
};

export type MappingPair = {
  sourceId: string;
  targetId: string;
  label?: string;
};

export type ShopwareSyncSettings = {
  schemaVersion: 1;
  global: {
    automationEnabled: boolean;
    dryRunRequired: true;
    batchLimit: number;
  };
  products: {
    enabled: boolean;
    direction: SyncDirection;
    master: "weclapp" | "shopware";
    createInactive: boolean;
    overwriteDescriptions: boolean;
  };
  prices: {
    enabled: boolean;
    direction: SyncDirection;
    grossPriceSource: string;
    basePriceTier: number;
  };
  stock: {
    enabled: boolean;
    direction: "weclapp_to_shopware";
    warehouseIds: string[];
    safetyStock: number;
  };
  customers: {
    enabled: boolean;
    direction: SyncDirection;
    matchBy: Array<"email" | "customer_number">;
  };
  orders: {
    enabled: boolean;
    direction: "shopware_to_weclapp";
    safetyDays: number;
    shopwareStatusIds: string[];
    createOrderConfirmation: boolean;
  };
  deliveries: {
    enabled: boolean;
    direction: "weclapp_to_shopware";
    transferTracking: boolean;
  };
  cancellations: {
    enabled: boolean;
    direction: SyncDirection;
  };
  status: {
    enabled: boolean;
    direction: SyncDirection;
    waitForDependencies: boolean;
    priority: string[];
  };
  mappings: {
    taxes: MappingPair[];
    currencies: MappingPair[];
    units: MappingPair[];
    manufacturers: MappingPair[];
    customerGroups: MappingPair[];
    salesChannels: MappingPair[];
    paymentMethods: MappingPair[];
    orderTypes: MappingPair[];
    shippingMethods: MappingPair[];
    orderStatuses: MappingPair[];
    deliveryStatuses: MappingPair[];
    transactionStatuses: MappingPair[];
  };
};

export type SyncChangeValue = string | number | boolean | null;

export type SyncFieldChange = {
  field: string;
  label: string;
  before: SyncChangeValue;
  proposed: SyncChangeValue;
  editable: boolean;
};

export type SyncChangeItem = {
  id: string;
  entityType: "product" | "price" | "stock" | "customer" | "order" | "delivery" | "cancellation" | "status";
  entityKey: string;
  sourceKey?: string;
  title: string;
  operation: "create" | "update";
  target: "weclapp" | "shopware";
  changes: SyncFieldChange[];
  state: "pending" | "approved" | "applied" | "skipped" | "failed";
  error?: string;
};

export type SyncPlan = {
  id: string;
  process: SyncProcessId;
  createdAt: string;
  updatedAt: string;
  source: "manual" | "automation";
  dryRun: true;
  state: "draft" | "approved" | "applying" | "completed" | "partially_failed";
  items: SyncChangeItem[];
};

export type SyncAuditEntry = {
  id: string;
  createdAt: string;
  process: SyncProcessId;
  action: "plan_created" | "item_corrected" | "plan_approved" | "apply_started" | "item_applied" | "item_failed";
  planId: string;
  itemId?: string;
  message: string;
};
