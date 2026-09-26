"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { ArticleCapture, ArticleCaptureInput } from "@/types/articleCapture";

type PendingPhoto = {
  id: string;
  file: File;
  sourceFile: File;
  previewUrl: string;
  cutout: boolean;
};

const emptyForm: ArticleCaptureInput = {
  status: "draft",
  name: "",
  articleNumber: "",
  germanName: "",
  latinName: "",
  category: "",
  heightMinCm: null,
  heightMaxCm: null,
  potType: "",
  potValue: null,
  grossPrice: null,
  stock: null,
  keyFacts: [""],
  notes: "",
};

function numberValue(value: string) {
  if (!value.trim()) return null;
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

async function preparePhoto(file: File) {
  if (file.type === "image/gif") return file;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return file;
  }
  const maximum = 2_000;
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
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.86));
  if (!blob) return file;
  const name = file.name.replace(/\.[^.]+$/u, "") || "foto";
  return new File([blob], `${name}.jpg`, { type: "image/jpeg", lastModified: Date.now() });
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-bold text-slate-800">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}

const inputClass =
  "w-full rounded-xl border border-slate-300 bg-white px-3.5 py-3 text-base outline-none transition focus:border-[var(--ph-green-dark)] focus:ring-2 focus:ring-green-100";

export default function ArticleCaptureForm({ initialArticle }: { initialArticle?: ArticleCapture }) {
  const router = useRouter();
  const [article, setArticle] = useState<ArticleCapture | undefined>(initialArticle);
  const [form, setForm] = useState<ArticleCaptureInput>(() =>
    initialArticle
      ? {
          status: initialArticle.status,
          name: initialArticle.name,
          articleNumber: initialArticle.articleNumber,
          germanName: initialArticle.germanName,
          latinName: initialArticle.latinName,
          category: initialArticle.category,
          heightMinCm: initialArticle.heightMinCm,
          heightMaxCm: initialArticle.heightMaxCm,
          potType: initialArticle.potType,
          potValue: initialArticle.potValue,
          grossPrice: initialArticle.grossPrice,
          stock: initialArticle.stock,
          keyFacts: initialArticle.keyFacts.length ? initialArticle.keyFacts : [""],
          notes: initialArticle.notes,
        }
      : emptyForm
  );
  const [pendingPhotos, setPendingPhotos] = useState<PendingPhoto[]>([]);
  const [saving, setSaving] = useState(false);
  const [processingPhotoId, setProcessingPhotoId] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState("");
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const pendingPhotosRef = useRef<PendingPhoto[]>([]);

  useEffect(() => {
    pendingPhotosRef.current = pendingPhotos;
  }, [pendingPhotos]);

  useEffect(
    () => () => pendingPhotosRef.current.forEach((photo) => URL.revokeObjectURL(photo.previewUrl)),
    []
  );

  function setValue<K extends keyof ArticleCaptureInput>(key: K, value: ArticleCaptureInput[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setMessage(null);
  }

  async function addFiles(files: FileList | null) {
    if (!files?.length) return;
    setMessage(null);
    const remaining = 24 - (article?.photos.length ?? 0) - pendingPhotos.length;
    if (remaining <= 0) {
      setMessage({ kind: "error", text: "Pro Artikel können höchstens 24 Fotos gespeichert werden." });
      return;
    }
    const selected = Array.from(files).slice(0, remaining);
    try {
      const prepared = await Promise.all(selected.map(preparePhoto));
      const additions = prepared.map((file) => ({
        id: crypto.randomUUID(),
        file,
        sourceFile: file,
        previewUrl: URL.createObjectURL(file),
        cutout: false,
      }));
      setPendingPhotos((current) => [...current, ...additions]);
      if (selected.length < files.length) {
        setMessage({ kind: "error", text: "Einige Fotos wurden nicht übernommen, weil maximal 24 möglich sind." });
      }
    } catch {
      setMessage({ kind: "error", text: "Mindestens ein Foto konnte nicht vorbereitet werden." });
    }
  }

  function removePending(photoId: string) {
    setPendingPhotos((current) => {
      const photo = current.find((item) => item.id === photoId);
      if (photo) URL.revokeObjectURL(photo.previewUrl);
      return current.filter((item) => item.id !== photoId);
    });
  }

  async function cutoutPending(photo: PendingPhoto) {
    if (processingPhotoId) return;
    setProcessingPhotoId(photo.id);
    setMessage(null);
    try {
      const data = new FormData();
      data.append("photo", photo.sourceFile);
      const response = await fetch("/api/article-captures/cutout", { method: "POST", body: data });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error || "Das Foto konnte nicht freigestellt werden.");
      }
      const blob = await response.blob();
      if (blob.type !== "image/png") throw new Error("Die KI hat kein gültiges PNG zurückgegeben.");
      const baseName = photo.sourceFile.name.replace(/\.[^.]+$/u, "") || "pflanze";
      const file = new File([blob], `${baseName}-freigestellt.png`, { type: "image/png", lastModified: photo.sourceFile.lastModified });
      const previewUrl = URL.createObjectURL(file);
      setPendingPhotos((current) => current.map((item) => {
        if (item.id !== photo.id) return item;
        URL.revokeObjectURL(item.previewUrl);
        return { ...item, file, previewUrl, cutout: true };
      }));
      setMessage({ kind: "success", text: "Die Pflanze wurde freigestellt. Bitte kontrolliere Blätter, Stamm und Topfrand vor dem Speichern." });
    } catch (error) {
      setMessage({ kind: "error", text: error instanceof Error ? error.message : "Das Foto konnte nicht freigestellt werden." });
    } finally {
      setProcessingPhotoId(null);
    }
  }

  function restorePending(photo: PendingPhoto) {
    const previewUrl = URL.createObjectURL(photo.sourceFile);
    setPendingPhotos((current) => current.map((item) => {
      if (item.id !== photo.id) return item;
      URL.revokeObjectURL(item.previewUrl);
      return { ...item, file: item.sourceFile, previewUrl, cutout: false };
    }));
    setMessage(null);
  }

  async function save(status: ArticleCaptureInput["status"] = form.status) {
    if (processingPhotoId) {
      setMessage({ kind: "error", text: "Bitte warte, bis die KI-Freistellung abgeschlossen ist." });
      return;
    }
    if (!form.name.trim() || saving) {
      setMessage({ kind: "error", text: "Bitte mindestens den Artikelnamen eintragen." });
      return;
    }
    setSaving(true);
    setMessage(null);
    setUploadProgress("");
    try {
      const endpoint = article ? `/api/article-captures/${article.id}` : "/api/article-captures";
      const response = await fetch(endpoint, {
        method: article ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, status, articleNumber: undefined }),
      });
      const payload = (await response.json()) as { article?: ArticleCapture; error?: string };
      if (!payload.article) throw new Error(payload.error || "Der Artikel konnte nicht gespeichert werden.");
      let saved = payload.article;
      const syncErrors: string[] = [];
      if (!response.ok && payload.error) syncErrors.push(payload.error);
      for (let index = 0; index < pendingPhotos.length; index += 1) {
        setUploadProgress(`Foto ${index + 1} von ${pendingPhotos.length} wird in Hub und Weclapp gespeichert …`);
        const data = new FormData();
        data.append("photo", pendingPhotos[index].file);
        const upload = await fetch(`/api/article-captures/${saved.id}/photos`, { method: "POST", body: data });
        const uploadPayload = (await upload.json()) as { article?: ArticleCapture; error?: string };
        if (!uploadPayload.article) throw new Error(uploadPayload.error || "Ein Foto konnte nicht gespeichert werden.");
        saved = uploadPayload.article;
        if (!upload.ok && uploadPayload.error) syncErrors.push(uploadPayload.error);
      }
      pendingPhotos.forEach((photo) => URL.revokeObjectURL(photo.previewUrl));
      setPendingPhotos([]);
      setArticle(saved);
      setForm((current) => ({
        ...current,
        status: saved.status,
        articleNumber: saved.articleNumber,
      }));
      setUploadProgress("");
      setMessage(syncErrors.length
        ? { kind: "error", text: syncErrors.join(" ") }
        : {
            kind: "success",
            text: `Artikel wurde in Weclapp als ${saved.articleNumber} gespeichert${saved.photos.length ? "; die Fotos wurden ebenfalls übertragen." : "."}`,
          });
      if (!article) router.replace(`/articles/new/${saved.id}`);
      router.refresh();
    } catch (error) {
      setMessage({ kind: "error", text: error instanceof Error ? error.message : "Speichern fehlgeschlagen." });
    } finally {
      setSaving(false);
      setUploadProgress("");
    }
  }

  async function deletePhoto(photoId: string) {
    if (!article || saving) return;
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/article-captures/${article.id}/photos/${photoId}`, { method: "DELETE" });
      const payload = (await response.json()) as { article?: ArticleCapture; error?: string };
      if (!response.ok || !payload.article) throw new Error(payload.error || "Das Foto konnte nicht gelöscht werden.");
      setArticle(payload.article);
    } catch (error) {
      setMessage({ kind: "error", text: error instanceof Error ? error.message : "Das Foto konnte nicht gelöscht werden." });
    } finally {
      setSaving(false);
    }
  }

  async function setPrimary(photoId: string) {
    if (!article || saving) return;
    setSaving(true);
    try {
      const response = await fetch(`/api/article-captures/${article.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, primaryPhotoId: photoId }),
      });
      const payload = (await response.json()) as { article?: ArticleCapture; error?: string };
      if (!response.ok || !payload.article) throw new Error(payload.error || "Das Hauptfoto konnte nicht geändert werden.");
      setArticle(payload.article);
    } catch (error) {
      setMessage({ kind: "error", text: error instanceof Error ? error.message : "Das Hauptfoto konnte nicht geändert werden." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5 pb-28 sm:pb-8">
      {message && (
        <div className={`rounded-xl border px-4 py-3 text-sm font-semibold ${message.kind === "success" ? "border-green-200 bg-green-50 text-green-900" : "border-red-200 bg-red-50 text-red-800"}`}>
          {message.text}
        </div>
      )}

      {article && (
        <div className={`rounded-xl border px-4 py-3 text-sm ${article.weclappArticleId ? "border-green-200 bg-green-50 text-green-900" : "border-amber-200 bg-amber-50 text-amber-900"}`}>
          <strong>{article.weclappArticleId ? `Mit Weclapp verknüpft: ${article.articleNumber}` : "Noch nicht mit Weclapp verknüpft"}</strong>
          {article.weclappSyncError && <span className="mt-1 block">{article.weclappSyncError}</span>}
        </div>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl text-[var(--ph-green-dark)]">Grunddaten</h2>
            <p className="mt-1 text-sm text-slate-500">Nur der Artikelname ist Pflicht. Alles Weitere kann später ergänzt werden.</p>
          </div>
          <span className={`rounded-full px-3 py-1 text-xs font-bold ${form.status === "ready" ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"}`}>
            {form.status === "ready" ? "Vollständig" : "Entwurf"}
          </span>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Artikelname *" hint="So, wie du den Artikel intern wiederfinden möchtest.">
            <input value={form.name} onChange={(event) => setValue("name", event.target.value)} className={inputClass} placeholder="z. B. Olea europaea C45 160–180 cm" autoFocus />
          </Field>
          <Field label="Artikelnummer / SKU" hint="Wird beim ersten Speichern automatisch von Weclapp vergeben.">
            <input value={article?.articleNumber || form.articleNumber} readOnly disabled className={`${inputClass} cursor-not-allowed bg-slate-100 text-slate-600`} placeholder="Wird von Weclapp vergeben" />
          </Field>
          <Field label="Deutscher Name">
            <input value={form.germanName} onChange={(event) => setValue("germanName", event.target.value)} className={inputClass} placeholder="z. B. Olivenbaum" />
          </Field>
          <Field label="Lateinischer Name">
            <input value={form.latinName} onChange={(event) => setValue("latinName", event.target.value)} className={inputClass} placeholder="z. B. Olea europaea" autoCapitalize="none" />
          </Field>
          <Field label="Artikelkategorie">
            <input value={form.category} onChange={(event) => setValue("category", event.target.value)} className={inputClass} placeholder="z. B. Mediterrane Pflanzen" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Bestand">
              <input type="number" min="0" inputMode="numeric" value={form.stock ?? ""} onChange={(event) => setValue("stock", numberValue(event.target.value))} className={inputClass} placeholder="0" />
            </Field>
            <Field label="Bruttopreis">
              <div className="relative"><input type="number" min="0" step="0.01" inputMode="decimal" value={form.grossPrice ?? ""} onChange={(event) => setValue("grossPrice", numberValue(event.target.value))} className={`${inputClass} pr-10`} placeholder="0,00" /><span className="absolute right-3 top-3.5 text-slate-500">€</span></div>
            </Field>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <h2 className="text-xl text-[var(--ph-green-dark)]">Maße und Kennzeichen</h2>
        <p className="mt-1 text-sm text-slate-500">C und M stehen für Liter, V und D für Durchmesser.</p>
        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Höhe von (cm)"><input type="number" min="0" inputMode="numeric" value={form.heightMinCm ?? ""} onChange={(event) => setValue("heightMinCm", numberValue(event.target.value))} className={inputClass} placeholder="z. B. 160" /></Field>
          <Field label="Höhe bis (cm)"><input type="number" min="0" inputMode="numeric" value={form.heightMaxCm ?? ""} onChange={(event) => setValue("heightMaxCm", numberValue(event.target.value))} className={inputClass} placeholder="z. B. 180" /></Field>
          <Field label="Topfangabe"><select value={form.potType} onChange={(event) => setValue("potType", event.target.value as ArticleCaptureInput["potType"])} className={inputClass}><option value="">Nicht angegeben</option><option value="C">C – Liter</option><option value="M">M – Liter</option><option value="V">V – Durchmesser</option><option value="D">D – Durchmesser</option></select></Field>
          <Field label={form.potType === "V" || form.potType === "D" ? "Durchmesser (cm)" : "Volumen (Liter)"}><input type="number" min="0" step="0.1" inputMode="decimal" value={form.potValue ?? ""} onChange={(event) => setValue("potValue", numberValue(event.target.value))} className={inputClass} placeholder="z. B. 45" /></Field>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <h2 className="text-xl text-[var(--ph-green-dark)]">Wichtigste Kernpunkte</h2>
        <p className="mt-1 text-sm text-slate-500">Kurze Fakten für spätere Shop-, eBay- und Kleinanzeigen-Texte.</p>
        <div className="mt-5 space-y-3">
          {form.keyFacts.map((fact, index) => (
            <div key={index} className="flex gap-2">
              <input value={fact} onChange={(event) => setValue("keyFacts", form.keyFacts.map((item, position) => position === index ? event.target.value : item))} className={inputClass} placeholder={`Kernpunkt ${index + 1}, z. B. besonders alter knorriger Stamm`} />
              <button type="button" onClick={() => setValue("keyFacts", form.keyFacts.filter((_, position) => position !== index).length ? form.keyFacts.filter((_, position) => position !== index) : [""])} className="min-h-12 rounded-xl border border-slate-300 px-4 text-xl text-slate-500" aria-label={`Kernpunkt ${index + 1} entfernen`}>×</button>
            </div>
          ))}
          {form.keyFacts.length < 20 && <button type="button" onClick={() => setValue("keyFacts", [...form.keyFacts, ""])} className="rounded-xl border border-[var(--ph-green-dark)] px-4 py-2.5 text-sm font-bold text-[var(--ph-green-dark)]">+ Kernpunkt ergänzen</button>}
        </div>
        <div className="mt-5"><Field label="Weitere Notizen" hint="Besonderheiten, Zustand, Herkunft oder Hinweise für die spätere Textgenerierung."><textarea value={form.notes} onChange={(event) => setValue("notes", event.target.value)} className={`${inputClass} min-h-32 resize-y`} maxLength={8000} placeholder="Alles, was bei diesem konkreten Artikel wichtig ist …" /></Field></div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><h2 className="text-xl text-[var(--ph-green-dark)]">Fotos</h2><p className="mt-1 text-sm text-slate-500">Bis zu 24 Fotos. Das markierte Hauptfoto wird zuerst verwendet. Neue Fotos kannst du vor dem Speichern per KI freistellen.</p></div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">{(article?.photos.length ?? 0) + pendingPhotos.length}/24</span>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3 sm:flex sm:flex-wrap">
          <button type="button" onClick={() => cameraRef.current?.click()} className="min-h-24 rounded-2xl bg-[var(--ph-green-dark)] px-5 py-4 text-left font-bold text-white shadow-sm"><span className="block text-2xl">📷</span><span className="mt-1 block">Foto aufnehmen</span></button>
          <button type="button" onClick={() => galleryRef.current?.click()} className="min-h-24 rounded-2xl border-2 border-[var(--ph-green-dark)] bg-white px-5 py-4 text-left font-bold text-[var(--ph-green-dark)]"><span className="block text-2xl">▧</span><span className="mt-1 block">Vom Handy wählen</span></button>
          <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(event) => { void addFiles(event.target.files); event.target.value = ""; }} />
          <input ref={galleryRef} type="file" accept="image/*" multiple className="hidden" onChange={(event) => { void addFiles(event.target.files); event.target.value = ""; }} />
        </div>
        {article?.photos.length || pendingPhotos.length ? (
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {article?.photos.map((photo) => (
              <div key={photo.id} className={`overflow-hidden rounded-2xl border-2 bg-slate-100 ${article.primaryPhotoId === photo.id ? "border-[var(--ph-gold)]" : "border-transparent"}`}>
                <div className="aspect-square bg-cover bg-center" style={{ backgroundImage: `url(${JSON.stringify(photo.url).slice(1, -1)})` }} />
                <div className="space-y-2 bg-white p-2">
                  {article.primaryPhotoId === photo.id ? <span className="block text-xs font-bold text-amber-700">Hauptfoto</span> : <button type="button" onClick={() => void setPrimary(photo.id)} className="block text-xs font-bold text-[var(--ph-green-dark)]">Als Hauptfoto</button>}
                  <button type="button" onClick={() => void deletePhoto(photo.id)} className="text-xs font-semibold text-red-700">Foto entfernen</button>
                </div>
              </div>
            ))}
            {pendingPhotos.map((photo) => (
              <div key={photo.id} className={`overflow-hidden rounded-2xl border-2 ${photo.cutout ? "border-violet-400 bg-[linear-gradient(45deg,#e2e8f0_25%,transparent_25%),linear-gradient(-45deg,#e2e8f0_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#e2e8f0_75%),linear-gradient(-45deg,transparent_75%,#e2e8f0_75%)] bg-[length:20px_20px]" : "border-dashed border-green-400 bg-slate-100"}`}>
                <div className="aspect-square bg-contain bg-center bg-no-repeat" style={{ backgroundImage: `url(${JSON.stringify(photo.previewUrl).slice(1, -1)})` }} />
                <div className="space-y-2 bg-white p-2">
                  <span className={`block text-xs font-bold ${photo.cutout ? "text-violet-700" : "text-green-800"}`}>{photo.cutout ? "KI-freigestellt · noch speichern" : "Noch speichern"}</span>
                  {photo.cutout ? (
                    <button type="button" onClick={() => restorePending(photo)} disabled={Boolean(processingPhotoId)} className="block text-xs font-bold text-slate-700 disabled:opacity-40">Original verwenden</button>
                  ) : (
                    <button type="button" onClick={() => void cutoutPending(photo)} disabled={Boolean(processingPhotoId)} className="block rounded-lg bg-violet-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-40">{processingPhotoId === photo.id ? "KI stellt frei …" : "✨ Freistellen"}</button>
                  )}
                  <button type="button" onClick={() => removePending(photo.id)} disabled={processingPhotoId === photo.id} className="block text-xs font-semibold text-red-700 disabled:opacity-40">Auswahl entfernen</button>
                </div>
              </div>
            ))}
          </div>
        ) : <div className="mt-5 rounded-2xl border-2 border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">Noch keine Fotos ausgewählt.</div>}
      </section>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 p-3 shadow-[0_-8px_24px_rgba(15,23,42,0.08)] backdrop-blur sm:static sm:rounded-2xl sm:border sm:p-4 sm:shadow-sm">
        <div className="mx-auto flex max-w-[1200px] items-center justify-between gap-2">
          <Link href="/articles" className="rounded-xl px-3 py-3 text-sm font-bold text-slate-600">Abbrechen</Link>
          <div className="flex items-center gap-2">
            {uploadProgress && <span className="hidden text-xs font-semibold text-slate-500 sm:block">{uploadProgress}</span>}
            <button type="button" disabled={saving || Boolean(processingPhotoId)} onClick={() => void save("draft")} className="rounded-xl border border-[var(--ph-green-dark)] px-4 py-3 text-sm font-bold text-[var(--ph-green-dark)] disabled:opacity-50">{saving ? "Überträgt …" : "Entwurf speichern & übertragen"}</button>
            <button type="button" disabled={saving || Boolean(processingPhotoId)} onClick={() => void save("ready")} className="rounded-xl bg-[var(--ph-green-dark)] px-4 py-3 text-sm font-bold text-white disabled:opacity-50">Vollständig speichern & übertragen</button>
          </div>
        </div>
      </div>
    </div>
  );
}
