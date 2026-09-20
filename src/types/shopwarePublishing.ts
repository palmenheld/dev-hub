export type WeclappFieldKey =
  | "germanName"
  | "latinName"
  | "heightCm"
  | "potSize"
  | "images"
  | "stock";

export type WeclappFieldMap = Record<WeclappFieldKey, string>;

export type WeclappFieldOption = {
  selector: string;
  label: string;
  sample: string;
  detectedFor: WeclappFieldKey[];
};

export type ShippingClass = {
  key: "parcel" | "bulky" | "pallet" | "oversize";
  label: string;
  description: string;
};

export type ProductCandidate = {
  articleId: string;
  articleNumber: string;
  germanName: string;
  latinName: string;
  articleCategoryId?: string;
  articleCategoryName?: string;
  active: boolean;
  heightCm?: number;
  heightMinCm?: number;
  heightMaxCm?: number;
  heightLabel?: string;
  heightSource?: "field" | "product_name" | "manual";
  potSize?: string;
  potDiameterCm?: number;
  potSizeSource?: "field" | "product_name" | "manual";
  price?: number;
  priceSource?: string;
  priceFallback?: boolean;
  stock?: number;
  imageUrls: string[];
  eligible: boolean;
  missing: string[];
  shippingClass?: ShippingClass;
  alreadyInShopware: boolean;
};

export type ResearchSource = {
  id: string;
  title: string;
  url: string;
  publisher: string;
  domain: string;
};

export type SourcedText = {
  text: string;
  sourceIds: string[];
};

export type ProductResearch = {
  researchComplete: boolean;
  gaps: string[];
  confirmedLatinName: string;
  confirmedGermanName: string;
  metaTitle: string;
  metaDescription: string;
  keywords: string[];
  winterHardy: boolean;
  minTemperatureC: number;
  blocks: Array<{
    key:
      | "identity"
      | "appearance"
      | "light"
      | "water"
      | "fertilizer"
      | "winter_hardiness"
      | "minimum_temperature"
      | "growth";
    heading: string;
    text: string;
    sourceIds: string[];
  }>;
  care: {
    light: SourcedText;
    water: SourcedText;
    fertilizer: SourcedText;
    winter: SourcedText;
  };
};

export type DraftValidation = {
  valid: boolean;
  errors: string[];
  warnings: string[];
};

export type SalesChannel = "shopware" | "ebay" | "kleinanzeigen";

export type ChannelContentReuse = {
  sourceChannel: SalesChannel;
  sourceId: string;
  /** Kept for backwards compatibility with existing eBay draft files. */
  sourceDraftId?: string;
  sourceArticleNumber: string;
  latinName: string;
  reusedAt: string;
};

export type ShopwareUploadedImage = {
  id: string;
  originalName: string;
  fileName: string;
  contentType: "image/jpeg" | "image/png" | "image/gif" | "image/webp";
  size: number;
  createdAt: string;
  url: string;
};

export type ShopwareProductTemplate = {
  id: string;
  name: string;
  titlePattern: string;
  priceAdjustmentPercent: number;
  stockLimit?: number;
  active: boolean;
  keywords: string[];
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ShopwareProductDraft = {
  id: string;
  status:
    | "ready"
    | "blocked"
    | "publishing"
    | "reconciliation_required"
    | "published";
  createdAt: string;
  updatedAt: string;
  source: ProductCandidate;
  price?: number;
  stock?: number;
  active?: boolean;
  selectedImageUrls?: string[];
  uploadedImages?: ShopwareUploadedImage[];
  templateId?: string;
  templateName?: string;
  title: string;
  descriptionHtml: string;
  research: ProductResearch;
  contentReuse?: ChannelContentReuse;
  sources: ResearchSource[];
  validation: DraftValidation;
  manuallyEdited: boolean;
  approvedAt?: string;
  shopwareProductId?: string;
  pendingShopwareProductId?: string;
  pendingMediaIds?: string[];
  lastError?: string;
};

export type ShopwareEntityOption = {
  id: string;
  label: string;
  detail?: string;
};

export type ShopwarePublishingSettings = {
  taxId: string;
  currencyId: string;
  salesChannelId: string;
};

export type PublishingSetup = {
  fieldMap: WeclappFieldMap;
  fieldOptions: WeclappFieldOption[];
  researchConfigured: boolean;
  researchModel: string;
  shopwareSettings: ShopwarePublishingSettings;
  shopwareOptions: {
    taxes: ShopwareEntityOption[];
    currencies: ShopwareEntityOption[];
    salesChannels: ShopwareEntityOption[];
  };
};
