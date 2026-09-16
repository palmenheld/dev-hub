"use client";

import { useMemo, useState } from "react";
import { emptyJsonPost } from "@/lib/http";
import {
  OrderImportCorrection,
  OrderImportPlan,
  ShopwareOrderCandidate,
} from "@/types/shopwareOrders";

const STATE_LABELS = {
  pending: "Prüfbereit",
  approved: "Freigegeben",
  applied: "Angelegt",
  blocked: "Blockiert",
  failed: "Fehlgeschlagen",
  reconciliation_required: "Ergebnis prüfen",
} as const;

const CORRECTION_FIELDS: Array<{
  key: keyof OrderImportCorrection;
  label: string;
}> = [
  { key: "customerId", label: "weclapp-Kunden-ID" },
  { key: "recordCurrencyId", label: "weclapp-Währungs-ID" },
  { key: "salesChannel", label: "weclapp-Verkaufskanal" },
  { key: "paymentMethodId", label: "weclapp-Zahlungsart-ID" },
  { key: "shipmentMethodId", label: "weclapp-Versandart-ID" },
  { key: "warehouseId", label: "weclapp-Lager-ID" },
  { key: "note", label: "Interne Auftragsnotiz" },
];

function money(value: number, currency: string) {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: currency || "EUR",
  }).format(value);
}

