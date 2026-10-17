"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import WeclappCustomerCreateForm from "./WeclappCustomerCreateForm";
import type {
  OverwinteringCustomer,
  OverwinteringPlantInput,
  OverwinteringRecord,
  WeclappCustomerSearchResult,
} from "@/types/overwintering";

type PendingPhoto = {
  id: string;
  file: File;
  previewUrl: string;
};

type EditorState = {
  id?: string;
  customer: OverwinteringCustomer | null;
  plants: OverwinteringPlantInput[];
  notes: string;
};

const inputClass =
  "w-full rounded-xl border border-slate-300 bg-white px-3.5 py-3 text-base outline-none transition focus:border-[var(--ph-green-dark)] focus:ring-2 focus:ring-green-100";

function newPlant(): OverwinteringPlantInput {
  return { id: crypto.randomUUID(), name: "", specialFeature: "" };
}

function emptyEditor(): EditorState {
  return { customer: null, plants: [], notes: "" };
}

function editorFromRecord(record: OverwinteringRecord): EditorState {
  return {
    id: record.id,
    customer: record.customer,
    plants: record.plants.map(({ id, name, specialFeature }) => ({
      id,
      name,
      specialFeature,
    })),
    notes: record.notes,
  };
}

function addressLine(customer: OverwinteringCustomer) {
  const { street, zipcode, city, country } = customer.address;
  return [street, [zipcode, city].filter(Boolean).join(" "), country]
    .filter(Boolean)
    .join(", ");
}

async function json<T>(response: Response) {
  const payload = (await response.json().catch(() => ({}))) as T & {
    error?: string;
  };
  if (!response.ok) {
    throw new Error(payload.error || "Die Aktion ist fehlgeschlagen.");
  }
  return payload;
}

async function preparePhoto(file: File) {
  if (file.type === "image/gif") return file;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return file;
  }
  const maximum = 2_400;
  const scale = Math.min(1, maximum / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close();
    return file;
  }
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", 0.88)
  );
  if (!blob) return file;
  const name = file.name.replace(/\.[^.]+$/u, "") || "pflanze";
  return new File([blob], `${name}.jpg`, {
    type: "image/jpeg",
    lastModified: Date.now(),
  });
}

