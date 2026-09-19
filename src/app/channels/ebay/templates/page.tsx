import AppShell from "@/components/layout/AppShell";
import EbayTemplateList from "@/components/ebay/EbayTemplateList";

export const dynamic = "force-dynamic";

export default function EbayTemplatesPage() {
  return (
    <AppShell>
      <EbayTemplateList />
    </AppShell>
  );
}
