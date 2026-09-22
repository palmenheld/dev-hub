"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type {
  LegacyWarehousePayload,
  WarehouseArticle,
  WarehouseInventoryEntry,
  WarehouseState,
} from "@/types/warehouse";

type View = "home" | "search" | "scan" | "article" | "inventory" | "receipt" | "operations";
type Config = { liveWritesEnabled: boolean; resetPinConfigured: boolean; source: string };
type Feedback = { kind: "success" | "error" | "info"; message: string };
type Operation = "topup" | "invoices" | "reset" | null;

const euro = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });

async function jsonRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const payload = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(payload.error || "Aktion fehlgeschlagen.");
  return payload;
}

function actionButton(classes: string) {
  return `rounded-2xl border p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${classes}`;
}

export default function WarehouseApp() {
  const [articles, setArticles] = useState<WarehouseArticle[]>([]);
  const [state, setState] = useState<WarehouseState | null>(null);
  const [warehouses, setWarehouses] = useState<string[]>([]);
  const [config, setConfig] = useState<Config>({ liveWritesEnabled: false, resetPinConfigured: false, source: "weclapp" });
  const [view, setView] = useState<View>("home");
  const [selectedId, setSelectedId] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [movement, setMovement] = useState<{ action: "plus" | "minus" | "set"; warehouse: string; amount: number } | null>(null);
  const [inventoryArticleId, setInventoryArticleId] = useState("");
  const [inventoryWarehouse, setInventoryWarehouse] = useState("");
  const [inventoryCount, setInventoryCount] = useState(0);
  const [receiptArticleId, setReceiptArticleId] = useState("");
  const [receiptQuantity, setReceiptQuantity] = useState(1);
  const [operation, setOperation] = useState<Operation>(null);
  const [operationResult, setOperationResult] = useState<Record<string, unknown> | null>(null);
  const [operationWarehouse, setOperationWarehouse] = useState("");
  const [resetCode, setResetCode] = useState("");
  const [invoiceFrom, setInvoiceFrom] = useState(() => `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}-01`);
  const [invoiceTo, setInvoiceTo] = useState(() => new Date().toISOString().slice(0, 10));
  const migrationInput = useRef<HTMLInputElement>(null);

  const selected = articles.find((article) => article.id === selectedId);
  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("de");
    return articles.filter((article) => (!state?.hideInactive || article.active) && (!needle || `${article.name} ${article.articleNumber} ${article.barcode}`.toLocaleLowerCase("de").includes(needle)));
  }, [articles, query, state?.hideInactive]);
  const inventoryEntries = Object.values(state?.inventory.counts || {}).sort((left, right) => right.updatedAt - left.updatedAt);
  const receiptItems = Object.values(state?.receipt.items || {});
  const recent = (state?.recentArticleIds || []).map((id) => articles.find((article) => article.id === id)).filter((article): article is WarehouseArticle => Boolean(article));

  async function load(force = false) {
    setLoading(true); setFeedback(null);
    try {
      const payload = await jsonRequest<{ articles: WarehouseArticle[]; state: WarehouseState; warehouses: string[]; config: Config }>(`/api/warehouse/bootstrap${force ? "?refresh=1" : ""}`, { cache: "no-store" });
      setArticles(payload.articles); setState(payload.state); setWarehouses(payload.warehouses); setConfig(payload.config);
      if (!operationWarehouse && payload.warehouses[0]) setOperationWarehouse(payload.warehouses[0]);
    } catch (error) {
      setFeedback({ kind: "error", message: error instanceof Error ? error.message : "Lager-App konnte nicht geladen werden." });
    } finally { setLoading(false); }
  }

  useEffect(() => {
    let cancelled = false;
    void jsonRequest<{ articles: WarehouseArticle[]; state: WarehouseState; warehouses: string[]; config: Config }>("/api/warehouse/bootstrap", { cache: "no-store" })
      .then((payload) => {
        if (cancelled) return;
        setArticles(payload.articles);
        setState(payload.state);
        setWarehouses(payload.warehouses);
        setConfig(payload.config);
        setOperationWarehouse((current) => current || payload.warehouses[0] || "");
      })
      .catch((error: unknown) => {
        if (!cancelled) setFeedback({ kind: "error", message: error instanceof Error ? error.message : "Lager-App konnte nicht geladen werden." });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  async function persist(next: WarehouseState) {
    setState(next);
    try {
      const payload = await jsonRequest<{ state: WarehouseState }>("/api/warehouse/state", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(next) });
      setState(payload.state);
      return payload.state;
    } catch (error) {
      setFeedback({ kind: "error", message: error instanceof Error ? error.message : "Entwurf konnte nicht gespeichert werden." });
      throw error;
    }
  }

  function openArticle(article: WarehouseArticle) {
    setSelectedId(article.id); setView("article"); setMovement(null); setFeedback(null);
    if (state) void persist({ ...state, recentArticleIds: [article.id, ...state.recentArticleIds.filter((id) => id !== article.id)].slice(0, 20) });
  }

  async function submitMovement() {
    if (!selected || !movement) return;
    setBusy(true); setFeedback(null);
    try {
      const result = await jsonRequest<{ live: boolean; message: string }>("/api/warehouse/movements", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ articleId: selected.id, articleNumber: selected.articleNumber, ...movement }) });
      setMovement(null);
      setFeedback({ kind: result.live ? "success" : "info", message: result.message });
      if (result.live) await load(true);
    } catch (error) { setFeedback({ kind: "error", message: error instanceof Error ? error.message : "Buchung fehlgeschlagen." }); }
    finally { setBusy(false); }
  }

  async function saveInventoryCount() {
    if (!state) return;
    const article = articles.find((item) => item.id === inventoryArticleId);
    const place = article?.warehouseStocks.find((item) => item.name === inventoryWarehouse);
    if (!article || !place || !Number.isInteger(inventoryCount) || inventoryCount < 0) return;
    const key = `${article.id}::${place.name}`;
    const entry: WarehouseInventoryEntry = { key, weclappId: article.id, articleNumber: article.articleNumber, name: article.name, warehouse: place.name, stock: place.quantity, count: inventoryCount, updatedAt: Date.now() };
    await persist({ ...state, inventory: { ...state.inventory, counts: { ...state.inventory.counts, [key]: entry } } });
    setInventoryArticleId(""); setFeedback({ kind: "success", message: "Zählung im gemeinsamen Hub-Entwurf gespeichert." });
  }

  async function bookInventory() {
    if (!state) return;
    const deviations = inventoryEntries.filter((entry) => entry.count !== entry.stock);
    setBusy(true); setFeedback(null);
    try {
      let allLive = true;
      for (const entry of deviations) {
        const result = await jsonRequest<{ live: boolean }>("/api/warehouse/movements", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ articleId: entry.weclappId, articleNumber: entry.articleNumber, action: "set", amount: entry.count, warehouse: entry.warehouse }) });
        allLive = allLive && result.live;
      }
      if (allLive) {
        await persist({ ...state, inventory: { startedAt: state.inventory.startedAt, counts: {} } });
        await load(true);
        setFeedback({ kind: "success", message: `${deviations.length} Abweichungen wurden in Weclapp gebucht.` });
      } else {
        setFeedback({ kind: "info", message: `${deviations.length} Abweichungen wurden vollständig simuliert. Der Entwurf bleibt erhalten; Weclapp wurde nicht verändert.` });
      }
    } catch (error) { setFeedback({ kind: "error", message: error instanceof Error ? error.message : "Inventur konnte nicht verarbeitet werden." }); }
    finally { setBusy(false); }
  }

  async function addReceiptItem() {
    if (!state) return;
    const article = articles.find((item) => item.id === receiptArticleId);
    if (!article || !Number.isInteger(receiptQuantity) || receiptQuantity < 1) return;
    await persist({ ...state, receipt: { ...state.receipt, items: { ...state.receipt.items, [article.id]: { weclappId: article.id, articleNumber: article.articleNumber, name: article.name, quantity: receiptQuantity } } } });
    setReceiptArticleId(""); setReceiptQuantity(1);
  }

  async function runOperationPreview() {
    setBusy(true); setFeedback(null); setOperationResult(null);
    try {
      const endpoint = operation === "topup" ? "/api/warehouse/top-up" : operation === "invoices" ? "/api/warehouse/invoices" : "/api/warehouse/reset";
      const body = operation === "invoices" ? { action: "preview", from: invoiceFrom, to: invoiceTo } : operation === "reset" ? { action: "preview", warehouse: operationWarehouse, code: resetCode } : { action: "preview", warehouse: operationWarehouse };
      setOperationResult(await jsonRequest<Record<string, unknown>>(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
    } catch (error) { setFeedback({ kind: "error", message: error instanceof Error ? error.message : "Vorschau fehlgeschlagen." }); }
    finally { setBusy(false); }
  }

  async function executeOperation() {
    if (!operationResult || !operation) return;
    setBusy(true); setFeedback(null);
    try {
      const endpoint = operation === "topup" ? "/api/warehouse/top-up" : operation === "invoices" ? "/api/warehouse/invoices" : "/api/warehouse/reset";
      let aggregate: Record<string, unknown> | null = null;
      do {
        aggregate = await jsonRequest<Record<string, unknown>>(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "execute", authorization: operationResult.authorization }) });
      } while (aggregate.done === false);
      setFeedback({ kind: "success", message: operation === "invoices" ? "Rechnungslauf abgeschlossen." : operation === "topup" ? "Auftragsbedarf wurde aufgefüllt." : "Lager wurde auf null gesetzt." });
      setOperationResult(aggregate); await load(true);
    } catch (error) { setFeedback({ kind: "error", message: error instanceof Error ? error.message : "Live-Vorgang fehlgeschlagen." }); }
    finally { setBusy(false); }
  }

  async function importMigration(file: File) {
    setBusy(true); setFeedback(null);
    try {
      const payload = JSON.parse(await file.text()) as LegacyWarehousePayload;
      const result = await jsonRequest<{ state: WarehouseState }>("/api/warehouse/migration", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      setState(result.state);
      setFeedback({ kind: "success", message: "Inventur-, Wareneingangs- und Filterdaten der alten Lager-App wurden übernommen." });
    } catch (error) { setFeedback({ kind: "error", message: error instanceof Error ? error.message : "Migrationsdatei konnte nicht gelesen werden." }); }
    finally { setBusy(false); }
  }

  if (loading && !state) return <div className="mx-auto max-w-5xl rounded-3xl border bg-white p-12 text-center shadow-sm"><div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-[var(--ph-green-dark)]"/><h1 className="mt-5 text-2xl text-[var(--ph-green-dark)]">Lagerdaten werden aus Weclapp geladen</h1><p className="mt-2 text-slate-500">Artikel, Bestände, Reservierungen und Lagerorte werden zusammengeführt.</p></div>;

  const badge = <span className={`rounded-full px-3 py-1 text-xs font-bold ${config.liveWritesEnabled ? "bg-red-100 text-red-800" : "bg-blue-100 text-blue-800"}`}>{config.liveWritesEnabled ? "LIVE-BUCHUNGEN" : "SICHERER TESTMODUS"}</span>;
  return <div className="mx-auto max-w-[1500px]">
    <header className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-sm font-semibold uppercase tracking-wide text-[var(--ph-gold)]">Palmenheld Hub</p><h1 className="mt-1 text-3xl text-[var(--ph-green-dark)]">Lager-App</h1><p className="mt-2 max-w-3xl text-slate-500">Mobile Lagerverwaltung mit Live-Daten aus Weclapp und gemeinsamen, geräteübergreifenden Entwürfen.</p></div><div className="flex flex-wrap items-center gap-2">{badge}<button type="button" onClick={() => load(true)} disabled={loading} className="rounded-xl border px-4 py-2.5 text-sm font-semibold">Neu laden</button></div></header>
    <nav className="mt-5 flex flex-wrap gap-2 rounded-2xl border bg-white p-2 shadow-sm">{(["home", "search", "inventory", "receipt", "operations"] as View[]).map((item) => <button key={item} type="button" onClick={() => { setView(item); setFeedback(null); }} className={`rounded-xl px-4 py-2.5 text-sm font-bold ${view === item ? "bg-[var(--ph-green-dark)] text-white" : "text-slate-600 hover:bg-slate-50"}`}>{item === "home" ? "Start" : item === "search" ? "Artikel" : item === "inventory" ? "Inventur" : item === "receipt" ? "Wareneingang" : "Sondervorgänge"}</button>)}</nav>
    {feedback && <div className={`mt-4 rounded-xl border p-3 text-sm font-semibold ${feedback.kind === "error" ? "border-red-200 bg-red-50 text-red-800" : feedback.kind === "success" ? "border-green-200 bg-green-50 text-green-800" : "border-blue-200 bg-blue-50 text-blue-800"}`}>{feedback.message}</div>}

    {view === "home" && <div className="mt-6"><section className="rounded-3xl bg-[var(--ph-green-dark)] p-6 text-white shadow-lg"><p className="text-sm text-green-100">Guten Tag</p><h2 className="mt-1 text-3xl">Was möchtest du tun?</h2><p className="mt-3 text-sm text-green-100">{articles.length} Weclapp-Artikel · {warehouses.length} Lager · {config.liveWritesEnabled ? "Live-Schreibzugriffe aktiviert" : "keine Buchung ohne spätere Freischaltung"}</p></section><section className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3"><button type="button" onClick={() => setView("search")} className={actionButton("border-green-200 bg-green-50 text-green-950")}><span className="text-3xl">⌕</span><strong className="mt-3 block text-lg">Artikel suchen</strong><small>Name, Nummer oder Barcode</small></button><button type="button" onClick={() => setView("scan")} className={actionButton("border-slate-800 bg-slate-900 text-white")}><span className="text-3xl">▣</span><strong className="mt-3 block text-lg">Barcode scannen</strong><small>Kamera oder Codeeingabe</small></button><button type="button" onClick={() => setView("inventory")} className={actionButton("bg-white")}><span className="text-3xl">✓</span><strong className="mt-3 block text-lg">Inventur</strong><small>{inventoryEntries.length} Positionen im Entwurf</small></button><button type="button" onClick={() => setView("receipt")} className={actionButton("border-amber-200 bg-amber-50")}><span className="text-3xl">↓</span><strong className="mt-3 block text-lg">Wareneingang</strong><small>{receiptItems.length} Positionen im Entwurf</small></button><button type="button" onClick={() => { setView("operations"); setOperation("topup"); }} className={actionButton("bg-white")}><span className="text-3xl">＋</span><strong className="mt-3 block text-lg">Auftragsbedarf</strong><small>Offene Aufträge auffüllen</small></button><button type="button" onClick={() => { setView("operations"); setOperation("invoices"); }} className={actionButton("bg-white")}><span className="text-3xl">▤</span><strong className="mt-3 block text-lg">Rechnungen</strong><small>Aufträge nach Datum fakturieren</small></button></section>{recent.length > 0 && <section className="mt-6 rounded-2xl border bg-white p-5"><h2 className="text-lg text-[var(--ph-green-dark)]">Zuletzt geöffnet</h2><div className="mt-3 divide-y">{recent.slice(0, 5).map((article) => <button key={article.id} type="button" onClick={() => openArticle(article)} className="flex w-full items-center justify-between gap-4 py-3 text-left"><span><b className="block">{article.name}</b><small className="text-slate-500">{article.articleNumber} · {article.warehouseStocks[0]?.name || "Kein Lagerbestand"}</small></span><strong>{article.stockQuantity} Stk.</strong></button>)}</div></section>}</div>}

    {view === "search" && <section className="mt-6 rounded-2xl border bg-white shadow-sm"><div className="grid gap-3 border-b p-4 lg:grid-cols-[1fr_auto]"><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name, Artikelnummer oder Barcode" className="rounded-xl border px-4 py-3" autoFocus/><label className="flex items-center gap-3 rounded-xl border px-4 py-3 text-sm font-semibold"><input type="checkbox" checked={state?.hideInactive !== false} onChange={(event) => state && persist({ ...state, hideInactive: event.target.checked })}/> Inaktive ausblenden</label></div><div className="max-h-[70vh] divide-y overflow-y-auto">{filtered.slice(0, 1000).map((article) => <button key={article.id} type="button" onClick={() => openArticle(article)} className="grid w-full gap-2 px-5 py-4 text-left hover:bg-slate-50 sm:grid-cols-[1fr_auto] sm:items-center"><span><b className="block text-[var(--ph-green-dark)]">{article.name}</b><small className="text-slate-500">{article.articleNumber} · {article.description}</small><small className="mt-1 block text-slate-400">Standard Brutto: {article.standardGrossPrice ? euro.format(article.standardGrossPrice.value) : "—"}</small></span><span className="flex gap-4 text-sm"><span>Bestand <b>{article.stockQuantity}</b></span><span>Verfügbar <b>{article.availableQuantity}</b></span></span></button>)}{!filtered.length && <p className="p-12 text-center text-slate-500">Kein Artikel gefunden.</p>}</div></section>}

    {view === "scan" && <Scanner articles={articles} onFound={openArticle} onBack={() => setView("home")}/>} 

    {view === "article" && selected && <section className="mt-6"><button type="button" onClick={() => setView("search")} className="rounded-xl border px-4 py-2 text-sm font-semibold">← Zur Artikelliste</button><div className="mt-4 rounded-3xl border bg-white p-6 shadow-sm"><p className="font-mono text-sm text-slate-500">{selected.articleNumber}</p><h2 className="mt-1 text-3xl text-[var(--ph-green-dark)]">{selected.name}</h2><p className="mt-2 text-slate-500">{selected.description}</p><div className="mt-5 grid grid-cols-3 gap-3"><div className="rounded-2xl bg-slate-50 p-4"><span className="text-xs uppercase text-slate-500">Bestand</span><b className="mt-1 block text-2xl">{selected.stockQuantity}</b></div><div className="rounded-2xl bg-slate-50 p-4"><span className="text-xs uppercase text-slate-500">Reserviert</span><b className="mt-1 block text-2xl">{selected.reservedQuantity}</b></div><div className="rounded-2xl bg-green-50 p-4"><span className="text-xs uppercase text-green-700">Verfügbar</span><b className="mt-1 block text-2xl text-green-800">{selected.availableQuantity}</b></div></div><h3 className="mt-6 text-lg font-bold">Lagerorte</h3><div className="mt-2 divide-y rounded-2xl border">{selected.warehouseStocks.map((place) => <div key={place.name} className="flex justify-between gap-4 p-4"><span><b className="block">{place.name}</b><small className="text-slate-500">Reserviert: {place.reservedQuantity}</small></span><strong>{place.quantity} Stk.</strong></div>)}{!selected.warehouseStocks.length && <p className="p-4 text-slate-500">Kein Lagerbestand vorhanden.</p>}</div><div className="mt-5 grid gap-2 sm:grid-cols-3">{(["plus", "minus", "set"] as const).map((action) => <button key={action} type="button" disabled={!selected.warehouseStocks.length} onClick={() => setMovement({ action, warehouse: selected.warehouseStocks[0]?.name || "", amount: action === "set" ? selected.warehouseStocks[0]?.quantity || 0 : 1 })} className="rounded-xl border border-[var(--ph-green-dark)] px-4 py-3 font-semibold text-[var(--ph-green-dark)] disabled:opacity-40">{action === "plus" ? "Bestand erhöhen" : action === "minus" ? "Bestand verringern" : "Bestand setzen"}</button>)}</div></div>{movement && <div className="mt-4 rounded-2xl border border-blue-200 bg-blue-50 p-5"><h3 className="text-xl font-bold">{movement.action === "plus" ? "Bestand erhöhen" : movement.action === "minus" ? "Bestand verringern" : "Neue Lagermenge"}</h3><div className="mt-4 grid gap-3 sm:grid-cols-2"><label className="text-sm font-semibold">Lagerort<select value={movement.warehouse} onChange={(event) => setMovement({ ...movement, warehouse: event.target.value })} className="mt-1 w-full rounded-xl border bg-white px-4 py-3">{selected.warehouseStocks.map((place) => <option key={place.name}>{place.name}</option>)}</select></label><label className="text-sm font-semibold">{movement.action === "set" ? "Neuer Bestand" : "Menge"}<input type="number" min={movement.action === "set" ? 0 : 1} value={movement.amount} onChange={(event) => setMovement({ ...movement, amount: Number(event.target.value) })} className="mt-1 w-full rounded-xl border px-4 py-3"/></label></div><p className="mt-3 text-sm text-blue-900">{config.liveWritesEnabled ? "Nach Bestätigung wird verbindlich in Weclapp gebucht." : "Testmodus: Es wird nur das Ergebnis berechnet und nichts in Weclapp gebucht."}</p><div className="mt-4 flex gap-2"><button type="button" onClick={submitMovement} disabled={busy} className="rounded-xl bg-[var(--ph-green-dark)] px-5 py-3 font-semibold text-white disabled:opacity-40">{busy ? "Wird geprüft…" : config.liveWritesEnabled ? "Jetzt buchen" : "Testen"}</button><button type="button" onClick={() => setMovement(null)} className="rounded-xl border px-5 py-3 font-semibold">Abbrechen</button></div></div>}</section>}

    {view === "inventory" && state && <section className="mt-6 grid gap-5 lg:grid-cols-[1fr_1.2fr]"><div className="rounded-2xl border bg-white p-5 shadow-sm"><p className="text-sm font-semibold uppercase text-[var(--ph-gold)]">Gemeinsamer Entwurf</p><h2 className="mt-1 text-2xl text-[var(--ph-green-dark)]">Bestände zählen</h2><p className="mt-2 text-sm text-slate-500">Der Entwurf liegt jetzt im Hub und ist von deinen Arbeitsplätzen aus verfügbar.</p><label className="mt-4 block text-sm font-semibold">Artikel<select value={inventoryArticleId} onChange={(event) => { const article = articles.find((item) => item.id === event.target.value); setInventoryArticleId(event.target.value); setInventoryWarehouse(article?.warehouseStocks[0]?.name || ""); setInventoryCount(article?.warehouseStocks[0]?.quantity || 0); }} className="mt-1 w-full rounded-xl border bg-white px-4 py-3"><option value="">Artikel auswählen…</option>{articles.filter((article) => article.active).map((article) => <option key={article.id} value={article.id}>{article.articleNumber} · {article.name}</option>)}</select></label>{inventoryArticleId && <><label className="mt-3 block text-sm font-semibold">Lagerort<select value={inventoryWarehouse} onChange={(event) => { const article = articles.find((item) => item.id === inventoryArticleId); const place = article?.warehouseStocks.find((item) => item.name === event.target.value); setInventoryWarehouse(event.target.value); setInventoryCount(place?.quantity || 0); }} className="mt-1 w-full rounded-xl border bg-white px-4 py-3">{articles.find((item) => item.id === inventoryArticleId)?.warehouseStocks.map((place) => <option key={place.name}>{place.name}</option>)}</select></label><label className="mt-3 block text-sm font-semibold">Ist-Bestand<input type="number" min={0} value={inventoryCount} onChange={(event) => setInventoryCount(Number(event.target.value))} className="mt-1 w-full rounded-xl border px-4 py-3"/></label><button type="button" onClick={saveInventoryCount} className="mt-4 w-full rounded-xl bg-[var(--ph-green-dark)] px-4 py-3 font-semibold text-white">Zählung speichern</button></>}</div><div className="rounded-2xl border bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><div><h2 className="text-xl text-[var(--ph-green-dark)]">Gezählte Positionen</h2><p className="text-sm text-slate-500">{inventoryEntries.length} gezählt · {inventoryEntries.filter((entry) => entry.count !== entry.stock).length} Abweichungen</p></div><button type="button" disabled={!inventoryEntries.length} onClick={() => persist({ ...state, inventory: { startedAt: Date.now(), counts: {} } })} className="text-sm font-semibold text-red-700 disabled:opacity-30">Zurücksetzen</button></div><div className="mt-3 max-h-[55vh] divide-y overflow-y-auto">{inventoryEntries.map((entry) => <div key={entry.key} className="flex justify-between gap-4 py-3"><span><b className="block">{entry.name}</b><small className="text-slate-500">{entry.articleNumber} · {entry.warehouse}</small></span><span className={entry.count !== entry.stock ? "font-bold text-amber-700" : "font-bold text-green-700"}>{entry.count}<small className="block font-normal text-slate-500">Soll {entry.stock}</small></span></div>)}{!inventoryEntries.length && <p className="py-10 text-center text-slate-500">Noch keine Artikel gezählt.</p>}</div><button type="button" disabled={busy || !inventoryEntries.some((entry) => entry.count !== entry.stock)} onClick={bookInventory} className="mt-4 w-full rounded-xl bg-[var(--ph-green-dark)] px-4 py-3 font-semibold text-white disabled:opacity-40">{config.liveWritesEnabled ? "Abweichungen in Weclapp buchen" : "Abweichungen vollständig simulieren"}</button></div></section>}

    {view === "receipt" && state && <section className="mt-6 grid gap-5 lg:grid-cols-[1fr_1.2fr]"><div className="rounded-2xl border bg-white p-5 shadow-sm"><p className="text-sm font-semibold uppercase text-[var(--ph-gold)]">Gemeinsamer Entwurf</p><h2 className="mt-1 text-2xl text-[var(--ph-green-dark)]">Wareneingang</h2><label className="mt-4 block text-sm font-semibold">Lieferant<input value={state.receipt.supplier} onChange={(event) => setState({ ...state, receipt: { ...state.receipt, supplier: event.target.value } })} onBlur={() => persist(state)} className="mt-1 w-full rounded-xl border px-4 py-3"/></label><label className="mt-3 block text-sm font-semibold">Lieferscheinnummer<input value={state.receipt.deliveryNote} onChange={(event) => setState({ ...state, receipt: { ...state.receipt, deliveryNote: event.target.value } })} onBlur={() => persist(state)} className="mt-1 w-full rounded-xl border px-4 py-3"/></label><label className="mt-3 block text-sm font-semibold">Artikel<select value={receiptArticleId} onChange={(event) => setReceiptArticleId(event.target.value)} className="mt-1 w-full rounded-xl border bg-white px-4 py-3"><option value="">Artikel auswählen…</option>{articles.filter((article) => article.active).map((article) => <option key={article.id} value={article.id}>{article.articleNumber} · {article.name}</option>)}</select></label><label className="mt-3 block text-sm font-semibold">Menge<input type="number" min={1} value={receiptQuantity} onChange={(event) => setReceiptQuantity(Number(event.target.value))} className="mt-1 w-full rounded-xl border px-4 py-3"/></label><button type="button" onClick={addReceiptItem} disabled={!receiptArticleId} className="mt-4 w-full rounded-xl bg-[var(--ph-green-dark)] px-4 py-3 font-semibold text-white disabled:opacity-40">Position speichern</button></div><div className="rounded-2xl border bg-white p-5 shadow-sm"><div className="flex justify-between gap-4"><div><h2 className="text-xl text-[var(--ph-green-dark)]">Erfasste Positionen</h2><p className="text-sm text-slate-500">{receiptItems.length} Positionen · {receiptItems.reduce((sum, item) => sum + item.quantity, 0)} Stück</p></div><button type="button" disabled={!receiptItems.length} onClick={() => persist({ ...state, receipt: { supplier: "", deliveryNote: "", items: {}, startedAt: Date.now() } })} className="text-sm font-semibold text-red-700 disabled:opacity-30">Zurücksetzen</button></div><div className="mt-3 divide-y">{receiptItems.map((item) => <div key={item.weclappId} className="flex justify-between gap-4 py-3"><span><b className="block">{item.name}</b><small className="text-slate-500">{item.articleNumber}</small></span><strong>{item.quantity} Stk.</strong></div>)}{!receiptItems.length && <p className="py-10 text-center text-slate-500">Noch keine Positionen erfasst.</p>}</div><div className="mt-4 rounded-xl bg-amber-50 p-4 text-sm text-amber-900">Wie in der bisherigen Lager-App bleibt der Wareneingang zunächst ein geprüfter Entwurf; es erfolgt noch keine Weclapp-Buchung.</div></div></section>}

    {view === "operations" && <section className="mt-6"><div className="grid gap-3 sm:grid-cols-3"><button type="button" onClick={() => { setOperation("topup"); setOperationResult(null); }} className={actionButton(operation === "topup" ? "border-green-500 bg-green-50" : "bg-white")}><strong>Auftragsbedarf auffüllen</strong><small className="mt-1 block">Offene Mengen prüfen</small></button><button type="button" onClick={() => { setOperation("invoices"); setOperationResult(null); }} className={actionButton(operation === "invoices" ? "border-green-500 bg-green-50" : "bg-white")}><strong>Rechnungen erstellen</strong><small className="mt-1 block">Zeitraum nach Auftragsdatum</small></button><button type="button" onClick={() => { setOperation("reset"); setOperationResult(null); }} className={actionButton(operation === "reset" ? "border-red-400 bg-red-50" : "bg-white")}><strong>Lagerbestand auf 0</strong><small className="mt-1 block">Gesamtes Lager prüfen</small></button></div>{operation && <div className="mt-5 rounded-2xl border bg-white p-5 shadow-sm"><h2 className="text-2xl text-[var(--ph-green-dark)]">{operation === "topup" ? "Bestand für offene Aufträge auffüllen" : operation === "invoices" ? "Aufträge fakturieren" : "Lagerbestand auf 0 setzen"}</h2><p className="mt-2 text-sm text-slate-500">Zuerst wird immer eine aktuelle Vorschau erzeugt. {config.liveWritesEnabled ? "Erst ein weiterer ausdrücklicher Klick führt den Live-Vorgang aus." : "Live-Ausführung ist aktuell serverseitig gesperrt."}</p><div className="mt-4 grid gap-3 sm:grid-cols-2">{operation !== "invoices" ? <label className="text-sm font-semibold">Lager<select value={operationWarehouse} onChange={(event) => setOperationWarehouse(event.target.value)} className="mt-1 w-full rounded-xl border bg-white px-4 py-3">{warehouses.map((warehouse) => <option key={warehouse}>{warehouse}</option>)}</select></label> : <><label className="text-sm font-semibold">Von<input type="date" value={invoiceFrom} onChange={(event) => setInvoiceFrom(event.target.value)} className="mt-1 w-full rounded-xl border px-4 py-3"/></label><label className="text-sm font-semibold">Bis<input type="date" value={invoiceTo} onChange={(event) => setInvoiceTo(event.target.value)} className="mt-1 w-full rounded-xl border px-4 py-3"/></label></>}{operation === "reset" && config.liveWritesEnabled && <label className="text-sm font-semibold">Sechsstelliger Sicherheitscode<input type="password" inputMode="numeric" maxLength={6} value={resetCode} onChange={(event) => setResetCode(event.target.value)} className="mt-1 w-full rounded-xl border px-4 py-3"/></label>}</div><button type="button" onClick={runOperationPreview} disabled={busy || (operation !== "invoices" && !operationWarehouse)} className="mt-4 rounded-xl bg-[var(--ph-green-dark)] px-5 py-3 font-semibold text-white disabled:opacity-40">{busy ? "Vorschau wird geladen…" : "Vorschau laden"}</button>{operationResult && <OperationPreview operation={operation} result={operationResult} live={config.liveWritesEnabled} busy={busy} execute={executeOperation}/>}</div>}
      <div className="mt-5 rounded-2xl border border-blue-200 bg-blue-50 p-5"><h2 className="text-lg font-bold text-blue-950">Daten der alten Lager-App übernehmen</h2><p className="mt-1 text-sm text-blue-900">Bestände kommen bereits live aus Weclapp. Eine Exportdatei der alten App übernimmt zusätzlich angefangene Inventuren, Wareneingänge und die Filtereinstellung.</p><div className="mt-3 flex flex-wrap gap-2"><a href="https://app.palmenheld.de/migration-export.html" target="_blank" rel="noreferrer" className="rounded-xl bg-blue-900 px-4 py-2.5 font-semibold text-white">1. Altdaten exportieren</a><input ref={migrationInput} type="file" accept="application/json,.json" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importMigration(file); }}/><button type="button" onClick={() => migrationInput.current?.click()} disabled={busy} className="rounded-xl border border-blue-400 bg-white px-4 py-2.5 font-semibold text-blue-900">2. Altdaten-Datei importieren</button></div>{state?.migratedAt && <p className="mt-2 text-xs text-blue-800">Zuletzt übernommen: {new Date(state.migratedAt).toLocaleString("de-DE")} · {state.migratedFrom}</p>}</div>
    </section>}
  </div>;
}

function Scanner({ articles, onFound, onBack }: { articles: WarehouseArticle[]; onFound: (article: WarehouseArticle) => void; onBack: () => void }) {
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("Kamera wird gestartet…");
  const video = useRef<HTMLVideoElement>(null);

  function find(value: string) {
    const normalized = value.replace(/\s/gu, "");
    const article = articles.find((item) => item.articleNumber.replace(/\s/gu, "") === normalized || item.barcode.replace(/\s/gu, "") === normalized);
    if (article) { onFound(article); return true; }
    setMessage(`Code ${value} ist keinem Artikel zugeordnet.`); return false;
  }

  useEffect(() => {
    let stream: MediaStream | undefined;
    let timer: number | undefined;
    const detectorClass = (window as unknown as { BarcodeDetector?: new (options: { formats: string[] }) => { detect: (source: HTMLVideoElement) => Promise<Array<{ rawValue: string }>> } }).BarcodeDetector;
    async function start() {
      if (!detectorClass || !navigator.mediaDevices?.getUserMedia || !video.current) { setMessage("Kamera-Scan wird auf diesem Gerät nicht unterstützt. Bitte Code eingeben."); return; }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
        video.current.srcObject = stream; await video.current.play(); setMessage("Barcode in den Rahmen halten.");
        const detector = new detectorClass({ formats: ["ean_13", "ean_8", "code_128", "qr_code"] });
        let active = false;
        timer = window.setInterval(async () => { if (active || !video.current || video.current.readyState < 2) return; active = true; try { const values = await detector.detect(video.current); if (values[0]) find(values[0].rawValue); } finally { active = false; } }, 400);
      } catch { setMessage("Kamerazugriff nicht möglich. Bitte Berechtigung erlauben oder Code eingeben."); }
    }
    void start();
    return () => { if (timer) window.clearInterval(timer); stream?.getTracks().forEach((track) => track.stop()); };
    // Scanner is intentionally initialized once for this view.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <section className="mx-auto mt-6 max-w-2xl rounded-3xl border bg-slate-950 p-5 text-white shadow-lg"><button type="button" onClick={onBack} className="rounded-xl border border-slate-600 px-3 py-2 text-sm">← Zurück</button><div className="relative mt-4 aspect-[4/3] overflow-hidden rounded-2xl bg-black"><video ref={video} playsInline muted className="h-full w-full object-cover"/><div className="pointer-events-none absolute inset-10 rounded-2xl border-2 border-green-400"/><div className="pointer-events-none absolute left-12 right-12 top-1/2 h-0.5 bg-red-500"/></div><h2 className="mt-4 text-2xl">Barcode scannen</h2><p className="mt-1 text-sm text-slate-300">{message}</p><form onSubmit={(event) => { event.preventDefault(); find(code); }} className="mt-4 flex gap-2"><input value={code} onChange={(event) => setCode(event.target.value)} placeholder="EAN oder Artikelnummer" className="min-w-0 flex-1 rounded-xl border border-slate-600 bg-slate-900 px-4 py-3"/><button type="submit" className="rounded-xl bg-green-700 px-4 py-3 font-semibold">Suchen</button></form></section>;
}

function OperationPreview({ operation, result, live, busy, execute }: { operation: Exclude<Operation, null>; result: Record<string, unknown>; live: boolean; busy: boolean; execute: () => void }) {
  const rows = (Array.isArray(result.rows) ? result.rows : Array.isArray(result.sample) ? result.sample : []) as Array<Record<string, unknown>>;
  return <div className={`mt-5 rounded-2xl border p-5 ${operation === "reset" ? "border-red-200 bg-red-50" : "border-amber-200 bg-amber-50"}`}><p className="text-xs font-bold uppercase tracking-wide">{live ? "Letzte Prüfung · Live" : "Simulation · keine Buchung"}</p><h3 className="mt-1 text-xl font-bold">{operation === "topup" ? `${result.affectedArticles || 0} Artikel · +${result.totalIncrease || 0} Stück` : operation === "invoices" ? `${result.affectedOrders || 0} Rechnungen` : `${result.affectedPositions || 0} Positionen · ${result.totalQuantity || 0} Stück`}</h3>{rows.length > 0 && <div className="mt-3 max-h-80 divide-y overflow-y-auto rounded-xl bg-white/80 px-4">{rows.slice(0, 100).map((row, index) => <div key={index} className="flex justify-between gap-4 py-3 text-sm"><span><b className="block">{String(row.articleNumber || row.orderNumber || "Position")}</b><small>{String(row.name || row.orderDateLabel || row.place || "")}</small></span><strong>{operation === "topup" ? `+${row.increase}` : ""}</strong></div>)}</div>}{live ? <button type="button" onClick={execute} disabled={busy || (operation === "topup" && Number(result.unbookableArticles) > 0)} className={`mt-4 rounded-xl px-5 py-3 font-semibold text-white disabled:opacity-40 ${operation === "reset" ? "bg-red-700" : "bg-[var(--ph-green-dark)]"}`}>{busy ? "Wird ausgeführt…" : operation === "reset" ? "Jetzt endgültig auf 0 setzen" : operation === "invoices" ? "Rechnungen jetzt erstellen" : "Bestand jetzt auffüllen"}</button> : <p className="mt-4 rounded-xl bg-blue-50 p-3 text-sm text-blue-900">Die Vorschau ist vollständig. Live-Ausführung bleibt gesperrt, bis sie serverseitig bewusst aktiviert wird.</p>}</div>;
}
