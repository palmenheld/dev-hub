"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Article, ChannelStatus } from "@/types/article";
import { SyncPlan } from "@/types/shopwareSync";
import ShopwareSyncPlanReview from "@/components/shopware/ShopwareSyncPlanReview";

type SortKey = "name" | "sku" | "stock" | "price" | "status";
type SortDirection = "asc" | "desc";
type ActivityFilter = "active" | "inactive" | "all";
type ChannelFilter = "all" | ChannelStatus;
type BulkMode = "set" | "increase" | "decrease";

type BulkFeedback = {
  kind: "success" | "partial" | "error";
  message: string;
};

const currencyFormatter = new Intl.NumberFormat("de-DE", {
  style: "currency",
  currency: "EUR",
});

function parseNumber(value: string) {
  if (!value.trim()) {
    return null;
  }

  const normalized = value.trim().replace(/\./g, "").replace(",", ".");
  const number = Number(normalized);

  return Number.isFinite(number) ? number : null;
}

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

function FilterSelect({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-[var(--ph-green-dark)]"
      >
        {children}
      </select>
    </label>
  );
}

export default function ArticleListClient({
  articles,
}: {
  articles: Article[];
}) {
  const [articleRows, setArticleRows] = useState(articles);
  const [query, setQuery] = useState("");
  const [activityFilter, setActivityFilter] =
    useState<ActivityFilter>("active");
  const [nameFilter, setNameFilter] = useState("");
  const [skuFilter, setSkuFilter] = useState("");
  const [minStock, setMinStock] = useState("");
  const [maxStock, setMaxStock] = useState("");
  const [shopFilter, setShopFilter] = useState<ChannelFilter>("all");
  const [ebayFilter, setEbayFilter] = useState<ChannelFilter>("all");
  const [kleinanzeigenFilter, setKleinanzeigenFilter] =
    useState<ChannelFilter>("all");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDirection, setSortDirection] =
    useState<SortDirection>("asc");
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set()
  );
  const [bulkEditorOpen, setBulkEditorOpen] = useState(false);
  const [bulkMode, setBulkMode] = useState<BulkMode>("set");
  const [bulkValue, setBulkValue] = useState("");
  const [bulkSaving, setBulkSaving] = useState(false);
  const [bulkPlan, setBulkPlan] = useState<SyncPlan | null>(null);
  const [bulkFeedback, setBulkFeedback] =
    useState<BulkFeedback | null>(null);
  const selectAllRef = useRef<HTMLInputElement>(null);

  const filteredArticles = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const minimumPrice = parseNumber(minPrice);
    const maximumPrice = parseNumber(maxPrice);
    const normalizedName = nameFilter.trim().toLowerCase();
    const normalizedSku = skuFilter.trim().toLowerCase();
    const minimumStock = parseNumber(minStock);
    const maximumStock = parseNumber(maxStock);

    const result = articleRows.filter((article) => {
      if (activityFilter === "active" && !article.active) {
        return false;
      }

      if (activityFilter === "inactive" && article.active) {
        return false;
      }

      if (minimumStock !== null && article.stock < minimumStock) {
        return false;
      }

      if (maximumStock !== null && article.stock > maximumStock) {
        return false;
      }

      if (
        normalizedName &&
        !`${article.name} ${article.subtitle}`.toLowerCase().includes(normalizedName)
      ) {
        return false;
      }

      if (normalizedSku && !article.sku.toLowerCase().includes(normalizedSku)) {
        return false;
      }

      if (shopFilter !== "all" && article.channels.shop !== shopFilter) {
        return false;
      }

      if (ebayFilter !== "all" && article.channels.ebay !== ebayFilter) {
        return false;
      }

      if (
        kleinanzeigenFilter !== "all" &&
        article.channels.kleinanzeigen !== kleinanzeigenFilter
      ) {
        return false;
      }

      if (minimumPrice !== null && article.basePrice < minimumPrice) {
        return false;
      }

      if (maximumPrice !== null && article.basePrice > maximumPrice) {
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

    return [...result].sort((a, b) => {
      let comparison = 0;

      switch (sortKey) {
        case "sku":
          comparison = a.sku.localeCompare(b.sku, "de");
          break;
        case "stock":
          comparison = a.stock - b.stock;
          break;
        case "price":
          comparison = a.basePrice - b.basePrice;
          break;
        case "status":
          comparison = Number(b.active) - Number(a.active);
          break;
        case "name":
        default:
          comparison = a.name.localeCompare(b.name, "de");
      }

      return sortDirection === "asc" ? comparison : -comparison;
    });
  }, [
    activityFilter,
    articleRows,
    ebayFilter,
    kleinanzeigenFilter,
    maxPrice,
    maxStock,
    minPrice,
    minStock,
    nameFilter,
    query,
    shopFilter,
    skuFilter,
    sortDirection,
    sortKey,
  ]);

  const selectedArticles = useMemo(
    () => articleRows.filter((article) => selectedIds.has(article.id)),
    [articleRows, selectedIds]
  );

  const visibleSelectedCount = filteredArticles.filter((article) =>
    selectedIds.has(article.id)
  ).length;
  const allVisibleSelected =
    filteredArticles.length > 0 &&
    visibleSelectedCount === filteredArticles.length;
  const someVisibleSelected =
    visibleSelectedCount > 0 && !allVisibleSelected;

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = someVisibleSelected;
    }
  }, [someVisibleSelected]);

  const activeFilterCount = [
    query.trim().length > 0,
    activityFilter !== "active",
    nameFilter.trim().length > 0,
    skuFilter.trim().length > 0,
    minStock.trim().length > 0,
    maxStock.trim().length > 0,
    minPrice.trim().length > 0,
    maxPrice.trim().length > 0,
    shopFilter !== "all",
    ebayFilter !== "all",
    kleinanzeigenFilter !== "all",
  ].filter(Boolean).length;

  const inactiveCount = articleRows.filter((article) => !article.active).length;

  function resetFilters() {
    setQuery("");
    setActivityFilter("active");
    setNameFilter("");
    setSkuFilter("");
    setMinStock("");
    setMaxStock("");
    setMinPrice("");
    setMaxPrice("");
    setShopFilter("all");
    setEbayFilter("all");
    setKleinanzeigenFilter("all");
    setSortKey("name");
    setSortDirection("asc");
  }

  function toggleArticle(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current);

      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }

      return next;
    });
    setBulkFeedback(null);
  }

  function toggleAllVisible() {
    setSelectedIds((current) => {
      const next = new Set(current);

      if (allVisibleSelected) {
        filteredArticles.forEach((article) => next.delete(article.id));
      } else {
        filteredArticles.forEach((article) => next.add(article.id));
      }

      return next;
    });
    setBulkFeedback(null);
  }

  function clearSelection() {
    setSelectedIds(new Set());
    setBulkEditorOpen(false);
    setBulkFeedback(null);
  }

  function calculateBulkPrice(article: Article, value: number) {
    let price = value;

    if (bulkMode === "increase") {
      price = article.basePrice * (1 + value / 100);
    }

    if (bulkMode === "decrease") {
      price = article.basePrice * (1 - value / 100);
    }

    return Math.max(0, Math.round(price * 100) / 100);
  }

  const parsedBulkValue = parseNumber(bulkValue);
  const bulkValueValid =
    parsedBulkValue !== null &&
    parsedBulkValue >= 0 &&
    !(bulkMode === "decrease" && parsedBulkValue > 100);

  async function applyBulkEdit() {
    if (!bulkValueValid || parsedBulkValue === null || bulkSaving) {
      return;
    }

    setBulkSaving(true);
    setBulkFeedback(null);
    setBulkPlan(null);

    try {
      const response = await fetch("/api/articles/price-plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          articleIds: selectedArticles.map((article) => article.id),
          mode: bulkMode,
          value: parsedBulkValue,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        plan?: SyncPlan;
        error?: string;
      };
      if (!response.ok || !payload.plan) {
        throw new Error(payload.error || "Preisvorschau konnte nicht erstellt werden.");
      }
      setBulkPlan(payload.plan);
      setBulkFeedback({
        kind: "success",
        message: "Die Preisvorschau ist bereit. Es wurde noch nichts in weclapp geändert.",
      });
    } catch (error) {
      setBulkFeedback({
        kind: "error",
        message:
          error instanceof Error
            ? error.message
            : "Preisvorschau konnte nicht erstellt werden.",
      });
    } finally {
      setBulkSaving(false);
    }
  }

  function handleBulkPlanChange(nextPlan: SyncPlan, message: string) {
    setBulkPlan(nextPlan);
    setBulkFeedback({
      kind: nextPlan.state === "partially_failed" ? "partial" : "success",
      message,
    });

    if (
      nextPlan.state !== "completed" &&
      nextPlan.state !== "partially_failed"
    ) {
      return;
    }
    const appliedPrices = new Map<string, number>();
    for (const item of nextPlan.items) {
      if (item.state !== "applied") continue;
      const change = item.changes.find((entry) => entry.field === "grossPrice");
      const value = Number(change?.proposed);
      if (Number.isFinite(value)) appliedPrices.set(item.entityKey, value);
    }
    setArticleRows((current) =>
      current.map((article) => {
        const price = appliedPrices.get(article.id);
        return price === undefined ? article : { ...article, basePrice: price };
      })
    );
  }

  return (
    <div>
      <section className="mb-5 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="grid gap-3 p-4 lg:grid-cols-[minmax(0,1fr)_auto_auto_auto] lg:items-center">
          <label className="relative block">
            <span className="sr-only">Artikel suchen</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Artikelname, Artikelnummer oder Beschreibung suchen…"
              className="w-full rounded-xl border border-slate-300 px-4 py-3 pr-10 outline-none focus:border-[var(--ph-green-dark)]"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Suche leeren"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-lg text-slate-400 hover:text-slate-700"
              >
                ×
              </button>
            )}
          </label>
          <label className="flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700">
            <input
              type="checkbox"
              checked={activityFilter === "active"}
              onChange={(event) =>
                setActivityFilter(event.target.checked ? "active" : "all")
              }
              className="h-4 w-4 accent-[var(--ph-green-dark)]"
            />
            Inaktive ausblenden
          </label>

          <button
            type="button"
            onClick={() => setFiltersOpen((value) => !value)}
            className="rounded-xl border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Filter einstellen
            {activeFilterCount > 0 && (
              <span className="ml-2 rounded-full bg-[var(--ph-green-dark)] px-2 py-0.5 text-xs text-white">
                {activeFilterCount}
              </span>
            )}
          </button>

          <div className="flex gap-2">
            <select
              value={sortKey}
              onChange={(event) => setSortKey(event.target.value as SortKey)}
              aria-label="Sortierfeld"
              className="min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm lg:w-48"
            >
              <option value="name">Name</option>
              <option value="sku">Artikelnummer</option>
              <option value="price">Gross1-Preis</option>
              <option value="stock">Bestand</option>
              <option value="status">Aktivstatus</option>
            </select>
            <button
              type="button"
              onClick={() =>
                setSortDirection((value) => (value === "asc" ? "desc" : "asc"))
              }
              aria-label={
                sortDirection === "asc"
                  ? "Aufsteigend sortiert"
                  : "Absteigend sortiert"
              }
              className="rounded-xl border border-slate-300 px-4 py-3 font-semibold text-slate-700 hover:bg-slate-50"
            >
              {sortDirection === "asc" ? "↑" : "↓"}
            </button>
          </div>
        </div>

        {filtersOpen && (
          <div className="border-t border-slate-200 bg-slate-50 p-4">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Artikelname
                </span>
                <input
                  type="search"
                  value={nameFilter}
                  onChange={(event) => setNameFilter(event.target.value)}
                  placeholder="Name oder Untertitel"
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-[var(--ph-green-dark)]"
                />
              </label>

              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Artikelnummer
                </span>
                <input
                  type="search"
                  value={skuFilter}
                  onChange={(event) => setSkuFilter(event.target.value)}
                  placeholder="SKU enthält…"
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-[var(--ph-green-dark)]"
                />
              </label>

              <FilterSelect
                label="Aktivstatus"
                value={activityFilter}
                onChange={(value) => setActivityFilter(value as ActivityFilter)}
              >
                <option value="active">Nur aktive</option>
                <option value="inactive">Nur inaktive</option>
                <option value="all">Aktive und inaktive</option>
              </FilterSelect>

              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Bestand von
                </span>
                <input
                  inputMode="numeric"
                  value={minStock}
                  onChange={(event) => setMinStock(event.target.value)}
                  placeholder="0"
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-[var(--ph-green-dark)]"
                />
              </label>

              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Bestand bis
                </span>
                <input
                  inputMode="numeric"
                  value={maxStock}
                  onChange={(event) => setMaxStock(event.target.value)}
                  placeholder="Kein Maximum"
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-[var(--ph-green-dark)]"
                />
              </label>

              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Gross1 von
                </span>
                <input
                  inputMode="decimal"
                  value={minPrice}
                  onChange={(event) => setMinPrice(event.target.value)}
                  placeholder="0,00 €"
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-[var(--ph-green-dark)]"
                />
              </label>

              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Gross1 bis
                </span>
                <input
                  inputMode="decimal"
                  value={maxPrice}
                  onChange={(event) => setMaxPrice(event.target.value)}
                  placeholder="Kein Maximum"
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-[var(--ph-green-dark)]"
                />
              </label>

              <FilterSelect
                label="Shopware"
                value={shopFilter}
                onChange={(value) => setShopFilter(value as ChannelFilter)}
              >
                <option value="all">Alle Shopware-Status</option>
                <option value="online">Online</option>
                <option value="draft">Entwurf</option>
                <option value="missing">Fehlt</option>
              </FilterSelect>

              <FilterSelect
                label="eBay"
                value={ebayFilter}
                onChange={(value) => setEbayFilter(value as ChannelFilter)}
              >
                <option value="all">Alle eBay-Status</option>
                <option value="online">Online</option>
                <option value="draft">Entwurf</option>
                <option value="missing">Fehlt</option>
              </FilterSelect>

              <FilterSelect
                label="Kleinanzeigen"
                value={kleinanzeigenFilter}
                onChange={(value) =>
                  setKleinanzeigenFilter(value as ChannelFilter)
                }
              >
                <option value="all">Alle Kleinanzeigen-Status</option>
                <option value="online">Online</option>
                <option value="draft">Entwurf</option>
                <option value="missing">Fehlt</option>
              </FilterSelect>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4">
              <p className="text-sm text-slate-500">
                {inactiveCount} inaktive Artikel im geladenen Datenbestand
              </p>
              <button
                type="button"
                onClick={resetFilters}
                className="text-sm font-semibold text-[var(--ph-green-dark)] hover:underline"
              >
                Alle Filter zurücksetzen
              </button>
            </div>
          </div>
        )}
      </section>

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="rounded-xl border bg-white px-4 py-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Geladen
          </div>
          <div className="mt-1 text-2xl font-bold text-slate-800">
            {articleRows.length}
          </div>
        </div>
        <div className="rounded-xl border bg-white px-4 py-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Angezeigt
          </div>
          <div className="mt-1 text-2xl font-bold text-[var(--ph-green-dark)]">
            {filteredArticles.length}
          </div>
        </div>
        <div className="rounded-xl border bg-white px-4 py-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Ausgewählt
          </div>
          <div className="mt-1 text-2xl font-bold text-[var(--ph-gold)]">
            {selectedIds.size}
          </div>
        </div>
        <div className="rounded-xl border bg-white px-4 py-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Inaktiv
          </div>
          <div className="mt-1 text-2xl font-bold text-slate-500">
            {inactiveCount}
          </div>
        </div>
      </div>

      {bulkFeedback && (
        <div
          className={`mb-4 rounded-xl border px-4 py-3 text-sm font-medium ${
            bulkFeedback.kind === "success"
              ? "border-green-200 bg-green-50 text-green-800"
              : bulkFeedback.kind === "partial"
                ? "border-amber-200 bg-amber-50 text-amber-800"
                : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {bulkFeedback.message}
        </div>
      )}

      {selectedIds.size > 0 && (
        <section className="sticky top-3 z-20 mb-4 rounded-2xl border border-[var(--ph-green-dark)] bg-white p-4 shadow-lg">
          <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
            <div>
              <div className="font-bold text-[var(--ph-green-dark)]">
                {selectedIds.size} Artikel ausgewählt
              </div>
              <div className="text-sm text-slate-500">
                Davon sind {visibleSelectedCount} in der aktuellen Ansicht sichtbar.
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {!allVisibleSelected && filteredArticles.length > 0 && (
                <button
                  type="button"
                  onClick={toggleAllVisible}
                  className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold hover:bg-slate-50"
                >
                  Alle {filteredArticles.length} Treffer auswählen
                </button>
              )}
              <button
                type="button"
                onClick={() => setBulkEditorOpen((value) => !value)}
                className="rounded-xl bg-[var(--ph-green-dark)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--ph-green)]"
              >
                Massenbearbeitung
              </button>
              <button
                type="button"
                onClick={clearSelection}
                className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold hover:bg-slate-50"
              >
                Auswahl aufheben
              </button>
            </div>
          </div>

          {bulkEditorOpen && (
            <div className="mt-4 border-t border-slate-200 pt-4">
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                Diese Aktion schreibt Gross1-Preise direkt nach Weclapp. Die Verarbeitung erfolgt in sicheren Fünfergruppen.
              </div>

              <div className="mt-4 grid gap-4 lg:grid-cols-[240px_minmax(220px,1fr)_auto] lg:items-end">
                <FilterSelect
                  label="Preisaktion"
                  value={bulkMode}
                  onChange={(value) => {
                    setBulkMode(value as BulkMode);
                    setBulkFeedback(null);
                  }}
                >
                  <option value="set">Gross1 festlegen</option>
                  <option value="increase">Prozentual erhöhen</option>
                  <option value="decrease">Prozentual reduzieren</option>
                </FilterSelect>

                <label className="block">
                  <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {bulkMode === "set" ? "Neuer Gross1-Preis" : "Änderung in Prozent"}
                  </span>
                  <div className="relative">
                    <input
                      inputMode="decimal"
                      value={bulkValue}
                      onChange={(event) => setBulkValue(event.target.value)}
                      placeholder={bulkMode === "set" ? "49,90" : "10"}
                      className="w-full rounded-xl border border-slate-300 px-4 py-2.5 pr-12 outline-none focus:border-[var(--ph-green-dark)]"
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500">
                      {bulkMode === "set" ? "€" : "%"}
                    </span>
                  </div>
                  {bulkValue && !bulkValueValid && (
                    <span className="mt-1 block text-xs text-red-600">
                      Bitte einen gültigen Wert eingeben
                      {bulkMode === "decrease" ? " (maximal 100 %)" : ""}.
                    </span>
                  )}
                </label>

                <button
                  type="button"
                  disabled={!bulkValueValid || bulkSaving}
                  onClick={applyBulkEdit}
                  className="rounded-xl bg-[var(--ph-green-dark)] px-5 py-2.5 font-semibold text-white hover:bg-[var(--ph-green)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {bulkSaving
                    ? "Preisvorschau wird erstellt…"
                    : `${selectedArticles.length} Preise prüfen`}
                </button>
              </div>

              {bulkValueValid && parsedBulkValue !== null && selectedArticles.length > 0 && (
                <div className="mt-4 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
                  Vorschau: {selectedArticles.slice(0, 3).map((article) => (
                    <span key={article.id} className="mr-4 inline-block">
                      {article.sku}: {currencyFormatter.format(article.basePrice)} →{" "}
                      <strong>
                        {currencyFormatter.format(
                          calculateBulkPrice(article, parsedBulkValue)
                        )}
                      </strong>
                    </span>
                  ))}
                  {selectedArticles.length > 3 && (
                    <span>und {selectedArticles.length - 3} weitere</span>
                  )}
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {bulkPlan && (
        <ShopwareSyncPlanReview
          plan={bulkPlan}
          onChange={handleBulkPlanChange}
        />
      )}

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="hidden grid-cols-[48px_minmax(260px,1.6fr)_110px_100px_120px_minmax(280px,1fr)_140px] items-center gap-3 border-b bg-slate-50 px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-500 lg:grid">
          <div className="flex justify-center">
            <input
              ref={selectAllRef}
              type="checkbox"
              checked={allVisibleSelected}
              onChange={toggleAllVisible}
              aria-label="Alle sichtbaren Artikel auswählen"
              className="h-4 w-4 accent-[var(--ph-green-dark)]"
            />
          </div>
          <div>Artikel</div>
          <div>Status</div>
          <div className="text-right">Bestand</div>
          <div className="text-right">Gross1</div>
          <div>Kanäle</div>
          <div></div>
        </div>

        <div className="divide-y divide-slate-200">
          {filteredArticles.length === 0 ? (
            <div className="p-12 text-center">
              <div className="text-lg font-semibold">Keine Artikel gefunden</div>
              <div className="mt-1 text-sm text-slate-500">
                Passe die Suche oder die eingestellten Filter an.
              </div>
              <button
                type="button"
                onClick={resetFilters}
                className="mt-4 rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold hover:bg-slate-50"
              >
                Filter zurücksetzen
              </button>
            </div>
          ) : (
            filteredArticles.map((article) => {
              const selected = selectedIds.has(article.id);

              return (
                <article
                  key={article.id}
                  className={`grid gap-3 px-4 py-4 transition lg:grid-cols-[48px_minmax(260px,1.6fr)_110px_100px_120px_minmax(280px,1fr)_140px] lg:items-center ${
                    selected
                      ? "bg-green-50/70"
                      : !article.active
                        ? "bg-slate-50"
                        : "hover:bg-slate-50/70"
                  }`}
                >
                  <div className="flex items-start justify-between lg:justify-center">
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => toggleArticle(article.id)}
                      aria-label={`${article.name} auswählen`}
                      className="mt-1 h-5 w-5 accent-[var(--ph-green-dark)] lg:mt-0 lg:h-4 lg:w-4"
                    />
                    <span className="text-xs font-semibold uppercase text-slate-400 lg:hidden">
                      {article.sku}
                    </span>
                  </div>

                  <div className="min-w-0">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="hidden h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-green-50 font-bold text-green-800 sm:flex">
                        PH
                      </div>
                      <div className="min-w-0">
                        <Link
                          href={`/articles/${article.id}`}
                          className="block truncate font-bold text-slate-900 hover:text-[var(--ph-green-dark)] hover:underline"
                        >
                          {article.name}
                        </Link>
                        <p className="truncate text-sm text-slate-500">
                          {article.subtitle || "Keine Beschreibung"}
                        </p>
                        <p className="mt-0.5 hidden font-mono text-xs text-slate-400 lg:block">
                          {article.sku}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div>
                    <span
                      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                        article.active
                          ? "bg-green-100 text-green-800"
                          : "bg-slate-200 text-slate-600"
                      }`}
                    >
                      {article.active ? "Aktiv" : "Inaktiv"}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-sm lg:block lg:text-right">
                    <span className="font-semibold text-slate-500 lg:hidden">Bestand</span>
                    <span className="font-semibold text-slate-800">{article.stock}</span>
                  </div>

                  <div className="flex items-center justify-between lg:block lg:text-right">
                    <span className="text-sm font-semibold text-slate-500 lg:hidden">Gross1</span>
                    <span className="font-bold text-[var(--ph-green-dark)]">
                      {currencyFormatter.format(article.basePrice)}
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    <StatusBadge name="Shop" status={article.channels.shop} />
                    <StatusBadge name="eBay" status={article.channels.ebay} />
                    <StatusBadge
                      name="Kleinanzeigen"
                      status={article.channels.kleinanzeigen}
                    />
                  </div>

                  <div className="flex flex-col gap-2">
                    <Link
                      href={`/channels/ebay?articleId=${encodeURIComponent(article.id)}`}
                      className="rounded-lg bg-[var(--ph-green-dark)] px-3 py-2 text-center text-sm font-semibold text-white hover:bg-[var(--ph-green)]"
                    >
                      Für eBay
                    </Link>
                    <Link
                      href={`/articles/${article.id}`}
                      className="rounded-lg border border-slate-300 px-3 py-2 text-center text-sm font-semibold text-[var(--ph-green-dark)] hover:bg-white"
                    >
                      Öffnen
                    </Link>
                  </div>
                </article>
              );
            })
          )}
        </div>
      </section>

      <div className="mt-4 flex flex-col justify-between gap-2 text-sm text-slate-500 sm:flex-row">
        <span>
          {filteredArticles.length} von {articleRows.length} Artikeln angezeigt
        </span>
        <span>
          Auswahl und Filter beziehen sich auf die aktuell geladenen Weclapp-Daten.
        </span>
      </div>
    </div>
  );
}
