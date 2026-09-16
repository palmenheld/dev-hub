import { NextResponse } from "next/server";
import { assertSameOrigin } from "@/services/requestSecurity";

export async function PUT(request: Request) {
  try {
    assertSameOrigin(request);
    return NextResponse.json(
      {
        success: false,
        error: "Direkte Preisänderungen sind deaktiviert. Bitte die kontrollierte Preisvorschau verwenden.",
      },
      { status: 410 }
    );
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Ungültige Anfrage" },
      { status: 403 }
    );
  }
}
