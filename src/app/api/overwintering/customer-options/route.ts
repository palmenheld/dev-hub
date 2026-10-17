import { NextResponse } from "next/server";
import { getWeclappCustomerCreateOptions } from "@/services/overwintering/customers";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json({
      options: await getWeclappCustomerCreateOptions(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Die Weclapp-Auswahlwerte konnten nicht geladen werden.",
      },
      { status: 400 }
    );
  }
}
