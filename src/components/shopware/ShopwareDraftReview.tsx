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
  const [refreshing, setRefreshing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [titlePattern, setTitlePattern] = useState("{ki_titel}");
  const [priceAdjustment, setPriceAdjustment] = useState("0");
  const [stockLimit, setStockLimit] = useState("");
  const [defaultTemplate, setDefaultTemplate] = useState(false);
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
            price: form.price ?? form.source.price,
            stock: form.stock ?? form.source.stock ?? 0,
            active: form.active === true,
            selectedImageUrls:
              form.selectedImageUrls ?? form.source.imageUrls,
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
      setForm(payload.draft);
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

  async function refreshWeclappData() {
    if (
      !window.confirm(
        "Name, Größe, Topfmaß, Standardpreis, Bestand und Bilder jetzt neu aus Weclapp laden? Manuell geänderte Shopware-Werte bleiben erhalten."
      )
    ) return;
    setRefreshing(true);
    setError("");
    try {
      const response = await fetch(
        `/api/channels/shopware/drafts/${draft.id}/refresh-weclapp`,
        emptyJsonPost()
      );
      const payload = (await response.json()) as {
        draft?: ShopwareProductDraft;
        changes?: string[];
        contentChanged?: boolean;
        error?: string;
      };
      if (!response.ok || !payload.draft) {
        throw new Error(
          payload.error || "Die Weclapp-Daten konnten nicht neu geladen werden."
        );
      }
      const changes = payload.changes ?? [];
      setForm(payload.draft);
      onChange(
        payload.draft,
        !changes.length
          ? "Die Weclapp-Daten sind bereits aktuell."
          : `Aus Weclapp aktualisiert: ${changes.join(", ")}. Die Freigabe wurde zurückgesetzt.${
              payload.contentChanged
                ? " Bitte Titel und Beschreibung prüfen und gegebenenfalls neu recherchieren."
                : ""
            }`
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unbekannter Fehler");
    } finally {
      setRefreshing(false);
    }
  }

  async function uploadImage(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      const formData = new FormData();
      formData.set("image", file);
      const response = await fetch(
        `/api/channels/shopware/drafts/${draft.id}/images`,
        { method: "POST", body: formData }
      );
      const payload = (await response.json()) as {
        draft?: ShopwareProductDraft;
        error?: string;
      };
      if (!response.ok || !payload.draft) {
        throw new Error(payload.error || "Das Bild konnte nicht hochgeladen werden.");
      }
      setForm(payload.draft);
      onChange(
        payload.draft,
        "Bild ergänzt. Die Shopware-Freigabe wurde zurückgesetzt."
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unbekannter Fehler");
    } finally {
      setUploading(false);
    }
  }

  async function saveAsTemplate() {
    setSavingTemplate(true);
    setError("");
    try {
      const response = await fetch("/api/channels/shopware/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          draftId: draft.id,
          name: templateName,
          titlePattern,
          priceAdjustmentPercent: priceAdjustment,
          stockLimit,
          active: form.active === true,
          isDefault: defaultTemplate,
        }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error || "Template konnte nicht gespeichert werden.");
      }
      setTemplateName("");
      onChange(
        draft,
        defaultTemplate
          ? "Shopware-Template gespeichert und als Standard festgelegt."
          : "Shopware-Template gespeichert."
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unbekannter Fehler");
    } finally {
      setSavingTemplate(false);
    }
  }

  async function approve() {
    if (
      draft.validation.warnings.length > 0 &&
      !window.confirm(
        `Der Entwurf enthält ${draft.validation.warnings.length} Qualitätshinweis(e). Du bestätigst, dass du Inhalt und Quellen manuell geprüft hast und das Produkt trotzdem freigeben möchtest. Fortfahren?`
      )
    ) return;
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
            onClick={refreshWeclappData}
            disabled={
              refreshing ||
              (draft.status !== "ready" && draft.status !== "blocked")
            }
            className="rounded-xl border border-green-300 bg-green-50 px-4 py-2 text-sm font-semibold text-green-900 disabled:opacity-40"
          >
            {refreshing ? "Weclapp wird geladen…" : "Weclapp-Daten neu laden"}
          </button>
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
              Shopware-Verkaufspreis (brutto)
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={form.price ?? form.source.price ?? ""}
                onChange={(event) =>
                  setForm({ ...form, price: Number(event.target.value) })
                }
                className="mt-1 block w-full rounded-xl border border-blue-200 bg-white px-3 py-2.5 font-normal"
              />
            </label>
            <label className="text-sm font-semibold">
              Shopware-Bestand
              <input
                type="number"
                min="0"
                step="1"
                value={form.stock ?? form.source.stock ?? 0}
                onChange={(event) =>
                  setForm({ ...form, stock: Number(event.target.value) })
                }
                className="mt-1 block w-full rounded-xl border border-blue-200 bg-white px-3 py-2.5 font-normal"
              />
            </label>
            <label className="flex items-center gap-3 rounded-xl border border-amber-300 bg-amber-50 px-3 py-3 text-sm font-semibold md:col-span-2">
              <input
                type="checkbox"
                checked={form.active === true}
                onChange={(event) =>
                  setForm({ ...form, active: event.target.checked })
                }
              />
              Nach der Übertragung sofort im Shopware-Live-Shop aktivieren
            </label>
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

          <div>
            <h5 className="font-bold text-blue-950">Produktbilder</h5>
            <p className="mt-1 text-sm text-blue-800">
              Das erste ausgewählte Bild wird zum Shopware-Hauptbild. Neue
              Weclapp-Bilder können über „Weclapp-Daten neu laden“ ergänzt werden.
            </p>
            <label className="mt-3 inline-flex cursor-pointer items-center rounded-xl border border-blue-300 bg-white px-4 py-2 text-sm font-semibold text-blue-950">
              {uploading ? "Bild wird hochgeladen…" : "Eigenes Bild hinzufügen"}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                disabled={uploading}
                onChange={(event) => {
                  void uploadImage(event.target.files?.[0]);
                  event.currentTarget.value = "";
                }}
                className="sr-only"
              />
            </label>
            {[...form.source.imageUrls, ...(form.uploadedImages ?? []).map((image) => image.url)].length ? (
              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {[...form.source.imageUrls, ...(form.uploadedImages ?? []).map((image) => image.url)].map((url, index) => {
                  const selected = (
                    form.selectedImageUrls ?? form.source.imageUrls
                  ).includes(url);
                  return (
                    <label key={url} className={`rounded-xl border p-2 ${selected ? "border-green-500 bg-green-50" : "bg-white"}`}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={url} alt="" className="h-32 w-full rounded-lg object-cover" />
                      <span className="mt-2 flex items-center gap-2 text-xs font-semibold">
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={(event) => {
                            const current = form.selectedImageUrls ?? form.source.imageUrls;
                            setForm({
                              ...form,
                              selectedImageUrls: event.target.checked
                                ? [...new Set([...current, url])]
                                : current.filter((item) => item !== url),
                            });
                          }}
                        />
                        {selected && (form.selectedImageUrls ?? form.source.imageUrls)[0] === url
                          ? "Hauptbild"
                          : `Bild ${index + 1}`}
                      </span>
                    </label>
                  );
                })}
              </div>
            ) : (
              <p className="mt-3 rounded-xl bg-white p-4 text-sm text-slate-500">
                In Weclapp sind derzeit keine Bilder verfügbar.
              </p>
            )}
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
      <details className="mt-4 rounded-xl border border-blue-200 bg-white p-4">
        <summary className="cursor-pointer font-bold text-blue-950">
          Aktuellen Entwurf als Shopware-Template speichern
        </summary>
        <p className="mt-2 text-sm text-slate-600">
          Das Template speichert Titelmuster, Preisregel, Bestandsgrenze,
          SEO-Schlagwörter und die gewünschte Aktivschaltung. KI-Texte und
          Pflanzendaten werden weiterhin passend zum jeweiligen Artikel erzeugt.
        </p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="text-sm font-semibold">
            Template-Name
            <input value={templateName} onChange={(event) => setTemplateName(event.target.value)} placeholder="z. B. Palmen Standard" className="mt-1 block w-full rounded-xl border px-3 py-2.5 font-normal" />
          </label>
          <label className="text-sm font-semibold">
            Titelmuster
            <input value={titlePattern} onChange={(event) => setTitlePattern(event.target.value)} className="mt-1 block w-full rounded-xl border px-3 py-2.5 font-normal" />
            <span className="text-xs font-normal text-slate-500">
              Platzhalter: {"{ki_titel}"}, {"{deutscher_name}"}, {"{lateinischer_name}"}, {"{höhe}"}, {"{topfgröße}"}, {"{artikelnummer}"}
            </span>
          </label>
          <label className="text-sm font-semibold">
            Preisänderung in %
            <input type="number" min="-90" max="500" step="0.1" value={priceAdjustment} onChange={(event) => setPriceAdjustment(event.target.value)} className="mt-1 block w-full rounded-xl border px-3 py-2.5 font-normal" />
          </label>
          <label className="text-sm font-semibold">
            Maximaler Shopware-Bestand (optional)
            <input type="number" min="0" step="1" value={stockLimit} onChange={(event) => setStockLimit(event.target.value)} className="mt-1 block w-full rounded-xl border px-3 py-2.5 font-normal" />
          </label>
          <label className="flex items-center gap-2 text-sm font-semibold">
            <input type="checkbox" checked={defaultTemplate} onChange={(event) => setDefaultTemplate(event.target.checked)} />
            Als Standard für neue Shopware-Entwürfe verwenden
          </label>
        </div>
        <div className="mt-4 flex justify-end">
          <button type="button" onClick={saveAsTemplate} disabled={savingTemplate || templateName.trim().length < 2} className="rounded-xl bg-[var(--ph-green-dark)] px-4 py-2.5 font-semibold text-white disabled:opacity-40">
            {savingTemplate ? "Template wird gespeichert…" : "Template speichern"}
          </button>
        </div>
      </details>
    </div>
  );
}
