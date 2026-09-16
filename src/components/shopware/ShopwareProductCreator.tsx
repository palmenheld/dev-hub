"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ProductCandidate,
  PublishingSetup,
  ShopwareProductDraft,
  ShopwarePublishingSettings,
  WeclappFieldKey,
  WeclappFieldMap,
} from "@/types/shopwarePublishing";
import { SyncPlan } from "@/types/shopwareSync";
import ShopwareDraftReview from "./ShopwareDraftReview";
import ShopwareSyncPlanReview from "./ShopwareSyncPlanReview";

type Feedback = { kind: "success" | "error"; message: string };

const MAX_DRAFT_BATCH = 10;

const FIELD_LABELS: Array<{
  key: WeclappFieldKey;
  label: string;
  required: boolean;
}> = [
  { key: "germanName", label: "Deutscher Name", required: true },
  { key: "latinName", label: "Lateinischer Name", required: true },
  { key: "heightCm", label: "Höhe", required: true },
  { key: "potSize", label: "Topfgröße", required: false },
  { key: "images", label: "Fotos", required: true },
  { key: "stock", label: "Lagerbestand", required: false },
];

function formatPrice(value?: number) {
  if (value === undefined) return "–";
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
  }).format(value);
}

function draftStatusLabel(draft: ShopwareProductDraft) {
  if (draft.status === "published") return "In Shopware";
  if (draft.status === "publishing") return "Übertragung läuft";
  if (draft.status === "reconciliation_required") return "Ergebnis prüfen";
  if (draft.status === "blocked") return "Gesperrt";
  if (draft.approvedAt) return "Freigegeben";
  return "Prüfbereit";
}

