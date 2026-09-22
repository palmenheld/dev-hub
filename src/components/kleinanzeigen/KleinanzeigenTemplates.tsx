"use client";

import Link from "next/link";
import { useState } from "react";
import type { KleinanzeigenTemplate } from "@/types/kleinanzeigen";

export default function KleinanzeigenTemplates({ initialTemplates }: { initialTemplates: KleinanzeigenTemplate[] }) {
  const [templates, setTemplates] = useState(initialTemplates);
  const [error, setError] = useState("");

  async function remove(id: string) {
    setError("");
    const response = await fetch(`/api/channels/kleinanzeigen/templates/${id}`, { method: "DELETE" });
    if (!response.ok) {
      const payload = await response.json() as { error?: string };
      setError(payload.error || "Template konnte nicht entfernt werden.");
      return;
    }
    setTemplates((current) => current.filter((template) => template.id !== id));
  }

  return <div className="mx-auto max-w-[1400px]">
    <header className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-sm font-semibold uppercase tracking-wide text-[var(--ph-gold)]">Kleinanzeigen</p><h1 className="mt-1 text-3xl text-[var(--ph-green-dark)]">Templates</h1><p className="mt-2 text-slate-500">Wiederverwendbare AnzeigenChef-Vorgaben für Kategorie, Standort, Preisart, Attribute und Kontakt.</p></div><Link href="/channels/kleinanzeigen" className="rounded-xl border border-[var(--ph-green-dark)] px-4 py-2.5 font-semibold text-[var(--ph-green-dark)]">Zur Anzeigenverwaltung</Link></header>
    {error && <div className="mt-5 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}
    <section className="mt-6 overflow-hidden rounded-2xl border bg-white shadow-sm"><div className="grid grid-cols-[1.2fr_1fr_1fr_1fr_auto] gap-4 border-b bg-slate-50 px-5 py-3 text-xs font-bold uppercase tracking-wide text-slate-500"><div>Name</div><div>Kategorie</div><div>Preisart</div><div>Standort</div><div/></div>
      <div className="divide-y">{templates.map((template) => <article key={template.id} className="grid grid-cols-1 gap-3 px-5 py-4 md:grid-cols-[1.2fr_1fr_1fr_1fr_auto] md:items-center"><div><div className="font-bold">{template.name}</div><div className="mt-1 text-xs text-slate-500">{Object.keys(template.attributes).length} Attribute · {template.shippingProvided ? "Versand" : "Abholung"}</div></div><div className="text-sm">{template.category}</div><div className="text-sm">{template.priceType === "fixed" ? "Festpreis" : template.priceType === "negotiable" ? "VB" : "Zu verschenken"}</div><div className="text-sm">{template.postalCode} {template.location}</div><button type="button" onClick={() => remove(template.id)} className="rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-700">Entfernen</button></article>)}{templates.length === 0 && <div className="p-12 text-center text-slate-500">Noch keine Templates. Öffne einen Entwurf und speichere ihn dort als Template.</div>}</div>
    </section>
  </div>;
}
