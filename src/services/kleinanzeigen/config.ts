import { KleinanzeigenConnection } from "@/types/kleinanzeigen";

export function getKleinanzeigenConnection(): KleinanzeigenConnection {
  const mode = process.env.KLEINANZEIGEN_MODE?.trim().toLowerCase();

  if (mode === "mock") {
    return {
      mode: "mock",
      state: "test",
      canPublish: true,
      label: "Testmodus aktiv",
      description:
        "Veröffentlichungen und Pausen werden lokal simuliert und nicht an Kleinanzeigen übertragen.",
    };
  }

  if (mode === "partner-api") {
    return {
      mode: "partner-api",
      state: "adapter_required",
      canPublish: false,
      label: "Partnerzugang noch nicht eingebunden",
      description:
        "Die Zugangsdaten und die freigegebene technische Spezifikation von Kleinanzeigen werden für den produktiven Adapter benötigt.",
    };
  }

  return {
    mode: "disabled",
    state: "on_hold",
    canPublish: false,
    label: "On Hold – Anfrage läuft",
    description:
      "Die Weiterentwicklung ist pausiert, bis eine Rückmeldung zur freigegebenen Kleinanzeigen-Anbindung vorliegt.",
  };
}
