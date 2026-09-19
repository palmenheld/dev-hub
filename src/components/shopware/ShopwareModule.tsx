"use client";

import { FormEvent, useMemo, useState } from "react";
import { emptyJsonPost } from "@/lib/http";
import {
  ShopwareConnection,
  ShopwareProduct,
  ShopwareProductPage,
} from "@/types/shopware";
import ShopwareProductCreator from "./ShopwareProductCreator";

type Feedback = {
  kind: "success" | "error";
  message: string;
};

const dateFormatter = new Intl.DateTimeFormat("de-DE", {
  dateStyle: "medium",
  timeStyle: "short",
});

function formatDate(value?: string) {
  if (!value) return "–";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "–" : dateFormatter.format(date);
}

export default function ShopwareModule({
  initialConnection,
  settingsOnly = false,
  initialArticleId = "",
  createArticleOnOpen = false,
  initialQuery = "",
}: {
  initialConnection: ShopwareConnection;
  settingsOnly?: boolean;
  initialArticleId?: string;
  createArticleOnOpen?: boolean;
  initialQuery?: string;
}) {
  const [connection, setConnection] = useState(initialConnection);
  const [products, setProducts] = useState<ShopwareProduct[]>([]);
  const [total, setTotal] = useState(0);
  const [query, setQuery] = useState(initialQuery);
  const [activeFilter, setActiveFilter] = useState<"all" | "active" | "inactive">(
    "all"
  );
  const [testing, setTesting] = useState(false);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  const visibleProducts = useMemo(() => {
    if (activeFilter === "all") return products;

    return products.filter((product) =>
      activeFilter === "active" ? product.active : !product.active
    );
  }, [activeFilter, products]);

  const counts = useMemo(
    () => ({
      active: products.filter((product) => product.active).length,
      inactive: products.filter((product) => !product.active).length,
      lowStock: products.filter((product) => product.stock <= 2).length,
    }),
    [products]
  );

  async function loadProducts(searchQuery = query) {
    setLoadingProducts(true);

    try {
      const params = new URLSearchParams({ limit: "50" });
      if (searchQuery.trim()) params.set("query", searchQuery.trim());

      const response = await fetch(
        `/api/channels/shopware/products?${params.toString()}`,
        { cache: "no-store" }
      );
      const payload = (await response.json()) as ShopwareProductPage & {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? "Produkte konnten nicht geladen werden.");
      }

      setProducts(payload.products);
      setTotal(payload.total);
    } catch (error) {
      setFeedback({
        kind: "error",
        message: error instanceof Error ? error.message : "Unbekannter Fehler.",
      });
    } finally {
      setLoadingProducts(false);
    }
  }

  async function testConnection() {
    setTesting(true);
    setFeedback(null);

    try {
      const response = await fetch("/api/channels/shopware/connection", emptyJsonPost());
      const payload = (await response.json()) as {
        connection?: ShopwareConnection;
        error?: string;
      };

      if (!response.ok || !payload.connection) {
        if (payload.connection) setConnection(payload.connection);
        throw new Error(payload.error ?? "Verbindungstest fehlgeschlagen.");
      }

      setConnection(payload.connection);
      setTotal(payload.connection.productCount ?? 0);
      setFeedback({
        kind: "success",
        message: "Verbindung hergestellt. Die ersten Produkte werden geladen.",
      });
      await loadProducts(query);
    } catch (error) {
      setFeedback({
        kind: "error",
        message: error instanceof Error ? error.message : "Unbekannter Fehler.",
      });
    } finally {
      setTesting(false);
    }
  }

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void loadProducts(query);
  }

  const connectionClasses =
    connection.state === "connected"
      ? "border-green-200 bg-green-50"
      : connection.state === "error"
        ? "border-red-200 bg-red-50"
        : connection.configured
          ? "border-blue-200 bg-blue-50"
          : "border-amber-200 bg-amber-50";

  const connectionDot =
    connection.state === "connected"
      ? "bg-green-500"
      : connection.state === "error"
        ? "bg-red-500"
        : connection.configured
          ? "bg-blue-500"
          : "bg-amber-500";

  return (
    <div className="mx-auto max-w-[1600px]">
      {!settingsOnly && <header>
        <p className="text-sm font-semibold uppercase tracking-wide text-[var(--ph-gold)]">
          Verkaufskanal
        </p>
        <h1 className="mt-1 text-3xl text-[var(--ph-green-dark)]">Shopware</h1>
        <p className="mt-2 max-w-3xl text-slate-500">
          Einen oder mehrere Weclapp-Artikel auswählen, mit aktuellen KI-Inhalten
          anreichern, einzeln prüfen und kontrolliert in Shopware anlegen.
        </p>
      </header>}

      <section className={`mt-6 rounded-2xl border p-5 ${connectionClasses}`}>
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className={`h-2.5 w-2.5 rounded-full ${connectionDot}`} />
              <h2 className="text-lg font-bold">{connection.label}</h2>
              <span className="rounded-full border bg-white/70 px-2.5 py-1 text-xs font-semibold">
                Produktassistent · kontrolliertes Schreiben
              </span>
            </div>
            <p className="mt-1 text-sm text-slate-600">{connection.description}</p>
            {connection.shopUrl && (
              <p className="mt-2 truncate font-mono text-xs text-slate-500">
                {connection.shopUrl}
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={testConnection}
            disabled={!connection.configured || testing}
            className="rounded-xl bg-[var(--ph-green-dark)] px-5 py-3 font-semibold text-white hover:bg-[var(--ph-green)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {testing ? "Verbindung wird geprüft…" : "Verbindung testen"}
          </button>
        </div>
      </section>

      {!connection.configured && (
        <section className="mt-5 rounded-2xl border bg-white p-5 shadow-sm">
          <h2 className="text-xl text-[var(--ph-green-dark)]">Einmalige Einrichtung</h2>
          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            {[
              [
                "1",
                "Publisher-Rolle anlegen",
                "Eine begrenzte Rolle mit Lesen, Anlegen und Bearbeiten für Produkte und Medien sowie Lesen und Anlegen für Zusatzfelder einrichten.",
              ],
              [
                "2",
                "Integration anlegen",
                "„Palmenheld Hub“ unter Integrationen anlegen, Administrator ausschalten, die Publisher-Rolle wählen und beide Schlüssel sichern.",
              ],
              [
                "3",
                "Server konfigurieren",
                "Shop-Adresse und beide Schlüssel als geschützte Umgebungsvariablen am Hub-Container hinterlegen.",
              ],
            ].map(([number, title, description]) => (
              <div key={number} className="rounded-xl border border-slate-200 p-4">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--ph-green-light)] font-bold text-[var(--ph-green-dark)]">
                  {number}
                </div>
                <h3 className="mt-3 font-bold">{title}</h3>
                <p className="mt-1 text-sm leading-6 text-slate-500">{description}</p>
              </div>
            ))}
          </div>

          <div className="mt-4 rounded-xl bg-slate-950 p-4 font-mono text-sm text-slate-100">
            <div>SHOPWARE_BASE_URL=https://dein-shop.de</div>
            <div>SHOPWARE_CLIENT_ID=...</div>
            <div>SHOPWARE_CLIENT_SECRET=...</div>
          </div>
        </section>
      )}

      {feedback && (
        <div
          className={`mt-5 rounded-xl border px-4 py-3 text-sm font-medium ${
            feedback.kind === "success"
              ? "border-green-200 bg-green-50 text-green-800"
              : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {feedback.message}
        </div>
      )}

      {!settingsOnly && (
        <ShopwareProductCreator
          enabled={connection.state === "connected"}
          initialArticleId={initialArticleId}
          createArticleOnOpen={createArticleOnOpen}
        />
      )}

      <section className={settingsOnly ? "hidden" : "mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4"}>
        {(
          [
            ["Produkte im Shop", total, "text-[var(--ph-green-dark)]"],
            ["Geladen & aktiv", counts.active, "text-green-700"],
            ["Geladen & inaktiv", counts.inactive, "text-slate-600"],
            ["Bestand ≤ 2", counts.lowStock, "text-amber-700"],
          ] as const
        ).map(([label, value, color]) => (
          <div key={label} className="rounded-2xl border bg-white p-4 shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              {label}
            </div>
            <div className={`mt-1 text-3xl font-bold ${color}`}>{value}</div>
          </div>
        ))}
      </section>

      <section className={settingsOnly ? "hidden" : "mt-5 overflow-hidden rounded-2xl border bg-white shadow-sm"}>
        <form
          onSubmit={submitSearch}
          className="grid gap-3 border-b p-4 md:grid-cols-[1fr_220px_auto]"
        >
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Name oder Artikelnummer…"
            disabled={connection.state !== "connected"}
            className="rounded-xl border border-slate-300 px-4 py-3 disabled:bg-slate-50"
          />
          <select
            value={activeFilter}
            onChange={(event) =>
              setActiveFilter(event.target.value as "all" | "active" | "inactive")
            }
            disabled={connection.state !== "connected"}
            className="rounded-xl border border-slate-300 bg-white px-4 py-3 disabled:bg-slate-50"
          >
            <option value="all">Alle Status</option>
            <option value="active">Aktiv</option>
            <option value="inactive">Inaktiv</option>
          </select>
          <button
            type="submit"
            disabled={connection.state !== "connected" || loadingProducts}
            className="rounded-xl border border-slate-300 px-5 py-3 font-semibold hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {loadingProducts ? "Lädt…" : "Produkte laden"}
          </button>
        </form>

        <div className="hidden grid-cols-[80px_minmax(280px,1fr)_180px_130px_190px] gap-4 border-b bg-slate-50 px-5 py-3 text-xs font-bold uppercase tracking-wide text-slate-500 lg:grid">
          <div>Bild</div>
          <div>Produkt</div>
          <div>Status</div>
          <div className="text-right">Bestand</div>
          <div>Zuletzt geändert</div>
        </div>

        <div className="divide-y">
          {visibleProducts.length === 0 ? (
            <div className="p-12 text-center">
              <div className="text-lg font-bold text-slate-700">
                {connection.state === "connected"
                  ? loadingProducts
                    ? "Produkte werden geladen…"
                    : "Keine Produkte gefunden"
                  : "Noch keine Shopware-Daten geladen"}
              </div>
              <p className="mt-2 text-sm text-slate-500">
                {connection.configured
                  ? "Starte mit dem Verbindungstest. Shopware wird dabei nicht verändert."
                  : "Hinterlege zuerst die drei Server-Einstellungen aus der Anleitung oben."}
              </p>
            </div>
          ) : (
            visibleProducts.map((product) => (
              <article
                key={product.id}
                className="grid gap-3 px-5 py-4 lg:grid-cols-[80px_minmax(280px,1fr)_180px_130px_190px] lg:items-center"
              >
                <div className="h-14 w-14 overflow-hidden rounded-lg bg-slate-100">
                  {product.imageUrl ? (
                    // Shopware media URLs are remote and vary by installation.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={product.imageUrl}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-xs text-slate-400">
                      Kein Bild
                    </div>
                  )}
                </div>

                <div className="min-w-0">
                  <h3 className="truncate font-bold text-slate-900">{product.name}</h3>
                  <p className="mt-1 font-mono text-xs text-slate-400">
                    {product.productNumber}
                  </p>
                </div>

                <div>
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                      product.active
                        ? "bg-green-100 text-green-800"
                        : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {product.active ? "Aktiv" : "Inaktiv"}
                  </span>
                </div>

                <div className="flex justify-between font-bold lg:block lg:text-right">
                  <span className="font-medium text-slate-500 lg:hidden">Bestand</span>
                  {product.stock}
                </div>

                <div className="flex justify-between text-sm text-slate-500 lg:block">
                  <span className="font-medium lg:hidden">Geändert</span>
                  {formatDate(product.updatedAt)}
                </div>
              </article>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
