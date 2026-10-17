import { NextResponse } from "next/server";
import {
  createWeclappCustomer,
  searchWeclappCustomers,
} from "@/services/overwintering/customers";
import { assertSameOrigin } from "@/services/requestSecurity";
import type { WeclappCustomerCreateInput } from "@/types/overwintering";

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

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const input =
      (await request.json()) as Partial<WeclappCustomerCreateInput>;
    const customer = await createWeclappCustomer(input);
    return NextResponse.json({ customer }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Der Weclapp-Kunde konnte nicht angelegt werden.",
      },
      { status: 400 }
    );
  }
}
