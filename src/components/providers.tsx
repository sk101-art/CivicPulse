'use client';

import { SessionProvider } from "next-auth/react";
import { Toaster } from "@/components/ui/Toaster";
import { DeviceKeyInitializer } from "@/components/evidence/DeviceKeyInitializer";
import { PwaManager } from "@/components/pwa/PwaManager";
import { GeoContextProvider } from "@/context/GeoContext";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <GeoContextProvider>
        <Toaster />
        <DeviceKeyInitializer />
        <PwaManager />
        {children}
      </GeoContextProvider>
    </SessionProvider>
  );
}
