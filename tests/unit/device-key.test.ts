import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { POST, GET } from "@/app/api/evidence/device/route";
import { prisma } from "@/lib/db/prisma";
import { getServerSession } from "next-auth/next";

vi.mock("next-auth/next", () => ({
  getServerSession: vi.fn(),
}));

describe("T20 Acceptance: Device signing keys", () => {
  const testUserId = "test-user-t20-device-key";
  const createdKeyIds: string[] = [];

  const validJwk = {
    kty: "EC",
    crv: "P-256",
    x: "WkN-98fBcyP9_Y6w9y_tVvUaY-773s3n3_k4j3j4k5l",
    y: "O9k11-98fBcyP9_Y6w9y_tVvUaY-773s3n3_k4j3j4k",
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterAll(async () => {
    if (createdKeyIds.length > 0) {
      await prisma.deviceKey.deleteMany({
        where: { id: { in: createdKeyIds } },
      });
    }
  });

  it("POST /api/evidence/device returns 401 when unauthenticated", async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(null);

    const req = new Request("http://localhost:3000/api/evidence/device", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ publicJwk: validJwk }),
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  it("POST /api/evidence/device returns 400 when JWK is missing required fields", async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce({
      user: { id: testUserId, role: "CITIZEN", email: "citizen@test.local" },
      expires: "1",
    });

    const req = new Request("http://localhost:3000/api/evidence/device", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        publicJwk: {
          kty: "RSA", // invalid curve / type
          crv: "P-256",
        },
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("POST /api/evidence/device registers a valid ECDSA P-256 public JWK", async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce({
      user: { id: testUserId, role: "CITIZEN", email: "citizen@test.local" },
      expires: "1",
    });

    const req = new Request("http://localhost:3000/api/evidence/device", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ publicJwk: validJwk }),
    });

    const res = await POST(req);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.reused).toBe(false);
    expect(body.deviceKey.id).toBeDefined();
    expect(body.deviceKey.userId).toBe(testUserId);
    createdKeyIds.push(body.deviceKey.id);
  });

  it("POST /api/evidence/device reuses existing key when identical JWK is re-submitted", async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce({
      user: { id: testUserId, role: "CITIZEN", email: "citizen@test.local" },
      expires: "1",
    });

    const req = new Request("http://localhost:3000/api/evidence/device", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ publicJwk: validJwk }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.reused).toBe(true);
    expect(body.deviceKey.id).toBe(createdKeyIds[0]);
  });

  it("GET /api/evidence/device returns registered keys for the user", async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce({
      user: { id: testUserId, role: "CITIZEN", email: "citizen@test.local" },
      expires: "1",
    });

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.keys)).toBe(true);
    const found = body.keys.find((k: { id: string }) => k.id === createdKeyIds[0]);
    expect(found).toBeDefined();
  });

  it("Web Crypto generates ECDSA P-256 key pair with extractable: false for private key", async () => {
    const keyPair = await crypto.subtle.generateKey(
      {
        name: "ECDSA",
        namedCurve: "P-256",
      },
      false,
      ["sign", "verify"]
    );

    expect(keyPair.privateKey.extractable).toBe(false);
    expect(keyPair.privateKey.type).toBe("private");
    expect(keyPair.publicKey.type).toBe("public");

    const exportedJwk = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
    expect(exportedJwk.kty).toBe("EC");
    expect(exportedJwk.crv).toBe("P-256");
    expect(typeof exportedJwk.x).toBe("string");
    expect(typeof exportedJwk.y).toBe("string");
  });
});
