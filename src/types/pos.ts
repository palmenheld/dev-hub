export type PosPaymentMethod = {
  id: number;
  name: string;
  isCash: boolean;
  isInvoice: boolean;
};

export type PosArticle = {
  id: string;
  articleNumber: string;
  name: string;
  price: number;
  unitPrice: number;
  stock: number;
  type: string;
  taxId?: string;
  serviceItem: boolean;
  isSerialNumber: boolean;
};

export type PosCustomer = {
  id: string;
  customerNumber: string;
  displayName: string;
  blocked: boolean;
};

export type PosCartInput = {
  articleId: string;
  articleNumber: string;
  quantity: number;
};

export type PosQuoteLine = PosArticle & {
  quantity: number;
  lineTotal: number;
};

export type PosQuote = {
  lines: PosQuoteLine[];
  total: number;
  fulfillmentProviderId?: string;
  customerId?: string;
};

export type PosReceipt = {
  token: string;
  saleId: string;
  createdAt: string;
  cashierName: string;
  registerName: string;
  locationName: string;
  salesChannel: string;
  paymentMethod: string;
  amountTendered: number;
  change: number;
  total: number;
  lines: Array<{
    articleNumber: string;
    name: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
  }>;
  pdfAvailable: boolean;
};
