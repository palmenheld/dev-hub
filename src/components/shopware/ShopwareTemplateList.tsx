"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { ShopwareProductTemplate } from "@/types/shopwarePublishing";

export default function ShopwareTemplateList() {
  const [templates, setTemplates] = useState<ShopwareProductTemplate[]>([]);
  const [busy, setBusy] = useState("load");
  const [error, setError] = useState("");

  async function loadTemplates() {
    setBusy("load");
    setError("");
    try {
      const response = await fetch("/api/channels/shopware/templates", {
        cache: "no-store",
      });
      const payload = (await response.json()) as {
        templates?: ShopwareProductTemplate[];
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
    const timeout = window.setTimeout(() => void loadTemplates(), 0);
    return () => window.clearTimeout(timeout);
  }, []);

  async function remove(template: ShopwareProductTemplate) {
    if (!window.confirm(`Template „${template.name}“ wirklich löschen?`)) return;
    setBusy(template.id);
    setError("");
    try {
      const response = await fetch(
        `/api/channels/shopware/templates/${encodeURIComponent(template.id)}`,
        { method: "DELETE" }
      );
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Template konnte nicht gelöscht werden.");
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
          <p className="text-sm font-semibold uppercase tracking-wide text-[var(--ph-gold)]">Verkaufskanal · Shopware</p>
          <h1 className="mt-1 text-3xl text-[var(--ph-green-dark)]">Shopware-Templates</h1>
          <p className="mt-2 max-w-3xl text-slate-500">Wiederverwendbare Regeln für Titel, Preise, Bestand, SEO-Schlagwörter und die Live-Schaltung.</p>
        </div>
        <Link href="/channels/shopware" className="rounded-xl border border-[var(--ph-green-dark)] bg-white px-4 py-2.5 font-semibold text-[var(--ph-green-dark)]">Zur Shopware-Verwaltung</Link>
      </header>
      {error && <div className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</div>}
      <section className="mt-6 rounded-2xl border bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div><h2 className="text-xl text-[var(--ph-green-dark)]">Gespeicherte Templates</h2><p className="mt-1 text-sm text-slate-500">Neue Templates speicherst du direkt im Shopware-Entwurf.</p></div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold">{templates.length} gespeichert</span>
        </div>
        {busy === "load" ? (
          <p className="mt-5 rounded-xl bg-slate-50 p-8 text-center text-sm text-slate-500">Templates werden geladen…</p>
        ) : templates.length ? (
          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            {templates.map((template) => (
              <article key={template.id} className="rounded-2xl border p-5">
                <div className="flex items-start justify-between gap-3">
                  <div><div className="flex flex-wrap items-center gap-2"><h3 className="text-lg font-bold">{template.name}</h3>{template.isDefault && <span className="rounded-full bg-green-100 px-2.5 py-1 text-xs font-semibold text-green-800">Standard</span>}</div><p className="mt-1 text-sm text-slate-600">{template.active ? "Neue Produkte direkt aktiv" : "Neue Produkte zunächst inaktiv"}</p></div>
                  <button type="button" onClick={() => remove(template)} disabled={Boolean(busy)} className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-700 disabled:opacity-40">{busy === template.id ? "Löscht…" : "Löschen"}</button>
                </div>
                <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
                  <div><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Titelmuster</dt><dd className="mt-1 break-words font-medium">{template.titlePattern}</dd></div>
                  <div><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Preis / Bestand</dt><dd className="mt-1">Preis {template.priceAdjustmentPercent >= 0 ? "+" : ""}{template.priceAdjustmentPercent} % · Bestand max. {template.stockLimit ?? "unbegrenzt"}</dd></div>
                  <div><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">SEO</dt><dd className="mt-1">{template.keywords.length} Schlagwörter</dd></div>
                  <div><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Aktualisiert</dt><dd className="mt-1">{new Date(template.updatedAt).toLocaleString("de-DE")}</dd></div>
                </dl>
              </article>
            ))}
          </div>
        ) : (
          <div className="mt-5 rounded-xl bg-slate-50 p-8 text-center"><p className="font-semibold">Noch keine Shopware-Templates gespeichert.</p><p className="mt-1 text-sm text-slate-500">Öffne einen Shopware-Entwurf und speichere dort die gewünschten Regeln.</p></div>
        )}
      </section>
    </div>
  );
}
