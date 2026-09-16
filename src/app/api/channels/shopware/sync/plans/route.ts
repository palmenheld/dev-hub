import { NextResponse } from "next/server";
import {
  createProductSyncPlan,
} from "@/services/shopware/syncPlans";
import {
  listSyncAudit,
  listSyncPlans,
} from "@/services/shopware/syncStore";
import { assertSameOrigin } from "@/services/requestSecurity";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [plans, audit] = await Promise.all([
      listSyncPlans(20),
      listSyncAudit(100),
    ]);
    return NextResponse.json({ plans, audit });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Sync-Verlauf konnte nicht geladen werden.",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const body = (await request.json()) as {
      process?: unknown;
      articleIds?: unknown;
    };
    if (body.process !== "prices" && body.process !== "stock") {
      throw new Error("Bitte Preis oder Bestand als Prozess auswählen.");
    }
    if (!Array.isArray(body.articleIds)) {
      throw new Error("Die Artikelauswahl ist ungültig.");
    }
    const plan = await createProductSyncPlan(
      body.process,
      body.articleIds.map(String)
    );
    return NextResponse.json({ plan });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Die Sync-Vorschau konnte nicht erstellt werden.",
      },
      { status: 400 }
    );
  }
}
