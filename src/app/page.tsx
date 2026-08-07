import AppShell from "@/components/layout/AppShell";

export default function Home() {
  return (
    <AppShell>
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-3xl text-[var(--ph-green-dark)]">
              Guten Morgen, Thorsten!
            </h2>

            <p className="mt-1 text-slate-500">
              Hier ist deine aktuelle Übersicht.
            </p>
          </div>

          <button className="rounded-xl bg-[var(--ph-green-dark)] px-5 py-3 font-semibold text-white transition hover:bg-[var(--ph-green)]">
            + Neuer Artikel
          </button>
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard value="238" label="Gesamt Artikel" />
          <StatCard value="12" label="Ohne Bilder" accent />
          <StatCard value="4" label="Ohne Shoptext" accent />
          <StatCard value="7" label="Warten auf Veröffentlichung" />
        </div>
      </div>
    </AppShell>
  );
}

function StatCard({
  value,
  label,
  accent = false,
}: {
  value: string;
  label: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-[var(--ph-border)] bg-white p-5 shadow-sm">
      <div
        className={`text-3xl font-bold ${
          accent
            ? "text-[var(--ph-gold)]"
            : "text-[var(--ph-green-dark)]"
        }`}
      >
        {value}
      </div>

      <div className="mt-1 text-sm text-slate-600">
        {label}
      </div>
    </div>
  );
}
