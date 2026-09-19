"use client";

import { FormEvent, useMemo, useState } from "react";
import { emptyJsonPost } from "@/lib/http";
import {
  KleinanzeigenConnection,
  KleinanzeigenListing,
  KleinanzeigenListingStatus,
} from "@/types/kleinanzeigen";

type ArticleOption = {
  id: string;
  sku: string;
  name: string;
  description: string;
  price: number;
};

type Feedback = {
  kind: "success" | "error";
  message: string;
};

type ListingForm = {
  articleId: string;
  sku: string;
  title: string;
  description: string;
  price: string;
  category: string;
  location: string;
};

const emptyForm: ListingForm = {
  articleId: "",
  sku: "",
  title: "",
  description: "",
  price: "",
  category: "Haus & Garten > Pflanzen",
  location: "Nordkirchen",
};

const statusConfig: Record<
  KleinanzeigenListingStatus,
  { label: string; classes: string }
> = {
  draft: {
    label: "Entwurf",
    classes: "bg-slate-100 text-slate-700",
  },
  active: {
    label: "Aktiv",
    classes: "bg-green-100 text-green-800",
  },
  paused: {
    label: "Pausiert",
    classes: "bg-amber-100 text-amber-800",
  },
  error: {
    label: "Fehler",
    classes: "bg-red-100 text-red-700",
  },
};

const currencyFormatter = new Intl.NumberFormat("de-DE", {
  style: "currency",
  currency: "EUR",
});

function parsePrice(value: string) {
  const number = Number(value.trim().replace(/\./g, "").replace(",", "."));
  return Number.isFinite(number) ? number : null;
}

