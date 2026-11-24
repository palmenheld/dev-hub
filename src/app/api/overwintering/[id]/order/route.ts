import { NextResponse } from "next/server";
import { assertSameOrigin } from "@/services/requestSecurity";
import {
  attachExistingOverwinteringOrder,
  createOverwinteringSalesOrder,
  listOverwinteringCustomerOrders,
  refreshOverwinteringInvoiceStatus,
} from "@/services/overwintering/orders";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Context) {
  try {
    const orders = await listOverwinteringCustomerOrders((await params).id);
    return NextResponse.json({ orders });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Die Aufträge des Kunden konnten nicht geladen werden.",
      },
      { status: 400 }
    );
  }
}

export async function POST(request: Request, { params }: Context) {
  try {
    assertSameOrigin(request);
    const body = (await request.json()) as { prices?: unknown };
    const record = await createOverwinteringSalesOrder(
      (await params).id,
      body.prices
    );
    return NextResponse.json({ record }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Der weclapp-Auftrag konnte nicht angelegt werden.",
      },
      { status: 400 }
    );
  }
}

export async function PUT(request: Request, { params }: Context) {
  try {
    assertSameOrigin(request);
    const record = await refreshOverwinteringInvoiceStatus((await params).id);
    return NextResponse.json({ record });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Der Rechnungsstatus konnte nicht aktualisiert werden.",
      },
      { status: 400 }
    );
  }
}

export async function PATCH(request: Request, { params }: Context) {
  try {
    assertSameOrigin(request);
    const body = (await request.json()) as { orderId?: unknown };
    const record = await attachExistingOverwinteringOrder(
      (await params).id,
      typeof body.orderId === "string" ? body.orderId : ""
    );
    return NextResponse.json({ record });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Der weclapp-Auftrag konnte nicht verknüpft werden.",
      },
      { status: 400 }
    );
  }
}
