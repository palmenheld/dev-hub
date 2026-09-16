export function getWeclappConfiguration() {
  const configuredBaseUrl = process.env.WECLAPP_BASE_URL?.trim();
  const apiToken = process.env.WECLAPP_API_TOKEN?.trim();
  if (!configuredBaseUrl) {
    throw new Error("WECLAPP_BASE_URL ist nicht gesetzt.");
  }

  if (!apiToken) {
    throw new Error("WECLAPP_API_TOKEN ist nicht gesetzt.");
  }

  const tenantBaseUrl = configuredBaseUrl
    .replace(/\/+$/, "")
    .replace(/\/webapp\/api\/v[12]$/i, "");
  const parsed = new URL(tenantBaseUrl);
  if (parsed.protocol !== "https:") {
    throw new Error("WECLAPP_BASE_URL muss HTTPS verwenden.");
  }

  return {
    tenantBaseUrl,
    apiToken,
  };
}

export type WeclappRequestOptions = {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
};

export class WeclappHttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "WeclappHttpError";
    this.status = status;
  }
}

export async function weclappRequest<T>(
  endpoint: string,
  options: WeclappRequestOptions = {}
): Promise<T> {
  const config = getWeclappConfiguration();

  const url = new URL(
    `${config.tenantBaseUrl}/webapp/api/v2/${endpoint.replace(/^\//, "")}`
  );

  if (options.query) {
    Object.entries(options.query).forEach(([key, value]) => {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    });
  }

  const response = await fetch(url, {
    method: options.method ?? "GET",

    headers: {
      AuthenticationToken: config.apiToken,
      Accept: "application/json",
      "Content-Type": "application/json",
    },

    body:
      options.body !== undefined
        ? JSON.stringify(options.body)
        : undefined,

    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    const responseBody = await response.text();

    throw new WeclappHttpError(
      response.status,
      `Weclapp API ${response.status} ${response.statusText}: ${responseBody.slice(
        0,
        1000
      )}`
    );
  }

  if (response.status === 204) return {} as T;
  const text = await response.text();
  return (text ? JSON.parse(text) : {}) as T;
}
