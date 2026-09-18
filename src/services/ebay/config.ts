import type {
  EbayConnection,
  EbayEnvironment,
  EbayPublishingSettings,
} from "@/types/ebay";
import { readStoredEbayRefreshToken } from "./oauthStore";

export type EbayConfiguration = {
  environment: EbayEnvironment;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  ruName: string;
  scopes: string[];
  apiBaseUrl: string;
  mediaBaseUrl: string;
};

const labels: Record<string, string> = {
  EBAY_CLIENT_ID: "Client-ID (App-ID)",
  EBAY_CLIENT_SECRET: "Client-Secret (Cert-ID)",
  EBAY_REFRESH_TOKEN: "Verkäufer-Freigabe (OAuth Refresh Token)",
  EBAY_RUNAME: "Redirect-Name (RuName)",
};

const DEFAULT_SCOPES = [
  "https://api.ebay.com/oauth/api_scope",
  "https://api.ebay.com/oauth/api_scope/sell.inventory",
  "https://api.ebay.com/oauth/api_scope/sell.account",
];

export function getEbayEnvironment(): EbayEnvironment {
  return process.env.EBAY_ENVIRONMENT?.trim().toLowerCase() === "production"
    ? "production"
    : "sandbox";
}

function rawConfiguration() {
  const currentEnvironment = getEbayEnvironment();
  return {
    clientId: process.env.EBAY_CLIENT_ID?.trim() ?? "",
    clientSecret: process.env.EBAY_CLIENT_SECRET?.trim() ?? "",
    refreshToken:
      process.env.EBAY_REFRESH_TOKEN?.trim() ||
      readStoredEbayRefreshToken(currentEnvironment),
    ruName: process.env.EBAY_RUNAME?.trim() ?? "",
    oauthCallbackUrl: process.env.EBAY_OAUTH_CALLBACK_URL?.trim() ?? "",
  };
}

export function getEbayScopes() {
  const configuredScopes = (process.env.EBAY_SCOPES ?? "")
    .split(/\s+/)
    .map((value) => value.trim())
    .filter(Boolean);
  return configuredScopes.length ? configuredScopes : DEFAULT_SCOPES;
}

export function requireEbayOAuthConfiguration() {
  const values = rawConfiguration();
  const missing = [
    ["EBAY_CLIENT_ID", values.clientId],
    ["EBAY_CLIENT_SECRET", values.clientSecret],
    ["EBAY_RUNAME", values.ruName],
  ].filter(([, value]) => !value);
  if (missing.length) {
    throw new Error(
      `Für die eBay-Anmeldung fehlt noch: ${missing
        .map(([key]) => labels[key])
        .join(", ")}.`
    );
  }
  const sandbox = getEbayEnvironment() === "sandbox";
  return {
    environment: getEbayEnvironment(),
    clientId: values.clientId,
    clientSecret: values.clientSecret,
    ruName: values.ruName,
    scopes: getEbayScopes(),
    authorizationUrl: sandbox
      ? "https://auth.sandbox.ebay.com/oauth2/authorize"
      : "https://auth.ebay.com/oauth2/authorize",
    tokenUrl: sandbox
      ? "https://api.sandbox.ebay.com/identity/v1/oauth2/token"
      : "https://api.ebay.com/identity/v1/oauth2/token",
  };
}

export function normalizeEbayMarketplaceId(value?: string) {
  const normalized = (value || "")
    .trim()
    .toUpperCase()
    .replace(/^EBAY-/, "EBAY_");
  return normalized || "EBAY_DE";
}

export function getEnvironmentSettings(): EbayPublishingSettings {
  return {
    marketplaceId: normalizeEbayMarketplaceId(process.env.EBAY_MARKETPLACE_ID),
    currency: process.env.EBAY_CURRENCY?.trim() || "EUR",
    merchantLocationKey:
      process.env.EBAY_MERCHANT_LOCATION_KEY?.trim() || "",
    fulfillmentPolicyId:
      process.env.EBAY_FULFILLMENT_POLICY_ID?.trim() || "",
    paymentPolicyId: process.env.EBAY_PAYMENT_POLICY_ID?.trim() || "",
    returnPolicyId: process.env.EBAY_RETURN_POLICY_ID?.trim() || "",
  };
}

