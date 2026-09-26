import { randomBytes } from "node:crypto";
import { mkdir, open, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { getPosConfig } from "@/services/pos/config";
import type { PosReceipt } from "@/types/pos";

function safeToken(token: string) {
  if (!/^[A-Za-z0-9_-]{32,80}$/.test(token)) throw new Error("Der Bon-Link ist ungültig.");
  return token;
}

function paths() {
  const root = getPosConfig().dataDirectory;
  return {
    receiptDirectory: path.join(root, "receipts"),
    idempotencyDirectory: path.join(root, "idempotency"),
  };
}

async function ensureDirectories() {
  const current = paths();
  await Promise.all([
    mkdir(current.receiptDirectory, { recursive: true }),
    mkdir(current.idempotencyDirectory, { recursive: true }),
  ]);
  return current;
}

export async function reserveCheckout(key: string) {
  if (!/^[0-9a-f-]{20,80}$/i.test(key)) throw new Error("Die Kassen-Anfrage besitzt keine gültige Vorgangsnummer.");
  const { idempotencyDirectory } = await ensureDirectories();
  const file = path.join(idempotencyDirectory, `${key}.json`);
  try {
    const handle = await open(file, "wx", 0o600);
    await handle.writeFile(JSON.stringify({ state: "processing", createdAt: new Date().toISOString() }));
    await handle.close();
    return { fresh: true as const, file };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    const existing = JSON.parse(await readFile(file, "utf8")) as { state?: string; token?: string };
    if (existing.state === "complete" && existing.token) return { fresh: false as const, file, token: existing.token };
    throw new Error("Dieser Kassiervorgang wird bereits verarbeitet. Bitte nicht erneut kassieren.");
  }
}

export async function releaseCheckout(file: string) {
  await unlink(file).catch(() => undefined);
}

export async function completeCheckout(file: string, token: string) {
  const temporary = `${file}.${process.pid}.tmp`;
  await writeFile(temporary, JSON.stringify({ state: "complete", token, completedAt: new Date().toISOString() }), { mode: 0o600 });
  await rename(temporary, file);
}

export async function saveReceipt(receipt: Omit<PosReceipt, "token" | "pdfAvailable">, pdf?: Uint8Array) {
  const { receiptDirectory } = await ensureDirectories();
  const token = randomBytes(24).toString("base64url");
  const record: PosReceipt = { ...receipt, token, pdfAvailable: Boolean(pdf?.byteLength) };
  await writeFile(path.join(receiptDirectory, `${token}.json`), JSON.stringify(record, null, 2), { mode: 0o600 });
  if (pdf?.byteLength) await writeFile(path.join(receiptDirectory, `${token}.pdf`), pdf, { mode: 0o600 });
  return record;
}

export async function getReceipt(token: string) {
  const { receiptDirectory } = paths();
  try {
    return JSON.parse(await readFile(path.join(receiptDirectory, `${safeToken(token)}.json`), "utf8")) as PosReceipt;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function saveReceiptPdf(token: string, pdf: Uint8Array) {
  const { receiptDirectory } = await ensureDirectories();
  const receipt = await getReceipt(token);
  if (!receipt) throw new Error("Bon nicht gefunden.");
  await writeFile(path.join(receiptDirectory, `${safeToken(token)}.pdf`), pdf, { mode: 0o600 });
  if (!receipt.pdfAvailable) {
    const updated = { ...receipt, pdfAvailable: true };
    await writeFile(path.join(receiptDirectory, `${safeToken(token)}.json`), JSON.stringify(updated, null, 2), { mode: 0o600 });
  }
}

export async function getReceiptPdf(token: string) {
  const { receiptDirectory } = paths();
  try {
    return await readFile(path.join(receiptDirectory, `${safeToken(token)}.pdf`));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}