export default function ShopwareProductCreator({
  enabled,
}: {
  enabled: boolean;
}) {
  const [setup, setSetup] = useState<PublishingSetup | null>(null);
  const [fieldMap, setFieldMap] = useState<WeclappFieldMap | null>(null);
  const [shopwareSettings, setShopwareSettings] =
    useState<ShopwarePublishingSettings | null>(null);
  const [candidates, setCandidates] = useState<ProductCandidate[]>([]);
  const [draft, setDraft] = useState<ShopwareProductDraft | null>(null);
  const [drafts, setDrafts] = useState<ShopwareProductDraft[]>([]);
  const [syncPlan, setSyncPlan] = useState<SyncPlan | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectedNewIds, setSelectedNewIds] = useState<string[]>([]);
  const [batchProgress, setBatchProgress] = useState(0);
  const [batchPublishing, setBatchPublishing] = useState(false);
  const [publishProgress, setPublishProgress] = useState(0);
  const [loadingSetup, setLoadingSetup] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [creatingArticleId, setCreatingArticleId] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [planning, setPlanning] = useState<"prices" | "stock" | null>(null);
  const [reconciling, setReconciling] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [onlyReady, setOnlyReady] = useState(true);
  const [candidatePage, setCandidatePage] = useState(1);
  const [candidateHasMore, setCandidateHasMore] = useState(false);

  const visibleCandidates = useMemo(
    () =>
      onlyReady
        ? candidates.filter((candidate) => candidate.eligible)
        : candidates,
    [candidates, onlyReady]
  );

  const publishableDrafts = useMemo(
    () =>
      drafts.filter(
        (item) =>
          item.status === "ready" &&
          item.validation.valid &&
          Boolean(item.approvedAt)
      ),
    [drafts]
  );

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    void (async () => {
      try {
        const response = await fetch("/api/channels/shopware/drafts", {
          cache: "no-store",
        });
        const payload = (await response.json()) as {
          drafts?: ShopwareProductDraft[];
          error?: string;
        };
        if (!response.ok || !payload.drafts) {
          throw new Error(
            payload.error || "Gespeicherte Entwürfe konnten nicht geladen werden."
          );
        }
        if (!cancelled) {
          setDrafts(payload.drafts);
          setDraft(payload.drafts[0] ?? null);
        }
      } catch (error) {
        if (!cancelled) {
          setFeedback({
            kind: "error",
            message:
              error instanceof Error ? error.message : "Unbekannter Fehler",
          });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled]);

  function rememberDraft(nextDraft: ShopwareProductDraft) {
    setDraft(nextDraft);
    setSelectedNewIds((current) =>
      current.filter((id) => id !== nextDraft.source.articleId)
    );
    setDrafts((current) => [
      ...current.filter(
        (item) => item.source.articleId !== nextDraft.source.articleId
      ),
      nextDraft,
    ]);
  }

  async function loadSetup() {
    if (!enabled) return;
    setLoadingSetup(true);
    setFeedback(null);
    try {
      const response = await fetch("/api/channels/shopware/setup", {
        cache: "no-store",
      });
      const payload = (await response.json()) as PublishingSetup & {
        error?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error || "Einrichtung konnte nicht geladen werden.");
      }
      setSetup(payload);
      setFieldMap(payload.fieldMap);
      setShopwareSettings(payload.shopwareSettings);
    } catch (error) {
      setFeedback({
        kind: "error",
        message: error instanceof Error ? error.message : "Unbekannter Fehler",
      });
    } finally {
      setLoadingSetup(false);
    }
  }

  async function saveSetup() {
    if (!fieldMap || !shopwareSettings) return;
    setSaving(true);
    setFeedback(null);
    try {
      const response = await fetch("/api/channels/shopware/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fieldMap, shopwareSettings }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error || "Einrichtung konnte nicht gespeichert werden.");
      }
      setFeedback({
        kind: "success",
        message: "Feldzuordnung gespeichert. Jetzt können passende Artikel geprüft werden.",
      });
      await loadCandidates();
    } catch (error) {
      setFeedback({
        kind: "error",
        message: error instanceof Error ? error.message : "Unbekannter Fehler",
      });
    } finally {
      setSaving(false);
    }
  }

  async function loadCandidates(page = candidatePage) {
    setLoadingCandidates(true);
    setFeedback(null);
    try {
      const [response, draftsResponse] = await Promise.all([
        fetch(
          "/api/channels/shopware/candidates?limit=100&page=" + page,
          { cache: "no-store" }
        ),
        fetch("/api/channels/shopware/drafts", { cache: "no-store" }),
      ]);
      const payload = (await response.json()) as {
        candidates?: ProductCandidate[];
        error?: string;
        page?: number;
        hasMore?: boolean;
      };
      const draftsPayload = (await draftsResponse.json()) as {
        drafts?: ShopwareProductDraft[];
      };
      if (!response.ok || !payload.candidates) {
        throw new Error(payload.error || "Artikel konnten nicht geprüft werden.");
      }
      setCandidates(payload.candidates);
      setCandidatePage(payload.page ?? page);
      setCandidateHasMore(Boolean(payload.hasMore));
      if (draftsResponse.ok && draftsPayload.drafts) {
        setDrafts(draftsPayload.drafts);
        setDraft((current) =>
          draftsPayload.drafts?.find((item) => item.id === current?.id) ??
          draftsPayload.drafts?.[0] ??
          current
        );
      }
      setSelectedNewIds([]);
      setSelectedIds([]);
      setSyncPlan(null);
    } catch (error) {
      setFeedback({
        kind: "error",
        message: error instanceof Error ? error.message : "Unbekannter Fehler",
      });
    } finally {
      setLoadingCandidates(false);
    }
  }

  async function createDraft(
    candidate: ProductCandidate,
    replaceExisting = false
  ) {
    if (
      replaceExisting &&
      !window.confirm(
        "Die bisherige Recherche und alle Korrekturen dieses Entwurfs werden ersetzt. Neu recherchieren?"
      )
    ) {
      return;
    }
    setCreatingArticleId(candidate.articleId);
    setDraft(null);
    setFeedback(null);
    try {
      const response = await fetch("/api/channels/shopware/drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          articleId: candidate.articleId,
          replaceExisting,
        }),
      });
      const payload = (await response.json()) as {
        draft?: ShopwareProductDraft;
        error?: string;
      };
      if (!response.ok || !payload.draft) {
        throw new Error(payload.error || "Entwurf konnte nicht erstellt werden.");
      }
      rememberDraft(payload.draft);
      setFeedback({
        kind: payload.draft.validation.valid ? "success" : "error",
        message: payload.draft.validation.valid
          ? "Der belegte Shopware-Entwurf ist fertig."
          : "Der Entwurf wurde wegen unzureichender Belege gesperrt.",
      });
    } catch (error) {
      setFeedback({
        kind: "error",
        message: error instanceof Error ? error.message : "Unbekannter Fehler",
      });
    } finally {
      setCreatingArticleId(null);
    }
  }

  async function createSelectedDrafts() {
    const selectedCandidates = candidates.filter(
      (candidate) =>
        selectedNewIds.includes(candidate.articleId) &&
        candidate.eligible &&
        !candidate.alreadyInShopware &&
        !drafts.some(
          (item) => item.source.articleId === candidate.articleId
        )
    );
    if (!selectedCandidates.length || creatingArticleId !== null) return;

    setCreatingArticleId("batch");
    setBatchProgress(0);
    setFeedback(null);
    const created: ShopwareProductDraft[] = [];
    const failed: string[] = [];

    for (const candidate of selectedCandidates) {
      try {
        const response = await fetch("/api/channels/shopware/drafts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ articleId: candidate.articleId }),
        });
        const payload = (await response.json()) as {
          draft?: ShopwareProductDraft;
          error?: string;
        };
        if (!response.ok || !payload.draft) {
          throw new Error(payload.error || "Entwurf konnte nicht erstellt werden.");
        }
        created.push(payload.draft);
        setDrafts((current) => [
          ...current.filter(
            (item) => item.source.articleId !== payload.draft!.source.articleId
          ),
          payload.draft!,
        ]);
      } catch {
        failed.push(candidate.articleId);
      }
      setBatchProgress((value) => value + 1);
    }

    if (created[0]) setDraft(created[0]);
    setSelectedNewIds(failed);
    setFeedback({
      kind: failed.length ? "error" : "success",
      message: failed.length
        ? `${created.length} KI-Entwürfe erstellt, ${failed.length} fehlgeschlagen. Die fehlgeschlagenen Artikel bleiben markiert.`
        : `${created.length} KI-Entwürfe erstellt. Bitte jeden Entwurf prüfen und einzeln freigeben.`,
    });
    setCreatingArticleId(null);
  }

  async function publish() {
    if (!draft || !draft.validation.valid || batchPublishing) return;
    if (
      !window.confirm(
        "Der Artikel wird in Shopware angelegt, bleibt aber inaktiv. Fortfahren?"
      )
    ) {
      return;
    }
    setPublishing(true);
    setFeedback(null);
    try {
      const response = await fetch(
        `/api/channels/shopware/drafts/${draft.id}/publish`,
        { method: "POST" }
      );
      const payload = (await response.json()) as {
        draft?: ShopwareProductDraft;
        error?: string;
      };
      if (!response.ok || !payload.draft) {
        if (payload.draft) rememberDraft(payload.draft);
        throw new Error(payload.error || "Shopware-Artikel konnte nicht angelegt werden.");
      }
      rememberDraft(payload.draft);
      setFeedback({
        kind: "success",
        message:
          "Der Artikel wurde mit Bildern in Shopware angelegt und bleibt bis zu deiner Prüfung inaktiv.",
      });
      await loadCandidates();
    } catch (error) {
      setFeedback({
        kind: "error",
        message: error instanceof Error ? error.message : "Unbekannter Fehler",
      });
    } finally {
      setPublishing(false);
    }
  }

  async function publishApprovedDrafts() {
    if (!publishableDrafts.length || batchPublishing || publishing) return;
    if (
      !window.confirm(
        publishableDrafts.length +
          " freigegebene Artikel werden inaktiv in Shopware angelegt. Fortfahren?"
      )
    ) {
      return;
    }

    setBatchPublishing(true);
    setPublishProgress(0);
    setFeedback(null);
    let publishedCount = 0;
    const failedArticleNumbers: string[] = [];

    for (const item of publishableDrafts) {
      try {
        const response = await fetch(
          "/api/channels/shopware/drafts/" + item.id + "/publish",
          { method: "POST" }
        );
        const payload = (await response.json()) as {
          draft?: ShopwareProductDraft;
          error?: string;
        };
        if (payload.draft) rememberDraft(payload.draft);
        if (!response.ok || !payload.draft) {
          throw new Error(payload.error || "Shopware-Artikel konnte nicht angelegt werden.");
        }
        publishedCount += 1;
      } catch {
        failedArticleNumbers.push(item.source.articleNumber);
      }
      setPublishProgress((value) => value + 1);
    }

    if (publishedCount > 0) await loadCandidates();
    setFeedback({
      kind: failedArticleNumbers.length ? "error" : "success",
      message: failedArticleNumbers.length
        ? publishedCount +
          " Artikel angelegt; fehlgeschlagen: " +
          failedArticleNumbers.join(", ") +
          ". Die betroffenen Entwürfe bleiben erhalten."
        : publishedCount +
          " Artikel wurden inaktiv in Shopware angelegt.",
    });
    setBatchPublishing(false);
  }

  async function reconcile() {
    if (!draft) return;
    setReconciling(true);
    setFeedback(null);
    try {
      const response = await fetch(
        `/api/channels/shopware/drafts/${draft.id}/reconcile`,
        { method: "POST" }
      );
      const payload = (await response.json()) as {
        draft?: ShopwareProductDraft;
        error?: string;
      };
      if (!response.ok || !payload.draft) {
        throw new Error(payload.error || "Status konnte nicht geprüft werden.");
      }
      rememberDraft(payload.draft);
      setFeedback({
        kind: "success",
        message:
          payload.draft.status === "published"
            ? "Das Produkt wurde in Shopware gefunden und als angelegt markiert."
            : "Kein Produkt gefunden. Der Entwurf kann sicher erneut angelegt werden.",
      });
    } catch (error) {
      setFeedback({
        kind: "error",
        message: error instanceof Error ? error.message : "Unbekannter Fehler",
      });
    } finally {
      setReconciling(false);
    }
  }
  function toggleSelected(articleId: string) {
    setSelectedIds((current) =>
      current.includes(articleId)
        ? current.filter((id) => id !== articleId)
        : [...current, articleId]
    );
  }

  function selectAllExisting() {
    const available = visibleCandidates
      .filter((candidate) => candidate.alreadyInShopware)
      .map((candidate) => candidate.articleId);

    setSelectedIds((current) =>
      available.length > 0 && available.every((id) => current.includes(id))
        ? []
        : available
    );
  }

  function toggleSelectedNew(articleId: string) {
    if (
      !selectedNewIds.includes(articleId) &&
      selectedNewIds.length >= MAX_DRAFT_BATCH
    ) {
      setFeedback({
        kind: "error",
        message: `Pro Recherchelauf sind höchstens 10 Artikel möglich.`,
      });
      return;
    }
    setSelectedNewIds((current) =>
      current.includes(articleId)
        ? current.filter((id) => id !== articleId)
        : [...current, articleId]
    );
  }

  function selectAllNew() {
    const available = visibleCandidates
      .filter(
        (candidate) =>
          candidate.eligible &&
          !candidate.alreadyInShopware &&
          !drafts.some(
            (item) => item.source.articleId === candidate.articleId
          )
      )
      .map((candidate) => candidate.articleId)
      .slice(0, MAX_DRAFT_BATCH);
    setSelectedNewIds((current) =>
      available.length > 0 && available.every((id) => current.includes(id))
        ? []
        : available
    );
  }

  async function createSyncPlan(process: "prices" | "stock") {
    if (!selectedIds.length) return;
    setPlanning(process);
    setFeedback(null);
    setSyncPlan(null);
    try {
      const response = await fetch("/api/channels/shopware/sync/plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ process, articleIds: selectedIds }),
      });
      const payload = (await response.json()) as {
        plan?: SyncPlan;
        error?: string;
      };
      if (!response.ok || !payload.plan) {
        throw new Error(
          payload.error || "Die Sync-Vorschau konnte nicht erstellt werden."
        );
      }
      setSyncPlan(payload.plan);
      setFeedback({
        kind: "success",
        message:
          "Vorschau erstellt. Du kannst jeden vorgeschlagenen Wert korrigieren.",
      });
    } catch (error) {
      setFeedback({
        kind: "error",
        message: error instanceof Error ? error.message : "Unbekannter Fehler",
      });
    } finally {
      setPlanning(null);
    }
  }

  return (
    <section className="mt-6 overflow-hidden rounded-2xl border bg-white shadow-sm">
      <div className="border-b bg-[var(--ph-green-light)] p-5">
        <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-[var(--ph-gold)]">
              Produktassistent
            </p>
            <h2 className="mt-1 text-2xl text-[var(--ph-green-dark)]">
              Weclapp → Shopware
            </h2>
            <p className="mt-1 max-w-3xl text-sm text-slate-600">
              Pflichtdaten prüfen, Pflanzenwissen mit mehreren Fachquellen
              belegen und einen kontrollierten Shopware-Entwurf anlegen.
            </p>
          </div>
          <button
            type="button"
            onClick={loadSetup}
            disabled={!enabled || loadingSetup}
            className="rounded-xl border border-[var(--ph-green-dark)] bg-white px-4 py-2.5 text-sm font-semibold text-[var(--ph-green-dark)] disabled:opacity-40"
          >
            {loadingSetup ? "Prüfe Felder…" : "Felder neu prüfen"}
          </button>
        </div>
      </div>

      <div className="grid gap-3 border-b p-5 md:grid-cols-3">
        {[
          ["1", "Zuordnen", "Weclapp-Felder und Shopware-Ziele einmal festlegen"],
          ["2", "Belegen", "Entwurf mit 2 Quellen, Winterhärte mit 3 Quellen"],
          ["3", "Prüfen & anlegen", "Produkt wird zunächst inaktiv gespeichert"],
        ].map(([number, title, text]) => (
          <div key={number} className="rounded-xl border p-4">
            <div className="text-xs font-bold text-[var(--ph-gold)]">
              SCHRITT {number}
            </div>
            <h3 className="mt-1 font-bold">{title}</h3>
            <p className="mt-1 text-sm text-slate-500">{text}</p>
          </div>
        ))}
      </div>

      <div className="border-b bg-amber-50 px-5 py-4 text-sm text-amber-900">
        <strong>Vor dem ersten Anlegen:</strong> Die Shopware-Rolle der
        Integration benötigt Lesen/Anlegen/Bearbeiten für Produkte und Medien
        sowie Lesen/Anlegen für Zusatzfelder. Löschen wird nur für die
        automatische Bereinigung fehlgeschlagener Bildimporte benötigt.
      </div>

      {feedback && (
        <div
          className={`mx-5 mt-5 rounded-xl border px-4 py-3 text-sm font-medium ${
            feedback.kind === "success"
              ? "border-green-200 bg-green-50 text-green-800"
              : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {feedback.message}
        </div>
      )}

      {setup && fieldMap && shopwareSettings && (
        <details className="border-b p-5" open={candidates.length === 0}>
          <summary className="cursor-pointer font-bold text-[var(--ph-green-dark)]">
            Einmalige Zuordnung und Shopware-Ziel
          </summary>
          <p className="mt-2 text-sm text-slate-500">
            Anhand echter Weclapp-Felder erkannt. Als Shopware-Preis wird GROSS1
            verwendet; fehlt GROSS1, nimmt der Hub den ersten gültigen
            Bruttopreis und kennzeichnet dessen Preisquelle. Fehlt ein eigenes Höhen- oder
            Topffeld, erkennt der Hub Angaben wie 120–140 cm, C45, V30 oder M50
            ersatzweise im Weclapp-Produktnamen.
          </p>

          <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {FIELD_LABELS.map((field) => (
              <label key={field.key} className="text-sm font-semibold">
                {field.label}
                {!field.required && (
                  <span className="ml-1 font-normal text-slate-400">(optional)</span>
                )}
                <select
                  value={fieldMap[field.key]}
                  onChange={(event) =>
                    setFieldMap({
                      ...fieldMap,
                      [field.key]: event.target.value,
                    })
                  }
                  className="mt-1 block w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 font-normal"
                >
                  <option value="">Nicht zugeordnet</option>
                  {setup.fieldOptions.map((option) => (
                    <option key={option.selector} value={option.selector}>
                      {option.label}
                      {option.sample ? ` — ${option.sample}` : ""}
                    </option>
                  ))}
                </select>
              </label>
            ))}

            <label className="text-sm font-semibold">
              Shopware-Steuersatz
              <select
                value={shopwareSettings.taxId}
                onChange={(event) =>
                  setShopwareSettings({
                    ...shopwareSettings,
                    taxId: event.target.value,
                  })
                }
                className="mt-1 block w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 font-normal"
              >
                <option value="">Bitte auswählen</option>
                {setup.shopwareOptions.taxes.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label} {option.detail ? `(${option.detail})` : ""}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-sm font-semibold">
              Währung
              <select
                value={shopwareSettings.currencyId}
                onChange={(event) =>
                  setShopwareSettings({
                    ...shopwareSettings,
                    currencyId: event.target.value,
                  })
                }
                className="mt-1 block w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 font-normal"
              >
                <option value="">Bitte auswählen</option>
                {setup.shopwareOptions.currencies.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label} {option.detail ? `(${option.detail})` : ""}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-sm font-semibold">
              Verkaufskanal
              <select
                value={shopwareSettings.salesChannelId}
                onChange={(event) =>
                  setShopwareSettings({
                    ...shopwareSettings,
                    salesChannelId: event.target.value,
                  })
                }
                className="mt-1 block w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 font-normal"
              >
                <option value="">Bitte auswählen</option>
                {setup.shopwareOptions.salesChannels.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label} {option.detail ? `(${option.detail})` : ""}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={saveSetup}
              disabled={saving}
              className="rounded-xl bg-[var(--ph-green-dark)] px-5 py-3 font-semibold text-white disabled:opacity-40"
            >
              {saving ? "Speichert…" : "Zuordnung speichern & Artikel prüfen"}
            </button>
            <span
              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                setup.researchConfigured
                  ? "bg-green-100 text-green-800"
                  : "bg-amber-100 text-amber-800"
              }`}
            >
              {setup.researchConfigured
                ? `Quellenrecherche bereit (${setup.researchModel})`
                : "OPENAI_API_KEY fehlt noch"}
            </span>
          </div>
        </details>
      )}

      <div className="border-b p-5">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div>
            <h3 className="font-bold">Weclapp-Artikel</h3>
            <p className="text-sm text-slate-500">
              {candidates.length
                ? `${candidates.filter((item) => item.eligible).length} von ${candidates.length} Artikeln sind vollständig.`
                : "Speichere zuerst die Zuordnung."}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <label className="flex items-center gap-2 rounded-xl border px-3 py-2 text-sm">
              <input
                type="checkbox"
                checked={onlyReady}
                onChange={(event) => setOnlyReady(event.target.checked)}
              />
              Nur fertige
            </label>
            <button
              type="button"
              onClick={() => loadCandidates(candidatePage - 1)}
              disabled={!setup || loadingCandidates || candidatePage <= 1}
              className="rounded-xl border px-3 py-2 text-sm font-semibold disabled:opacity-40"
            >
              Zurück
            </button>
            <span className="flex items-center px-1 text-sm font-semibold text-slate-600">
              Seite {candidatePage}
            </span>
            <button
              type="button"
              onClick={() => loadCandidates(candidatePage + 1)}
              disabled={!setup || loadingCandidates || !candidateHasMore}
              className="rounded-xl border px-3 py-2 text-sm font-semibold disabled:opacity-40"
            >
              Weiter
            </button>
            <button
              type="button"
              onClick={() => loadCandidates()}
              disabled={!setup || loadingCandidates}
              className="rounded-xl border px-4 py-2 text-sm font-semibold disabled:opacity-40"
            >
              {loadingCandidates ? "Prüft…" : "Artikel aktualisieren"}
            </button>
          </div>
        </div>
        {candidates.length > 0 && (
          <div className="mt-4 flex flex-col justify-between gap-3 rounded-xl border border-green-200 bg-green-50 p-3 sm:flex-row sm:items-center">
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={selectAllNew}
                className="rounded-lg border border-green-300 bg-white px-3 py-2 text-sm font-semibold"
              >
                Neue geeignete {selectedNewIds.length ? "abwählen" : "auswählen"}
              </button>
              <span className="text-sm text-green-900">
                {selectedNewIds.length} neue Artikel markiert · max. {MAX_DRAFT_BATCH} je Lauf
              </span>
            </div>
            <button
              type="button"
              onClick={createSelectedDrafts}
              disabled={!selectedNewIds.length || creatingArticleId !== null || !setup?.researchConfigured}
              className="rounded-lg bg-[var(--ph-gold)] px-4 py-2 text-sm font-bold text-slate-950 disabled:opacity-40"
            >
              {creatingArticleId === "batch"
                ? `${batchProgress} von ${selectedNewIds.length} recherchiert…`
                : `KI-Entwürfe für ${selectedNewIds.length} Artikel erstellen`}
            </button>
          </div>
        )}
        {candidates.length > 0 && (
          <div className="mt-4 flex flex-col justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:flex-row sm:items-center">
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={selectAllExisting}
                className="rounded-lg border bg-white px-3 py-2 text-sm font-semibold"
              >
                Bestehende {selectedIds.length ? "abwählen" : "auswählen"}
              </button>
              <span className="text-sm text-slate-600">
                {selectedIds.length} Artikel markiert
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => createSyncPlan("prices")}
                disabled={!selectedIds.length || planning !== null}
                className="rounded-lg border border-violet-300 bg-white px-3 py-2 text-sm font-semibold text-violet-900 disabled:opacity-40"
              >
                {planning === "prices"
                  ? "Preisvorschau läuft…"
                  : "Preise vergleichen"}
              </button>
              <button
                type="button"
                onClick={() => createSyncPlan("stock")}
                disabled={!selectedIds.length || planning !== null}
                className="rounded-lg border border-violet-300 bg-white px-3 py-2 text-sm font-semibold text-violet-900 disabled:opacity-40"
              >
                {planning === "stock"
                  ? "Bestandsvorschau läuft…"
                  : "Bestände vergleichen"}
              </button>
            </div>
          </div>
        )}

        <div className="mt-4 divide-y rounded-xl border">
          {visibleCandidates.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">
              {loadingCandidates
                ? "Weclapp-Artikel werden geprüft…"
                : candidates.length
                  ? "Mit diesem Filter sind keine Artikel sichtbar."
                  : "Noch keine Artikel geladen."}
            </div>
          ) : (
            visibleCandidates.map((candidate) => (
              <article
                key={candidate.articleId}
                className="grid gap-3 p-4 lg:grid-cols-[36px_64px_minmax(250px,1fr)_130px_180px_220px] lg:items-center"
              >
                <label className="flex h-9 w-9 items-center justify-center rounded-lg border bg-white">
                  <input
                    type="checkbox"
                    aria-label={`${candidate.articleNumber} auswählen`}
                    checked={
                      candidate.alreadyInShopware
                        ? selectedIds.includes(candidate.articleId)
                        : selectedNewIds.includes(candidate.articleId)
                    }
                    disabled={
                      !candidate.alreadyInShopware &&
                      (!candidate.eligible ||
                        drafts.some(
                          (item) =>
                            item.source.articleId === candidate.articleId
                        ))
                    }
                    onChange={() =>
                      candidate.alreadyInShopware
                        ? toggleSelected(candidate.articleId)
                        : toggleSelectedNew(candidate.articleId)
                    }
                  />
                </label>
                <div className="h-14 w-14 overflow-hidden rounded-lg bg-slate-100">
                  {candidate.imageUrls[0] ? (
                    // URLs come from the configured Weclapp image field.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={candidate.imageUrls[0]}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-xs text-slate-400">
                      –
                    </div>
                  )}
                </div>
                <div className="min-w-0">
                  <h4 className="truncate font-bold">
                    {candidate.germanName || "Ohne Namen"}
                  </h4>
                  <p className="truncate text-sm italic text-slate-500">
                    {candidate.latinName || "Lateinischer Name fehlt"}
                  </p>
                  <p className="mt-1 font-mono text-xs text-slate-400">
                    {candidate.articleNumber || candidate.articleId}
                  </p>
                </div>
                <div>
                  <div className="font-bold">{formatPrice(candidate.price)}</div>
                  {candidate.priceSource && (
                    <div
                      className={
                        candidate.priceFallback
                          ? "text-xs font-semibold text-amber-700"
                          : "text-xs text-slate-500"
                      }
                    >
                      {candidate.priceFallback ? "Fallback: " : "Preisquelle: "}
                      {candidate.priceSource}
                    </div>
                  )}
                  <div className="text-xs text-slate-500">
                    {candidate.heightLabel ||
                      (candidate.heightCm ? candidate.heightCm + " cm" : "ohne Höhe")}
                    {candidate.heightSource === "product_name"
                      ? " · aus Produktname"
                      : ""}
                  </div>
                  {candidate.potSize && (
                    <div className="text-xs text-slate-500">
                      Topf {candidate.potSize}
                      {candidate.potSizeSource === "product_name"
                        ? " · aus Produktname"
                        : ""}
                    </div>
                  )}
                </div>
                <div className="text-sm">
                  <div className="font-semibold">
                    {candidate.shippingClass?.label || "Versand offen"}
                  </div>
                  <div className="text-slate-500">
                    Bestand {candidate.stock ?? "nicht zugeordnet"}
                  </div>
                </div>
                <div className="lg:text-right">
                  {candidate.alreadyInShopware ? (
                    <span className="inline-flex rounded-full bg-blue-100 px-3 py-2 text-xs font-bold text-blue-800">
                      Bereits in Shopware
                    </span>
                  ) : drafts.some(
                      (item) => item.source.articleId === candidate.articleId
                    ) ? (
                    <button
                      type="button"
                      onClick={() =>
                        setDraft(
                          drafts.find(
                            (item) =>
                              item.source.articleId === candidate.articleId
                          ) ?? null
                        )
                      }
                      className="rounded-xl border border-[var(--ph-green-dark)] bg-white px-4 py-2.5 text-sm font-bold text-[var(--ph-green-dark)]"
                    >
                      Entwurf öffnen
                    </button>
                  ) : candidate.eligible ? (
                    <button
                      type="button"
                      onClick={() => createDraft(candidate)}
                      disabled={
                        !setup?.researchConfigured ||
                        creatingArticleId !== null
                      }
                      className="rounded-xl bg-[var(--ph-gold)] px-4 py-2.5 text-sm font-bold text-slate-950 disabled:opacity-40"
                    >
                      {creatingArticleId === candidate.articleId
                        ? "Recherchiert…"
                        : "Belegten Entwurf erstellen"}
                    </button>
                  ) : (
                    <div className="text-xs text-red-700">
                      Fehlt: {candidate.missing.join(", ")}
                    </div>
                  )}
                </div>
              </article>
            ))
          )}
        </div>
        {syncPlan && (
          <ShopwareSyncPlanReview
            plan={syncPlan}
            onChange={(updatedPlan, message) => {
              setSyncPlan(updatedPlan);
              setFeedback({
                kind:
                  updatedPlan.state === "partially_failed"
                    ? "error"
                    : "success",
                message,
              });
            }}
          />
        )}
      </div>

      {drafts.length > 0 && (
        <div className="border-b bg-slate-50 p-5">
          <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
            <div>
              <h3 className="font-bold text-[var(--ph-green-dark)]">KI-Entwürfe</h3>
              <p className="text-sm text-slate-500">
                Jeden Entwurf einzeln öffnen, korrigieren und freigeben.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-slate-600">
                {drafts.length} gespeicherte Entwürfe
              </span>
              <button
                type="button"
                onClick={publishApprovedDrafts}
                disabled={
                  publishableDrafts.length === 0 ||
                  batchPublishing ||
                  publishing
                }
                className="rounded-xl bg-[var(--ph-green-dark)] px-4 py-2 text-sm font-bold text-white disabled:opacity-40"
              >
                {batchPublishing
                  ? publishProgress + " Artikel verarbeitet…"
                  : publishableDrafts.length +
                    " freigegebene gesammelt anlegen"}
              </button>
            </div>
          </div>
          <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {drafts.map((item) => (
              <button
                type="button"
                key={item.id}
                onClick={() => setDraft(item)}
                aria-current={draft?.id === item.id ? "true" : undefined}
                className="rounded-xl border bg-white p-3 text-left aria-[current=true]:border-[var(--ph-green-dark)] aria-[current=true]:ring-2 aria-[current=true]:ring-green-100"
              >
                <span className="block font-mono text-xs text-slate-400">
                  {item.source.articleNumber}
                </span>
                <span className="mt-1 block truncate font-bold">{item.title}</span>
                <span className="mt-2 inline-flex rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">
                  {draftStatusLabel(item)}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {draft && (
        <div className="p-5">
          <div className="flex flex-col justify-between gap-4 lg:flex-row">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-[var(--ph-gold)]">
                Vorschau
              </p>
              <h3 className="mt-1 text-2xl text-[var(--ph-green-dark)]">
                {draft.title}
              </h3>
              <p className="mt-1 italic text-slate-500">
                {draft.research.confirmedLatinName}
              </p>
            </div>
            <div className="flex flex-wrap gap-2 lg:justify-end">
              <span className="rounded-full bg-slate-100 px-3 py-1.5 text-sm font-semibold">
                {formatPrice(draft.source.price)}
              </span>
              {draft.source.priceFallback && (
                <span className="rounded-full bg-amber-100 px-3 py-1.5 text-sm font-semibold text-amber-800">
                  Bruttopreis-Fallback: {draft.source.priceSource}
                </span>
              )}
              <span className="rounded-full bg-slate-100 px-3 py-1.5 text-sm font-semibold">
                {draft.source.shippingClass?.label}
              </span>
              <span
                className={`rounded-full px-3 py-1.5 text-sm font-semibold ${
                  draft.validation.valid
                    ? "bg-green-100 text-green-800"
                    : "bg-red-100 text-red-700"
                }`}
              >
                {draft.validation.valid ? "Belege vollständig" : "Gesperrt"}
              </span>
              {(draft.status === "ready" || draft.status === "blocked") && (
                <button
                  type="button"
                  onClick={() => createDraft(draft.source, true)}
                  disabled={creatingArticleId !== null}
                  className="rounded-full border bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 disabled:opacity-40"
                >
                  {creatingArticleId === draft.source.articleId
                    ? "Recherchiert neu…"
                    : "KI-Inhalte neu recherchieren"}
                </button>
              )}
            </div>
          </div>

          {(draft.validation.errors.length > 0 ||
            draft.validation.warnings.length > 0) && (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm">
              {draft.validation.errors.map((error) => (
                <p key={error} className="font-semibold text-red-700">
                  {error}
                </p>
              ))}
              {draft.validation.warnings.map((warning) => (
                <p key={warning} className="text-amber-800">
                  {warning}
                </p>
              ))}
            </div>
          )}

          <div className="mt-5 grid gap-4 lg:grid-cols-3">
            <div className="rounded-xl border p-4">
              <div className="text-xs font-bold uppercase text-slate-400">
                SEO
              </div>
              <div className="mt-2 font-semibold">{draft.research.metaTitle}</div>
              <p className="mt-2 text-sm text-slate-600">
                {draft.research.metaDescription}
              </p>
            </div>
            {[
              ["Sonne", draft.research.care.light.text],
              ["Wasser", draft.research.care.water.text],
              ["Dünger", draft.research.care.fertilizer.text],
              [
                "Winter",
                `${draft.research.winterHardy ? "Winterhart" : "Nicht sicher winterhart"}, bis ${draft.research.minTemperatureC} °C: ${draft.research.care.winter.text}`,
              ],
            ].map(([label, text]) => (
              <div key={label} className="rounded-xl border p-4">
                <div className="text-xs font-bold uppercase text-slate-400">
                  {label}
                </div>
                <p className="mt-2 text-sm leading-6 text-slate-700">{text}</p>
              </div>
            ))}
          </div>

          <div className="mt-5 space-y-4">
            {draft.research.blocks.map((block, index) => (
              <div key={`${block.key}-${index}`}>
                <h4 className="font-bold">{block.heading}</h4>
                <p className="mt-1 leading-7 text-slate-700">{block.text}</p>
                <p className="mt-1 text-xs text-slate-400">
                  Belege: {block.sourceIds.join(", ")}
                </p>
              </div>
            ))}
          </div>

          <details className="mt-5 rounded-xl border p-4">
            <summary className="cursor-pointer font-bold">
              {draft.sources.length} verwendete Quellen anzeigen
            </summary>
            <ol className="mt-3 space-y-2 text-sm">
              {draft.sources.map((source) => (
                <li key={source.id}>
                  <span className="mr-2 font-mono text-xs">{source.id}</span>
                  <a
                    href={source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-semibold text-[var(--ph-green-dark)] underline"
                  >
                    {source.title}
                  </a>
                  <span className="ml-2 text-slate-400">{source.publisher}</span>
                </li>
              ))}
            </ol>
          </details>
          <ShopwareDraftReview
            key={draft.updatedAt}
            draft={draft}
            onChange={(updatedDraft, message) => {
              rememberDraft(updatedDraft);
              setFeedback({ kind: "success", message });
            }}
          />

          <div className="mt-5 flex flex-col justify-between gap-3 rounded-xl bg-slate-950 p-4 text-white sm:flex-row sm:items-center">
            <p className="text-sm text-slate-300">
              Erst nach deiner Inhaltsfreigabe wird der Artikel übertragen. Er
              bleibt in Shopware anschließend weiterhin inaktiv, bis du ihn dort
              abschließend freischaltest.
            </p>
            {draft.status === "reconciliation_required" ||
            draft.status === "publishing" ? (
              <button
                type="button"
                onClick={reconcile}
                disabled={reconciling}
                className="shrink-0 rounded-xl bg-blue-400 px-5 py-3 font-bold text-slate-950 disabled:opacity-40"
              >
                {reconciling ? "Status wird geprüft…" : "Shopware-Status prüfen"}
              </button>
            ) : (
              <button
                type="button"
                onClick={publish}
                disabled={
                  publishing ||
                  batchPublishing ||
                  !draft.validation.valid ||
                  !draft.approvedAt ||
                  draft.status === "published"
                }
                className="shrink-0 rounded-xl bg-[var(--ph-gold)] px-5 py-3 font-bold text-slate-950 disabled:opacity-40"
              >
                {draft.status === "published"
                  ? "In Shopware angelegt"
                  : publishing
                    ? "Wird angelegt…"
                    : "Inaktiv in Shopware anlegen"}
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
