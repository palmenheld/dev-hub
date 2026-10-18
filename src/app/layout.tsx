import type { Metadata, Viewport } from "next";
import { Montserrat } from "next/font/google";
import PwaProvider from "@/components/pwa/PwaProvider";
import "./globals.css";

const montserrat = Montserrat({
  subsets: ["latin"],
  weight: ["700"],
  variable: "--font-montserrat",
});

export const metadata: Metadata = {
  title: "Palmenheld Hub",
  description: "Zentrale Artikel- und Verkaufskanalverwaltung",
  applicationName: "Palmenheld Hub",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Palmenheld Hub",
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "128x128" },
      { url: "/icons/palmenheld-192.png", type: "image/png" },
    ],
    apple: [
      {
        url: "/icons/palmenheld-apple-180.png",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  },
};

export const viewport: Viewport = {
  themeColor: "#0f4f24",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="de">
      <body className={montserrat.variable}>
        <PwaProvider>{children}</PwaProvider>
      </body>
    </html>
  );
}
