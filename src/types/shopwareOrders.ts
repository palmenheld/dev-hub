export type ShopwareOrderAddress = {
  company?: string;
  firstName: string;
  lastName: string;
  street: string;
  additionalAddressLine1?: string;
  additionalAddressLine2?: string;
  zipcode: string;
  city: string;
  countryCode: string;
  phoneNumber?: string;
};

export type ShopwareOrderLine = {
  id: string;
  productNumber?: string;
  label: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  type: string;
};

export type ShopwareOrderCandidate = {
  id: string;
  orderNumber: string;
  orderDateTime: string;
  updatedAt?: string;
  amountTotal: number;
  shippingTotal: number;
  currencyId: string;
  currencyCode: string;
  salesChannelId: string;
  customerGroupId?: string;
  stateId: string;
  stateName: string;
  customer: {
    customerNumber?: string;
    email: string;
    firstName: string;
    lastName: string;
    company?: string;
  };
  billingAddress: ShopwareOrderAddress;
  shippingAddress: ShopwareOrderAddress;
  paymentMethod?: { id: string; name: string };
  shippingMethod?: { id: string; name: string };
  lines: ShopwareOrderLine[];
  fingerprint: string;
};

export type OrderImportLine = ShopwareOrderLine & {
  weclappArticleId?: string;
  error?: string;
};

export type OrderImportCorrection = {
  recordCurrencyId?: string;
  customerId: string;
  salesChannel?: string;
  paymentMethodId?: string;
  shipmentMethodId?: string;
  warehouseId?: string;
  note: string;
};

export type OrderImportPlanItem = {
  id: string;
  shopwareOrder: ShopwareOrderCandidate;
  state:
    | "pending"
    | "approved"
    | "applied"
    | "blocked"
    | "failed"
    | "reconciliation_required";
  correction: OrderImportCorrection;
  lines: OrderImportLine[];
  warnings: string[];
  errors: string[];
  weclappOrderId?: string;
  weclappOrderNumber?: string;
};

export type OrderImportPlan = {
  id: string;
  createdAt: string;
  updatedAt: string;
  state: "draft" | "approved" | "applying" | "completed" | "partially_failed";
  dryRun: true;
  items: OrderImportPlanItem[];
};
