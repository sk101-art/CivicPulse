import type { Metadata, Viewport } from "next";
import { Newsreader, DM_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const newsreader = Newsreader({
  variable: "--font-display",
  subsets: ["latin"],
  style: ["normal", "italic"],
  weight: ["400", "500", "600", "700"],
});

const dmSans = DM_Sans({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#F3F2EB",
};

export const metadata: Metadata = {
  title: "CivicPulse — Civic Atlas | Municipal Road Truth Ledger",
  description: "A clearer record of the city we share. Municipal infrastructure monitoring, cryptographic evidence and transparent civic accountability.",
  keywords: ["civic tech", "road safety", "potholes", "civic atlas", "road truth ledger", "citizen reporting"],
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
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
      className={`${newsreader.variable} ${dmSans.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-[#F3F2EB] text-[#293732] font-body selection:bg-[#D4E3DF] selection:text-[#293732]">
        <Providers>{children}</Providers>
        <Toaster position="bottom-right" richColors theme="light" />
      </body>
    </html>
  );
}
