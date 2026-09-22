"use client";
/* eslint-disable @next/next/no-img-element, @typescript-eslint/no-unused-expressions */

import Link from "next/link";
import { useMemo, useState } from "react";
import type {
  KleinanzeigenConnection,
  KleinanzeigenListing,
  KleinanzeigenListingStatus,
  KleinanzeigenTemplate,
} from "@/types/kleinanzeigen";

type ArticleOption = { id: string; sku: string; name: string; description: string; price: number };
type Feedback = { kind: "success" | "error"; message: string };

const statusLabels: Record<KleinanzeigenListingStatus, string> = {
  draft: "Entwurf",
  ready: "Freigegeben",
  exported: "An AnzeigenChef übergeben",
  active: "Aktiv",
  paused: "Pausiert",
  error: "Fehler",
};

const statusTones: Record<KleinanzeigenListingStatus, string> = {
  draft: "bg-slate-100 text-slate-700",
  ready: "bg-blue-100 text-blue-800",
  exported: "bg-violet-100 text-violet-800",
  active: "bg-green-100 text-green-800",
  paused: "bg-amber-100 text-amber-900",
  error: "bg-red-100 text-red-800",
};

const euros = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });

function Status({ value }: { value: KleinanzeigenListingStatus }) {
  return <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusTones[value]}`}>{statusLabels[value]}</span>;
}

function parseAttributes(value: string) {
  return Object.fromEntries(
    value.split("\n").map((line) => line.split("=")).filter((parts) => parts.length >= 2)
      .map(([key, ...rest]) => [key.trim(), rest.join("=").trim()]).filter(([key, item]) => key && item)
  );
}

function attributesText(listing: KleinanzeigenListing) {
  return Object.entries(listing.attributes).map(([key, value]) => `${key}=${value}`).join("\n");
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
  const initialArticle = articleOptions.find((article) => article.id === initialArticleId);
  const deepLinked = initialListings.find((listing) =>
    listing.articleId === initialArticleId || (initialArticle && listing.sku === initialArticle.sku));
  const [listings, setListings] = useState(initialListings);
  const [query, setQuery] = useState(deepLinked?.sku || "");
  const [status, setStatus] = useState<KleinanzeigenListingStatus | "all">("all");
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [editingId, setEditingId] = useState<string | null>(deepLinked?.id || null);
  const [form, setForm] = useState<KleinanzeigenListing | null>(deepLinked || null);
  const [attributeInput, setAttributeInput] = useState(deepLinked ? attributesText(deepLinked) : "");
  const [newImageUrl, setNewImageUrl] = useState("");
  const [newArticleId, setNewArticleId] = useState(initialArticleId && !deepLinked ? initialArticleId : "");
  const [templates, setTemplates] = useState<KleinanzeigenTemplate[]>([]);
  const [templateName, setTemplateName] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  const filtered = useMemo(() => listings.filter((listing) => {
    if (status !== "all" && listing.status !== status) return false;
    const haystack = [listing.sku, listing.title, listing.category, listing.location, listing.source?.latinName]
      .filter(Boolean).join(" ").toLowerCase();
    return haystack.includes(query.trim().toLowerCase());
  }), [listings, query, status]);

  function replaceListing(listing: KleinanzeigenListing) {
    setListings((current) => current.map((item) => item.id === listing.id ? listing : item));
    setForm(listing);
    setAttributeInput(attributesText(listing));
  }

  function openEditor(listing: KleinanzeigenListing) {
    setEditingId(listing.id);
    setForm(structuredClone(listing));
    setAttributeInput(attributesText(listing));
    setFeedback(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function createDraft() {
    if (!newArticleId) return;
    setBusy(true); setFeedback(null);
    try {
      const response = await fetch("/api/channels/kleinanzeigen/drafts", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ articleId: newArticleId }),
      });
      const payload = await response.json() as { listing?: KleinanzeigenListing; error?: string };
      if (!response.ok || !payload.listing) throw new Error(payload.error || "Entwurf konnte nicht erstellt werden.");
      setListings((current) => current.some((item) => item.id === payload.listing!.id) ? current : [payload.listing!, ...current]);
      openEditor(payload.listing);
      setFeedback({ kind: "success", message: "Kleinanzeigen-Entwurf wurde vorbereitet." });
    } catch (error) {
      setFeedback({ kind: "error", message: error instanceof Error ? error.message : "Entwurf konnte nicht erstellt werden." });
    } finally { setBusy(false); }
  }

  async function save(approved = false) {
    if (!form || !editingId) return;
    setBusy(true); setFeedback(null);
    try {
      const response = await fetch(`/api/channels/kleinanzeigen/listings/${editingId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sku: form.sku, title: form.title, description: form.description,
          price: Number(form.price), priceType: form.priceType, adType: form.adType,
          category: form.category, categoryId: form.categoryId, attributes: parseAttributes(attributeInput),
          location: form.location, postalCode: form.postalCode, street: form.street,
          contactName: form.contactName, phone: form.phone, shippingProvided: form.shippingProvided,
          commercial: form.commercial, stock: form.stock, selectedImageUrls: form.selectedImageUrls,
          uploadedImages: form.uploadedImages, templateId: form.templateId, templateName: form.templateName,
          approved,
        }),
      });
      const payload = await response.json() as { listing?: KleinanzeigenListing; error?: string };
      if (!response.ok || !payload.listing) throw new Error(payload.error || "Speichern fehlgeschlagen.");
      replaceListing(payload.listing);
      const approvalFailed = approved && !payload.listing.approvedAt;
      setFeedback({
        kind: approvalFailed ? "error" : "success",
        message: approvalFailed ? "Bitte behebe erst die rot markierten Pflichtfehler." : approved ? "Entwurf gespeichert und ausdrücklich freigegeben." : "Änderungen gespeichert.",
      });
    } catch (error) {
      setFeedback({ kind: "error", message: error instanceof Error ? error.message : "Speichern fehlgeschlagen." });
    } finally { setBusy(false); }
  }

  async function refreshFromWeclapp() {
    if (!form) return;
    setBusy(true); setFeedback(null);
    try {
      const response = await fetch(`/api/channels/kleinanzeigen/listings/${form.id}/refresh`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const payload = await response.json() as { listing?: KleinanzeigenListing; error?: string };
      if (!response.ok || !payload.listing) throw new Error(payload.error || "Neuladen fehlgeschlagen.");
      replaceListing(payload.listing);
      setFeedback({ kind: "success", message: "Preis, Bestand, Maße und Bilder wurden aus Weclapp neu geladen. Texteingaben blieben erhalten." });
    } catch (error) {
      setFeedback({ kind: "error", message: error instanceof Error ? error.message : "Neuladen fehlgeschlagen." });
    } finally { setBusy(false); }
  }

  async function loadTemplates() {
    const response = await fetch("/api/channels/kleinanzeigen/templates", { cache: "no-store" });
    const payload = await response.json() as { templates?: KleinanzeigenTemplate[] };
    setTemplates(payload.templates || []);
  }

  async function saveTemplate() {
    if (!form || !templateName.trim()) return;
    setBusy(true);
    try {
      const response = await fetch("/api/channels/kleinanzeigen/templates", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: templateName.trim(), titlePattern: form.title, descriptionPrefix: "", descriptionSuffix: "",
          priceAdjustmentPercent: 0, priceType: form.priceType, adType: form.adType,
          category: form.category, categoryId: form.categoryId, attributes: parseAttributes(attributeInput),
          location: form.location, postalCode: form.postalCode, street: form.street,
          contactName: form.contactName, phone: form.phone, shippingProvided: form.shippingProvided,
          commercial: form.commercial, isDefault: false,
        }),
      });
      const payload = await response.json() as { template?: KleinanzeigenTemplate; error?: string };
      if (!response.ok || !payload.template) throw new Error(payload.error || "Template konnte nicht gespeichert werden.");
      setTemplates((current) => [payload.template!, ...current]); setTemplateName("");
      setFeedback({ kind: "success", message: "Template wurde gespeichert." });
    } catch (error) {
      setFeedback({ kind: "error", message: error instanceof Error ? error.message : "Template konnte nicht gespeichert werden." });
    } finally { setBusy(false); }
  }

  function applyTemplate(id: string) {
    const template = templates.find((item) => item.id === id);
    if (!template || !form) return;
    setForm({
      ...form, templateId: template.id, templateName: template.name,
      price: Number((form.price * (1 + template.priceAdjustmentPercent / 100)).toFixed(2)),
      priceType: template.priceType, adType: template.adType, category: template.category,
      categoryId: template.categoryId, attributes: template.attributes, location: template.location,
      postalCode: template.postalCode, street: template.street, contactName: template.contactName,
      phone: template.phone, shippingProvided: template.shippingProvided, commercial: template.commercial,
      title: template.titlePattern.replaceAll("{sku}", form.sku).replaceAll("{titel}", form.title).slice(0, 65),
      description: `${template.descriptionPrefix}${form.description}${template.descriptionSuffix}`.slice(0, 4000),
    });
    setAttributeInput(Object.entries(template.attributes).map(([key, value]) => `${key}=${value}`).join("\n"));
  }

  async function exportListings(ids: string[]) {
    setBusy(true); setFeedback(null);
    try {
      const response = await fetch("/api/channels/kleinanzeigen/export", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids }),
      });
      if (!response.ok) {
        const payload = await response.json() as { error?: string };
        throw new Error(payload.error || "Export fehlgeschlagen.");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob); const anchor = document.createElement("a");
      anchor.href = url; anchor.download = `anzeigenchef-palmenheld-${new Date().toISOString().slice(0, 10)}.csv`;
      anchor.click(); URL.revokeObjectURL(url);
      setListings((current) => current.map((item) => ids.includes(item.id) ? { ...item, status: "exported", exportedAt: new Date().toISOString() } : item));
      if (form && ids.includes(form.id)) setForm({ ...form, status: "exported", exportedAt: new Date().toISOString() });
      setFeedback({ kind: "success", message: `${ids.length} Anzeige(n) als AnzeigenChef-Importdatei exportiert.` });
    } catch (error) {
      setFeedback({ kind: "error", message: error instanceof Error ? error.message : "Export fehlgeschlagen." });
    } finally { setBusy(false); }
  }

  function addImage() {
    if (!form || !newImageUrl.trim() || form.selectedImageUrls.length >= 20) return;
    try { new URL(newImageUrl.trim()); } catch { setFeedback({ kind: "error", message: "Bitte eine vollständige Bild-URL eingeben." }); return; }
    if (!form.selectedImageUrls.includes(newImageUrl.trim())) setForm({ ...form, selectedImageUrls: [...form.selectedImageUrls, newImageUrl.trim()] });
    setNewImageUrl("");
  }

  if (form && editingId) {
    const allImages = [...form.selectedImageUrls, ...form.uploadedImages.map((image) => image.url)]
      .filter((url, index, values) => values.indexOf(url) === index);
    return (
      <div className="mx-auto max-w-[1500px]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><p className="text-sm font-semibold uppercase tracking-wide text-[var(--ph-gold)]">Kleinanzeigen · AnzeigenChef</p><h1 className="mt-1 text-3xl text-[var(--ph-green-dark)]">Anzeige bearbeiten</h1><p className="mt-1 text-sm text-slate-500">SKU {form.sku} · {form.source?.latinName || "Pflanzendaten manuell ergänzbar"}</p></div>
          <div className="flex flex-wrap gap-2"><button type="button" onClick={() => { setEditingId(null); setForm(null); }} className="rounded-xl border px-4 py-2.5 font-semibold">Zur Liste</button><button type="button" disabled={busy || !form.articleId} onClick={refreshFromWeclapp} className="rounded-xl border border-blue-300 px-4 py-2.5 font-semibold text-blue-800 disabled:opacity-40">Weclapp neu laden</button></div>
        </div>
        {feedback && <div className={`mt-4 rounded-xl border p-3 text-sm font-semibold ${feedback.kind === "error" ? "border-red-200 bg-red-50 text-red-800" : "border-green-200 bg-green-50 text-green-800"}`}>{feedback.message}</div>}
        <section className="mt-5 rounded-2xl border bg-white p-5 shadow-sm">
          <div className="grid gap-4 lg:grid-cols-2">
            <label className="lg:col-span-2"><span className="text-sm font-bold">Titel</span><input value={form.title} maxLength={65} onChange={(event) => setForm({ ...form, title: event.target.value })} className="mt-1 w-full rounded-xl border px-4 py-3"/><span className="mt-1 block text-right text-xs text-slate-500">{form.title.length}/65</span></label>
            <label><span className="text-sm font-bold">Artikelnummer</span><input value={form.sku} onChange={(event) => setForm({ ...form, sku: event.target.value })} className="mt-1 w-full rounded-xl border px-4 py-3"/></label>
            <label><span className="text-sm font-bold">Bestand</span><input type="number" value={form.stock ?? ""} onChange={(event) => setForm({ ...form, stock: event.target.value === "" ? undefined : Number(event.target.value) })} className="mt-1 w-full rounded-xl border px-4 py-3"/></label>
            <label><span className="text-sm font-bold">Preis</span><input type="number" step="0.01" value={form.price} onChange={(event) => setForm({ ...form, price: Number(event.target.value) })} className="mt-1 w-full rounded-xl border px-4 py-3"/></label>
            <label><span className="text-sm font-bold">Preisart</span><select value={form.priceType} onChange={(event) => setForm({ ...form, priceType: event.target.value as KleinanzeigenListing["priceType"] })} className="mt-1 w-full rounded-xl border bg-white px-4 py-3"><option value="fixed">Festpreis</option><option value="negotiable">Verhandlungsbasis</option><option value="free">Zu verschenken</option></select></label>
            <label><span className="text-sm font-bold">Anzeigenart</span><select value={form.adType} onChange={(event) => setForm({ ...form, adType: event.target.value as KleinanzeigenListing["adType"] })} className="mt-1 w-full rounded-xl border bg-white px-4 py-3"><option value="offer">Angebot</option><option value="wanted">Gesuch</option></select></label>
            <label><span className="text-sm font-bold">Kategorie</span><input value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} className="mt-1 w-full rounded-xl border px-4 py-3"/></label>
            <label><span className="text-sm font-bold">AnzeigenChef-Kategorie-ID (optional)</span><input value={form.categoryId || ""} onChange={(event) => setForm({ ...form, categoryId: event.target.value })} className="mt-1 w-full rounded-xl border px-4 py-3"/></label>
            <label className="lg:col-span-2"><span className="text-sm font-bold">Beschreibung</span><textarea rows={15} maxLength={4000} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} className="mt-1 w-full rounded-xl border px-4 py-3"/><span className="mt-1 block text-right text-xs text-slate-500">{form.description.length}/4.000</span></label>
          </div>
        </section>
        <section className="mt-5 rounded-2xl border bg-white p-5 shadow-sm"><h2 className="text-xl text-[var(--ph-green-dark)]">Anzeigenmerkmale und Kontakt</h2><div className="mt-4 grid gap-4 lg:grid-cols-3">
          <label><span className="text-sm font-bold">Ort</span><input value={form.location} onChange={(event) => setForm({ ...form, location: event.target.value })} className="mt-1 w-full rounded-xl border px-4 py-3"/></label>
          <label><span className="text-sm font-bold">Postleitzahl</span><input value={form.postalCode} maxLength={5} onChange={(event) => setForm({ ...form, postalCode: event.target.value })} className="mt-1 w-full rounded-xl border px-4 py-3"/></label>
          <label><span className="text-sm font-bold">Straße (optional)</span><input value={form.street || ""} onChange={(event) => setForm({ ...form, street: event.target.value })} className="mt-1 w-full rounded-xl border px-4 py-3"/></label>
          <label><span className="text-sm font-bold">Ansprechpartner</span><input value={form.contactName || ""} onChange={(event) => setForm({ ...form, contactName: event.target.value })} className="mt-1 w-full rounded-xl border px-4 py-3"/></label>
          <label><span className="text-sm font-bold">Telefon</span><input value={form.phone || ""} onChange={(event) => setForm({ ...form, phone: event.target.value })} className="mt-1 w-full rounded-xl border px-4 py-3"/></label>
          <label><span className="text-sm font-bold">Attribute (ein Schlüssel=Wert pro Zeile)</span><textarea rows={4} value={attributeInput} onChange={(event) => setAttributeInput(event.target.value)} className="mt-1 w-full rounded-xl border px-4 py-3" placeholder="art=pflanzen\nzustand=neu"/></label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={form.shippingProvided} onChange={(event) => setForm({ ...form, shippingProvided: event.target.checked })}/> Versand möglich</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={form.commercial} onChange={(event) => setForm({ ...form, commercial: event.target.checked })}/> Gewerbliche Anzeige</label>
        </div></section>
        <section className="mt-5 rounded-2xl border bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><div><h2 className="text-xl text-[var(--ph-green-dark)]">Bilder und Reihenfolge</h2><p className="text-sm text-slate-500">Das erste Bild ist das Hauptbild. Bis zu 20 Bilder werden an AnzeigenChef übergeben.</p></div><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold">{allImages.length}/20</span></div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{form.selectedImageUrls.map((url, index) => <div key={url} className="rounded-xl border p-2"><div className="aspect-square overflow-hidden rounded-lg bg-slate-100"><img src={url} alt={`Anzeigenbild ${index + 1}`} className="h-full w-full object-cover"/></div><div className="mt-2 flex gap-1"><button type="button" disabled={index === 0} onClick={() => { const next = [...form.selectedImageUrls]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; setForm({ ...form, selectedImageUrls: next }); }} className="rounded border px-2 py-1 text-xs disabled:opacity-30">←</button><button type="button" disabled={index === form.selectedImageUrls.length - 1} onClick={() => { const next = [...form.selectedImageUrls]; [next[index + 1], next[index]] = [next[index], next[index + 1]]; setForm({ ...form, selectedImageUrls: next }); }} className="rounded border px-2 py-1 text-xs disabled:opacity-30">→</button><button type="button" onClick={() => setForm({ ...form, selectedImageUrls: form.selectedImageUrls.filter((item) => item !== url) })} className="ml-auto rounded border border-red-200 px-2 py-1 text-xs text-red-700">Entfernen</button></div></div>)}</div>
          <div className="mt-4 flex gap-2"><input type="url" value={newImageUrl} onChange={(event) => setNewImageUrl(event.target.value)} placeholder="https://… Bild-URL nachtragen" className="min-w-0 flex-1 rounded-xl border px-4 py-3"/><button type="button" onClick={addImage} disabled={allImages.length >= 20} className="rounded-xl border border-[var(--ph-green-dark)] px-4 py-3 font-semibold text-[var(--ph-green-dark)] disabled:opacity-40">Bild hinzufügen</button></div>
        </section>
        <section className="mt-5 rounded-2xl border bg-white p-5 shadow-sm"><div className="grid gap-4 lg:grid-cols-2"><div><h2 className="text-xl text-[var(--ph-green-dark)]">Prüfung und Freigabe</h2>{form.validation.errors.length > 0 && <ul className="mt-3 list-disc rounded-xl bg-red-50 p-4 pl-8 text-sm text-red-800">{form.validation.errors.map((item) => <li key={item}>{item}</li>)}</ul>}{form.validation.warnings.length > 0 && <ul className="mt-3 list-disc rounded-xl bg-amber-50 p-4 pl-8 text-sm text-amber-900">{form.validation.warnings.map((item) => <li key={item}>{item}</li>)}</ul>}<p className="mt-3 text-sm text-slate-600">{form.approvedAt ? `Ausdrücklich freigegeben am ${new Date(form.approvedAt).toLocaleString("de-DE")}.` : "Noch nicht ausdrücklich freigegeben."}</p></div><div><h2 className="text-xl text-[var(--ph-green-dark)]">Template</h2><div className="mt-3 flex gap-2"><select onFocus={loadTemplates} onChange={(event) => applyTemplate(event.target.value)} defaultValue="" className="min-w-0 flex-1 rounded-xl border bg-white px-3 py-2"><option value="">Template anwenden…</option>{templates.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><Link href="/channels/kleinanzeigen/templates" className="rounded-xl border px-3 py-2 text-sm font-semibold">Verwalten</Link></div><div className="mt-3 flex gap-2"><input value={templateName} onChange={(event) => setTemplateName(event.target.value)} placeholder="Aktuellen Entwurf als Template…" className="min-w-0 flex-1 rounded-xl border px-3 py-2"/><button type="button" onClick={saveTemplate} disabled={!templateName.trim() || busy} className="rounded-xl border px-3 py-2 text-sm font-semibold disabled:opacity-40">Speichern</button></div></div></div>
          <div className="mt-5 flex flex-wrap justify-end gap-2"><button type="button" onClick={() => save(false)} disabled={busy} className="rounded-xl border px-5 py-3 font-semibold">Entwurf speichern</button><button type="button" onClick={() => save(true)} disabled={busy} className="rounded-xl bg-[var(--ph-green-dark)] px-5 py-3 font-semibold text-white disabled:opacity-40">Inhalt ausdrücklich freigeben</button><button type="button" onClick={() => exportListings([form.id])} disabled={busy || !form.approvedAt || !form.validation.valid || !connection.canExport} className="rounded-xl bg-violet-700 px-5 py-3 font-semibold text-white disabled:opacity-40">Für AnzeigenChef exportieren</button></div>
        </section>
      </div>
    );
  }

  const allVisibleSelected = filtered.length > 0 && filtered.every((item) => selected.has(item.id));
  return (
    <div className="mx-auto max-w-[1600px]">
      <header className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start"><div><p className="text-sm font-semibold uppercase tracking-wide text-[var(--ph-gold)]">Vertriebskanal</p><h1 className="mt-1 text-3xl text-[var(--ph-green-dark)]">Kleinanzeigen</h1><p className="mt-2 max-w-3xl text-slate-500">Weclapp-Artikel für Kleinanzeigen optimieren, prüfen, als Vorlage speichern und über AnzeigenChef übertragen.</p></div><Link href="/channels/kleinanzeigen/templates" className="rounded-xl border border-[var(--ph-green-dark)] px-4 py-2.5 font-semibold text-[var(--ph-green-dark)]">Templates</Link></header>
      <section className="mt-5 rounded-2xl border border-violet-200 bg-violet-50 p-5"><div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center"><div><div className="flex flex-wrap items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-violet-500"/><h2 className="text-lg font-bold">{connection.label}</h2><span className="rounded-full border bg-white px-2.5 py-1 text-xs font-semibold">{connection.mode}</span></div><p className="mt-1 max-w-4xl text-sm text-slate-600">{connection.description}</p></div><Link href="/connection-settings?tab=kleinanzeigen" className="rounded-xl border bg-white px-4 py-2.5 text-sm font-semibold">Verbindungseinstellungen</Link></div></section>
      {feedback && <div className={`mt-4 rounded-xl border p-3 text-sm font-semibold ${feedback.kind === "error" ? "border-red-200 bg-red-50 text-red-800" : "border-green-200 bg-green-50 text-green-800"}`}>{feedback.message}</div>}
      <section className="mt-5 rounded-2xl border bg-white p-4 shadow-sm"><div className="grid gap-3 lg:grid-cols-[1fr_auto]"><select value={newArticleId} onChange={(event) => setNewArticleId(event.target.value)} className="rounded-xl border bg-white px-4 py-3"><option value="">Weclapp-Artikel für neuen Entwurf auswählen…</option>{articleOptions.map((article) => <option key={article.id} value={article.id}>{article.sku} · {article.name}</option>)}</select><button type="button" onClick={createDraft} disabled={!newArticleId || busy} className="rounded-xl bg-[var(--ph-green-dark)] px-5 py-3 font-semibold text-white disabled:opacity-40">KI-Entwurf erstellen</button></div></section>
      <section className="mt-5 overflow-hidden rounded-2xl border bg-white shadow-sm"><div className="grid gap-3 border-b p-4 lg:grid-cols-[1fr_220px_auto]"><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="SKU, Titel, Art, Kategorie oder Ort suchen…" className="rounded-xl border px-4 py-3"/><select value={status} onChange={(event) => setStatus(event.target.value as typeof status)} className="rounded-xl border bg-white px-4 py-3"><option value="all">Alle Status</option>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><button type="button" onClick={() => exportListings([...selected])} disabled={!selected.size || busy} className="rounded-xl bg-violet-700 px-4 py-3 font-semibold text-white disabled:opacity-40">{selected.size} für AnzeigenChef exportieren</button></div>
        <div className="overflow-x-auto"><table className="w-full min-w-[950px] text-left"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3"><input type="checkbox" checked={allVisibleSelected} onChange={() => setSelected((current) => { const next = new Set(current); filtered.forEach((item) => allVisibleSelected ? next.delete(item.id) : next.add(item.id)); return next; })}/></th><th className="px-4 py-3">Artikel</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Preis</th><th className="px-4 py-3">Bilder</th><th className="px-4 py-3">Prüfung</th><th className="px-4 py-3"></th></tr></thead><tbody className="divide-y">{filtered.map((listing) => <tr key={listing.id} className="hover:bg-slate-50"><td className="px-4 py-4"><input type="checkbox" checked={selected.has(listing.id)} onChange={() => setSelected((current) => { const next = new Set(current); next.has(listing.id) ? next.delete(listing.id) : next.add(listing.id); return next; })}/></td><td className="px-4 py-4"><button type="button" onClick={() => openEditor(listing)} className="text-left"><div className="font-bold text-[var(--ph-green-dark)]">{listing.title}</div><div className="mt-1 font-mono text-xs text-slate-500">{listing.sku}</div><div className="mt-1 text-xs text-slate-500">{listing.category}</div></button></td><td className="px-4 py-4"><Status value={listing.status}/></td><td className="px-4 py-4 font-semibold">{listing.priceType === "free" ? "Zu verschenken" : euros.format(listing.price)}</td><td className="px-4 py-4">{listing.selectedImageUrls.length + listing.uploadedImages.length}/20</td><td className="px-4 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${listing.validation.valid ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}>{listing.validation.valid ? listing.approvedAt ? "Freigegeben" : "Vollständig" : `${listing.validation.errors.length} offen`}</span></td><td className="px-4 py-4 text-right"><button type="button" onClick={() => openEditor(listing)} className="rounded-lg border border-[var(--ph-green-dark)] px-3 py-2 text-xs font-semibold text-[var(--ph-green-dark)]">Bearbeiten</button></td></tr>)}{filtered.length === 0 && <tr><td colSpan={7} className="p-12 text-center text-slate-500">Keine Anzeigen gefunden.</td></tr>}</tbody></table></div>
      </section>
    </div>
  );
}
