import { NextResponse } from "next/server";
import type { EbaySandboxBootstrapInput } from "@/types/ebay";
import { bootstrapEbaySandbox } from "@/services/ebay/bootstrap";
import { assertSameOrigin } from "@/services/requestSecurity";

const SHIPPING_SERVICES = new Set([
  "DE_DHLPaket",
  "DE_HermesPaket",
  "DE_DPD",
  "DE_GLS",
  "DE_Paket",
]);

function cleanString(
  value: unknown,
  label: string,
  maximum: number,
  pattern?: RegExp
) {
  const result =
    typeof value === "string" ? value.trim().slice(0, maximum) : "";
  if (!result || (pattern && !pattern.test(result))) {
    throw new Error(`${label} ist ungültig oder fehlt.`);
  }
  return result;
}

function normalize(value: unknown): EbaySandboxBootstrapInput {
  const body =
    typeof value === "object" && value !== null
      ? (value as Record<string, unknown>)
      : {};
  const shippingServiceCode = cleanString(
    body.shippingServiceCode,
    "Versanddienst",
    60
  );
  if (!SHIPPING_SERVICES.has(shippingServiceCode)) {
    throw new Error("Der ausgewählte Versanddienst wird nicht unterstützt.");
  }
  const shippingCost = Number(body.shippingCost);
  if (!Number.isFinite(shippingCost) || shippingCost < 0 || shippingCost > 9999) {
    throw new Error("Die Versandkosten müssen zwischen 0 und 9.999 Euro liegen.");
  }
  const handlingDays = Number(body.handlingDays);
  if (!Number.isInteger(handlingDays) || handlingDays < 0 || handlingDays > 30) {
    throw new Error("Die Bearbeitungszeit muss zwischen 0 und 30 Tagen liegen.");
  }
  const returnDays = Number(body.returnDays);
  if (returnDays !== 30 && returnDays !== 60) {
    throw new Error("Die Rückgabefrist muss 30 oder 60 Tage betragen.");
  }
  const payer = body.returnShippingCostPayer;
  if (payer !== "BUYER" && payer !== "SELLER") {
    throw new Error("Bitte den Kostenträger für Rücksendungen auswählen.");
  }

  return {
    merchantLocationKey: cleanString(
      body.merchantLocationKey,
      "Lagerort-Schlüssel",
      50,
      /^[A-Za-z0-9_-]+$/
    ),
    locationName: cleanString(body.locationName, "Name des Lagerorts", 100),
    postalCode: cleanString(
      body.postalCode,
      "Postleitzahl",
      12,
      /^[A-Za-z0-9 -]+$/
    ),
    city:
      typeof body.city === "string" ? body.city.trim().slice(0, 100) : "",
    country: cleanString(body.country, "Land", 2, /^[A-Z]{2}$/),
    fulfillmentPolicyName: cleanString(
      body.fulfillmentPolicyName,
      "Name der Versandrichtlinie",
      64
    ),
    shippingServiceCode,
    shippingCost: Math.round(shippingCost * 100) / 100,
    handlingDays,
    paymentPolicyName: cleanString(
      body.paymentPolicyName,
      "Name der Zahlungsrichtlinie",
      64
    ),
    returnPolicyName: cleanString(
      body.returnPolicyName,
      "Name der Rückgaberichtlinie",
      64
    ),
    returnDays,
    returnShippingCostPayer: payer,
  };
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const input = normalize(await request.json());
    return NextResponse.json(await bootstrapEbaySandbox(input));
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Die eBay-Sandbox konnte nicht eingerichtet werden.",
      },
      { status: 400 }
    );
  }
}
