import { NextResponse } from "next/server";
import { createKleinanzeigenTemplate, listKleinanzeigenTemplates } from "@/services/kleinanzeigen";
import { assertSameOrigin } from "@/services/requestSecurity";
import type { CreateKleinanzeigenTemplateInput } from "@/types/kleinanzeigen";

export async function GET() {
  return NextResponse.json({ templates: await listKleinanzeigenTemplates() });
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const input = (await request.json()) as CreateKleinanzeigenTemplateInput;
    if (!input.name?.trim()) return NextResponse.json({ error: "Template-Name fehlt." }, { status: 400 });
    return NextResponse.json({ template: await createKleinanzeigenTemplate(input) }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Template konnte nicht gespeichert werden." }, { status: 400 });
  }
}
