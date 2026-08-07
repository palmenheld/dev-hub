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

          <div className="mt-8 overflow-hidden rounded-2xl border bg-white shadow-sm">
  <div className="border-b px-5 py-4">
    <h2 className="font-semibold">
      Gefundene Felder
    </h2>

    <p className="text-sm text-slate-500">
      Feldname, Datentyp und aktueller Wert.
    </p>
  </div>

  <div className="divide-y">
    {Object.entries(article).map(([key, value]) => (
      <div
        key={key}
        className="grid gap-2 px-5 py-3 md:grid-cols-[240px_120px_1fr]"
      >
        <div className="font-mono text-sm font-semibold">
          {key}
        </div>

        <div className="text-xs text-slate-500">
          {Array.isArray(value)
            ? "array"
            : value === null
              ? "null"
              : typeof value}
        </div>

        <div className="break-all font-mono text-xs text-slate-700">
          {typeof value === "object"
            ? JSON.stringify(value)
            : String(value ?? "")}
        </div>
      </div>
    ))}
  </div>
</div>
        </div>
      </div>
    </AppShell>
  );
}
