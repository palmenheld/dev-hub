"use client";

import { useMemo, useState } from "react";
import {
  ShopwareSyncSettings,
  SyncCapability,
} from "@/types/shopwareSync";
import ShopwareMappings from "./ShopwareMappings";
import ShopwareSyncHistory from "./ShopwareSyncHistory";
import ShopwareOrderImporter from "./ShopwareOrderImporter";

type SyncPayload = {
  settings?: ShopwareSyncSettings;
  capabilities?: SyncCapability[];
  error?: string;
};
type Compatibility = {
  checkedAt: string;
  securityWarnings: string[];
  weclapp: {
    version: string;
    available: Record<string, boolean>;
  };
  shopware: {
    version: string;
    available: Record<string, boolean>;
  };
};



const DIRECTION_LABELS = {
  weclapp_to_shopware: "weclapp → Shopware",
  shopware_to_weclapp: "Shopware → weclapp",
  bidirectional: "Beide Richtungen",
} as const;

export default function ShopwareSyncCenter({
  enabled,
}: {
  enabled: boolean;
}) {
  const [settings, setSettings] = useState<ShopwareSyncSettings | null>(null);
  const [capabilities, setCapabilities] = useState<SyncCapability[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [checkingApis, setCheckingApis] = useState(false);
  const [compatibility, setCompatibility] = useState<Compatibility | null>(null);

  const groups = useMemo(
    () =>
      ["Artikel", "Preise & Bestand", "Kunden & Bestellungen", "Betrieb"].map(
        (group) => ({
          group,
          items: capabilities.filter((item) => item.group === group),
        })
      ),
    [capabilities]
  );

  async function load() {
    setLoading(true);
    setFeedback("");
    try {
      const response = await fetch("/api/channels/shopware/sync", {
        cache: "no-store",
      });
      const payload = (await response.json()) as SyncPayload;
      if (!response.ok || !payload.settings || !payload.capabilities) {
        throw new Error(payload.error || "Sync-Center konnte nicht geladen werden.");
      }
      setSettings(payload.settings);
      setCapabilities(payload.capabilities);
    } catch (error) {
      setFeedback(
        error instanceof Error ? error.message : "Unbekannter Fehler"
      );
    } finally {
      setLoading(false);
    }
  }

  async function save() {
    if (!settings) return;
    setSaving(true);
    setFeedback("");
    try {
      const response = await fetch("/api/channels/shopware/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      const payload = (await response.json()) as SyncPayload;
      if (!response.ok || !payload.settings) {
        throw new Error(
          payload.error || "Sync-Einstellungen konnten nicht gespeichert werden."
        );
      }
      setSettings(payload.settings);
      setFeedback(
        "Einstellungen gespeichert. Dadurch wurde noch kein Datensatz übertragen."
      );
    } catch (error) {
      setFeedback(
        error instanceof Error ? error.message : "Unbekannter Fehler"
      );
    } finally {
      setSaving(false);
    }
  }
  async function checkApis() {
    setCheckingApis(true);
    setFeedback("");
    try {
      const response = await fetch(
        "/api/channels/shopware/sync/compatibility",
        { method: "POST" }
      );
      const payload = (await response.json()) as {
        compatibility?: Compatibility;
        error?: string;
      };
      if (!response.ok || !payload.compatibility) {
        throw new Error(
          payload.error || "API-Kompatibilität konnte nicht geprüft werden."
        );
      }
      setCompatibility(payload.compatibility);
      setFeedback(
        "Die tatsächlichen API-Funktionen beider Systeme wurden geprüft."
      );
    } catch (error) {
      setFeedback(
        error instanceof Error ? error.message : "Unbekannter Fehler"
      );
    } finally {
      setCheckingApis(false);
    }
  }

  if (!settings) {
    return (
      <section className="mt-6 rounded-2xl border bg-white p-5 shadow-sm">
        <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-[var(--ph-gold)]">
              Integrationszentrale
            </p>
            <h2 className="mt-1 text-2xl text-[var(--ph-green-dark)]">
              weclapp ↔ Shopware Sync-Center
            </h2>
            <p className="mt-1 max-w-3xl text-sm text-slate-600">
              Vollständige Funktionsübersicht, Datenhoheit, Zuordnungen,
              Vorschauen, Freigaben und Fehlerkontrolle.
            </p>
          </div>
          <button
            type="button"
            onClick={load}
            disabled={!enabled || loading}
            className="rounded-xl bg-[var(--ph-green-dark)] px-5 py-3 font-semibold text-white disabled:opacity-40"
          >
            {loading ? "Wird geladen…" : "Sync-Center öffnen"}
          </button>
        </div>
        {!enabled && (
          <p className="mt-3 text-sm font-semibold text-amber-700">
            Bitte zuerst die Shopware-Verbindung testen.
          </p>
        )}
        {feedback && <p className="mt-3 text-sm text-red-700">{feedback}</p>}
      </section>
    );
  }

  return (
    <section className="mt-6 overflow-hidden rounded-2xl border bg-white shadow-sm">
      <div className="border-b bg-slate-950 p-5 text-white">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-[var(--ph-gold)]">
              Integrationszentrale
            </p>
            <h2 className="mt-1 text-2xl">weclapp ↔ Shopware Sync-Center</h2>
            <p className="mt-1 max-w-3xl text-sm text-slate-300">
              Einstellungen sind von Ausführungen getrennt. Jede Ausführung
              beginnt als Vorschau und kann vor der Freigabe korrigiert werden.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={checkApis}
              disabled={checkingApis}
              className="rounded-xl border border-blue-600 bg-blue-950 px-4 py-3 text-sm font-bold text-blue-100 disabled:opacity-40"
            >
              {checkingApis ? "APIs werden geprüft…" : "APIs live prüfen"}
            </button>
            <div className="rounded-xl border border-emerald-700 bg-emerald-950 px-4 py-3 text-sm">
              <div className="font-bold text-emerald-300">
                Sicherer Startzustand
              </div>
              <div className="text-emerald-100">
                Alle Automatiken aus · Vorschau Pflicht
              </div>
            </div>
          </div>
        </div>
      </div>

      {feedback && (
        <p className="mx-5 mt-5 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-900">
          {feedback}
        </p>
      )}
      {compatibility?.securityWarnings.map((warning) => (
        <p
          key={warning}
          className="mx-5 mt-5 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm font-bold text-red-800"
        >
          {warning}
        </p>
      ))}
      {compatibility && (
        <div className="mx-5 mt-5 grid gap-3 md:grid-cols-2">
          {(
            [
              ["weclapp", compatibility.weclapp],
              ["Shopware", compatibility.shopware],
            ] as const
          ).map(([label, system]) => (
            <div key={label} className="rounded-xl border bg-slate-50 p-4">
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-bold">{label}</h3>
                <span className="text-xs font-semibold text-slate-500">
                  API {system.version}
                </span>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {Object.entries(system.available).map(([name, available]) => (
                  <span
                    key={name}
                    className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                      available
                        ? "bg-green-100 text-green-800"
                        : "bg-red-100 text-red-700"
                    }`}
                  >
                    {name}: {available ? "vorhanden" : "fehlt"}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="grid gap-4 border-b p-5 lg:grid-cols-4">
        <label className="rounded-xl border p-4 text-sm font-semibold">
          Maximale Vorgänge je Lauf
          <input
            type="number"
            min={1}
            max={100}
            value={settings.global.batchLimit}
            onChange={(event) =>
              setSettings({
                ...settings,
                global: {
                  ...settings.global,
                  batchLimit: Number(event.target.value),
                },
              })
            }
            className="mt-2 block w-full rounded-lg border px-3 py-2 font-normal"
          />
        </label>
        <label className="rounded-xl border p-4 text-sm font-semibold">
          Bestell-Sicherheitszeitraum
          <div className="mt-2 flex items-center gap-2">
            <input
              type="number"
              min={2}
              max={60}
              value={settings.orders.safetyDays}
              onChange={(event) =>
                setSettings({
                  ...settings,
                  orders: {
                    ...settings.orders,
                    safetyDays: Number(event.target.value),
                  },
                })
              }
              className="w-24 rounded-lg border px-3 py-2 font-normal"
            />
            <span className="font-normal text-slate-500">Tage</span>
          </div>
        </label>
        <label className="rounded-xl border p-4 text-sm font-semibold">
          Sicherheitsbestand
          <input
            type="number"
            min={0}
            value={settings.stock.safetyStock}
            onChange={(event) =>
              setSettings({
                ...settings,
                stock: {
                  ...settings.stock,
                  safetyStock: Number(event.target.value),
                },
              })
            }
            className="mt-2 block w-full rounded-lg border px-3 py-2 font-normal"
          />
        </label>
        <label className="rounded-xl border p-4 text-sm font-semibold">
          weclapp-Preiskanal
          <input
            value={settings.prices.grossPriceSource}
            onChange={(event) =>
              setSettings({
                ...settings,
                prices: {
                  ...settings.prices,
                  grossPriceSource: event.target.value,
                },
              })
            }
            className="mt-2 block w-full rounded-lg border px-3 py-2 font-normal"
          />
        </label>
      </div>

      <ShopwareMappings settings={settings} onChange={setSettings} />

      <div className="grid gap-4 border-b p-5 lg:grid-cols-2">
        <div className="rounded-xl border p-4">
          <h3 className="font-bold text-[var(--ph-green-dark)]">Artikelregeln</h3>
          <div className="mt-3 space-y-3 text-sm">
            <label className="flex items-center justify-between gap-3">
              <span>Artikelprozess eingerichtet</span>
              <input
                type="checkbox"
                checked={settings.products.enabled}
                onChange={(event) =>
                  setSettings({
                    ...settings,
                    products: {
                      ...settings.products,
                      enabled: event.target.checked,
                    },
                  })
                }
              />
            </label>
            <label className="flex items-center justify-between gap-3">
              <span>Neue Produkte zunächst inaktiv</span>
              <input
                type="checkbox"
                checked={settings.products.createInactive}
                onChange={(event) =>
                  setSettings({
                    ...settings,
                    products: {
                      ...settings.products,
                      createInactive: event.target.checked,
                    },
                  })
                }
              />
            </label>
            <label className="flex items-center justify-between gap-3">
              <span>Beschreibungen bei Updates überschreiben</span>
              <input
                type="checkbox"
                checked={settings.products.overwriteDescriptions}
                onChange={(event) =>
                  setSettings({
                    ...settings,
                    products: {
                      ...settings.products,
                      overwriteDescriptions: event.target.checked,
                    },
                  })
                }
              />
            </label>
          </div>
        </div>

        <div className="rounded-xl border p-4">
          <h3 className="font-bold text-[var(--ph-green-dark)]">Prozessregeln</h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {(
              [
                ["prices", "Preise", true],
                ["stock", "Bestand", true],
                ["customers", "Kunden", false],
                ["orders", "Bestellungen", true],
                ["deliveries", "Lieferungen", false],
                ["cancellations", "Stornierungen", false],
                ["status", "Statusregeln", false],
              ] as const
            ).map(([key, label, available]) => (
              <label
                key={key}
                className={`flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm ${available ? "bg-slate-50" : "bg-slate-100 text-slate-400"}`}
              >
                <span>{label}{available ? "" : " · noch im Aufbau"}</span>
                <input
                  type="checkbox"
                  checked={available && settings[key].enabled}
                  disabled={!available}
                  onChange={(event) =>
                    setSettings({
                      ...settings,
                      [key]: {
                        ...settings[key],
                        enabled: event.target.checked,
                      },
                    })
                  }
                />
              </label>
            ))}
          </div>
          <p className="mt-3 text-xs text-slate-500">
            „Eingerichtet“ aktiviert noch keinen Lauf. Hintergrund-Automatik
            bleibt separat ausgeschaltet.
          </p>
        </div>
      </div>

      <ShopwareOrderImporter
        enabled={enabled && settings.orders.enabled}
      />

      <div className="border-b p-5">
        <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
          <div>
            <h3 className="font-bold text-[var(--ph-green-dark)]">
              Automatik-Sperre
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              Erst nach erfolgreichen manuellen Vorschau-Läufen freigeben.
              Änderungen bleiben auch später als korrigierbare Pläne sichtbar.
            </p>
          </div>
          <label className="flex items-center gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-950">
            <input
              type="checkbox"
              checked={false}
              disabled
            />
            Hintergrund-Automatik noch gesperrt
          </label>
        </div>
      </div>

      <ShopwareSyncHistory />

      <div className="p-5">
        <h3 className="text-xl font-bold text-[var(--ph-green-dark)]">
          Abdeckung der offiziellen Schnittstelle
        </h3>
        <p className="mt-1 text-sm text-slate-500">
          Jeder Bereich erhält eigene Zuordnungen, Vorschau, Korrektur,
          Freigabe und Protokollierung.
        </p>

        <div className="mt-5 space-y-6">
          {groups.map(({ group, items }) => (
            <div key={group}>
              <h4 className="text-sm font-bold uppercase tracking-wide text-slate-400">
                {group}
              </h4>
              <div className="mt-2 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {items.map((item) => (
                  <article key={item.id} className="rounded-xl border p-4">
                    <div className="flex items-start justify-between gap-3">
                      <h5 className="font-bold">{item.title}</h5>
                      <span
                        className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-bold ${
                          item.state === "available"
                            ? "bg-green-100 text-green-800"
                            : "bg-amber-100 text-amber-800"
                        }`}
                      >
                        {item.state === "available"
                          ? "Grundfunktion bereit"
                          : "Zuordnung nötig"}
                      </span>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-slate-600">
                      {item.description}
                    </p>
                    <div className="mt-3 flex items-center justify-between gap-2 text-xs">
                      <span className="font-semibold text-slate-500">
                        {DIRECTION_LABELS[item.direction]}
                      </span>
                      <a
                        href={item.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-semibold text-[var(--ph-green-dark)] underline"
                      >
                        Dokumentation
                      </a>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 flex flex-col justify-between gap-3 rounded-xl bg-[var(--ph-green-light)] p-4 sm:flex-row sm:items-center">
          <p className="text-sm text-[var(--ph-green-dark)]">
            Speichern ändert nur Regeln. Daten werden ausschließlich über einen
            später ausdrücklich freigegebenen Lauf übertragen.
          </p>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="shrink-0 rounded-xl bg-[var(--ph-green-dark)] px-5 py-3 font-semibold text-white disabled:opacity-40"
          >
            {saving ? "Speichert…" : "Regeln speichern"}
          </button>
        </div>
      </div>
    </section>
  );
}
