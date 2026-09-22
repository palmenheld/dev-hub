import type { WeclappBacksyncResult } from "@/types/weclappBacksync";

const tones = {
  synced: "border-green-200 bg-green-50 text-green-900",
  partial: "border-amber-200 bg-amber-50 text-amber-950",
  failed: "border-red-200 bg-red-50 text-red-900",
  disabled: "border-slate-200 bg-slate-50 text-slate-700",
} as const;

const labels = {
  synced: "Mit Weclapp synchronisiert",
  partial: "Teilweise mit Weclapp synchronisiert",
  failed: "Weclapp-Synchronisierung fehlgeschlagen",
  disabled: "Weclapp-Rücksynchronisierung deaktiviert",
} as const;

export default function BacksyncStatus({ value }: { value?: WeclappBacksyncResult }) {
  if (!value) return null;
  return (
    <div className={`mt-4 rounded-xl border px-4 py-3 text-sm ${tones[value.state]}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <strong>{labels[value.state]}</strong>
        <span className="text-xs opacity-75">
          {new Date(value.syncedAt).toLocaleString("de-DE")}
        </span>
      </div>
      <p className="mt-1">{value.message}</p>
      <p className="mt-1 text-xs font-semibold">
        {value.salesChannel
          ? `${value.salesChannelName || "Vertriebskanal"} (${value.salesChannel}) · ${value.priceSynced ? "Preis synchronisiert" : "Preis nicht synchronisiert"}`
          : "Kein eigener Weclapp-Vertriebskanal zugeordnet"}
        {` · ${value.fieldCount} Feld${value.fieldCount === 1 ? "" : "er"}`}
      </p>
      {value.warnings.length > 0 && (
        <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">
          {value.warnings.map((warning) => <li key={warning}>{warning}</li>)}
        </ul>
      )}
    </div>
  );
}
