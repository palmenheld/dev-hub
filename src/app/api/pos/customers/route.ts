import { NextResponse } from "next/server";
import { searchPosCustomers } from "@/services/pos/catalog";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const query = new URL(request.url).searchParams.get("query")?.trim() || "";
    if (query.length < 4 || query.length > 120) throw new Error("Bitte mindestens 4 Zeichen eingeben.");
    return NextResponse.json({ customers: await searchPosCustomers(query) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Die Kunden konnten nicht geladen werden." },
      { status: 400 }
    );
  }
}
