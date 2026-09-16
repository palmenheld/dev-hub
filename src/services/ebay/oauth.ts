import {
  getEbayEnvironment,
  requireEbayOAuthConfiguration,
} from "./config";
import {
  consumeEbayOAuthState,
  createEbayOAuthState,
  saveEbayOAuthGrant,
} from "./oauthStore";

type AuthorizationTokenResponse = {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  refresh_token_expires_in?: number;
  error_description?: string;
};

function compact(value: string) {
  return value.replace(/\s+/g, " ").trim().slice(0, 500);
}

export async function createEbayAuthorizationUrl(returnOrigin: string) {
  const config = requireEbayOAuthConfiguration();
  const state = await createEbayOAuthState(returnOrigin);
  const url = new URL(config.authorizationUrl);
  url.search = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.ruName,
    response_type: "code",
    scope: config.scopes.join(" "),
    state,
    locale: "de-DE",
    prompt: "login",
  }).toString();
  return url.toString();
}

export async function finishEbayAuthorization(input: {
  code: string;
  state: string;
}) {
  const oauthState = await consumeEbayOAuthState(input.state);
  const config = requireEbayOAuthConfiguration();
  if (config.environment !== getEbayEnvironment()) {
    throw new Error("Die eBay-Umgebung wurde während der Anmeldung geändert.");
  }
  const response = await fetch(config.tokenUrl, {
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
      grant_type: "authorization_code",
      code: input.code,
      redirect_uri: config.ruName,
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  const responseText = await response.text();
  let payload: AuthorizationTokenResponse = {};
  try {
    payload = responseText
      ? (JSON.parse(responseText) as AuthorizationTokenResponse)
      : {};
  } catch {}
  if (!response.ok || !payload.refresh_token) {
    throw new Error(
      payload.error_description ||
        `eBay konnte die Verkäuferfreigabe nicht abschließen: ${compact(
          responseText
        )}`
    );
  }
  await saveEbayOAuthGrant({
    environment: config.environment,
    refreshToken: payload.refresh_token,
    refreshTokenExpiresIn: Number(payload.refresh_token_expires_in) || undefined,
  });
  return oauthState.returnOrigin;
}
