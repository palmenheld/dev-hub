import Link from "next/link";
import ArticleCaptureForm from "@/components/articles/ArticleCaptureForm";

export default function NewArticlePage() {
  return (
    <main className="min-h-screen bg-slate-100 p-3 sm:p-8">
      <div className="mx-auto max-w-[1200px]">
        <Link href="/articles" className="text-sm font-bold text-[var(--ph-green-dark)]">← Zurück zu Artikel</Link>
        <div className="mb-6 mt-3">
          <p className="text-xs font-bold uppercase tracking-widest text-[var(--ph-gold)]">Mobile Artikelerfassung</p>
          <h1 className="mt-1 text-3xl text-[var(--ph-green-dark)]">Neuen Artikel anlegen</h1>
          <p className="mt-2 max-w-3xl text-slate-600">Grunddaten und Besonderheiten direkt am Artikel erfassen. Fotos kannst du aus der Galerie auswählen oder auf dem Handy sofort aufnehmen.</p>
        </div>
        <ArticleCaptureForm />
      </div>
    </main>
  );
}
