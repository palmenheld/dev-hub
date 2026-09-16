import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { SyncAuditEntry, SyncPlan } from "@/types/shopwareSync";

function dataDirectory() {
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

function validId(id: string) {
  return /^[0-9a-f-]{36}$/i.test(id);
}

export async function saveSyncPlan(plan: SyncPlan) {
  await writeJson(
    path.join(dataDirectory(), "sync-plans", `${plan.id}.json`),
    plan
  );
}

export async function getSyncPlan(id: string) {
  if (!validId(id)) return null;
  return readJson<SyncPlan>(
    path.join(dataDirectory(), "sync-plans", `${id}.json`)
  );
}

export async function listSyncPlans(limit = 20) {
  const directory = path.join(dataDirectory(), "sync-plans");
  let names: string[] = [];
  try {
    names = await readdir(directory);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }

  const plans = await Promise.all(
    names
      .filter((name) => /^[0-9a-f-]{36}\.json$/i.test(name))
      .map((name) => readJson<SyncPlan>(path.join(directory, name)))
  );

  return plans
    .filter((plan): plan is SyncPlan => Boolean(plan))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, Math.min(100, Math.max(1, limit)));
}

export async function appendSyncAudit(
  entry: Omit<SyncAuditEntry, "id" | "createdAt">
) {
  const filePath = path.join(dataDirectory(), "sync-audit.json");
  const existing = (await readJson<SyncAuditEntry[]>(filePath)) ?? [];
  const auditEntry: SyncAuditEntry = {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    ...entry,
  };
  await writeJson(filePath, [...existing.slice(-999), auditEntry]);
  return auditEntry;
}

export async function listSyncAudit(limit = 100) {
  const entries =
    (await readJson<SyncAuditEntry[]>(
      path.join(dataDirectory(), "sync-audit.json")
    )) ?? [];
  return entries.slice(-Math.min(500, Math.max(1, limit))).reverse();
}
