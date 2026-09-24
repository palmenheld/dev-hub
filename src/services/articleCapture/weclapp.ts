import type { ArticleCapture, ArticleCapturePhoto } from "@/types/articleCapture";
import { getArticleCategoryMap } from "@/services/weclapp/categories";
import { getArticle } from "@/services/weclapp/articles";
import {
  getWeclappConfiguration,
  WeclappHttpError,
  weclappRequest,
} from "@/services/weclapp/client";
import {
  getArticleCapture,
  getArticleCapturePhoto,
  setArticleCapturePhotoWeclappState,
  setArticleCaptureWeclappState,
} from "./store";

type UnknownRow = Record<string, unknown>;
type ListResponse = { result?: UnknownRow[] };

function text(value: unknown) {
  return typeof value === "string"
    ? value.trim()
    : value === undefined || value === null
      ? ""
      : String(value).trim();
}

function resultRow(value: UnknownRow) {
  return value.result && typeof value.result === "object"
    ? value.result as UnknownRow
    : value;
}

function normalized(value: string) {
  return value.normalize("NFKC").toLocaleLowerCase("de-DE")
    .replace(/[^a-z0-9äöüß]+/gu, " ").trim();
}

function articleDescription(article: ArticleCapture) {
  const details = [
    article.germanName && `Deutscher Name: ${article.germanName}`,
    article.latinName && `Lateinischer Name: ${article.latinName}`,
    article.category && `Kategorie: ${article.category}`,
    article.heightMinCm !== null || article.heightMaxCm !== null
      ? `Höhe: ${article.heightMinCm ?? "?"}–${article.heightMaxCm ?? article.heightMinCm ?? "?"} cm`
      : "",
    article.potType && article.potValue !== null
      ? `Topf: ${article.potType}${article.potValue}`
      : "",
    article.keyFacts.length
      ? `Kernpunkte:\n${article.keyFacts.map((fact) => `- ${fact}`).join("\n")}`
      : "",
    article.notes && `Notizen:\n${article.notes}`,
  ].filter(Boolean);
  return details.join("\n\n").slice(0, 10_000);
}

async function exactCategoryId(label: string) {
  if (!label.trim()) return undefined;
  const wanted = normalized(label);
  const categories = await getArticleCategoryMap();
  for (const [id, name] of categories) {
    if (normalized(name) === wanted) return id;
  }
  return undefined;
}

async function gross1CurrencyId() {
  const response = await weclappRequest<ListResponse>("articlePrice", {
    query: { page: 1, pageSize: 10, "salesChannel-eq": "GROSS1" },
  });
  return (response.result ?? []).map((row) => text(row.currencyId)).find(Boolean);
}

async function gross1Prices(article: ArticleCapture, current?: UnknownRow) {
  if (article.grossPrice === null) return undefined;
  const formatted = article.grossPrice.toFixed(2);
  const existing = Array.isArray(current?.articlePrices)
    ? structuredClone(current.articlePrices as UnknownRow[])
    : [];
  const index = existing.findIndex(
    (price) => text(price.salesChannel).toUpperCase() === "GROSS1"
  );
  if (index >= 0) {
    existing[index] = { ...existing[index], price: formatted };
    return existing;
  }
  const currencyId =
    existing.map((price) => text(price.currencyId)).find(Boolean) ||
    await gross1CurrencyId();
  if (!currencyId) {
    throw new Error(
      "Der GROSS1-Preis konnte nicht angelegt werden, weil Weclapp keine Preiswährung geliefert hat."
    );
  }
  return [
    ...existing,
    {
      currencyId,
      price: formatted,
      priceScaleType: "SCALE_FROM",
      priceScaleValue: "0",
      salesChannel: "GROSS1",
    },
  ];
}

async function articlePayload(article: ArticleCapture, current?: UnknownRow) {
  const articleCategoryId = await exactCategoryId(article.category);
  const articlePrices = await gross1Prices(article, current);
  return {
    name: article.name,
    description: articleDescription(article),
    active: article.status === "ready",
    ...(articleCategoryId ? { articleCategoryId } : {}),
    ...(articlePrices ? { articlePrices } : {}),
  };
}

function cleanError(error: unknown) {
  const message = error instanceof Error ? error.message : "Unbekannter Weclapp-Fehler";
  return message.replace(/AuthenticationToken[^,}\]]*/giu, "AuthenticationToken=<geschützt>").slice(0, 2_000);
}

