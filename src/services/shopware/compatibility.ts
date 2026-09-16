import { getWeclappConfiguration } from "@/services/weclapp/client";
import { shopwareRequest } from "./client";

type OpenApiDocument = {
  info?: {
    title?: string;
    version?: string;
  };
  paths?: Record<string, unknown>;
};

export type ApiCompatibility = {
  checkedAt: string;
  securityWarnings: string[];
  weclapp: {
    version: string;
    available: Record<string, boolean>;
  };
  shopware: {
    version: string;
    available: Record<string, boolean>;
  };
};

function containsPath(paths: string[], fragment: string) {
  const wanted = fragment.toLowerCase();
  return paths.some((path) => path.toLowerCase().includes(wanted));
}

function versionParts(value: string) {
  const match = value.match(/(\d+)\.(\d+)\.(\d+)(?:\.(\d+))?/);
  return match ? match.slice(1).map((part) => Number(part || 0)) : null;
}

function compareVersion(left: number[], right: number[]) {
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

function shopwareStateTransitionWarning(version: string) {
  const parsed = versionParts(version);
  if (!parsed || parsed[0] !== 6) return null;
  const vulnerable =
    (parsed[1] === 6 && compareVersion(parsed, [6, 6, 10, 18]) < 0) ||
    (parsed[1] === 7 && compareVersion(parsed, [6, 7, 10, 1]) < 0);
  return vulnerable
    ? "Wichtige Shopware-Sicherheitsaktualisierung fehlt: Vor Status-Synchronisation mindestens 6.6.10.18 beziehungsweise 6.7.10.1 installieren (CVE-2026-48014)."
    : null;
}

async function shopwareVersion() {
  try {
    const response = await shopwareRequest<{ version?: string }>(
      "_info/version"
    );
    return response.version?.trim() || "";
  } catch {
    return "";
  }
}

async function weclappOpenApi() {
  const config = getWeclappConfiguration();
  const response = await fetch(
    `${config.tenantBaseUrl}/webapp/api/v2/meta/openapi.json`,
    {
      headers: {
        AuthenticationToken: config.apiToken,
        Accept: "application/json",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(45_000),
    }
  );
  if (!response.ok) {
    throw new Error(
      `weclapp-API-Schema konnte nicht gelesen werden (HTTP ${response.status}).`
    );
  }
  return (await response.json()) as OpenApiDocument;
}

export async function checkApiCompatibility(): Promise<ApiCompatibility> {
  const [weclapp, shopware, installedShopwareVersion] = await Promise.all([
    weclappOpenApi(),
    shopwareRequest<OpenApiDocument>("_info/openapi3.json", {
      timeoutMs: 45_000,
    }),
    shopwareVersion(),
  ]);
  const weclappPaths = Object.keys(weclapp.paths ?? {});
  const shopwarePaths = Object.keys(shopware.paths ?? {});

  const shopwareVersionNumber =
    installedShopwareVersion || shopware.info?.version || "unbekannt";
  const securityWarnings = [
    shopwareStateTransitionWarning(shopwareVersionNumber),
  ].filter((warning): warning is string => Boolean(warning));
  return {
    checkedAt: new Date().toISOString(),
    securityWarnings,
    weclapp: {
      version: weclapp.info?.version || "unbekannt",
      available: {
        articles: containsPath(weclappPaths, "/article"),
        prices: containsPath(weclappPaths, "/articleprice"),
        stock: containsPath(weclappPaths, "/warehousestock"),
        warehouses: containsPath(weclappPaths, "/warehouse"),
        customers: containsPath(weclappPaths, "/party"),
        orders: containsPath(weclappPaths, "/salesorder"),
        deliveries: containsPath(weclappPaths, "/shipment"),
      },
    },
    shopware: {
      version: shopwareVersionNumber,
      available: {
        products: containsPath(shopwarePaths, "/product"),
        prices: containsPath(shopwarePaths, "/product"),
        stock: containsPath(shopwarePaths, "/product"),
        customers: containsPath(shopwarePaths, "/customer"),
        orders: containsPath(shopwarePaths, "/order"),
        deliveries: containsPath(shopwarePaths, "/order-delivery"),
        media: containsPath(shopwarePaths, "/media"),
        states: containsPath(shopwarePaths, "/state-machine"),
      },
    },
  };
}
