"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { EbayListingTemplate } from "@/types/ebay";

export default function EbayTemplateList() {
  const [templates, setTemplates] = useState<EbayListingTemplate[]>([]);
  const [busy, setBusy] = useState("load");
  const [error, setError] = useState("");

  async function loadTemplates() {
    setBusy("load");
    setError("");
    try {
      const response = await fetch("/api/channels/ebay/templates", {
        cache: "no-store",
      });
      const payload = (await response.json()) as {
        templates?: EbayListingTemplate[];
        error?: string;
      };
      if (!response.ok || !payload.templates) {
        throw new Error(payload.error || "Templates konnten nicht geladen werden.");
      }
      setTemplates(payload.templates);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unbekannter Fehler");
    } finally {
      setBusy("");
    }
  }

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadTemplates();
    }, 0);
    return () => window.clearTimeout(timeout);
  }, []);

  async function remove(template: EbayListingTemplate) {
    if (!window.confirm(`Template „${template.name}“ wirklich löschen?`)) return;
    setBusy(template.id);
    setError("");
    try {
      const response = await fetch(
        `/api/channels/ebay/templates/${encodeURIComponent(template.id)}`,
        { method: "DELETE" }
      );
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error || "Template konnte nicht gelöscht werden.");
      }
      setTemplates((current) => current.filter((item) => item.id !== template.id));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unbekannter Fehler");
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="mx-auto max-w-[1400px]">
      <header className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-[var(--ph-gold)]">
            Verkaufskanal · eBay
          </p>
          <h1 className="mt-1 text-3xl text-[var(--ph-green-dark)]">Templates</h1>
          <p className="mt-2 max-w-3xl text-slate-500">
            Gespeicherte Vorgaben für Kategorie, Merkmale, Zustand, Titel,
            Angebotsoptionen, Preis und Bestand.
          </p>
        </div>
        <Link
          href="/channels/ebay"
          className="rounded-xl border border-[var(--ph-green-dark)] bg-white px-4 py-2.5 text-center font-semibold text-[var(--ph-green-dark)]"
        >
          Zur Artikelübersicht
        </Link>
      </header>

      {error && (
        <div className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          {error}
        </div>
      )}

      <section className="mt-6 rounded-2xl border bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl text-[var(--ph-green-dark)]">
              Gespeicherte eBay-Templates
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Ein neues Template speicherst du direkt in der Bearbeitung eines eBay-Artikels.
            </p>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold">
            {templates.length} gespeichert
          </span>
        </div>

        {busy === "load" ? (
          <p className="mt-5 rounded-xl bg-slate-50 p-8 text-center text-sm text-slate-500">
            Templates werden geladen…
          </p>
        ) : templates.length ? (
          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            {templates.map((template) => (
              <article key={template.id} className="rounded-2xl border p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-lg font-bold">{template.name}</h3>
                      {template.isDefault && (
                        <span className="rounded-full bg-green-100 px-2.5 py-1 text-xs font-semibold text-green-800">
                          Standard
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-slate-600">
                      {template.categoryName || "Kategorie ohne Namen"} ({template.categoryId})
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => remove(template)}
                    disabled={Boolean(busy)}
                    className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-700 disabled:opacity-40"
                  >
                    {busy === template.id ? "Löscht…" : "Löschen"}
                  </button>
                </div>
                <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Titelmuster
                    </dt>
                    <dd className="mt-1 break-words font-medium">{template.titlePattern}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Verkaufsregeln
                    </dt>
                    <dd className="mt-1">
                      Preis {template.priceAdjustmentPercent >= 0 ? "+" : ""}
                      {template.priceAdjustmentPercent} % · Bestand max.{" "}
                      {template.quantityLimit ?? "unbegrenzt"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Merkmale
                    </dt>
                    <dd className="mt-1">
                      {Object.keys(template.aspects).length} gespeicherte Merkmale
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Aktualisiert
                    </dt>
                    <dd className="mt-1">
                      {new Date(template.updatedAt).toLocaleString("de-DE")}
                    </dd>
                  </div>
                </dl>
              </article>
            ))}
          </div>
        ) : (
          <div className="mt-5 rounded-xl bg-slate-50 p-8 text-center">
            <p className="font-semibold">Noch keine Templates gespeichert.</p>
            <p className="mt-1 text-sm text-slate-500">
              Öffne einen Artikel, vervollständige seinen eBay-Entwurf und speichere
              ihn dort als Template.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
