'use client'; // Error boundaries must be Client Components

import { ErrorFallback } from '@/components/ui/ErrorFallback';
import './globals.css';

/** Replaces the root layout when it fails, so it brings its own <html lang> and <title>. */
export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <html lang="en">
      <head>
        <title>Something went wrong | CivicPulse</title>
      </head>
      <body>
        <ErrorFallback digest={error.digest} onRetry={() => unstable_retry()} />
      </body>
    </html>
  );
}
