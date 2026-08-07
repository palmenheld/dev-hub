import Link from "next/link";
import { notFound } from "next/navigation";
import { articles } from "@/data/articles";

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
          ← Zurueck zu den Artikeln
        </Link>

        <section className="mt-4 rounded-2xl border bg-white p-5 shadow-sm sm:p-7">

          <div className="flex flex-col justify-between gap-4 md:flex-row">
            <div>
              <p className="text-sm text-slate-400">
                {article.sku}
              </p>

              <h1 className="text-3xl font-bold">
                {article.name}
              </h1>

              <p className="mt-1 text-slate-500">
                {article.subtitle}
              </p>
            </div>

            <div className="md:text-right">
              <p className="text-3xl font-bold text-green-800">
                {article.basePrice.toLocaleString("de-DE", {
                  style: "currency",
                  currency: "EUR",
                })}
              </p>

              <p className="text-sm text-slate-500">
                Bestand: {article.stock}
              </p>
            </div>
          </div>

          <nav className="mt-8 flex gap-2 overflow-x-auto border-b pb-3">
            {[
              "Allgemein",
              "Bilder",
              "KI",
              "Shop",
              "eBay",
              "Kleinanzeigen",
              "Historie",
            ].map((tab, index) => (
              <button
                key={tab}
                className={`whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium ${
                  index === 0
                    ? "bg-green-800 text-white"
                    : "bg-slate-100 text-slate-600"
                }`}
              >
                {tab}
              </button>
            ))}
          </nav>

          <section className="mt-6 grid gap-5 md:grid-cols-2">

            <Field
              label="Artikelnummer"
              value={article.sku}
            />

            <Field
              label="Artikelname"
              value={article.name}
            />

            <Field
              label="Bestand"
              value={String(article.stock)}
            />

            <Field
              label="Basispreis"
              value={String(article.basePrice)}
            />

          </section>

          <div className="mt-8 flex justify-end">
            <button className="rounded-xl bg-green-800 px-6 py-3 font-semibold text-white">
              Aenderungen speichern
            </button>
          </div>

        </section>
      </div>
    </main>
  );
}

function Field({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-slate-600">
        {label}
      </span>

      <input
        defaultValue={value}
        className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-green-700"
      />
    </label>
  );
}
