import { NextResponse } from "next/server";
import { listProductTemplates } from "@/services/shopware/dataStore";
import { saveProductTemplateFromDraft } from "@/services/shopware/templates";
import { assertSameOrigin } from "@/services/requestSecurity";

export async function GET() {
  return NextResponse.json({ templates: await listProductTemplates() });
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const body = (await request.json()) as Record<string, unknown>;
    if (typeof body.draftId !== "string") throw new Error("Der Shopware-Entwurf fehlt.");
    return NextResponse.json({
      template: await saveProductTemplateFromDraft(body.draftId, body),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Template konnte nicht gespeichert werden." },
      { status: 400 }
    );
  }
}
