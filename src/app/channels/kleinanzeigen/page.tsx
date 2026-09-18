import AppShell from "@/components/layout/AppShell";
import KleinanzeigenModule from "@/components/kleinanzeigen/KleinanzeigenModule";
import { getAllArticles } from "@/services/articleService";
import {
  getKleinanzeigenConnection,
  getKleinanzeigenListings,
} from "@/services/kleinanzeigen";
export const dynamic = "force-dynamic";


export default async function KleinanzeigenPage() {
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
