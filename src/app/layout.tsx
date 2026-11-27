import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";

const newsreader = localFont({
  src: [
    {
      path: "./fonts/newsreader-latin-opsz-normal.woff2",
      weight: "200 800",
      style: "normal",
    },
    {
      path: "./fonts/newsreader-latin-opsz-italic.woff2",
      weight: "200 800",
      style: "italic",
    },
  ],
  variable: "--font-display",
  display: "swap",
  fallback: ["Georgia", "Cambria", "Times New Roman", "serif"],
});

const dmSans = localFont({
  src: [
    {
      path: "./fonts/dm-sans-latin-wght-normal.woff2",
      weight: "100 1000",
      style: "normal",
    },
  ],
  variable: "--font-body",
  display: "swap",
  fallback: ["system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
});

const jetbrainsMono = localFont({
  src: [
    {
      path: "./fonts/jetbrains-mono-latin-wght-normal.woff2",
      weight: "100 800",
      style: "normal",
    },
  ],
  variable: "--font-mono",
  display: "swap",
  fallback: ["ui-monospace", "SFMono-Regular", "Menlo", "Monaco", "Consolas", "monospace"],
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
