import type { Metadata } from "next";
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

export const metadata: Metadata = {
  title: "CivicPulse | Premium Civic Intelligence Platform",
  description: "Advanced civic engagement and city infrastructure monitoring. Empowering citizens and authorities with AI-driven urban intelligence.",
  keywords: ["civic tech", "city management", "citizen reporting", "urban intelligence"],
  authors: [{ name: "CivicPulse Team" }],
  viewport: "width=device-width, initial-scale=1, maximum-scale=1",
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

