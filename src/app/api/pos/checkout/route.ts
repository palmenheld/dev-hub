import { NextResponse } from "next/server";
import { getCurrentUser } from "@/services/auth/currentUser";
import { checkoutPos } from "@/services/pos/checkout";
import { getPosConfig } from "@/services/pos/config";
import { assertPosCheckoutPin, assertSameOrigin } from "@/services/requestSecurity";
import type { PosCartInput } from "@/types/pos";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    assertPosCheckoutPin(request);
    const user = await getCurrentUser();
    if (!user) throw new Error("Bitte erneut am Hub anmelden.");
    const body = await request.json() as {
      items?: PosCartInput[];
      customerId?: string;
      paymentMethodId?: number;
      amountTendered?: number;
      idempotencyKey?: string;
      digitalReceiptConsent?: boolean;
    };
    if (body.digitalReceiptConsent !== true) {
      throw new Error("Für die Hub-Kasse muss der Kunde dem elektronischen Bon zustimmen. Andernfalls bitte direkt in POS kassieren und einen Papierbon ausgeben.");
    }
    const receipt = await checkoutPos({
      items: body.items || [],
      customerId: body.customerId?.trim() || undefined,
      paymentMethodId: Number(body.paymentMethodId),
      amountTendered: Number(body.amountTendered),
      idempotencyKey: String(body.idempotencyKey || ""),
      cashierName: user.displayName,
    });
    const config = getPosConfig();
    const requestOrigin = new URL(request.url).origin;
    const receiptUrl = `${config.receiptBaseUrl || requestOrigin}/receipt/${receipt.token}`;
    return NextResponse.json({ receipt, receiptUrl });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Der Verkauf konnte nicht abgeschlossen werden." },
      { status: 400 }
    );
  }
}
