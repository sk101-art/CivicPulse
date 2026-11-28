'use client';

import dynamic from 'next/dynamic';
import { Loader2 } from 'lucide-react';

const IssuesNearMeMap = dynamic(
  () => import('./IssuesNearMeMap').then((mod) => mod.IssuesNearMeMap),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-full flex flex-col items-center justify-center bg-[#F3F2EB] text-xs font-mono text-[#65736B] gap-2">
        <Loader2 className="w-6 h-6 animate-spin text-[#527B7A]" />
        <span>Loading Map View...</span>
      </div>
    ),
  }
);

export function CitizenMapLoader() {
  return <IssuesNearMeMap />;
}
