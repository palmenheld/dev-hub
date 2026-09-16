"use client";

import { useState } from "react";
import { emptyJsonPost } from "@/lib/http";
import { ShopwareSyncSettings } from "@/types/shopwareSync";

type Option = { id: string; label: string; detail?: string };

type IntegrationOptions = {
  errors: string[];
  shopware: {
    taxes: Option[];
    currencies: Option[];
    units: Option[];
    manufacturers: Option[];
    customerGroups: Option[];
    salesChannels: Option[];
    paymentMethods: Option[];
    shippingMethods: Option[];
    statuses: Option[];
  };
  weclapp: {
    taxes: Option[];
    currencies: Option[];
    units: Option[];
    manufacturers: Option[];
    salesChannels: Option[];
    paymentMethods: Option[];
    shippingMethods: Option[];
    warehouses: Option[];
  };
};

type MappingKey =
  | "taxes"
  | "currencies"
  | "units"
  | "manufacturers"
  | "customerGroups"
  | "salesChannels"
  | "paymentMethods"
  | "shippingMethods";

const MAPPING_ROWS: Array<{
  key: MappingKey;
  title: string;
  source: keyof IntegrationOptions["weclapp"];
  target: keyof IntegrationOptions["shopware"];
}> = [
  { key: "taxes", title: "Steuern", source: "taxes", target: "taxes" },
  {
    key: "currencies",
    title: "Währungen",
    source: "currencies",
    target: "currencies",
  },
  { key: "units", title: "Einheiten", source: "units", target: "units" },
  {
    key: "manufacturers",
    title: "Hersteller",
    source: "manufacturers",
    target: "manufacturers",
  },
  {
    key: "customerGroups",
    title: "weclapp-Verkaufskanal → Shopware-Kundengruppe",
    source: "salesChannels",
    target: "customerGroups",
  },
  {
    key: "salesChannels",
    title: "Verkaufskanäle",
    source: "salesChannels",
    target: "salesChannels",
  },
  {
    key: "paymentMethods",
    title: "Zahlungsarten",
    source: "paymentMethods",
    target: "paymentMethods",
  },
  {
    key: "shippingMethods",
    title: "Versandarten",
    source: "shippingMethods",
    target: "shippingMethods",
  },
];

