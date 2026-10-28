'use client';

import { SessionProvider } from "next-auth/react";
import { Toaster } from "@/components/ui/Toaster";
import { DeviceKeyInitializer } from "@/components/evidence/DeviceKeyInitializer";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <Toaster />
      <DeviceKeyInitializer />
      {children}
    </SessionProvider>
  );
}
