import AppShell from "@/components/layout/AppShell";
import ShopwareModule from "@/components/shopware/ShopwareModule";
import { getShopwareConnection } from "@/services/shopware";

export const dynamic = "force-dynamic";

export default function ShopwarePage() {
  return (
    <AppShell>
      <ShopwareModule initialConnection={getShopwareConnection()} />
    </AppShell>
  );
}
