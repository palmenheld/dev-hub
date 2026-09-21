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
type CreateChannel = "shopware" | "ebay" | "kleinanzeigen";
type CreationFeedback = { kind: "success" | "error"; message: string };
const PAGE_SIZE = 100;

const channelLabels: Record<CreateChannel, string> = {
  shopware: "Shopware",
  ebay: "eBay",
  kleinanzeigen: "Kleinanzeigen",
};

function delay(milliseconds: number) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

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
  const [selectedChannels, setSelectedChannels] = useState<
    Record<string, CreateChannel[]>
  >({});
  const [creating, setCreating] = useState(false);
  const [creationProgress, setCreationProgress] = useState<
    Record<string, string>
  >({});
  const [creationFeedback, setCreationFeedback] =
    useState<CreationFeedback | null>(null);

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
          (categoryFilter === "__none__"
            ? !candidate.articleCategoryName
            : candidate.articleCategoryName === categoryFilter)) &&
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
  const selectedTaskCount = Object.values(selectedChannels).reduce(
    (sum, channels) => sum + channels.length,
    0
  );

  function toggleChannel(articleId: string, channel: CreateChannel) {
    if (creating) return;
    setSelectedChannels((current) => {
      const selected = new Set(current[articleId] || []);
      if (selected.has(channel)) selected.delete(channel);
      else selected.add(channel);
      const next = { ...current };
      if (selected.size) next[articleId] = [...selected];
      else delete next[articleId];
      return next;
    });
  }

  function selectChannels(articleId: string, channels: CreateChannel[]) {
    if (creating) return;
    setSelectedChannels((current) => ({
      ...current,
      [articleId]: [...new Set(channels)],
    }));
  }

  function markProgress(articleId: string, message: string) {
    setCreationProgress((current) => ({ ...current, [articleId]: message }));
  }

  async function responsePayload<T>(response: Response) {
    const payload = (await response.json()) as T & { error?: string };
    if (!response.ok) {
      throw new Error(payload.error || "Der Entwurf konnte nicht erstellt werden.");
    }
    return payload;
  }

  async function waitForEbayDraft(jobId: string) {
    for (let attempt = 0; attempt < 150; attempt += 1) {
      await delay(1_500);
      const response = await fetch(
        `/api/channels/ebay/draft-jobs?id=${encodeURIComponent(jobId)}`,
        { cache: "no-store" }
      );
      const payload = await responsePayload<{
        job?: { status: string; error?: string };
        draft?: EbayListingDraft;
      }>(response);
      if (payload.job?.status === "failed") {
        throw new Error(payload.job.error || "Der eBay-Entwurf ist fehlgeschlagen.");
      }
      if (payload.job?.status === "completed" && payload.draft) {
        return payload.draft;
      }
    }
    throw new Error("Die eBay-Erstellung dauert zu lange. Der Auftrag läuft möglicherweise weiter.");
  }

  async function createSelectedDrafts() {
    if (!selectedTaskCount || creating) return;
    const work = Object.entries(selectedChannels).filter(
      ([, channels]) => channels.length
    );
    setCreating(true);
    setCreationFeedback(null);
    setCreationProgress({});
    const errors: string[] = [];
    let completed = 0;

    for (const [articleId, channels] of work) {
      const candidate = candidates.find((item) => item.articleId === articleId);
      if (!candidate) continue;
      const successful = new Set<CreateChannel>();
      const ordered = (["shopware", "ebay", "kleinanzeigen"] as const).filter(
        (channel) => channels.includes(channel)
      );
      for (const channel of ordered) {
        markProgress(articleId, `${channelLabels[channel]} wird erstellt…`);
        try {
          if (channel === "shopware") {
            const response = await fetch("/api/channels/shopware/drafts", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ articleId }),
            });
            const payload = await responsePayload<{ draft?: ShopwareProductDraft }>(response);
            if (!payload.draft) throw new Error("Shopware hat keinen Entwurf zurückgegeben.");
            setShopwareDrafts((current) => [
              payload.draft!,
              ...current.filter((draft) => draft.source.articleId !== articleId),
            ]);
          } else if (channel === "ebay") {
            const response = await fetch("/api/channels/ebay/draft-jobs", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ articleId }),
            });
            const payload = await responsePayload<{ job?: { id: string } }>(response);
            if (!payload.job) throw new Error("eBay hat keinen Auftrag zurückgegeben.");
            const draft = await waitForEbayDraft(payload.job.id);
            setEbayDrafts((current) => [
              draft,
              ...current.filter((item) => item.source.articleId !== articleId),
            ]);
          } else {
            const response = await fetch("/api/channels/kleinanzeigen/drafts", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ articleId }),
            });
            const payload = await responsePayload<{ listing?: KleinanzeigenListing }>(response);
            if (!payload.listing) {
              throw new Error("Kleinanzeigen hat keinen Entwurf zurückgegeben.");
            }
            setKleinanzeigenListings((current) => [
              payload.listing!,
              ...current.filter(
                (listing) =>
                  listing.articleId !== articleId &&
                  listing.sku !== candidate.articleNumber
              ),
            ]);
          }
          successful.add(channel);
          completed += 1;
          markProgress(articleId, `${channelLabels[channel]} wurde erstellt.`);
        } catch (caught) {
          const message = caught instanceof Error ? caught.message : "Unbekannter Fehler";
          errors.push(`${candidate.articleNumber} · ${channelLabels[channel]}: ${message}`);
          markProgress(articleId, `${channelLabels[channel]} fehlgeschlagen: ${message}`);
        }
      }
      setSelectedChannels((current) => {
        const remaining = (current[articleId] || []).filter(
          (channel) => !successful.has(channel)
        );
        const next = { ...current };
        if (remaining.length) next[articleId] = remaining;
        else delete next[articleId];
        return next;
      });
    }

    setCreationFeedback({
      kind: errors.length ? "error" : "success",
      message: errors.length
        ? `${completed} Entwurf/Entwürfe erstellt. ${errors.join(" | ")}`
        : `${completed} Entwurf/Entwürfe wurden erstellt und können jetzt geprüft werden.`,
    });
    setCreating(false);
  }

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

      {creationFeedback && (
        <div className={`mt-5 rounded-xl border px-4 py-3 text-sm font-medium ${
          creationFeedback.kind === "success"
            ? "border-green-200 bg-green-50 text-green-800"
            : "border-amber-200 bg-amber-50 text-amber-900"
        }`}>
          {creationFeedback.message}
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
                <option value="__none__">Ohne Weclapp-Kategorie</option>
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
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-green-200 bg-green-50 px-4 py-3">
            <div>
              <strong className="text-sm text-green-950">
                {selectedTaskCount
                  ? `${selectedTaskCount} Kanalentwurf/Kanalentwürfe ausgewählt`
                  : "Gewünschte Kanäle direkt in der Tabelle anhaken"}
              </strong>
              <p className="mt-0.5 text-xs text-green-800">
                Bei mehreren Kanälen wird vorhandene Recherche automatisch wiederverwendet.
              </p>
            </div>
            <div className="flex gap-2">
              {selectedTaskCount > 0 && !creating && (
                <button
                  type="button"
                  onClick={() => setSelectedChannels({})}
                  className="rounded-lg border border-green-300 bg-white px-3 py-2 text-sm font-semibold text-green-900"
                >
                  Auswahl löschen
                </button>
              )}
              <button
                type="button"
                onClick={() => void createSelectedDrafts()}
                disabled={!selectedTaskCount || creating}
                className="rounded-lg bg-[var(--ph-green-dark)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
              >
                {creating ? "Entwürfe werden erstellt…" : "Ausgewählte Entwürfe erstellen"}
              </button>
            </div>
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
                  const availableChannels: CreateChannel[] = [
                    !shopwareDraft && !candidate.alreadyInShopware
                      ? "shopware"
                      : null,
                    !ebayDraft ? "ebay" : null,
                    !kleinanzeigen ? "kleinanzeigen" : null,
                  ].filter(
                    (channel): channel is CreateChannel => Boolean(channel)
                  );
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
                        {availableChannels.length > 1 && (
                          <button
                            type="button"
                            onClick={() =>
                              selectChannels(candidate.articleId, availableChannels)
                            }
                            disabled={creating}
                            className="mt-3 block rounded-lg border border-green-300 bg-green-50 px-2.5 py-1.5 text-xs font-semibold text-green-900 disabled:opacity-40"
                          >
                            Alle freien Kanäle wählen
                          </button>
                        )}
                      </td>
                      <td className="min-w-40 px-4 py-4">
                        <strong>{money(candidate.price)}</strong>
                        <p className="mt-1">{candidate.heightLabel || "Höhe fehlt"}</p>
                        <p className="text-slate-500">{candidate.potSize || "Topfmaß fehlt"}</p>
                        <p className="text-slate-500">Bestand: {candidate.stock ?? "–"}</p>
                      </td>
                      <td className="min-w-52 px-4 py-4">
                        {!shopwareDraft && !candidate.alreadyInShopware && (
                          <label className="mb-3 flex items-center gap-2 text-xs font-semibold text-slate-700">
                            <input
                              type="checkbox"
                              checked={(selectedChannels[candidate.articleId] || []).includes("shopware")}
                              onChange={() => toggleChannel(candidate.articleId, "shopware")}
                              disabled={creating}
                            />
                            Für Shopware erstellen
                          </label>
                        )}
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
                        {!ebayDraft && (
                          <label className="mb-3 flex items-center gap-2 text-xs font-semibold text-slate-700">
                            <input
                              type="checkbox"
                              checked={(selectedChannels[candidate.articleId] || []).includes("ebay")}
                              onChange={() => toggleChannel(candidate.articleId, "ebay")}
                              disabled={creating}
                            />
                            Für eBay erstellen
                          </label>
                        )}
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
                        {!kleinanzeigen && (
                          <label className="mb-3 flex items-center gap-2 text-xs font-semibold text-slate-700">
                            <input
                              type="checkbox"
                              checked={(selectedChannels[candidate.articleId] || []).includes("kleinanzeigen")}
                              onChange={() => toggleChannel(candidate.articleId, "kleinanzeigen")}
                              disabled={creating}
                            />
                            Für Kleinanzeigen erstellen
                          </label>
                        )}
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
                        {creationProgress[candidate.articleId] && (
                          <p className="mt-2 text-xs font-medium text-blue-700">
                            {creationProgress[candidate.articleId]}
                          </p>
                        )}
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
