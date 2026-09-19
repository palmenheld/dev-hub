"use client";

import { useEffect, useMemo, useState } from "react";
import { renderEbayDescription } from "@/services/ebay/description";
import { emptyJsonPost } from "@/lib/http";
import type {
  EbayAspect,
  EbayCategorySuggestion,
  EbayConditionOption,
  EbayConnection,
  EbayDraftJob,
  EbayListingTemplate,
  EbayListingDraft,
  EbayListingOptions,
  EbayPublishingSettings,
  EbaySandboxBootstrapInput,
  EbaySandboxBootstrapResult,
  EbaySandboxBootstrapStep,
  EbaySetup,
} from "@/types/ebay";
import type { ProductCandidate } from "@/types/shopwarePublishing";

type Feedback = { kind: "success" | "error"; message: string };
const MAX_BATCH = 10;
const JOB_POLL_INTERVAL_MS = 2_000;
const JOB_MAX_WAIT_MS = 20 * 60 * 1_000;
const DEFAULT_SANDBOX_SETUP: EbaySandboxBootstrapInput = {
  merchantLocationKey: "palmenheld-lager",
  locationName: "Palmenheld Lager",
  postalCode: "",
  city: "",
  country: "DE",
  fulfillmentPolicyName: "Palmenheld Standardversand",
  shippingServiceCode: "DE_DHLPaket",
  shippingCost: 6.9,
  handlingDays: 2,
  paymentPolicyName: "Palmenheld Zahlung",
  returnPolicyName: "Palmenheld Rückgabe 30 Tage",
  returnDays: 30,
  returnShippingCostPayer: "BUYER",
};

function money(value?: number, currency = "EUR") {
  if (value === undefined) return "–";
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency,
  }).format(value);
}

function status(draft: EbayListingDraft) {
  if (draft.status === "published") return "Aktiv bei eBay";
  if (draft.status === "paused") return "Pausiert";
  if (
    draft.status === "reconciliation_required" ||
    draft.status === "management_reconciliation_required"
  ) return "Status prüfen";
  if (draft.status === "publishing") return "Übertragung läuft";
  if (draft.status === "blocked") return "Noch unvollständig";
  if (draft.approvedAt) return "Freigegeben";
  return "Prüfbereit";
}

function listingOptions(draft: EbayListingDraft): EbayListingOptions {
  return draft.options ?? {
    subtitle: "",
    condition: draft.condition || "NEW",
    conditionDescription: "",
    brand: "",
    mpn: "",
    ean: "",
    imageUrls: draft.source.imageUrls.slice(0, 24),
    includeCatalogProductDetails: false,
    bestOfferEnabled: false,
  };
}

function editableDraft(draft: EbayListingDraft) {
  const copy = structuredClone(draft);
  copy.options = listingOptions(copy);
  copy.condition = copy.options.condition;
  return copy;
}

function editableState(draft: EbayListingDraft) {
  return JSON.stringify({
    title: draft.title,
    descriptionHtml: draft.descriptionHtml,
    categoryId: draft.categoryId,
    categoryName: draft.categoryName,
    aspects: draft.aspects,
    price: draft.price,
    quantity: draft.quantity,
    options: listingOptions(draft),
  });
}

async function waitForDraftJob(jobId: string) {
  const deadline = Date.now() + JOB_MAX_WAIT_MS;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, JOB_POLL_INTERVAL_MS));
    const response = await fetch(
      `/api/channels/ebay/draft-jobs?id=${encodeURIComponent(jobId)}`,
      { cache: "no-store" }
    );
    const payload = (await response.json()) as {
      job?: EbayDraftJob;
      draft?: EbayListingDraft | null;
      error?: string;
    };
    if (!response.ok || !payload.job) {
      throw new Error(
        payload.error || "Der KI-Auftrag konnte nicht gelesen werden."
      );
    }
    if (payload.job.status === "completed") {
      if (!payload.draft) {
        throw new Error("Der KI-Auftrag ist fertig, aber der Entwurf fehlt.");
      }
      return payload.draft;
    }
    if (payload.job.status === "failed") {
      throw new Error(
        payload.job.error || "Die KI-Erstellung ist fehlgeschlagen."
      );
    }
  }
  throw new Error(
    "Die KI-Erstellung dauert länger als 20 Minuten. Der Auftrag läuft möglicherweise weiter."
  );
}

