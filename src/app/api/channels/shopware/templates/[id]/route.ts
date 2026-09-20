import { NextResponse } from "next/server";
import { deleteProductTemplate } from "@/services/shopware/templates";
import { assertSameOrigin } from "@/services/requestSecurity";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    assertSameOrigin(request);
    const { id } = await params;
    await deleteProductTemplate(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Template konnte nicht gelöscht werden." },
      { status: 400 }
    );
  }
}
