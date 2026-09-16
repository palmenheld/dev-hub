import { randomUUID } from "node:crypto";
import {
  SyncChangeItem,
  SyncChangeValue,
  SyncPlan,
  SyncProcessId,
} from "@/types/shopwareSync";
import {
  getPublishingSettings,
  getSyncSettings,
} from "./dataStore";
import {
  appendSyncAudit,
  getSyncPlan,
  saveSyncPlan,
} from "./syncStore";
import { getProductCandidatesByIds } from "./publishingCandidates";
import {
  getShopwareSyncProductByNumber,
  ShopwareSyncProduct,
} from "./products";
import { shopwareRequest } from "./client";
import { withMutationLock } from "./mutationLock";
import { getGross1Price, updateGross1Price } from "@/services/weclapp/prices";


type SupportedPlanProcess = Extract<SyncProcessId, "prices" | "stock">;
export type WeclappPriceMode = "set" | "increase" | "decrease";

function roundPrice(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function sameValue(left: SyncChangeValue, right: SyncChangeValue) {
  if (typeof left === "number" && typeof right === "number") {
    return Math.abs(left - right) < 0.005;
  }
  return left === right;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unbekannter Sync-Fehler";
}

function failedItem(
  articleId: string,
  title: string,
  target: "shopware" | "weclapp",
  error: string,
  sourceKey?: string
): SyncChangeItem {
  return {
    id: randomUUID(),
    entityType: "product",
    entityKey: articleId,
    sourceKey,
    title,
    operation: "update",
    target,
    changes: [],
    state: "failed",
    error,
  };
}

export async function createProductSyncPlan(
  process: SupportedPlanProcess,
  articleIds: string[]
) {
  if (process !== "prices" && process !== "stock") {
    throw new Error("Dieser Sync-Prozess wird nicht unterstützt.");
  }

  const settings = await getSyncSettings();
  const uniqueIds = [...new Set(articleIds.map((id) => String(id).trim()))]
    .filter(Boolean)
    .slice(0, settings.global.batchLimit);
  if (!uniqueIds.length) {
    throw new Error("Bitte mindestens einen Artikel auswählen.");
  }
  if (uniqueIds.length !== articleIds.length) {
    throw new Error(
      `Dieser Lauf darf höchstens ${settings.global.batchLimit} eindeutige Artikel enthalten.`
    );
  }

  const publishing = await getPublishingSettings();
  if (!publishing.currencyId) {
    throw new Error("Bitte zuerst die Shopware-Zielwährung speichern.");
  }

  const candidates = await getProductCandidatesByIds(
    uniqueIds,
    settings.prices.grossPriceSource
  );
  const items: SyncChangeItem[] = [];

  for (const candidate of candidates) {
    const title = candidate.articleNumber
      ? `${candidate.articleNumber} · ${candidate.germanName || "Ohne Namen"}`
      : candidate.germanName || candidate.articleId;
    if (!candidate.articleNumber) {
      items.push(
        failedItem(
          candidate.articleId,
          title,
          "shopware",
          "Die weclapp-Artikelnummer fehlt.", candidate.articleId
        )
      );
      continue;
    }

    const target = await getShopwareSyncProductByNumber(
      candidate.articleNumber
    );
    if (!target) {
      items.push(
        failedItem(
          candidate.articleNumber,
          title,
          "shopware",
          "Noch nicht in Shopware vorhanden. Bitte zuerst den Einzelartikel-Assistenten verwenden.", candidate.articleId
        )
      );
      continue;
    }

    if (process === "prices") {
      if (candidate.price === undefined) {
        items.push(
          failedItem(
            candidate.articleNumber,
            title,
            "shopware",
            `Im weclapp-Preiskanal ${settings.prices.grossPriceSource} fehlt ein Preis.`, candidate.articleId
          )
        );
        continue;
      }
      const current = target.price.find(
        (price) => price.currencyId === publishing.currencyId
      );
      const proposed = roundPrice(candidate.price);
      const before = current ? roundPrice(current.gross) : null;
      items.push({
        id: randomUUID(),
        entityType: "price",
        entityKey: candidate.articleNumber,
        sourceKey: candidate.articleId,
        title,
        operation: "update",
        target: "shopware",
        changes: sameValue(before, proposed)
          ? []
          : [
              {
                field: "grossPrice",
                label: "Verkaufspreis brutto",
                before,
                proposed,
                editable: true,
              },
            ],
        state: sameValue(before, proposed) ? "skipped" : "pending",
      });
      continue;
    }

    if (candidate.stock === undefined) {
      items.push(
        failedItem(
          candidate.articleNumber,
          title,
          "shopware",
          "Das weclapp-Bestandsfeld ist noch nicht zugeordnet.", candidate.articleId
        )
      );
      continue;
    }
    const proposed = Math.max(
      0,
      Math.floor(candidate.stock - settings.stock.safetyStock)
    );
    const before = Math.max(0, Math.floor(target.stock));
    items.push({
      id: randomUUID(),
      entityType: "stock",
      entityKey: candidate.articleNumber,
      sourceKey: candidate.articleId,
      title,
      operation: "update",
      target: "shopware",
      changes: sameValue(before, proposed)
        ? []
        : [
            {
              field: "stock",
              label: "Shopware-Bestand",
              before,
              proposed,
              editable: true,
            },
          ],
      state: sameValue(before, proposed) ? "skipped" : "pending",
    });
  }

  const now = new Date().toISOString();
  const plan: SyncPlan = {
    id: randomUUID(),
    process,
    createdAt: now,
    updatedAt: now,
    source: "manual",
    dryRun: true,
    state: "draft",
    items,
  };
  await saveSyncPlan(plan);
  await appendSyncAudit({
    process,
    action: "plan_created",
    planId: plan.id,
    message: `Manuelle Vorschau mit ${items.length} Vorgängen erstellt.`,
  });
  return plan;
}

export async function createWeclappPriceChangePlan(
  articleIds: string[],
  mode: WeclappPriceMode,
  value: number
) {
  if (!(["set", "increase", "decrease"] as string[]).includes(mode)) {
    throw new Error("Die gewählte Preisänderung ist ungültig.");
  }
  if (
    !Number.isFinite(value) ||
    value < 0 ||
    (mode === "decrease" && value > 100)
  ) {
    throw new Error("Bitte einen gültigen Preis oder Prozentsatz angeben.");
  }

  const settings = await getSyncSettings();
  const uniqueIds = [
    ...new Set(articleIds.map((id) => String(id).trim()).filter(Boolean)),
  ];
  if (!uniqueIds.length) {
    throw new Error("Bitte mindestens einen Artikel auswählen.");
  }
  if (uniqueIds.length > settings.global.batchLimit) {
    throw new Error(
      `Dieser Lauf darf höchstens ${settings.global.batchLimit} eindeutige Artikel enthalten.`
    );
  }

  const items: SyncChangeItem[] = [];
  for (const articleId of uniqueIds) {
    try {
      const { article, price: currentPrice } = await getGross1Price(articleId);
      const proposed = roundPrice(
        mode === "set"
          ? value
          : mode === "increase"
            ? currentPrice * (1 + value / 100)
            : currentPrice * (1 - value / 100)
      );
      const title = article.articleNumber
        ? `${article.articleNumber} · ${article.name || "Ohne Namen"}`
        : article.name || articleId;
      items.push({
        id: randomUUID(),
        entityType: "price",
        entityKey: articleId,
        sourceKey: articleId,
        title,
        operation: "update",
        target: "weclapp",
        changes: sameValue(currentPrice, proposed)
          ? []
          : [
              {
                field: "grossPrice",
                label: "GROSS1-Verkaufspreis brutto",
                before: roundPrice(currentPrice),
                proposed,
                editable: true,
              },
            ],
        state: sameValue(currentPrice, proposed) ? "skipped" : "pending",
      });
    } catch (error) {
      items.push(failedItem(articleId, articleId, "weclapp", errorMessage(error)));
    }
  }

  const now = new Date().toISOString();
  const plan: SyncPlan = {
    id: randomUUID(),
    process: "prices",
    createdAt: now,
    updatedAt: now,
    source: "manual",
    dryRun: true,
    state: "draft",
    items,
  };
  await saveSyncPlan(plan);
  await appendSyncAudit({
    process: "prices",
    action: "plan_created",
    planId: plan.id,
    message: `Manuelle weclapp-Preisvorschau mit ${items.length} Vorgängen erstellt.`,
  });
  return plan;
}

export async function correctSyncItem(
  planId: string,
  itemId: string,
  field: string,
  proposed: unknown
) {
  const plan = await getSyncPlan(planId);
  if (!plan) throw new Error("Der Sync-Plan wurde nicht gefunden.");
  if (plan.state !== "draft") {
    throw new Error("Nur ein noch nicht freigegebener Plan kann geändert werden.");
  }
  const item = plan.items.find((entry) => entry.id === itemId);
  if (!item || item.state !== "pending") {
    throw new Error("Der Vorgang kann nicht geändert werden.");
  }
  const change = item.changes.find((entry) => entry.field === field);
  if (!change?.editable) {
    throw new Error("Dieses Feld kann nicht geändert werden.");
  }

  const numeric = Number(proposed);
  if (!Number.isFinite(numeric) || numeric < 0) {
    throw new Error("Der neue Wert muss eine nicht-negative Zahl sein.");
  }
  change.proposed =
    field === "stock" ? Math.floor(numeric) : roundPrice(numeric);
  plan.updatedAt = new Date().toISOString();
  await saveSyncPlan(plan);
  await appendSyncAudit({
    process: plan.process,
    action: "item_corrected",
    planId: plan.id,
    itemId: item.id,
    message: `${change.label} für ${item.entityKey} manuell korrigiert.`,
  });
  return plan;
}

export async function approveSyncPlan(planId: string) {
  const plan = await getSyncPlan(planId);
  if (!plan) throw new Error("Der Sync-Plan wurde nicht gefunden.");
  if (plan.state !== "draft") {
    throw new Error("Dieser Sync-Plan kann nicht mehr freigegeben werden.");
  }
  const approvable = plan.items.filter((item) => item.state === "pending");
  if (!approvable.length) {
    throw new Error("Der Sync-Plan enthält keine offenen Änderungen.");
  }
  for (const item of approvable) item.state = "approved";
  plan.state = "approved";
  plan.updatedAt = new Date().toISOString();
  await saveSyncPlan(plan);
  await appendSyncAudit({
    process: plan.process,
    action: "plan_approved",
    planId: plan.id,
    message: `${approvable.length} Vorgänge ausdrücklich freigegeben.`,
  });
  return plan;
}

async function taxRate(taxId: string | undefined) {
  if (!taxId) throw new Error("Am Shopware-Produkt fehlt der Steuersatz.");
  const response = await shopwareRequest<{ data?: { taxRate?: number } }>(
    `tax/${taxId}`
  );
  const rate = Number(response.data?.taxRate);
  if (!Number.isFinite(rate) || rate < 0) {
    throw new Error("Der Shopware-Steuersatz konnte nicht gelesen werden.");
  }
  return rate;
}

async function assertUnchanged(
  item: SyncChangeItem,
  product: ShopwareSyncProduct,
  currencyId: string
) {
  for (const change of item.changes) {
    const current =
      change.field === "stock"
        ? Math.max(0, Math.floor(product.stock))
        : product.price.find((price) => price.currencyId === currencyId)
            ?.gross ?? null;
    if (!sameValue(current, change.before)) {
      throw new Error(
        `${change.label} wurde seit der Vorschau geändert. Bitte einen neuen Plan erstellen.`
      );
    }
  }
}

async function applyItem(
  item: SyncChangeItem,
  currencyId: string
) {
  if (item.target === "weclapp") {
    if (item.entityType !== "price") {
      throw new Error("Für dieses weclapp-Ziel gibt es keinen Ausführungsadapter.");
    }
    const grossPrice = item.changes.find(
      (change) => change.field === "grossPrice"
    );
    if (!grossPrice || typeof grossPrice.before !== "number") {
      throw new Error("Die freigegebene Preisänderung ist unvollständig.");
    }
    await updateGross1Price(
      item.entityKey,
      Number(grossPrice.proposed),
      grossPrice.before
    );
    return;
  }

  const product = await getShopwareSyncProductByNumber(item.entityKey);
  if (!product) {
    throw new Error("Das Shopware-Produkt wurde nicht mehr gefunden.");
  }
  await assertUnchanged(item, product, currencyId);

  const body: Record<string, unknown> = {};
  const stock = item.changes.find((change) => change.field === "stock");
  if (stock) body.stock = Number(stock.proposed);

  const grossPrice = item.changes.find(
    (change) => change.field === "grossPrice"
  );
  if (grossPrice) {
    const gross = roundPrice(Number(grossPrice.proposed));
    const rate = await taxRate(product.taxId);
    const price = product.price.filter(
      (entry) => entry.currencyId !== currencyId
    );
    price.push({
      currencyId,
      gross,
      net: roundPrice(gross / (1 + rate / 100)),
      linked: true,
    });
    body.price = price;
  }

  await shopwareRequest(`product/${product.id}`, {
    method: "PATCH",
    body,
  });
}

async function applySyncPlanUnlocked(planId: string) {
  const plan = await getSyncPlan(planId);
  if (!plan) throw new Error("Der Sync-Plan wurde nicht gefunden.");
  if (plan.state !== "approved") {
    throw new Error("Der Sync-Plan wurde noch nicht ausdrücklich freigegeben.");
  }
  if (plan.process !== "prices" && plan.process !== "stock") {
    throw new Error("Dieser Prozess besitzt noch keinen Ausführungsadapter.");
  }

  const settings = await getSyncSettings();
  const approvedItems = plan.items.filter((entry) => entry.state === "approved");
  const targets = new Set(approvedItems.map((item) => item.target));
  if (targets.size !== 1) {
    throw new Error("Ein Sync-Plan darf nur ein Zielsystem enthalten.");
  }
  const targetsShopware = targets.has("shopware");
  if (
    targetsShopware &&
    ((plan.process === "prices" && !settings.prices.enabled) ||
      (plan.process === "stock" && !settings.stock.enabled))
  ) {
    throw new Error(
      "Der Prozess ist in den Sync-Regeln nicht als eingerichtet markiert."
    );
  }

  const publishing = targetsShopware ? await getPublishingSettings() : null;
  if (targetsShopware && !publishing?.currencyId) {
    throw new Error("Die Shopware-Zielwährung fehlt.");
  }
  const currencyId = publishing?.currencyId || "";

  plan.state = "applying";
  plan.updatedAt = new Date().toISOString();
  await saveSyncPlan(plan);
  await appendSyncAudit({
    process: plan.process,
    action: "apply_started",
    planId: plan.id,
    message: "Freigegebener Sync-Lauf gestartet.",
  });

  for (const item of approvedItems) {
    try {
      await applyItem(item, currencyId);
      item.state = "applied";
      item.error = undefined;
      await appendSyncAudit({
        process: plan.process,
        action: "item_applied",
        planId: plan.id,
        itemId: item.id,
        message: `${item.title} erfolgreich nach ${item.target} übertragen.`,
      });
    } catch (error) {
      item.state = "failed";
      item.error = errorMessage(error);
      await appendSyncAudit({
        process: plan.process,
        action: "item_failed",
        planId: plan.id,
        itemId: item.id,
        message: `${item.title}: ${item.error}`,
      });
    }
    plan.updatedAt = new Date().toISOString();
    await saveSyncPlan(plan);
  }

  plan.state = plan.items.some((item) => item.state === "failed")
    ? "partially_failed"
    : "completed";
  plan.updatedAt = new Date().toISOString();
  await saveSyncPlan(plan);
  return plan;
}

export async function applySyncPlan(planId: string) {
  return withMutationLock(`sync-plan:${planId}`, () =>
    applySyncPlanUnlocked(planId)
  );
}

export async function retryFailedSyncPlan(planId: string) {
  const previous = await getSyncPlan(planId);
  if (!previous) throw new Error("Der frühere Sync-Plan wurde nicht gefunden.");
  if (
    previous.state !== "partially_failed" &&
    previous.state !== "completed"
  ) {
    throw new Error("Nur ein abgeschlossener Lauf kann neu geprüft werden.");
  }
  if (previous.process !== "prices" && previous.process !== "stock") {
    throw new Error("Für diesen Prozess gibt es noch keine sichere Wiederholung.");
  }
  const failed = previous.items.filter((item) => item.state === "failed");
  if (!failed.length) throw new Error("Dieser Lauf enthält keine fehlgeschlagenen Artikel.");
  if (failed.some((item) => item.target !== "shopware" || !item.sourceKey)) {
    throw new Error(
      "Für diese Positionen bitte eine neue Vorschau aus der Artikelauswahl erstellen."
    );
  }
  const freshPlan = await createProductSyncPlan(
    previous.process,
    failed.map((item) => item.sourceKey!)
  );
  await appendSyncAudit({
    process: previous.process,
    action: "plan_created",
    planId: freshPlan.id,
    message: `Neuer Prüflauf für ${failed.length} fehlgeschlagene Positionen aus ${previous.id} erstellt.`,
  });
  return freshPlan;
}
