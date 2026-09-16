import { ShopwareConnection } from "@/types/shopware";

export type ShopwareConfiguration = {
  baseUrl: string;
  clientId: string;
  clientSecret: string;
};

const configurationLabels: Record<string, string> = {
  SHOPWARE_BASE_URL: "Shop-Adresse",
  SHOPWARE_CLIENT_ID: "Zugriffs-ID",
  SHOPWARE_CLIENT_SECRET: "Sicherheitsschlüssel",
};

function readConfiguration() {
  return {
    baseUrl: process.env.SHOPWARE_BASE_URL?.trim() ?? "",
    clientId: process.env.SHOPWARE_CLIENT_ID?.trim() ?? "",
    clientSecret: process.env.SHOPWARE_CLIENT_SECRET?.trim() ?? "",
  };
}

function getMissingConfiguration() {
  const config = readConfiguration();

  return [
    ["SHOPWARE_BASE_URL", config.baseUrl],
    ["SHOPWARE_CLIENT_ID", config.clientId],
    ["SHOPWARE_CLIENT_SECRET", config.clientSecret],
  ]
    .filter(([, value]) => !value)
    .map(([key]) => configurationLabels[key]);
}

function normalizeBaseUrl(value: string) {
  const url = new URL(value);

  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Die Shopware-Adresse muss mit http:// oder https:// beginnen.");
  }

  return url.toString().replace(/\/$/, "");
}

export function getShopwareConnection(): ShopwareConnection {
  const config = readConfiguration();
  const missingConfiguration = getMissingConfiguration();

  if (missingConfiguration.length > 0) {
    return {
      state: "not_configured",
      configured: false,
      label: "Shopware noch nicht eingerichtet",
      description: `Noch benötigt: ${missingConfiguration.join(", ")}.`,
      missingConfiguration,
    };
  }

  try {
    const shopUrl = normalizeBaseUrl(config.baseUrl);

    return {
      state: "configured",
      configured: true,
      label: "Bereit zum Verbindungstest",
      description:
        "Die Zugangsdaten sind serverseitig hinterlegt. Shopware wurde noch nicht kontaktiert.",
      shopUrl,
      missingConfiguration: [],
    };
  } catch (error) {
    return {
      state: "error",
      configured: false,
      label: "Shop-Adresse ist ungültig",
      description:
        error instanceof Error ? error.message : "Bitte die Shop-Adresse prüfen.",
      missingConfiguration: ["gültige Shop-Adresse"],
    };
  }
}

export function requireShopwareConfiguration(): ShopwareConfiguration {
  const connection = getShopwareConnection();
  const config = readConfiguration();

  if (!connection.configured || !connection.shopUrl) {
    throw new Error(connection.description);
  }

  return {
    baseUrl: connection.shopUrl,
    clientId: config.clientId,
    clientSecret: config.clientSecret,
  };
}
