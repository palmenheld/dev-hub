export type ChannelStatus =
  | "online"
  | "draft"
  | "missing";

export type WarehouseStock = {
  name: string;
  quantity: number;
  reservedQuantity: number;
  storagePlaceId: string;
};

export type Article = {
  id: string;
  sku: string;
  name: string;
  subtitle: string;

  active: boolean;

  stock: number;
  reservedStock: number;

  basePrice: number;
  currency: string;

  barcode: string;

  warehouseStocks: WarehouseStock[];

  channels: {
    shop: ChannelStatus;
    ebay: ChannelStatus;
    kleinanzeigen: ChannelStatus;
  };
};
