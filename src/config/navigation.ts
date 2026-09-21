export type NavItem = {
  label: string;
  href: string;
};

export const navigation: NavItem[] = [
  { label: "Dashboard", href: "/" },
  { label: "Artikel", href: "/articles" },
  { label: "Aufgaben", href: "/tasks" },
  { label: "KI-Assistent", href: "/ai" },
  { label: "Medien", href: "/media" },
  { label: "Blog-Manager", href: "/blog" },
  { label: "Angebotsverwaltung", href: "/offers" },
  { label: "Verbindungseinstellungen", href: "/connection-settings" },
  { label: "Shopware Templates", href: "/channels/shopware/templates" },
  { label: "eBay Templates", href: "/channels/ebay/templates" },
  { label: "Lager & Bestand", href: "/stock" },
  { label: "Bestellungen", href: "/orders" },
  { label: "Auswertungen", href: "/reports" },
  { label: "Einstellungen", href: "/settings" },
];
