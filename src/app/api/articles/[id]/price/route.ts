import { NextResponse } from "next/server";

export async function PUT() {
  return NextResponse.json(
    {
      success: false,
      error:
        "Preisänderungen sind vorübergehend deaktiviert, bis die Gross1-Preisstruktur vollständig verifiziert ist.",
    },
    {
      status: 501,
    }
  );
}
