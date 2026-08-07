import { NextResponse } from "next/server";
import { getArticles } from "@/services/weclapp";

export async function GET() {
  try {
    const data = await getArticles({
      page: 1,
      pageSize: 20,
    });

    return NextResponse.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error("Weclapp Artikel Fehler:", error);

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
