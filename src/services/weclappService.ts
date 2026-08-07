const baseUrl = process.env.WECLAPP_BASE_URL;
const apiToken = process.env.WECLAPP_API_TOKEN;

function getConfig() {
  if (!baseUrl) {
    throw new Error("WECLAPP_BASE_URL fehlt.");
  }

  if (!apiToken) {
    throw new Error("WECLAPP_API_TOKEN fehlt.");
  }

  return {
    baseUrl: baseUrl.replace(/\/$/, ""),
    apiToken,
  };
}

export async function getWeclappArticles() {
  const config = getConfig();

  const response = await fetch(
    `${config.baseUrl}/webapp/api/v2/article?pageSize=20`,
    {
      headers: {
        AuthenticationToken: config.apiToken,
        Accept: "application/json",
      },
      cache: "no-store",
    }
  );

  if (!response.ok) {
    const body = await response.text();

    throw new Error(
      `Weclapp API Fehler ${response.status}: ${body.slice(0, 500)}`
    );
  }

  return response.json();
}
