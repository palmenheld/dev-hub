import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { OrderImportPlan } from "@/types/shopwareOrders";

function dataDirectory() {
  return (
    process.env.SHOPWARE_DATA_DIR?.trim() ||
    path.join(process.cwd(), ".data", "shopware")
  );
}

function validId(id: string) {
  return /^[0-9a-f-]{36}$/i.test(id);
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

export async function saveOrderImportPlan(plan: OrderImportPlan) {
  await writeJson(
    path.join(dataDirectory(), "order-import-plans", `${plan.id}.json`),
    plan
  );
}

export async function getOrderImportPlan(id: string) {
  if (!validId(id)) return null;
  return readJson<OrderImportPlan>(
    path.join(dataDirectory(), "order-import-plans", `${id}.json`)
  );
}

export async function listOrderImportPlans(limit = 20) {
  const directory = path.join(dataDirectory(), "order-import-plans");
  let names: string[] = [];
  try {
    names = await readdir(directory);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const plans = await Promise.all(
    names
      .filter((name) => /^[0-9a-f-]{36}\.json$/i.test(name))
      .map((name) => readJson<OrderImportPlan>(path.join(directory, name)))
  );
  return plans
    .filter((plan): plan is OrderImportPlan => Boolean(plan))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .slice(0, Math.min(100, Math.max(1, limit)));
}
