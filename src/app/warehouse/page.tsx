import AppShell from "@/components/layout/AppShell";
import WarehouseApp from "@/components/warehouse/WarehouseApp";

export const dynamic = "force-dynamic";

export default function WarehousePage() {
  return <AppShell><WarehouseApp/></AppShell>;
}
