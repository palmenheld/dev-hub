const articles = [
  {
    id: 1,
    name: "Trachycarpus fortunei",
    subtitle: "Hanfpalme - Lieferhoehe 100-120 cm",
    sku: "PH-10001",
    stock: 8,
    price: "59,99 EUR",
    shop: "online",
    ebay: "entwurf",
    kleinanzeigen: "online",
  },
  {
    id: 2,
    name: "Yucca rostrata",
    subtitle: "Blaue Palmlilie - Lieferhoehe 80-100 cm",
    sku: "PH-10002",
    stock: 2,
    price: "249,00 EUR",
    shop: "online",
    ebay: "online",
    kleinanzeigen: "fehlt",
  },
  {
    id: 3,
    name: "Citrus limon",
    subtitle: "Zitronenbaum - Lieferhoehe 80-100 cm",
    sku: "PH-10003",
    stock: 5,
    price: "44,99 EUR",
    shop: "entwurf",
    ebay: "fehlt",
    kleinanzeigen: "entwurf",
  },
];

type ChannelStatus = "online" | "entwurf" | "fehlt";

function ChannelBadge({
  label,
  status,
}: {
  label: string;
  status: ChannelStatus;
}) {
  const styles: Record<ChannelStatus, string> = {
    online: "bg-green-100 text-green-800",
    entwurf: "bg-amber-100 text-amber-800",
    fehlt: "bg-gray-100 text-gray-500",
  };

  const text: Record<ChannelStatus, string> = {
    online: "Online",
    entwurf: "Entwurf",
    fehlt: "Fehlt",
  };

  return (
    <span
      className={`rounded-full px-2.5 py-1 text-xs font-medium ${styles[status]}`}
    >
      {label}: {text[status]}
    </span>
  );
}

export default function Home() {
  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <header className="sticky top-0 z-20 border-b bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6">
          <div>
            <h1 className="text-xl font-bold text-green-800 sm:text-2xl">
              Palmenheld Hub
            </h1>
            <p className="text-xs text-slate-500">
              Zentrale Artikelpflege
            </p>
          </div>

          <div className="flex items-center gap-3">
            <span className="hidden rounded-full bg-green-50 px-3 py-1 text-sm text-green-800 sm:inline">
              Entwicklung
            </span>

            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-800 font-semibold text-white">
              TW
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-7xl">
        <aside className="hidden min-h-[calc(100vh-73px)] w-64 border-r bg-white p-4 lg:block">
          <nav className="space-y-2">
            <NavItem label="Dashboard" active />
            <NavItem label="Artikel" />
            <NavItem label="KI-Aufgaben" />
            <NavItem label="Medien" />
            <NavItem label="Preisregeln" />
            <NavItem label="Veroeffentlichungen" />
            <NavItem label="Einstellungen" />
          </nav>
        </aside>

        <main className="min-w-0 flex-1 p-4 sm:p-6">
          <section className="mb-6">
            <h2 className="text-2xl font-bold sm:text-3xl">
              Guten Tag, Thorsten
            </h2>
            <p className="mt-1 text-slate-500">
              Hier siehst du den aktuellen Stand deiner Artikel.
            </p>
          </section>

          <section className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Artikel" value="238" />
            <StatCard label="Text fehlt" value="14" />
            <StatCard label="Ohne Bilder" value="9" />
            <StatCard label="Zu veroeffentlichen" value="6" />
          </section>

          <section className="mb-6 flex flex-col gap-3 sm:flex-row">
            <input
              type="search"
              placeholder="Artikelnummer, Name oder botanischen Namen suchen"
              className="min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none focus:border-green-700"
            />

            <button className="rounded-xl bg-green-800 px-5 py-3 font-semibold text-white hover:bg-green-900">
              Neuer Artikel
            </button>
          </section>

          <section className="overflow-hidden rounded-2xl border bg-white shadow-sm">
            <div className="flex items-center justify-between border-b px-4 py-4 sm:px-6">
              <div>
                <h3 className="font-semibold">Zuletzt bearbeitet</h3>
                <p className="text-sm text-slate-500">
                  Artikel und Veroeffentlichungsstatus
                </p>
              </div>

              <button className="text-sm font-medium text-green-800">
                Alle Artikel
              </button>
            </div>

            <div className="divide-y">
              {articles.map((article) => (
                <article
                  key={article.id}
                  className="cursor-pointer p-4 transition hover:bg-slate-50 sm:p-6"
                >
                  <div className="flex gap-4">
                    <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-xl bg-green-50 text-3xl font-bold text-green-800">
                      PH
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-col justify-between gap-2 sm:flex-row">
                        <div>
                          <h4 className="truncate text-lg font-semibold">
                            {article.name}
                          </h4>
                          <p className="text-sm text-slate-500">
                            {article.subtitle}
                          </p>
                          <p className="mt-1 text-xs text-slate-400">
                            Artikelnummer: {article.sku}
                          </p>
                        </div>

                        <div className="sm:text-right">
                          <p className="text-lg font-bold text-green-800">
                            {article.price}
                          </p>
                          <p className="text-sm text-slate-500">
                            Bestand: {article.stock}
                          </p>
                        </div>
                      </div>

                      <div className="mt-4 flex flex-wrap gap-2">
                        <ChannelBadge
                          label="Shop"
                          status={article.shop as ChannelStatus}
                        />
                        <ChannelBadge
                          label="eBay"
                          status={article.ebay as ChannelStatus}
                        />
                        <ChannelBadge
                          label="Kleinanzeigen"
                          status={article.kleinanzeigen as ChannelStatus}
                        />
                      </div>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </main>
      </div>

      <nav className="fixed bottom-0 left-0 right-0 z-30 grid grid-cols-4 border-t bg-white px-2 py-2 lg:hidden">
        <MobileNavItem label="Start" active />
        <MobileNavItem label="Artikel" />
        <MobileNavItem label="KI" />
        <MobileNavItem label="Mehr" />
      </nav>

      <div className="h-20 lg:hidden" />
    </div>
  );
}

function NavItem({
  label,
  active = false,
}: {
  label: string;
  active?: boolean;
}) {
  return (
    <button
      className={`w-full rounded-xl px-4 py-3 text-left text-sm font-medium ${
        active
          ? "bg-green-800 text-white"
          : "text-slate-600 hover:bg-slate-100"
      }`}
    >
      {label}
    </button>
  );
}

function MobileNavItem({
  label,
  active = false,
}: {
  label: string;
  active?: boolean;
}) {
  return (
    <button
      className={`rounded-lg px-2 py-2 text-xs font-medium ${
        active ? "bg-green-50 text-green-800" : "text-slate-500"
      }`}
    >
      {label}
    </button>
  );
}

function StatCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border bg-white p-4 shadow-sm">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
    </div>
  );
}
