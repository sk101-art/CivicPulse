'use client';

import { openDB, IDBPDatabase } from 'idb';

export const DB_NAME = 'civicpulse_keys';
export const STORE_NAME = 'device_keys';
export const PRIMARY_KEY_ID = 'primary';

export interface StoredDeviceKey {
  keyPair: CryptoKeyPair;
  publicJwk: JsonWebKey;
  createdAt: string;
}

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDb(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      },
    });
  }
  return dbPromise;
}

/**
 * Retrieves the stored ECDSA P-256 key pair or generates a new one on first use.
 * The private key is non-extractable (extractable: false).
 */
export async function getOrCreateDeviceKey(): Promise<{
  keyPair: CryptoKeyPair;
  publicJwk: JsonWebKey;
}> {
  if (typeof window === 'undefined' || !window.crypto?.subtle) {
    throw new Error('Web Crypto SubtleCrypto is only available in a secure browser context');
  }

  const db = await getDb();
  const stored = (await db.get(STORE_NAME, PRIMARY_KEY_ID)) as StoredDeviceKey | undefined;

  if (stored && stored.keyPair?.privateKey && stored.publicJwk) {
    return {
      keyPair: stored.keyPair,
      publicJwk: stored.publicJwk,
    };
  }

  // Generate ECDSA P-256 key pair: private key cannot be extracted
  const keyPair = await window.crypto.subtle.generateKey(
    {
      name: 'ECDSA',
      namedCurve: 'P-256',
    },
    false, // extractable: false for private key per T20 specification
    ['sign', 'verify']
  );

  const publicJwk = await window.crypto.subtle.exportKey('jwk', keyPair.publicKey);

  const entry: StoredDeviceKey = {
    keyPair,
    publicJwk,
    createdAt: new Date().toISOString(),
  };

  await db.put(STORE_NAME, entry, PRIMARY_KEY_ID);

  return {
    keyPair,
    publicJwk,
  };
}

/**
 * Registers an exported public JWK with the server.
 */
export async function registerDeviceKeyWithServer(publicJwk: JsonWebKey): Promise<{
  deviceKey: { id: string; userId: string; createdAt: string };
  reused: boolean;
}> {
  const res = await fetch('/api/evidence/device', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ publicJwk }),
  });

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    throw new Error(
      `Failed to register device key: ${res.status} ${errorBody.error?.message || res.statusText}`
    );
  }

  return res.json();
}

/**
 * Initialises device key on client side and registers it with the server if authenticated.
 */
export async function initDeviceKey(): Promise<{
  keyPair: CryptoKeyPair;
  publicJwk: JsonWebKey;
  registeredId?: string;
}> {
  const { keyPair, publicJwk } = await getOrCreateDeviceKey();
  try {
    const result = await registerDeviceKeyWithServer(publicJwk);
    return {
      keyPair,
      publicJwk,
      registeredId: result.deviceKey.id,
    };
  } catch {
    // If not authenticated or offline, the local key pair remains ready for use
    return {
      keyPair,
      publicJwk,
    };
  }
}
