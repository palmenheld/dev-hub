# Palmenheld Hub

> Projekt-Hinweis: Diese Anwendung benötigt Node.js 22 und läuft auf dem Linux-Server im separaten Container `palmenheld-dev-hub`. Der Container-Port `3000` ist auf dem Server ausschließlich als `127.0.0.1:3001` erreichbar. Über den vorhandenen Tunnel lautet die Entwicklungsadresse `http://localhost:3001`.

## Palmenheld-Konfiguration

Zugangsdaten werden ausschließlich serverseitig in `.env.local` hinterlegt; `.env.example` dient als Vorlage. Geheimnisse niemals in Git einchecken und niemals mit `NEXT_PUBLIC_` benennen.

Im Container werden die Prüfungen so ausgeführt:

```bash
npm run lint
npm run typecheck
npm run build
```

Der lokale Host besitzt nur Node.js 18; der vollständige Build gehört deshalb in den Node-22-Container.

## Weiterentwicklung von mehreren Arbeitsplätzen

Der vollständige Ablauf für das erstmalige Klonen, den Node-22-Dev-Container,
lokale Zugangsdaten und den sicheren Git-Abgleich steht in [Remote-Entwicklung](docs/remote-development.md).

## Projektdokumentation

- [Remote-Entwicklung und zweiter Arbeitsplatz](docs/remote-development.md)
- [Shopware- und weclapp-Integration](docs/shopware-weclapp-integration.md)
- [eBay-Modul und Inbetriebnahme](docs/ebay-integration.md)

---

This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
