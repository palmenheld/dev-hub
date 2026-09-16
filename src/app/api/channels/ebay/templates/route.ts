import { NextResponse } from "next/server";
import { createEbayTemplateFromDraft } from "@/services/ebay/templates";
import { listEbayTemplates } from "@/services/ebay/store";
import { assertSameOrigin } from "@/services/requestSecurity";

export async function GET() {
  try {
    return NextResponse.json({ templates: await listEbayTemplates() });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "eBay-Templates konnten nicht geladen werden.",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    return NextResponse.json({
      template: await createEbayTemplateFromDraft(await request.json()),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "eBay-Template konnte nicht gespeichert werden.",
      },
      { status: 400 }
    );
  }
}
