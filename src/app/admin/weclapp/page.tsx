import Link from "next/link";
import AppShell from "@/components/layout/AppShell";
import { getArticles } from "@/services/weclapp";
export const dynamic = "force-dynamic";


export default async function WeclappInspectorPage() {
  const response = await getArticles({
    page: 1,
    pageSize: 20,
  });

  const articles = response.result ?? [];

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl">
        <div className="mb-8">
          <p className="text-sm font-semibold text-[var(--ph-gold)]">
            Developer
          </p>

          <h1 className="text-3xl text-[var(--ph-green-dark)]">
            Weclapp Inspector
          </h1>

          <p className="mt-2 text-slate-500">
            Direkter Einblick in die von Weclapp gelieferten
            Artikeldaten.
          </p>
        </div>

        <div className="overflow-hidden rounded-2xl border bg-white shadow-sm">
          <div className="grid grid-cols-[160px_1fr_120px] border-b bg-slate-50 px-5 py-3 text-sm font-semibold text-slate-600">
            <div>Artikelnummer</div>
            <div>Name</div>
            <div></div>
          </div>

          <div className="divide-y">
            {articles.map((article) => (
              <div
                key={article.id}
                className="grid grid-cols-[160px_1fr_120px] items-center px-5 py-4"
              >
                <div className="font-mono text-sm">
                  {article.articleNumber ?? "-"}
                </div>

                <div className="font-medium">
                  {article.name ?? "(kein Name)"}
                </div>

                <Link
                  href={`/admin/weclapp/${article.id}`}
                  className="text-right text-sm font-semibold text-[var(--ph-green-dark)]"
                >
                  Prüfen →
                </Link>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
