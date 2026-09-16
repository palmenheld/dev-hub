export type ShopwareConnectionState =
  | "not_configured"
  | "configured"
  | "connected"
  | "error";

export type ShopwareConnection = {
  state: ShopwareConnectionState;
  configured: boolean;
  label: string;
  description: string;
  shopUrl?: string;
  missingConfiguration: string[];
  productCount?: number;
};

export type ShopwareProduct = {
  id: string;
  productNumber: string;
  name: string;
  active: boolean;
  stock: number;
  availableStock?: number;
  imageUrl?: string;
  updatedAt?: string;
};

export type ShopwareProductPage = {
  products: ShopwareProduct[];
  total: number;
  page: number;
  limit: number;
};
