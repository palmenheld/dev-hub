import { NextResponse } from "next/server";
import {
  createOverwinteringRecord,
  listOverwinteringRecords,
} from "@/services/overwintering/store";
import { assertSameOrigin } from "@/services/requestSecurity";
import type { OverwinteringRecordInput } from "@/types/overwintering";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json({ records: await listOverwinteringRecords() });
  } catch (error) {
    console.error("Überwinterungsakten konnten nicht geladen werden:", error);
    return NextResponse.json(
      { error: "Die Überwinterungsakten konnten nicht geladen werden." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const input = (await request.json()) as Partial<OverwinteringRecordInput>;
    const record = await createOverwinteringRecord(input);
    return NextResponse.json({ record }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Die Überwinterung konnte nicht angelegt werden.",
      },
      { status: 400 }
    );
  }
}
