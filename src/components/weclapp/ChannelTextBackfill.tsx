"use client";

import { useState } from "react";
import Button from "@/components/ui/Button";

const channels = [
  { id: "shopware", label: "Shopware" },
  { id: "ebay", label: "eBay" },
  { id: "kleinanzeigen", label: "Kleinanzeigen" },
] as const;

type Progress = Record<string, { processed: number; total: number }>;

export default function ChannelTextBackfill({ enabled }: { enabled: boolean }) {
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<Progress>({});
  const [feedback, setFeedback] = useState<{ kind: "success" | "error"; message: string } | null>(null);

  async function run() {
    setRunning(true);
    setProgress({});
    setFeedback(null);
    let failed = 0;
    let transferred = 0;
    try {
      for (const channel of channels) {
        let offset = 0;
        let done = false;
        while (!done) {
          const response = await fetch("/api/weclapp/channel-texts/backfill", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ channel: channel.id, offset, limit: 5 }),
          });
          const payload = await response.json() as {
            error?: string;
            total?: number;
            processed?: number;
            nextOffset?: number;
            done?: boolean;
            results?: Array<{ state: string }>;
          };
          if (!response.ok) throw new Error(payload.error || `${channel.label} konnte nicht übertragen werden.`);
          const results = payload.results || [];
          transferred += results.filter((item) => item.state !== "failed").length;
          failed += results.filter((item) => item.state === "failed").length;
          offset = payload.nextOffset || 0;
          done = payload.done === true;
          setProgress((current) => ({
            ...current,
            [channel.id]: { processed: payload.processed || 0, total: payload.total || 0 },
          }));
          if (!results.length && !done) throw new Error(`${channel.label}: Die Migration macht keinen Fortschritt.`);
        }
      }
      setFeedback({
        kind: failed ? "error" : "success",
        message: failed
          ? `${transferred} Artikeltexte übertragen, ${failed} fehlgeschlagen. Details stehen am jeweiligen Entwurf.`
          : `${transferred} vorhandene Kanaltexte wurden nach Weclapp übertragen. Preise blieben unverändert.`,
      });
    } catch (error) {
      setFeedback({ kind: "error", message: error instanceof Error ? error.message : "Die Übertragung wurde abgebrochen." });
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="mt-5 rounded-xl border border-blue-200 bg-blue-50 p-4">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
        <div>
          <h3 className="font-bold text-[var(--ph-green-dark)]">Vorhandene Artikeltexte übernehmen</h3>
          <p className="mt-1 text-sm text-slate-700">
            Überträgt den neuesten vorhandenen Text je Artikel und Verkaufskanal. Preise werden dabei ausdrücklich nicht verändert.
          </p>
          {running && (
            <div className="mt-3 space-y-1 text-xs text-slate-700">
              {channels.map((channel) => {
                const value = progress[channel.id];
                return <div key={channel.id}>{channel.label}: {value ? `${value.processed} von ${value.total}` : "wartet …"}</div>;
              })}
            </div>
          )}
        </div>
        <Button onClick={() => void run()} disabled={!enabled || running} className="shrink-0">
          {running ? "Texte werden übertragen …" : "Bestehende Texte übertragen"}
        </Button>
      </div>
      {feedback && (
        <p className={`mt-4 rounded-lg px-3 py-2 text-sm ${feedback.kind === "success" ? "bg-green-100 text-green-900" : "bg-red-100 text-red-900"}`}>
          {feedback.message}
        </p>
      )}
    </div>
  );
}
