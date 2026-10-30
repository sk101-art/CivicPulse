import { describe, it, expect, vi } from "vitest";
import { POST } from "@/app/api/reports/route";
import { getServerSession } from "next-auth/next";
import { Category, Role } from "@prisma/client";
import { EvidencePayload, signEvidencePayload } from "@/lib/evidence/sign";

vi.mock("next-auth/next", () => ({
  getServerSession: vi.fn(),
}));

describe("Production Evidence Photo Guard", () => {
  it("rejects report submission if photo buffer is empty", async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce({
      user: { id: "test-user-guard", role: Role.CITIZEN, email: "guard@civicpulse.local" },
      expires: "1",
    });

    const keyPair = await crypto.subtle.generateKey(
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["sign", "verify"]
    );

    const payload: EvidencePayload = {
      accuracy: 10,
      capturedAt: new Date().toISOString(),
      lat: 12.9716,
      lng: 77.5946,
      nonce: "guard-test-nonce",
      photoHash: "invalid-hash",
      role: "REPORT",
    };

    const signature = await signEvidencePayload(payload, keyPair.privateKey);

    // Empty photo payload (e.g. 0-length base64 string or whitespace)
    const req = new Request("http://localhost:3000/api/reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        category: Category.POTHOLES,
        payload,
        signature,
        photoBase64: "", // empty
        mimeType: "image/jpeg",
        note: "Attempted report without photo",
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  it("rejects direct report submissions without a valid photo url", async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce({
      user: { id: "test-user-guard-2", role: Role.CITIZEN, email: "guard2@civicpulse.local" },
      expires: "1",
    });

    const req = new Request("http://localhost:3000/api/reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        category: Category.POTHOLES,
        lat: 12.9716,
        lng: 77.5946,
        photoUrl: "not-a-valid-url",
        photoSha256: "test",
        signature: "test",
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });
});
