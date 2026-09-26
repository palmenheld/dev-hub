import AppShell from "@/components/layout/AppShell";
import PosRegister from "@/components/pos/PosRegister";

export default function PosPage() {
  return (
    <AppShell>
      <div className="mx-auto max-w-[1500px]">
        <div className="mb-6">
          <div className="text-sm font-bold uppercase tracking-wider text-[var(--ph-gold)]">Verkauf</div>
          <h1 className="mt-1 text-3xl text-[var(--ph-green-dark)]">Kasse</h1>
          <p className="mt-2 max-w-3xl text-slate-600">Artikel direkt aus weclappPOS kassieren. Nach dem verbindlichen Abschluss erhält der Kunde den echten digitalen Beleg per QR-Code.</p>
        </div>
        <PosRegister />
      </div>
    </AppShell>
  );
}
