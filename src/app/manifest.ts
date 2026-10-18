import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Palmenheld Hub",
    short_name: "Palmenheld",
    description:
      "Zentrale Artikel-, Lager-, Überwinterungs- und Verkaufskanalverwaltung von Palmenheld.",
    start_url: "/",
    display: "standalone",
    background_color: "#f6f8f6",
    theme_color: "#0f4f24",
    orientation: "any",
    lang: "de-DE",
    categories: ["business", "productivity"],
    icons: [
      {
        src: "/icons/palmenheld-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/palmenheld-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/palmenheld-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      {
        name: "Angebotsverwaltung",
        short_name: "Angebote",
        description: "Artikel für die Verkaufskanäle verwalten",
        url: "/offers",
      },
      {
        name: "Artikel erfassen",
        short_name: "Neuer Artikel",
        description: "Einen neuen Artikel mit Fotos erfassen",
        url: "/articles/new",
      },
      {
        name: "Überwinterung",
        short_name: "Überwinterung",
        description: "Kundenpflanzen für die Überwinterung dokumentieren",
        url: "/overwintering",
      },
      {
        name: "Kasse",
        short_name: "Kasse",
        description: "Palmenheld POS öffnen",
        url: "/pos",
      },
    ],
  };
}
