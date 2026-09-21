import { randomUUID } from "node:crypto";
import type { BlogArticleContent, ShopwareBlogOptions } from "@/types/blog";
import { shopwareRequest } from "@/services/shopware/client";
import { requireShopwareConfiguration } from "@/services/shopware/config";
import { getPublishingSettings } from "@/services/shopware/dataStore";

type BlogAuthorRecord = {
  id?: string;
  displayName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  translated?: { displayName?: string | null };
};

type BlogCategoryRecord = {
  id?: string;
  name?: string | null;
  translated?: { name?: string | null };
};

type BlogEntryRecord = {
  id?: string;
  slug?: string | null;
  title?: string | null;
  translated?: { slug?: string | null; title?: string | null };
  cmsPageId?: string | null;
  customFields?: Record<string, unknown> | null;
};

type CmsPageRecord = {
  id?: string;
  sections?: Array<{
    blocks?: Array<{
      slots?: Array<{
        id?: string;
        type?: string;
        slot?: string;
        config?: Record<string, unknown> | null;
      }>;
    }>;
  }>;
};

function shopwareId() {
  return randomUUID().replaceAll("-", "");
}

async function requireBlogSalesChannelId() {
  const { salesChannelId } = await getPublishingSettings();
  if (!/^[0-9a-f]{32}$/i.test(salesChannelId)) {
    throw new Error(
      "Der Shopware-Verkaufskanal fehlt. Bitte die Shopware-Zuordnung im Hub speichern."
    );
  }
  return salesChannelId;
}

export async function getShopwareBlogOptions(): Promise<ShopwareBlogOptions> {
  const [authors, categories] = await Promise.all([
    shopwareRequest<{ data?: BlogAuthorRecord[] }>("search/werkl-blog-author", {
      method: "POST",
      body: {
        page: 1,
        limit: 100,
        sort: [{ field: "displayName", order: "ASC" }],
        includes: {
          werkl_blog_author: [
            "id",
            "displayName",
            "firstName",
            "lastName",
            "translated",
          ],
        },
      },
    }),
    shopwareRequest<{ data?: BlogCategoryRecord[] }>(
      "search/werkl-blog-category",
      {
        method: "POST",
        body: {
          page: 1,
          limit: 100,
          sort: [{ field: "name", order: "ASC" }],
          includes: {
            werkl_blog_category: ["id", "name", "translated"],
          },
        },
      }
    ),
  ]);

  return {
    authors: (authors.data ?? [])
      .filter((author): author is BlogAuthorRecord & { id: string } => Boolean(author.id))
      .map((author) => ({
        id: author.id,
        label:
          author.translated?.displayName ||
          author.displayName ||
          [author.firstName, author.lastName].filter(Boolean).join(" ") ||
          "Unbenannter Autor",
      })),
    categories: (categories.data ?? [])
      .filter(
        (category): category is BlogCategoryRecord & { id: string } =>
          Boolean(category.id)
      )
      .map((category) => ({
        id: category.id,
        label: category.translated?.name || category.name || "Unbenannte Rubrik",
      })),
  };
}

async function findEntryBySlug(slug: string) {
  const response = await shopwareRequest<{ data?: BlogEntryRecord[] }>(
    "search/werkl-blog-entry",
    {
      method: "POST",
      body: {
        page: 1,
        limit: 1,
        filter: [{ type: "equals", field: "slug", value: slug }],
        includes: {
          werkl_blog_entry: ["id", "slug", "title", "translated"],
        },
      },
    }
  );
  return response.data?.find(
    (entry) => (entry.translated?.slug || entry.slug) === slug && entry.id
  );
}

async function getEntry(entryId: string) {
  const response = await shopwareRequest<{ data?: BlogEntryRecord[] }>(
    "search/werkl-blog-entry",
    {
      method: "POST",
      body: {
        page: 1,
        limit: 1,
        filter: [{ type: "equals", field: "id", value: entryId }],
        includes: {
          werkl_blog_entry: ["id", "cmsPageId", "customFields"],
        },
      },
    }
  );
  return response.data?.[0] ?? null;
}

async function getContentSlot(cmsPageId: string) {
  const response = await shopwareRequest<{ data?: CmsPageRecord[] }>(
    "search/cms-page",
    {
      method: "POST",
      body: {
        page: 1,
        limit: 1,
        filter: [{ type: "equals", field: "id", value: cmsPageId }],
        associations: {
          sections: {
            associations: {
              blocks: { associations: { slots: {} } },
            },
          },
        },
        includes: {
          cms_page: ["id", "sections"],
          cms_section: ["blocks"],
          cms_block: ["slots"],
          cms_slot: ["id", "type", "slot", "config"],
        },
      },
    }
  );
  const slots = (response.data?.[0]?.sections ?? []).flatMap((section) =>
    (section.blocks ?? []).flatMap((block) => block.slots ?? [])
  );
  return slots.find((slot) => slot.type === "text" || slot.slot === "content");
}

