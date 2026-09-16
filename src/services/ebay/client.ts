import { createHash } from "node:crypto";
import { requireEbayConfiguration } from "./config";

type TokenResponse = {
  access_token?: string;
  expires_in?: number;
  error_description?: string;
};

type TokenCache = { key: string; token: string; expiresAt: number };
let tokenCache: TokenCache | null = null;
let tokenPromise: { key: string; promise: Promise<string> } | null = null;

export class EbayHttpError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
    this.name = "EbayHttpError";
  }
}

function compactError(value: string) {
  return (
    value.replace(/\s+/g, " ").trim().slice(0, 700) ||
    "Keine Fehlerdetails zurückgegeben."
  );
}

async function mintAccessToken(cacheKey: string) {
  const config = requireEbayConfiguration();

  const response = await fetch(
    `${config.apiBaseUrl}/identity/v1/oauth2/token`,
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization:
          "Basic " +
          Buffer.from(`${config.clientId}:${config.clientSecret}`).toString(
            "base64"
          ),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: config.refreshToken,
        scope: config.scopes.join(" "),
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    }
  );
  const responseText = await response.text();
  let payload: TokenResponse = {};
  try {
    payload = responseText ? (JSON.parse(responseText) as TokenResponse) : {};
  } catch {}
  if (!response.ok || !payload.access_token) {
    throw new EbayHttpError(
      response.status,
      payload.error_description ||
        `eBay-Anmeldung fehlgeschlagen: ${compactError(responseText)}`
    );
  }
  tokenCache = {
    key: cacheKey,
    token: payload.access_token,
    expiresAt:
      Date.now() + Math.max(60, Number(payload.expires_in) || 7200) * 1000,
  };
  return payload.access_token;
}

async function accessToken() {
  const config = requireEbayConfiguration();
  const tokenFingerprint = createHash("sha256")
    .update(config.refreshToken)
    .digest("hex")
    .slice(0, 16);
  const cacheKey = `${config.environment}:${config.clientId}:${tokenFingerprint}`;
  if (
    tokenCache?.key === cacheKey &&
    tokenCache.expiresAt > Date.now() + 60_000
  ) {
    return tokenCache.token;
  }
  if (!tokenPromise || tokenPromise.key !== cacheKey) {
    const promise = mintAccessToken(cacheKey).finally(() => {
      if (tokenPromise?.promise === promise) tokenPromise = null;
    });
    tokenPromise = { key: cacheKey, promise };
  }
  return tokenPromise.promise;
}

export async function ebayRequest<T>(
  endpoint: string,
  options: {
    method?: "GET" | "POST" | "PUT" | "DELETE";
    body?: unknown;
    headers?: Record<string, string>;
    timeoutMs?: number;
    allowNotFound?: boolean;
    base?: "api" | "media";
    retryingAfterUnauthorized?: boolean;
  } = {}
): Promise<T | null> {
  const config = requireEbayConfiguration();
  const token = await accessToken();
  const baseUrl =
    options.base === "media" ? config.mediaBaseUrl : config.apiBaseUrl;
  const response = await fetch(
    `${baseUrl}/${endpoint.replace(/^\//, "")}`,
    {
      method: options.method || "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
        "Accept-Language": "de-DE",
        "Content-Language": "de-DE",
        ...(options.body === undefined
          ? {}
          : { "Content-Type": "application/json" }),
        ...options.headers,
      },
      body:
        options.body === undefined ? undefined : JSON.stringify(options.body),
      cache: "no-store",
      signal: AbortSignal.timeout(options.timeoutMs ?? 25_000),
    }
  );
  if (response.status === 401 && !options.retryingAfterUnauthorized) {
    tokenCache = null;
    return ebayRequest<T>(endpoint, {
      ...options,
      retryingAfterUnauthorized: true,
    });
  }
  if (options.allowNotFound && response.status === 404) return null;
  if (!response.ok) {
    throw new EbayHttpError(
      response.status,
      `eBay antwortet mit ${response.status}: ${compactError(
        await response.text()
      )}`
    );
  }
  if (response.status === 204) return {} as T;
  const responseText = await response.text();
  return responseText ? (JSON.parse(responseText) as T) : ({} as T);
}

export async function ebayFormDataRequest<T>(
  endpoint: string,
  form: FormData,
  options: {
    headers?: Record<string, string>;
    timeoutMs?: number;
    retryingAfterUnauthorized?: boolean;
  } = {}
): Promise<T> {
  const config = requireEbayConfiguration();
  const token = await accessToken();
  const response = await fetch(
    `${config.mediaBaseUrl}/${endpoint.replace(/^\//, "")}`,
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
        "Accept-Language": "de-DE",
        "Content-Language": "de-DE",
        ...options.headers,
      },
      body: form,
      cache: "no-store",
      signal: AbortSignal.timeout(options.timeoutMs ?? 60_000),
    }
  );
  if (response.status === 401 && !options.retryingAfterUnauthorized) {
    tokenCache = null;
    return ebayFormDataRequest<T>(endpoint, form, {
      ...options,
      retryingAfterUnauthorized: true,
    });
  }
  if (!response.ok) {
    throw new EbayHttpError(
      response.status,
      `eBay-Bildupload antwortet mit ${response.status}: ${compactError(
        await response.text()
      )}`
    );
  }
  const responseText = await response.text();
  return responseText ? (JSON.parse(responseText) as T) : ({} as T);
}
