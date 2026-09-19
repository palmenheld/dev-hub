import AppShell from "@/components/layout/AppShell";
import OfferManagement from "@/components/offers/OfferManagement";

export const dynamic = "force-dynamic";

export default function OffersPage() {
  return (
    <AppShell>
      <OfferManagement />
    </AppShell>
  );
}