async function findPublicUrl(entryId: string) {
  try {
    const response = await shopwareRequest<{
      data?: Array<{
        foreignKey?: string | null;
        seoPathInfo?: string | null;
        isCanonical?: boolean;
      }>;
    }>("search/seo-url", {
      method: "POST",
      body: {
        page: 1,
        limit: 10,
        filter: [
          { type: "equals", field: "foreignKey", value: entryId },
          { type: "equals", field: "isCanonical", value: true },
        ],
        includes: {
          seo_url: ["foreignKey", "seoPathInfo", "isCanonical"],
        },
      },
    });
    const path = response.data?.find((url) => url.seoPathInfo)?.seoPathInfo;
    if (!path) return undefined;
    return `${requireShopwareConfiguration().baseUrl}/${path.replace(/^\//, "")}`;
  } catch {
    return undefined;
  }
}

export async function publishBlogArticle(input: {
  article: BlogArticleContent;
  authorId: string;
  categoryId: string;
}) {
  const salesChannelId = await requireBlogSalesChannelId();
  const existing = await findEntryBySlug(input.article.slug);
  if (existing?.id) {
    return {
      entryId: existing.id,
      publicUrl: await findPublicUrl(existing.id),
      alreadyExisted: true,
    };
  }

  const entryId = shopwareId();
  const cmsPageId = shopwareId();
  await shopwareRequest("werkl-blog-entry", {
    method: "POST",
    timeoutMs: 60_000,
    body: {
      id: entryId,
      active: true,
      authorId: input.authorId,
      publishedAt: new Date().toISOString(),
      title: input.article.title,
      slug: input.article.slug,
      teaser: input.article.teaser,
      metaTitle: input.article.metaTitle,
      metaDescription: input.article.metaDescription,
      content: input.article.html,
      customFields: {
        salesChannelIds: [salesChannelId],
        palmenheld_keywords: input.article.keywords,
        palmenheld_word_count: input.article.wordCount,
        palmenheld_generated_by_hub: true,
      },
      blogCategories: [{ id: input.categoryId }],
      cmsPage: {
        id: cmsPageId,
        name: `Blog: ${input.article.title}`.slice(0, 255),
        type: "blog_detail",
        sections: [
          {
            id: shopwareId(),
            type: "default",
            position: 0,
            sizingMode: "boxed",
            visibility: { mobile: true, tablet: true, desktop: true },
            blocks: [
              {
                id: shopwareId(),
                type: "text-hero",
                position: 0,
                sectionPosition: "main",
                marginTop: "20px",
                marginRight: "20px",
                marginBottom: "20px",
                marginLeft: "20px",
                visibility: { mobile: true, tablet: true, desktop: true },
                slots: [
                  {
                    id: shopwareId(),
                    type: "text",
                    slot: "content",
                    config: {
                      content: { source: "static", value: input.article.html },
                      verticalAlign: { source: "static", value: null },
                    },
                  },
                ],
              },
            ],
          },
        ],
      },
    },
  });

  return {
    entryId,
    publicUrl: await findPublicUrl(entryId),
    alreadyExisted: false,
  };
}

export async function updatePublishedBlogArticle(input: {
  entryId: string;
  article: BlogArticleContent;
}) {
  const [entry, salesChannelId] = await Promise.all([
    getEntry(input.entryId),
    requireBlogSalesChannelId(),
  ]);
  if (!entry?.id || !entry.cmsPageId) {
    throw new Error("Der veröffentlichte Shopware-Blogbeitrag wurde nicht gefunden.");
  }
  const contentSlot = await getContentSlot(entry.cmsPageId);
  if (!contentSlot?.id) {
    throw new Error("Das Textfeld der Shopware-Blog-Erlebniswelt wurde nicht gefunden.");
  }

  await shopwareRequest(`cms-slot/${contentSlot.id}`, {
    method: "PATCH",
    body: {
      config: {
        ...(contentSlot.config ?? {}),
        content: { source: "static", value: input.article.html },
        verticalAlign: { source: "static", value: null },
      },
    },
  });
  await shopwareRequest(`werkl-blog-entry/${entry.id}`, {
    method: "PATCH",
    body: {
      content: input.article.html,
      customFields: {
        ...(entry.customFields ?? {}),
        salesChannelIds: [salesChannelId],
        palmenheld_keywords: input.article.keywords,
        palmenheld_word_count: input.article.wordCount,
        palmenheld_generated_by_hub: true,
      },
    },
  });
  return { entryId: entry.id, publicUrl: await findPublicUrl(entry.id) };
}
