import { NextResponse } from "next/server";
import { updateGross1Price } from "@/services/weclapp";

export async function PUT(
  request: Request,
  {
    params,
  }: {
    params: Promise<{ id: string }>;
  }
) {
  try {
    const { id } = await params;

    const body = await request.json();

    const price = Number(body.price);

    if (
      !Number.isFinite(price) ||
      price < 0
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "Ungültiger Preis.",
        },
        {
          status: 400,
        }
      );
    }

    await updateGross1Price(
      id,
      price
    );

    return NextResponse.json({
      success: true,
      price,
    });
  } catch (error) {
    console.error(
      "GROSS1 Preisänderung fehlgeschlagen:",
      error
    );

    return NextResponse.json(
      {
        success: false,

        error:
          error instanceof Error
            ? error.message
            : "Unbekannter Fehler",
      },
      {
        status: 500,
      }
    );
  }
}
