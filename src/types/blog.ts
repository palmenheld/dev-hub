import type { ResearchSource } from "@/types/shopwarePublishing";

export type BlogJobStatus =
  | "queued"
  | "researching"
  | "publishing"
  | "published"
  | "failed"
  | "cancelled";

export type BlogJobMode = "immediate" | "scheduled";

export type BlogParagraph = {
  text: string;
  importantClaim: boolean;
  sourceIds: string[];
};

export type BlogArticleContent = {
  title: string;
  slug: string;
  teaser: string;
  metaTitle: string;
  metaDescription: string;
  keywords: string[];
  intro: BlogParagraph;
  sections: Array<{
    heading: string;
    paragraphs: BlogParagraph[];
  }>;
  conclusion: BlogParagraph;
  wordCount: number;
  html: string;
};

export type BlogJob = {
  id: string;
  mode: BlogJobMode;
  prompt: string;
  authorId: string;
  categoryId: string;
  scheduledFor: string;
  status: BlogJobStatus;
  createdAt: string;
  updatedAt: string;
  attempts: number;
  article?: BlogArticleContent;
  sources?: ResearchSource[];
  researchDossier?: string;
  shopwareEntryId?: string;
  shopwareUrl?: string;
  publishedAt?: string;
  error?: string;
};

export type ShopwareBlogOption = {
  id: string;
  label: string;
};

export type ShopwareBlogOptions = {
  authors: ShopwareBlogOption[];
  categories: ShopwareBlogOption[];
};
