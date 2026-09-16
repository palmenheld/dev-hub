import { NextResponse } from "next/server";
import { checkApiCompatibility } from "@/services/shopware/compatibility";
import { assertSameOrigin } from "@/services/requestSecurity";

export const maxDuration = 120;

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const compatibility = await checkApiCompatibility();
    return NextResponse.json({ compatibility });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Die API-Kompatibilität konnte nicht geprüft werden.",
      },
      { status: 502 }
    );
  }
}
