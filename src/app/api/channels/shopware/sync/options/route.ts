import { NextResponse } from "next/server";
import { getIntegrationOptions } from "@/services/shopware/mappingOptions";
import { assertSameOrigin } from "@/services/requestSecurity";

export const maxDuration = 120;

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const options = await getIntegrationOptions();
    return NextResponse.json({ options });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Zuordnungswerte konnten nicht geladen werden.",
      },
      { status: 502 }
    );
  }
}
