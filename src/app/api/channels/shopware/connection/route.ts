import { NextResponse } from "next/server";
import {
  getShopwareConnection,
  testShopwareConnection,
} from "@/services/shopware";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ connection: getShopwareConnection() });
}

export async function POST() {
  const connection = getShopwareConnection();

  if (!connection.configured) {
    return NextResponse.json(
      { connection, error: connection.description },
      { status: 400 }
    );
  }

  try {
    const { productCount } = await testShopwareConnection();

    return NextResponse.json({
      connection: {
        ...connection,
        state: "connected",
        label: "Mit Shopware verbunden",
        description:
          "Der sichere Lesezugriff auf die Shopware-Produktdaten funktioniert.",
        productCount,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Die Shopware-Verbindung konnte nicht geprüft werden.";

    console.error("Shopware-Verbindungstest fehlgeschlagen:", message);

    return NextResponse.json(
      {
        connection: {
          ...connection,
          state: "error",
          label: "Verbindung fehlgeschlagen",
          description: message,
        },
        error: message,
      },
      { status: 502 }
    );
  }
}
