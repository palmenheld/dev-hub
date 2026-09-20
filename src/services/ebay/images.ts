import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import type { EbayListingDraft, EbayUploadedImage } from "@/types/ebay";
import { defaultListingOptions } from "./drafts";
import { withEbayMutationLock } from "./lock";
import {
  getEbayDataDirectory,
  getEbayDraft,
  saveEbayDraft,
} from "./store";

const IMAGE_TYPES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
} as const;
const MAX_IMAGE_SIZE = 12 * 1024 * 1024;

function uploadedImageDirectory(draftId: string) {
  return path.join(getEbayDataDirectory(), "draft-images", draftId);
}

export function uploadedImageUrl(draftId: string, imageId: string) {
  return `/api/channels/ebay/drafts/${draftId}/images/${imageId}`;
}

function matchesSignature(contentType: keyof typeof IMAGE_TYPES, bytes: Uint8Array) {
  if (contentType === "image/jpeg") {
    return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (contentType === "image/png") {
    return (
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47
    );
  }
  if (contentType === "image/gif") {
    return String.fromCharCode(...bytes.slice(0, 6)).startsWith("GIF8");
  }
  return (
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  );
}

function assertDraftEditable(draft: EbayListingDraft) {
  if (draft.status !== "ready" && draft.status !== "blocked") {
    throw new Error(
      "Bilder können nur vor der Veröffentlichung oder während der Entwurfsbearbeitung ergänzt werden."
    );
  }
}

export async function addEbayDraftImage(id: string, file: File) {
  return withEbayMutationLock(`ebay-draft:${id}`, async () => {
    const draft = await getEbayDraft(id);
    if (!draft) throw new Error("Der eBay-Entwurf wurde nicht gefunden.");
    assertDraftEditable(draft);
    const existingImages = draft.uploadedImages ?? [];
    if (existingImages.length >= 24) {
      throw new Error("Pro eBay-Entwurf können höchstens 24 Bilder hochgeladen werden.");
    }
    const currentOptions = draft.options ?? defaultListingOptions(draft.source);
    if (currentOptions.imageUrls.length >= 24) {
      throw new Error("eBay erlaubt höchstens 24 ausgewählte Bilder.");
    }
    if (!file.size || file.size > MAX_IMAGE_SIZE) {
      throw new Error("Das Bild muss zwischen 1 Byte und 12 MB groß sein.");
    }
    const contentType = file.type.toLowerCase() as keyof typeof IMAGE_TYPES;
    const extension = IMAGE_TYPES[contentType];
    if (!extension) {
      throw new Error("Erlaubt sind JPG, PNG, WebP und GIF.");
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!matchesSignature(contentType, bytes)) {
      throw new Error("Dateiendung und tatsächliches Bildformat stimmen nicht überein.");
    }

    const imageId = randomUUID();
    const fileName = `${imageId}.${extension}`;
    const directory = uploadedImageDirectory(id);
    const filePath = path.join(directory, fileName);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await writeFile(filePath, bytes, { mode: 0o600 });

    const image: EbayUploadedImage = {
      id: imageId,
      originalName: file.name.replace(/[\r\n]/g, " ").slice(0, 180) || fileName,
      fileName,
      contentType,
      size: bytes.byteLength,
      createdAt: new Date().toISOString(),
      url: uploadedImageUrl(id, imageId),
    };
    try {
      const errors = draft.validation.errors.filter(
        (error) => error !== "Mindestens ein Bild muss ausgewählt sein."
      );
      const next: EbayListingDraft = {
        ...draft,
        uploadedImages: [...existingImages, image],
        options: {
          ...currentOptions,
          imageUrls: [...currentOptions.imageUrls, image.url].slice(0, 24),
        },
        approvedAt: undefined,
        updatedAt: new Date().toISOString(),
        validation: {
          valid: errors.length === 0,
          errors,
          warnings: draft.validation.warnings,
        },
      };
      next.status = next.validation.valid ? "ready" : "blocked";
      await saveEbayDraft(next);
      return next;
    } catch (error) {
      await unlink(filePath).catch(() => undefined);
      throw error;
    }
  });
}

export async function getEbayDraftImage(draftId: string, imageId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(draftId) || !/^[0-9a-f-]{36}$/i.test(imageId)) {
    return null;
  }
  const draft = await getEbayDraft(draftId);
  const image = draft?.uploadedImages?.find((item) => item.id === imageId);
  if (!image || !/^[0-9a-f-]{36}\.(?:jpg|png|gif|webp)$/i.test(image.fileName)) {
    return null;
  }
  try {
    return {
      image,
      body: await readFile(path.join(uploadedImageDirectory(draftId), image.fileName)),
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}
