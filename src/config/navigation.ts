export type NavLink = {
  label: string;
  href: string;
};

export type NavGroup = {
  label: string;
  children: NavLink[];
};

export type NavItem = NavLink | NavGroup;

export const navigation: NavItem[] = [
  { label: "Dashboard", href: "/" },
  { label: "Artikel", href: "/articles" },
  { label: "Aufgaben", href: "/tasks" },
  { label: "Blog-Manager", href: "/blog" },
  { label: "Angebotsverwaltung", href: "/offers" },
  { label: "Verbindungseinstellungen", href: "/connection-settings" },
  {
    label: "Templates",
    children: [
      { label: "Shopware", href: "/channels/shopware/templates" },
      { label: "eBay", href: "/channels/ebay/templates" },
      { label: "Kleinanzeigen", href: "/channels/kleinanzeigen/templates" },
    ],
  },
  { label: "Lager-App", href: "/warehouse" },
  { label: "Bestellungen", href: "/orders" },
  { label: "Auswertungen", href: "/reports" },
  { label: "Einstellungen", href: "/settings" },
];
