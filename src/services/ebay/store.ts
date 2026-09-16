import { mkdir, readFile, readdir, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import type {
  EbayListingDraft,
  EbayListingTemplate,
  EbayPublishingSettings,
} from "@/types/ebay";
import { getEbayEnvironment, getEnvironmentSettings } from "./config";

export function getEbayDataDirectory() {
  const base =
    process.env.EBAY_DATA_DIR?.trim() ||
    path.join(process.cwd(), ".data", "ebay");
  return path.join(base, getEbayEnvironment());
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

export async function getEbaySettings(): Promise<EbayPublishingSettings> {
  const defaults = getEnvironmentSettings();
  const stored = await readJson<Partial<EbayPublishingSettings>>(
    path.join(getEbayDataDirectory(), "settings.json")
  );
  return {
    marketplaceId: stored?.marketplaceId || defaults.marketplaceId,
    currency: stored?.currency || defaults.currency,
    merchantLocationKey:
      stored?.merchantLocationKey || defaults.merchantLocationKey,
    fulfillmentPolicyId:
      stored?.fulfillmentPolicyId || defaults.fulfillmentPolicyId,
    paymentPolicyId: stored?.paymentPolicyId || defaults.paymentPolicyId,
    returnPolicyId: stored?.returnPolicyId || defaults.returnPolicyId,
  };
}

export async function saveEbaySettings(settings: EbayPublishingSettings) {
  await writeJson(path.join(getEbayDataDirectory(), "settings.json"), settings);
  return settings;
}

export async function saveEbayDraft(draft: EbayListingDraft) {
  await writeJson(
    path.join(getEbayDataDirectory(), "drafts", `${draft.id}.json`),
    draft
  );
}

export async function getEbayDraft(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  return readJson<EbayListingDraft>(
    path.join(getEbayDataDirectory(), "drafts", `${id}.json`)
  );
}

export async function listEbayDrafts(limit = 1000) {
  const directory = path.join(getEbayDataDirectory(), "drafts");
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
        readJson<EbayListingDraft>(path.join(directory, fileName))
      )
  );
  return results
    .filter(
      (result): result is PromiseFulfilledResult<EbayListingDraft | null> =>
        result.status === "fulfilled"
    )
    .map((result) => result.value)
    .filter((draft): draft is EbayListingDraft => Boolean(draft))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .filter(
      (draft, index, all) =>
        all.findIndex(
          (candidate) => candidate.source.articleId === draft.source.articleId
        ) === index
    )
    .slice(0, Math.max(1, Math.min(1000, limit)));
}
export async function saveEbayTemplate(template: EbayListingTemplate) {
  await writeJson(
    path.join(getEbayDataDirectory(), "templates", `${template.id}.json`),
    template
  );
  return template;
}

export async function getEbayTemplate(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  return readJson<EbayListingTemplate>(
    path.join(getEbayDataDirectory(), "templates", `${id}.json`)
  );
}

export async function listEbayTemplates() {
  const directory = path.join(getEbayDataDirectory(), "templates");
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
        readJson<EbayListingTemplate>(path.join(directory, fileName))
      )
  );
  return results
    .filter(
      (result): result is PromiseFulfilledResult<EbayListingTemplate | null> =>
        result.status === "fulfilled"
    )
    .map((result) => result.value)
    .filter((template): template is EbayListingTemplate => Boolean(template))
    .sort(
      (left, right) =>
        Number(right.isDefault) - Number(left.isDefault) ||
        left.name.localeCompare(right.name, "de")
    );
}

export async function deleteEbayTemplateFile(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return false;
  try {
    await unlink(
      path.join(getEbayDataDirectory(), "templates", `${id}.json`)
    );
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}
