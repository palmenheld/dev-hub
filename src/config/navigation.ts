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
  { label: "Kanäle", href: "/channels" },
  { label: "Lager & Bestand", href: "/stock" },
  { label: "Bestellungen", href: "/orders" },
  { label: "Auswertungen", href: "/reports" },
  { label: "Einstellungen", href: "/settings" },
];
