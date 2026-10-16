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
