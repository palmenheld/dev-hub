"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { emptyJsonPost } from "@/lib/http";
import type {
  EbayConnection,
  EbayListingDraft,
  EbayPublishingSettings,
  EbaySetup,
} from "@/types/ebay";
import type { ProductCandidate } from "@/types/shopwarePublishing";

type EbayFilter = "all" | "with" | "without" | "live" | "draft" | "problem";
type ActiveFilter = "active" | "inactive" | "all";
type ReadinessFilter = "all" | "ready" | "incomplete";
type ImageFilter = "all" | "with" | "without";

function money(value: number | undefined, currency: string) {
  if (value === undefined) return "–";
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency,
  }).format(value);
}

function ebayStatus(draft?: EbayListingDraft) {
  if (!draft) return { label: "Noch kein eBay-Artikel", tone: "bg-slate-100 text-slate-700" };
  if (draft.status === "published") {
    return { label: "Aktiv bei eBay", tone: "bg-green-100 text-green-800" };
  }
  if (draft.status === "paused") {
    return { label: "Pausiert", tone: "bg-amber-100 text-amber-900" };
  }
  if (
    draft.status === "reconciliation_required" ||
    draft.status === "management_reconciliation_required"
  ) {
    return { label: "Status prüfen", tone: "bg-red-100 text-red-800" };
  }
  if (draft.status === "publishing") {
    return { label: "Übertragung läuft", tone: "bg-blue-100 text-blue-800" };
  }
  if (draft.status === "blocked") {
    return { label: "Entwurf unvollständig", tone: "bg-red-100 text-red-800" };
  }
  if (draft.approvedAt) {
    return { label: "Freigegeben", tone: "bg-blue-100 text-blue-800" };
  }
  return { label: "Entwurf vorhanden", tone: "bg-violet-100 text-violet-800" };
}

function matchesEbayFilter(draft: EbayListingDraft | undefined, filter: EbayFilter) {
  if (filter === "with") return Boolean(draft);
  if (filter === "without") return !draft;
  if (filter === "live") return draft?.status === "published";
  if (filter === "draft") {
    return Boolean(draft && ["ready", "blocked", "publishing"].includes(draft.status));
  }
  if (filter === "problem") {
    return Boolean(
      draft &&
        ["blocked", "reconciliation_required", "management_reconciliation_required"].includes(
          draft.status
        )
    );
  }
  return true;
}

