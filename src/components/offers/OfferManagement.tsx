"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { EbayListingDraft } from "@/types/ebay";
import type { KleinanzeigenListing } from "@/types/kleinanzeigen";
import type {
  ProductCandidate,
  ShopwareProductDraft,
} from "@/types/shopwarePublishing";

type ActiveFilter = "active" | "inactive" | "all";
type ChannelFilter =
  | "all"
  | "without_offer"
  | "shopware"
  | "ebay"
  | "kleinanzeigen";
const PAGE_SIZE = 100;

function money(value?: number) {
  if (value === undefined) return "–";
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
  }).format(value);
}

function shopwareState(
  candidate: ProductCandidate,
  draft?: ShopwareProductDraft
) {
  if (draft?.status === "published" || candidate.alreadyInShopware) {
    return { label: "In Shopware", tone: "bg-green-100 text-green-800" };
  }
  if (draft?.status === "blocked") {
    return { label: "Entwurf unvollständig", tone: "bg-red-100 text-red-800" };
  }
  if (draft?.status === "publishing") {
    return { label: "Übertragung läuft", tone: "bg-blue-100 text-blue-800" };
  }
  if (draft?.status === "reconciliation_required") {
    return { label: "Status prüfen", tone: "bg-amber-100 text-amber-900" };
  }
  if (draft?.approvedAt) {
    return { label: "Freigegeben", tone: "bg-blue-100 text-blue-800" };
  }
  if (draft) {
    return { label: "Entwurf vorhanden", tone: "bg-violet-100 text-violet-800" };
  }
  return { label: "Nicht angelegt", tone: "bg-slate-100 text-slate-700" };
}

function ebayState(draft?: EbayListingDraft) {
  if (draft?.status === "published") {
    return { label: "Aktiv bei eBay", tone: "bg-green-100 text-green-800" };
  }
  if (draft?.status === "paused") {
    return { label: "Pausiert", tone: "bg-amber-100 text-amber-900" };
  }
  if (
    draft?.status === "reconciliation_required" ||
    draft?.status === "management_reconciliation_required"
  ) {
    return { label: "Status prüfen", tone: "bg-red-100 text-red-800" };
  }
  if (draft?.status === "blocked") {
    return { label: "Entwurf unvollständig", tone: "bg-red-100 text-red-800" };
  }
  if (draft?.status === "publishing") {
    return { label: "Übertragung läuft", tone: "bg-blue-100 text-blue-800" };
  }
  if (draft?.approvedAt) {
    return { label: "Freigegeben", tone: "bg-blue-100 text-blue-800" };
  }
  if (draft) {
    return { label: "Entwurf vorhanden", tone: "bg-violet-100 text-violet-800" };
  }
  return { label: "Nicht angelegt", tone: "bg-slate-100 text-slate-700" };
}

function kleinanzeigenState(listing?: KleinanzeigenListing) {
  if (listing?.status === "active") {
    return { label: "Aktiv", tone: "bg-green-100 text-green-800" };
  }
  if (listing?.status === "paused") {
    return { label: "Pausiert", tone: "bg-amber-100 text-amber-900" };
  }
  if (listing?.status === "error") {
    return { label: "Fehler", tone: "bg-red-100 text-red-800" };
  }
  if (listing) {
    return { label: "Entwurf vorhanden", tone: "bg-violet-100 text-violet-800" };
  }
  return { label: "Nicht angelegt · On Hold", tone: "bg-slate-100 text-slate-700" };
}

