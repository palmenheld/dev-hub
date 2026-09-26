"use client";

import Image from "next/image";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import type { PosArticle, PosCustomer, PosPaymentMethod, PosQuote, PosReceipt } from "@/types/pos";

type Bootstrap = {
  registerName: string;
  locationName: string;
  salesChannel: string;
  paymentMethods: PosPaymentMethod[];
  liveWritesEnabled: boolean;
  checkoutPinConfigured: boolean;
};

type CartLine = { article: PosArticle; quantity: number };

const euro = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });

async function readJson(response: Response) {
  const result = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) throw new Error(String(result.error || "Die Anfrage ist fehlgeschlagen."));
  return result;
}

export default function PosRegister() {
  const [bootstrap, setBootstrap] = useState<Bootstrap | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PosArticle[]>([]);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [quote, setQuote] = useState<PosQuote | null>(null);
  const [customerQuery, setCustomerQuery] = useState("");
  const [customers, setCustomers] = useState<PosCustomer[]>([]);
  const [customer, setCustomer] = useState<PosCustomer | null>(null);
  const [paymentId, setPaymentId] = useState<number | null>(null);
  const [amountTendered, setAmountTendered] = useState("");
  const [pin, setPin] = useState("");
  const [consent, setConsent] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [receipt, setReceipt] = useState<PosReceipt | null>(null);
  const [receiptUrl, setReceiptUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [quoteBusy, setQuoteBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());

  useEffect(() => {
    void fetch("/api/pos/bootstrap", { cache: "no-store" }).then(readJson)
      .then((data) => {
        const value = data as unknown as Bootstrap;
        setBootstrap(value);
        setPaymentId(value.paymentMethods[0]?.id || null);
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : "POS ist nicht erreichbar."));
  }, []);

  const cartInput = useMemo(() => cart.map(({ article, quantity }) => ({
    articleId: article.id,
    articleNumber: article.articleNumber,
    quantity,
  })), [cart]);

  const refreshQuote = useCallback(async (items: typeof cartInput, customerId?: string) => {
    if (!items.length) {
      setQuote(null);
      return;
    }
    setQuoteBusy(true);
    try {
      const data = await readJson(await fetch("/api/pos/quote", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ items, customerId }),
      }));
      setQuote(data.quote as PosQuote);
      setError("");
    } catch (reason) {
      setQuote(null);
      setError(reason instanceof Error ? reason.message : "Der Warenkorb konnte nicht berechnet werden.");
    } finally {
      setQuoteBusy(false);
    }
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => void refreshQuote(cartInput, customer?.id), 250);
    return () => window.clearTimeout(timeout);
  }, [cartInput, customer?.id, refreshQuote]);

  async function searchArticles(event: FormEvent) {
    event.preventDefault();
    if (query.trim().length < 3) return setError("Bitte mindestens 3 Zeichen, eine Artikelnummer oder EAN eingeben.");
    setBusy(true);
    setError("");
    try {
      const params = new URLSearchParams({ query: query.trim() });
      if (customer) params.set("customerId", customer.id);
      const data = await readJson(await fetch(`/api/pos/articles?${params}`, { cache: "no-store" }));
      const articles = data.articles as PosArticle[];
      setResults(articles);
      if (!articles.length) setNotice("Kein passender aktiver POS-Artikel gefunden.");
      else setNotice(`${articles.length} Treffer`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Artikelsuche fehlgeschlagen.");
    } finally {
      setBusy(false);
    }
  }

  function addArticle(article: PosArticle) {
    setCart((current) => {
      const found = current.find((line) => line.article.id === article.id);
      return found
        ? current.map((line) => line.article.id === article.id ? { ...line, quantity: line.quantity + 1 } : line)
        : [...current, { article, quantity: 1 }];
    });
    setQuery("");
    setResults([]);
    setNotice(`${article.name} wurde hinzugefügt.`);
  }

  function changeQuantity(articleId: string, quantity: number) {
    if (!Number.isFinite(quantity) || quantity <= 0) {
      setCart((current) => current.filter((line) => line.article.id !== articleId));
      return;
    }
    setCart((current) => current.map((line) => line.article.id === articleId ? { ...line, quantity: Math.min(999, quantity) } : line));
  }

  async function searchCustomers(event: FormEvent) {
    event.preventDefault();
    if (customerQuery.trim().length < 4) return setError("Für die Kundensuche bitte mindestens 4 Zeichen eingeben.");
    setBusy(true);
    try {
      const data = await readJson(await fetch(`/api/pos/customers?query=${encodeURIComponent(customerQuery.trim())}`, { cache: "no-store" }));
      setCustomers(data.customers as PosCustomer[]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Kundensuche fehlgeschlagen.");
    } finally {
      setBusy(false);
    }
  }

  const payment = bootstrap?.paymentMethods.find((method) => method.id === paymentId);
  const total = quote?.total || 0;

  const tenderedValue = payment && !payment.isCash ? total.toFixed(2) : amountTendered;

  function openConfirmation() {
    if (!quote || quoteBusy || !cart.length) return setError("Der Warenkorb ist noch nicht vollständig geprüft.");
    if (!payment) return setError("Bitte eine Zahlart wählen.");
    const tendered = Number(tenderedValue.replace(",", "."));
    if (!Number.isFinite(tendered) || tendered < total) return setError("Bitte einen gültigen Zahlbetrag eingeben.");
    setError("");
    setConfirming(true);
  }

  async function checkout() {
    if (!quote || !payment) return;
    setBusy(true);
    setError("");
    try {
      const data = await readJson(await fetch("/api/pos/checkout", {
        method: "POST",
        headers: { "content-type": "application/json", "x-palmenheld-pos-pin": pin },
        body: JSON.stringify({
          items: cartInput,
          customerId: customer?.id,
          paymentMethodId: payment.id,
          amountTendered: Number(tenderedValue.replace(",", ".")),
          idempotencyKey,
          digitalReceiptConsent: consent,
        }),
      }));
      setReceipt(data.receipt as PosReceipt);
      setReceiptUrl(String(data.receiptUrl || ""));
      setConfirming(false);
      setNotice("Verkauf erfolgreich abgeschlossen.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Der Verkauf konnte nicht abgeschlossen werden.");
    } finally {
      setBusy(false);
    }
  }

  function newSale() {
    setCart([]);
    setQuote(null);
    setCustomer(null);
    setCustomerQuery("");
    setCustomers([]);
    setResults([]);
    setAmountTendered("");
    setPin("");
    setConsent(false);
    setReceipt(null);
    setReceiptUrl("");
    setIdempotencyKey(crypto.randomUUID());
    setNotice("");
    setError("");
  }

  if (receipt) {
    return (
      <Card className="mx-auto max-w-3xl p-5 sm:p-8">
        <div className="text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-3xl text-emerald-800">✓</div>
          <h2 className="mt-4 text-2xl text-[var(--ph-green-dark)]">Verkauf abgeschlossen</h2>
          <p className="mt-1 text-slate-600">Beleg {receipt.saleId} · {euro.format(receipt.total)}</p>
          <Image
            src={`/api/pos/receipts/${receipt.token}/qr`}
            alt="QR-Code zum digitalen Kassenbon"
            width={280}
            height={280}
            unoptimized
            className="mx-auto mt-5 rounded-2xl border bg-white p-3"
          />
          <p className="mx-auto mt-3 max-w-md text-sm text-slate-600">Der Kunde kann den QR-Code jetzt scannen und den digitalen Originalbeleg öffnen.</p>
          {receipt.change > 0 && <div className="mt-5 text-2xl font-bold text-[var(--ph-green-dark)]">Rückgeld: {euro.format(receipt.change)}</div>}
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <a href={receiptUrl} target="_blank" rel="noreferrer" className="rounded-xl border px-5 py-3 font-semibold text-[var(--ph-green-dark)]">Bon öffnen</a>
            {receipt.pdfAvailable && <a href={`/api/pos/receipts/${receipt.token}/pdf`} target="_blank" rel="noreferrer" className="rounded-xl border px-5 py-3 font-semibold text-[var(--ph-green-dark)]">PDF öffnen</a>}
            <Button onClick={newSale}>Nächster Verkauf</Button>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(22rem,.65fr)]">
      <div className="space-y-5">
        <Card className="p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-xl text-[var(--ph-green-dark)]">Artikel scannen oder suchen</h2>
              <p className="mt-1 text-sm text-slate-500">Artikelnummer, EAN oder mindestens drei Zeichen des Namens</p>
            </div>
            {bootstrap && <div className="rounded-xl bg-[var(--ph-green-light)] px-3 py-2 text-xs text-[var(--ph-green-dark)]">{bootstrap.locationName} · {bootstrap.registerName} · {bootstrap.salesChannel}</div>}
          </div>
          <form onSubmit={searchArticles} className="mt-4 flex gap-2">
            <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Scannen oder suchen …" className="min-w-0 flex-1 rounded-xl border border-slate-300 px-4 py-3 text-lg outline-none focus:border-[var(--ph-green)]" />
            <Button disabled={busy}>Suchen</Button>
          </form>
          {results.length > 0 && (
            <div className="mt-4 divide-y rounded-xl border">
              {results.map((article) => (
                <button key={article.id} type="button" onClick={() => addArticle(article)} className="flex w-full items-center justify-between gap-4 p-4 text-left hover:bg-slate-50">
                  <span><span className="block font-semibold text-slate-900">{article.name}</span><span className="text-sm text-slate-500">{article.articleNumber} · Bestand {article.stock}</span></span>
                  <span className="shrink-0 font-bold text-[var(--ph-green-dark)]">{euro.format(article.price)}</span>
                </button>
              ))}
            </div>
          )}
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between gap-3">
            <div><h2 className="text-xl text-[var(--ph-green-dark)]">Kunde <span className="text-sm font-normal text-slate-400">optional</span></h2><p className="text-sm text-slate-500">Ohne Auswahl wird als Laufkunde kassiert.</p></div>
            {customer && <button type="button" className="text-sm text-red-700" onClick={() => setCustomer(null)}>Entfernen</button>}
          </div>
          {customer ? (
            <div className="mt-4 rounded-xl bg-[var(--ph-green-light)] p-4"><strong>{customer.displayName}</strong><div className="text-sm text-slate-600">Kundennummer {customer.customerNumber}</div></div>
          ) : (
            <>
              <form onSubmit={searchCustomers} className="mt-4 flex gap-2">
                <input value={customerQuery} onChange={(event) => setCustomerQuery(event.target.value)} placeholder="Name oder Kundennummer" className="min-w-0 flex-1 rounded-xl border border-slate-300 px-4 py-3" />
                <Button variant="secondary" disabled={busy}>Suchen</Button>
              </form>
              {customers.length > 0 && <div className="mt-3 divide-y rounded-xl border">{customers.map((entry) => (
                <button key={entry.id} type="button" disabled={entry.blocked} onClick={() => { setCustomer(entry); setCustomers([]); }} className="flex w-full justify-between p-3 text-left disabled:bg-red-50 disabled:text-red-700">
                  <span>{entry.displayName} <small className="text-slate-500">({entry.customerNumber})</small></span><span>{entry.blocked ? "Gesperrt" : "Auswählen"}</span>
                </button>
              ))}</div>}
            </>
          )}
        </Card>

        {(error || notice) && <div role="status" className={`rounded-xl border p-4 text-sm ${error ? "border-red-200 bg-red-50 text-red-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>{error || notice}</div>}
      </div>

      <Card className="h-fit overflow-hidden xl:sticky xl:top-6">
        <div className="border-b bg-[var(--ph-green-dark)] p-5 text-white"><h2 className="text-xl">Warenkorb</h2><p className="text-sm text-white/70">{cart.length} Position{cart.length === 1 ? "" : "en"}</p></div>
        <div className="divide-y">
          {!cart.length && <div className="p-8 text-center text-slate-500">Noch keine Artikel im Warenkorb.</div>}
          {cart.map(({ article, quantity }) => (
            <div key={article.id} className="p-4">
              <div className="font-semibold">{article.name}</div><div className="text-xs text-slate-500">{article.articleNumber}</div>
              <div className="mt-3 flex items-center justify-between gap-3">
                <div className="flex items-center rounded-xl border">
                  <button type="button" onClick={() => changeQuantity(article.id, quantity - 1)} className="h-10 w-10 text-xl">−</button>
                  <input aria-label={`Menge ${article.name}`} type="number" min="0.001" max="999" step="1" value={quantity} onChange={(event) => changeQuantity(article.id, Number(event.target.value))} className="h-10 w-16 border-x text-center" />
                  <button type="button" onClick={() => changeQuantity(article.id, quantity + 1)} className="h-10 w-10 text-xl">+</button>
                </div>
                <strong>{euro.format(quote?.lines.find((line) => line.id === article.id)?.lineTotal ?? article.price * quantity)}</strong>
              </div>
            </div>
          ))}
        </div>
        <div className="border-t bg-slate-50 p-5">
          <div className="flex items-center justify-between text-2xl font-bold text-[var(--ph-green-dark)]"><span>Gesamt</span><span>{quoteBusy ? "…" : euro.format(total)}</span></div>
          <div className="mt-5 grid gap-3">
            <label className="text-sm font-semibold">Zahlart<select value={paymentId || ""} onChange={(event) => setPaymentId(Number(event.target.value))} className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-3 font-normal">
              <option value="">Bitte wählen</option>{bootstrap?.paymentMethods.filter((method) => !method.isInvoice && !/sumup/i.test(method.name)).map((method) => <option key={method.id} value={method.id}>{method.name}</option>)}
            </select></label>
            <label className="text-sm font-semibold">{payment?.isCash ? "Erhaltener Betrag" : "Zahlbetrag"}<input inputMode="decimal" value={tenderedValue} readOnly={Boolean(payment && !payment.isCash)} onChange={(event) => setAmountTendered(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-lg font-normal" placeholder="0,00" /></label>
            {payment?.isCash && Number(tenderedValue.replace(",", ".")) >= total && total > 0 && <div className="rounded-xl bg-[var(--ph-gold-light)] p-3 font-semibold">Rückgeld: {euro.format(Number(tenderedValue.replace(",", ".")) - total)}</div>}
            {bootstrap && (!bootstrap.liveWritesEnabled || !bootstrap.checkoutPinConfigured) && <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">Die Kassenoberfläche ist bereit, der Live-Abschluss aber serverseitig noch gesperrt.</div>}
            <Button onClick={openConfirmation} disabled={!cart.length || !quote || quoteBusy || !bootstrap?.liveWritesEnabled || !bootstrap?.checkoutPinConfigured}>Zahlung prüfen</Button>
          </div>
        </div>
      </Card>

      {confirming && quote && payment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div role="dialog" aria-modal="true" aria-labelledby="checkout-title" className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
            <h2 id="checkout-title" className="text-2xl text-[var(--ph-green-dark)]">Verkauf verbindlich abschließen?</h2>
            <p className="mt-2 text-slate-600">Jetzt wird ein echter Verkauf über {euro.format(total)} in weclappPOS gebucht. Zahlart: {payment.name}.</p>
            <label className="mt-5 flex items-start gap-3 rounded-xl border p-4 text-sm"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} className="mt-1 h-5 w-5" /><span>Der Kunde stimmt dem elektronischen Kassenbon per QR-Code zu. Ohne Zustimmung bitte den Verkauf direkt in POS mit Papierbon durchführen.</span></label>
            <label className="mt-4 block text-sm font-semibold">Sechsstellige Kassen-PIN<input type="password" inputMode="numeric" autoComplete="off" maxLength={6} value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 6))} className="mt-1 w-full rounded-xl border border-slate-300 px-4 py-3 text-center text-2xl tracking-[.45em]" /></label>
            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><Button variant="secondary" onClick={() => setConfirming(false)} disabled={busy}>Abbrechen</Button><Button onClick={() => void checkout()} disabled={busy || pin.length !== 6 || !consent}>{busy ? "Wird gebucht …" : "Jetzt verbindlich kassieren"}</Button></div>
          </div>
        </div>
      )}
    </div>
  );
}
