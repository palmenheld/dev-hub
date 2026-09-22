import type {
  ChannelContentReuse,
  DraftValidation,
  ProductCandidate,
  ProductResearch,
  ResearchSource,
} from "@/types/shopwarePublishing";
import type { WeclappBacksyncResult } from "@/types/weclappBacksync";

export type EbayEnvironment = "sandbox" | "production";
export type EbayConnectionState =
  | "not_configured"
  | "configured"
  | "connected"
  | "error";

export type EbayPublishingSettings = {
  marketplaceId: string;
  currency: string;
  merchantLocationKey: string;
  fulfillmentPolicyId: string;
  paymentPolicyId: string;
  returnPolicyId: string;
};

export type EbayConditionOption = {
  id: string;
  value: string;
  label: string;
  helpText?: string;
  restricted: boolean;
};

export type EbayNegotiatedPriceOptions = {
  enabled: boolean;
  autoAcceptEnabled: boolean;
  autoDeclineEnabled: boolean;
};

export type EbayPackageDetails = {
  packageType: string;
  lengthCm?: number;
  widthCm?: number;
  heightCm?: number;
  weightKg?: number;
  shippingIrregular: boolean;
};

export type EbayListingOptions = {
  subtitle: string;
  condition: string;
  conditionDescription: string;
  brand: string;
  mpn: string;
  ean: string;
  imageUrls: string[];
  quantityLimitPerBuyer?: number;
  includeCatalogProductDetails: boolean;
  bestOfferEnabled: boolean;
  bestOfferAutoAcceptPrice?: number;
  bestOfferAutoDeclinePrice?: number;
  packageDetails?: EbayPackageDetails;
};
export type EbayListingTemplate = {
  id: string;
  name: string;
  categoryId: string;
  categoryName: string;
  aspects: Record<string, string[]>;
  listingOptions?: Omit<EbayListingOptions, "imageUrls">;
  titlePattern: string;
  priceAdjustmentPercent: number;
  quantityLimit?: number;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
};

export type EbayConnection = {
  state: EbayConnectionState;
  configured: boolean;
  authorizationReady: boolean;
  publishReady: boolean;
  environment: EbayEnvironment;
  label: string;
  description: string;
  missingConfiguration: string[];
  missingPublishingSetup: string[];
  oauthCallbackUrl?: string;
  sellerName?: string;
};

export type EbayOption = {
  id: string;
  label: string;
  detail?: string;
};

export type EbaySetup = {
  connection: EbayConnection;
  settings: EbayPublishingSettings;
  locations: EbayOption[];
  fulfillmentPolicies: EbayOption[];
  paymentPolicies: EbayOption[];
  returnPolicies: EbayOption[];
  warnings?: string[];
};

export type EbaySandboxBootstrapInput = {
  merchantLocationKey: string;
  locationName: string;
  postalCode: string;
  city: string;
  country: string;
  fulfillmentPolicyName: string;
  shippingServiceCode: string;
  shippingCost: number;
  handlingDays: number;
  paymentPolicyName: string;
  returnPolicyName: string;
  returnDays: 30 | 60;
  returnShippingCostPayer: "BUYER" | "SELLER";
};

export type EbaySandboxBootstrapStep = {
  key: "program" | "location" | "fulfillment" | "payment" | "return";
  label: string;
  status: "created" | "existing" | "failed";
  detail: string;
};

export type EbaySandboxBootstrapResult = {
  completed: boolean;
  setup: EbaySetup;
  steps: EbaySandboxBootstrapStep[];
};

export type EbayCategorySuggestion = {
  id: string;
  name: string;
  path: string;
};

export type EbayAspect = {
  name: string;
  required: boolean;
  recommended: boolean;
  mode: "selection_only" | "free_text";
  values: string[];
  maxValues: number;
  maxLength: number;
};

export type EbayGeneratedCopy = {
  version: "ebay-v2";
  title: string;
  intro: string;
  sellingPoints: string[];
  appearance: string;
  location: string;
  care: string;
  winter: string;
  searchTerms: string[];
  itemSpecifics: {
    commonName: string;
    features: string[];
    waterRequirement: "Hoch" | "Mittel" | "Niedrig";
    sunlight: Array<
      "Mittlere Sonne" | "Schwache Sonne" | "Volle Sonne" | "Vollschatten"
    >;
    productType:
      | "Bambus"
      | "Bäume"
      | "Bonsai"
      | "Farne"
      | "Gemüse"
      | "Kakteen & Sukkulenten"
      | "Karnivoren"
      | "Kletterpflanzen"
      | "Kräuter"
      | "Obst"
      | "Orchideen"
      | "Rosen"
      | "Sträucher & Hecken"
      | "Wasserpflanzen"
      | "Ziergräser"
      | "Zimmerpflanzen";
  };
  evidence: {
    intro: string[];
    sellingPoints: string[][];
    appearance: string[];
    location: string[];
    care: string[];
    winter: string[];
  };
  qualityWarnings?: string[];
};

export type EbayDraftJob = {
  id: string;
  articleId: string;
  articleNumber: string;
  status: "queued" | "running" | "completed" | "failed";
  createdAt: string;
  updatedAt: string;
  draftId?: string;
  error?: string;
};

export type EbayCandidateInput = {
  articleNumber?: unknown;
  germanName?: unknown;
  latinName?: unknown;
  height?: unknown;
  potSize?: unknown;
  price?: unknown;
};

export type EbayCandidateOverrides = {
  articleNumber?: string;
  germanName?: string;
  latinName?: string;
  heightCm?: number;
  heightMinCm?: number;
  heightMaxCm?: number;
  heightLabel?: string;
  potSize?: string;
  price?: number;
};

export type EbayUploadedImage = {
  id: string;
  originalName: string;
  fileName: string;
  contentType: "image/jpeg" | "image/png" | "image/gif" | "image/webp";
  size: number;
  createdAt: string;
  url: string;
};

export type EbayListingDraft = {
  id: string;
  status:
    | "ready"
    | "blocked"
    | "publishing"
    | "reconciliation_required"
    | "management_reconciliation_required"
    | "paused"
    | "published";
  createdAt: string;
  updatedAt: string;
  environment: EbayEnvironment;
  marketplaceId: string;
  publishingSettings: EbayPublishingSettings;
  source: ProductCandidate;
  sourceOverrides?: EbayCandidateOverrides;
  uploadedImages?: EbayUploadedImage[];
  title: string;
  descriptionHtml: string;
  categoryId: string;
  categoryName: string;
  condition: string;
  options?: EbayListingOptions;
  aspects: Record<string, string[]>;
  price: number;
  quantity: number;
  generatedCopy?: EbayGeneratedCopy;
  copyPolicyVersion?: string;
  research: ProductResearch;
  researchPolicyVersion?: string;
  contentReuse?: ChannelContentReuse;
  sources: ResearchSource[];
  researchValidation: DraftValidation;
  validation: DraftValidation;
  manuallyEdited: boolean;
  templateId?: string;
  templateName?: string;
  approvedAt?: string;
  offerId?: string;
  listingId?: string;
  pendingOfferId?: string;
  ebayOfferStatus?: string;
  ebayListingStatus?: string;
  lastSyncedAt?: string;
  pausedAt?: string;
  reactivatedAt?: string;
  pendingManagementAction?: "pause" | "reactivate";
  lastError?: string;
  weclappSync?: WeclappBacksyncResult;
};
