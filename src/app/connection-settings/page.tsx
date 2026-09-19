import Link from "next/link";
import AppShell from "@/components/layout/AppShell";
import EbayModule from "@/components/ebay/EbayModule";
import ShopwareModule from "@/components/shopware/ShopwareModule";
import { getEbayConnection } from "@/services/ebay/config";
import { getEbaySettings } from "@/services/ebay/store";
import { getKleinanzeigenConnection } from "@/services/kleinanzeigen";
import { getShopwareConnection } from "@/services/shopware";

export const dynamic = "force-dynamic";

type Tab = "shopware" | "ebay" | "kleinanzeigen";

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function KleinanzeigenSettings() {
  const connection = getKleinanzeigenConnection();
  return (
    <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
            <h2 className="text-lg font-bold">{connection.label}</h2>
            <span className="rounded-full border bg-white px-2.5 py-1 text-xs font-semibold">
              Modus: {connection.mode}
            </span>
          </div>
          <p className="mt-2 max-w-3xl text-sm text-slate-600">
            {connection.description}
          </p>
        </div>
        <a
          href="https://themen.kleinanzeigen.de/pro-infopoint/"
          target="_blank"
          rel="noreferrer"
          className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-center text-sm font-semibold text-[var(--ph-green-dark)]"
        >
          PRO-Zugang prüfen ↗
        </a>
      </div>
      <div className="mt-4 rounded-xl border border-amber-200 bg-white/70 p-4 text-sm text-amber-950">
        Die produktive Verbindung bleibt gesperrt, bis Kleinanzeigen einen
        freigegebenen Partnerzugang und die technische Dokumentation bereitstellt.
        Lokale Entwürfe können in der Angebotsverwaltung weiterhin vorbereitet werden.
      </div>
    </section>
  );
}

export default async function ConnectionSettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const parameters = await searchParams;
  const requestedTab = first(parameters.tab);
  const tab: Tab = ["shopware", "ebay", "kleinanzeigen"].includes(
    requestedTab || ""
  )
    ? (requestedTab as Tab)
    : "shopware";
  const settings = await getEbaySettings();
  const connected = first(parameters.ebayConnected);
  const ebayError = first(parameters.ebayError);
  const ebayFeedback = connected === "1"
    ? {
        kind: "success" as const,
        message:
          "Das eBay-Verkäuferkonto wurde freigegeben. Bitte jetzt die Verbindung testen.",
      }
    : ebayError
      ? { kind: "error" as const, message: ebayError.slice(0, 300) }
      : null;

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: "shopware", label: "Shopware" },
    { id: "ebay", label: "eBay" },
    { id: "kleinanzeigen", label: "Kleinanzeigen" },
  ];

  return (
    <AppShell>
      <div className="mx-auto max-w-[1600px]">
        <header className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-[var(--ph-gold)]">
              System
            </p>
            <h1 className="mt-1 text-3xl text-[var(--ph-green-dark)]">
              Verbindungseinstellungen
            </h1>
            <p className="mt-2 max-w-4xl text-slate-500">
              Zugang, Verbindungstest und einmalige Zieleinstellungen der
              Verkaufskanäle zentral verwalten.
            </p>
          </div>
          <Link
            href="/offers"
            className="rounded-xl border border-[var(--ph-green-dark)] bg-white px-4 py-2.5 text-center font-semibold text-[var(--ph-green-dark)]"
          >
            Zur Angebotsverwaltung
          </Link>
        </header>

        <nav className="mt-6 flex flex-wrap gap-2 rounded-2xl border bg-white p-2 shadow-sm">
          {tabs.map((item) => (
            <Link
              key={item.id}
              href={`/connection-settings?tab=${item.id}`}
              className={`rounded-xl px-5 py-3 text-sm font-bold ${
                tab === item.id
                  ? "bg-[var(--ph-green-dark)] text-white"
                  : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="mt-5">
          {tab === "shopware" && (
            <ShopwareModule
              initialConnection={getShopwareConnection()}
              settingsOnly
            />
          )}
          {tab === "ebay" && (
            <EbayModule
              initialConnection={getEbayConnection(settings)}
              initialSettings={settings}
              initialFeedback={ebayFeedback}
              settingsOnly
            />
          )}
          {tab === "kleinanzeigen" && <KleinanzeigenSettings />}
        </div>
      </div>
    </AppShell>
  );
}
