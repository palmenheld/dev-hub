import { NextResponse } from "next/server";
import { finishEbayAuthorization } from "@/services/ebay/oauth";

function safeMessage(value: string) {
  return value.replace(/\s+/g, " ").trim().slice(0, 300);
}

function callbackOrigin(request: Request) {
  const configured = process.env.EBAY_OAUTH_CALLBACK_URL?.trim();
  if (configured) return new URL(configured).origin;
  return new URL(request.url).origin;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const state = url.searchParams.get("state") || "";
  const code = url.searchParams.get("code") || "";
  const denied = url.searchParams.get("error");
  let returnOrigin = callbackOrigin(request);
  try {
    if (denied) {
      throw new Error("Die eBay-Freigabe wurde abgebrochen oder abgelehnt.");
    }
    if (!code || !state) {
      throw new Error("eBay hat keinen vollständigen Anmeldecode zurückgegeben.");
    }
    returnOrigin = await finishEbayAuthorization({ code, state });
    const target = new URL("/channels/ebay", returnOrigin);
    target.searchParams.set("ebayConnected", "1");
    return NextResponse.redirect(target);
  } catch (error) {
    const target = new URL("/channels/ebay", returnOrigin);
    target.searchParams.set(
      "ebayError",
      safeMessage(error instanceof Error ? error.message : "Unbekannter Fehler")
    );
    return NextResponse.redirect(target);
  }
}
