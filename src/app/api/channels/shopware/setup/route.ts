import { NextResponse } from "next/server";
import { getPublishingSetup } from "@/services/shopware/publishingCandidates";
import { assertSameOrigin } from "@/services/requestSecurity";
import {
  saveFieldMap,
  savePublishingSettings,
} from "@/services/shopware/dataStore";
import {
  ShopwarePublishingSettings,
  WeclappFieldKey,
  WeclappFieldMap,
} from "@/types/shopwarePublishing";

const FIELD_KEYS: WeclappFieldKey[] = [
  "germanName",
  "latinName",
  "heightCm",
  "potSize",
  "images",
  "stock",
];

function parseFieldMap(value: unknown): WeclappFieldMap {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Die Feldzuordnung ist ungültig.");
  }
  const record = value as Record<string, unknown>;
  const fieldMap = {} as WeclappFieldMap;
  for (const key of FIELD_KEYS) {
    const selector = record[key];
    if (typeof selector !== "string" || selector.length > 240) {
      throw new Error(`Ungültige Zuordnung für ${key}.`);
    }
    fieldMap[key] = selector.trim();
  }
  return fieldMap;
}

function parsePublishingSettings(value: unknown): ShopwarePublishingSettings {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Die Shopware-Auswahl ist ungültig.");
  }
  const record = value as Record<string, unknown>;
  const readId = (key: keyof ShopwarePublishingSettings) => {
    const id = record[key];
    if (typeof id !== "string" || !/^[0-9a-f]{32}$/i.test(id)) {
      throw new Error(`Bitte ${key} in Shopware auswählen.`);
    }
    return id;
  };
  return {
    taxId: readId("taxId"),
    currencyId: readId("currencyId"),
    salesChannelId: readId("salesChannelId"),
  };
}

export async function GET() {
  try {
    return NextResponse.json(await getPublishingSetup());
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Die Feldzuordnung konnte nicht geladen werden.",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const body = (await request.json()) as {
      fieldMap?: unknown;
      shopwareSettings?: unknown;
    };
    const fieldMap = parseFieldMap(body.fieldMap);
    const shopwareSettings = parsePublishingSettings(body.shopwareSettings);
    await Promise.all([
      saveFieldMap(fieldMap),
      savePublishingSettings(shopwareSettings),
    ]);
    return NextResponse.json({ fieldMap, shopwareSettings });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Die Feldzuordnung konnte nicht gespeichert werden.",
      },
      { status: 400 }
    );
  }
}
