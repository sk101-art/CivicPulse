'use client'; // Error boundaries must be Client Components

import { useEffect } from 'react';
import { ErrorFallback } from '@/components/ui/ErrorFallback';

export default function ErrorPage({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return <ErrorFallback digest={error.digest} onRetry={() => unstable_retry()} />;
}
