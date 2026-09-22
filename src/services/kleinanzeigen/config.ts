import { KleinanzeigenConnection } from "@/types/kleinanzeigen";

export function getKleinanzeigenConnection(): KleinanzeigenConnection {
  const mode = process.env.KLEINANZEIGEN_MODE?.trim().toLowerCase();

  if (mode === "mock") {
    return {
      mode: "mock",
      state: "test",
      canExport: true,
      canPublish: true,
      label: "Testmodus aktiv",
      description:
        "Veröffentlichungen und Pausen werden lokal simuliert und nicht an Kleinanzeigen übertragen.",
    };
  }

  if (mode === "direct") {
    return {
      mode: "direct",
      state: "credentials_required",
      canExport: true,
      canPublish: false,
      label: "AnzeigenChef-Direktzugang noch nicht hinterlegt",
      description:
        "Die Entwürfe und AnzeigenChef-Exporte funktionieren bereits. Eine direkte Übertragung wird erst nach Vorlage eines freigegebenen AnzeigenChef-Zugangs aktiviert.",
      account: process.env.ANZEIGENCHEF_ACCOUNT?.trim(),
      folder: process.env.ANZEIGENCHEF_FOLDER?.trim(),
    };
  }

  return {
    mode: "anzeigenchef-csv",
    state: "export_ready",
    canExport: true,
    canPublish: false,
    label: "AnzeigenChef-Übergabe vorbereitet",
    description:
      "Freigegebene Anzeigen können als AnzeigenChef-kompatible CSV exportiert und dort importiert werden. Zugangsdaten für eine spätere Direktanbindung können nachgereicht werden.",
    account: process.env.ANZEIGENCHEF_ACCOUNT?.trim(),
    folder: process.env.ANZEIGENCHEF_FOLDER?.trim(),
  };
}
