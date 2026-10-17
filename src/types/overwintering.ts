export type OverwinteringAddress = {
  street: string;
  zipcode: string;
  city: string;
  country: string;
};

export type WeclappCustomerSearchResult = {
  id: string;
  customerNumber: string;
  displayName: string;
  address: OverwinteringAddress;
};

export type WeclappCustomerOption = {
  id: string;
  label: string;
  detail?: string;
};

export type WeclappCustomerCreateOptions = {
  commercialLanguages: WeclappCustomerOption[];
  companySizes: WeclappCustomerOption[];
  currencies: WeclappCustomerOption[];
  customerCategories: WeclappCustomerOption[];
  legalForms: WeclappCustomerOption[];
  paymentMethods: WeclappCustomerOption[];
  sectors: WeclappCustomerOption[];
  shipmentMethods: WeclappCustomerOption[];
  termsOfPayment: WeclappCustomerOption[];
  titles: WeclappCustomerOption[];
  users: WeclappCustomerOption[];
  salesChannels: WeclappCustomerOption[];
  errors: string[];
};

export type WeclappCustomerAddressInput = {
  company?: string;
  firstName?: string;
  lastName?: string;
  street1: string;
  street2?: string;
  zipcode: string;
  city: string;
  state?: string;
  countryCode: string;
  phoneNumber?: string;
};

export type WeclappCustomerCreateInput = {
  partyType: "ORGANIZATION" | "PERSON";
  salutation: "COMPANY" | "FAMILY" | "MR" | "MRS" | "NO_SALUTATION";
  titleId?: string;
  company?: string;
  company2?: string;
  firstName?: string;
  middleName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  mobilePhone1?: string;
  website?: string;
  address: WeclappCustomerAddressInput;
  useDifferentInvoiceAddress?: boolean;
  invoiceAddress?: WeclappCustomerAddressInput;
  useDifferentDeliveryAddress?: boolean;
  deliveryAddress?: WeclappCustomerAddressInput;
  customerBusinessType: "B2B" | "B2C" | "B2G";
  commercialLanguageId?: string;
  companySizeId?: string;
  currencyId?: string;
  customerCategoryId?: string;
  customerPaymentMethodId?: string;
  customerShipmentMethodId?: string;
  customerTermOfPaymentId?: string;
  customerSalesChannel?: string;
  customerSalesOrderPaymentType?:
    | "STANDARD"
    | "ADVANCE_PAYMENT"
    | "COUNTER_SALES"
    | "PART_PAYMENT"
    | "PREPAYMENT";
  legalFormId?: string;
  responsibleUserId?: string;
  sectorId?: string;
  taxId?: string;
  vatIdentificationNumber?: string;
  eoriNumber?: string;
  referenceNumber?: string;
  description?: string;
  customerInternalNote?: string;
  tags?: string[];
  optInEmail?: boolean;
  optInLetter?: boolean;
  optInPhone?: boolean;
  optInSms?: boolean;
};

export type OverwinteringPhoto = {
  id: string;
  originalName: string;
  fileName: string;
  contentType: "image/jpeg" | "image/png" | "image/webp" | "image/gif";
  size: number;
  createdAt: string;
  url: string;
};

export type OverwinteringPlant = {
  id: string;
  name: string;
  specialFeature: string;
  photos: OverwinteringPhoto[];
};

export type OverwinteringCustomer = WeclappCustomerSearchResult;

export type OverwinteringRecord = {
  id: string;
  customer: OverwinteringCustomer;
  plants: OverwinteringPlant[];
  notes: string;
  createdAt: string;
  updatedAt: string;
};

export type OverwinteringPlantInput = Pick<
  OverwinteringPlant,
  "id" | "name" | "specialFeature"
>;

export type OverwinteringRecordInput = {
  customer: OverwinteringCustomer;
  plants: OverwinteringPlantInput[];
  notes?: string;
};
