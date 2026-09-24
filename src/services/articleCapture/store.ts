import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import type {
  ArticleCapture,
  ArticleCaptureInput,
  ArticleCapturePhoto,
} from "@/types/articleCapture";

const dataDirectory =
  process.env.ARTICLE_CAPTURE_DATA_DIR ??
  path.join(process.cwd(), ".data", "article-captures");
const capturesFile = path.join(dataDirectory, "articles.json");
const photoDirectory = path.join(dataDirectory, "photos");

const IMAGE_TYPES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
} as const;
const MAX_IMAGE_SIZE = 12 * 1024 * 1024;
const MAX_PHOTOS = 24;

let activeMutation = false;

function isMissingFile(error: unknown) {
  return (error as NodeJS.ErrnoException)?.code === "ENOENT";
}

function assertUuid(value: string) {
  if (!/^[0-9a-f-]{36}$/iu.test(value)) throw new Error("Ungültige Artikel-ID.");
}

function normalizeText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function normalizeNumber(value: unknown, minimum = 0) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= minimum ? number : null;
}

function normalizeInput(input: Partial<ArticleCaptureInput>): ArticleCaptureInput {
  const name = normalizeText(input.name, 240);
  if (!name) throw new Error("Bitte einen Artikelnamen eintragen.");
  const heightMinCm = normalizeNumber(input.heightMinCm);
  const heightMaxCm = normalizeNumber(input.heightMaxCm);
  if (heightMinCm !== null && heightMaxCm !== null && heightMaxCm < heightMinCm) {
    throw new Error("Die maximale Höhe darf nicht kleiner als die minimale Höhe sein.");
  }
  const potType = ["C", "M", "V", "D"].includes(String(input.potType))
    ? (input.potType as ArticleCaptureInput["potType"])
    : "";
  const keyFacts = Array.isArray(input.keyFacts)
    ? input.keyFacts.map((item) => normalizeText(item, 300)).filter(Boolean).slice(0, 20)
    : [];
  return {
    status: input.status === "ready" ? "ready" : "draft",
    name,
    articleNumber: normalizeText(input.articleNumber, 100),
    germanName: normalizeText(input.germanName, 180),
    latinName: normalizeText(input.latinName, 180),
    category: normalizeText(input.category, 180),
    heightMinCm,
    heightMaxCm,
    potType,
    potValue: normalizeNumber(input.potValue),
    grossPrice: normalizeNumber(input.grossPrice),
    stock: normalizeNumber(input.stock),
    keyFacts,
    notes: normalizeText(input.notes, 8_000),
  };
}

function normalizeCapture(capture: ArticleCapture): ArticleCapture {
  return {
    ...capture,
    articleNumber: normalizeText(capture.articleNumber, 100),
    photos: Array.isArray(capture.photos) ? capture.photos : [],
    primaryPhotoId: capture.primaryPhotoId ?? null,
    weclappArticleId: normalizeText(capture.weclappArticleId, 100) || null,
    weclappSyncedAt: normalizeText(capture.weclappSyncedAt, 100) || null,
    weclappSyncError: normalizeText(capture.weclappSyncError, 2_000) || null,
  };
}