export default function ShopwareOrderImporter({
  enabled,
}: {
  enabled: boolean;
}) {
  const [orders, setOrders] = useState<ShopwareOrderCandidate[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [plan, setPlan] = useState<OrderImportPlan | null>(null);
  const [working, setWorking] = useState("");
  const [feedback, setFeedback] = useState("");

  const selectedSet = useMemo(() => new Set(selected), [selected]);

  async function loadOrders() {
    setWorking("load");
    setFeedback("");
    setPlan(null);
    try {
      const response = await fetch("/api/channels/shopware/sync/orders", emptyJsonPost());
      const payload = (await response.json()) as {
        orders?: ShopwareOrderCandidate[];
        error?: string;
      };
      if (!response.ok || !payload.orders) {
        throw new Error(payload.error || "Bestellungen konnten nicht geladen werden.");
      }
      setOrders(payload.orders);
      setSelected([]);
      setFeedback(
        payload.orders.length
          ? "Nur die markierten Bestellungen werden in einer Vorschau geprüft."
          : "Für Status und Sicherheitszeitraum wurden keine Bestellungen gefunden."
      );
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Unbekannter Fehler");
    } finally {
      setWorking("");
    }
  }

  async function createPreview() {
    if (!selected.length) return;
    setWorking("preview");
    setFeedback("");
    try {
      const response = await fetch(
        "/api/channels/shopware/sync/order-plans",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderIds: selected }),
        }
      );
      const payload = (await response.json()) as {
        plan?: OrderImportPlan;
        error?: string;
      };
      if (!response.ok || !payload.plan) {
        throw new Error(payload.error || "Vorschau konnte nicht erstellt werden.");
      }
      setPlan(payload.plan);
      setFeedback(
        "Vorschau erstellt. Es wurde noch keine Bestellung in weclapp angelegt."
      );
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Unbekannter Fehler");
    } finally {
      setWorking("");
    }
  }

  async function correct(
    itemId: string,
    field: keyof OrderImportCorrection,
    value: string
  ) {
    if (!plan) return;
    setWorking(`correct:${itemId}:${field}`);
    setFeedback("");
    try {
      const response = await fetch(
        `/api/channels/shopware/sync/order-plans/${plan.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ itemId, field, value }),
        }
      );
      const payload = (await response.json()) as {
        plan?: OrderImportPlan;
        error?: string;
      };
      if (!response.ok || !payload.plan) {
        throw new Error(payload.error || "Korrektur konnte nicht gespeichert werden.");
      }
      setPlan(payload.plan);
      setFeedback("Korrektur nur in der Vorschau gespeichert.");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Unbekannter Fehler");
    } finally {
      setWorking("");
    }
  }

  async function transition(action: "approve" | "apply") {
    if (!plan) return;
    if (
      action === "apply" &&
      !window.confirm(
        "Die freigegebenen Bestellungen werden jetzt einzeln in weclapp angelegt. Wirklich fortfahren?"
      )
    ) {
      return;
    }
    setWorking(action);
    setFeedback("");
    try {
      const response = await fetch(
        `/api/channels/shopware/sync/order-plans/${plan.id}/${action}`,
        emptyJsonPost()
      );
      const payload = (await response.json()) as {
        plan?: OrderImportPlan;
        error?: string;
      };
      if (!response.ok || !payload.plan) {
        throw new Error(payload.error || "Aktion konnte nicht ausgeführt werden.");
      }
      setPlan(payload.plan);
      setFeedback(
        action === "approve"
          ? "Bestellungen freigegeben. Es wurde noch nichts in weclapp angelegt."
          : payload.plan.state === "completed"
            ? "Die freigegebenen Bestellungen wurden kontrolliert angelegt."
            : "Der Lauf ist beendet. Mindestens eine Bestellung benötigt Aufmerksamkeit."
      );
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Unbekannter Fehler");
    } finally {
      setWorking("");
    }
  }

  const pendingCount =
    plan?.items.filter((item) => item.state === "pending").length ?? 0;
  const approvedCount =
    plan?.items.filter((item) => item.state === "approved").length ?? 0;

  return (
    <details className="border-b p-5" open>
      <summary className="cursor-pointer text-lg font-bold text-[var(--ph-green-dark)]">
        Bestellungen kontrolliert nach weclapp übernehmen
      </summary>
      <p className="mt-2 max-w-4xl text-sm text-slate-500">
        Laden, markieren, prüfen, bei Bedarf korrigieren und erst danach
        freigeben. Unklare Kunden, Artikel, Summen oder Dubletten werden blockiert.
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={loadOrders}
          disabled={!enabled || working !== ""}
          className="rounded-xl border px-4 py-2.5 text-sm font-bold disabled:opacity-40"
        >
          {working === "load" ? "Bestellungen werden geladen…" : "Bestellungen laden"}
        </button>
        <button
          type="button"
          onClick={createPreview}
          disabled={!enabled || !selected.length || working !== ""}
          className="rounded-xl bg-violet-900 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-40"
        >
          {working === "preview"
            ? "Vorschau wird geprüft…"
            : `${selected.length} Auswahl prüfen`}
        </button>
      </div>
      {!enabled && (
        <p className="mt-3 text-sm font-semibold text-amber-700">
          Verbindung testen, Bestellstatus auswählen, Einstellungen speichern
          und den Bestellprozess als eingerichtet markieren.
        </p>
      )}
      {feedback && (
        <p className="mt-3 rounded-lg bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-900">
          {feedback}
        </p>
      )}

      {orders.length > 0 && (
        <div className="mt-4 overflow-x-auto rounded-xl border">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2">
                  <input
                    type="checkbox"
                    aria-label="Alle Bestellungen markieren"
                    checked={selected.length === orders.length}
                    onChange={(event) =>
                      setSelected(
                        event.target.checked ? orders.map((order) => order.id) : []
                      )
                    }
                  />
                </th>
                <th className="px-3 py-2">Bestellung</th>
                <th className="px-3 py-2">Kunde</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Summe</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {orders.map((order) => (
                <tr key={order.id}>
                  <td className="px-3 py-3">
                    <input
                      type="checkbox"
                      aria-label={`Bestellung ${order.orderNumber} markieren`}
                      checked={selectedSet.has(order.id)}
                      onChange={(event) =>
                        setSelected((current) =>
                          event.target.checked
                            ? [...current, order.id]
                            : current.filter((id) => id !== order.id)
                        )
                      }
                    />
                  </td>
                  <td className="px-3 py-3">
                    <strong>{order.orderNumber}</strong>
                    <small className="block text-slate-400">
                      {new Date(order.orderDateTime).toLocaleString("de-DE")} ·{" "}
                      {order.lines.length} Positionen
                    </small>
                  </td>
                  <td className="px-3 py-3">
                    {order.customer.company ||
                      `${order.customer.firstName} ${order.customer.lastName}`}
                    <small className="block text-slate-400">
                      {order.customer.email}
                    </small>
                  </td>
                  <td className="px-3 py-3">{order.stateName}</td>
                  <td className="px-3 py-3 font-semibold">
                    {money(order.amountTotal, order.currencyCode)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {plan && (
        <section className="mt-5 rounded-2xl border border-violet-200 bg-violet-50 p-4">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div>
              <p className="text-xs font-bold uppercase text-violet-600">
                Bestellvorschau
              </p>
              <h4 className="text-lg font-bold text-violet-950">
                {plan.items.length} ausgewählte Bestellungen
              </h4>
            </div>
            <span className="rounded-full bg-white px-3 py-1 text-xs font-bold">
              {plan.state === "draft"
                ? "Nicht freigegeben"
                : plan.state === "approved"
                  ? "Freigegeben"
                  : plan.state === "completed"
                    ? "Abgeschlossen"
                    : plan.state === "partially_failed"
                      ? "Aufmerksamkeit nötig"
                      : "Wird verarbeitet"}
            </span>
          </div>

          <div className="mt-4 space-y-3">
            {plan.items.map((item) => (
              <article key={item.id} className="rounded-xl border bg-white p-4">
                <div className="flex flex-col justify-between gap-2 md:flex-row">
                  <div>
                    <h5 className="font-bold">
                      Bestellung {item.shopwareOrder.orderNumber}
                    </h5>
                    <p className="text-xs text-slate-500">
                      {item.lines.length} Positionen · Ziel weclapp ·{" "}
                      {STATE_LABELS[item.state]}
                    </p>
                  </div>
                  {item.weclappOrderId && (
                    <p className="text-sm font-bold text-green-700">
                      weclapp {item.weclappOrderNumber || item.weclappOrderId}
                    </p>
                  )}
                </div>

                {item.errors.map((error) => (
                  <p
                    key={error}
                    className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-700"
                  >
                    {error}
                  </p>
                ))}
                {item.warnings.map((warning) => (
                  <p
                    key={warning}
                    className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900"
                  >
                    {warning}
                  </p>
                ))}

                <div className="mt-3 grid gap-2 lg:grid-cols-2">
                  {item.lines.map((line) => (
                    <div
                      key={line.id}
                      className={`rounded-lg border px-3 py-2 text-xs ${
                        line.error ? "border-red-200 bg-red-50" : "bg-slate-50"
                      }`}
                    >
                      <strong>{line.label}</strong>
                      <span className="ml-2 text-slate-500">
                        {line.quantity} ×{" "}
                        {money(line.unitPrice, item.shopwareOrder.currencyCode)}
                      </span>
                      <small className="block text-slate-400">
                        {line.productNumber || "Manuelle Shopware-Position"}
                        {line.weclappArticleId ? " · weclapp zugeordnet" : ""}
                      </small>
                    </div>
                  ))}
                </div>

                {plan.state === "draft" && item.state === "pending" && (
                  <details className="mt-3 rounded-lg border p-3">
                    <summary className="cursor-pointer text-sm font-bold">
                      Automatische Werte prüfen oder korrigieren
                    </summary>
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      {CORRECTION_FIELDS.map(({ key, label }) => (
                        <label key={key} className="text-xs font-bold text-slate-600">
                          {label}
                          <input
                            defaultValue={item.correction[key] ?? ""}
                            maxLength={key === "note" ? 512 : 100}
                            disabled={working !== ""}
                            onBlur={(event) => {
                              if (
                                event.target.value !==
                                String(item.correction[key] ?? "")
                              ) {
                                void correct(item.id, key, event.target.value);
                              }
                            }}
                            className="mt-1 block w-full rounded-lg border px-3 py-2 text-sm font-normal"
                          />
                        </label>
                      ))}
                    </div>
                  </details>
                )}
              </article>
            ))}
          </div>

          <div className="mt-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <p className="text-xs text-violet-800">
              Vor jedem Anlegen werden Shopware-Fingerabdruck und weclapp-Dublette
              erneut geprüft.
            </p>
            {plan.state === "draft" ? (
              <button
                type="button"
                onClick={() => transition("approve")}
                disabled={!pendingCount || working !== ""}
                className="rounded-xl bg-violet-900 px-5 py-3 text-sm font-bold text-white disabled:opacity-40"
              >
                {working === "approve"
                  ? "Freigabe läuft…"
                  : `${pendingCount} Bestellungen freigeben`}
              </button>
            ) : plan.state === "approved" ? (
              <button
                type="button"
                onClick={() => transition("apply")}
                disabled={!approvedCount || working !== ""}
                className="rounded-xl bg-[var(--ph-gold)] px-5 py-3 text-sm font-bold text-slate-950 disabled:opacity-40"
              >
                {working === "apply"
                  ? "Import läuft…"
                  : `${approvedCount} jetzt in weclapp anlegen`}
              </button>
            ) : null}
          </div>
        </section>
      )}
    </details>
  );
}
