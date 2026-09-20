"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { emptyJsonPost } from "@/lib/http";
import type { ShopwareConnection } from "@/types/shopware";
import type {
  ProductCandidate,
  ShopwareProductDraft,
} from "@/types/shopwarePublishing";

type ActiveFilter = "active" | "inactive" | "all";
type ShopwareFilter = "all" | "live" | "without" | "draft" | "problem";
type ReadinessFilter = "all" | "ready" | "incomplete";
type ImageFilter = "all" | "with" | "without";

function money(value?: number) {
  if (value === undefined) return "–";
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
  }).format(value);
}

function shopwareStatus(candidate: ProductCandidate, draft?: ShopwareProductDraft) {
  if (draft?.status === "published" || candidate.alreadyInShopware) {
    return { label: "In Shopware", tone: "bg-green-100 text-green-800" };
  }
  if (draft?.status === "reconciliation_required") {
    return { label: "Status prüfen", tone: "bg-red-100 text-red-800" };
  }
  if (draft?.status === "publishing") {
    return { label: "Übertragung läuft", tone: "bg-blue-100 text-blue-800" };
  }
  if (draft?.status === "blocked") {
    return { label: "Entwurf unvollständig", tone: "bg-red-100 text-red-800" };
  }
  if (draft?.approvedAt) {
    return { label: "Freigegeben", tone: "bg-blue-100 text-blue-800" };
  }
  if (draft) {
    return { label: "Entwurf vorhanden", tone: "bg-violet-100 text-violet-800" };
  }
  return { label: "Noch kein Shopware-Produkt", tone: "bg-slate-100 text-slate-700" };
}

function matchesShopwareFilter(
  candidate: ProductCandidate,
  draft: ShopwareProductDraft | undefined,
  filter: ShopwareFilter
) {
  const live = candidate.alreadyInShopware || draft?.status === "published";
  if (filter === "live") return live;
  if (filter === "without") return !live && !draft;
  if (filter === "draft") return Boolean(draft && draft.status !== "published");
  if (filter === "problem") {
    return Boolean(
      draft && ["blocked", "reconciliation_required"].includes(draft.status)
    );
  }
  return true;
}

