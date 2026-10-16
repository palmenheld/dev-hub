import { NextResponse } from "next/server";
import {
  getOverwinteringRecord,
  updateOverwinteringRecord,
} from "@/services/overwintering/store";
import { assertSameOrigin } from "@/services/requestSecurity";
import type { OverwinteringRecordInput } from "@/types/overwintering";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Context) {
  try {
    const record = await getOverwinteringRecord((await params).id);
    if (!record) {
      return NextResponse.json({ error: "Überwinterung nicht gefunden." }, { status: 404 });
    }
    return NextResponse.json({ record });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Die Überwinterung konnte nicht geladen werden." },
      { status: 400 }
    );
  }
}

export async function PUT(request: Request, { params }: Context) {
  try {
    assertSameOrigin(request);
    const input = (await request.json()) as Partial<OverwinteringRecordInput>;
    const record = await updateOverwinteringRecord((await params).id, input);
    if (!record) {
      return NextResponse.json({ error: "Überwinterung nicht gefunden." }, { status: 404 });
    }
    return NextResponse.json({ record });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Die Überwinterung konnte nicht gespeichert werden." },
      { status: 400 }
    );
  }
}
