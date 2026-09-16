import { NextResponse } from "next/server";
import {
  createWeclappPriceChangePlan,
  WeclappPriceMode,
} from "@/services/shopware/syncPlans";
import { assertSameOrigin } from "@/services/requestSecurity";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const body = (await request.json()) as {
      articleIds?: unknown;
      mode?: unknown;
      value?: unknown;
    };
    if (!Array.isArray(body.articleIds)) {
      throw new Error("Die Artikelauswahl ist ungültig.");
    }
    if (
      body.mode !== "set" &&
      body.mode !== "increase" &&
      body.mode !== "decrease"
    ) {
      throw new Error("Die Preisänderung ist ungültig.");
    }

    const plan = await createWeclappPriceChangePlan(
      body.articleIds.map(String),
      body.mode as WeclappPriceMode,
      Number(body.value)
    );
    return NextResponse.json({ plan });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Die Preisvorschau konnte nicht erstellt werden.",
      },
      { status: 400 }
    );
  }
}
