'use client';

import { RecordRefresh } from "@/components/layout/RecordRefresh";
import { SessionProvider } from "next-auth/react";
import { Toaster } from "@/components/ui/Toaster";
import { DeviceKeyInitializer } from "@/components/evidence/DeviceKeyInitializer";
import { PwaProvider } from "@/context/PwaContext";
import { PwaManager } from "@/components/pwa/PwaManager";
import { GeoContextProvider } from "@/context/GeoContext";
import { SidebarProvider } from "@/context/SidebarContext";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider refetchInterval={60} refetchOnWindowFocus>
      <SidebarProvider>
        <PwaProvider>
          <GeoContextProvider>
            <Toaster />
            <DeviceKeyInitializer />
            <PwaManager />
            <RecordRefresh />
            {children}
          </GeoContextProvider>
        </PwaProvider>
      </SidebarProvider>
    </SessionProvider>
  );
}
