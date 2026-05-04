'use client';

import { SessionProvider } from "next-auth/react";
import { Toaster } from "@/components/ui/Toaster";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <Toaster />
      {children}
    </SessionProvider>
  );
}
