export type WarehouseStockPlace = {
  name: string;
  warehouseName: string;
  quantity: number;
  reservedQuantity: number;
  warehouseLevelId: string;
};

export type WarehouseArticle = {
  id: string;
  articleNumber: string;
  name: string;
  description: string;
  active: boolean;
  articleType: string;
  stockQuantity: number;
  reservedQuantity: number;
  availableQuantity: number;
  standardGrossPrice?: { value: number; currency: string };
  warehouseStocks: WarehouseStockPlace[];
  barcode: string;
};

export type WarehouseInventoryEntry = {
  key: string;
  weclappId: string;
  articleNumber: string;
  name: string;
  warehouse: string;
  stock: number;
  count: number;
  updatedAt: number;
};

export type WarehouseInventoryDraft = {
  startedAt: number;
  counts: Record<string, WarehouseInventoryEntry>;
};

export type WarehouseReceiptItem = {
  weclappId: string;
  articleNumber: string;
  name: string;
  quantity: number;
};

export type WarehouseReceiptDraft = {
  supplier: string;
  deliveryNote: string;
  items: Record<string, WarehouseReceiptItem>;
  startedAt: number;
};

export type WarehouseState = {
  version: 1;
  hideInactive: boolean;
  inventory: WarehouseInventoryDraft;
  receipt: WarehouseReceiptDraft;
  recentArticleIds: string[];
  migratedAt?: string;
  migratedFrom?: string;
  updatedAt: string;
};

export type LegacyWarehousePayload = {
  inventory?: unknown;
  receipt?: unknown;
  hideInactive?: unknown;
  exportedAt?: unknown;
  source?: unknown;
};