export default function ShopwareArticleOverview({
  initialConnection,
}: {
  initialConnection: ShopwareConnection;
}) {
  const [connection, setConnection] = useState(initialConnection);
  const [candidates, setCandidates] = useState<ProductCandidate[]>([]);
  const [drafts, setDrafts] = useState<ShopwareProductDraft[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>("active");
  const [shopwareFilter, setShopwareFilter] = useState<ShopwareFilter>("all");
  const [readinessFilter, setReadinessFilter] = useState<ReadinessFilter>("all");
  const [imageFilter, setImageFilter] = useState<ImageFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [busy, setBusy] = useState("");
  const [feedback, setFeedback] = useState<{
    kind: "success" | "error";
    message: string;
  } | null>(null);

  const load = useCallback(async (targetPage: number) => {
    setBusy("articles");
    setFeedback(null);
    try {
      const [candidateResponse, draftResponse] = await Promise.all([
        fetch(`/api/channels/shopware/candidates?limit=100&page=${targetPage}`, {
          cache: "no-store",
        }),
        fetch("/api/channels/shopware/drafts", { cache: "no-store" }),
      ]);
      const candidatePayload = (await candidateResponse.json()) as {
        candidates?: ProductCandidate[];
        hasMore?: boolean;
        error?: string;
      };
      const draftPayload = (await draftResponse.json()) as {
        drafts?: ShopwareProductDraft[];
        error?: string;
      };
      if (!candidateResponse.ok || !candidatePayload.candidates) {
        throw new Error(
          candidatePayload.error || "Weclapp-Artikel konnten nicht geladen werden."
        );
      }
      if (!draftResponse.ok || !draftPayload.drafts) {
        throw new Error(
          draftPayload.error || "Shopware-Entwürfe konnten nicht geladen werden."
        );
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
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => void load(1), 0);
    return () => window.clearTimeout(timeout);
  }, [load]);

  const draftByArticle = useMemo(
    () => new Map(drafts.map((draft) => [draft.source.articleId, draft])),
    [drafts]
  );
  const categories = useMemo(
    () =>
      [...new Set(candidates.map((item) => item.articleCategoryName).filter(Boolean))]
        .map(String)
        .sort((left, right) => left.localeCompare(right, "de")),
    [candidates]
  );
  const visible = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("de-DE");
    return candidates.filter((candidate) => {
      const draft = draftByArticle.get(candidate.articleId);
      const searchable = [
        candidate.articleNumber,
        candidate.germanName,
        candidate.latinName,
        candidate.heightLabel,
        candidate.potSize,
        candidate.articleCategoryName,
        draft?.title,
        draft?.shopwareProductId,
      ]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase("de-DE");
      return (
        (!term || searchable.includes(term)) &&
        (activeFilter === "all" ||
          (activeFilter === "active"
            ? candidate.active !== false
            : candidate.active === false)) &&
        (categoryFilter === "all" ||
          (categoryFilter === "__none__"
            ? !candidate.articleCategoryName
            : candidate.articleCategoryName === categoryFilter)) &&
        matchesShopwareFilter(candidate, draft, shopwareFilter) &&
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
    categoryFilter,
    draftByArticle,
    imageFilter,
    readinessFilter,
    search,
    shopwareFilter,
  ]);

  async function testConnection() {
    setBusy("connection");
    setFeedback(null);
    try {
      const response = await fetch(
        "/api/channels/shopware/connection",
        emptyJsonPost()
      );
      const payload = (await response.json()) as {
        connection?: ShopwareConnection;
        error?: string;
      };
      if (!response.ok || !payload.connection) {
        throw new Error(payload.error || "Verbindungstest fehlgeschlagen.");
      }
      setConnection(payload.connection);
      setFeedback({ kind: "success", message: "Die Shopware-Verbindung funktioniert." });
    } catch (error) {
      setFeedback({
        kind: "error",
        message: error instanceof Error ? error.message : "Unbekannter Fehler",
      });
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="mx-auto max-w-[1700px]">
      <header className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-[var(--ph-gold)]">
            Verkaufskanal
          </p>
          <h1 className="mt-1 text-3xl text-[var(--ph-green-dark)]">
            Shopware-Artikel
          </h1>
          <p className="mt-2 max-w-4xl text-slate-500">
            Weclapp-Artikel filtern, vorhandene Shopware-Produkte erkennen und
            neue Produktentwürfe einzeln prüfen, bearbeiten und freigeben.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/channels/shopware/templates" className="rounded-xl border border-[var(--ph-green-dark)] bg-white px-4 py-2.5 text-center font-semibold text-[var(--ph-green-dark)]">Templates verwalten</Link>
          <Link href="/connection-settings?tab=shopware" className="rounded-xl border border-[var(--ph-green-dark)] bg-white px-4 py-2.5 text-center font-semibold text-[var(--ph-green-dark)]">Shopware-Einstellungen</Link>
        </div>
      </header>

      <section className="mt-6 rounded-2xl border bg-white p-4 shadow-sm">
        <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
          <div>
            <strong>{connection.label}</strong>
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
        <div className={`mt-4 rounded-xl border px-4 py-3 text-sm font-medium ${
          feedback.kind === "success"
            ? "border-green-200 bg-green-50 text-green-800"
            : "border-red-200 bg-red-50 text-red-700"
        }`}>
          {feedback.message}
        </div>
      )}

      <section className="mt-5 overflow-hidden rounded-2xl border bg-white shadow-sm">
        <div className="border-b p-5">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
            <label className="text-xs font-semibold text-slate-600 xl:col-span-2">
              Artikel, SKU oder Shopware-Titel suchen
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="z. B. 100000778, Olive oder Olea europaea"
                className="mt-1 block w-full rounded-xl border px-3 py-2.5 text-sm font-normal text-slate-900"
              />
            </label>
            <label className="text-xs font-semibold text-slate-600">
              Weclapp-Status
              <select value={activeFilter} onChange={(event) => setActiveFilter(event.target.value as ActiveFilter)} className="mt-1 block w-full rounded-xl border bg-white px-3 py-2.5 text-sm font-normal">
                <option value="active">Nur aktive Artikel</option>
                <option value="inactive">Nur inaktive Artikel</option>
                <option value="all">Aktive und inaktive</option>
              </select>
            </label>
            <label className="text-xs font-semibold text-slate-600">
              Shopware-Status
              <select value={shopwareFilter} onChange={(event) => setShopwareFilter(event.target.value as ShopwareFilter)} className="mt-1 block w-full rounded-xl border bg-white px-3 py-2.5 text-sm font-normal">
                <option value="all">Alle Shopware-Status</option>
                <option value="live">In Shopware vorhanden</option>
                <option value="without">Noch ohne Produkt</option>
                <option value="draft">Entwürfe</option>
                <option value="problem">Mit Handlungsbedarf</option>
              </select>
            </label>
            <label className="text-xs font-semibold text-slate-600">
              Vollständigkeit
              <select value={readinessFilter} onChange={(event) => setReadinessFilter(event.target.value as ReadinessFilter)} className="mt-1 block w-full rounded-xl border bg-white px-3 py-2.5 text-sm font-normal">
                <option value="all">Alle Artikel</option>
                <option value="ready">Grunddaten vollständig</option>
                <option value="incomplete">Grunddaten unvollständig</option>
              </select>
            </label>
            <label className="text-xs font-semibold text-slate-600">
              Weclapp-Kategorie
              <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} className="mt-1 block w-full rounded-xl border bg-white px-3 py-2.5 text-sm font-normal">
                <option value="all">Alle Kategorien</option>
                <option value="__none__">Ohne Kategorie</option>
                {categories.map((category) => <option key={category} value={category}>{category}</option>)}
              </select>
            </label>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <label className="text-xs font-semibold text-slate-600">
              Bilder&nbsp;
              <select value={imageFilter} onChange={(event) => setImageFilter(event.target.value as ImageFilter)} className="rounded-lg border bg-white px-2 py-1.5 font-normal">
                <option value="all">Alle</option>
                <option value="with">Mit Bildern</option>
                <option value="without">Ohne Bilder</option>
              </select>
            </label>
            <div className="flex items-center gap-3 text-sm text-slate-500">
              <span>{visible.length} von {candidates.length} auf dieser Seite</span>
              <button type="button" onClick={() => load(page)} disabled={Boolean(busy)} className="rounded-lg border px-3 py-1.5 font-semibold disabled:opacity-40">
                {busy === "articles" ? "Lädt…" : "Neu laden"}
              </button>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-[1250px] divide-y text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Artikel</th><th className="px-4 py-3">SKU / Namen</th><th className="px-4 py-3">Größe / Topf</th><th className="px-4 py-3">Preis / Bestand</th><th className="px-4 py-3">Weclapp</th><th className="px-4 py-3">Shopware</th><th className="px-4 py-3 text-right">Aktion</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {!visible.length ? (
                <tr><td colSpan={7} className="px-5 py-12 text-center text-slate-500">{busy === "articles" ? "Artikel werden geladen…" : "Für diese Filter wurden keine Artikel gefunden."}</td></tr>
              ) : visible.map((candidate) => {
                const draft = draftByArticle.get(candidate.articleId);
                const status = shopwareStatus(candidate, draft);
                const href = `/channels/shopware?articleId=${encodeURIComponent(candidate.articleId)}${draft ? "" : "&create=1"}`;
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
                    <td className="min-w-64 px-4 py-3"><Link href={href} className="font-bold text-[var(--ph-green-dark)] hover:underline">{candidate.germanName || "Name fehlt"}</Link><p className="italic text-slate-500">{candidate.latinName || "Lateinischer Name fehlt"}</p><p className="mt-1 text-xs text-slate-400">{candidate.articleNumber}</p></td>
                    <td className="px-4 py-3"><strong>{candidate.heightLabel || "Höhe fehlt"}</strong><p className="text-slate-500">{candidate.potSize || "Topfmaß fehlt"}</p></td>
                    <td className="px-4 py-3"><strong>{money(candidate.price)}</strong><p className="text-slate-500">Bestand: {candidate.stock ?? "–"}</p></td>
                    <td className="px-4 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${candidate.active !== false ? "bg-green-100 text-green-800" : "bg-slate-200 text-slate-700"}`}>{candidate.active !== false ? "Aktiv" : "Inaktiv"}</span>{!candidate.eligible && <p className="mt-2 max-w-48 text-xs text-red-700">Beim Erstellen ergänzen: {candidate.missing.join(", ")}</p>}</td>
                    <td className="px-4 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${status.tone}`}>{status.label}</span>{draft?.shopwareProductId && <p className="mt-2 text-xs text-slate-500">ID {draft.shopwareProductId}</p>}</td>
                    <td className="px-4 py-3 text-right"><Link href={href} className="inline-block rounded-xl bg-[var(--ph-green-dark)] px-3 py-2 text-xs font-semibold text-white">{draft ? "Öffnen & bearbeiten" : candidate.alreadyInShopware ? "Produkt ansehen" : "Shopware-Entwurf erstellen"}</Link></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-end gap-2 border-t p-4">
          <button type="button" onClick={() => load(page - 1)} disabled={page <= 1 || Boolean(busy)} className="rounded-lg border px-3 py-2 text-sm disabled:opacity-40">Zurück</button>
          <span className="text-sm">Seite {page}</span>
          <button type="button" onClick={() => load(page + 1)} disabled={!hasMore || Boolean(busy)} className="rounded-lg border px-3 py-2 text-sm disabled:opacity-40">Weiter</button>
        </div>
      </section>
    </div>
  );
}
