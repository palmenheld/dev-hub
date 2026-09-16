import { NextResponse } from "next/server";
import {
  getEbayCategoryAspects,
  getEbayCategoryConditions,
} from "@/services/ebay/metadata";
import { getEbaySettings } from "@/services/ebay/store";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const settings = await getEbaySettings();
    const [aspects, conditions] = await Promise.all([
      getEbayCategoryAspects(id, settings.marketplaceId),
      getEbayCategoryConditions(id, settings.marketplaceId),
    ]);
    return NextResponse.json({
      aspects,
      conditions,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Merkmale konnten nicht geladen werden." },
      { status: 400 }
    );
  }
}