export default function ShopwareMappings({
  settings,
  onChange,
}: {
  settings: ShopwareSyncSettings;
  onChange: (settings: ShopwareSyncSettings) => void;
}) {
  const [options, setOptions] = useState<IntegrationOptions | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function loadOptions() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/channels/shopware/sync/options", emptyJsonPost());
      const payload = (await response.json()) as {
        options?: IntegrationOptions;
        error?: string;
      };
      if (!response.ok || !payload.options) {
        throw new Error(payload.error || "Zuordnungswerte fehlen.");
      }
      setOptions(payload.options);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unbekannter Fehler");
    } finally {
      setLoading(false);
    }
  }

  function addPair(key: MappingKey) {
    onChange({
      ...settings,
      mappings: {
        ...settings.mappings,
        [key]: [
          ...settings.mappings[key],
          { sourceId: "", targetId: "" },
        ],
      },
    });
  }

  function updatePair(
    key: MappingKey,
    index: number,
    side: "sourceId" | "targetId",
    value: string
  ) {
    onChange({
      ...settings,
      mappings: {
        ...settings.mappings,
        [key]: settings.mappings[key].map((pair, pairIndex) =>
          pairIndex === index ? { ...pair, [side]: value } : pair
        ),
      },
    });
  }

  function removePair(key: MappingKey, index: number) {
    onChange({
      ...settings,
      mappings: {
        ...settings.mappings,
        [key]: settings.mappings[key].filter(
          (_pair, pairIndex) => pairIndex !== index
        ),
      },
    });
  }

  return (
    <details className="border-b p-5">
      <summary className="cursor-pointer text-lg font-bold text-[var(--ph-green-dark)]">
        Zuordnungen zwischen beiden Systemen
      </summary>
      <p className="mt-2 max-w-4xl text-sm text-slate-500">
        IDs werden aus deinem weclapp-Tenant und deiner Shopware-Installation
        geladen. Freitext oder erratene Steuer-, Status- und Währungswerte
        werden dadurch vermieden.
      </p>

      <button
        type="button"
        onClick={loadOptions}
        disabled={loading}
        className="mt-4 rounded-xl border border-[var(--ph-green-dark)] bg-white px-4 py-2.5 text-sm font-semibold text-[var(--ph-green-dark)] disabled:opacity-40"
      >
        {loading ? "Werte werden geladen…" : "Echte Zuordnungswerte laden"}
      </button>

      {error && <p className="mt-3 text-sm font-semibold text-red-700">{error}</p>}

      {options && (
        <>
          {options.errors.length > 0 && (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
              <strong>Teilweise fehlen Leserechte oder API-Bereiche:</strong>
              {options.errors.map((message) => (
                <p key={message} className="mt-1">
                  {message}
                </p>
              ))}
            </div>
          )}

          <div className="mt-5 grid gap-4 xl:grid-cols-2">
            {MAPPING_ROWS.map((mapping) => {
              const sourceOptions = options.weclapp[mapping.source];
              const targetOptions = options.shopware[mapping.target];
              const pairs = settings.mappings[mapping.key];

              return (
                <div key={mapping.key} className="rounded-xl border p-4">
                  <div className="flex items-center justify-between gap-3">
                    <h4 className="font-bold">{mapping.title}</h4>
                    <button
                      type="button"
                      onClick={() => addPair(mapping.key)}
                      className="rounded-lg border px-3 py-1.5 text-xs font-bold"
                    >
                      Zuordnung hinzufügen
                    </button>
                  </div>

                  {pairs.length === 0 ? (
                    <p className="mt-3 text-sm text-slate-400">
                      Noch keine Zuordnung.
                    </p>
                  ) : (
                    <div className="mt-3 space-y-2">
                      {pairs.map((pair, index) => (
                        <div
                          key={`${mapping.key}-${index}`}
                          className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]"
                        >
                          <select
                            value={pair.sourceId}
                            onChange={(event) =>
                              updatePair(
                                mapping.key,
                                index,
                                "sourceId",
                                event.target.value
                              )
                            }
                            className="rounded-lg border bg-white px-3 py-2 text-sm"
                          >
                            <option value="">weclapp auswählen</option>
                            {sourceOptions.map((option) => (
                              <option key={option.id} value={option.id}>
                                {option.label}
                                {option.detail ? ` · ${option.detail}` : ""}
                              </option>
                            ))}
                          </select>
                          <select
                            value={pair.targetId}
                            onChange={(event) =>
                              updatePair(
                                mapping.key,
                                index,
                                "targetId",
                                event.target.value
                              )
                            }
                            className="rounded-lg border bg-white px-3 py-2 text-sm"
                          >
                            <option value="">Shopware auswählen</option>
                            {targetOptions.map((option) => (
                              <option key={option.id} value={option.id}>
                                {option.label}
                                {option.detail ? ` · ${option.detail}` : ""}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={() => removePair(mapping.key, index)}
                            className="rounded-lg border border-red-200 px-3 py-2 text-xs font-bold text-red-700"
                          >
                            Entfernen
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border p-4">
              <h4 className="font-bold">Bestandsführende weclapp-Lager</h4>
              <p className="mt-1 text-xs text-slate-500">
                Nur markierte Lager fließen später in den Shopbestand ein.
              </p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {options.weclapp.warehouses.map((warehouse) => (
                  <label
                    key={warehouse.id}
                    className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={settings.stock.warehouseIds.includes(
                        warehouse.id
                      )}
                      onChange={(event) =>
                        onChange({
                          ...settings,
                          stock: {
                            ...settings.stock,
                            warehouseIds: event.target.checked
                              ? [
                                  ...settings.stock.warehouseIds,
                                  warehouse.id,
                                ]
                              : settings.stock.warehouseIds.filter(
                                  (id) => id !== warehouse.id
                                ),
                          },
                        })
                      }
                    />
                    {warehouse.label}
                  </label>
                ))}
              </div>
            </div>

            <div className="rounded-xl border p-4">
              <h4 className="font-bold">Bestellstatus für Import</h4>
              <p className="mt-1 text-xs text-slate-500">
                Nur Bestellungen in ausdrücklich markierten Shopware-Status
                werden später vorgeschlagen.
              </p>
              <div className="mt-3 grid max-h-52 gap-2 overflow-auto sm:grid-cols-2">
                {options.shopware.statuses.map((status) => (
                  <label
                    key={status.id}
                    className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={settings.orders.shopwareStatusIds.includes(
                        status.id
                      )}
                      onChange={(event) =>
                        onChange({
                          ...settings,
                          orders: {
                            ...settings.orders,
                            shopwareStatusIds: event.target.checked
                              ? [
                                  ...settings.orders.shopwareStatusIds,
                                  status.id,
                                ]
                              : settings.orders.shopwareStatusIds.filter(
                                  (id) => id !== status.id
                                ),
                          },
                        })
                      }
                    />
                    <span>
                      {status.label}
                      {status.detail ? (
                        <small className="block text-slate-400">
                          {status.detail}
                        </small>
                      ) : null}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </details>
  );
}
