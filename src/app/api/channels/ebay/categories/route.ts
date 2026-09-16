import { NextResponse } from "next/server";
import { suggestEbayCategories } from "@/services/ebay/metadata";
import { getEbaySettings } from "@/services/ebay/store";

export async function GET(request: Request) {
  try {
    const query = new URL(request.url).searchParams.get("q") ?? "";
    const settings = await getEbaySettings();
    return NextResponse.json({
      categories: await suggestEbayCategories(query, settings.marketplaceId),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Kategorien konnten nicht geladen werden." },
      { status: 400 }
    );
  }
}
