"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { BlogJob, ShopwareBlogOptions } from "@/types/blog";

type ScheduleRow = {
  prompt: string;
  date: string;
  categoryId: string;
};

type ManagerPayload = {
  jobs: BlogJob[];
  options: ShopwareBlogOptions;
  activeScheduled: number;
  scheduleCapacity: number;
  researchConfigured: boolean;
  cronConfigured: boolean;
  error?: string;
};

const statusLabels: Record<BlogJob["status"], string> = {
  queued: "Eingeplant",
  researching: "Recherche läuft",
  publishing: "Wird veröffentlicht",
  published: "Veröffentlicht",
  failed: "Fehlgeschlagen",
  cancelled: "Entfernt",
};

const statusStyles: Record<BlogJob["status"], string> = {
  queued: "bg-amber-100 text-amber-900",
  researching: "bg-blue-100 text-blue-800",
  publishing: "bg-violet-100 text-violet-800",
  published: "bg-green-100 text-green-800",
  failed: "bg-red-100 text-red-800",
  cancelled: "bg-slate-100 text-slate-600",
};

function emptyRows(categoryId = ""): ScheduleRow[] {
  return Array.from({ length: 10 }, () => ({
    prompt: "",
    date: "",
    categoryId,
  }));
}

function formatDate(value?: string) {
  if (!value) return "–";
  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

async function errorFrom(response: Response, fallback: string) {
  const payload = (await response.json().catch(() => ({}))) as { error?: string };
  return payload.error || fallback;
}

export default function BlogManager() {
  const [data, setData] = useState<ManagerPayload | null>(null);
  const [prompt, setPrompt] = useState("");
  const [authorId, setAuthorId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [rows, setRows] = useState<ScheduleRow[]>(() => emptyRows());
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const response = await fetch("/api/blog/jobs", { cache: "no-store" });
      const payload = (await response.json()) as ManagerPayload;
      if (!response.ok) throw new Error(payload.error || "Blog-Manager konnte nicht geladen werden.");
      setData(payload);
      setAuthorId((current) => current || payload.options.authors[0]?.id || "");
      const defaultCategory =
        payload.options.categories.find((option) => option.label === "Allgemeines")
          ?.id || payload.options.categories[0]?.id || "";
      setCategoryId((current) => current || defaultCategory);
      setRows((current) =>
        current.map((row) => ({
          ...row,
          categoryId: row.categoryId || defaultCategory,
        }))
      );
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unbekannter Fehler");
    } finally {
      if (!quiet) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timeout);
  }, [load]);

  const hasRunningJobs = useMemo(
    () =>
      data?.jobs.some((job) =>
        ["queued", "researching", "publishing"].includes(job.status)
      ) ?? false,
    [data]
  );

  useEffect(() => {
    if (!hasRunningJobs) return;
    const interval = window.setInterval(() => void load(true), 5_000);
    return () => window.clearInterval(interval);
  }, [hasRunningJobs, load]);

  const ready = Boolean(
    data?.researchConfigured &&
      data.cronConfigured &&
      data.options.authors.length &&
      data.options.categories.length
  );

  async function publishNow() {
    setError("");
    setNotice("");
    if (
      !window.confirm(
        "Der Hub recherchiert den Beitrag jetzt und veröffentlicht ihn nach bestandener Qualitätsprüfung direkt im Shopware-Blog. Fortfahren?"
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/blog/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "immediate",
          prompt,
          authorId,
          categoryId,
        }),
      });
      if (!response.ok) throw new Error(await errorFrom(response, "Der Beitrag konnte nicht gestartet werden."));
      setPrompt("");
      setNotice("Die Recherche läuft. Der Beitrag wird nur veröffentlicht, wenn alle Qualitätsregeln erfüllt sind.");
      await load(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unbekannter Fehler");
    } finally {
      setBusy(false);
    }
  }

  async function saveSchedule() {
    setError("");
    setNotice("");
    const usedRows = rows.filter((row) => row.prompt.trim() || row.date);
    const incomplete = usedRows.find(
      (row) => !row.prompt.trim() || !row.date || !row.categoryId
    );
    if (incomplete) {
      setError("Jede verwendete Zeile braucht Stichwörter, Datum/Uhrzeit und eine Rubrik.");
      return;
    }
    if (!usedRows.length) {
      setError("Bitte mindestens einen geplanten Blogpost eintragen.");
      return;
    }
    if ((data?.scheduleCapacity ?? 0) < usedRows.length) {
      setError(`Aktuell sind nur noch ${data?.scheduleCapacity ?? 0} Terminplätze frei.`);
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/blog/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "schedule",
          authorId,
          entries: usedRows.map((row) => ({
            prompt: row.prompt,
            categoryId: row.categoryId,
            scheduledFor: new Date(row.date).toISOString(),
          })),
        }),
      });
      if (!response.ok) throw new Error(await errorFrom(response, "Der Zeitplan konnte nicht gespeichert werden."));
      setRows(emptyRows(categoryId));
      setNotice(`${usedRows.length} Blogpost${usedRows.length === 1 ? "" : "s"} wurden verbindlich eingeplant.`);
      await load(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unbekannter Fehler");
    } finally {
      setBusy(false);
    }
  }

  async function jobAction(job: BlogJob, action: "retry" | "cancel") {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const endpoint =
        action === "retry"
          ? `/api/blog/jobs/${job.id}/retry`
          : `/api/blog/jobs/${job.id}`;
      const response = await fetch(endpoint, {
        method: action === "retry" ? "POST" : "DELETE",
      });
      if (!response.ok) throw new Error(await errorFrom(response, "Die Aktion ist fehlgeschlagen."));
      setNotice(action === "retry" ? "Der Beitrag wird erneut verarbeitet." : "Der Termin wurde entfernt.");
      await load(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unbekannter Fehler");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header>
        <div className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--ph-gold)]">
          Inhalte
        </div>
        <h1 className="mt-1 text-3xl text-[var(--ph-green-dark)]">Blog-Manager</h1>
        <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-600">
          Aus wenigen Stichwörtern entsteht ein belegter, SEO-tauglicher Ratgeberbeitrag.
          Der Hub prüft jede Passage und veröffentlicht nur bestandene Beiträge in der
          gewählten Shopware-Blog-Rubrik.
        </p>
      </header>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>
      ) : null}
      {notice ? (
        <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-800">{notice}</div>
      ) : null}

      {loading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-sm text-slate-600">
          Blog-Rubriken und Autoren werden aus Shopware geladen …
        </div>
      ) : null}

      {data && !ready ? (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-5 text-sm text-amber-950">
          <div className="font-bold">Einrichtung noch nicht vollständig</div>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {!data.researchConfigured ? <li>Der OpenAI-API-Schlüssel fehlt.</li> : null}
            {!data.cronConfigured ? <li>Der automatische Zeitplan ist noch nicht aktiviert.</li> : null}
            {!data.options.authors.length ? <li>In Shopware wurde kein Blog-Autor gefunden.</li> : null}
            {!data.options.categories.length ? <li>In Shopware wurde keine Blog-Rubrik gefunden.</li> : null}
          </ul>
        </div>
      ) : null}

      {data ? (
        <>
          <section className="rounded-2xl border border-slate-300 bg-white p-5 shadow-sm sm:p-6">
            <div className="grid gap-5 lg:grid-cols-[1fr_260px]">
              <div>
                <h2 className="text-xl text-[var(--ph-green-dark)]">Jetzt veröffentlichen</h2>
                <label className="mt-4 block text-sm font-bold text-slate-800" htmlFor="blog-prompt">
                  Redaktionelles Briefing an die KI
                </label>
                <textarea
                  id="blog-prompt"
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  rows={7}
                  maxLength={5_000}
                  placeholder="Thema, gewünschte Schwerpunkte, Best Practices, Ton und wichtige Hinweise – z. B. Olivenbaum ausgepflanzt überwintern, Pflanzenschutzsack, Heizung erst ab dauerhaft −10 °C, Gießen und Kontrollen erwähnen"
                  className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 text-sm leading-6 outline-none focus:border-[var(--ph-green)] focus:ring-2 focus:ring-green-100"
                />
                <div className="mt-1 flex items-start justify-between gap-4 text-xs text-slate-500">
                  <span>Die Angaben steuern den Artikel. SEO-Metadaten entstehen separat aus dem fertigen Text.</span>
                  <span className="shrink-0">{prompt.length}/5.000 Zeichen</span>
                </div>
              </div>
              <div className="space-y-4">
                <label className="block text-sm font-bold text-slate-800">
                  Autor
                  <select
                    value={authorId}
                    onChange={(event) => setAuthorId(event.target.value)}
                    className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-3 font-normal"
                  >
                    {data.options.authors.map((author) => (
                      <option key={author.id} value={author.id}>{author.label}</option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm font-bold text-slate-800">
                  Blog-Rubrik
                  <select
                    value={categoryId}
                    onChange={(event) => setCategoryId(event.target.value)}
                    className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-3 font-normal"
                  >
                    {data.options.categories.map((category) => (
                      <option key={category.id} value={category.id}>{category.label}</option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  disabled={!ready || busy || prompt.trim().length < 8}
                  onClick={() => void publishNow()}
                  className="w-full rounded-xl bg-[var(--ph-green)] px-4 py-3 text-sm font-bold text-white transition hover:bg-[var(--ph-green-dark)] disabled:cursor-not-allowed disabled:opacity-45"
                >
                  {busy ? "Bitte warten …" : "Recherchieren & direkt veröffentlichen"}
                </button>
                <p className="text-xs leading-5 text-slate-500">
                  Dieser Klick ist die ausdrückliche Freigabe zur Veröffentlichung. Bei einer
                  nicht bestandenen Quellen- oder Qualitätsprüfung bleibt der Shop unverändert.
                </p>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-300 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-xl text-[var(--ph-green-dark)]">Beiträge vorausplanen</h2>
                <p className="mt-1 text-sm text-slate-600">
                  Zum Termin beginnt die Recherche; nach bestandener Prüfung wird automatisch veröffentlicht.
                </p>
              </div>
              <span className="rounded-full bg-[var(--ph-gold-light)] px-3 py-1 text-xs font-bold text-amber-900">
                {data.scheduleCapacity} von 10 Plätzen frei
              </span>
            </div>
            <div className="mt-5 space-y-3">
              {rows.map((row, index) => (
                <div key={index} className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 lg:grid-cols-[36px_1fr_210px_220px] lg:items-center">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-sm font-bold text-[var(--ph-green-dark)] shadow-sm">
                    {index + 1}
                  </div>
                  <textarea
                    value={row.prompt}
                    onChange={(event) =>
                      setRows((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, prompt: event.target.value } : item))
                    }
                    rows={2}
                    maxLength={5_000}
                    placeholder="Redaktionelles Briefing: Thema, Best Practices und wichtige Hinweise"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm"
                  />
                  <input
                    type="datetime-local"
                    value={row.date}
                    onChange={(event) =>
                      setRows((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, date: event.target.value } : item))
                    }
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm"
                  />
                  <select
                    value={row.categoryId}
                    onChange={(event) =>
                      setRows((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, categoryId: event.target.value } : item))
                    }
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm"
                  >
                    {data.options.categories.map((category) => (
                      <option key={category.id} value={category.id}>{category.label}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
            <div className="mt-5 flex justify-end">
              <button
                type="button"
                disabled={!ready || busy || data.scheduleCapacity < 1}
                onClick={() => void saveSchedule()}
                className="rounded-xl border border-[var(--ph-green)] bg-white px-5 py-3 text-sm font-bold text-[var(--ph-green-dark)] hover:bg-green-50 disabled:cursor-not-allowed disabled:opacity-45"
              >
                Zeitplan verbindlich speichern
              </button>
            </div>
          </section>

          <section className="overflow-hidden rounded-2xl border border-slate-300 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <div>
                <h2 className="text-xl text-[var(--ph-green-dark)]">Veröffentlichungen & Termine</h2>
                <p className="mt-1 text-xs text-slate-500">Die letzten {Math.min(data.jobs.length, 200)} Aufträge</p>
              </div>
              <button type="button" onClick={() => void load()} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-bold hover:bg-slate-50">
                Aktualisieren
              </button>
            </div>
            {data.jobs.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-500">Noch keine Blogposts geplant oder erstellt.</div>
            ) : (
              <div className="divide-y divide-slate-200">
                {data.jobs.map((job) => (
                  <article key={job.id} className="grid gap-4 p-5 lg:grid-cols-[1fr_180px_170px]">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${statusStyles[job.status]}`}>{statusLabels[job.status]}</span>
                        <span className="text-xs text-slate-500">{job.mode === "scheduled" ? "Geplant" : "Sofortauftrag"}</span>
                      </div>
                      <h3 className="mt-2 text-base text-slate-900">{job.article?.title || job.prompt}</h3>
                      {job.article ? (
                        <p className="mt-1 text-xs text-slate-500">{job.article.wordCount} Wörter · {job.sources?.length ?? 0} Quellen</p>
                      ) : null}
                      {job.error ? <div className="mt-3 rounded-lg bg-red-50 p-3 text-xs leading-5 text-red-800">{job.error}</div> : null}
                      {job.sources?.length ? (
                        <details className="mt-3 text-xs text-slate-600">
                          <summary className="cursor-pointer font-bold text-[var(--ph-green-dark)]">Geprüfte Quellen anzeigen</summary>
                          <ul className="mt-2 space-y-1 pl-4">
                            {job.sources.map((source) => (
                              <li key={source.id} className="list-disc">
                                <a href={source.url} target="_blank" rel="noreferrer" className="text-[var(--ph-green)] underline">{source.title}</a>
                              </li>
                            ))}
                          </ul>
                        </details>
                      ) : null}
                    </div>
                    <div className="text-sm text-slate-600">
                      <div className="text-xs font-bold uppercase tracking-wide text-slate-400">Termin</div>
                      <div className="mt-1">{formatDate(job.scheduledFor)}</div>
                      {job.publishedAt ? <div className="mt-2 text-xs text-green-700">Veröffentlicht: {formatDate(job.publishedAt)}</div> : null}
                    </div>
                    <div className="flex flex-wrap content-start justify-start gap-2 lg:justify-end">
                      {job.shopwareUrl ? (
                        <a href={job.shopwareUrl} target="_blank" rel="noreferrer" className="rounded-lg bg-[var(--ph-green)] px-3 py-2 text-xs font-bold text-white">Im Shop öffnen</a>
                      ) : null}
                      {job.status === "failed" ? (
                        <button type="button" disabled={busy} onClick={() => void jobAction(job, "retry")} className="rounded-lg border border-[var(--ph-green)] px-3 py-2 text-xs font-bold text-[var(--ph-green-dark)]">Erneut versuchen</button>
                      ) : null}
                      {["queued", "failed"].includes(job.status) ? (
                        <button type="button" disabled={busy} onClick={() => void jobAction(job, "cancel")} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold text-slate-700">Entfernen</button>
                      ) : null}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}
