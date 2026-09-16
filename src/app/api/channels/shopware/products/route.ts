import { NextRequest, NextResponse } from "next/server";
import { getShopwareProducts } from "@/services/shopware";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const page = Number(request.nextUrl.searchParams.get("page") ?? 1);
  const limit = Number(request.nextUrl.searchParams.get("limit") ?? 50);
  const query = request.nextUrl.searchParams.get("query") ?? "";

  try {
    const result = await getShopwareProducts({ page, limit, query });
    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Shopware-Produkte konnten nicht geladen werden.";

    console.error("Shopware-Produkte konnten nicht geladen werden:", message);

    return NextResponse.json({ error: message }, { status: 502 });
  }
}
