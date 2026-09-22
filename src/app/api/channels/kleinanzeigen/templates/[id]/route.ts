import { NextResponse } from "next/server";
import { deleteKleinanzeigenTemplate } from "@/services/kleinanzeigen";
import { assertSameOrigin } from "@/services/requestSecurity";

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  assertSameOrigin(request);
  return (await deleteKleinanzeigenTemplate((await params).id))
    ? NextResponse.json({ success: true })
    : NextResponse.json({ error: "Template nicht gefunden." }, { status: 404 });
}
