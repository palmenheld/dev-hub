"use client";

import { useState } from "react";
import { emptyJsonPost } from "@/lib/http";
import { ShopwareProductDraft } from "@/types/shopwarePublishing";

export default function ShopwareDraftReview({
  draft,
  onChange,
}: {
  draft: ShopwareProductDraft;
  onChange: (draft: ShopwareProductDraft, message: string) => void;
}) {
  const [form, setForm] = useState(draft);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [approving, setApproving] = useState(false);
  const [error, setError] = useState("");

  function updateResearch(
    values: Partial<ShopwareProductDraft["research"]>
  ) {
    setForm({
      ...form,
      research: { ...form.research, ...values },
    });
  }

  function updateCare(
    key: keyof ShopwareProductDraft["research"]["care"],
    text: string
  ) {
    updateResearch({
      care: {
        ...form.research.care,
        [key]: { ...form.research.care[key], text },
      },
    });
  }

  function updateBlock(index: number, field: "heading" | "text", value: string) {
    const blocks = form.research.blocks.map((block, blockIndex) =>
      blockIndex === index ? { ...block, [field]: value } : block
    );
    updateResearch({ blocks });
  }

  async function saveCorrections() {
    setSaving(true);
    setError("");
    try {
      const response = await fetch(
        `/api/channels/shopware/drafts/${draft.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: form.title,
            confirmedGermanName: form.research.confirmedGermanName,
            confirmedLatinName: form.research.confirmedLatinName,
            metaTitle: form.research.metaTitle,
            metaDescription: form.research.metaDescription,
            keywords: form.research.keywords,
            winterHardy: form.research.winterHardy,
            minTemperatureC: form.research.minTemperatureC,
            blocks: form.research.blocks.map((block) => ({
              heading: block.heading,
              text: block.text,
            })),
            care: {
              light: { text: form.research.care.light.text },
              water: { text: form.research.care.water.text },
              fertilizer: { text: form.research.care.fertilizer.text },
              winter: { text: form.research.care.winter.text },
            },
          }),
        }
      );
      const payload = (await response.json()) as {
        draft?: ShopwareProductDraft;
        error?: string;
      };
      if (!response.ok || !payload.draft) {
        throw new Error(payload.error || "Korrekturen konnten nicht gespeichert werden.");
      }
      setEditing(false);
      onChange(
        payload.draft,
        "Korrekturen gespeichert. Bitte Inhalt und Quellen erneut freigeben."
      );
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Unbekannter Fehler"
      );
    } finally {
      setSaving(false);
    }
  }

  async function approve() {
    setApproving(true);
    setError("");
    try {
      const response = await fetch(
        `/api/channels/shopware/drafts/${draft.id}/approve`,
        emptyJsonPost()
      );
      const payload = (await response.json()) as {
        draft?: ShopwareProductDraft;
        error?: string;
      };
      if (!response.ok || !payload.draft) {
        throw new Error(payload.error || "Freigabe konnte nicht gespeichert werden.");
      }
      onChange(
        payload.draft,
        "Inhalt und Quellen wurden für die Shopware-Übergabe freigegeben."
      );
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Unbekannter Fehler"
      );
    } finally {
      setApproving(false);
    }
  }

  return (
    <div className="mt-5 rounded-xl border border-blue-200 bg-blue-50 p-4">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h4 className="font-bold text-blue-950">Korrektur & Freigabe</h4>
          <p className="mt-1 text-sm text-blue-800">
            Du kannst jeden automatisch erzeugten Text korrigieren. Nach einer
            inhaltlichen Änderung musst du ausdrücklich bestätigen, dass die
            sichtbaren Quellen auch deine Korrektur weiterhin belegen.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setEditing((value) => !value)}
            disabled={draft.status !== "ready" && draft.status !== "blocked"}
            className="rounded-xl border border-blue-300 bg-white px-4 py-2 text-sm font-semibold text-blue-950 disabled:opacity-40"
          >
            {editing ? "Bearbeitung schließen" : "Korrekturen bearbeiten"}
          </button>
          <button
            type="button"
            onClick={approve}
            disabled={
              approving ||
              !draft.validation.valid ||
              Boolean(draft.approvedAt) ||
              draft.status === "published"
            }
            className="rounded-xl bg-blue-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
          >
            {draft.approvedAt
              ? "Inhalt freigegeben"
              : approving
                ? "Freigabe läuft…"
                : draft.manuallyEdited
                  ? "Korrekturen & Quellen bestätigt"
                  : "Inhalt & Quellen geprüft"}
          </button>
        </div>
      </div>

      {error && (
        <p className="mt-3 rounded-lg bg-red-100 px-3 py-2 text-sm font-semibold text-red-700">
          {error}
        </p>
      )}

      {editing && (
        <div className="mt-5 space-y-4 border-t border-blue-200 pt-5">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="text-sm font-semibold">
              Produkttitel
              <input
                value={form.title}
                onChange={(event) =>
                  setForm({ ...form, title: event.target.value })
                }
                className="mt-1 block w-full rounded-xl border border-blue-200 bg-white px-3 py-2.5 font-normal"
              />
            </label>
            <label className="text-sm font-semibold">
              Deutscher Name
              <input
                value={form.research.confirmedGermanName}
                onChange={(event) =>
                  updateResearch({ confirmedGermanName: event.target.value })
                }
                className="mt-1 block w-full rounded-xl border border-blue-200 bg-white px-3 py-2.5 font-normal"
              />
            </label>
            <label className="text-sm font-semibold">
              Lateinischer Name
              <input
                value={form.research.confirmedLatinName}
                onChange={(event) =>
                  updateResearch({ confirmedLatinName: event.target.value })
                }
                className="mt-1 block w-full rounded-xl border border-blue-200 bg-white px-3 py-2.5 font-normal italic"
              />
            </label>
            <label className="text-sm font-semibold">
              SEO-Schlagwörter, mit Komma getrennt
              <input
                value={form.research.keywords.join(", ")}
                onChange={(event) =>
                  updateResearch({
                    keywords: event.target.value
                      .split(",")
                      .map((value) => value.trim())
                      .filter(Boolean),
                  })
                }
                className="mt-1 block w-full rounded-xl border border-blue-200 bg-white px-3 py-2.5 font-normal"
              />
            </label>
            <label className="text-sm font-semibold">
              Meta-Titel
              <input
                value={form.research.metaTitle}
                onChange={(event) =>
                  updateResearch({ metaTitle: event.target.value })
                }
                className="mt-1 block w-full rounded-xl border border-blue-200 bg-white px-3 py-2.5 font-normal"
              />
              <span className="text-xs font-normal text-slate-500">
                {form.research.metaTitle.length} Zeichen
              </span>
            </label>
            <label className="text-sm font-semibold">
              Meta-Beschreibung
              <textarea
                value={form.research.metaDescription}
                onChange={(event) =>
                  updateResearch({ metaDescription: event.target.value })
                }
                rows={3}
                className="mt-1 block w-full rounded-xl border border-blue-200 bg-white px-3 py-2.5 font-normal"
              />
              <span className="text-xs font-normal text-slate-500">
                {form.research.metaDescription.length} Zeichen
              </span>
            </label>
            <label className="flex items-center gap-2 rounded-xl border border-blue-200 bg-white px-3 py-2.5 text-sm font-semibold">
              <input
                type="checkbox"
                checked={form.research.winterHardy}
                onChange={(event) =>
                  updateResearch({ winterHardy: event.target.checked })
                }
              />
              Winterhart
            </label>
            <label className="text-sm font-semibold">
              Bestätigte Minimaltemperatur °C
              <input
                type="number"
                step="0.5"
                value={form.research.minTemperatureC}
                onChange={(event) =>
                  updateResearch({
                    minTemperatureC: Number(event.target.value),
                  })
                }
                className="mt-1 block w-full rounded-xl border border-blue-200 bg-white px-3 py-2.5 font-normal"
              />
            </label>
          </div>

          <h5 className="font-bold text-blue-950">Pflege-Kurzangaben</h5>
          <div className="grid gap-4 md:grid-cols-2">
            {(
              [
                ["light", "Licht"],
                ["water", "Wasser"],
                ["fertilizer", "Düngung"],
                ["winter", "Winter"],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="text-sm font-semibold">
                {label}
                <textarea
                  rows={4}
                  value={form.research.care[key].text}
                  onChange={(event) => updateCare(key, event.target.value)}
                  className="mt-1 block w-full rounded-xl border border-blue-200 bg-white px-3 py-2.5 font-normal"
                />
                <span className="text-xs font-normal text-slate-500">
                  Quellen: {form.research.care[key].sourceIds.join(", ")}
                </span>
              </label>
            ))}
          </div>

          <h5 className="font-bold text-blue-950">Beschreibungstexte</h5>
          {form.research.blocks.map((block, index) => (
            <div key={`${block.key}-${index}`} className="rounded-xl bg-white p-4">
              <input
                value={block.heading}
                onChange={(event) =>
                  updateBlock(index, "heading", event.target.value)
                }
                className="block w-full rounded-lg border px-3 py-2 font-semibold"
              />
              <textarea
                rows={6}
                value={block.text}
                onChange={(event) =>
                  updateBlock(index, "text", event.target.value)
                }
                className="mt-2 block w-full rounded-lg border px-3 py-2"
              />
              <p className="mt-2 text-xs text-slate-500">
                Belegte Quellen: {block.sourceIds.join(", ")}
              </p>
            </div>
          ))}

          <div className="flex justify-end">
            <button
              type="button"
              onClick={saveCorrections}
              disabled={saving}
              className="rounded-xl bg-[var(--ph-green-dark)] px-5 py-3 font-semibold text-white disabled:opacity-40"
            >
              {saving ? "Speichert…" : "Korrekturen speichern"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