export default function OverwinteringManager({
  initialRecords,
}: {
  initialRecords: OverwinteringRecord[];
}) {
  const [records, setRecords] = useState(initialRecords);
  const [recordFilter, setRecordFilter] = useState("");
  const [editor, setEditor] = useState<EditorState>(() => emptyEditor());
  const [customerQuery, setCustomerQuery] = useState("");
  const [customers, setCustomers] = useState<WeclappCustomerSearchResult[]>([]);
  const [pendingPhotos, setPendingPhotos] = useState<
    Record<string, PendingPhoto[]>
  >({});
  const [expandedPlantIds, setExpandedPlantIds] = useState<Set<string>>(
    () => new Set()
  );
  const [searching, setSearching] = useState(false);
  const [searchSettled, setSearchSettled] = useState(false);
  const [showCreateCustomer, setShowCreateCustomer] = useState(false);
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState("");
  const [message, setMessage] = useState<{
    kind: "success" | "error";
    text: string;
  } | null>(null);
  const editorRef = useRef<HTMLDivElement>(null);

  const currentRecord = editor.id
    ? records.find((record) => record.id === editor.id)
    : undefined;
  const visibleRecords = useMemo(() => {
    const query = recordFilter.trim().toLocaleLowerCase("de");
    if (!query) return records;
    return records.filter((record) =>
      [
        record.customer.displayName,
        record.customer.customerNumber,
        addressLine(record.customer),
        ...record.plants.map((plant) => plant.name),
      ].some((value) => value.toLocaleLowerCase("de").includes(query))
    );
  }, [recordFilter, records]);

  useEffect(() => {
    if (editor.customer || editor.id || showCreateCustomer) return;
    const query = customerQuery.trim();
    if (query.length < 2) return;

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setSearching(true);
      setMessage(null);
      void fetch(
          `/api/overwintering/customers?query=${encodeURIComponent(query)}`,
          { cache: "no-store", signal: controller.signal }
        )
        .then((response) =>
          json<{ customers: WeclappCustomerSearchResult[] }>(response)
        )
        .then((payload) => {
          setCustomers(payload.customers);
          setSearchSettled(true);
        })
        .catch((error) => {
          if (error instanceof DOMException && error.name === "AbortError") {
            return;
          }
          setCustomers([]);
          setSearchSettled(true);
          setMessage({
            kind: "error",
            text:
              error instanceof Error
                ? error.message
                : "Kundensuche fehlgeschlagen.",
          });
        })
        .finally(() => {
          if (!controller.signal.aborted) setSearching(false);
        });
    }, 350);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [customerQuery, editor.customer, editor.id, showCreateCustomer]);

  function releasePending() {
    Object.values(pendingPhotos)
      .flat()
      .forEach((photo) => URL.revokeObjectURL(photo.previewUrl));
  }

  function startNew() {
    releasePending();
    setEditor(emptyEditor());
    setPendingPhotos({});
    setExpandedPlantIds(new Set());
    setCustomers([]);
    setCustomerQuery("");
    setSearchSettled(false);
    setShowCreateCustomer(false);
    setMessage(null);
    window.setTimeout(
      () => editorRef.current?.scrollIntoView({ behavior: "smooth" }),
      0
    );
  }

  function selectRecord(record: OverwinteringRecord) {
    releasePending();
    setEditor(editorFromRecord(record));
    setPendingPhotos({});
    setExpandedPlantIds(new Set());
    setCustomers([]);
    setCustomerQuery("");
    setSearchSettled(false);
    setShowCreateCustomer(false);
    setMessage(null);
    window.setTimeout(
      () => editorRef.current?.scrollIntoView({ behavior: "smooth" }),
      0
    );
  }

  function selectCustomer(customer: WeclappCustomerSearchResult) {
    setEditor({ customer, plants: [], notes: "" });
    setExpandedPlantIds(new Set());
    setCustomers([]);
    setSearchSettled(false);
    setShowCreateCustomer(false);
    setMessage(null);
  }

  function replaceRecord(record: OverwinteringRecord) {
    setRecords((current) =>
      [record, ...current.filter((item) => item.id !== record.id)].sort((a, b) =>
        b.updatedAt.localeCompare(a.updatedAt)
      )
    );
    setEditor(editorFromRecord(record));
  }

  async function createRecord() {
    if (!editor.customer || saving || editor.id) return;
    setSaving(true);
    setMessage(null);
    setProgress("Überwinterungsakte wird angelegt …");
    try {
      const payload = await json<{ record: OverwinteringRecord }>(
        await fetch("/api/overwintering", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            customer: editor.customer,
            plants: [],
            notes: "",
          }),
        })
      );
      replaceRecord(payload.record);
      const plant = newPlant();
      setEditor({
        ...editorFromRecord(payload.record),
        plants: [plant],
      });
      setExpandedPlantIds(new Set([plant.id]));
      setMessage({
        kind: "success",
        text: `Die Überwinterung für ${payload.record.customer.displayName} ist angelegt. Jetzt können Pflanzen und Fotos erfasst werden.`,
      });
    } catch (error) {
      setMessage({
        kind: "error",
        text:
          error instanceof Error
            ? error.message
            : "Die Überwinterung konnte nicht angelegt werden.",
      });
    } finally {
      setSaving(false);
      setProgress("");
    }
  }

  function updatePlant(id: string, patch: Partial<OverwinteringPlantInput>) {
    setEditor((current) => ({
      ...current,
      plants: current.plants.map((plant) =>
        plant.id === id ? { ...plant, ...patch } : plant
      ),
    }));
    setMessage(null);
  }

  function addPlant() {
    const plant = newPlant();
    setEditor((current) => ({
      ...current,
      plants: [...current.plants, plant],
    }));
    setExpandedPlantIds((current) => new Set(current).add(plant.id));
    setMessage(null);
  }

  function togglePlant(id: string) {
    setExpandedPlantIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function removePlant(id: string) {
    const storedPhotos =
      currentRecord?.plants.find((plant) => plant.id === id)?.photos.length ?? 0;
    if (
      storedPhotos &&
      !window.confirm(
        "Diese Pflanzenzeile und ihre gespeicherten Fotos wirklich entfernen?"
      )
    ) {
      return;
    }
    (pendingPhotos[id] ?? []).forEach((photo) =>
      URL.revokeObjectURL(photo.previewUrl)
    );
    setPendingPhotos((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
    setEditor((current) => ({
      ...current,
      plants: current.plants.filter((plant) => plant.id !== id),
    }));
    setExpandedPlantIds((current) => {
      const next = new Set(current);
      next.delete(id);
      return next;
    });
  }

  async function addFiles(plantId: string, files: FileList | null) {
    if (!files?.length) return;
    setMessage(null);
    try {
      const prepared = await Promise.all(Array.from(files).map(preparePhoto));
      const additions = prepared.map((file) => ({
        id: crypto.randomUUID(),
        file,
        previewUrl: URL.createObjectURL(file),
      }));
      setPendingPhotos((current) => ({
        ...current,
        [plantId]: [...(current[plantId] ?? []), ...additions],
      }));
    } catch {
      setMessage({
        kind: "error",
        text: "Mindestens ein Foto konnte nicht vorbereitet werden.",
      });
    }
  }

  function removePending(plantId: string, photoId: string) {
    setPendingPhotos((current) => {
      const photo = (current[plantId] ?? []).find(
        (item) => item.id === photoId
      );
      if (photo) URL.revokeObjectURL(photo.previewUrl);
      return {
        ...current,
        [plantId]: (current[plantId] ?? []).filter(
          (item) => item.id !== photoId
        ),
      };
    });
  }

  async function deleteStoredPhoto(plantId: string, photoId: string) {
    if (
      !editor.id ||
      saving ||
      !window.confirm("Dieses Foto wirklich löschen?")
    ) {
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const payload = await json<{ record: OverwinteringRecord }>(
        await fetch(
          `/api/overwintering/${editor.id}/plants/${plantId}/photos/${photoId}`,
          { method: "DELETE" }
        )
      );
      replaceRecord(payload.record);
      setMessage({ kind: "success", text: "Das Foto wurde gelöscht." });
    } catch (error) {
      setMessage({
        kind: "error",
        text:
          error instanceof Error
            ? error.message
            : "Das Foto konnte nicht gelöscht werden.",
      });
    } finally {
      setSaving(false);
    }
  }

  async function save() {
    if (!editor.id || !editor.customer || saving) return;
    if (!editor.plants.length) {
      setMessage({
        kind: "error",
        text: "Bitte mindestens eine Pflanze hinzufügen.",
      });
      return;
    }
    if (editor.plants.some((plant) => !plant.name.trim())) {
      setMessage({
        kind: "error",
        text: "Bitte jeder Pflanzenzeile einen Namen geben.",
      });
      return;
    }
    setSaving(true);
    setMessage(null);
    setProgress("Überwinterungsakte wird gespeichert …");
    try {
      let saved = (
        await json<{ record: OverwinteringRecord }>(
          await fetch(`/api/overwintering/${editor.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              customer: editor.customer,
              plants: editor.plants,
              notes: editor.notes,
            }),
          })
        )
      ).record;
      replaceRecord(saved);
      const uploads = Object.entries(pendingPhotos).flatMap(
        ([plantId, photos]) => photos.map((photo) => ({ plantId, photo }))
      );
      for (let index = 0; index < uploads.length; index += 1) {
        const upload = uploads[index];
        setProgress(
          `Foto ${index + 1} von ${uploads.length} wird gespeichert …`
        );
        const data = new FormData();
        data.append("photo", upload.photo.file);
        const payload = await json<{ record: OverwinteringRecord }>(
          await fetch(
            `/api/overwintering/${saved.id}/plants/${upload.plantId}/photos`,
            { method: "POST", body: data }
          )
        );
        saved = payload.record;
        replaceRecord(saved);
        removePending(upload.plantId, upload.photo.id);
      }
      releasePending();
      setPendingPhotos({});
      replaceRecord(saved);
      setMessage({
        kind: "success",
        text: `Überwinterung für ${saved.customer.displayName} mit ${saved.plants.length} ${saved.plants.length === 1 ? "Pflanze" : "Pflanzen"} gespeichert.`,
      });
    } catch (error) {
      setMessage({
        kind: "error",
        text:
          error instanceof Error ? error.message : "Speichern fehlgeschlagen.",
      });
    } finally {
      setSaving(false);
      setProgress("");
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
      <aside className="space-y-4">
        <button
          type="button"
          onClick={startNew}
          className="w-full rounded-xl bg-[var(--ph-green-dark)] px-5 py-3.5 font-bold text-white transition hover:brightness-110"
        >
          + Neue Überwinterung
        </button>
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 p-4">
            <h2 className="text-lg text-[var(--ph-green-dark)]">
              Gespeicherte Akten
            </h2>
            <input
              value={recordFilter}
              onChange={(event) => setRecordFilter(event.target.value)}
              className={`${inputClass} mt-3`}
              placeholder="Kunde, Nummer oder Pflanze"
            />
          </div>
          <div className="max-h-[70vh] divide-y overflow-y-auto">
            {visibleRecords.length === 0 && (
              <p className="p-5 text-sm text-slate-500">
                Noch keine passende Überwinterung gespeichert.
              </p>
            )}
            {visibleRecords.map((record) => {
              const photoCount = record.plants.reduce(
                (sum, plant) => sum + plant.photos.length,
                0
              );
              return (
                <button
                  key={record.id}
                  type="button"
                  onClick={() => selectRecord(record)}
                  className={`block w-full p-4 text-left transition hover:bg-green-50 ${editor.id === record.id ? "bg-green-50" : "bg-white"}`}
                >
                  <strong className="block text-[var(--ph-green-dark)]">
                    {record.customer.displayName}
                  </strong>
                  <span className="mt-1 block text-xs text-slate-500">
                    Kunde {record.customer.customerNumber || "ohne Nummer"}
                  </span>
                  <span className="mt-2 block text-sm text-slate-700">
                    {record.plants.length}{" "}
                    {record.plants.length === 1 ? "Pflanze" : "Pflanzen"} ·{" "}
                    {photoCount} Fotos
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      </aside>

      <div ref={editorRef} className="min-w-0 space-y-5">
        {message && (
          <div
            className={`rounded-xl border px-4 py-3 text-sm font-semibold ${message.kind === "success" ? "border-green-200 bg-green-50 text-green-900" : "border-red-200 bg-red-50 text-red-800"}`}
          >
            {message.text}
          </div>
        )}

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-[var(--ph-gold)]">
                Kundenakte
              </div>
              <h2 className="mt-1 text-2xl text-[var(--ph-green-dark)]">
                {editor.id ? "Überwinterung bearbeiten" : "Neue Überwinterung"}
              </h2>
            </div>
            <div className="flex gap-2 text-xs font-bold">
              <span
                className={`rounded-full px-3 py-1 ${editor.customer ? "bg-green-100 text-green-900" : "bg-slate-100 text-slate-500"}`}
              >
                1 Kunde
              </span>
              <span
                className={`rounded-full px-3 py-1 ${editor.id ? "bg-green-100 text-green-900" : "bg-slate-100 text-slate-500"}`}
              >
                2 Akte
              </span>
              <span
                className={`rounded-full px-3 py-1 ${editor.id ? "bg-green-100 text-green-900" : "bg-slate-100 text-slate-500"}`}
              >
                3 Pflanzen
              </span>
            </div>
          </div>

          {!editor.customer ? (
            <div className="mt-5">
              <label className="mb-1.5 block text-sm font-bold text-slate-800">
                Kunde aus Weclapp suchen *
              </label>
              <div className="relative">
                <input
                  value={customerQuery}
                  onChange={(event) => {
                    setCustomerQuery(event.target.value);
                    setCustomers([]);
                    setSearchSettled(false);
                    setSearching(false);
                    setShowCreateCustomer(false);
                  }}
                  className={inputClass}
                  placeholder="Name, Kundennummer oder E-Mail – Suche startet automatisch"
                  autoComplete="off"
                />
                {searching && (
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-slate-500">
                    Suche …
                  </span>
                )}
              </div>
              {customerQuery.trim().length === 1 && (
                <p className="mt-2 text-sm text-slate-500">
                  Noch ein Zeichen eingeben, dann startet die Suche.
                </p>
              )}
              {customers.length > 0 && (
                <div className="mt-3 divide-y overflow-hidden rounded-xl border border-slate-200">
                  {customers.map((customer) => (
                    <button
                      key={customer.id}
                      type="button"
                      onClick={() => selectCustomer(customer)}
                      className="flex w-full flex-col gap-1 p-3 text-left hover:bg-green-50 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <span>
                        <strong>{customer.displayName}</strong>
                        <small className="ml-2 text-slate-500">
                          {customer.customerNumber}
                        </small>
                      </span>
                      <span className="text-sm text-slate-500">
                        {addressLine(customer) || "Keine Adresse hinterlegt"}
                      </span>
                    </button>
                  ))}
                </div>
              )}
              {searchSettled &&
                customerQuery.trim().length >= 2 &&
                customers.length === 0 &&
                !showCreateCustomer && (
                  <div className="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-4">
                    <strong>Kein passender Weclapp-Kunde gefunden.</strong>
                    <p className="mt-1 text-sm text-slate-700">
                      Prüfe kurz die Schreibweise oder lege den Kunden vollständig
                      in Weclapp an.
                    </p>
                    <button
                      type="button"
                      onClick={() => setShowCreateCustomer(true)}
                      className="mt-3 rounded-xl bg-[var(--ph-green-dark)] px-4 py-2.5 font-bold text-white"
                    >
                      + Neukunde in Weclapp
                    </button>
                  </div>
                )}
              {showCreateCustomer && (
                <WeclappCustomerCreateForm
                  query={customerQuery}
                  onCancel={() => setShowCreateCustomer(false)}
                  onCreated={(customer) => {
                    selectCustomer(customer);
                    setCustomerQuery(customer.displayName);
                    setMessage({
                      kind: "success",
                      text: `Weclapp-Kunde ${customer.customerNumber || customer.displayName} wurde angelegt und ausgewählt.`,
                    });
                  }}
                />
              )}
            </div>
          ) : (
            <div className="mt-5 grid gap-3 rounded-xl bg-green-50 p-4 md:grid-cols-2">
              <div>
                <span className="block text-xs font-bold uppercase text-slate-500">
                  Kundenname
                </span>
                <strong className="text-lg text-[var(--ph-green-dark)]">
                  {editor.customer.displayName}
                </strong>
              </div>
              <div>
                <span className="block text-xs font-bold uppercase text-slate-500">
                  Kundennummer
                </span>
                <strong>{editor.customer.customerNumber || "–"}</strong>
              </div>
              <div className="md:col-span-2">
                <span className="block text-xs font-bold uppercase text-slate-500">
                  Adresse
                </span>
                <span>
                  {addressLine(editor.customer) ||
                    "Keine Adresse in Weclapp hinterlegt"}
                </span>
              </div>
              <div>
                <span className="block text-xs font-bold uppercase text-slate-500">
                  Anzahl Pflanzen
                </span>
                <strong>{editor.plants.length}</strong>
              </div>
              {!editor.id && (
                <div className="flex flex-wrap items-center justify-end gap-3 md:col-span-2">
                  <button
                    type="button"
                    onClick={() => {
                      setEditor(emptyEditor());
                      setCustomerQuery("");
                    }}
                    className="text-sm font-bold text-[var(--ph-green-dark)] underline"
                  >
                    Anderen Kunden auswählen
                  </button>
                  <button
                    type="button"
                    onClick={() => void createRecord()}
                    disabled={saving}
                    className="rounded-xl bg-[var(--ph-green-dark)] px-5 py-3 font-bold text-white disabled:opacity-50"
                  >
                    {saving
                      ? "Akte wird angelegt …"
                      : "Überwinterung für diesen Kunden anlegen"}
                  </button>
                </div>
              )}
            </div>
          )}
        </section>

        {!editor.id && editor.customer && (
          <section className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
            <h2 className="text-lg text-slate-700">
              Pflanzen werden nach der Aktenanlage freigeschaltet
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Lege zuerst die Überwinterung für den ausgewählten Kunden an.
            </p>
          </section>
        )}

        {editor.id && (
          <>
            <section className="space-y-4">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 className="text-xl text-[var(--ph-green-dark)]">
                    Pflanzen
                  </h2>
                  <p className="text-sm text-slate-500">
                    Je Pflanze Name, Besonderheiten und beliebig viele Fotos
                    dokumentieren.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={addPlant}
                  className="rounded-xl border border-[var(--ph-green-dark)] bg-white px-4 py-2.5 font-bold text-[var(--ph-green-dark)]"
                >
                  + Pflanze hinzufügen
                </button>
              </div>

              {editor.plants.length === 0 && (
                <button
                  type="button"
                  onClick={addPlant}
                  className="w-full rounded-2xl border-2 border-dashed border-green-300 bg-green-50 p-8 text-center font-bold text-[var(--ph-green-dark)]"
                >
                  + Erste Pflanze erfassen
                </button>
              )}

              {editor.plants.map((plant, index) => {
                const stored =
                  currentRecord?.plants.find((item) => item.id === plant.id)
                    ?.photos ?? [];
                const pending = pendingPhotos[plant.id] ?? [];
                const expanded = expandedPlantIds.has(plant.id);
                return (
                  <article
                    key={plant.id}
                    className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <button
                        type="button"
                        onClick={() => togglePlant(plant.id)}
                        aria-expanded={expanded}
                        aria-controls={`plant-${plant.id}-details`}
                        className="flex min-w-0 flex-1 items-center gap-3 rounded-xl text-left focus:outline-none focus:ring-2 focus:ring-green-200"
                      >
                        <span
                          aria-hidden="true"
                          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-green-50 text-lg font-bold text-[var(--ph-green-dark)] transition-transform ${expanded ? "rotate-180" : ""}`}
                        >
                          ⌄
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-lg font-bold text-[var(--ph-green-dark)]">
                            {plant.name.trim() || `Pflanze ${index + 1}`}
                          </span>
                          <span className="block text-xs text-slate-500">
                            Pflanze {index + 1} · {stored.length + pending.length}{" "}
                            {stored.length + pending.length === 1 ? "Foto" : "Fotos"}
                            {plant.specialFeature.trim() ? " · Besonderheit erfasst" : ""}
                          </span>
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => removePlant(plant.id)}
                        className="shrink-0 text-sm font-bold text-red-700"
                      >
                        Entfernen
                      </button>
                    </div>
                    {expanded && (
                      <div id={`plant-${plant.id}-details`} className="mt-4">
                        <div className="grid gap-4 lg:grid-cols-2">
                          <label className="block">
                            <span className="mb-1.5 block text-sm font-bold text-slate-800">
                              Name *
                            </span>
                            <input
                              value={plant.name}
                              onChange={(event) =>
                                updatePlant(plant.id, {
                                  name: event.target.value,
                                })
                              }
                              className={inputClass}
                              placeholder="z. B. Olivenbaum"
                            />
                          </label>
                          <label className="block">
                            <span className="mb-1.5 block text-sm font-bold text-slate-800">
                              Besonderheit
                            </span>
                            <textarea
                              value={plant.specialFeature}
                              onChange={(event) =>
                                updatePlant(plant.id, {
                                  specialFeature: event.target.value,
                                })
                              }
                              className={`${inputClass} min-h-24 resize-y`}
                              placeholder="z. B. linker Ast angebrochen, großer Terrakottakübel, Schädlingskontrolle"
                            />
                          </label>
                        </div>

                        <div className="mt-5 border-t border-slate-200 pt-4">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                              <strong className="text-sm text-slate-800">
                                Fotos
                              </strong>
                              <p className="text-xs text-slate-500">
                                Schäden, Topf und Gesamtansicht am besten getrennt
                                fotografieren.
                              </p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <label className="cursor-pointer rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-800">
                                Bilder auswählen
                                <input
                                  type="file"
                                  accept="image/*"
                                  multiple
                                  className="hidden"
                                  onChange={(event) => {
                                    void addFiles(plant.id, event.target.files);
                                    event.target.value = "";
                                  }}
                                />
                              </label>
                              <label className="cursor-pointer rounded-xl bg-[var(--ph-green-dark)] px-4 py-2.5 text-sm font-bold text-white">
                                Foto aufnehmen
                                <input
                                  type="file"
                                  accept="image/*"
                                  capture="environment"
                                  className="hidden"
                                  onChange={(event) => {
                                    void addFiles(plant.id, event.target.files);
                                    event.target.value = "";
                                  }}
                                />
                              </label>
                            </div>
                          </div>

                          {(stored.length > 0 || pending.length > 0) && (
                            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6">
                              {stored.map((photo) => (
                                <div
                                  key={photo.id}
                                  className="group relative aspect-square overflow-hidden rounded-xl bg-slate-100"
                                >
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img
                                    src={photo.url}
                                    alt={`${plant.name} – ${photo.originalName}`}
                                    className="h-full w-full object-cover"
                                  />
                                  <button
                                    type="button"
                                    onClick={() =>
                                      void deleteStoredPhoto(plant.id, photo.id)
                                    }
                                    className="absolute right-2 top-2 rounded-full bg-white/95 px-2 py-1 text-xs font-bold text-red-700 shadow"
                                  >
                                    Löschen
                                  </button>
                                </div>
                              ))}
                              {pending.map((photo) => (
                                <div
                                  key={photo.id}
                                  className="relative aspect-square overflow-hidden rounded-xl border-2 border-dashed border-amber-400 bg-amber-50"
                                >
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img
                                    src={photo.previewUrl}
                                    alt="Neues Foto"
                                    className="h-full w-full object-cover"
                                  />
                                  <span className="absolute bottom-2 left-2 rounded bg-amber-100 px-2 py-1 text-[11px] font-bold text-amber-900">
                                    Noch speichern
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      removePending(plant.id, photo.id)
                                    }
                                    className="absolute right-2 top-2 rounded-full bg-white/95 px-2 py-1 text-xs font-bold text-red-700 shadow"
                                  >
                                    Entfernen
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </article>
                );
              })}

              {editor.plants.length > 0 && (
                <div className="flex justify-end pt-1">
                  <button
                    type="button"
                    onClick={addPlant}
                    className="w-full rounded-xl border border-[var(--ph-green-dark)] bg-white px-4 py-3 font-bold text-[var(--ph-green-dark)] sm:w-auto"
                  >
                    + Pflanze hinzufügen
                  </button>
                </div>
              )}
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
              <label className="block">
                <span className="mb-1.5 block text-sm font-bold text-slate-800">
                  Allgemeine Hinweise zur Überwinterung
                </span>
                <textarea
                  value={editor.notes}
                  onChange={(event) =>
                    setEditor((current) => ({
                      ...current,
                      notes: event.target.value,
                    }))
                  }
                  className={`${inputClass} min-h-28 resize-y`}
                  placeholder="z. B. Abholung vereinbart, empfindlicher Boden, besondere Rückgabehinweise"
                />
              </label>
            </section>

            <div className="sticky bottom-3 z-10 flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-xl backdrop-blur sm:flex-row sm:items-center sm:justify-between">
              <span className="text-sm font-medium text-slate-600">
                {progress ||
                  `${editor.plants.length} Pflanzen · ${Object.values(pendingPhotos).flat().length} neue Fotos`}
              </span>
              <button
                type="button"
                onClick={() => void save()}
                disabled={saving || !editor.plants.length}
                className="rounded-xl bg-[var(--ph-green-dark)] px-6 py-3 font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? "Wird gespeichert …" : "Änderungen speichern"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
