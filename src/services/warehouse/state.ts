import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type {
  LegacyWarehousePayload,
  WarehouseInventoryDraft,
  WarehouseReceiptDraft,
  WarehouseState,
} from "@/types/warehouse";

const dataDirectory = process.env.WAREHOUSE_DATA_DIR?.trim() || path.join(process.cwd(), ".data", "warehouse");
const stateFile = path.join(dataDirectory, "state.json");

function nowState(): WarehouseState {
  const now = Date.now();
  return {
    version: 1,
    hideInactive: true,
    inventory: { startedAt: now, counts: {} },
    receipt: { supplier: "", deliveryNote: "", items: {}, startedAt: now },
    recentArticleIds: [],
    updatedAt: new Date(now).toISOString(),
  };
}

function cleanText(value: unknown, maximum = 200) {
  return typeof value === "string" ? value.replace(/[\r\n\0]/gu, " ").trim().slice(0, maximum) : "";
}

function cleanInteger(value: unknown, minimum: number, maximum: number) {
  const number = Number(value);
  return Number.isInteger(number) && number >= minimum && number <= maximum ? number : null;
}

function cleanInventory(value: unknown): WarehouseInventoryDraft {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const countsSource = source.counts && typeof source.counts === "object" ? source.counts as Record<string, unknown> : {};
  const counts: WarehouseInventoryDraft["counts"] = {};
  for (const raw of Object.values(countsSource).slice(0, 10_000)) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Record<string, unknown>;
    const weclappId = cleanText(row.weclappId, 80);
    const warehouse = cleanText(row.warehouse, 240);
    const stock = cleanInteger(row.stock, 0, 10_000_000);
    const count = cleanInteger(row.count, 0, 10_000_000);
    if (!weclappId || !warehouse || stock === null || count === null) continue;
    const key = `${weclappId}::${warehouse}`;
    counts[key] = {
      key,
      weclappId,
      articleNumber: cleanText(row.articleNumber, 80),
      name: cleanText(row.name, 300),
      warehouse,
      stock,
      count,
      updatedAt: cleanInteger(row.updatedAt, 0, Number.MAX_SAFE_INTEGER) ?? Date.now(),
    };
  }
  return {
    startedAt: cleanInteger(source.startedAt, 0, Number.MAX_SAFE_INTEGER) ?? Date.now(),
    counts,
  };
}

function cleanReceipt(value: unknown): WarehouseReceiptDraft {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const itemsSource = source.items && typeof source.items === "object" ? source.items as Record<string, unknown> : {};
  const items: WarehouseReceiptDraft["items"] = {};
  for (const raw of Object.values(itemsSource).slice(0, 10_000)) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Record<string, unknown>;
    const weclappId = cleanText(row.weclappId, 80);
    const quantity = cleanInteger(row.quantity, 1, 10_000_000);
    if (!weclappId || quantity === null) continue;
    items[weclappId] = {
      weclappId,
      articleNumber: cleanText(row.articleNumber, 80),
      name: cleanText(row.name, 300),
      quantity,
    };
  }
  return {
    supplier: cleanText(source.supplier, 300),
    deliveryNote: cleanText(source.deliveryNote, 200),
    items,
    startedAt: cleanInteger(source.startedAt, 0, Number.MAX_SAFE_INTEGER) ?? Date.now(),
  };
}

function normalizeState(value: unknown): WarehouseState {
  const fallback = nowState();
  if (!value || typeof value !== "object") return fallback;
  const source = value as Partial<WarehouseState>;
  return {
    version: 1,
    hideInactive: source.hideInactive !== false,
    inventory: cleanInventory(source.inventory),
    receipt: cleanReceipt(source.receipt),
    recentArticleIds: Array.isArray(source.recentArticleIds)
      ? source.recentArticleIds.map((item) => cleanText(item, 80)).filter(Boolean).slice(0, 20)
      : [],
    migratedAt: cleanText(source.migratedAt, 40) || undefined,
    migratedFrom: cleanText(source.migratedFrom, 200) || undefined,
    updatedAt: cleanText(source.updatedAt, 40) || fallback.updatedAt,
  };
}

async function writeState(state: WarehouseState) {
  await mkdir(dataDirectory, { recursive: true, mode: 0o700 });
  const temporary = `${stateFile}.${randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify(state, null, 2), { encoding: "utf8", mode: 0o600 });
  await rename(temporary, stateFile);
}

export async function getWarehouseState() {
  try {
    return normalizeState(JSON.parse(await readFile(stateFile, "utf8")));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return nowState();
    throw error;
  }
}

export async function saveWarehouseState(value: unknown) {
  const state = normalizeState(value);
  state.updatedAt = new Date().toISOString();
  await writeState(state);
  return state;
}

export async function importLegacyWarehouseState(payload: LegacyWarehousePayload) {
  const current = await getWarehouseState();
  const inventory = cleanInventory(payload.inventory);
  const receipt = cleanReceipt(payload.receipt);
  const next: WarehouseState = {
    ...current,
    hideInactive: typeof payload.hideInactive === "boolean" ? payload.hideInactive : current.hideInactive,
    inventory: Object.keys(inventory.counts).length ? inventory : current.inventory,
    receipt: Object.keys(receipt.items).length || receipt.supplier || receipt.deliveryNote ? receipt : current.receipt,
    migratedAt: new Date().toISOString(),
    migratedFrom: cleanText(payload.source, 200) || "app.palmenheld.de/localStorage",
    updatedAt: new Date().toISOString(),
  };
  await writeState(next);
  return next;
}
