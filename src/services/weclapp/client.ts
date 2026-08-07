const baseUrl = process.env.WECLAPP_BASE_URL;
const apiToken = process.env.WECLAPP_API_TOKEN;

function getConfiguration() {
  if (!baseUrl) {
    throw new Error("WECLAPP_BASE_URL ist nicht gesetzt.");
  }

  if (!apiToken) {
    throw new Error("WECLAPP_API_TOKEN ist nicht gesetzt.");
  }

  return {
    baseUrl: baseUrl.replace(/\/$/, ""),
    apiToken,
  };
}

export type WeclappRequestOptions = {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
};

export async function weclappRequest<T>(
  endpoint: string,
  options: WeclappRequestOptions = {}
): Promise<T> {
  const config = getConfiguration();

  const url = new URL(
    `${config.baseUrl}/webapp/api/v2/${endpoint.replace(/^\//, "")}`
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
  });

  if (!response.ok) {
    const responseBody = await response.text();

    throw new Error(
      `Weclapp API ${response.status} ${response.statusText}: ${responseBody.slice(
        0,
        1000
      )}`
    );
  }

  return response.json() as Promise<T>;
}
