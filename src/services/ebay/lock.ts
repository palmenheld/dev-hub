import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, readFile, unlink } from "node:fs/promises";
import path from "node:path";
import { getEbayDataDirectory } from "./store";

const STALE_AFTER_MS = 10 * 60 * 1000;

function lockPath(key: string) {
  const digest = createHash("sha256").update(key).digest("hex");
  return path.join(getEbayDataDirectory(), "locks", `${digest}.lock`);
}

async function acquire(key: string, retryStale = true) {
  const filePath = lockPath(key);
  const owner = randomUUID();
  await mkdir(path.dirname(filePath), { recursive: true });
  try {
    const handle = await open(filePath, "wx", 0o600);
    await handle.writeFile(
      JSON.stringify({ key, owner, pid: process.pid, createdAt: new Date().toISOString() })
    );
    return { handle, filePath, owner };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    if (retryStale) {
      try {
        const stored = JSON.parse(await readFile(filePath, "utf8")) as {
          createdAt?: string;
        };
        const createdAt = new Date(stored.createdAt || "").getTime();
        if (
          Number.isFinite(createdAt) &&
          Date.now() - createdAt > STALE_AFTER_MS
        ) {
          await unlink(filePath);
          return acquire(key, false);
        }
      } catch {}
    }
    throw new Error(
      "Für diesen eBay-Entwurf läuft bereits eine Aktion. Bitte kurz warten und den Status aktualisieren."
    );
  }
}

export async function withEbayMutationLock<T>(
  key: string,
  operation: () => Promise<T>
) {
  const lock = await acquire(key);
  try {
    return await operation();
  } finally {
    await lock.handle.close().catch(() => undefined);
    try {
      const stored = JSON.parse(await readFile(lock.filePath, "utf8")) as {
        owner?: string;
      };
      if (stored.owner === lock.owner) await unlink(lock.filePath);
    } catch {}
  }
}
