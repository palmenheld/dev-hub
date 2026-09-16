"use client";

import { useState } from "react";
import { SyncAuditEntry, SyncPlan } from "@/types/shopwareSync";
import { OrderImportPlan } from "@/types/shopwareOrders";

const PROCESS_LABELS: Record<string, string> = {
  prices: "Preise",
  stock: "Bestand",
  products: "Artikel",
  orders: "Bestellungen",
  deliveries: "Lieferungen",
  cancellations: "Stornierungen",
  status: "Status",
};

export default function ShopwareSyncHistory() {
  const [plans, setPlans] = useState<SyncPlan[]>([]);
  const [audit, setAudit] = useState<SyncAuditEntry[]>([]);
  const [orderPlans, setOrderPlans] = useState<OrderImportPlan[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [syncResponse, orderResponse] = await Promise.all([
        fetch("/api/channels/shopware/sync/plans", { cache: "no-store" }),
        fetch("/api/channels/shopware/sync/order-plans", { cache: "no-store" }),
      ]);
      const syncPayload = (await syncResponse.json()) as {
        plans?: SyncPlan[];
        audit?: SyncAuditEntry[];
        error?: string;
      };
      const orderPayload = (await orderResponse.json()) as {
        plans?: OrderImportPlan[];
        error?: string;
      };
      if (!syncResponse.ok || !syncPayload.plans || !syncPayload.audit) {
        throw new Error(
          syncPayload.error || "Sync-Verlauf konnte nicht geladen werden."
        );
      }
      if (!orderResponse.ok || !orderPayload.plans) {
        throw new Error(
          orderPayload.error || "Bestellverlauf konnte nicht geladen werden."
        );
      }
      setPlans(syncPayload.plans);
      setAudit(syncPayload.audit);
      setOrderPlans(orderPayload.plans);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unbekannter Fehler");
    } finally {
      setLoading(false);
    }
  }

  return (
    <details className="border-b p-5">
      <summary className="cursor-pointer text-lg font-bold text-[var(--ph-green-dark)]">
        Laufprotokoll & Fehlerhistorie
      </summary>
      <p className="mt-2 text-sm text-slate-500">
        Vorschauen, manuelle Korrekturen, Freigaben und einzelne
        Übertragungsergebnisse bleiben nachvollziehbar.
      </p>
      <button
        type="button"
        onClick={load}
        disabled={loading}
        className="mt-4 rounded-xl border px-4 py-2 text-sm font-semibold disabled:opacity-40"
      >
        {loading ? "Verlauf wird geladen…" : "Verlauf aktualisieren"}
      </button>

      {error && <p className="mt-3 text-sm font-semibold text-red-700">{error}</p>}

      {plans.length > 0 && (
        <div className="mt-4 overflow-x-auto rounded-xl border">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2">Zeit</th>
                <th className="px-3 py-2">Prozess</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Ergebnis</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {plans.map((plan) => (
                <tr key={plan.id}>
                  <td className="px-3 py-2">
                    {new Date(plan.updatedAt).toLocaleString("de-DE")}
                  </td>
                  <td className="px-3 py-2 font-semibold">
                    {PROCESS_LABELS[plan.process] || plan.process}
                  </td>
                  <td className="px-3 py-2">{plan.state}</td>
                  <td className="px-3 py-2 text-xs text-slate-500">
                    {plan.items.filter((item) => item.state === "applied").length} übertragen ·{" "}
                    {plan.items.filter((item) => item.state === "failed").length} Fehler ·{" "}
                    {plan.items.filter((item) => item.state === "skipped").length} identisch
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {orderPlans.length > 0 && (
        <div className="mt-4 overflow-x-auto rounded-xl border border-violet-200">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-violet-50 text-xs uppercase text-violet-700">
              <tr>
                <th className="px-3 py-2">Zeit</th>
                <th className="px-3 py-2">Bestelllauf</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Ergebnis</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {orderPlans.map((plan) => (
                <tr key={plan.id}>
                  <td className="px-3 py-2">
                    {new Date(plan.updatedAt).toLocaleString("de-DE")}
                  </td>
                  <td className="px-3 py-2 font-semibold">Bestellungen</td>
                  <td className="px-3 py-2">{plan.state}</td>
                  <td className="px-3 py-2 text-xs text-slate-500">
                    {plan.items.filter((item) => item.state === "applied").length} angelegt ·{" "}
                    {plan.items.filter((item) => item.state === "blocked").length} blockiert ·{" "}
                    {plan.items.filter(
                      (item) =>
                        item.state === "failed" ||
                        item.state === "reconciliation_required"
                    ).length} prüfen
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {audit.length > 0 && (
        <div className="mt-4 max-h-72 space-y-2 overflow-auto rounded-xl bg-slate-950 p-4 text-sm text-slate-200">
          {audit.map((entry) => (
            <div key={entry.id} className="border-b border-slate-800 pb-2 last:border-0">
              <span className="text-xs text-slate-500">
                {new Date(entry.createdAt).toLocaleString("de-DE")} ·{" "}
                {PROCESS_LABELS[entry.process] || entry.process}
              </span>
              <p>{entry.message}</p>
            </div>
          ))}
        </div>
      )}

      {!loading && !error && plans.length === 0 && orderPlans.length === 0 && (
        <p className="mt-4 text-sm text-slate-400">
          Noch keine gespeicherten Sync-Läufe.
        </p>
      )}
    </details>
  );
}
