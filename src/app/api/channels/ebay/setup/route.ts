import { NextResponse } from "next/server";
import type { EbayPublishingSettings } from "@/types/ebay";
import {
  getEbayConnection,
  normalizeEbayMarketplaceId,
} from "@/services/ebay/config";
import { loadEbaySetup } from "@/services/ebay/metadata";
import { getEbaySettings, saveEbaySettings } from "@/services/ebay/store";
import { assertSameOrigin } from "@/services/requestSecurity";

function normalize(input: unknown): EbayPublishingSettings {
  const value =
    typeof input === "object" && input !== null
      ? (input as Record<string, unknown>)
      : {};
  const read = (key: string, maximum = 200) =>
    typeof value[key] === "string" ? value[key].trim().slice(0, maximum) : "";
  const marketplaceId = normalizeEbayMarketplaceId(read("marketplaceId", 30));
  const currency = read("currency", 3).toUpperCase();
  if (!/^EBAY_[A-Z]{2,5}$/.test(marketplaceId)) {
    throw new Error("Der eBay-Marktplatz ist ungültig.");
  }
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error("Die Währung ist ungültig.");
  return {
    marketplaceId,
    currency,
    merchantLocationKey: read("merchantLocationKey"),
    fulfillmentPolicyId: read("fulfillmentPolicyId"),
    paymentPolicyId: read("paymentPolicyId"),
    returnPolicyId: read("returnPolicyId"),
  };
}

export async function GET() {
  try {
    const settings = await getEbaySettings();
    const connection = getEbayConnection(settings);
    if (!connection.configured) {
      return NextResponse.json({
        connection,
        settings,
        locations: [],
        fulfillmentPolicies: [],
        paymentPolicies: [],
        returnPolicies: [],
      });
    }
    return NextResponse.json(await loadEbaySetup());
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Einrichtung konnte nicht geladen werden." },
      { status: 400 }
    );
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const body = (await request.json()) as { settings?: unknown };
    const settings = normalize(body.settings);
    await saveEbaySettings(settings);
    const connection = getEbayConnection(settings);
    return NextResponse.json({
      settings,
      connection: connection.configured
        ? {
            ...connection,
            state: "connected",
            label: "eBay verbunden",
            description: connection.publishReady
              ? "eBay-Ziel und Geschäftsrichtlinien sind gespeichert."
              : `Gespeichert. Noch offen: ${connection.missingPublishingSetup.join(", ")}.`,
          }
        : connection,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Einrichtung konnte nicht gespeichert werden." },
      { status: 400 }
    );
  }
}