export function missingPublishingSettings(settings: EbayPublishingSettings) {
  const fields: Array<[keyof EbayPublishingSettings, string]> = [
    ["merchantLocationKey", "Lagerort"],
    ["fulfillmentPolicyId", "Versandrichtlinie"],
    ["paymentPolicyId", "Zahlungsrichtlinie"],
    ["returnPolicyId", "Rückgaberichtlinie"],
  ];
  return fields.filter(([key]) => !settings[key]).map(([, label]) => label);
}

export function getEbayConnection(
  settings: EbayPublishingSettings = getEnvironmentSettings()
): EbayConnection {
  const values = rawConfiguration();
  const authorizationReady = Boolean(
    values.clientId && values.clientSecret && values.ruName
  );
  const missingConfiguration = (
    [
      ["EBAY_CLIENT_ID", values.clientId],
      ["EBAY_CLIENT_SECRET", values.clientSecret],
      ["EBAY_REFRESH_TOKEN", values.refreshToken],
      ...(!values.refreshToken
        ? ([["EBAY_RUNAME", values.ruName]] as const)
        : []),
    ] as const
  )
    .filter(([, value]) => !value)
    .map(([key]) => labels[key]);
  const missingPublishingSetup = [
    ...missingPublishingSettings(settings),
    ...(process.env.EBAY_PUBLISH_KEY?.trim() ? [] : ["eBay-Sicherheitscode"]),
    ...(getEbayEnvironment() === "production" &&
    process.env.EBAY_PRODUCTION_WRITES_ENABLED?.trim().toLowerCase() !== "true"
      ? ["Live-Schreibzugriff (EBAY_PRODUCTION_WRITES_ENABLED=true)"]
      : []),
  ];
  const currentEnvironment = getEbayEnvironment();

  if (missingConfiguration.length) {
    if (authorizationReady && !values.refreshToken) {
      return {
        state: "not_configured",
        configured: false,
        authorizationReady: true,
        publishReady: false,
        environment: currentEnvironment,
        label: "Verkäuferkonto noch nicht verbunden",
        description:
          "Die eBay-App ist eingerichtet. Jetzt einmal das Verkäuferkonto bei eBay freigeben.",
        missingConfiguration,
        missingPublishingSetup,
        oauthCallbackUrl: values.oauthCallbackUrl || undefined,
      };
    }
    return {
      state: "not_configured",
      configured: false,
      authorizationReady,
      publishReady: false,
      environment: currentEnvironment,
      label: "eBay-Zugang noch nicht vollständig",
      description: `Noch benötigt: ${missingConfiguration.join(", ")}.`,
      missingConfiguration,
      missingPublishingSetup,
      oauthCallbackUrl: values.oauthCallbackUrl || undefined,
    };
  }

  return {
    state: "configured",
    configured: true,
    authorizationReady,
    publishReady: missingPublishingSetup.length === 0,
    environment: currentEnvironment,
    label: "Bereit zum Verbindungstest",
    description:
      "Die Zugangsdaten sind serverseitig hinterlegt. eBay wurde noch nicht kontaktiert.",
    missingConfiguration: [],
    missingPublishingSetup,
    oauthCallbackUrl: values.oauthCallbackUrl || undefined,
  };
}

export function requireEbayConfiguration(): EbayConfiguration {
  const connection = getEbayConnection();
  if (!connection.configured) throw new Error(connection.description);
  const values = rawConfiguration();
  const sandbox = connection.environment === "sandbox";
  return {
    environment: connection.environment,
    clientId: values.clientId,
    clientSecret: values.clientSecret,
    refreshToken: values.refreshToken,
    ruName: values.ruName,
    scopes: getEbayScopes(),
    apiBaseUrl: sandbox
      ? "https://api.sandbox.ebay.com"
      : "https://api.ebay.com",
    mediaBaseUrl: sandbox
      ? "https://apim.sandbox.ebay.com"
      : "https://apim.ebay.com",
  };
}
