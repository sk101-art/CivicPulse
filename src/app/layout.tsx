import type { Metadata, Viewport } from "next";
import { Unbounded, IBM_Plex_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const unbounded = Unbounded({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["400", "700", "900"],
});

const ibmPlexSans = IBM_Plex_Sans({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0D1117",
};

export const metadata: Metadata = {
  title: "CivicPulse | Road Truth Ledger & Civic Infrastructure",
  description: "Bengaluru road truth ledger and civic infrastructure monitoring. Empowering citizens and municipal authorities with cryptographic evidence and transparent accountability.",
  keywords: ["civic tech", "road safety", "potholes", "bengaluru", "citizen reporting", "road truth ledger"],
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "CivicPulse",
  },
  icons: {
    icon: "/icons/icon-192x192.png",
    apple: "/icons/apple-touch-icon.png",
  },
};

import { Providers } from "@/components/providers";
import { Toaster } from "sonner";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${unbounded.variable} ${ibmPlexSans.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <Providers>{children}</Providers>
        <Toaster position="bottom-right" richColors theme="dark" />
      </body>
    </html>
  );
}

