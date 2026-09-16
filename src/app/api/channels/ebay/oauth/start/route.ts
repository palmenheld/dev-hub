import { NextResponse } from "next/server";
import { createEbayAuthorizationUrl } from "@/services/ebay/oauth";
import { assertSameOrigin } from "@/services/requestSecurity";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const origin = request.headers.get("origin");
    if (!origin) throw new Error("Der Aufruf hat keine gültige Herkunft.");
    return NextResponse.json({
      authorizationUrl: await createEbayAuthorizationUrl(origin),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Die eBay-Anmeldung konnte nicht gestartet werden.",
      },
      { status: 400 }
    );
  }
}
