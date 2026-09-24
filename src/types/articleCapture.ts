export type ArticleCaptureStatus = "draft" | "ready";

export type ArticleCapturePhoto = {
  id: string;
  originalName: string;
  fileName: string;
  contentType: "image/jpeg" | "image/png" | "image/webp" | "image/gif";
  size: number;
  createdAt: string;
  url: string;
};

export type ArticleCapture = {
  id: string;
  status: ArticleCaptureStatus;
  name: string;
  articleNumber: string;
  germanName: string;
  latinName: string;
  category: string;
  heightMinCm: number | null;
  heightMaxCm: number | null;
  potType: "" | "C" | "M" | "V" | "D";
  potValue: number | null;
  grossPrice: number | null;
  stock: number | null;
  keyFacts: string[];
  notes: string;
  photos: ArticleCapturePhoto[];
  primaryPhotoId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ArticleCaptureInput = Omit<
  ArticleCapture,
  "id" | "photos" | "primaryPhotoId" | "createdAt" | "updatedAt"
>;
