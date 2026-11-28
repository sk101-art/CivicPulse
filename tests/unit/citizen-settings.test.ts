import { describe, it, expect, vi, afterEach } from 'vitest';
import { hasStoredDeviceKey, DB_NAME, STORE_NAME, PRIMARY_KEY_ID } from '@/lib/evidence/deviceKey';

describe('Page 8: Citizen Settings — Read-Only Device Key Inspection', () => {
  const originalWindow = globalThis.window;
  const originalIndexedDB = globalThis.indexedDB;

  afterEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(globalThis, 'window', {
      value: originalWindow,
      configurable: true,
      writable: true,
    });
    Object.defineProperty(globalThis, 'indexedDB', {
      value: originalIndexedDB,
      configurable: true,
      writable: true,
    });
  });

  it('returns UNAVAILABLE when window, crypto.subtle, or indexedDB is missing', async () => {
    Object.defineProperty(globalThis, 'window', {
      value: undefined,
      configurable: true,
      writable: true,
    });
    expect(await hasStoredDeviceKey()).toBe('UNAVAILABLE');

    Object.defineProperty(globalThis, 'window', {
      value: { crypto: {} },
      configurable: true,
      writable: true,
    });
    Object.defineProperty(globalThis, 'indexedDB', {
      value: undefined,
      configurable: true,
      writable: true,
    });
    expect(await hasStoredDeviceKey()).toBe('UNAVAILABLE');
  });

  it('returns NOT_INITIALIZED when civicpulse_keys DB does not exist and never calls indexedDB.open or generateKey', async () => {
    const generateKey = vi.fn();
    const open = vi.fn();
    const databases = vi.fn().mockResolvedValue([{ name: 'CivicPulseDB', version: 1 }]);

    Object.defineProperty(globalThis, 'window', {
      value: { crypto: { subtle: { generateKey } } },
      configurable: true,
      writable: true,
    });
    Object.defineProperty(globalThis, 'indexedDB', {
      value: { databases, open },
      configurable: true,
      writable: true,
    });

    const status = await hasStoredDeviceKey();
    expect(status).toBe('NOT_INITIALIZED');
    expect(databases).toHaveBeenCalledTimes(1);
    expect(open).not.toHaveBeenCalled();
    expect(generateKey).not.toHaveBeenCalled();
  });

  it('returns ACTIVE when civicpulse_keys DB contains a stored keypair using a readonly transaction', async () => {
    const fakeTx = {
      objectStore: vi.fn().mockReturnValue({
        get: vi.fn((key: string) => {
          const req: any = {};
          queueMicrotask(() => {
            req.result =
              key === PRIMARY_KEY_ID
                ? { keyPair: { privateKey: {}, publicKey: {} }, publicJwk: { kty: 'EC' } }
                : undefined;
            req.onsuccess?.();
          });
          return req;
        }),
      }),
      onabort: null,
    };
    const fakeDb = {
      objectStoreNames: { contains: (name: string) => name === STORE_NAME },
      transaction: vi.fn().mockReturnValue(fakeTx),
      close: vi.fn(),
    };
    const open = vi.fn(() => {
      const req: any = { result: fakeDb };
      queueMicrotask(() => req.onsuccess?.());
      return req;
    });
    const databases = vi.fn().mockResolvedValue([{ name: DB_NAME, version: 1 }]);

    Object.defineProperty(globalThis, 'window', {
      value: { crypto: { subtle: { generateKey: vi.fn() } } },
      configurable: true,
      writable: true,
    });
    Object.defineProperty(globalThis, 'indexedDB', {
      value: { databases, open },
      configurable: true,
      writable: true,
    });

    const status = await hasStoredDeviceKey();
    expect(status).toBe('ACTIVE');
    expect(fakeDb.transaction).toHaveBeenCalledWith(STORE_NAME, 'readonly');
    expect(fakeDb.close).toHaveBeenCalledTimes(1);
  });

  it('returns UNAVAILABLE when indexedDB.databases is not supported so no DB is silently created', async () => {
    const open = vi.fn();
    Object.defineProperty(globalThis, 'window', {
      value: { crypto: { subtle: {} } },
      configurable: true,
      writable: true,
    });
    Object.defineProperty(globalThis, 'indexedDB', {
      value: { open },
      configurable: true,
      writable: true,
    });

    expect(await hasStoredDeviceKey()).toBe('UNAVAILABLE');
    expect(open).not.toHaveBeenCalled();
  });
});