async function createOrUpdate(article: ArticleCapture) {
  if (article.weclappArticleId) {
    const current = await getArticle(article.weclappArticleId) as UnknownRow;
    await weclappRequest(`article/id/${encodeURIComponent(article.weclappArticleId)}`, {
      method: "PUT",
      body: await articlePayload(article, current),
    });
    const refreshed = await getArticle(article.weclappArticleId);
    return { id: text(refreshed.id), articleNumber: text(refreshed.articleNumber) };
  }

  const response = await weclappRequest<UnknownRow>("article", {
    method: "POST",
    body: {
      articleNumber: "",
      articleType: "STORABLE",
      ...await articlePayload(article),
    },
  });
  const created = resultRow(response);
  const id = text(created.id);
  if (!id) throw new Error("Weclapp hat nach der Anlage keine Artikel-ID zurückgegeben.");
  const refreshed = await getArticle(id);
  return {
    id,
    articleNumber: text(refreshed.articleNumber) || text(created.articleNumber),
  };
}

async function uploadPhoto(
  article: ArticleCapture,
  photo: ArticleCapturePhoto,
  mainImage: boolean
) {
  if (!article.weclappArticleId) throw new Error("Der Weclapp-Artikel wurde noch nicht angelegt.");
  const stored = await getArticleCapturePhoto(article.id, photo.id);
  if (!stored) throw new Error("Die lokale Bilddatei wurde nicht gefunden.");
  const config = getWeclappConfiguration();
  const url = new URL(
    `${config.tenantBaseUrl}/webapp/api/v2/article/id/${encodeURIComponent(article.weclappArticleId)}/uploadArticleImage`
  );
  url.searchParams.set("name", photo.originalName || photo.fileName);
  url.searchParams.set("mainImage", String(mainImage));
  const response = await fetch(url, {
    method: "POST",
    headers: {
      AuthenticationToken: config.apiToken,
      Accept: "application/json",
      "Content-Type": photo.contentType,
      "Content-Disposition": `attachment; filename="${photo.fileName}"`,
    },
    body: stored.body,
    cache: "no-store",
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new WeclappHttpError(
      response.status,
      `Weclapp Bild-Upload ${response.status}: ${body.slice(0, 1_000)}`
    );
  }
}

export async function syncArticleCapturePhotoToWeclapp(
  article: ArticleCapture,
  photo: ArticleCapturePhoto
) {
  try {
    await uploadPhoto(article, photo, article.primaryPhotoId === photo.id);
    return await setArticleCapturePhotoWeclappState(article.id, photo.id, {
      weclappSyncedAt: new Date().toISOString(),
      weclappSyncError: null,
    });
  } catch (error) {
    const message = cleanError(error);
    await setArticleCapturePhotoWeclappState(article.id, photo.id, {
      weclappSyncError: message,
    });
    throw new Error(`Foto wurde im Hub gespeichert, aber nicht nach Weclapp übertragen: ${message}`);
  }
}

export async function syncArticleCaptureToWeclapp(id: string) {
  const article = await getArticleCapture(id);
  if (!article) throw new Error("Der Artikelentwurf wurde nicht gefunden.");
  try {
    const linked = await createOrUpdate(article);
    if (!article.weclappArticleId) {
      await setArticleCaptureWeclappState(id, {
        weclappArticleId: linked.id,
        articleNumber: linked.articleNumber,
      });
    }
    if (!linked.articleNumber) {
      throw new Error(
        "Weclapp hat den Artikel angelegt, aber noch keine Artikelnummer zurückgegeben."
      );
    }
    let updated = await setArticleCaptureWeclappState(id, {
      weclappArticleId: linked.id,
      articleNumber: linked.articleNumber,
      weclappSyncedAt: new Date().toISOString(),
      weclappSyncError: null,
    });
    if (!updated) throw new Error("Die Weclapp-Verknüpfung konnte im Hub nicht gespeichert werden.");
    for (const photo of updated.photos.filter((item) => !item.weclappSyncedAt)) {
      updated = await syncArticleCapturePhotoToWeclapp(updated, photo) ?? updated;
    }
    return updated;
  } catch (error) {
    const message = cleanError(error);
    await setArticleCaptureWeclappState(id, { weclappSyncError: message });
    throw new Error(`Weclapp-Synchronisierung fehlgeschlagen: ${message}`);
  }
}