export default function EbayArticleOverview({
  initialConnection,
  initialSettings,
}: {
  initialConnection: EbayConnection;
  initialSettings: EbayPublishingSettings;
}) {
  const [connection, setConnection] = useState(initialConnection);
  const [settings, setSettings] = useState(initialSettings);
  const [candidates, setCandidates] = useState<ProductCandidate[]>([]);
  const [drafts, setDrafts] = useState<EbayListingDraft[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>("active");
  const [ebayFilter, setEbayFilter] = useState<EbayFilter>("all");
  const [readinessFilter, setReadinessFilter] = useState<ReadinessFilter>("all");
  const [imageFilter, setImageFilter] = useState<ImageFilter>("all");
  const [busy, setBusy] = useState("");
  const [feedback, setFeedback] = useState<{ kind: "success" | "error"; message: string } | null>(
    null
  );

  const load = useCallback(
    async (targetPage: number, targetActive: ActiveFilter) => {
      setBusy("articles");
      setFeedback(null);
      try {
        const onlyActive = targetActive === "active" ? "&onlyActive=true" : "";
        const [candidateResponse, draftResponse] = await Promise.all([
          fetch(
            `/api/channels/ebay/candidates?limit=100&page=${targetPage}${onlyActive}`,
            { cache: "no-store" }
          ),
          fetch("/api/channels/ebay/drafts", { cache: "no-store" }),
        ]);
        const candidatePayload = (await candidateResponse.json()) as {
          candidates?: ProductCandidate[];
          hasMore?: boolean;
          error?: string;
        };
        const draftPayload = (await draftResponse.json()) as {
          drafts?: EbayListingDraft[];
          error?: string;
        };
        if (!candidateResponse.ok || !candidatePayload.candidates) {
          throw new Error(
            candidatePayload.error || "Weclapp-Artikel konnten nicht geladen werden."
          );
        }
        if (!draftResponse.ok || !draftPayload.drafts) {
          throw new Error(draftPayload.error || "eBay-Entwürfe konnten nicht geladen werden.");
        }
        setCandidates(candidatePayload.candidates);
        setDrafts(draftPayload.drafts);
        setPage(targetPage);
        setHasMore(Boolean(candidatePayload.hasMore));
      } catch (error) {
        setFeedback({
          kind: "error",
          message: error instanceof Error ? error.message : "Unbekannter Fehler",
        });
      } finally {
        setBusy("");
      }
    },
    []
  );

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void load(1, "active");
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [load]);

  const draftByArticle = useMemo(
    () => new Map(drafts.map((draft) => [draft.source.articleId, draft])),
    [drafts]
  );

  const visible = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("de");
    return candidates.filter((candidate) => {
      const draft = draftByArticle.get(candidate.articleId);
      const searchable = [
        candidate.articleNumber,
        candidate.germanName,
        candidate.latinName,
        candidate.heightLabel,
        candidate.potSize,
        draft?.title,
        draft?.listingId,
      ]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase("de");
      return (
        (!term || searchable.includes(term)) &&
        (activeFilter === "all" ||
          (activeFilter === "active" ? candidate.active !== false : candidate.active === false)) &&
        matchesEbayFilter(draft, ebayFilter) &&
        (readinessFilter === "all" ||
          (readinessFilter === "ready" ? candidate.eligible : !candidate.eligible)) &&
        (imageFilter === "all" ||
          (imageFilter === "with"
            ? candidate.imageUrls.length > 0
            : candidate.imageUrls.length === 0))
      );
    });
  }, [
    activeFilter,
    candidates,
    draftByArticle,
    ebayFilter,
    imageFilter,
    readinessFilter,
    search,
  ]);

  async function testConnection() {
    setBusy("connection");
    setFeedback(null);
    try {
      const response = await fetch("/api/channels/ebay/connection", emptyJsonPost());
      const payload = (await response.json()) as {
        setup?: EbaySetup;
        connection?: EbayConnection;
        error?: string;
      };
      if (!response.ok || !payload.setup) {
        if (payload.connection) setConnection(payload.connection);
        throw new Error(payload.error || "Verbindungstest fehlgeschlagen.");
      }
      setConnection(payload.setup.connection);
      setSettings(payload.setup.settings);
      setFeedback({ kind: "success", message: "Die eBay-Verbindung funktioniert." });
    } catch (error) {
      setFeedback({
        kind: "error",
        message: error instanceof Error ? error.message : "Unbekannter Fehler",
      });
    } finally {
      setBusy("");
    }
  }

  function changeActiveFilter(value: ActiveFilter) {
    setActiveFilter(value);
    void load(1, value);
  }

  return (
    <div className="mx-auto max-w-[1600px]">
      <header className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-[var(--ph-gold)]">
            Verkaufskanal
          </p>
          <h1 className="mt-1 text-3xl text-[var(--ph-green-dark)]">eBay-Artikel</h1>
          <p className="mt-2 max-w-4xl text-slate-500">
            Weclapp-Artikel filtern, den eBay-Status sofort erkennen und einzelne
            Anzeigen gezielt öffnen oder neu vorbereiten.
          </p>
        </div>
        <Link
          href="/channels/ebay/templates"
          className="rounded-xl border border-[var(--ph-green-dark)] bg-white px-4 py-2.5 text-center font-semibold text-[var(--ph-green-dark)]"
        >
          Templates verwalten
        </Link>
      </header>

      <section className="mt-6 rounded-2xl border bg-white p-4 shadow-sm">
        <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <strong>{connection.label}</strong>
              <span className="rounded-full border bg-slate-50 px-2.5 py-1 text-xs font-semibold">
                {connection.environment === "production" ? "Produktivsystem" : "Testumgebung"}
              </span>
            </div>
            <p className="mt-1 text-sm text-slate-500">{connection.description}</p>
          </div>
          <button
            type="button"
            onClick={testConnection}
            disabled={!connection.configured || Boolean(busy)}
            className="rounded-xl border border-[var(--ph-green-dark)] px-4 py-2.5 font-semibold text-[var(--ph-green-dark)] disabled:opacity-40"
          >
            {busy === "connection" ? "Verbindung wird geprüft…" : "Verbindung testen"}
          </button>
        </div>
      </section>

      {feedback && (
        <div
          className={`mt-4 rounded-xl border px-4 py-3 text-sm font-medium ${
            feedback.kind === "success"
              ? "border-green-200 bg-green-50 text-green-800"
              : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {feedback.message}
        </div>
      )}

      <section className="mt-5 overflow-hidden rounded-2xl border bg-white shadow-sm">
        <div className="border-b p-5">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <label className="text-xs font-semibold text-slate-600 xl:col-span-2">
              Artikel, SKU oder eBay-Titel suchen
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="z. B. 100000778, Olive oder Olea europaea"
                className="mt-1 block w-full rounded-xl border px-3 py-2.5 text-sm font-normal text-slate-900"
              />
            </label>
            <label className="text-xs font-semibold text-slate-600">
              Weclapp-Status
              <select
                value={activeFilter}
                onChange={(event) => changeActiveFilter(event.target.value as ActiveFilter)}
                className="mt-1 block w-full rounded-xl border bg-white px-3 py-2.5 text-sm font-normal text-slate-900"
              >
                <option value="active">Nur aktive Artikel</option>
                <option value="inactive">Nur inaktive Artikel</option>
                <option value="all">Aktive und inaktive</option>
              </select>
            </label>
            <label className="text-xs font-semibold text-slate-600">
              eBay-Status
              <select
                value={ebayFilter}
                onChange={(event) => setEbayFilter(event.target.value as EbayFilter)}
                className="mt-1 block w-full rounded-xl border bg-white px-3 py-2.5 text-sm font-normal text-slate-900"
              >
                <option value="all">Alle eBay-Status</option>
                <option value="with">Mit eBay-Artikel/Entwurf</option>
                <option value="without">Ohne eBay-Artikel</option>
                <option value="live">Aktiv bei eBay</option>
                <option value="draft">Entwürfe</option>
                <option value="problem">Mit Handlungsbedarf</option>
              </select>
            </label>
            <label className="text-xs font-semibold text-slate-600">
              Vollständigkeit
              <select
                value={readinessFilter}
                onChange={(event) =>
                  setReadinessFilter(event.target.value as ReadinessFilter)
                }
                className="mt-1 block w-full rounded-xl border bg-white px-3 py-2.5 text-sm font-normal text-slate-900"
              >
                <option value="all">Alle Artikel</option>
                <option value="ready">Grunddaten vollständig</option>
                <option value="incomplete">Grunddaten unvollständig</option>
              </select>
            </label>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <label className="text-xs font-semibold text-slate-600">
              Bilder&nbsp;
              <select
                value={imageFilter}
                onChange={(event) => setImageFilter(event.target.value as ImageFilter)}
                className="rounded-lg border bg-white px-2 py-1.5 font-normal text-slate-900"
              >
                <option value="all">Alle</option>
                <option value="with">Mit Bildern</option>
                <option value="without">Ohne Bilder</option>
              </select>
            </label>
            <div className="flex items-center gap-3 text-sm text-slate-500">
              <span>{visible.length} von {candidates.length} auf dieser Seite</span>
              <button
                type="button"
                onClick={() => load(page, activeFilter)}
                disabled={Boolean(busy)}
                className="rounded-lg border px-3 py-1.5 font-semibold text-slate-700 disabled:opacity-40"
              >
                {busy === "articles" ? "Lädt…" : "Neu laden"}
              </button>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Artikel</th>
                <th className="px-4 py-3">SKU / Namen</th>
                <th className="px-4 py-3">Größe / Topf</th>
                <th className="px-4 py-3">Preis / Bestand</th>
                <th className="px-4 py-3">Weclapp</th>
                <th className="px-4 py-3">eBay</th>
                <th className="px-4 py-3 text-right">Aktion</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {!visible.length ? (
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-center text-slate-500">
                    {busy === "articles"
                      ? "Artikel werden geladen…"
                      : "Für diese Filter wurden keine Artikel gefunden."}
                  </td>
                </tr>
              ) : (
                visible.map((candidate) => {
                  const draft = draftByArticle.get(candidate.articleId);
                  const state = ebayStatus(draft);
                  const href = `/channels/ebay?articleId=${encodeURIComponent(
                    candidate.articleId
                  )}`;
                  return (
                    <tr key={candidate.articleId} className="hover:bg-[var(--ph-green-light)]/40">
                      <td className="px-4 py-3">
                        <div className="h-14 w-14 overflow-hidden rounded-lg bg-slate-100">
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
                      <td className="min-w-64 px-4 py-3">
                        <Link href={href} className="font-bold text-[var(--ph-green-dark)] hover:underline">
                          {candidate.germanName || "Name fehlt"}
                        </Link>
                        <p className="mt-0.5 italic text-slate-500">
                          {candidate.latinName || "Lateinischer Name fehlt"}
                        </p>
                        <p className="mt-1 text-xs text-slate-400">{candidate.articleNumber}</p>
                      </td>
                      <td className="px-4 py-3">
                        <strong>{candidate.heightLabel || "Höhe fehlt"}</strong>
                        <p className="text-slate-500">{candidate.potSize || "Topfmaß fehlt"}</p>
                      </td>
                      <td className="px-4 py-3">
                        <strong>{money(candidate.price, settings.currency)}</strong>
                        <p className="text-slate-500">Bestand: {candidate.stock ?? "–"}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                            candidate.active !== false
                              ? "bg-green-100 text-green-800"
                              : "bg-slate-200 text-slate-700"
                          }`}
                        >
                          {candidate.active !== false ? "Aktiv" : "Inaktiv"}
                        </span>
                        {!candidate.eligible && (
                          <p className="mt-2 max-w-48 text-xs text-red-700">
                            Beim Erstellen ergänzbar: {candidate.missing.join(", ")}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${state.tone}`}>
                          {state.label}
                        </span>
                        {draft?.listingId && (
                          <p className="mt-2 text-xs text-slate-500">ID {draft.listingId}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          href={href}
                          className="inline-block rounded-xl bg-[var(--ph-green-dark)] px-3 py-2 text-xs font-semibold text-white"
                        >
                          {draft ? "Öffnen & bearbeiten" : "eBay-Entwurf erstellen"}
                        </Link>
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
            onClick={() => load(page - 1, activeFilter)}
            disabled={page <= 1 || Boolean(busy)}
            className="rounded-lg border px-3 py-2 text-sm disabled:opacity-40"
          >
            Zurück
          </button>
          <span className="text-sm">Seite {page}</span>
          <button
            type="button"
            onClick={() => load(page + 1, activeFilter)}
            disabled={!hasMore || Boolean(busy)}
            className="rounded-lg border px-3 py-2 text-sm disabled:opacity-40"
          >
            Weiter
          </button>
        </div>
      </section>
    </div>
  );
}