export default function EbayModule({
  initialConnection,
  initialSettings,
  initialFeedback = null,
}: {
  initialConnection: EbayConnection;
  initialSettings: EbayPublishingSettings;
  initialFeedback?: Feedback | null;
}) {
  const [connection, setConnection] = useState(initialConnection);
  const [setup, setSetup] = useState<EbaySetup | null>(null);
  const [settings, setSettings] = useState<EbayPublishingSettings>(initialSettings);
  const [candidates, setCandidates] = useState<ProductCandidate[]>([]);
  const [drafts, setDrafts] = useState<EbayListingDraft[]>([]);
  const [active, setActive] = useState<EbayListingDraft | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [onlyActive, setOnlyActive] = useState(true);
  const [onlyReady, setOnlyReady] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(initialFeedback);
  const [busy, setBusy] = useState("");
  const [progress, setProgress] = useState(0);
  const [form, setForm] = useState<EbayListingDraft | null>(null);
  const [categoryQuery, setCategoryQuery] = useState("");
  const [categories, setCategories] = useState<EbayCategorySuggestion[]>([]);
  const [aspects, setAspects] = useState<EbayAspect[]>([]);
  const [conditions, setConditions] = useState<EbayConditionOption[]>([]);
  const [templates, setTemplates] = useState<EbayListingTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("none");
  const [templateName, setTemplateName] = useState("");
  const [templateTitlePattern, setTemplateTitlePattern] = useState("{ki_titel}");
  const [templatePriceAdjustment, setTemplatePriceAdjustment] = useState("0");
  const [templateQuantityLimit, setTemplateQuantityLimit] = useState("");
  const [templateDefault, setTemplateDefault] = useState(true);
  const [bootstrapForm, setBootstrapForm] = useState({
    ...DEFAULT_SANDBOX_SETUP,
  });
  const [bootstrapSteps, setBootstrapSteps] =
    useState<EbaySandboxBootstrapStep[]>([]);

  useEffect(() => {
    const parameters = new URLSearchParams(window.location.search);
    const connected = parameters.get("ebayConnected");
    const error = parameters.get("ebayError");
    if (connected || error) {
      parameters.delete("ebayConnected");
      parameters.delete("ebayError");
      const query = parameters.toString();
      window.history.replaceState(
        {},
        "",
        `${window.location.pathname}${query ? `?${query}` : ""}`
      );
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const parameters = new URLSearchParams(window.location.search);
      const directArticleId = parameters.get("articleId")?.trim() || "";
      if (directArticleId) {
        setBusy("direct-draft");
        setFeedback({
          kind: "success",
          message:
            "Der Weclapp-Artikel wird geladen und der eBay-Entwurf per KI vorbereitet…",
        });
      }
      try {
        const [draftResponse, templateResponse] = await Promise.all([
          fetch("/api/channels/ebay/drafts", { cache: "no-store" }),
          fetch("/api/channels/ebay/templates", { cache: "no-store" }),
        ]);
        const draftPayload = (await draftResponse.json()) as {
          drafts?: EbayListingDraft[];
          error?: string;
        };
        const templatePayload = (await templateResponse.json()) as {
          templates?: EbayListingTemplate[];
          error?: string;
        };
        if (!draftResponse.ok || !draftPayload.drafts) {
          throw new Error(
            draftPayload.error || "Entwürfe konnten nicht geladen werden."
          );
        }
        if (!templateResponse.ok || !templatePayload.templates) {
          throw new Error(
            templatePayload.error || "Templates konnten nicht geladen werden."
          );
        }

        let loadedDrafts = draftPayload.drafts;
        let directDraft: EbayListingDraft | null = null;
        const directWasExisting = loadedDrafts.some(
          (draft) => draft.source.articleId === directArticleId
        );
        if (directArticleId) {
          if (!/^\d+$/.test(directArticleId)) {
            throw new Error("Die übergebene Weclapp-Artikel-ID ist ungültig.");
          }
          const directResponse = await fetch("/api/channels/ebay/drafts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ articleId: directArticleId }),
          });
          const directPayload = (await directResponse.json()) as {
            draft?: EbayListingDraft;
            error?: string;
          };
          if (!directResponse.ok || !directPayload.draft) {
            throw new Error(
              directPayload.error || "Der eBay-Entwurf konnte nicht erstellt werden."
            );
          }
          directDraft = directPayload.draft;
          loadedDrafts = [
            directDraft,
            ...loadedDrafts.filter(
              (draft) => draft.source.articleId !== directDraft?.source.articleId
            ),
          ];
          parameters.delete("articleId");
          const query = parameters.toString();
          window.history.replaceState(
            {},
            "",
            `${window.location.pathname}${query ? `?${query}` : ""}`
          );
        }

        if (!cancelled) {
          const first = directDraft || loadedDrafts[0] || null;
          const defaultTemplate = templatePayload.templates.find(
            (template) => template.isDefault
          );
          setTemplates(templatePayload.templates);
          setSelectedTemplateId(defaultTemplate?.id || "none");
          setDrafts(loadedDrafts);
          setActive(first);
          setForm(first ? editableDraft(first) : null);
          setCategoryQuery(first?.title ?? "");
          if (directDraft) {
            setFeedback({
              kind: "success",
              message: directWasExisting
                ? `Der vorhandene eBay-Entwurf für ${directDraft.source.articleNumber} wurde geöffnet.`
                : directDraft.contentReuse
                  ? `Der eBay-Entwurf für ${directDraft.source.articleNumber} wurde ohne neue KI-Berechnung aus SKU ${directDraft.contentReuse.sourceArticleNumber} übernommen. Größe, Topf, Preis, Bestand und Bilder stammen aus dem neuen Weclapp-Artikel.`
                  : `Der eBay-Entwurf für ${directDraft.source.articleNumber} wurde aus Weclapp erstellt${directDraft.templateName ? ` und mit „${directDraft.templateName}“ vorbelegt` : ""}.`,
            });
          }
          setBusy("");
          if (
            first?.categoryId &&
            initialConnection.configured
          ) {
            const aspectsResponse = await fetch(
              `/api/channels/ebay/categories/${first.categoryId}/aspects`,
              { cache: "no-store" }
            );
            const aspectsPayload = (await aspectsResponse.json()) as {
              aspects?: EbayAspect[];
              conditions?: EbayConditionOption[];
            };
            if (!cancelled && aspectsResponse.ok && aspectsPayload.aspects) {
              setAspects(aspectsPayload.aspects);
              setConditions(aspectsPayload.conditions ?? []);
            }
          }
        }
      } catch (error) {
        if (!cancelled) {
          setFeedback({
            kind: "error",
            message: error instanceof Error ? error.message : "Unbekannter Fehler",
          });
          setBusy("");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initialConnection.configured]);

  const visible = useMemo(
    () =>
      candidates.filter(
        (candidate) =>
          (!onlyActive || candidate.active !== false) &&
          (!onlyReady || candidate.eligible)
      ),
    [candidates, onlyActive, onlyReady]
  );
  const formDirty = Boolean(
    active && form && editableState(active) !== editableState(form)
  );
  const settingsMatch = (draft: EbayListingDraft) =>
    JSON.stringify(draft.publishingSettings) === JSON.stringify(settings);
  const settingsChanged = Boolean(
    active &&
      (active.status === "ready" ||
        active.status === "blocked" ||
        active.status === "reconciliation_required") &&
      !settingsMatch(active)
  );
  const approved = drafts.filter(
    (draft) =>
      draft.status === "ready" &&
      draft.validation.valid &&
      Boolean(draft.approvedAt) &&
      settingsMatch(draft)
  );
  const activeIsEditable =
    active?.status === "ready" || active?.status === "blocked";

  function selectDraft(draft: EbayListingDraft | null) {
    setActive(draft);
    setForm(draft ? editableDraft(draft) : null);
    setCategoryQuery(draft?.title ?? "");
    setCategories([]);
    setAspects([]);
    setConditions([]);
    if (draft?.categoryId && connection.configured) {
      void loadAspects(draft.categoryId);
    }
  }

  function remember(draft: EbayListingDraft) {
    setDrafts((current) => [
      draft,
      ...current.filter((item) => item.source.articleId !== draft.source.articleId),
    ]);
    selectDraft(draft);
  }

  async function testConnection() {
    setBusy("connection");
    setFeedback(null);
    try {
      const response = await fetch("/api/channels/ebay/connection", emptyJsonPost());
      const payload = (await response.json()) as {
        setup?: EbaySetup;
        connection?: EbayConnection;
        error?: string;
      };
      if (!response.ok || !payload.setup) {
        if (payload.connection) setConnection(payload.connection);
        throw new Error(payload.error || "Verbindungstest fehlgeschlagen.");
      }
      setSetup(payload.setup);
      setSettings(payload.setup.settings);
      setConnection(payload.setup.connection);
      setFeedback({
        kind: "success",
        message: payload.setup.warnings?.length
          ? "Die eBay-OAuth-Verbindung funktioniert. Hinweise aus der Sandbox werden unten einzeln angezeigt."
          : "eBay ist verbunden. Bitte einmal Lagerort und Richtlinien wählen.",
      });
    } catch (error) {
      setFeedback({
        kind: "error",
        message: error instanceof Error ? error.message : "Unbekannter Fehler",
      });
    } finally {
      setBusy("");
    }
  }

  async function bootstrapSandbox() {
    const production = connection.environment === "production";
    const confirmed = window.confirm(
      production
        ? "Der Hub legt genau einen Lagerort im echten eBay-Konto an. Es wird keine Anzeige veröffentlicht. Fortfahren?"
        : "Der Hub aktiviert jetzt eBay-Geschäftsrichtlinien und legt Lagerort sowie drei Sandbox-Richtlinien an. Es wird keine Anzeige veröffentlicht. Fortfahren?"
    );
    if (!confirmed) return;
    const securityKey = production
      ? window.prompt("Bitte den privaten eBay-Sicherheitscode eingeben:")
      : "";
    if (securityKey === null) return;

    setBusy("sandbox-bootstrap");
    setFeedback(null);
    setBootstrapSteps([]);
    try {
      const response = await fetch("/api/channels/ebay/bootstrap", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(securityKey ? { "X-Palmenheld-Publish-Key": securityKey } : {}),
        },
        body: JSON.stringify(bootstrapForm),
      });
      const payload = (await response.json()) as
        | EbaySandboxBootstrapResult
        | { error?: string };
      if (!response.ok || !("setup" in payload)) {
        throw new Error(
          ("error" in payload && payload.error) ||
            "Die eBay-Grundeinrichtung ist fehlgeschlagen."
        );
      }
      setSetup(payload.setup);
      setSettings(payload.setup.settings);
      setConnection(payload.setup.connection);
      setBootstrapSteps(payload.steps);
      setFeedback({
        kind: payload.completed ? "success" : "error",
        message: payload.completed
          ? production
            ? "Der Live-Lagerort wurde angelegt und als eBay-Ziel gespeichert."
            : "Die eBay-Sandbox ist vollständig vorbereitet und als Ziel gespeichert."
          : "eBay hat nur einen Teil der Einrichtung angenommen. Die Ergebnisse stehen direkt darunter; fehlgeschlagene Schritte können erneut versucht werden.",
      });
    } catch (error) {
      setFeedback({
        kind: "error",
        message: error instanceof Error ? error.message : "Unbekannter Fehler",
      });
    } finally {
      setBusy("");
    }
  }

  async function authorizeSeller() {
    setBusy("authorization");
    setFeedback(null);
    try {
      const response = await fetch("/api/channels/ebay/oauth/start", emptyJsonPost());
      const payload = (await response.json()) as {
        authorizationUrl?: string;
        error?: string;
      };
      if (!response.ok || !payload.authorizationUrl) {
        throw new Error(
          payload.error || "Die eBay-Anmeldung konnte nicht gestartet werden."
        );
      }
      window.location.assign(payload.authorizationUrl);
    } catch (error) {
      setFeedback({
        kind: "error",
        message: error instanceof Error ? error.message : "Unbekannter Fehler",
      });
      setBusy("");
    }
  }

  async function saveSetup() {
    if (!settings) return;
    setBusy("setup");
    setFeedback(null);
    try {
      const response = await fetch("/api/channels/ebay/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings }),
      });
      const payload = (await response.json()) as {
        connection?: EbayConnection;
        error?: string;
      };
      if (!response.ok || !payload.connection) {
        throw new Error(payload.error || "Einrichtung konnte nicht gespeichert werden.");
      }
      setConnection(payload.connection);
      setFeedback({
        kind: "success",
        message: payload.connection.publishReady
          ? "eBay-Ziel ist vollständig eingerichtet."
          : `Gespeichert. Noch offen: ${payload.connection.missingPublishingSetup.join(", ")}.`,
      });
    } catch (error) {
      setFeedback({
        kind: "error",
        message: error instanceof Error ? error.message : "Unbekannter Fehler",
      });
    } finally {
      setBusy("");
    }
  }

  async function loadCandidates(targetPage = page, activeOnly = onlyActive) {
    setBusy("candidates");
    setFeedback(null);
    try {
      const [candidateResponse, draftResponse] = await Promise.all([
        fetch(`/api/channels/ebay/candidates?limit=100&page=${targetPage}&onlyActive=${activeOnly ? "1" : "0"}`, {
          cache: "no-store",
        }),
        fetch("/api/channels/ebay/drafts", { cache: "no-store" }),
      ]);
      const payload = (await candidateResponse.json()) as {
        candidates?: ProductCandidate[];
        page?: number;
        hasMore?: boolean;
        error?: string;
      };
      const draftPayload = (await draftResponse.json()) as {
        drafts?: EbayListingDraft[];
      };
      if (!candidateResponse.ok || !payload.candidates) {
        throw new Error(payload.error || "Artikel konnten nicht geladen werden.");
      }
      setCandidates(payload.candidates);
      setPage(payload.page || targetPage);
      setHasMore(Boolean(payload.hasMore));
      setSelected([]);
      if (draftPayload.drafts) setDrafts(draftPayload.drafts);
      const eligibleCount = payload.candidates.filter(
        (candidate) => candidate.eligible
      ).length;
      const activeCount = payload.candidates.filter(
        (candidate) => candidate.active !== false
      ).length;
      setFeedback({
        kind: "success",
        message: `${payload.candidates.length} Weclapp-Artikel geladen: ${activeCount} aktiv, ${eligibleCount} vollständig für einen eBay-Entwurf.`,
      });
    } catch (error) {
      setFeedback({
        kind: "error",
        message: error instanceof Error ? error.message : "Unbekannter Fehler",
      });
    } finally {
      setBusy("");
    }
  }

  function toggle(id: string) {
    setSelected((current) => {
      if (current.includes(id)) return current.filter((item) => item !== id);
      if (current.length >= MAX_BATCH) {
        setFeedback({
          kind: "error",
          message: `Pro KI-Lauf können höchstens ${MAX_BATCH} Artikel markiert werden.`,
        });
        return current;
      }
      return [...current, id];
    });
  }

  function selectReady() {
    const possible = visible
      .filter(
        (item) =>
          item.eligible &&
          !drafts.some((draft) => draft.source.articleId === item.articleId)
      )
      .slice(0, MAX_BATCH)
      .map((item) => item.articleId);
    setSelected(
      possible.length && possible.every((id) => selected.includes(id))
        ? []
        : possible
    );
  }

  async function createSelected() {
    const ids = selected.slice(0, MAX_BATCH);
    if (!ids.length) return;
    setBusy("drafts");
    setProgress(0);
    setFeedback(null);
    const failed: Array<{ articleId: string; message: string }> = [];
    let first: EbayListingDraft | undefined;
    for (const articleId of ids) {
      try {
        const response = await fetch("/api/channels/ebay/draft-jobs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            articleId,
            templateId: selectedTemplateId,
          }),
        });
        const payload = (await response.json()) as {
          job?: EbayDraftJob;
          error?: string;
        };
        if (!response.ok || !payload.job) {
          throw new Error(
            payload.error || "KI-Auftrag konnte nicht gestartet werden."
          );
        }
        const draft = await waitForDraftJob(payload.job.id);
        first ||= draft;
        setDrafts((current) => [
          draft,
          ...current.filter(
            (item) => item.source.articleId !== draft.source.articleId
          ),
        ]);
      } catch (error) {
        failed.push({
          articleId,
          message:
            error instanceof Error ? error.message : "Unbekannter Fehler",
        });
      }
      setProgress((value) => value + 1);
    }
    if (first) selectDraft(first);
    setSelected(failed.map((item) => item.articleId));
    setFeedback({
      kind: failed.length ? "error" : "success",
      message: failed.length
        ? `${ids.length - failed.length} Entwürfe erstellt, ${failed.length} fehlgeschlagen. ${failed
            .map((item) => {
              const article = candidates.find(
                (candidate) => candidate.articleId === item.articleId
              );
              return `${article?.articleNumber || item.articleId}: ${item.message}`;
            })
            .join(" | ")}`
        : `${ids.length} KI-Entwürfe erstellt${selectedTemplateId !== "none" ? " und mit dem gewählten Template vorbelegt" : ""}. Als Nächstes Kategorie und Merkmale prüfen.`,
    });
    setBusy("");
  }

  async function saveTemplate() {
    if (!active || !form || formDirty) return;
    setBusy("template-save");
    setFeedback(null);
    try {
      const response = await fetch("/api/channels/ebay/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceDraftId: active.id,
          name: templateName,
          titlePattern: templateTitlePattern,
          priceAdjustmentPercent: templatePriceAdjustment,
          quantityLimit: templateQuantityLimit,
          isDefault: templateDefault,
        }),
      });
      const payload = (await response.json()) as {
        template?: EbayListingTemplate;
        error?: string;
      };
      if (!response.ok || !payload.template) {
        throw new Error(payload.error || "Template konnte nicht gespeichert werden.");
      }
      const savedTemplate = payload.template;
      setTemplates((current) => [
        savedTemplate,
        ...current
          .filter((template) => template.id !== savedTemplate.id)
          .map((template) =>
            savedTemplate.isDefault ? { ...template, isDefault: false } : template
          ),
      ]);
      setSelectedTemplateId(savedTemplate.id);
      setTemplateName("");
      setFeedback({
        kind: "success",
        message: `Template „${savedTemplate.name}“ wurde gespeichert und ausgewählt.`,
      });
    } catch (error) {
      setFeedback({
        kind: "error",
        message: error instanceof Error ? error.message : "Unbekannter Fehler",
      });
    } finally {
      setBusy("");
    }
  }

  async function deleteTemplate(template: EbayListingTemplate) {
    if (!window.confirm(`Template „${template.name}“ wirklich löschen?`)) return;
    setBusy(`template-delete-${template.id}`);
    setFeedback(null);
    try {
      const response = await fetch(
        `/api/channels/ebay/templates/${encodeURIComponent(template.id)}`,
        { method: "DELETE" }
      );
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error || "Template konnte nicht gelöscht werden.");
      }
      const remaining = templates.filter((item) => item.id !== template.id);
      setTemplates(remaining);
      if (selectedTemplateId === template.id) {
        setSelectedTemplateId(
          remaining.find((item) => item.isDefault)?.id || "none"
        );
      }
      setFeedback({
        kind: "success",
        message: `Template „${template.name}“ wurde gelöscht.`,
      });
    } catch (error) {
      setFeedback({
        kind: "error",
        message: error instanceof Error ? error.message : "Unbekannter Fehler",
      });
    } finally {
      setBusy("");
    }
  }
  async function searchCategories() {
    if (categoryQuery.trim().length < 2) return;
    setBusy("categories");
    try {
      const response = await fetch(
        "/api/channels/ebay/categories?q=" + encodeURIComponent(categoryQuery),
        { cache: "no-store" }
      );
      const payload = (await response.json()) as {
        categories?: EbayCategorySuggestion[];
        error?: string;
      };
      if (!response.ok || !payload.categories) {
        throw new Error(payload.error || "Kategorien konnten nicht geladen werden.");
      }
      setCategories(payload.categories);
    } catch (error) {
      setFeedback({
        kind: "error",
        message: error instanceof Error ? error.message : "Unbekannter Fehler",
      });
    } finally {
      setBusy("");
    }
  }

  async function loadAspects(categoryId: string) {
    try {
      const response = await fetch(
        `/api/channels/ebay/categories/${categoryId}/aspects`,
        { cache: "no-store" }
      );
      const payload = (await response.json()) as {
        aspects?: EbayAspect[];
        conditions?: EbayConditionOption[];
        error?: string;
      };
      if (!response.ok || !payload.aspects) {
        throw new Error(payload.error || "Merkmale konnten nicht geladen werden.");
      }
      setAspects(payload.aspects);
      setConditions(payload.conditions ?? []);
    } catch (error) {
      setFeedback({
        kind: "error",
        message: error instanceof Error ? error.message : "Unbekannter Fehler",
      });
    }
  }

  function chooseCategory(category: EbayCategorySuggestion) {
    if (!form) return;
    setForm({ ...form, categoryId: category.id, categoryName: category.name });
    setCategories([]);
    void loadAspects(category.id);
  }

  function setListingOptions(patch: Partial<EbayListingOptions>) {
    if (!form) return;
    const options = { ...listingOptions(form), ...patch };
    setForm({
      ...form,
      condition: options.condition,
      options,
      approvedAt: undefined,
    });
  }

  function setPackageDetails(
    patch: Partial<NonNullable<EbayListingOptions["packageDetails"]>>
  ) {
    if (!form) return;
    const current = listingOptions(form);
    setListingOptions({
      packageDetails: {
        packageType: "PARCEL_OR_PADDED_ENVELOPE",
        shippingIrregular: false,
        ...current.packageDetails,
        ...patch,
      },
    });
  }

  function toggleListingImage(url: string) {
    if (!form) return;
    const current = listingOptions(form);
    setListingOptions({
      imageUrls: current.imageUrls.includes(url)
        ? current.imageUrls.filter((item) => item !== url)
        : [...current.imageUrls, url].slice(0, 24),
    });
  }

  function moveListingImage(index: number, direction: -1 | 1) {
    if (!form) return;
    const imageUrls = [...listingOptions(form).imageUrls];
    const target = index + direction;
    if (target < 0 || target >= imageUrls.length) return;
    [imageUrls[index], imageUrls[target]] = [imageUrls[target], imageUrls[index]];
    setListingOptions({ imageUrls });
  }

  function setAspect(name: string, value: string) {
    if (!form) return;
    const values = value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    setForm({
      ...form,
      aspects: { ...form.aspects, [name]: values },
      approvedAt: undefined,
    });
  }

  function setAspectValues(name: string, values: string[]) {
    if (!form) return;
    setForm({
      ...form,
      aspects: { ...form.aspects, [name]: values },
      approvedAt: undefined,
    });
  }

  async function saveDraft() {
    if (!form) return;
    setBusy("save");
    setFeedback(null);
    try {
      const response = await fetch(`/api/channels/ebay/drafts/${form.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title,
          descriptionHtml: form.descriptionHtml,
          categoryId: form.categoryId,
          categoryName: form.categoryName,
          aspects: form.aspects,
          price: form.price,
          quantity: form.quantity,
          options: listingOptions(form),
        }),
      });
      const payload = (await response.json()) as {
        draft?: EbayListingDraft;
        error?: string;
      };
      if (!response.ok || !payload.draft) {
        throw new Error(payload.error || "Entwurf konnte nicht gespeichert werden.");
      }
      remember(payload.draft);
      setFeedback({
        kind: payload.draft.validation.valid ? "success" : "error",
        message: payload.draft.validation.valid
          ? "Korrekturen gespeichert. Der Entwurf kann jetzt freigegeben werden."
          : "Gespeichert. Bitte die offenen Prüfpunkte ergänzen.",
      });
    } catch (error) {
      setFeedback({
        kind: "error",
        message: error instanceof Error ? error.message : "Unbekannter Fehler",
      });
    } finally {
      setBusy("");
    }
  }

  async function act(
    action:
      | "approve"
      | "publish"
      | "reconcile"
      | "resume"
      | "discard"
      | "regenerate"
      | "sync"
      | "pause"
      | "reactivate"
      | "sanitize-copy"
  ) {
    if (!active) return;
    if (
      action === "regenerate" &&
      !window.confirm(
        "Titel und Beschreibung werden neu recherchiert und ersetzt. Kategorie, Merkmale, Preis und Bestand bleiben erhalten. Fortfahren?"
      )
    ) return;
    if (
      action === "sanitize-copy" &&
      !window.confirm(
        "Das Palmenheld-Design wird jetzt direkt auf das aktive eBay-Angebot übertragen. Fortfahren?"
      )
    ) return;
    if (
      (action === "publish" || action === "resume") &&
      !window.confirm(
        "Diese Aktion veröffentlicht die Anzeige sofort und kostenpflichtige eBay-Gebühren können entstehen. Wirklich veröffentlichen?"
      )
    ) return;
    if (
      action === "reactivate" &&
      !window.confirm(
        "Das pausierte Angebot wird wieder live bei eBay veröffentlicht. Dabei können eBay-Gebühren entstehen. Wirklich reaktivieren?"
      )
    ) return;
    if (
      action === "pause" &&
      !window.confirm(
        "Die aktive eBay-Anzeige wird beendet und im Hub als pausiert geführt. Das Angebot bleibt für eine spätere Reaktivierung erhalten. Wirklich pausieren?"
      )
    ) return;
    if (
      action === "discard" &&
      !window.confirm(
        "Das noch nicht veröffentlichte eBay-Angebot und der Inventar-Zwischenstand werden gelöscht. Fortfahren?"
      )
    ) return;
    const protectedAction =
      action === "publish" ||
      action === "resume" ||
      action === "discard" ||
      action === "pause" ||
      action === "reactivate" ||
      action === "sanitize-copy";
    const publishKey = protectedAction
      ? window.prompt("Bitte den privaten eBay-Sicherheitscode eingeben:")
      : "";
    if (protectedAction && publishKey === null) return;
    setBusy(action);
    setFeedback(null);
    try {
      if (action === "regenerate") {
        const response = await fetch("/api/channels/ebay/draft-jobs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ draftId: active.id }),
        });
        const payload = (await response.json()) as {
          job?: EbayDraftJob;
          error?: string;
        };
        if (!response.ok || !payload.job) {
          throw new Error(
            payload.error || "KI-Neugenerierung konnte nicht gestartet werden."
          );
        }
        const draft = await waitForDraftJob(payload.job.id);
        remember(draft);
        setFeedback({
          kind: "success",
          message:
            "Text und eBay-Merkmale wurden neu erzeugt und müssen erneut geprüft werden.",
        });
        return;
      }
      const response = await fetch(
        `/api/channels/ebay/drafts/${active.id}/${action}`,
        emptyJsonPost(
          publishKey
            ? { "X-Palmenheld-Publish-Key": publishKey }
            : {}
        )
      );
      const payload = (await response.json()) as {
        draft?: EbayListingDraft;
        error?: string;
      };
      if (!response.ok || !payload.draft) {
        if (payload.draft) remember(payload.draft);
        throw new Error(payload.error || "Aktion fehlgeschlagen.");
      }
      remember(payload.draft);
      setFeedback({
        kind: "success",
        message:
          action === "sanitize-copy"
            ? "Das Palmenheld-Design wurde auf das aktive eBay-Angebot übertragen."
            : action === "approve"
              ? "Entwurf ausdrücklich freigegeben."
              : action === "publish" || action === "resume"
                ? "Die Anzeige wurde bei eBay veröffentlicht."
                : action === "pause"
                  ? "Die eBay-Anzeige wurde pausiert und kann später reaktiviert werden."
                  : action === "reactivate"
                    ? "Die eBay-Anzeige ist wieder aktiv."
                    : action === "discard"
                      ? "Der eBay-Zwischenstand wurde verworfen. Der Entwurf muss erneut freigegeben werden."
                      : payload.draft.status === "published"
                        ? "eBay bestätigt: Die Anzeige ist aktiv."
                        : payload.draft.status === "paused"
                          ? "eBay bestätigt: Die Anzeige ist pausiert."
                          : "Der eBay-Status bleibt ungeklärt. Bitte den Abgleich später erneut ausführen.",
      });
    } catch (error) {
      setFeedback({
        kind: "error",
        message: error instanceof Error ? error.message : "Unbekannter Fehler",
      });
    } finally {
      setBusy("");
    }
  }

  async function publishAllApproved() {
    if (!approved.length || formDirty) return;
    if (
      !window.confirm(
        `${approved.length} freigegebene Anzeigen werden jetzt live bei eBay veröffentlicht. Dabei können Gebühren entstehen. Fortfahren?`
      )
    ) return;
    const publishKey = window.prompt(
      "Bitte den privaten eBay-Sicherheitscode eingeben:"
    );
    if (publishKey === null) return;
    setBusy("publish-all");
    setProgress(0);
    let completed = 0;
    const failed: string[] = [];
    for (const item of approved) {
      try {
        const response = await fetch(
          `/api/channels/ebay/drafts/${item.id}/publish`,
          emptyJsonPost({
            "X-Palmenheld-Publish-Key": publishKey,
          })
        );
        const payload = (await response.json()) as {
          draft?: EbayListingDraft;
        };
        if (payload.draft) remember(payload.draft);
        if (!response.ok || !payload.draft) throw new Error();
        completed += 1;
      } catch {
        failed.push(item.source.articleNumber);
      }
      setProgress((value) => value + 1);
    }
    setFeedback({
      kind: failed.length ? "error" : "success",
      message: failed.length
        ? `${completed} veröffentlicht; bitte prüfen: ${failed.join(", ")}.`
        : `${completed} Anzeigen wurden veröffentlicht.`,
    });
    setBusy("");
  }

  const connectionColor =
    connection.state === "connected"
      ? "border-green-200 bg-green-50"
      : connection.state === "error"
        ? "border-red-200 bg-red-50"
        : "border-amber-200 bg-amber-50";

  return (
    <div className="mx-auto max-w-[1600px]">
      <header>
        <p className="text-sm font-semibold uppercase tracking-wide text-[var(--ph-gold)]">
          Verkaufskanal
        </p>
        <h1 className="mt-1 text-3xl text-[var(--ph-green-dark)]">eBay</h1>
        <p className="mt-2 max-w-4xl text-slate-500">
          Weclapp-Artikel auswählen, Pflanzenwissen belegt per KI ergänzen,
          eBay-Kategorie und Pflichtmerkmale prüfen und erst nach deiner
          ausdrücklichen Freigabe veröffentlichen.
        </p>
      </header>

      <section className={`mt-6 rounded-2xl border p-5 ${connectionColor}`}>
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-bold">{connection.label}</h2>
              <span className="rounded-full border bg-white px-2.5 py-1 text-xs font-semibold">
                {connection.environment === "production"
                  ? "Produktivsystem"
                  : "Testumgebung"}
              </span>
            </div>
            <p className="mt-1 text-sm text-slate-600">{connection.description}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {connection.authorizationReady && !connection.configured && (
              <button
                type="button"
                onClick={authorizeSeller}
                disabled={Boolean(busy)}
                className="rounded-xl bg-[var(--ph-green-dark)] px-5 py-3 font-semibold text-white disabled:opacity-40"
              >
                {busy === "authorization"
                  ? "Weiterleitung zu eBay…"
                  : "Mit eBay verbinden"}
              </button>
            )}
            <button
              type="button"
              onClick={testConnection}
              disabled={!connection.configured || Boolean(busy)}
              className="rounded-xl border border-[var(--ph-green-dark)] bg-white px-5 py-3 font-semibold text-[var(--ph-green-dark)] disabled:opacity-40"
            >
              {busy === "connection" ? "Verbindung wird geprüft…" : "Verbindung testen"}
            </button>
          </div>
        </div>
      </section>

      {!connection.configured && (
        <section className="mt-5 rounded-2xl border bg-white p-5 shadow-sm">
          <h2 className="text-xl text-[var(--ph-green-dark)]">
            eBay-Zugang einmalig einrichten
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            Hinterlege die Werte für das gewählte Zielsystem serverseitig. Den
            Verkäufer-Schlüssel erzeugt der Hub anschließend über „Mit eBay verbinden“
            und gibt ihn niemals an den Browser aus.
          </p>
          <div className="mt-4 rounded-xl bg-slate-950 p-4 font-mono text-sm text-slate-100">
            <div>EBAY_ENVIRONMENT=sandbox oder production</div>
            <div>EBAY_SANDBOX_CLIENT_ID=... / EBAY_PRODUCTION_CLIENT_ID=...</div>
            <div>EBAY_SANDBOX_CLIENT_SECRET=... / EBAY_PRODUCTION_CLIENT_SECRET=...</div>
            <div>EBAY_SANDBOX_RUNAME=... / EBAY_PRODUCTION_RUNAME=...</div>
            <div>EBAY_OAUTH_CALLBACK_URL=https://…/api/channels/ebay/oauth/callback</div>
            <div>EBAY_PUBLISH_KEY=privater Sicherheitscode</div>
            <div>EBAY_MARKETPLACE_ID=EBAY_DE</div>
          </div>
          <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
            <p className="font-bold">Im eBay Developer Portal</p>
            <p className="mt-1">
              Beim passenden Sandbox- oder Production-Keyset einen Redirect URL name
              anlegen. Als „Auth Accepted URL“ und „Auth Declined URL“ dieselbe
              HTTPS-Rücksprungadresse aus der Zeile oben eintragen. Den erzeugten
              Redirect-Namen in die passende umgebungsspezifische Variable übernehmen.
            </p>
            {connection.oauthCallbackUrl && (
              <p className="mt-2 break-all font-mono text-xs">
                Rücksprungadresse: {connection.oauthCallbackUrl}
              </p>
            )}
          </div>
          {connection.authorizationReady && (
            <p className="mt-3 font-semibold text-green-800">
              App-ID, Cert-ID und Redirect-Name wurden erkannt. Du kannst das
              Verkäuferkonto jetzt oben verbinden.
            </p>
          )}
          <p className="mt-3 text-sm font-semibold text-amber-800">
            Sandbox und Produktion bleiben vollständig getrennt. In Produktion sind
            Schreibzugriffe zusätzlich gesperrt, bis EBAY_PRODUCTION_WRITES_ENABLED
            bewusst auf true gesetzt wird.
          </p>
        </section>
      )}

      {feedback && (
        <div className={`mt-5 rounded-xl border px-4 py-3 text-sm font-medium ${
          feedback.kind === "success"
            ? "border-green-200 bg-green-50 text-green-800"
            : "border-red-200 bg-red-50 text-red-700"
        }`}>
          {feedback.message}
        </div>
      )}

      {setup && settings && (
        <section className="mt-5 rounded-2xl border bg-white p-5 shadow-sm">
          <h2 className="text-xl text-[var(--ph-green-dark)]">
            Einmaliges eBay-Ziel
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Die Auswahlwerte wurden direkt aus deinem eBay-Konto geladen.
          </p>
          {setup.warnings?.length ? (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              <p className="font-bold">eBay-Sandbox nur teilweise verfügbar</p>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {setup.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {(connection.environment === "sandbox" || setup.locations.length === 0) && (
            <details
              className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-4"
              open={Boolean(setup.warnings?.length)}
            >
              <summary className="cursor-pointer font-bold text-blue-950">
                {connection.environment === "production"
                  ? "Fehlenden Live-Lagerort anlegen"
                  : "eBay-Sandbox automatisch einrichten"}
              </summary>
              <p className="mt-2 text-sm text-blue-900">
                {connection.environment === "production"
                  ? "Der Hub legt ausschließlich einen API-Lagerort im echten eBay-Konto an. Dafür zählen nur Lagerort-Schlüssel, Name, Postleitzahl und Ort; es wird keine Anzeige veröffentlicht."
                  : "Der Hub aktiviert die Geschäftsrichtlinien und legt einen Lagerort sowie je eine Versand-, Zahlungs- und Rückgaberichtlinie an. Dabei wird keine Anzeige veröffentlicht."}
              </p>
              <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <label className="text-sm font-semibold">
                  Lagerort-Schlüssel
                  <input
                    value={bootstrapForm.merchantLocationKey}
                    onChange={(event) =>
                      setBootstrapForm({
                        ...bootstrapForm,
                        merchantLocationKey: event.target.value,
                      })
                    }
                    className="mt-1 block w-full rounded-xl border bg-white px-3 py-2.5 font-normal"
                  />
                </label>
                <label className="text-sm font-semibold">
                  Name des Lagerorts
                  <input
                    value={bootstrapForm.locationName}
                    onChange={(event) =>
                      setBootstrapForm({
                        ...bootstrapForm,
                        locationName: event.target.value,
                      })
                    }
                    className="mt-1 block w-full rounded-xl border bg-white px-3 py-2.5 font-normal"
                  />
                </label>
                <label className="text-sm font-semibold">
                  Postleitzahl
                  <input
                    value={bootstrapForm.postalCode}
                    onChange={(event) =>
                      setBootstrapForm({
                        ...bootstrapForm,
                        postalCode: event.target.value,
                      })
                    }
                    placeholder="z. B. 47608"
                    className="mt-1 block w-full rounded-xl border bg-white px-3 py-2.5 font-normal"
                  />
                </label>
                <label className="text-sm font-semibold">
                  Ort <span className="font-normal text-slate-500">(optional)</span>
                  <input
                    value={bootstrapForm.city}
                    onChange={(event) =>
                      setBootstrapForm({
                        ...bootstrapForm,
                        city: event.target.value,
                      })
                    }
                    className="mt-1 block w-full rounded-xl border bg-white px-3 py-2.5 font-normal"
                  />
                </label>
                <label className="text-sm font-semibold">
                  Versanddienst
                  <select
                    value={bootstrapForm.shippingServiceCode}
                    onChange={(event) =>
                      setBootstrapForm({
                        ...bootstrapForm,
                        shippingServiceCode: event.target.value,
                      })
                    }
                    className="mt-1 block w-full rounded-xl border bg-white px-3 py-2.5 font-normal"
                  >
                    <option value="DE_DHLPaket">DHL Paket</option>
                    <option value="DE_HermesPaket">Hermes Paket</option>
                    <option value="DE_DPD">DPD</option>
                    <option value="DE_GLS">GLS</option>
                    <option value="DE_Paket">Paketversand</option>
                  </select>
                </label>
                <label className="text-sm font-semibold">
                  Versandkosten in EUR
                  <input
                    type="number"
                    min="0"
                    max="9999"
                    step="0.01"
                    value={bootstrapForm.shippingCost}
                    onChange={(event) =>
                      setBootstrapForm({
                        ...bootstrapForm,
                        shippingCost: Number(event.target.value),
                      })
                    }
                    className="mt-1 block w-full rounded-xl border bg-white px-3 py-2.5 font-normal"
                  />
                </label>
                <label className="text-sm font-semibold">
                  Bearbeitungszeit
                  <select
                    value={bootstrapForm.handlingDays}
                    onChange={(event) =>
                      setBootstrapForm({
                        ...bootstrapForm,
                        handlingDays: Number(event.target.value),
                      })
                    }
                    className="mt-1 block w-full rounded-xl border bg-white px-3 py-2.5 font-normal"
                  >
                    {[0, 1, 2, 3, 5, 10].map((days) => (
                      <option key={days} value={days}>
                        {days === 0 ? "am selben Tag" : `${days} Werktag${days === 1 ? "" : "e"}`}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm font-semibold">
                  Rückgabefrist
                  <select
                    value={bootstrapForm.returnDays}
                    onChange={(event) =>
                      setBootstrapForm({
                        ...bootstrapForm,
                        returnDays: Number(event.target.value) as 30 | 60,
                      })
                    }
                    className="mt-1 block w-full rounded-xl border bg-white px-3 py-2.5 font-normal"
                  >
                    <option value={30}>30 Tage</option>
                    <option value={60}>60 Tage</option>
                  </select>
                </label>
                <label className="text-sm font-semibold">
                  Rücksendekosten
                  <select
                    value={bootstrapForm.returnShippingCostPayer}
                    onChange={(event) =>
                      setBootstrapForm({
                        ...bootstrapForm,
                        returnShippingCostPayer: event.target.value as
                          | "BUYER"
                          | "SELLER",
                      })
                    }
                    className="mt-1 block w-full rounded-xl border bg-white px-3 py-2.5 font-normal"
                  >
                    <option value="BUYER">Käufer trägt die Kosten</option>
                    <option value="SELLER">Verkäufer trägt die Kosten</option>
                  </select>
                </label>
              </div>
              <details className="mt-4 rounded-xl border border-blue-200 bg-white p-3">
                <summary className="cursor-pointer text-sm font-semibold">
                  Namen der Richtlinien anpassen
                </summary>
                <div className="mt-3 grid gap-3 md:grid-cols-3">
                  {([
                    ["fulfillmentPolicyName", "Versandrichtlinie"],
                    ["paymentPolicyName", "Zahlungsrichtlinie"],
                    ["returnPolicyName", "Rückgaberichtlinie"],
                  ] as const).map(([key, label]) => (
                    <label key={key} className="text-sm font-semibold">
                      {label}
                      <input
                        value={bootstrapForm[key]}
                        onChange={(event) =>
                          setBootstrapForm({
                            ...bootstrapForm,
                            [key]: event.target.value,
                          })
                        }
                        className="mt-1 block w-full rounded-xl border px-3 py-2.5 font-normal"
                      />
                    </label>
                  ))}
                </div>
              </details>
              <button
                type="button"
                onClick={bootstrapSandbox}
                disabled={Boolean(busy) || !bootstrapForm.postalCode.trim()}
                className="mt-4 rounded-xl bg-[var(--ph-green-dark)] px-5 py-3 font-semibold text-white disabled:opacity-40"
              >
                {busy === "sandbox-bootstrap"
                  ? "eBay wird eingerichtet…"
                  : connection.environment === "production"
                    ? "Live-Lagerort sicher anlegen"
                    : "eBay-Sandbox jetzt einrichten"}
              </button>
              {!bootstrapForm.postalCode.trim() && (
                <p className="mt-2 text-xs font-semibold text-amber-800">
                  Bitte zuerst die Postleitzahl des Versandlagers eintragen.
                </p>
              )}
              {bootstrapSteps.length > 0 && (
                <ul className="mt-4 space-y-2">
                  {bootstrapSteps.map((item) => (
                    <li
                      key={item.key}
                      className="flex flex-col gap-1 rounded-lg border bg-white px-3 py-2 text-sm sm:flex-row sm:items-start"
                    >
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-bold ${
                          item.status === "failed"
                            ? "bg-red-100 text-red-800"
                            : item.status === "created"
                              ? "bg-green-100 text-green-800"
                              : "bg-slate-100 text-slate-700"
                        }`}
                      >
                        {item.status === "failed"
                          ? "Fehlgeschlagen"
                          : item.status === "created"
                            ? "Angelegt"
                            : "Vorhanden"}
                      </span>
                      <span>
                        <strong>{item.label}:</strong> {item.detail}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </details>
          )}
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {([
              ["merchantLocationKey", "Lagerort", setup.locations],
              ["fulfillmentPolicyId", "Versandrichtlinie", setup.fulfillmentPolicies],
              ["paymentPolicyId", "Zahlungsrichtlinie", setup.paymentPolicies],
              ["returnPolicyId", "Rückgaberichtlinie", setup.returnPolicies],
            ] as const).map(([key, label, options]) => (
              <label key={key} className="text-sm font-semibold">
                {label}
                <select
                  value={settings[key]}
                  onChange={(event) =>
                    setSettings({ ...settings, [key]: event.target.value })
                  }
                  className="mt-1 block w-full rounded-xl border px-3 py-2.5 font-normal"
                >
                  <option value="">Bitte auswählen</option>
                  {settings[key] &&
                    !options.some((option) => option.id === settings[key]) && (
                      <option value={settings[key]}>
                        Gespeichert: {settings[key]}
                      </option>
                    )}
                  {options.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}{option.detail ? ` – ${option.detail}` : ""}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <button
            type="button"
            onClick={saveSetup}
            disabled={Boolean(busy)}
            className="mt-4 rounded-xl bg-[var(--ph-green-dark)] px-5 py-3 font-semibold text-white disabled:opacity-40"
          >
            {busy === "setup" ? "Speichert…" : "eBay-Ziel speichern"}
          </button>
        </section>
      )}

      <section className="mt-5 rounded-2xl border bg-white p-5 shadow-sm">
        <div className="flex flex-col justify-between gap-2 lg:flex-row lg:items-start">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-[var(--ph-gold)]">
              Wiederverwendbare Vorgaben
            </p>
            <h2 className="mt-1 text-xl text-[var(--ph-green-dark)]">
              eBay-Templates
            </h2>
            <p className="mt-1 max-w-4xl text-sm text-slate-600">
              Ein Template übernimmt Kategorie, Merkmale, Zustand, Angebotsoptionen,
              Paketdaten, Titelmuster sowie optionale Preis- und Bestandsregeln. SKU, Bilder, Grundpreis und verfügbarer Bestand
              werden bei jedem neuen Entwurf frisch aus Weclapp gelesen.
            </p>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold">
            {templates.length} gespeichert
          </span>
        </div>

        {templates.length ? (
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            {templates.map((template) => (
              <article key={template.id} className="rounded-xl border p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-bold">{template.name}</h3>
                      {template.isDefault && (
                        <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-800">
                          Standard für „Für eBay“
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-slate-600">
                      {template.categoryName} ({template.categoryId})
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => deleteTemplate(template)}
                    disabled={Boolean(busy)}
                    className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-700 disabled:opacity-40"
                  >
                    {busy === `template-delete-${template.id}` ? "Löscht…" : "Löschen"}
                  </button>
                </div>
                <dl className="mt-3 grid gap-2 text-xs text-slate-600 sm:grid-cols-2">
                  <div>
                    <dt className="font-semibold text-slate-900">Titelmuster</dt>
                    <dd>{template.titlePattern}</dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-slate-900">Verkaufsregeln</dt>
                    <dd>
                      Preis {template.priceAdjustmentPercent >= 0 ? "+" : ""}
                      {template.priceAdjustmentPercent} % · Bestand max. {template.quantityLimit ?? "unbegrenzt"}
                    </dd>
                  </div>
                </dl>
              </article>
            ))}
          </div>
        ) : (
          <p className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
            Noch kein Template gespeichert. Öffne oder erstelle zuerst einen Entwurf,
            wähle Kategorie und Merkmale und speichere ihn.
          </p>
        )}

        <details className="mt-4 rounded-xl border p-4">
          <summary className="cursor-pointer font-bold">
            Aktuellen Entwurf als Template speichern
          </summary>
          {active && form ? (
            <div className="mt-4">
              <p className="text-sm text-slate-600">
                Quelle: {active.source.articleNumber} · {active.categoryName || "Kategorie fehlt noch"}
              </p>
              <div className="mt-3 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <label className="text-sm font-semibold">
                  Template-Name
                  <input
                    value={templateName}
                    onChange={(event) => setTemplateName(event.target.value)}
                    placeholder="z. B. Palmen bis 120 cm"
                    maxLength={80}
                    className="mt-1 block w-full rounded-xl border px-3 py-2.5 font-normal"
                  />
                </label>
                <label className="text-sm font-semibold md:col-span-2">
                  Titelmuster
                  <input
                    value={templateTitlePattern}
                    onChange={(event) => setTemplateTitlePattern(event.target.value)}
                    maxLength={240}
                    className="mt-1 block w-full rounded-xl border px-3 py-2.5 font-normal"
                  />
                  <span className="text-xs font-normal text-slate-500">
                    Platzhalter: {"{ki_titel}"}, {"{name_de}"}, {"{name_latein}"}, {"{hoehe}"}, {"{topf}"}, {"{sku}"}
                  </span>
                </label>
                <label className="text-sm font-semibold">
                  Preisänderung in %
                  <input
                    type="number"
                    min="-90"
                    max="1000"
                    step="0.01"
                    value={templatePriceAdjustment}
                    onChange={(event) => setTemplatePriceAdjustment(event.target.value)}
                    className="mt-1 block w-full rounded-xl border px-3 py-2.5 font-normal"
                  />
                </label>
                <label className="text-sm font-semibold">
                  Maximaler eBay-Bestand
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={templateQuantityLimit}
                    onChange={(event) => setTemplateQuantityLimit(event.target.value)}
                    placeholder="Kein Limit"
                    className="mt-1 block w-full rounded-xl border px-3 py-2.5 font-normal"
                  />
                </label>
                <label className="flex items-center gap-2 self-end rounded-xl border px-3 py-2.5 text-sm font-semibold">
                  <input
                    type="checkbox"
                    checked={templateDefault}
                    onChange={(event) => setTemplateDefault(event.target.checked)}
                  />
                  Als Standard verwenden
                </label>
              </div>
              {formDirty && (
                <p className="mt-3 text-sm font-semibold text-amber-800">
                  Bitte die Änderungen am Entwurf zuerst speichern.
                </p>
              )}
              <button
                type="button"
                onClick={saveTemplate}
                disabled={
                  Boolean(busy) ||
                  formDirty ||
                  !active.categoryId ||
                  templateName.trim().length < 2
                }
                className="mt-4 rounded-xl bg-[var(--ph-green-dark)] px-4 py-2.5 font-semibold text-white disabled:opacity-40"
              >
                {busy === "template-save" ? "Template wird gespeichert…" : "Template speichern"}
              </button>
            </div>
          ) : (
            <p className="mt-3 text-sm text-slate-600">
              Erstelle oder öffne zuerst einen eBay-Entwurf.
            </p>
          )}
        </details>
      </section>

      <section className="mt-6 overflow-hidden rounded-2xl border bg-white shadow-sm">
        <div className="border-b bg-[var(--ph-green-light)] p-5">
          <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-[var(--ph-gold)]">
                Produktassistent
              </p>
              <h2 className="mt-1 text-2xl text-[var(--ph-green-dark)]">
                Weclapp → eBay
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                Dieselbe Höhen-, Topf-, Preis- und Quellenlogik wie im Shopware-Assistenten.
              </p>
            </div>
            <button
              type="button"
              onClick={() => loadCandidates()}
              disabled={Boolean(busy)}
              className="rounded-xl border border-[var(--ph-green-dark)] bg-white px-4 py-2.5 text-sm font-semibold text-[var(--ph-green-dark)] disabled:opacity-40"
            >
              {busy === "candidates" ? "Lädt…" : "Weclapp-Artikel laden"}
            </button>
          </div>
        </div>

        <div className="border-b p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-2 rounded-xl border px-3 py-2 text-sm">
                <input
                  type="checkbox"
                  checked={onlyActive}
                  disabled={Boolean(busy)}
                  onChange={(event) => {
                    const checked = event.target.checked;
                    setOnlyActive(checked);
                    setSelected([]);
                    void loadCandidates(1, checked);
                  }}
                />
                Nur aktive
              </label>
              <label className="flex items-center gap-2 rounded-xl border px-3 py-2 text-sm">
                <input
                  type="checkbox"
                  checked={onlyReady}
                  onChange={(event) => setOnlyReady(event.target.checked)}
                />
                Nur vollständige
              </label>
              <button
                type="button"
                onClick={selectReady}
                disabled={!candidates.length}
                className="rounded-xl border px-3 py-2 text-sm font-semibold disabled:opacity-40"
              >
                Geeignete {selected.length ? "abwählen" : "auswählen"}
              </button>
              <span className="text-sm text-slate-500">
                {selected.length} markiert · max. {MAX_BATCH}
              </span>
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <label className="text-xs font-semibold text-slate-600">
                Template für neue Entwürfe
                <select
                  value={selectedTemplateId}
                  onChange={(event) => setSelectedTemplateId(event.target.value)}
                  className="mt-1 block min-w-56 rounded-xl border bg-white px-3 py-2.5 text-sm font-normal text-slate-900"
                >
                  <option value="none">Ohne Template</option>
                  {templates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name}{template.isDefault ? " (Standard)" : ""}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                onClick={createSelected}
                disabled={!selected.length || Boolean(busy)}
                className="rounded-xl bg-[var(--ph-gold)] px-4 py-2.5 text-sm font-bold text-slate-950 disabled:opacity-40"
              >
                {busy === "drafts"
                  ? `${progress} von ${selected.length} recherchiert…`
                  : `KI-Entwürfe erstellen (${selected.length})`}
              </button>
            </div>
          </div>

          <div className="mt-4 divide-y rounded-xl border">
            {!candidates.length ? (
              <p className="p-8 text-center text-sm text-slate-500">
                Noch keine Artikel geladen.
              </p>
            ) : !visible.length ? (
              <p className="p-8 text-center text-sm text-slate-500">
                {candidates.length} Artikel wurden geladen, werden aber durch
                die aktiven Filter ausgeblendet.
              </p>
            ) : (
              visible.map((candidate) => {
                const existing = drafts.find(
                  (draft) => draft.source.articleId === candidate.articleId
                );
                return (
                  <article
                    key={candidate.articleId}
                    className="grid gap-3 p-4 lg:grid-cols-[36px_64px_minmax(240px,1fr)_150px_170px_150px] lg:items-center"
                  >
                    <input
                      type="checkbox"
                      checked={selected.includes(candidate.articleId)}
                      disabled={!candidate.eligible || Boolean(existing)}
                      onChange={() => toggle(candidate.articleId)}
                    />
                    <div className="h-14 w-14 overflow-hidden rounded-lg bg-slate-100">
                      {candidate.imageUrls[0] ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={candidate.imageUrls[0]}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : null}
                    </div>
                    <div className="min-w-0">
                      <h3 className="truncate font-bold">{candidate.germanName}</h3>
                      <p className="truncate text-sm italic text-slate-500">
                        {candidate.latinName || "Lateinischer Name fehlt"}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                        <span className="text-slate-400">
                          {candidate.articleNumber}
                        </span>
                        <span
                          className={`rounded-full px-2 py-0.5 font-semibold ${
                            candidate.active !== false
                              ? "bg-green-100 text-green-800"
                              : "bg-slate-200 text-slate-600"
                          }`}
                        >
                          {candidate.active !== false ? "Aktiv" : "Inaktiv"}
                        </span>
                      </div>
                    </div>
                    <div className="text-sm">
                      <strong>{candidate.heightLabel || "Höhe fehlt"}</strong>
                      <div className="text-slate-500">{candidate.potSize || "Kein Topfmaß"}</div>
                    </div>
                    <div className="text-sm">
                      <strong>{money(candidate.price, settings.currency)}</strong>
                      <div className="text-xs text-slate-500">
                        {candidate.priceFallback ? `Fallback: ${candidate.priceSource}` : candidate.priceSource}
                      </div>
                    </div>
                    {existing ? (
                      <button
                        type="button"
                        onClick={() => selectDraft(existing)}
                        className="rounded-lg border px-3 py-2 text-sm font-semibold"
                      >
                        {status(existing)}
                      </button>
                    ) : (
                      <span className={`text-xs font-semibold ${
                        candidate.eligible ? "text-green-700" : "text-red-700"
                      }`}>
                        {candidate.eligible ? "Bereit" : candidate.missing.join(", ")}
                      </span>
                    )}
                  </article>
                );
              })
            )}
          </div>
          {candidates.length > 0 && (
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => loadCandidates(page - 1)}
                disabled={page <= 1 || Boolean(busy)}
                className="rounded-lg border px-3 py-2 text-sm disabled:opacity-40"
              >
                Zurück
              </button>
              <span className="text-sm">Seite {page}</span>
              <button
                type="button"
                onClick={() => loadCandidates(page + 1)}
                disabled={!hasMore || Boolean(busy)}
                className="rounded-lg border px-3 py-2 text-sm disabled:opacity-40"
              >
                Weiter
              </button>
            </div>
          )}
        </div>

        {drafts.length > 0 && (
          <div className="border-b p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="font-bold">Gespeicherte eBay-Vorgänge</h3>
              <button
                type="button"
                onClick={publishAllApproved}
                disabled={
                  !approved.length ||
                  Boolean(busy) ||
                  formDirty ||
                  !connection.publishReady
                }
                className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
              >
                {busy === "publish-all"
                  ? `${progress} von ${approved.length} veröffentlicht…`
                  : `Alle freigegebenen veröffentlichen (${approved.length})`}
              </button>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {drafts.map((draft) => (
                <button
                  type="button"
                  key={draft.id}
                  onClick={() => selectDraft(draft)}
                  className={`rounded-xl border px-3 py-2 text-left text-sm ${
                    active?.id === draft.id ? "border-blue-500 bg-blue-50" : "bg-white"
                  }`}
                >
                  <strong>{draft.source.articleNumber}</strong>
                  <span className="ml-2 text-slate-500">{status(draft)}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {form && active && (
          <div className="p-5">
            <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-start">
              <div>
                <h3 className="text-xl font-bold text-[var(--ph-green-dark)]">
                  Anzeige prüfen und korrigieren
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  SKU {form.source.articleNumber} · {form.source.heightLabel} · {money(form.price, settings.currency)}
                </p>
                {form.templateName && (
                  <p className="mt-1 text-xs font-semibold text-blue-700">
                    Erstellt mit Template: {form.templateName}
                  </p>
                )}
                {form.contentReuse && (
                  <p className="mt-1 text-xs font-semibold text-[var(--ph-green)]">
                    Pflanzeninhalt übernommen aus SKU {form.contentReuse.sourceArticleNumber}
                  </p>
                )}
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold">
                {status(active)}
              </span>
            </div>
            {(active.status === "published" ||
              active.status === "paused" ||
              active.status === "management_reconciliation_required") && (
              <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <strong>Angebotsverwaltung</strong>
                  <span>{status(active)}</span>
                </div>
                <dl className="mt-3 grid gap-2 sm:grid-cols-3">
                  <div>
                    <dt className="text-xs text-blue-700">eBay-Angebots-ID</dt>
                    <dd className="font-semibold">{active.offerId || "–"}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-blue-700">Letzte Anzeigen-ID</dt>
                    <dd className="font-semibold">{active.listingId || "–"}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-blue-700">Letzter Abgleich</dt>
                    <dd className="font-semibold">
                      {active.lastSyncedAt
                        ? new Date(active.lastSyncedAt).toLocaleString("de-DE")
                        : "Noch nicht abgeglichen"}
                    </dd>
                  </div>
                </dl>
                {active.lastError && (
                  <p className="mt-3 rounded-lg bg-white/70 px-3 py-2 text-amber-900">
                    {active.lastError}
                  </p>
                )}
                <p className="mt-3 text-xs text-blue-800">
                  Veröffentlichte und pausierte Angebotsdaten sind hier schreibgeschützt.
                  Statusaktionen findest du unten.
                </p>
              </div>
            )}

            <fieldset disabled={!activeIsEditable}>

            {form.validation.errors.length > 0 && (
              <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
                <strong>Noch offen:</strong>
                <ul className="mt-2 list-disc pl-5">
                  {form.validation.errors.map((error) => (
                    <li key={error}>{error}</li>
                  ))}
                </ul>
              </div>
            )}

            {form.validation.warnings.length > 0 && (
              <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                <strong>Qualitätshinweise:</strong>
                <ul className="mt-2 list-disc pl-5">
                  {form.validation.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="mt-5 grid gap-4 md:grid-cols-3">
              <label className="text-sm font-semibold md:col-span-2">
                eBay-Titel
                <input
                  value={form.title}
                  maxLength={80}
                  onChange={(event) =>
                    setForm({ ...form, title: event.target.value, approvedAt: undefined })
                  }
                  className="mt-1 block w-full rounded-xl border px-3 py-2.5 font-normal"
                />
                <span className="text-xs font-normal text-slate-500">
                  {form.title.length}/80 Zeichen
                </span>
              </label>
              <label className="text-sm font-semibold">
                Verkaufspreis
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={form.price}
                  onChange={(event) =>
                    setForm({ ...form, price: Number(event.target.value), approvedAt: undefined })
                  }
                  className="mt-1 block w-full rounded-xl border px-3 py-2.5 font-normal"
                />
              </label>
              <label className="text-sm font-semibold">
                Verfügbarer Bestand
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={form.quantity}
                  onChange={(event) =>
                    setForm({ ...form, quantity: Number(event.target.value), approvedAt: undefined })
                  }
                  className="mt-1 block w-full rounded-xl border px-3 py-2.5 font-normal"
                />
              </label>
              <div className="md:col-span-2">
                <label className="text-sm font-semibold">
                  eBay-Kategorie suchen
                  <div className="mt-1 flex gap-2">
                    <input
                      value={categoryQuery}
                      onChange={(event) => setCategoryQuery(event.target.value)}
                      className="block min-w-0 flex-1 rounded-xl border px-3 py-2.5 font-normal"
                    />
                    <button
                      type="button"
                      onClick={searchCategories}
                      disabled={!connection.configured || busy === "categories"}
                      className="rounded-xl border px-4 py-2 text-sm font-semibold disabled:opacity-40"
                    >
                      Suchen
                    </button>
                  </div>
                </label>
                {form.categoryId && (
                  <p className="mt-2 text-sm font-semibold text-green-800">
                    Gewählt: {form.categoryName} ({form.categoryId})
                  </p>
                )}
                {categories.length > 0 && (
                  <div className="mt-2 divide-y rounded-xl border">
                    {categories.slice(0, 8).map((category) => (
                      <button
                        type="button"
                        key={category.id}
                        onClick={() => chooseCategory(category)}
                        className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
                      >
                        {category.path}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <section className="mt-5 rounded-2xl border bg-slate-50 p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h4 className="font-bold">Artikeldetails wie bei eBay</h4>
                  <p className="mt-1 text-sm text-slate-500">
                    Kategorieabhängige Zustände, Produktkennzeichnungen und alle
                    Angebotsoptionen können vor der Freigabe korrigiert werden.
                  </p>
                </div>
                <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-600">
                  {conditions.length} Zustände für diese Kategorie
                </span>
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                <label className="text-sm font-semibold md:col-span-2">
                  Untertitel (optional)
                  <input
                    value={listingOptions(form).subtitle}
                    maxLength={55}
                    onChange={(event) =>
                      setListingOptions({ subtitle: event.target.value })
                    }
                    className="mt-1 block w-full rounded-xl border bg-white px-3 py-2.5 font-normal"
                  />
                  <span className="text-xs font-normal text-amber-700">
                    {listingOptions(form).subtitle.length}/55 Zeichen · eBay kann
                    hierfür eine Zusatzgebühr berechnen.
                  </span>
                </label>

                <label className="text-sm font-semibold">
                  Artikelzustand
                  <select
                    value={listingOptions(form).condition}
                    onChange={(event) =>
                      setListingOptions({ condition: event.target.value })
                    }
                    className="mt-1 block w-full rounded-xl border bg-white px-3 py-2.5 font-normal"
                  >
                    {!conditions.length && (
                      <option value={listingOptions(form).condition}>
                        {listingOptions(form).condition === "NEW"
                          ? "Neu"
                          : listingOptions(form).condition}
                      </option>
                    )}
                    {conditions.map((condition) => (
                      <option
                        key={condition.id}
                        value={condition.value}
                        disabled={condition.restricted}
                      >
                        {condition.label}
                        {condition.restricted ? " (eingeschränkt)" : ""}
                      </option>
                    ))}
                  </select>
                  {conditions.find(
                    (condition) =>
                      condition.value === listingOptions(form).condition
                  )?.helpText && (
                    <span className="text-xs font-normal text-slate-500">
                      {
                        conditions.find(
                          (condition) =>
                            condition.value === listingOptions(form).condition
                        )?.helpText
                      }
                    </span>
                  )}
                </label>

                <label className="text-sm font-semibold">
                  Marke
                  <input
                    value={listingOptions(form).brand}
                    maxLength={65}
                    onChange={(event) =>
                      setListingOptions({ brand: event.target.value })
                    }
                    placeholder="z. B. Palmenheld"
                    className="mt-1 block w-full rounded-xl border bg-white px-3 py-2.5 font-normal"
                  />
                </label>

                <label className="text-sm font-semibold">
                  Herstellernummer (MPN)
                  <input
                    value={listingOptions(form).mpn}
                    maxLength={65}
                    onChange={(event) =>
                      setListingOptions({ mpn: event.target.value })
                    }
                    placeholder="Optional"
                    className="mt-1 block w-full rounded-xl border bg-white px-3 py-2.5 font-normal"
                  />
                </label>

                <label className="text-sm font-semibold">
                  EAN
                  <input
                    inputMode="numeric"
                    value={listingOptions(form).ean}
                    maxLength={14}
                    onChange={(event) =>
                      setListingOptions({
                        ean: event.target.value.replace(/\D/g, ""),
                      })
                    }
                    placeholder="8 bis 14 Ziffern"
                    className="mt-1 block w-full rounded-xl border bg-white px-3 py-2.5 font-normal"
                  />
                </label>
              </div>

              {listingOptions(form).condition !== "NEW" && (
                <label className="mt-4 block text-sm font-semibold">
                  Zustandsbeschreibung
                  <textarea
                    rows={3}
                    value={listingOptions(form).conditionDescription}
                    maxLength={1000}
                    onChange={(event) =>
                      setListingOptions({
                        conditionDescription: event.target.value,
                      })
                    }
                    placeholder="Gebrauchsspuren oder Besonderheiten genau beschreiben"
                    className="mt-1 block w-full rounded-xl border bg-white px-3 py-2.5 font-normal"
                  />
                </label>
              )}
            </section>

            <section className="mt-5 rounded-2xl border p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h4 className="font-bold">Bilder und Reihenfolge</h4>
                  <p className="mt-1 text-sm text-slate-500">
                    Das erste Bild ist das eBay-Hauptbild. Bis zu 24 Bilder sind möglich.
                  </p>
                </div>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold">
                  {listingOptions(form).imageUrls.length}/24 ausgewählt
                </span>
              </div>

              {listingOptions(form).imageUrls.length ? (
                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {listingOptions(form).imageUrls.map((url, index) => (
                    <article key={url} className="overflow-hidden rounded-xl border bg-white">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={url}
                        alt={`eBay-Bild ${index + 1}`}
                        className="h-36 w-full object-cover"
                      />
                      <div className="p-2">
                        <p className="truncate text-xs font-semibold">
                          {index === 0 ? "Hauptbild" : `Bild ${index + 1}`}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-1">
                          <button
                            type="button"
                            onClick={() => moveListingImage(index, -1)}
                            disabled={index === 0}
                            className="rounded-md border px-2 py-1 text-xs disabled:opacity-30"
                          >
                            Nach vorn
                          </button>
                          <button
                            type="button"
                            onClick={() => moveListingImage(index, 1)}
                            disabled={index === listingOptions(form).imageUrls.length - 1}
                            className="rounded-md border px-2 py-1 text-xs disabled:opacity-30"
                          >
                            Nach hinten
                          </button>
                          <button
                            type="button"
                            onClick={() => toggleListingImage(url)}
                            className="rounded-md border border-red-200 px-2 py-1 text-xs text-red-700"
                          >
                            Abwählen
                          </button>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="mt-3 rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">
                  Mindestens ein Bild auswählen.
                </p>
              )}

              {form.source.imageUrls.some(
                (url) => !listingOptions(form).imageUrls.includes(url)
              ) && (
                <div className="mt-4">
                  <p className="text-sm font-semibold">Weitere Weclapp-Bilder</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {form.source.imageUrls
                      .filter(
                        (url) => !listingOptions(form).imageUrls.includes(url)
                      )
                      .map((url, index) => (
                        <button
                          type="button"
                          key={url}
                          onClick={() => toggleListingImage(url)}
                          disabled={listingOptions(form).imageUrls.length >= 24}
                          className="overflow-hidden rounded-xl border bg-white text-left disabled:opacity-40"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={url}
                            alt={`Weiteres Weclapp-Bild ${index + 1}`}
                            className="h-24 w-28 object-cover"
                          />
                          <span className="block px-2 py-1 text-xs font-semibold">
                            Auswählen
                          </span>
                        </button>
                      ))}
                  </div>
                </div>
              )}
            </section>

            <details className="mt-5 rounded-2xl border p-4" open>
              <summary className="cursor-pointer font-bold">
                Angebots- und Versandoptionen
              </summary>
              <p className="mt-2 text-sm text-slate-500">
                Versand-, Zahlungs- und Rückgaberichtlinie stammen aus dem oben
                gewählten eBay-Ziel. Die folgenden Optionen gelten nur für diesen Artikel.
              </p>

              <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                <label className="text-sm font-semibold">
                  Max. Stückzahl je Käufer
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={listingOptions(form).quantityLimitPerBuyer ?? ""}
                    onChange={(event) =>
                      setListingOptions({
                        quantityLimitPerBuyer: event.target.value
                          ? Number(event.target.value)
                          : undefined,
                      })
                    }
                    placeholder="Kein Limit"
                    className="mt-1 block w-full rounded-xl border px-3 py-2.5 font-normal"
                  />
                </label>

                <label className="flex items-start gap-3 rounded-xl border p-3 text-sm">
                  <input
                    type="checkbox"
                    checked={listingOptions(form).includeCatalogProductDetails}
                    onChange={(event) =>
                      setListingOptions({
                        includeCatalogProductDetails: event.target.checked,
                      })
                    }
                    className="mt-1"
                  />
                  <span>
                    <strong className="block">eBay-Katalogdaten ergänzen</strong>
                    <span className="text-xs text-slate-500">
                      Passende Produktdaten von eBay in das Angebot übernehmen.
                    </span>
                  </span>
                </label>

                <label className="flex items-start gap-3 rounded-xl border p-3 text-sm">
                  <input
                    type="checkbox"
                    checked={listingOptions(form).bestOfferEnabled}
                    onChange={(event) =>
                      setListingOptions({ bestOfferEnabled: event.target.checked })
                    }
                    className="mt-1"
                  />
                  <span>
                    <strong className="block">Preisvorschläge zulassen</strong>
                    <span className="text-xs text-slate-500">
                      Käufer dürfen einen eigenen Preis vorschlagen.
                    </span>
                  </span>
                </label>

                {listingOptions(form).bestOfferEnabled && (
                  <>
                    <label className="text-sm font-semibold">
                      Automatisch annehmen ab
                      <input
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={listingOptions(form).bestOfferAutoAcceptPrice ?? ""}
                        onChange={(event) =>
                          setListingOptions({
                            bestOfferAutoAcceptPrice: event.target.value
                              ? Number(event.target.value)
                              : undefined,
                          })
                        }
                        placeholder="Optional"
                        className="mt-1 block w-full rounded-xl border px-3 py-2.5 font-normal"
                      />
                    </label>
                    <label className="text-sm font-semibold">
                      Automatisch ablehnen unter
                      <input
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={listingOptions(form).bestOfferAutoDeclinePrice ?? ""}
                        onChange={(event) =>
                          setListingOptions({
                            bestOfferAutoDeclinePrice: event.target.value
                              ? Number(event.target.value)
                              : undefined,
                          })
                        }
                        placeholder="Optional"
                        className="mt-1 block w-full rounded-xl border px-3 py-2.5 font-normal"
                      />
                    </label>
                  </>
                )}
              </div>

              <div className="mt-5 rounded-xl bg-slate-50 p-4">
                <label className="flex items-center gap-2 text-sm font-semibold">
                  <input
                    type="checkbox"
                    checked={Boolean(listingOptions(form).packageDetails)}
                    onChange={(event) =>
                      setListingOptions({
                        packageDetails: event.target.checked
                          ? {
                              packageType: "PARCEL_OR_PADDED_ENVELOPE",
                              shippingIrregular: false,
                            }
                          : undefined,
                      })
                    }
                  />
                  Paketdaten für eBay hinterlegen
                </label>

                {listingOptions(form).packageDetails && (
                  <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-5">
                    <label className="text-sm font-semibold lg:col-span-2">
                      Verpackungsart
                      <select
                        value={listingOptions(form).packageDetails?.packageType}
                        onChange={(event) =>
                          setPackageDetails({ packageType: event.target.value })
                        }
                        className="mt-1 block w-full rounded-xl border bg-white px-3 py-2.5 font-normal"
                      >
                        <option value="PARCEL_OR_PADDED_ENVELOPE">Paket</option>
                        <option value="MAILING_BOX">Versandkarton</option>
                        <option value="BULKY_GOODS">Sperrgut</option>
                        <option value="EUROPALLET">Europalette</option>
                      </select>
                    </label>
                    {([
                      ["lengthCm", "Länge (cm)"],
                      ["widthCm", "Breite (cm)"],
                      ["heightCm", "Höhe (cm)"],
                      ["weightKg", "Gewicht (kg)"],
                    ] as const).map(([key, label]) => (
                      <label key={key} className="text-sm font-semibold">
                        {label}
                        <input
                          type="number"
                          min="0.01"
                          step="0.01"
                          value={listingOptions(form).packageDetails?.[key] ?? ""}
                          onChange={(event) =>
                            setPackageDetails({
                              [key]: event.target.value
                                ? Number(event.target.value)
                                : undefined,
                            })
                          }
                          className="mt-1 block w-full rounded-xl border bg-white px-3 py-2.5 font-normal"
                        />
                      </label>
                    ))}
                    <label className="flex items-center gap-2 self-end rounded-xl border bg-white px-3 py-2.5 text-sm font-semibold">
                      <input
                        type="checkbox"
                        checked={Boolean(
                          listingOptions(form).packageDetails?.shippingIrregular
                        )}
                        onChange={(event) =>
                          setPackageDetails({
                            shippingIrregular: event.target.checked,
                          })
                        }
                      />
                      Unregelmäßige Verpackung
                    </label>
                  </div>
                )}
              </div>
            </details>

            {aspects.length > 0 && (
              <div className="mt-5">
                <h4 className="font-bold">eBay-Merkmale</h4>
                <p className="mt-1 text-sm text-slate-500">
                  Pflichtmerkmale sind markiert. Mehrfachauswahlen werden als Liste angezeigt.
                </p>
                <div className="mt-3 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {aspects.map((aspect) => (
                    <label key={aspect.name} className="text-sm font-semibold">
                      {aspect.name}
                      {aspect.required ? (
                        <span className="ml-1 text-red-600">*</span>
                      ) : aspect.recommended ? (
                        <span className="ml-1 text-xs font-normal text-blue-700">
                          empfohlen
                        </span>
                      ) : null}
                      {aspect.mode === "selection_only" &&
                      aspect.values.length &&
                      aspect.maxValues > 1 ? (
                        <select
                          multiple
                          size={Math.min(6, Math.max(3, aspect.values.length))}
                          value={form.aspects[aspect.name] || []}
                          onChange={(event) =>
                            setAspectValues(
                              aspect.name,
                              Array.from(event.target.selectedOptions).map(
                                (option) => option.value
                              )
                            )
                          }
                          className="mt-1 block w-full rounded-xl border px-3 py-2.5 font-normal"
                        >
                          {aspect.values.map((value) => (
                            <option key={value} value={value}>{value}</option>
                          ))}
                        </select>
                      ) : aspect.mode === "selection_only" &&
                        aspect.values.length ? (
                        <select
                          value={form.aspects[aspect.name]?.[0] || ""}
                          onChange={(event) => setAspect(aspect.name, event.target.value)}
                          className="mt-1 block w-full rounded-xl border px-3 py-2.5 font-normal"
                        >
                          <option value="">Bitte auswählen</option>
                          {aspect.values.map((value) => (
                            <option key={value} value={value}>{value}</option>
                          ))}
                        </select>
                      ) : (
                        <input
                          value={(form.aspects[aspect.name] || []).join(", ")}
                          onChange={(event) => setAspect(aspect.name, event.target.value)}
                          className="mt-1 block w-full rounded-xl border px-3 py-2.5 font-normal"
                        />
                      )}
                    </label>
                  ))}
                </div>
              </div>
            )}

            <details className="mt-5 rounded-xl border p-4">
              <summary className="cursor-pointer font-bold">
                KI-Beschreibung ansehen und korrigieren
              </summary>
              {form.generatedCopy && activeIsEditable && (
                <button
                  type="button"
                  onClick={() =>
                    setForm({
                      ...form,
                      descriptionHtml: renderEbayDescription(
                        form.generatedCopy!,
                        form.source,
                        form.research
                      ),
                      approvedAt: undefined,
                    })
                  }
                  disabled={form.descriptionHtml.includes('data-palmenheld-design="v1"')}
                  className="mt-3 rounded-xl border border-[var(--ph-green)] bg-[var(--ph-green-light)] px-3 py-2 text-sm font-bold text-[var(--ph-green-dark)] disabled:opacity-40"
                >
                  Palmenheld-Design anwenden
                </button>
              )}

              <textarea
                rows={18}
                value={form.descriptionHtml}
                onChange={(event) =>
                  setForm({
                    ...form,
                    descriptionHtml: event.target.value,
                    approvedAt: undefined,
                  })
                }
                className="mt-3 block w-full rounded-xl border px-3 py-2.5 font-mono text-sm"
              />
              <div className="mt-4 rounded-xl border bg-slate-50 p-3">
                <p className="mb-2 text-sm font-bold text-[var(--ph-green-dark)]">
                  Vorschau der eBay-Beschreibung
                </p>
                <iframe
                  title="Vorschau der eBay-Beschreibung"
                  sandbox=""
                  referrerPolicy="no-referrer"
                  srcDoc={form.descriptionHtml}
                  className="h-[720px] w-full rounded-lg border bg-white"
                />
              </div>
            </details>
            </fieldset>

            {form.generatedCopy && (
              <details className="mt-4 rounded-xl border p-4">
                <summary className="cursor-pointer font-bold">
                  eBay-Suchbegriffe und Textversion
                </summary>
                <p className="mt-3 text-sm text-slate-600">
                  Textversion: {form.generatedCopy.version}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {form.generatedCopy.searchTerms.map((term) => (
                    <span
                      key={term}
                      className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold"
                    >
                      {term}
                    </span>
                  ))}
                </div>
                <div className="mt-4 grid gap-2 text-xs text-slate-600 md:grid-cols-2">
                  {[
                    ["Einleitung", form.generatedCopy.evidence.intro],
                    ["Erscheinungsbild", form.generatedCopy.evidence.appearance],
                    ["Standort", form.generatedCopy.evidence.location],
                    ["Pflege", form.generatedCopy.evidence.care],
                    ["Überwinterung", form.generatedCopy.evidence.winter],
                    [
                      "Verkaufspunkte",
                      form.generatedCopy.evidence.sellingPoints.flat(),
                    ],
                  ].map(([label, sourceIds]) => (
                    <p key={String(label)}>
                      <strong>{label}:</strong>{" "}
                      {[...new Set(sourceIds)].join(", ")}
                    </p>
                  ))}
                </div>
              </details>
            )}

            <details className="mt-4 rounded-xl border p-4">
              <summary className="cursor-pointer font-bold">
                Fachquellen ({form.sources.length})
              </summary>
              <ol className="mt-3 space-y-2 text-sm">
                {form.sources.map((source) => (
                  <li key={source.id}>
                    <a
                      href={source.url}
                      target="_blank"
                      rel="noreferrer"
                      className="font-semibold text-blue-700 underline"
                    >
                      {source.id}: {source.title}
                    </a>
                    <span className="ml-2 text-slate-500">{source.publisher}</span>
                  </li>
                ))}
              </ol>
            </details>

            {formDirty && (
              <p className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
                Es gibt ungespeicherte Änderungen. Bitte zuerst speichern und erneut freigeben.
              </p>
            )}
            {settingsChanged && (
              <p className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
                Das eBay-Ziel oder eine Geschäftsrichtlinie wurde geändert. Bitte diesen Entwurf erneut freigeben.
              </p>
            )}

            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => act("regenerate")}
                disabled={
                  Boolean(busy) ||
                  formDirty ||
                  (active.status !== "ready" && active.status !== "blocked")
                }
                className="rounded-xl border border-blue-300 bg-blue-50 px-4 py-2.5 font-semibold text-blue-900 disabled:opacity-40"
              >
                {busy === "regenerate"
                  ? "KI-Text wird neu erzeugt…"
                  : "KI-Text neu erzeugen"}
              </button>
              <button
                type="button"
                onClick={saveDraft}
                disabled={Boolean(busy) || !activeIsEditable}
                className="rounded-xl border px-4 py-2.5 font-semibold disabled:opacity-40"
              >
                {busy === "save" ? "Speichert…" : "Korrekturen speichern & prüfen"}
              </button>
              <button
                type="button"
                onClick={() => act("approve")}
                disabled={
                  Boolean(busy) ||
                  formDirty ||
                  !active.validation.valid ||
                  (Boolean(active.approvedAt) && !settingsChanged) ||
                  active.status !== "ready"
                }
                className="rounded-xl bg-blue-900 px-4 py-2.5 font-semibold text-white disabled:opacity-40"
              >
                {settingsChanged
                  ? "Freigabe für neues eBay-Ziel erneuern"
                  : active.approvedAt
                    ? "Freigegeben"
                    : "Inhalt ausdrücklich freigeben"}
              </button>
              {active.status === "reconciliation_required" ? (
                <>
                  <button
                    type="button"
                    onClick={() => act("reconcile")}
                    disabled={Boolean(busy) || !connection.configured}
                    className="rounded-xl border border-amber-500 px-4 py-2.5 font-semibold text-amber-900 disabled:opacity-40"
                  >
                    Status bei eBay prüfen
                  </button>
                  <button
                    type="button"
                    onClick={() => act("resume")}
                    disabled={
                      Boolean(busy) ||
                      formDirty ||
                      settingsChanged ||
                      !connection.publishReady
                    }
                    className="rounded-xl bg-amber-700 px-4 py-2.5 font-semibold text-white disabled:opacity-40"
                  >
                    Vorhandenes Angebot veröffentlichen
                  </button>
                  <button
                    type="button"
                    onClick={() => act("discard")}
                    disabled={Boolean(busy) || !connection.configured}
                    className="rounded-xl border border-red-300 px-4 py-2.5 font-semibold text-red-700 disabled:opacity-40"
                  >
                    Zwischenstand verwerfen
                  </button>
                </>
              ) : active.status === "management_reconciliation_required" ? (
                <button
                  type="button"
                  onClick={() => act("sync")}
                  disabled={Boolean(busy) || !connection.configured}
                  className="rounded-xl border border-amber-500 px-4 py-2.5 font-semibold text-amber-900 disabled:opacity-40"
                >
                  {busy === "sync" ? "Status wird abgeglichen…" : "Status bei eBay abgleichen"}
                </button>
              ) : active.status === "published" ? (
                <>
                  <button
                    type="button"
                    onClick={() => act("sync")}
                    disabled={Boolean(busy) || !connection.configured}
                    className="rounded-xl border px-4 py-2.5 font-semibold disabled:opacity-40"
                  >
                    {busy === "sync" ? "Status wird abgeglichen…" : "Status abgleichen"}
                  </button>
                  <button
                    type="button"
                    onClick={() => act("sanitize-copy")}
                    disabled={
                      Boolean(busy) ||
                      !connection.publishReady ||
                      !active.generatedCopy
                    }
                    className="rounded-xl border border-[var(--ph-green)] bg-[var(--ph-green-light)] px-4 py-2.5 font-semibold text-[var(--ph-green-dark)] disabled:opacity-40"
                  >
                    {busy === "sanitize-copy" ? "Design wird übertragen…" : "Palmenheld-Design live anwenden"}
                  </button>
                  <button
                    type="button"
                    onClick={() => act("pause")}
                    disabled={Boolean(busy) || !connection.publishReady}
                    className="rounded-xl border border-amber-500 bg-amber-50 px-4 py-2.5 font-semibold text-amber-900 disabled:opacity-40"
                  >
                    {busy === "pause" ? "Wird pausiert…" : "Anzeige pausieren"}
                  </button>
                </>
              ) : active.status === "paused" ? (
                <>
                  <button
                    type="button"
                    onClick={() => act("sync")}
                    disabled={Boolean(busy) || !connection.configured}
                    className="rounded-xl border px-4 py-2.5 font-semibold disabled:opacity-40"
                  >
                    {busy === "sync" ? "Status wird abgeglichen…" : "Status abgleichen"}
                  </button>
                  <button
                    type="button"
                    onClick={() => act("reactivate")}
                    disabled={Boolean(busy) || !connection.publishReady}
                    className="rounded-xl bg-[var(--ph-green-dark)] px-4 py-2.5 font-semibold text-white disabled:opacity-40"
                  >
                    {busy === "reactivate" ? "Wird reaktiviert…" : "Anzeige reaktivieren"}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => act("publish")}
                  disabled={
                    Boolean(busy) ||
                    formDirty ||
                    !active.approvedAt ||
                    settingsChanged ||
                    !connection.publishReady ||
                    active.status !== "ready"
                  }
                  className="rounded-xl bg-[var(--ph-green-dark)] px-4 py-2.5 font-semibold text-white disabled:opacity-40"
                >
                  Jetzt bei eBay veröffentlichen
                </button>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
