import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import type {
  ShopwareProductDraft,
  ShopwareUploadedImage,
} from "@/types/shopwarePublishing";
import { withMutationLock } from "./mutationLock";
import {
  getDraft,
  getShopwareDataDirectory,
  saveDraft,
} from "./dataStore";

const IMAGE_TYPES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
} as const;
const MAX_IMAGE_SIZE = 12 * 1024 * 1024;

function imageDirectory(draftId: string) {
  return path.join(getShopwareDataDirectory(), "draft-images", draftId);
}

function imageUrl(draftId: string, imageId: string) {
  return `/api/channels/shopware/drafts/${draftId}/images/${imageId}`;
}

function matchesSignature(contentType: keyof typeof IMAGE_TYPES, bytes: Uint8Array) {
  if (contentType === "image/jpeg") {
    return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (contentType === "image/png") {
    return bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  }
  if (contentType === "image/gif") {
    return String.fromCharCode(...bytes.slice(0, 6)).startsWith("GIF8");
  }
  return String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
}

function assertEditable(draft: ShopwareProductDraft) {
  if (draft.status !== "ready" && draft.status !== "blocked") {
    throw new Error("Bilder können nur in einem noch nicht übertragenen Entwurf ergänzt werden.");
  }
}

export async function addShopwareDraftImage(id: string, file: File) {
  return withMutationLock(`product-draft:${id}`, async () => {
    const draft = await getDraft(id);
    if (!draft) throw new Error("Der Shopware-Entwurf wurde nicht gefunden.");
    assertEditable(draft);
    const existing = draft.uploadedImages ?? [];
    if (existing.length >= 20) {
      throw new Error("Pro Shopware-Entwurf können höchstens 20 eigene Bilder gespeichert werden.");
    }
    if (!file.size || file.size > MAX_IMAGE_SIZE) {
      throw new Error("Das Bild muss zwischen 1 Byte und 12 MB groß sein.");
    }
    const contentType = file.type.toLowerCase() as keyof typeof IMAGE_TYPES;
    const extension = IMAGE_TYPES[contentType];
    if (!extension) throw new Error("Erlaubt sind JPG, PNG, WebP und GIF.");
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!matchesSignature(contentType, bytes)) {
      throw new Error("Dateiendung und tatsächliches Bildformat stimmen nicht überein.");
    }
    const imageId = randomUUID();
    const fileName = `${imageId}.${extension}`;
    const directory = imageDirectory(id);
    const filePath = path.join(directory, fileName);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await writeFile(filePath, bytes, { mode: 0o600 });
    const image: ShopwareUploadedImage = {
      id: imageId,
      originalName: file.name.replace(/[\r\n]/g, " ").slice(0, 180) || fileName,
      fileName,
      contentType,
      size: bytes.byteLength,
      createdAt: new Date().toISOString(),
      url: imageUrl(id, imageId),
    };
    try {
      const next: ShopwareProductDraft = {
        ...draft,
        uploadedImages: [...existing, image],
        selectedImageUrls: [
          ...(draft.selectedImageUrls ?? draft.source.imageUrls),
          image.url,
        ].slice(0, 20),
        approvedAt: undefined,
        updatedAt: new Date().toISOString(),
      };
      await saveDraft(next);
      return next;
    } catch (error) {
      await unlink(filePath).catch(() => undefined);
      throw error;
    }
  });
}

export async function getShopwareDraftImage(draftId: string, imageId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(draftId) || !/^[0-9a-f-]{36}$/i.test(imageId)) return null;
  const draft = await getDraft(draftId);
  const image = draft?.uploadedImages?.find((item) => item.id === imageId);
  if (!image || !/^[0-9a-f-]{36}\.(?:jpg|png|gif|webp)$/i.test(image.fileName)) return null;
  try {
    return {
      image,
      body: await readFile(path.join(imageDirectory(draftId), image.fileName)),
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}
