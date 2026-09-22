import { NextResponse } from "next/server";
import { loadWarehouseArticles, warehouseNames } from "@/services/warehouse/catalog";
import { warehouseLiveWritesEnabled } from "@/services/warehouse/movements";
import { getWarehouseState } from "@/services/warehouse/state";

export const maxDuration = 300;

export async function GET(request: Request) {
  try {
    const force = new URL(request.url).searchParams.get("refresh") === "1";
    const [articles, state] = await Promise.all([loadWarehouseArticles(force), getWarehouseState()]);
    return NextResponse.json({
      articles,
      state,
      warehouses: warehouseNames(articles),
      config: {
        liveWritesEnabled: warehouseLiveWritesEnabled(),
        resetPinConfigured: /^\d{6}$/u.test(process.env.WAREHOUSE_RESET_PIN?.trim() || ""),
        source: "weclapp",
      },
    });
  } catch (error) {
    console.error("Lager-App konnte nicht geladen werden:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Lagerdaten konnten nicht geladen werden." }, { status: 500 });
  }
}
