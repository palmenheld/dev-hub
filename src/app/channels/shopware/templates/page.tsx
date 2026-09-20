import AppShell from "@/components/layout/AppShell";
import ShopwareTemplateList from "@/components/shopware/ShopwareTemplateList";

export const dynamic = "force-dynamic";

export default function ShopwareTemplatesPage() {
  return <AppShell><ShopwareTemplateList /></AppShell>;
}
