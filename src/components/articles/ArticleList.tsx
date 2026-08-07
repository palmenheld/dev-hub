import Link from "next/link";
import { getAllArticles } from "@/services/articleService";
import { ChannelStatus } from "@/types/article";

function StatusBadge({
  name,
  status,
}: {
  name: string;
  status: ChannelStatus;
}) {
  const config = {
    online: {
      text: "Online",
      classes: "bg-green-100 text-green-800",
    },
    draft: {
      text: "Entwurf",
      classes: "bg-amber-100 text-amber-800",
    },
    missing: {
      text: "Fehlt",
      classes: "bg-slate-100 text-slate-500",
    },
  };

  return (
    <span
      className={`rounded-full px-2.5 py-1 text-xs font-medium ${config[status].classes}`}
    >
      {name}: {config[status].text}
    </span>
  );
}

export default async function ArticleList() {
	const articles = await getAllArticles();  
return (
    <div className="overflow-hidden rounded-2xl border bg-white shadow-sm">
      <div className="border-b px-5 py-4">
        <h2 className="font-semibold">Artikel</h2>
        <p className="text-sm text-slate-500">
          Artikel anklicken, um ihn zu bearbeiten
        </p>
      </div>

      <div className="divide-y">
        {articles.map((article) => (
          <Link
            href={`/articles/${article.id}`}
            key={article.id}
            className="block p-5 transition hover:bg-slate-50"
          >
            <div className="flex gap-4">
              <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-xl bg-green-50 text-xl font-bold text-green-800">
                PH
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex flex-col justify-between gap-2 sm:flex-row">
                  <div>
                    <h3 className="text-lg font-semibold">
                      {article.name}
                    </h3>

                    <p className="text-sm text-slate-500">
                      {article.subtitle}
                    </p>

                    <p className="mt-1 text-xs text-slate-400">
                      {article.sku}
                    </p>
                  </div>

                  <div className="sm:text-right">
                    <p className="text-lg font-bold text-green-800">
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

                <div className="mt-4 flex flex-wrap gap-2">
                  <StatusBadge
                    name="Shop"
                    status={article.channels.shop}
                  />

                  <StatusBadge
                    name="eBay"
                    status={article.channels.ebay}
                  />

                  <StatusBadge
                    name="Kleinanzeigen"
                    status={article.channels.kleinanzeigen}
                  />
                </div>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
