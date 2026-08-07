import Link from "next/link";
import { notFound } from "next/navigation";
import { articles } from "@/data/articles";
import ArticleEditor from "./ArticleEditor";

export default async function ArticlePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const article = articles.find((item) => item.id === id);

  if (!article) {
    notFound();
  }

  return (
    <main className="min-h-screen bg-slate-100 p-4 sm:p-8">
      <div className="mx-auto max-w-6xl">
        <Link
          href="/articles"
          className="text-sm font-medium text-green-800"
        >
          ← Zurück zu den Artikeln
        </Link>

        <div className="mt-4">
          <ArticleEditor article={article} />
        </div>
      </div>
    </main>
  );
}
