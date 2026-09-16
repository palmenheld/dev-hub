"use client";

import { useState } from "react";
import { emptyJsonPost } from "@/lib/http";
import { SyncPlan } from "@/types/shopwareSync";

const STATE_LABELS = {
  pending: "Offen",
  approved: "Freigegeben",
  applied: "Übertragen",
  skipped: "Identisch",
  failed: "Fehler",
} as const;

function displayValue(value: string | number | boolean | null) {
  if (value === null) return "nicht vorhanden";
  if (typeof value === "boolean") return value ? "Ja" : "Nein";
  return String(value);
}

export default function ShopwareSyncPlanReview({
  plan,
  onChange,
}: {
  plan: SyncPlan;
  onChange: (plan: SyncPlan, message: string) => void;
}) {
  const [working, setWorking] = useState("");
  const [error, setError] = useState("");
  const targetLabel = plan.items.some((item) => item.target === "weclapp")
    ? "weclapp"
    : "Shopware";

  async function correct(
    itemId: string,
    field: string,
    proposed: string
  ) {
    setWorking(`correct:${itemId}:${field}`);
    setError("");
    try {
      const response = await fetch(
        `/api/channels/shopware/sync/plans/${plan.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ itemId, field, proposed }),
        }
      );
      const payload = (await response.json()) as {
        plan?: SyncPlan;
        error?: string;
      };
      if (!response.ok || !payload.plan) {
        throw new Error(payload.error || "Korrektur konnte nicht gespeichert werden.");
      }
      onChange(payload.plan, "Korrektur in der Vorschau gespeichert.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unbekannter Fehler");
    } finally {
      setWorking("");
    }
  }

  async function approve() {
    setWorking("approve");
    setError("");
    try {
      const response = await fetch(
        `/api/channels/shopware/sync/plans/${plan.id}/approve`,
        emptyJsonPost()
      );
      const payload = (await response.json()) as {
        plan?: SyncPlan;
        error?: string;
      };
      if (!response.ok || !payload.plan) {
        throw new Error(payload.error || "Freigabe konnte nicht gespeichert werden.");
      }
      onChange(
        payload.plan,
        "Vorschau freigegeben. Es wurde noch nichts übertragen."
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unbekannter Fehler");
    } finally {
      setWorking("");
    }
  }

  async function apply() {
    if (
      !window.confirm(
        `Nur die freigegebenen und weiterhin unveränderten Werte werden jetzt nach ${targetLabel} übertragen. Fortfahren?`
      )
    ) {
      return;
    }
    setWorking("apply");
    setError("");
    try {
      const response = await fetch(
        `/api/channels/shopware/sync/plans/${plan.id}/apply`,
        emptyJsonPost()
      );
      const payload = (await response.json()) as {
        plan?: SyncPlan;
        error?: string;
      };
      if (!response.ok || !payload.plan) {
        throw new Error(payload.error || "Sync konnte nicht ausgeführt werden.");
      }
      onChange(
        payload.plan,
        payload.plan.state === "completed"
          ? "Alle freigegebenen Änderungen wurden übertragen."
          : "Der Lauf ist beendet. Mindestens ein Vorgang benötigt Aufmerksamkeit."
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unbekannter Fehler");
    } finally {
      setWorking("");
    }
  }

  async function retryFailed() {
    setWorking("retry");
    setError("");
    try {
      const response = await fetch(
        `/api/channels/shopware/sync/plans/${plan.id}/retry`,
        emptyJsonPost()
      );
      const payload = (await response.json()) as {
        plan?: SyncPlan;
        error?: string;
      };
      if (!response.ok || !payload.plan) {
        throw new Error(
          payload.error || "Der neue Prüflauf konnte nicht erstellt werden."
        );
      }
      onChange(
        payload.plan,
        "Fehlgeschlagene Artikel wurden neu gelesen. Bitte die neue Vorschau prüfen."
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unbekannter Fehler");
    } finally {
      setWorking("");
    }
  }

  const openCount = plan.items.filter((item) => item.state === "pending").length;
  const approvedCount = plan.items.filter(
    (item) => item.state === "approved"
  ).length;
  const failedCount = plan.items.filter((item) => item.state === "failed").length;

  return (
    <section className="mt-5 rounded-2xl border border-violet-200 bg-violet-50 p-5">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-violet-600">
            Kontrollierte Vorschau
          </p>
          <h3 className="mt-1 text-xl font-bold text-violet-950">
            {plan.process === "prices"
              ? "Preisabgleich"
              : "Bestandsabgleich"}
          </h3>
          <p className="mt-1 text-sm text-violet-800">
            {plan.items.length} Artikel geprüft · {openCount} Änderungen offen
          </p>
        </div>
        <span className="rounded-full bg-white px-3 py-1.5 text-xs font-bold text-violet-900">
          {plan.state === "draft"
            ? "Noch nicht freigegeben"
            : plan.state === "approved"
              ? "Freigegeben, noch nicht übertragen"
              : plan.state === "completed"
                ? "Abgeschlossen"
                : plan.state === "partially_failed"
                  ? "Teilweise fehlgeschlagen"
                  : "Wird verarbeitet"}
        </span>
      </div>

      {error && (
        <p className="mt-4 rounded-lg bg-red-100 px-3 py-2 text-sm font-semibold text-red-700">
          {error}
        </p>
      )}

      <div className="mt-4 divide-y overflow-hidden rounded-xl border border-violet-200 bg-white">
        {plan.items.map((item) => (
          <article key={item.id} className="p-4">
            <div className="flex flex-col justify-between gap-2 sm:flex-row">
              <div>
                <h4 className="font-bold">{item.title}</h4>
                <p className="text-xs text-slate-500">
                  Ziel: {item.target === "weclapp" ? "weclapp" : "Shopware"} · {STATE_LABELS[item.state]}
                </p>
              </div>
              {item.error && (
                <p className="max-w-xl text-sm font-semibold text-red-700">
                  {item.error}
                </p>
              )}
            </div>

            {item.changes.map((change) => (
              <div
                key={change.field}
                className="mt-3 grid gap-2 rounded-lg bg-slate-50 p-3 sm:grid-cols-[1fr_1fr_1fr] sm:items-center"
              >
                <div>
                  <div className="text-xs font-bold uppercase text-slate-400">
                    {change.label}
                  </div>
                  <div className="mt-1 text-sm text-slate-500">
                    Bisher: {displayValue(change.before)}
                  </div>
                </div>
                <div className="text-sm font-semibold">
                  Vorschlag: {displayValue(change.proposed)}
                </div>
                {plan.state === "draft" &&
                item.state === "pending" &&
                change.editable ? (
                  <label className="text-xs font-bold text-violet-900">
                    Korrigierter Wert
                    <input
                      type="number"
                      min={0}
                      step={change.field === "stock" ? 1 : 0.01}
                      defaultValue={String(change.proposed)}
                      disabled={working !== ""}
                      onBlur={(event) => {
                        if (event.target.value !== String(change.proposed)) {
                          void correct(
                            item.id,
                            change.field,
                            event.target.value
                          );
                        }
                      }}
                      className="mt-1 block w-full rounded-lg border bg-white px-3 py-2 text-sm font-normal"
                    />
                  </label>
                ) : (
                  <div className="text-right text-xs font-bold text-slate-400">
                    {STATE_LABELS[item.state]}
                  </div>
                )}
              </div>
            ))}
          </article>
        ))}
      </div>

      <div className="mt-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <p className="text-xs text-violet-800">
          Vor der Ausführung wird geprüft, ob {targetLabel} seit dieser Vorschau
          verändert wurde. Bei Abweichungen stoppt nur der betroffene Artikel.
        </p>
        {plan.state === "draft" ? (
          <button
            type="button"
            onClick={approve}
            disabled={working !== "" || openCount === 0}
            className="shrink-0 rounded-xl bg-violet-900 px-5 py-3 text-sm font-bold text-white disabled:opacity-40"
          >
            {working === "approve"
              ? "Freigabe läuft…"
              : "Vorschau ausdrücklich freigeben"}
          </button>
        ) : plan.state === "approved" ? (
          <button
            type="button"
            onClick={apply}
            disabled={working !== "" || approvedCount === 0}
            className="shrink-0 rounded-xl bg-[var(--ph-gold)] px-5 py-3 text-sm font-bold text-slate-950 disabled:opacity-40"
          >
            {working === "apply"
              ? "Übertragung läuft…"
              : `${approvedCount} Änderungen jetzt übertragen`}
          </button>
        ) : plan.state === "partially_failed" && failedCount > 0 && targetLabel === "Shopware" ? (
          <button
            type="button"
            onClick={retryFailed}
            disabled={working !== ""}
            className="shrink-0 rounded-xl border border-violet-900 bg-white px-5 py-3 text-sm font-bold text-violet-950 disabled:opacity-40"
          >
            {working === "retry"
              ? "Artikel werden neu geprüft…"
              : `${failedCount} Fehler neu prüfen`}
          </button>
        ) : null}
      </div>
    </section>
  );
}
