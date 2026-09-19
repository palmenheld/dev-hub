import AppShell from "@/components/layout/AppShell";
import ShopwareModule from "@/components/shopware/ShopwareModule";
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
  return (
    <AppShell>
      <ShopwareModule
        initialConnection={getShopwareConnection()}
        initialArticleId={first(parameters.articleId)?.trim() || ""}
        createArticleOnOpen={first(parameters.create) === "1"}
        initialQuery={first(parameters.query)?.trim() || ""}
      />
    </AppShell>
  );
}