export default function OfferManagement() {
  const [candidates, setCandidates] = useState<ProductCandidate[]>([]);
  const [shopwareDrafts, setShopwareDrafts] = useState<ShopwareProductDraft[]>([]);
  const [ebayDrafts, setEbayDrafts] = useState<EbayListingDraft[]>([]);
  const [kleinanzeigenListings, setKleinanzeigenListings] = useState<
    KleinanzeigenListing[]
  >([]);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>("all");
  const [channelFilter, setChannelFilter] = useState<ChannelFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [onlyComplete, setOnlyComplete] = useState(false);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const [
        candidateResponse,
        shopwareResponse,
        ebayResponse,
        kleinanzeigenResponse,
      ] = await Promise.all([
        fetch("/api/channels/shopware/candidates?all=true", {
          cache: "no-store",
        }),
        fetch("/api/channels/shopware/drafts", { cache: "no-store" }),
        fetch("/api/channels/ebay/drafts", { cache: "no-store" }),
        fetch("/api/channels/kleinanzeigen/listings", { cache: "no-store" }),
      ]);
      const candidatesPayload = (await candidateResponse.json()) as {
        candidates?: ProductCandidate[];
        hasMore?: boolean;
        error?: string;
      };
      const shopwarePayload = (await shopwareResponse.json()) as {
        drafts?: ShopwareProductDraft[];
        error?: string;
      };
      const ebayPayload = (await ebayResponse.json()) as {
        drafts?: EbayListingDraft[];
        error?: string;
      };
      const kleinanzeigenPayload = (await kleinanzeigenResponse.json()) as {
        listings?: KleinanzeigenListing[];
        error?: string;
      };
      if (!candidateResponse.ok || !candidatesPayload.candidates) {
        throw new Error(
          candidatesPayload.error || "Weclapp-Artikel konnten nicht geladen werden."
        );
      }
      if (!shopwareResponse.ok || !shopwarePayload.drafts) {
        throw new Error(
          shopwarePayload.error || "Shopware-Vorgänge konnten nicht geladen werden."
        );
      }
      if (!ebayResponse.ok || !ebayPayload.drafts) {
        throw new Error(
          ebayPayload.error || "eBay-Vorgänge konnten nicht geladen werden."
        );
      }
      if (!kleinanzeigenResponse.ok || !kleinanzeigenPayload.listings) {
        throw new Error(
          kleinanzeigenPayload.error ||
            "Kleinanzeigen-Vorgänge konnten nicht geladen werden."
        );
      }
      setCandidates(candidatesPayload.candidates);
      setShopwareDrafts(shopwarePayload.drafts);
      setEbayDrafts(ebayPayload.drafts);
      setKleinanzeigenListings(kleinanzeigenPayload.listings);
      setPage(1);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unbekannter Fehler");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [load]);

  const shopwareByArticle = useMemo(
    () => new Map(shopwareDrafts.map((draft) => [draft.source.articleId, draft])),
    [shopwareDrafts]
  );
  const ebayByArticle = useMemo(
    () => new Map(ebayDrafts.map((draft) => [draft.source.articleId, draft])),
    [ebayDrafts]
  );
  const kleinanzeigenByArticle = useMemo(() => {
    const result = new Map<string, KleinanzeigenListing>();
    for (const listing of kleinanzeigenListings) {
      if (listing.articleId && !result.has(listing.articleId)) {
        result.set(listing.articleId, listing);
      }
    }
    return result;
  }, [kleinanzeigenListings]);
  const kleinanzeigenBySku = useMemo(() => {
    const result = new Map<string, KleinanzeigenListing>();
    for (const listing of kleinanzeigenListings) {
      if (!result.has(listing.sku)) result.set(listing.sku, listing);
    }
    return result;
  }, [kleinanzeigenListings]);

  const categories = useMemo(
    () =>
      [...new Set(
        candidates
          .map((candidate) => candidate.articleCategoryName)
          .filter((value): value is string => Boolean(value))
      )].sort((left, right) => left.localeCompare(right, "de")),
    [candidates]
  );

  const visible = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("de");
    return candidates.filter((candidate) => {
      const shopware = shopwareByArticle.get(candidate.articleId);
      const ebay = ebayByArticle.get(candidate.articleId);
      const kleinanzeigen =
        kleinanzeigenByArticle.get(candidate.articleId) ||
        kleinanzeigenBySku.get(candidate.articleNumber);
      const searchable = [
        candidate.articleNumber,
        candidate.germanName,
        candidate.latinName,
        candidate.heightLabel,
        candidate.potSize,
        shopware?.title,
        ebay?.title,
        kleinanzeigen?.title,
      ]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase("de");
      const hasShopware = candidate.alreadyInShopware || Boolean(shopware);
      const hasEbay = Boolean(ebay);
      const hasKleinanzeigen = Boolean(kleinanzeigen);
      return (
        (!term || searchable.includes(term)) &&
        (categoryFilter === "all" ||
          candidate.articleCategoryName === categoryFilter) &&
        (activeFilter === "all" ||
          (activeFilter === "active"
            ? candidate.active !== false
            : candidate.active === false)) &&
        (!onlyComplete || candidate.eligible) &&
        (channelFilter === "all" ||
          (channelFilter === "without_offer" &&
            !hasShopware &&
            !hasEbay &&
            !hasKleinanzeigen) ||
          (channelFilter === "shopware" && hasShopware) ||
          (channelFilter === "ebay" && hasEbay) ||
          (channelFilter === "kleinanzeigen" && hasKleinanzeigen))
      );
    });
  }, [
    activeFilter,
    candidates,
    categoryFilter,
    channelFilter,
    ebayByArticle,
    kleinanzeigenByArticle,
    kleinanzeigenBySku,
    onlyComplete,
    search,
    shopwareByArticle,
  ]);
  const pageCount = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const pageCandidates = visible.slice(
    (page - 1) * PAGE_SIZE,
    page * PAGE_SIZE
  );

  return (
    <div className="mx-auto max-w-[1800px]">
      <header className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-[var(--ph-gold)]">
            Vertrieb
          </p>
          <h1 className="mt-1 text-3xl text-[var(--ph-green-dark)]">
            Angebotsverwaltung
          </h1>
          <p className="mt-2 max-w-4xl text-slate-500">
            Ein Weclapp-Artikel, drei Verkaufskanäle: Status erkennen und
            Shopware-, eBay- oder Kleinanzeigen-Angebot gezielt pflegen.
          </p>
        </div>
        <Link
          href="/connection-settings"
          className="rounded-xl border border-[var(--ph-green-dark)] bg-white px-4 py-2.5 text-center font-semibold text-[var(--ph-green-dark)]"
        >
          Verbindungseinstellungen
        </Link>
      </header>

      {error && (
        <div className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          {error}
        </div>
      )}

      <section className="mt-6 overflow-hidden rounded-2xl border bg-white shadow-sm">
        <div className="border-b p-5">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
            <label className="text-xs font-semibold text-slate-600 xl:col-span-2">
              Artikel, SKU oder Angebot suchen
              <input
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
                placeholder="z. B. 100000778, Olive oder Olea europaea"
                className="mt-1 block w-full rounded-xl border px-3 py-2.5 text-sm font-normal text-slate-900"
              />
            </label>
            <label className="text-xs font-semibold text-slate-600">
              Weclapp-Status
              <select
                value={activeFilter}
                onChange={(event) => {
                  setActiveFilter(event.target.value as ActiveFilter);
                  setPage(1);
                }}
                className="mt-1 block w-full rounded-xl border bg-white px-3 py-2.5 text-sm font-normal text-slate-900"
              >
                <option value="active">Nur aktive Artikel</option>
                <option value="inactive">Nur inaktive Artikel</option>
                <option value="all">Aktive und inaktive</option>
              </select>
            </label>
            <label className="text-xs font-semibold text-slate-600">
              Weclapp-Kategorie
              <select
                value={categoryFilter}
                onChange={(event) => {
                  setCategoryFilter(event.target.value);
                  setPage(1);
                }}
                className="mt-1 block w-full rounded-xl border bg-white px-3 py-2.5 text-sm font-normal text-slate-900"
              >
                <option value="all">Alle Kategorien</option>
                {categories.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-semibold text-slate-600">
              Verkaufskanal
              <select
                value={channelFilter}
                onChange={(event) => {
                  setChannelFilter(event.target.value as ChannelFilter);
                  setPage(1);
                }}
                className="mt-1 block w-full rounded-xl border bg-white px-3 py-2.5 text-sm font-normal text-slate-900"
              >
                <option value="all">Alle Kanäle</option>
                <option value="without_offer">Noch ohne Angebot</option>
                <option value="shopware">Mit Shopware-Vorgang</option>
                <option value="ebay">Mit eBay-Vorgang</option>
                <option value="kleinanzeigen">Mit Kleinanzeigen-Vorgang</option>
              </select>
            </label>
            <label className="flex items-center gap-2 self-end rounded-xl border px-3 py-2.5 text-sm font-semibold">
              <input
                type="checkbox"
                checked={onlyComplete}
                onChange={(event) => {
                  setOnlyComplete(event.target.checked);
                  setPage(1);
                }}
              />
              Nur vollständige Grunddaten
            </label>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-500">
            <span>
              {visible.length} von {candidates.length} vollständig geladenen Artikeln
            </span>
            <button
              type="button"
              onClick={() => load()}
              disabled={busy}
              className="rounded-lg border px-3 py-1.5 font-semibold text-slate-700 disabled:opacity-40"
            >
              {busy ? "Lädt…" : "Neu laden"}
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-[1320px] divide-y text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Artikel</th>
                <th className="px-4 py-3">SKU / Namen</th>
                <th className="px-4 py-3">Eckdaten</th>
                <th className="px-4 py-3">Shopware</th>
                <th className="px-4 py-3">eBay</th>
                <th className="px-4 py-3">Kleinanzeigen</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {!visible.length ? (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center text-slate-500">
                    {busy
                      ? "Angebote und Artikel werden geladen…"
                      : "Für diese Filter wurden keine Artikel gefunden."}
                  </td>
                </tr>
              ) : (
                pageCandidates.map((candidate) => {
                  const shopwareDraft = shopwareByArticle.get(candidate.articleId);
                  const ebayDraft = ebayByArticle.get(candidate.articleId);
                  const kleinanzeigen =
                    kleinanzeigenByArticle.get(candidate.articleId) ||
                    kleinanzeigenBySku.get(candidate.articleNumber);
                  const shopware = shopwareState(candidate, shopwareDraft);
                  const ebay = ebayState(ebayDraft);
                  const kleinanzeigenStatus = kleinanzeigenState(kleinanzeigen);
                  const shopwareHref = shopwareDraft
                    ? `/channels/shopware?articleId=${encodeURIComponent(candidate.articleId)}`
                    : candidate.alreadyInShopware
                      ? `/channels/shopware?query=${encodeURIComponent(candidate.articleNumber)}`
                      : `/channels/shopware?articleId=${encodeURIComponent(candidate.articleId)}&create=1`;
                  return (
                    <tr key={candidate.articleId} className="align-top hover:bg-[var(--ph-green-light)]/30">
                      <td className="px-4 py-4">
                        <div className="h-16 w-16 overflow-hidden rounded-xl bg-slate-100">
                          {candidate.imageUrls[0] ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={candidate.imageUrls[0]}
                              alt=""
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <span className="flex h-full items-center justify-center text-xs text-slate-400">
                              Kein Bild
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="min-w-64 px-4 py-4">
                        <strong className="text-[var(--ph-green-dark)]">
                          {candidate.germanName || "Name fehlt"}
                        </strong>
                        <p className="mt-0.5 italic text-slate-500">
                          {candidate.latinName || "Lateinischer Name fehlt"}
                        </p>
                        <p className="mt-1 text-xs text-slate-400">
                          {candidate.articleNumber}
                        </p>
                        <p className="mt-1 text-xs font-medium text-slate-500">
                          {candidate.articleCategoryName || "Ohne Weclapp-Kategorie"}
                        </p>
                        <span className={`mt-2 inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                          candidate.active !== false
                            ? "bg-green-100 text-green-800"
                            : "bg-slate-200 text-slate-700"
                        }`}>
                          {candidate.active !== false ? "Aktiv" : "Inaktiv"}
                        </span>
                      </td>
                      <td className="min-w-40 px-4 py-4">
                        <strong>{money(candidate.price)}</strong>
                        <p className="mt-1">{candidate.heightLabel || "Höhe fehlt"}</p>
                        <p className="text-slate-500">{candidate.potSize || "Topfmaß fehlt"}</p>
                        <p className="text-slate-500">Bestand: {candidate.stock ?? "–"}</p>
                      </td>
                      <td className="min-w-52 px-4 py-4">
                        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${shopware.tone}`}>
                          {shopware.label}
                        </span>
                        <div className="mt-3">
                          <Link
                            href={shopwareHref}
                            className="inline-block rounded-lg border border-[var(--ph-green-dark)] px-3 py-2 text-xs font-semibold text-[var(--ph-green-dark)]"
                          >
                            {shopwareDraft || candidate.alreadyInShopware
                              ? "Shopware pflegen"
                              : "Shopware-Entwurf erstellen"}
                          </Link>
                        </div>
                      </td>
                      <td className="min-w-52 px-4 py-4">
                        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${ebay.tone}`}>
                          {ebay.label}
                        </span>
                        <div className="mt-3">
                          <Link
                            href={`/channels/ebay?articleId=${encodeURIComponent(candidate.articleId)}`}
                            className="inline-block rounded-lg border border-[var(--ph-green-dark)] px-3 py-2 text-xs font-semibold text-[var(--ph-green-dark)]"
                          >
                            {ebayDraft ? "eBay pflegen" : "eBay-Entwurf erstellen"}
                          </Link>
                        </div>
                      </td>
                      <td className="min-w-56 px-4 py-4">
                        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${kleinanzeigenStatus.tone}`}>
                          {kleinanzeigenStatus.label}
                        </span>
                        <div className="mt-3">
                          <Link
                            href={`/channels/kleinanzeigen?articleId=${encodeURIComponent(candidate.articleId)}`}
                            className="inline-block rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700"
                          >
                            {kleinanzeigen ? "Kleinanzeige pflegen" : "Entwurf vorbereiten"}
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-end gap-2 border-t p-4">
          <button
            type="button"
            onClick={() => setPage((current) => Math.max(1, current - 1))}
            disabled={page <= 1 || busy}
            className="rounded-lg border px-3 py-2 text-sm disabled:opacity-40"
          >
            Zurück
          </button>
          <span className="text-sm">Seite {page} von {pageCount}</span>
          <button
            type="button"
            onClick={() => setPage((current) => Math.min(pageCount, current + 1))}
            disabled={page >= pageCount || busy}
            className="rounded-lg border px-3 py-2 text-sm disabled:opacity-40"
          >
            Weiter
          </button>
        </div>
      </section>
    </div>
  );
}
