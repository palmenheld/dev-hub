import AppShell from "@/components/layout/AppShell";
import ShopwareModule from "@/components/shopware/ShopwareModule";
import ShopwareArticleOverview from "@/components/shopware/ShopwareArticleOverview";
import { getShopwareConnection } from "@/services/shopware";

export const dynamic = "force-dynamic";

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ShopwarePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const parameters = await searchParams;
  const articleId = first(parameters.articleId)?.trim() || "";
  return (
    <AppShell>
      {articleId ? (
        <ShopwareModule
          initialConnection={getShopwareConnection()}
          initialArticleId={articleId}
          createArticleOnOpen={first(parameters.create) === "1"}
          initialQuery={first(parameters.query)?.trim() || ""}
        />
      ) : (
        <ShopwareArticleOverview initialConnection={getShopwareConnection()} />
      )}
    </AppShell>
  );
}
