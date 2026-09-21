import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { BlogJob, BlogJobMode } from "@/types/blog";

const MAX_HISTORY = 200;
let storeQueue: Promise<void> = Promise.resolve();

function dataFile() {
  const directory =
    process.env.BLOG_DATA_DIR?.trim() || path.join(process.cwd(), ".data", "blog");
  return path.join(directory, "jobs.json");
}

async function readJobsUnsafe(): Promise<BlogJob[]> {
  try {
    const value = JSON.parse(await readFile(dataFile(), "utf8")) as unknown;
    return Array.isArray(value) ? (value as BlogJob[]) : [];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

async function writeJobsUnsafe(jobs: BlogJob[]) {
  const file = dataFile();
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(jobs.slice(0, MAX_HISTORY), null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  await rename(temporary, file);
}

function locked<T>(operation: () => Promise<T>): Promise<T> {
  const result = storeQueue.then(operation, operation);
  storeQueue = result.then(
    () => undefined,
    () => undefined
  );
  return result;
}

export async function listBlogJobs() {
  await storeQueue;
  return (await readJobsUnsafe()).sort((left, right) =>
    right.createdAt.localeCompare(left.createdAt)
  );
}

export async function getBlogJob(id: string) {
  return (await listBlogJobs()).find((job) => job.id === id) ?? null;
}

export async function createBlogJobs(
  inputs: Array<{
    mode: BlogJobMode;
    prompt: string;
    authorId: string;
    categoryId: string;
    scheduledFor: string;
  }>
) {
  return locked(async () => {
    const jobs = await readJobsUnsafe();
    const activeScheduled = jobs.filter(
      (job) =>
        job.mode === "scheduled" &&
        ["queued", "researching", "publishing"].includes(job.status)
    ).length;
    const additionalScheduled = inputs.filter(
      (input) => input.mode === "scheduled"
    ).length;
    if (activeScheduled + additionalScheduled > 10) {
      throw new Error(
        `Es sind höchstens 10 geplante Blogposts gleichzeitig möglich. Frei: ${Math.max(
          0,
          10 - activeScheduled
        )}.`
      );
    }

    const now = new Date().toISOString();
    const created: BlogJob[] = inputs.map((input) => ({
      id: randomUUID(),
      mode: input.mode,
      prompt: input.prompt,
      authorId: input.authorId,
      categoryId: input.categoryId,
      scheduledFor: input.scheduledFor,
      status: "queued",
      createdAt: now,
      updatedAt: now,
      attempts: 0,
    }));
    await writeJobsUnsafe([...created, ...jobs]);
    return created;
  });
}

export async function updateBlogJob(
  id: string,
  update: Partial<BlogJob> | ((job: BlogJob) => Partial<BlogJob>)
) {
  return locked(async () => {
    const jobs = await readJobsUnsafe();
    const index = jobs.findIndex((job) => job.id === id);
    if (index < 0) throw new Error("Der Blog-Auftrag wurde nicht gefunden.");
    const current = jobs[index];
    const changes = typeof update === "function" ? update(current) : update;
    const next: BlogJob = {
      ...current,
      ...changes,
      id: current.id,
      updatedAt: new Date().toISOString(),
    };
    jobs[index] = next;
    await writeJobsUnsafe(jobs);
    return next;
  });
}

export async function cancelBlogJob(id: string) {
  return updateBlogJob(id, (job) => {
    if (!["queued", "failed"].includes(job.status)) {
      throw new Error("Nur wartende oder fehlgeschlagene Aufträge können entfernt werden.");
    }
    return { status: "cancelled", error: undefined };
  });
}
