import Link from "next/link";
import AppShell from "@/components/layout/AppShell";
import { getArticle } from "@/services/weclapp";

export default async function WeclappArticleInspectorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const article = await getArticle(id);

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl">
        <Link
          href="/admin/weclapp"
          className="text-sm font-semibold text-[var(--ph-green-dark)]"
        >
          ← Weclapp Inspector
        </Link>

        <div className="mt-4">
          <p className="text-sm text-slate-500">
            {article.articleNumber ?? article.id}
          </p>

          <h1 className="text-3xl text-[var(--ph-green-dark)]">
            {article.name ?? "Weclapp Artikel"}
          </h1>
        </div>

        <div className="mt-8 overflow-hidden rounded-2xl border bg-white shadow-sm">
          <div className="border-b px-5 py-4">
            <h2 className="font-semibold">
              Rohdaten
            </h2>

            <p className="text-sm text-slate-500">
              Alle von der Weclapp API gelieferten Felder.
            </p>
          </div>

          <pre className="max-h-[70vh] overflow-auto p-5 text-xs leading-6">
            {JSON.stringify(article, null, 2)}
          </pre>
        </div>
      </div>
    </AppShell>
  );
}
