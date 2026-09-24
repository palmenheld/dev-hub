import { NextResponse } from "next/server";
import { getArticlePage } from "@/services/articleService";
import {
  ARTICLE_PAGE_SIZES,
  DEFAULT_ARTICLE_LIST_QUERY,
  type ArticleActivityFilter,
  type ArticleChannelFilter,
  type ArticlePageSize,
  type ArticleSortDirection,
  type ArticleSortKey,
} from "@/types/articleList";

export const dynamic = "force-dynamic";

function text(params: URLSearchParams, name: string, maxLength = 300) {
  return (params.get(name) ?? "").trim().slice(0, maxLength);
}

function finiteNumber(params: URLSearchParams, name: string) {
  const raw = params.get(name);
  if (raw === null || raw.trim() === "") return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function oneOf<T extends string>(value: string, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? value as T : fallback;
}

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const requestedSize = Number(params.get("pageSize"));
    const pageSize = ARTICLE_PAGE_SIZES.includes(requestedSize as ArticlePageSize)
      ? requestedSize as ArticlePageSize
      : DEFAULT_ARTICLE_LIST_QUERY.pageSize;
    const page = await getArticlePage({
      page: Math.max(1, Math.floor(Number(params.get("page")) || 1)),
      pageSize,
      query: text(params, "query"),
      activity: oneOf<ArticleActivityFilter>(
        text(params, "activity"),
        ["active", "inactive", "all"],
        DEFAULT_ARTICLE_LIST_QUERY.activity
      ),
      name: text(params, "name"),
      sku: text(params, "sku", 100),
      minStock: finiteNumber(params, "minStock"),
      maxStock: finiteNumber(params, "maxStock"),
      minPrice: finiteNumber(params, "minPrice"),
      maxPrice: finiteNumber(params, "maxPrice"),
      shop: oneOf<ArticleChannelFilter>(
        text(params, "shop"),
        ["all", "online", "draft", "missing"],
        "all"
      ),
      ebay: oneOf<ArticleChannelFilter>(
        text(params, "ebay"),
        ["all", "online", "draft", "missing"],
        "all"
      ),
      kleinanzeigen: oneOf<ArticleChannelFilter>(
        text(params, "kleinanzeigen"),
        ["all", "online", "draft", "missing"],
        "all"
      ),
      sortKey: oneOf<ArticleSortKey>(
        text(params, "sortKey"),
        ["name", "sku", "stock", "price", "status"],
        DEFAULT_ARTICLE_LIST_QUERY.sortKey
      ),
      sortDirection: oneOf<ArticleSortDirection>(
        text(params, "sortDirection"),
        ["asc", "desc"],
        DEFAULT_ARTICLE_LIST_QUERY.sortDirection
      ),
    });
    return NextResponse.json({ page });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error
          ? error.message
          : "Die Artikelliste konnte nicht geladen werden.",
      },
      { status: 500 }
    );
  }
}
