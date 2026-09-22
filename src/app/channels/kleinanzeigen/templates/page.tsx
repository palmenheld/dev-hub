import AppShell from "@/components/layout/AppShell";
import KleinanzeigenTemplates from "@/components/kleinanzeigen/KleinanzeigenTemplates";
import { listKleinanzeigenTemplates } from "@/services/kleinanzeigen";

export const dynamic = "force-dynamic";

export default async function KleinanzeigenTemplatesPage() {
  return <AppShell><KleinanzeigenTemplates initialTemplates={await listKleinanzeigenTemplates()}/></AppShell>;
}
