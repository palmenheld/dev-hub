import Link from "next/link";
import { notFound } from "next/navigation";
import ArticleCaptureForm from "@/components/articles/ArticleCaptureForm";
import { getArticleCapture } from "@/services/articleCapture/store";

export const dynamic = "force-dynamic";

export default async function EditCapturedArticlePage({ params }: { params: Promise<{ id: string }> }) {
  const article = await getArticleCapture((await params).id).catch(() => null);
  if (!article) notFound();
  return (
    <main className="min-h-screen bg-slate-100 p-3 sm:p-8">
      <div className="mx-auto max-w-[1200px]">
        <Link href="/articles" className="text-sm font-bold text-[var(--ph-green-dark)]">← Zurück zu Artikel</Link>
        <div className="mb-6 mt-3">
          <p className="text-xs font-bold uppercase tracking-widest text-[var(--ph-gold)]">Mobile Artikelerfassung</p>
          <h1 className="mt-1 text-3xl text-[var(--ph-green-dark)]">Artikel bearbeiten</h1>
          <p className="mt-2 text-slate-600">{article.name}</p>
        </div>
        <ArticleCaptureForm initialArticle={article} />
      </div>
    </main>
  );
}
