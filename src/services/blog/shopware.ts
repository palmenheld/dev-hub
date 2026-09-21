import { randomUUID } from "node:crypto";
import type { BlogArticleContent, ShopwareBlogOptions } from "@/types/blog";
import { shopwareRequest } from "@/services/shopware/client";
import { requireShopwareConfiguration } from "@/services/shopware/config";

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
};

function shopwareId() {
  return randomUUID().replaceAll("-", "");
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
