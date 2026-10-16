import { NextResponse } from "next/server";
import { searchWeclappCustomers } from "@/services/overwintering/customers";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const query = new URL(request.url).searchParams.get("query") ?? "";
    return NextResponse.json({ customers: await searchWeclappCustomers(query) });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Die Weclapp-Kunden konnten nicht geladen werden.",
      },
      { status: 400 }
    );
  }
}
