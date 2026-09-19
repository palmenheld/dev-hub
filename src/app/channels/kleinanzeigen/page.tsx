import AppShell from "@/components/layout/AppShell";
import KleinanzeigenModule from "@/components/kleinanzeigen/KleinanzeigenModule";
import { getAllArticles } from "@/services/articleService";
import {
  getKleinanzeigenConnection,
  getKleinanzeigenListings,
} from "@/services/kleinanzeigen";
export const dynamic = "force-dynamic";


function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function KleinanzeigenPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const parameters = await searchParams;
  const [listings, articles] = await Promise.all([
    getKleinanzeigenListings(),
    getAllArticles().catch((error) => {
      console.error("Weclapp-Artikel für Kleinanzeigen nicht verfügbar:", error);
      return [];
    }),
  ]);

  return (
    <AppShell>
      <KleinanzeigenModule
        initialListings={listings}
        connection={getKleinanzeigenConnection()}
        initialArticleId={first(parameters.articleId)?.trim() || ""}
        articleOptions={articles.map((article) => ({
          id: article.id,
          sku: article.sku,
          name: article.name,
          description: article.subtitle,
          price: article.basePrice,
        }))}
      />
    </AppShell>
  );
}