function matchesSignature(contentType: keyof typeof IMAGE_TYPES, bytes: Uint8Array) {
  if (contentType === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (contentType === "image/png") return bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  if (contentType === "image/gif") return String.fromCharCode(...bytes.slice(0, 6)).startsWith("GIF8");
  return String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
}

async function withMutation<T>(action: () => Promise<T>) {
  if (activeMutation) throw new Error("Eine Artikelspeicherung läuft bereits. Bitte kurz erneut versuchen.");
  activeMutation = true;
  try {
    return await action();
  } finally {
    activeMutation = false;
  }
}

async function writeCaptures(captures: ArticleCapture[]) {
  await mkdir(dataDirectory, { recursive: true, mode: 0o700 });
  const temporary = `${capturesFile}.${randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(captures, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await rename(temporary, capturesFile);
}

export async function listArticleCaptures() {
  try {
    const captures = JSON.parse(await readFile(capturesFile, "utf8")) as ArticleCapture[];
    return captures.map(normalizeCapture).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  } catch (error) {
    if (isMissingFile(error)) return [];
    throw error;
  }
}

export async function getArticleCapture(id: string) {
  assertUuid(id);
  return (await listArticleCaptures()).find((capture) => capture.id === id) ?? null;
}

export async function createArticleCapture(input: Partial<ArticleCaptureInput>) {
  return withMutation(async () => {
    const captures = await listArticleCaptures();
    const now = new Date().toISOString();
    const capture: ArticleCapture = {
      ...normalizeInput(input),
      articleNumber: "",
      id: randomUUID(),
      photos: [],
      primaryPhotoId: null,
      weclappArticleId: null,
      weclappSyncedAt: null,
      weclappSyncError: null,
      createdAt: now,
      updatedAt: now,
    };
    await writeCaptures([capture, ...captures]);
    return capture;
  });
}

export async function updateArticleCapture(
  id: string,
  input: Partial<ArticleCaptureInput> & { photoOrder?: string[]; primaryPhotoId?: string | null }
) {
  assertUuid(id);
  return withMutation(async () => {
    const captures = await listArticleCaptures();
    const index = captures.findIndex((capture) => capture.id === id);
    if (index < 0) return null;
    const current = captures[index];
    const normalized = normalizeInput({ ...current, ...input });
    const order = Array.isArray(input.photoOrder) ? input.photoOrder : current.photos.map((photo) => photo.id);
    const positions = new Map(order.map((photoId, position) => [photoId, position]));
    const photos = [...current.photos].sort(
      (a, b) => (positions.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (positions.get(b.id) ?? Number.MAX_SAFE_INTEGER)
    );
    const requestedPrimary = input.primaryPhotoId === undefined ? current.primaryPhotoId : input.primaryPhotoId;
    const primaryPhotoId = photos.some((photo) => photo.id === requestedPrimary)
      ? requestedPrimary ?? null
      : photos[0]?.id ?? null;
    const updated: ArticleCapture = {
      ...current,
      ...normalized,
      articleNumber: current.articleNumber,
      photos,
      primaryPhotoId,
      updatedAt: new Date().toISOString(),
    };
    captures[index] = updated;
    await writeCaptures(captures);
    return updated;
  });
}

export async function setArticleCaptureWeclappState(
  id: string,
  state: {
    weclappArticleId?: string | null;
    articleNumber?: string;
    weclappSyncedAt?: string | null;
    weclappSyncError?: string | null;
  }
) {
  assertUuid(id);
  return withMutation(async () => {
    const captures = await listArticleCaptures();
    const index = captures.findIndex((capture) => capture.id === id);
    if (index < 0) return null;
    const current = captures[index];
    const updated: ArticleCapture = {
      ...current,
      weclappArticleId: state.weclappArticleId === undefined
        ? current.weclappArticleId
        : normalizeText(state.weclappArticleId, 100) || null,
      articleNumber: state.articleNumber === undefined
        ? current.articleNumber
        : normalizeText(state.articleNumber, 100),
      weclappSyncedAt: state.weclappSyncedAt === undefined
        ? current.weclappSyncedAt
        : normalizeText(state.weclappSyncedAt, 100) || null,
      weclappSyncError: state.weclappSyncError === undefined
        ? current.weclappSyncError
        : normalizeText(state.weclappSyncError, 2_000) || null,
      updatedAt: new Date().toISOString(),
    };
    captures[index] = updated;
    await writeCaptures(captures);
    return updated;
  });
}

export async function setArticleCapturePhotoWeclappState(
  articleId: string,
  photoId: string,
  state: { weclappSyncedAt?: string; weclappSyncError?: string | null }
) {
  assertUuid(articleId);
  assertUuid(photoId);
  return withMutation(async () => {
    const captures = await listArticleCaptures();
    const index = captures.findIndex((capture) => capture.id === articleId);
    if (index < 0) return null;
    const capture = captures[index];
    const photos = capture.photos.map((photo) => photo.id === photoId ? {
      ...photo,
      weclappSyncedAt: state.weclappSyncedAt ?? photo.weclappSyncedAt,
      weclappSyncError: state.weclappSyncError === undefined
        ? photo.weclappSyncError
        : state.weclappSyncError || undefined,
    } : photo);
    const updated = { ...capture, photos, updatedAt: new Date().toISOString() };
    captures[index] = updated;
    await writeCaptures(captures);
    return updated;
  });
}

export async function addArticleCapturePhoto(id: string, file: File) {
  assertUuid(id);
  return withMutation(async () => {
    const captures = await listArticleCaptures();
    const index = captures.findIndex((capture) => capture.id === id);
    if (index < 0) throw new Error("Der Artikelentwurf wurde nicht gefunden.");
    const capture = captures[index];
    if (capture.photos.length >= MAX_PHOTOS) throw new Error(`Pro Artikel sind höchstens ${MAX_PHOTOS} Fotos möglich.`);
    if (!file.size || file.size > MAX_IMAGE_SIZE) throw new Error("Das Foto muss zwischen 1 Byte und 12 MB groß sein.");
    const contentType = file.type.toLowerCase() as keyof typeof IMAGE_TYPES;
    const extension = IMAGE_TYPES[contentType];
    if (!extension) throw new Error("Erlaubt sind JPG, PNG, WebP und GIF.");
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!matchesSignature(contentType, bytes)) throw new Error("Das tatsächliche Bildformat stimmt nicht mit der Datei überein.");
    const photoId = randomUUID();
    const fileName = `${photoId}.${extension}`;
    const directory = path.join(photoDirectory, id);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await writeFile(path.join(directory, fileName), bytes, { mode: 0o600 });
    const photo: ArticleCapturePhoto = {
      id: photoId,
      originalName: file.name.replace(/[\r\n]/gu, " ").slice(0, 180) || fileName,
      fileName,
      contentType,
      size: bytes.byteLength,
      createdAt: new Date().toISOString(),
      url: `/api/article-captures/${id}/photos/${photoId}`,
    };
    const updated: ArticleCapture = {
      ...capture,
      photos: [...capture.photos, photo],
      primaryPhotoId: capture.primaryPhotoId ?? photo.id,
      updatedAt: new Date().toISOString(),
    };
    captures[index] = updated;
    try {
      await writeCaptures(captures);
      return updated;
    } catch (error) {
      await unlink(path.join(directory, fileName)).catch(() => undefined);
      throw error;
    }
  });
}

export async function getArticleCapturePhoto(articleId: string, photoId: string) {
  assertUuid(articleId);
  assertUuid(photoId);
  const capture = await getArticleCapture(articleId);
  const photo = capture?.photos.find((item) => item.id === photoId);
  if (!photo || !/^[0-9a-f-]{36}\.(?:jpg|png|webp|gif)$/iu.test(photo.fileName)) return null;
  try {
    return { photo, body: await readFile(path.join(photoDirectory, articleId, photo.fileName)) };
  } catch (error) {
    if (isMissingFile(error)) return null;
    throw error;
  }
}

export async function deleteArticleCapturePhoto(articleId: string, photoId: string) {
  assertUuid(articleId);
  assertUuid(photoId);
  return withMutation(async () => {
    const captures = await listArticleCaptures();
    const index = captures.findIndex((capture) => capture.id === articleId);
    if (index < 0) return null;
    const capture = captures[index];
    const photo = capture.photos.find((item) => item.id === photoId);
    if (!photo) return capture;
    const photos = capture.photos.filter((item) => item.id !== photoId);
    const updated: ArticleCapture = {
      ...capture,
      photos,
      primaryPhotoId: capture.primaryPhotoId === photoId ? photos[0]?.id ?? null : capture.primaryPhotoId,
      updatedAt: new Date().toISOString(),
    };
    captures[index] = updated;
    await writeCaptures(captures);
    await unlink(path.join(photoDirectory, articleId, photo.fileName)).catch(() => undefined);
    return updated;
  });
}
