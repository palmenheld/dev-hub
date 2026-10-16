import { NextResponse } from "next/server";
import { addOverwinteringPhoto } from "@/services/overwintering/store";
import { assertSameOrigin } from "@/services/requestSecurity";

export const maxDuration = 60;

type Context = { params: Promise<{ id: string; plantId: string }> };

export async function POST(request: Request, { params }: Context) {
  try {
    assertSameOrigin(request);
    const { id, plantId } = await params;
    const formData = await request.formData();
    const file = formData.get("photo");
    if (!(file instanceof File)) throw new Error("Bitte ein Foto auswählen.");
    return NextResponse.json({ record: await addOverwinteringPhoto(id, plantId, file) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Das Foto konnte nicht gespeichert werden." },
      { status: 400 }
    );
  }
}
