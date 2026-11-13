import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'CivicPulse — Bengaluru Municipal Road Truth Ledger',
  description: 'Independent civic infrastructure truth ledger connecting Bengaluru residents and municipal authorities through cryptographically signed evidence, spatial PostGIS deduplication, and citizen fix verification.',
  keywords: [
    'CivicPulse',
    'Bengaluru',
    'road truth ledger',
    'civic accountability',
    'claim gap',
    'potholes',
    'BBMP',
    'GBA',
    'citizen verification',
  ],
};

export default function WelcomeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
