import { weclappRequest } from "./client";

type WeclappArticleCategory = {
  id?: string;
  name?: string;
  description?: string;
  articleCategoryName?: string;
  [key: string]: unknown;
};

type WeclappArticleCategoryResponse = {
  result?: WeclappArticleCategory[];
};

let categoryMapPromise: Promise<Map<string, string>> | null = null;

function categoryLabel(category: WeclappArticleCategory) {
  return String(
    category.name ||
      category.articleCategoryName ||
      category.description ||
      ""
  ).trim();
}

async function loadArticleCategoryMap() {
  const result = new Map<string, string>();
  const pageSize = 100;

  for (let page = 1; page <= 100; page += 1) {
    const response = await weclappRequest<WeclappArticleCategoryResponse>(
      "articleCategory",
      { query: { page, pageSize } }
    );
    const categories = response.result ?? [];
    for (const category of categories) {
      const id = String(category.id ?? "").trim();
      if (!id) continue;
      result.set(id, categoryLabel(category) || `Kategorie ${id}`);
    }
    if (categories.length < pageSize) break;
  }

  return result;
}

export async function getArticleCategoryMap() {
  if (!categoryMapPromise) {
    categoryMapPromise = loadArticleCategoryMap().catch((error) => {
      categoryMapPromise = null;
      throw error;
    });
  }
  return categoryMapPromise;
}
