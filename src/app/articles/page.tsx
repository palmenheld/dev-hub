import Link from "next/link";
import ArticleList from "@/components/articles/ArticleList";
export const dynamic = "force-dynamic";


export default function ArticlesPage() {
  return (
    <main className="min-h-screen bg-slate-100 p-4 sm:p-8">
      <div className="mx-auto max-w-[1600px]">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <Link
              href="/"
              className="text-sm font-medium text-green-800"
            >
              ← Dashboard
            </Link>

            <h1 className="mt-2 text-3xl font-bold">
              Artikel
            </h1>

            <p className="text-slate-500">
              Zentrale Produktverwaltung
            </p>
          </div>

          <button className="rounded-xl bg-green-800 px-5 py-3 font-semibold text-white">
            Neuer Artikel
          </button>
        </div>

        <ArticleList />
      </div>
    </main>
  );
}
