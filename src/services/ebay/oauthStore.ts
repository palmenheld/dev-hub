import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import type { EbayEnvironment } from "@/types/ebay";

type StoredOAuthGrant = {
  environment: EbayEnvironment;
  refreshToken: string;
  refreshTokenExpiresAt?: string;
  grantedAt: string;
};

type OAuthState = {
  environment: EbayEnvironment;
  createdAt: string;
  returnOrigin: string;
};

const STATE_MAX_AGE_MS = 10 * 60 * 1000;

function environment(): EbayEnvironment {
  return process.env.EBAY_ENVIRONMENT?.trim().toLowerCase() === "production"
    ? "production"
    : "sandbox";
}

function dataDirectory(target = environment()) {
  const base =
    process.env.EBAY_DATA_DIR?.trim() ||
    path.join(process.cwd(), ".data", "ebay");
  return path.join(base, target);
}

function statePath(state: string, target = environment()) {
  const id = createHash("sha256").update(state).digest("hex");
  return path.join(dataDirectory(target), "oauth-states", `${id}.json`);
}

async function writeJson(filePath: string, value: unknown) {
  await mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
  const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  await rename(temporaryPath, filePath);
}

export function readStoredEbayRefreshToken(target = environment()) {
  try {
    const stored = JSON.parse(
      readFileSync(path.join(dataDirectory(target), "oauth.json"), "utf8")
    ) as StoredOAuthGrant;
    if (stored.environment !== target || !stored.refreshToken?.trim()) return "";
    if (
      stored.refreshTokenExpiresAt &&
      Date.parse(stored.refreshTokenExpiresAt) <= Date.now()
    ) {
      return "";
    }
    return stored.refreshToken.trim();
  } catch {
    return "";
  }
}

export async function saveEbayOAuthGrant(input: {
  environment: EbayEnvironment;
  refreshToken: string;
  refreshTokenExpiresIn?: number;
}) {
  const now = Date.now();
  const value: StoredOAuthGrant = {
    environment: input.environment,
    refreshToken: input.refreshToken,
    grantedAt: new Date(now).toISOString(),
    ...(input.refreshTokenExpiresIn
      ? {
          refreshTokenExpiresAt: new Date(
            now + input.refreshTokenExpiresIn * 1000
          ).toISOString(),
        }
      : {}),
  };
  await writeJson(path.join(dataDirectory(input.environment), "oauth.json"), value);
}

export async function createEbayOAuthState(returnOrigin: string) {
  const state = randomBytes(32).toString("base64url");
  const value: OAuthState = {
    environment: environment(),
    createdAt: new Date().toISOString(),
    returnOrigin,
  };
  await writeJson(statePath(state, value.environment), value);
  return state;
}

export async function consumeEbayOAuthState(state: string) {
  if (!/^[A-Za-z0-9_-]{40,100}$/.test(state)) {
    throw new Error("Die eBay-Anmeldung enthält keine gültige Sicherheitskennung.");
  }
  const target = environment();
  const filePath = statePath(state, target);
  let value: OAuthState;
  try {
    value = JSON.parse(await readFile(filePath, "utf8")) as OAuthState;
  } catch {
    throw new Error("Die eBay-Anmeldung ist ungültig oder wurde bereits verwendet.");
  }
  await unlink(filePath).catch(() => undefined);
  if (
    value.environment !== target ||
    !value.createdAt ||
    Date.now() - Date.parse(value.createdAt) > STATE_MAX_AGE_MS
  ) {
    throw new Error("Die eBay-Anmeldung ist abgelaufen. Bitte erneut starten.");
  }
  const origin = new URL(value.returnOrigin);
  if (!/^https?:$/.test(origin.protocol)) {
    throw new Error("Das Rücksprungziel der eBay-Anmeldung ist ungültig.");
  }
  return value;
}
