export type KleinanzeigenListingStatus =
  | "draft"
  | "active"
  | "paused"
  | "error";

export type KleinanzeigenListing = {
  id: string;
  articleId?: string;
  sku: string;
  title: string;
  description: string;
  price: number;
  category: string;
  location: string;
  status: KleinanzeigenListingStatus;
  externalId?: string;
  externalUrl?: string;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
};

export type KleinanzeigenConnection = {
  mode: "disabled" | "mock" | "partner-api";
  state: "on_hold" | "test" | "adapter_required";
  canPublish: boolean;
  label: string;
  description: string;
};

export type CreateKleinanzeigenListingInput = {
  articleId?: string;
  sku: string;
  title: string;
  description: string;
  price: number;
  category: string;
  location: string;
};
