import { requireShopwareConfiguration } from "./config";

type ShopwareTokenResponse = {
  access_token: string;
  expires_in: number;
  token_type: string;
};

type TokenCache = {
  cacheKey: string;
  accessToken: string;
  expiresAt: number;
};

let tokenCache: TokenCache | null = null;
export class ShopwareHttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ShopwareHttpError";
    this.status = status;
  }
}


async function readErrorResponse(response: Response) {
  const body = await response.text();
  const compactBody = body.replace(/\s+/g, " ").trim().slice(0, 400);

  return compactBody
    ? `Shopware antwortet mit ${response.status}: ${compactBody}`
    : `Shopware antwortet mit ${response.status} ${response.statusText}.`;
}

async function getAccessToken() {
  const config = requireShopwareConfiguration();
  const cacheKey = `${config.baseUrl}:${config.clientId}`;

  if (
    tokenCache?.cacheKey === cacheKey &&
    tokenCache.expiresAt > Date.now() + 30_000
  ) {
    return tokenCache.accessToken;
  }

  const response = await fetch(`${config.baseUrl}/api/oauth/token`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      grant_type: "client_credentials",
      client_id: config.clientId,
      client_secret: config.clientSecret,
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    throw new ShopwareHttpError(
      response.status,
      await readErrorResponse(response)
    );
  }

  const token = (await response.json()) as Partial<ShopwareTokenResponse>;

  if (!token.access_token) {
    throw new Error("Shopware hat kein Zugriffstoken zurückgegeben.");
  }

  tokenCache = {
    cacheKey,
    accessToken: token.access_token,
    expiresAt: Date.now() + Math.max(token.expires_in ?? 600, 60) * 1000,
  };

  return tokenCache.accessToken;
}

export async function shopwareRequest<T>(
  endpoint: string,
  options: {
    method?: "GET" | "POST" | "PATCH" | "DELETE";
    body?: unknown;
    timeoutMs?: number;
  } = {}
) {
  const config = requireShopwareConfiguration();
  const accessToken = await getAccessToken();
  const response = await fetch(
    `${config.baseUrl}/api/${endpoint.replace(/^\/?api\//, "").replace(/^\//, "")}`,
    {
      method: options.method ?? "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      cache: "no-store",
      signal: AbortSignal.timeout(options.timeoutMs ?? 20_000),
    }
  );

  if (!response.ok) {
    throw new ShopwareHttpError(
      response.status,
      await readErrorResponse(response)
    );
  }

  if (response.status === 204) return {} as T;
  const text = await response.text();
  return (text ? JSON.parse(text) : {}) as T;
}

export async function shopwareBinaryRequest(
  endpoint: string,
  body: ArrayBuffer,
  contentType: string
) {
  const config = requireShopwareConfiguration();
  const accessToken = await getAccessToken();
  const response = await fetch(
    `${config.baseUrl}/api/${endpoint
      .replace(/^\/?api\//, "")
      .replace(/^\//, "")}`,
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": contentType,
      },
      body,
      cache: "no-store",
      signal: AbortSignal.timeout(45_000),
    }
  );

  if (!response.ok) {
    throw new ShopwareHttpError(
      response.status,
      await readErrorResponse(response)
    );
  }

  if (response.status === 204) return {};
  const text = await response.text();
  return text ? (JSON.parse(text) as unknown) : {};
}