function StatusBadge({ status }: { status: KleinanzeigenListingStatus }) {
  const config = statusConfig[status];

  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${config.classes}`}>
      {config.label}
    </span>
  );
}

export default function KleinanzeigenModule({
  initialListings,
  connection,
  articleOptions,
  initialArticleId = "",
}: {
  initialListings: KleinanzeigenListing[];
  connection: KleinanzeigenConnection;
  articleOptions: ArticleOption[];
  initialArticleId?: string;
}) {
  const initialArticle = articleOptions.find(
    (option) => option.id === initialArticleId
  );
  const initialListing = initialListings.find(
    (listing) =>
      listing.articleId === initialArticleId ||
      (initialArticle && listing.sku === initialArticle.sku)
  );
  const initialForm: ListingForm = initialArticle
    ? {
        ...emptyForm,
        articleId: initialArticle.id,
        sku: initialArticle.sku,
        title: initialArticle.name,
        description: initialArticle.description,
        price: initialArticle.price.toLocaleString("de-DE", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }),
      }
    : emptyForm;
  const [listings, setListings] = useState(initialListings);
  const [query, setQuery] = useState(initialListing?.sku || "");
  const [statusFilter, setStatusFilter] = useState<
    KleinanzeigenListingStatus | "all"
  >("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [formOpen, setFormOpen] = useState(
    Boolean(initialArticleId && !initialListing)
  );
  const [form, setForm] = useState<ListingForm>(initialForm);
  const [savingDraft, setSavingDraft] = useState(false);
  const [busyIds, setBusyIds] = useState<Set<string>>(() => new Set());
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  const filteredListings = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return listings.filter((listing) => {
      if (statusFilter !== "all" && listing.status !== statusFilter) {
        return false;
      }

      if (!normalizedQuery) {
        return true;
      }

      return [listing.title, listing.sku, listing.category, listing.location]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery);
    });
  }, [listings, query, statusFilter]);

  const counts = useMemo(
    () => ({
      active: listings.filter((listing) => listing.status === "active").length,
      paused: listings.filter((listing) => listing.status === "paused").length,
      draft: listings.filter((listing) => listing.status === "draft").length,
      error: listings.filter((listing) => listing.status === "error").length,
    }),
    [listings]
  );

  const selectedActiveListings = listings.filter(
    (listing) => selectedIds.has(listing.id) && listing.status === "active"
  );
  const allVisibleSelected =
    filteredListings.length > 0 &&
    filteredListings.every((listing) => selectedIds.has(listing.id));

  function updateForm(field: keyof ListingForm, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function selectArticle(articleId: string) {
    const article = articleOptions.find((option) => option.id === articleId);

    if (!article) {
      setForm((current) => ({ ...current, articleId }));
      return;
    }

    setForm((current) => ({
      ...current,
      articleId: article.id,
      sku: article.sku,
      title: article.name,
      description: article.description,
      price: article.price.toLocaleString("de-DE", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
    }));
  }

  function toggleListing(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current);

      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }

      return next;
    });
  }

  function toggleVisible() {
    setSelectedIds((current) => {
      const next = new Set(current);

      filteredListings.forEach((listing) => {
        if (allVisibleSelected) {
          next.delete(listing.id);
        } else {
          next.add(listing.id);
        }
      });

      return next;
    });
  }

  function replaceListing(updated: KleinanzeigenListing) {
    setListings((current) =>
      current.map((listing) => (listing.id === updated.id ? updated : listing))
    );
  }

  async function submitDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const price = parsePrice(form.price);

    if (price === null || price < 0) {
      setFeedback({ kind: "error", message: "Bitte einen gültigen Preis eingeben." });
      return;
    }

    setSavingDraft(true);
    setFeedback(null);

    try {
      const response = await fetch("/api/channels/kleinanzeigen/listings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, price }),
      });
      const payload = (await response.json()) as {
        listing?: KleinanzeigenListing;
        error?: string;
      };

      if (!response.ok || !payload.listing) {
        throw new Error(payload.error ?? "Entwurf konnte nicht gespeichert werden.");
      }

      setListings((current) => [payload.listing!, ...current]);
      setForm(emptyForm);
      setFormOpen(false);
      setFeedback({
        kind: "success",
        message: "Der Anzeigenentwurf wurde gespeichert und kann geprüft werden.",
      });
    } catch (error) {
      setFeedback({
        kind: "error",
        message: error instanceof Error ? error.message : "Unbekannter Fehler.",
      });
    } finally {
      setSavingDraft(false);
    }
  }

  async function changeStatus(id: string, action: "publish" | "pause") {
    setBusyIds((current) => new Set(current).add(id));
    setFeedback(null);

    try {
      const response = await fetch(
        `/api/channels/kleinanzeigen/listings/${id}/${action}`,
        emptyJsonPost()
      );
      const payload = (await response.json()) as {
        listing?: KleinanzeigenListing;
        error?: string;
      };

      if (!response.ok || !payload.listing) {
        throw new Error(payload.error ?? "Aktion fehlgeschlagen.");
      }

      replaceListing(payload.listing);
      setFeedback({
        kind: "success",
        message:
          action === "publish"
            ? "Anzeige wurde im Testmodus aktiviert."
            : "Anzeige wurde pausiert.",
      });

      return true;
    } catch (error) {
      setFeedback({
        kind: "error",
        message: error instanceof Error ? error.message : "Unbekannter Fehler.",
      });

      return false;
    } finally {
      setBusyIds((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
    }
  }

  async function pauseSelected() {
    if (selectedActiveListings.length === 0) return;

    const failedIds: string[] = [];

    for (const listing of selectedActiveListings) {
      const success = await changeStatus(listing.id, "pause");

      if (!success) {
        failedIds.push(listing.id);
      }
    }

    setSelectedIds(new Set(failedIds));
    setFeedback({
      kind: failedIds.length === 0 ? "success" : "error",
      message:
        failedIds.length === 0
          ? `${selectedActiveListings.length} Anzeigen wurden pausiert.`
          : `${failedIds.length} Anzeigen konnten nicht pausiert werden und bleiben ausgewählt.`,
    });
  }

  const connectionClasses =
    connection.state === "test"
      ? "border-blue-200 bg-blue-50"
      : connection.state === "adapter_required"
        ? "border-amber-200 bg-amber-50"
        : "border-slate-200 bg-white";

  return (
    <div className="mx-auto max-w-[1600px]">
      <header className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-[var(--ph-gold)]">
            Vertriebskanal
          </p>
          <h1 className="mt-1 text-3xl text-[var(--ph-green-dark)]">
            Kleinanzeigen
          </h1>
          <p className="mt-2 max-w-2xl text-slate-500">
            Anzeigen aus Palmenheld-Artikeln vorbereiten, veröffentlichen, verwalten und pausieren.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setFormOpen(true);
            setFeedback(null);
          }}
          className="rounded-xl bg-[var(--ph-green-dark)] px-5 py-3 font-semibold text-white hover:bg-[var(--ph-green)]"
        >
          + Anzeige vorbereiten
        </button>
      </header>

      <section className={`mt-6 rounded-2xl border p-5 ${connectionClasses}`}>
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`h-2.5 w-2.5 rounded-full ${
                  connection.state === "test" ? "bg-blue-500" : "bg-amber-500"
                }`}
              />
              <h2 className="text-lg font-bold">{connection.label}</h2>
            </div>
            <p className="mt-1 text-sm text-slate-600">{connection.description}</p>
          </div>

          <div className="flex flex-wrap gap-2">
            <span className="rounded-full border bg-white px-3 py-1.5 text-xs font-semibold text-slate-600">
              Modus: {connection.mode}
            </span>
            <a
              href="https://themen.kleinanzeigen.de/pro-infopoint/"
              target="_blank"
              rel="noreferrer"
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-[var(--ph-green-dark)] hover:bg-slate-50"
            >
              PRO-Zugang prüfen ↗
            </a>
          </div>
        </div>
      </section>

      <section className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {(
          [
            ["Aktiv", counts.active, "text-green-700"],
            ["Pausiert", counts.paused, "text-amber-700"],
            ["Entwürfe", counts.draft, "text-slate-700"],
            ["Fehler", counts.error, "text-red-700"],
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

      {formOpen && (
        <section className="mt-5 rounded-2xl border border-[var(--ph-green-dark)] bg-white p-5 shadow-lg">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-xl text-[var(--ph-green-dark)]">Neue Anzeige</h2>
              <p className="mt-1 text-sm text-slate-500">
                Zuerst als Entwurf speichern. Die Veröffentlichung erfolgt bewusst separat.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setFormOpen(false)}
              aria-label="Formular schließen"
              className="text-2xl text-slate-400 hover:text-slate-700"
            >
              ×
            </button>
          </div>

          <form onSubmit={submitDraft} className="mt-5 grid gap-4 lg:grid-cols-2">
            <label className="lg:col-span-2">
              <span className="mb-1.5 block text-sm font-semibold">Palmenheld-Artikel</span>
              <select
                value={form.articleId}
                onChange={(event) => selectArticle(event.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3"
              >
                <option value="">Artikel auswählen oder Angaben manuell erfassen</option>
                {articleOptions.map((article) => (
                  <option key={article.id} value={article.id}>
                    {article.sku} · {article.name}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span className="mb-1.5 block text-sm font-semibold">Artikelnummer</span>
              <input
                required
                value={form.sku}
                onChange={(event) => updateForm("sku", event.target.value)}
                className="w-full rounded-xl border border-slate-300 px-4 py-3"
              />
            </label>

            <label>
              <span className="mb-1.5 block text-sm font-semibold">Preis</span>
              <div className="relative">
                <input
                  required
                  inputMode="decimal"
                  value={form.price}
                  onChange={(event) => updateForm("price", event.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 pr-10"
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500">€</span>
              </div>
            </label>

            <label className="lg:col-span-2">
              <span className="mb-1.5 block text-sm font-semibold">Anzeigentitel</span>
              <input
                required
                maxLength={80}
                value={form.title}
                onChange={(event) => updateForm("title", event.target.value)}
                className="w-full rounded-xl border border-slate-300 px-4 py-3"
              />
              <span className="mt-1 block text-right text-xs text-slate-400">
                {form.title.length}/80
              </span>
            </label>

            <label>
              <span className="mb-1.5 block text-sm font-semibold">Kategorie</span>
              <input
                required
                value={form.category}
                onChange={(event) => updateForm("category", event.target.value)}
                className="w-full rounded-xl border border-slate-300 px-4 py-3"
              />
            </label>

            <label>
              <span className="mb-1.5 block text-sm font-semibold">Standort</span>
              <input
                required
                value={form.location}
                onChange={(event) => updateForm("location", event.target.value)}
                className="w-full rounded-xl border border-slate-300 px-4 py-3"
              />
            </label>

            <label className="lg:col-span-2">
              <span className="mb-1.5 block text-sm font-semibold">Beschreibung</span>
              <textarea
                required
                rows={7}
                value={form.description}
                onChange={(event) => updateForm("description", event.target.value)}
                className="w-full rounded-xl border border-slate-300 px-4 py-3"
              />
            </label>

            <div className="flex flex-wrap justify-end gap-2 lg:col-span-2">
              <button
                type="button"
                onClick={() => setFormOpen(false)}
                className="rounded-xl border border-slate-300 px-5 py-3 font-semibold hover:bg-slate-50"
              >
                Abbrechen
              </button>
              <button
                type="submit"
                disabled={savingDraft}
                className="rounded-xl bg-[var(--ph-green-dark)] px-5 py-3 font-semibold text-white disabled:opacity-50"
              >
                {savingDraft ? "Speichert…" : "Entwurf speichern"}
              </button>
            </div>
          </form>
        </section>
      )}

      <section className="mt-5 rounded-2xl border bg-white shadow-sm">
        <div className="grid gap-3 border-b p-4 md:grid-cols-[1fr_220px_auto]">
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Anzeigen suchen…"
            className="rounded-xl border border-slate-300 px-4 py-3"
          />
          <select
            value={statusFilter}
            onChange={(event) =>
              setStatusFilter(
                event.target.value as KleinanzeigenListingStatus | "all"
              )
            }
            className="rounded-xl border border-slate-300 bg-white px-4 py-3"
          >
            <option value="all">Alle Status</option>
            <option value="draft">Entwürfe</option>
            <option value="active">Aktiv</option>
            <option value="paused">Pausiert</option>
            <option value="error">Fehler</option>
          </select>
          <button
            type="button"
            disabled={selectedActiveListings.length === 0 || !connection.canPublish}
            onClick={pauseSelected}
            className="rounded-xl border border-amber-300 px-4 py-3 text-sm font-semibold text-amber-800 hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {selectedActiveListings.length} ausgewählte pausieren
          </button>
        </div>

        <div className="hidden grid-cols-[48px_minmax(280px,1.4fr)_140px_120px_150px_160px] gap-4 border-b bg-slate-50 px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-500 lg:grid">
          <div className="text-center">
            <input
              type="checkbox"
              checked={allVisibleSelected}
              onChange={toggleVisible}
              aria-label="Alle sichtbaren Anzeigen auswählen"
              className="accent-[var(--ph-green-dark)]"
            />
          </div>
          <div>Anzeige</div>
          <div>Status</div>
          <div className="text-right">Preis</div>
          <div>Standort</div>
          <div>Aktionen</div>
        </div>

        <div className="divide-y">
          {filteredListings.length === 0 ? (
            <div className="p-12 text-center">
              <div className="text-lg font-bold text-slate-700">
                {listings.length === 0 ? "Noch keine Anzeigen" : "Keine Treffer"}
              </div>
              <p className="mt-2 text-sm text-slate-500">
                {listings.length === 0
                  ? "Bereite die erste Anzeige aus einem Palmenheld-Artikel vor."
                  : "Passe Suche oder Statusfilter an."}
              </p>
            </div>
          ) : (
            filteredListings.map((listing) => {
              const busy = busyIds.has(listing.id);

              return (
                <article
                  key={listing.id}
                  className={`grid gap-3 px-4 py-4 lg:grid-cols-[48px_minmax(280px,1.4fr)_140px_120px_150px_160px] lg:items-center ${
                    selectedIds.has(listing.id) ? "bg-green-50/70" : ""
                  }`}
                >
                  <div className="flex justify-between lg:justify-center">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(listing.id)}
                      onChange={() => toggleListing(listing.id)}
                      aria-label={`${listing.title} auswählen`}
                      className="h-5 w-5 accent-[var(--ph-green-dark)] lg:h-4 lg:w-4"
                    />
                    <span className="lg:hidden"><StatusBadge status={listing.status} /></span>
                  </div>

                  <div className="min-w-0">
                    <h3 className="truncate font-bold text-slate-900">{listing.title}</h3>
                    <p className="mt-0.5 font-mono text-xs text-slate-400">{listing.sku}</p>
                    <p className="mt-1 truncate text-sm text-slate-500">{listing.category}</p>
                  </div>

                  <div className="hidden lg:block"><StatusBadge status={listing.status} /></div>

                  <div className="flex justify-between font-bold text-[var(--ph-green-dark)] lg:block lg:text-right">
                    <span className="font-medium text-slate-500 lg:hidden">Preis</span>
                    {currencyFormatter.format(listing.price)}
                  </div>

                  <div className="flex justify-between text-sm text-slate-600 lg:block">
                    <span className="font-medium lg:hidden">Standort</span>
                    {listing.location}
                  </div>

                  <div className="flex flex-wrap gap-2 lg:justify-end">
                    {listing.status === "draft" && (
                      <button
                        type="button"
                        disabled={!connection.canPublish || busy}
                        onClick={() => changeStatus(listing.id, "publish")}
                        title={
                          connection.canPublish
                            ? "Anzeige veröffentlichen"
                            : "Partnerzugang erforderlich"
                        }
                        className="rounded-lg bg-[var(--ph-green-dark)] px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {busy ? "…" : "Hochladen"}
                      </button>
                    )}
                    {listing.status === "active" && (
                      <button
                        type="button"
                        disabled={!connection.canPublish || busy}
                        onClick={() => changeStatus(listing.id, "pause")}
                        className="rounded-lg border border-amber-300 px-3 py-2 text-xs font-semibold text-amber-800 disabled:opacity-40"
                      >
                        {busy ? "…" : "Pausieren"}
                      </button>
                    )}
                    {listing.externalUrl && (
                      <a
                        href={listing.externalUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-lg border px-3 py-2 text-xs font-semibold"
                      >
                        Öffnen ↗
                      </a>
                    )}
                  </div>
                </article>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
}
