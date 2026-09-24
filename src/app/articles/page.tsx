import Link from "next/link";
import ArticleList from "@/components/articles/ArticleList";
import { listArticleCaptures } from "@/services/articleCapture/store";

export const dynamic = "force-dynamic";

export default async function ArticlesPage() {
  const captures = await listArticleCaptures();

  return (
    <main className="min-h-screen bg-slate-100 p-4 sm:p-8">
      <div className="mx-auto max-w-[1600px]">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <Link href="/" className="text-sm font-medium text-green-800">← Dashboard</Link>
            <h1 className="mt-2 text-3xl font-bold">Artikel</h1>
            <p className="text-slate-500">Zentrale Produktverwaltung</p>
          </div>
          <Link href="/articles/new" className="rounded-xl bg-green-800 px-5 py-3 font-semibold text-white shadow-sm hover:bg-green-900">Neuer Artikel</Link>
        </div>

        {captures.length > 0 && (
          <section className="mb-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-4">
              <div>
                <h2 className="text-lg text-[var(--ph-green-dark)]">Im Hub erfasste Artikel</h2>
                <p className="mt-1 text-sm text-slate-500">Mobile Aufnahmen und noch nicht übertragene Artikelentwürfe.</p>
              </div>
              <span className="rounded-full bg-green-50 px-3 py-1 text-xs font-bold text-green-800">{captures.length} gespeichert</span>
            </div>
            <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">
              {captures.slice(0, 9).map((capture) => {
                const photo = capture.photos.find((item) => item.id === capture.primaryPhotoId) ?? capture.photos[0];
                return (
                  <Link key={capture.id} href={`/articles/new/${capture.id}`} className="flex min-w-0 gap-3 rounded-xl border border-slate-200 p-3 transition hover:border-green-400 hover:bg-green-50/40">
                    <div className="h-20 w-20 shrink-0 rounded-xl bg-slate-100 bg-cover bg-center" style={photo ? { backgroundImage: `url(${photo.url})` } : undefined}>
                      {!photo && <span className="flex h-full items-center justify-center text-xs text-slate-400">Kein Foto</span>}
                    </div>
                    <div className="min-w-0">
                      <div className="truncate font-bold text-[var(--ph-green-dark)]">{capture.name}</div>
                      <div className="mt-1 truncate text-xs text-slate-500">{capture.articleNumber || "Noch ohne Artikelnummer"}</div>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${capture.status === "ready" ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"}`}>{capture.status === "ready" ? "Vollständig" : "Entwurf"}</span>
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600">{capture.photos.length} Fotos</span>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        )}

        <ArticleList />
      </div>
    </main>
  );
}
