import AppShell from "@/components/layout/AppShell";
import EbayModule from "@/components/ebay/EbayModule";
import { getEbayConnection } from "@/services/ebay/config";
import { getEbaySettings } from "@/services/ebay/store";

export const dynamic = "force-dynamic";

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function EbayPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const parameters = await searchParams;
  const settings = await getEbaySettings();
  const connected = first(parameters.ebayConnected);
  const error = first(parameters.ebayError);
  const initialFeedback = connected === "1"
    ? {
        kind: "success" as const,
        message:
          "Das eBay-Verkäuferkonto wurde freigegeben. Bitte jetzt die Verbindung testen.",
      }
    : error
      ? { kind: "error" as const, message: error.slice(0, 300) }
      : null;
  return (
    <AppShell>
      <EbayModule
        initialConnection={getEbayConnection(settings)}
        initialSettings={settings}
        initialFeedback={initialFeedback}
      />
    </AppShell>
  );
}
