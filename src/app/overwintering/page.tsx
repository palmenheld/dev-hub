import AppShell from "@/components/layout/AppShell";
import OverwinteringManager from "@/components/overwintering/OverwinteringManager";
import { listOverwinteringRecords } from "@/services/overwintering/store";

export const dynamic = "force-dynamic";

export default async function OverwinteringPage() {
  const records = await listOverwinteringRecords();
  return (
    <AppShell>
      <div className="mx-auto max-w-[1600px]">
        <div className="mb-6">
          <div className="text-sm font-bold uppercase tracking-wider text-[var(--ph-gold)]">Kundenservice</div>
          <h1 className="mt-1 text-3xl text-[var(--ph-green-dark)]">Überwinterung</h1>
          <p className="mt-2 max-w-4xl text-slate-600">
            Kunden direkt in Weclapp suchen und jede eingelagerte Pflanze mit Besonderheiten und Fotos dokumentieren.
          </p>
        </div>
        <OverwinteringManager initialRecords={records} />
      </div>
    </AppShell>
  );
}
