import { NextResponse } from "next/server";
import { getArticle } from "@/services/weclapp";

export async function GET(
  request: Request,
  {
    params,
  }: {
    params: Promise<{ id: string }>;
  }
) {
  try {
    const { id } = await params;

    const article = await getArticle(id);

    return NextResponse.json({
      success: true,
      data: article,
    });
  } catch (error) {
    console.error("Weclapp Einzelartikel Fehler:", error);

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
