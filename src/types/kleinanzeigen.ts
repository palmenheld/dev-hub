import type {
  ChannelContentReuse,
  DraftValidation,
  ProductCandidate,
  ProductResearch,
  ResearchSource,
} from "@/types/shopwarePublishing";

export type KleinanzeigenListingStatus =
  | "draft"
  | "ready"
  | "exported"
  | "active"
  | "paused"
  | "error";

export type KleinanzeigenPriceType = "fixed" | "negotiable" | "free";
export type KleinanzeigenAdType = "offer" | "wanted";

export type KleinanzeigenImage = {
  id: string;
  url: string;
  originalName: string;
  source: "weclapp" | "manual";
  createdAt: string;
};

export type KleinanzeigenListing = {
  id: string;
  articleId?: string;
  source?: ProductCandidate;
  sku: string;
  title: string;
  description: string;
  research?: ProductResearch;
  sources?: ResearchSource[];
  contentReuse?: ChannelContentReuse;
  price: number;
  priceType: KleinanzeigenPriceType;
  adType: KleinanzeigenAdType;
  category: string;
  categoryId?: string;
  attributes: Record<string, string>;
  location: string;
  postalCode: string;
  street?: string;
  contactName?: string;
  phone?: string;
  shippingProvided: boolean;
  commercial: boolean;
  stock?: number;
  selectedImageUrls: string[];
  uploadedImages: KleinanzeigenImage[];
  templateId?: string;
  templateName?: string;
  status: KleinanzeigenListingStatus;
  validation: DraftValidation;
  manuallyEdited: boolean;
  approvedAt?: string;
  exportedAt?: string;
  anzeigenchefKey: string;
  externalId?: string;
  externalUrl?: string;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
};

export type KleinanzeigenConnection = {
  mode: "anzeigenchef-csv" | "mock" | "direct";
  state: "export_ready" | "test" | "credentials_required";
  canExport: boolean;
  canPublish: boolean;
  label: string;
  description: string;
  account?: string;
  folder?: string;
};

export type CreateKleinanzeigenListingInput = {
  articleId?: string;
  source?: ProductCandidate;
  sku: string;
  title: string;
  description: string;
  price: number;
  priceType?: KleinanzeigenPriceType;
  adType?: KleinanzeigenAdType;
  category: string;
  categoryId?: string;
  attributes?: Record<string, string>;
  location: string;
  postalCode?: string;
  street?: string;
  contactName?: string;
  phone?: string;
  shippingProvided?: boolean;
  commercial?: boolean;
  stock?: number;
  selectedImageUrls?: string[];
  uploadedImages?: KleinanzeigenImage[];
  templateId?: string;
  templateName?: string;
  research?: ProductResearch;
  sources?: ResearchSource[];
  contentReuse?: ChannelContentReuse;
};

export type UpdateKleinanzeigenListingInput = Partial<
  Omit<
    CreateKleinanzeigenListingInput,
    "articleId" | "source" | "research" | "sources" | "contentReuse"
  >
> & {
  approved?: boolean;
};

export type KleinanzeigenTemplate = {
  id: string;
  name: string;
  titlePattern: string;
  descriptionPrefix: string;
  descriptionSuffix: string;
  priceAdjustmentPercent: number;
  priceType: KleinanzeigenPriceType;
  adType: KleinanzeigenAdType;
  category: string;
  categoryId?: string;
  attributes: Record<string, string>;
  location: string;
  postalCode: string;
  street?: string;
  contactName?: string;
  phone?: string;
  shippingProvided: boolean;
  commercial: boolean;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CreateKleinanzeigenTemplateInput = Omit<
  KleinanzeigenTemplate,
  "id" | "createdAt" | "updatedAt"
>;
