"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Article, ChannelStatus } from "@/types/article";

type SortKey = "name" | "sku" | "stock" | "price";

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

export default function ArticleListClient({
  articles,
}: {
  articles: Article[];
}) {
  const [query, setQuery] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [onlyInStock, setOnlyInStock] = useState(false);

  const filteredArticles = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    let result = articles.filter((article) => {
      if (!showInactive && !article.active) {
        return false;
      }

      if (onlyInStock && article.stock <= 0) {
        return false;
      }

      if (!normalizedQuery) {
        return true;
      }

      return (
        article.name.toLowerCase().includes(normalizedQuery) ||
        article.sku.toLowerCase().includes(normalizedQuery) ||
        article.subtitle.toLowerCase().includes(normalizedQuery)
      );
    });

    result = [...result].sort((a, b) => {
      switch (sortKey) {
        case "sku":
          return a.sku.localeCompare(b.sku, "de");
        case "stock":
          return b.stock - a.stock;
        case "price":
          return b.basePrice - a.basePrice;
        case "name":
        default:
          return a.name.localeCompare(b.name, "de");
      }
    });

    return result;
  }, [articles, query, showInactive, sortKey, onlyInStock]);

  const inactiveCount = articles.filter(
    (article) => !article.active
  ).length;

  return (
    <div>
      <div className="mb-5 rounded-2xl border bg-white p-4 shadow-sm">
        <div className="grid gap-4 lg:grid-cols-[1fr_auto_auto]">
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Artikelname, Artikelnummer oder Beschreibung suchen..."
            className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-[var(--ph-green-dark)]"
          />

          <select
            value={sortKey}
            onChange={(event) =>
              setSortKey(event.target.value as SortKey)
            }
            className="rounded-xl border border-slate-300 bg-white px-4 py-3"
          >
            <option value="name">Sortierung: Name</option>
            <option value="sku">Sortierung: Artikelnummer</option>
            <option value="stock">Sortierung: Bestand</option>
            <option value="price">Sortierung: Preis</option>
          </select>

          <label className="flex items-center gap-3 rounded-xl border border-slate-300 px-4 py-3">
            <input
              type="checkbox"
              checked={onlyInStock}
              onChange={(event) =>
                setOnlyInStock(event.target.checked)
              }
              className="h-4 w-4"
            />

            <span className="text-sm font-medium">
              Nur mit Bestand
            </span>
          </label>
        </div>

        <div className="mt-4 flex flex-col justify-between gap-3 border-t pt-4 sm:flex-row sm:items-center">
          <div>
            <div className="font-medium">
              Inaktive Artikel anzeigen
            </div>

            <div className="text-sm text-slate-500">
              {inactiveCount} inaktive Artikel vorhanden
            </div>
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={showInactive}
            onClick={() => setShowInactive((value) => !value)}
            className={`relative h-7 w-12 shrink-0 rounded-full transition ${
              showInactive
                ? "bg-[var(--ph-green-dark)]"
                : "bg-slate-300"
            }`}
          >
            <span
              className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${
                showInactive
                  ? "left-6"
                  : "left-1"
              }`}
            />
          </button>
        </div>
      </div>

      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm text-slate-500">
          {filteredArticles.length} von {articles.length} Artikeln
        </p>

        {(query || showInactive || onlyInStock) && (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setShowInactive(false);
              setOnlyInStock(false);
              setSortKey("name");
            }}
            className="text-sm font-semibold text-[var(--ph-green-dark)]"
          >
            Filter zurücksetzen
          </button>
        )}
      </div>

      <div className="overflow-hidden rounded-2xl border bg-white shadow-sm">
        <div className="divide-y">
          {filteredArticles.length === 0 ? (
            <div className="p-10 text-center">
              <div className="text-lg font-semibold">
                Keine Artikel gefunden
              </div>
              <div className="mt-1 text-sm text-slate-500">
                Ändere deine Suche oder Filter.
              </div>
            </div>
          ) : (
            filteredArticles.map((article) => (
              <Link
                href={`/articles/${article.id}`}
                key={article.id}
                className={`block p-5 transition hover:bg-slate-50 ${
                  !article.active
                    ? "bg-slate-50 opacity-60"
                    : ""
                }`}
              >
                <div className="flex gap-4">
                  <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-xl bg-green-50 text-xl font-bold text-green-800">
                    PH
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-col justify-between gap-2 sm:flex-row">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-lg font-semibold">
                            {article.name}
                          </h3>

                          {!article.active && (
                            <span className="rounded-full bg-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600">
                              Inaktiv
                            </span>
                          )}
                        </div>

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
            ))
          )}
        </div>
      </div>
    </div>
  );
}
