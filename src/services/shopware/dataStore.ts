import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  ShopwareProductDraft,
  ShopwareProductTemplate,
  ShopwarePublishingSettings,
  WeclappFieldMap,
} from "@/types/shopwarePublishing";

import { ShopwareSyncSettings } from "@/types/shopwareSync";
import { normalizeSyncSettings } from "./syncCatalog";
const DEFAULT_FIELD_MAP: WeclappFieldMap = {
  germanName: "name",
  latinName: "",
  heightCm: "",
  potSize: "",
  images: "articleImages",
  stock: "availableForSaleQuantity",
};

export function getShopwareDataDirectory() {
  return (
    process.env.SHOPWARE_DATA_DIR?.trim() ||
    path.join(process.cwd(), ".data", "shopware")
  );
}

async function readJson<T>(filePath: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(filePath, "utf8")) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function writeJson(filePath: string, value: unknown) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  await rename(temporaryPath, filePath);
}

export async function getFieldMap(): Promise<WeclappFieldMap> {
  const stored = await readJson<Partial<WeclappFieldMap>>(
    path.join(getShopwareDataDirectory(), "field-map.json")
  );
  return { ...DEFAULT_FIELD_MAP, ...(stored ?? {}) };
}

export async function saveFieldMap(fieldMap: WeclappFieldMap) {
  await writeJson(path.join(getShopwareDataDirectory(), "field-map.json"), fieldMap);
}

export async function getPublishingSettings(): Promise<ShopwarePublishingSettings> {
  const stored = await readJson<Partial<ShopwarePublishingSettings>>(
    path.join(getShopwareDataDirectory(), "publishing-settings.json")
  );
  return {
    taxId: stored?.taxId ?? "",
    currencyId: stored?.currencyId ?? "",
    salesChannelId: stored?.salesChannelId ?? "",
  };
}

export async function savePublishingSettings(
  settings: ShopwarePublishingSettings
) {
  await writeJson(
    path.join(getShopwareDataDirectory(), "publishing-settings.json"),
    settings
  );
}

export async function saveDraft(draft: ShopwareProductDraft) {
  await writeJson(
    path.join(getShopwareDataDirectory(), "drafts", `${draft.id}.json`),
    draft
  );
}


export async function getSyncSettings(): Promise<ShopwareSyncSettings> {
  const stored = await readJson<unknown>(
    path.join(getShopwareDataDirectory(), "sync-settings.json")
  );
  return normalizeSyncSettings(stored);
}

export async function saveSyncSettings(input: unknown) {
  const settings = normalizeSyncSettings(input);
  await writeJson(
    path.join(getShopwareDataDirectory(), "sync-settings.json"),
    settings
  );
  return settings;
}
export async function listDrafts(limit = 50) {
  const directory = path.join(getShopwareDataDirectory(), "drafts");
  let fileNames: string[];
  try {
    fileNames = await readdir(directory);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }

  const results = await Promise.allSettled(
    fileNames
      .filter((fileName) => /^[0-9a-f-]{36}\.json$/i.test(fileName))
      .map((fileName) =>
        readJson<ShopwareProductDraft>(path.join(directory, fileName))
      )
  );

  return results
    .filter(
      (result): result is PromiseFulfilledResult<ShopwareProductDraft | null> =>
        result.status === "fulfilled"
    )
    .map((result) => result.value)
    .filter((draft): draft is ShopwareProductDraft => Boolean(draft))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .filter(
      (draft, index, all) =>
        all.findIndex(
          (candidate) => candidate.source.articleId === draft.source.articleId
        ) === index
    )
    .slice(0, Math.min(1000, Math.max(1, limit)));
}

export async function getDraft(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  return readJson<ShopwareProductDraft>(
    path.join(getShopwareDataDirectory(), "drafts", `${id}.json`)
  );
}

export async function listProductTemplates() {
  const stored = await readJson<ShopwareProductTemplate[]>(
    path.join(getShopwareDataDirectory(), "product-templates.json")
  );
  return (stored ?? []).sort((left, right) =>
    right.updatedAt.localeCompare(left.updatedAt)
  );
}

export async function saveProductTemplates(templates: ShopwareProductTemplate[]) {
  await writeJson(
    path.join(getShopwareDataDirectory(), "product-templates.json"),
    templates
  );
}
