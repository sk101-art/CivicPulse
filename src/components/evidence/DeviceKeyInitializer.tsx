'use client';

import { useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { initDeviceKey } from '@/lib/evidence/deviceKey';

export function DeviceKeyInitializer() {
  const { data: session } = useSession();

  useEffect(() => {
    if (session?.user?.id) {
      initDeviceKey().catch((err) => {
        console.warn('Device key background initialisation failed:', err);
      });
    }
  }, [session?.user?.id]);

  return null;
}
