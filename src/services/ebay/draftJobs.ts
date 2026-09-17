import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { EbayDraftJob } from "@/types/ebay";
import { createEbayDraft, regenerateEbayCopy } from "./drafts";
import { getEbayDataDirectory, getEbayDraft } from "./store";

function jobPath(id: string) {
  return path.join(getEbayDataDirectory(), "draft-jobs", `${id}.json`);
}

async function readJob(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  try {
    return JSON.parse(await readFile(jobPath(id), "utf8")) as EbayDraftJob;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function writeJob(job: EbayDraftJob) {
  const filePath = jobPath(job.id);
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(job, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  await rename(temporaryPath, filePath);
  return job;
}

export async function createEbayDraftJob(
  articleId: string,
  articleNumber: string
) {
  const now = new Date().toISOString();
  return writeJob({
    id: randomUUID(),
    articleId,
    articleNumber,
    status: "queued",
    createdAt: now,
    updatedAt: now,
  });
}

export async function runEbayDraftJob(
  jobId: string,
  articleId: string,
  templateId?: string,
  draftId?: string
) {
  const queued = await readJob(jobId);
  if (!queued) return;
  await writeJob({
    ...queued,
    status: "running",
    updatedAt: new Date().toISOString(),
  });
  try {
    const draft = draftId
      ? await regenerateEbayCopy(draftId)
      : await createEbayDraft(articleId, false, templateId);
    await writeJob({
      ...queued,
      status: "completed",
      draftId: draft.id,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    await writeJob({
      ...queued,
      status: "failed",
      error:
        error instanceof Error
          ? error.message.slice(0, 2_000)
          : "Der eBay-Entwurf konnte nicht erstellt werden.",
      updatedAt: new Date().toISOString(),
    });
  }
}

export async function getEbayDraftJob(id: string) {
  const job = await readJob(id);
  if (!job) return null;
  return {
    job,
    draft: job.draftId ? await getEbayDraft(job.draftId) : null,
  };
}
