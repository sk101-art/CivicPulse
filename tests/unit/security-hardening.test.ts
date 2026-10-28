import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { Role, Status, Category } from "@prisma/client";
import { getServerSession } from "next-auth/next";
import { prisma } from "@/lib/db/prisma";
import { POST as registerPOST } from "@/app/api/auth/register/route";
import { POST as actionsPOST } from "@/app/api/issues/[id]/actions/route";
import { POST as verifyPOST } from "@/app/api/issues/[id]/verify/route";
import { POST as safeRoutePOST } from "@/app/api/routes/safe/route";

vi.mock("next-auth/next", () => ({
  getServerSession: vi.fn(),
}));

/**
 * Review fixes (security hardening):
 * 1. Public registration can never create a desk (AUTHORITY) account.
 * 2. A desk cannot claim a fix without a signed on-site photo.
 * 3. Desk accounts cannot verify fixes (citizens only).
 * 4. Safe routing (TomTom quota) requires a signed-in user.
 */
describe("Security hardening (review fixes)", () => {
  const stamp = Date.now();
  const createdEmails: string[] = [];
  const createdIssueIds: string[] = [];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterAll(async () => {
    if (createdIssueIds.length > 0) {
      await prisma.issue.deleteMany({ where: { id: { in: createdIssueIds } } }).catch(() => {});
    }
    if (createdEmails.length > 0) {
      const users = await prisma.user.findMany({
        where: { email: { in: createdEmails } },
        select: { id: true },
      });
      const ids = users.map((u) => u.id);
      await prisma.citizenProfile.deleteMany({ where: { userId: { in: ids } } }).catch(() => {});
      await prisma.user.deleteMany({ where: { id: { in: ids } } }).catch(() => {});
    }
  });

  it("registration ignores role: AUTHORITY and always creates a CITIZEN", async () => {
    const email = `test-sec-register-${stamp}@example.com`;
    createdEmails.push(email);

    const res = await registerPOST(
      new Request("http://localhost:3000/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Test Attacker", email, password: "longenough123", role: "AUTHORITY" }),
      })
    );

    expect(res.status).toBe(200);
    const user = await prisma.user.findUnique({ where: { email } });
    expect(user?.role).toBe(Role.CITIZEN);
  });

  it("registration rejects short passwords and invalid emails", async () => {
    const shortPw = await registerPOST(
      new Request("http://localhost:3000/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "X", email: `test-sec-short-${stamp}@example.com`, password: "123" }),
      })
    );
    expect(shortPw.status).toBe(400);

    const badEmail = await registerPOST(
      new Request("http://localhost:3000/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "X", email: "not-an-email", password: "longenough123" }),
      })
    );
    expect(badEmail.status).toBe(400);
  });

  it("CLAIM_FIX without a signed photo is rejected and the status does not change", async () => {
    const issue = await prisma.issue.create({
      data: {
        category: Category.POTHOLES,
        status: Status.CONFIRMED,
        lat: 12.9575,
        lng: 77.7011,
        slaDueAt: new Date(Date.now() + 72 * 3600 * 1000),
        isSeed: true,
      },
    });
    createdIssueIds.push(issue.id);

    vi.mocked(getServerSession).mockResolvedValueOnce({
      user: { id: "test-sec-desk", email: "desk@example.com", role: Role.AUTHORITY },
      expires: new Date(Date.now() + 3600_000).toISOString(),
    });

    const res = await actionsPOST(
      new Request(`http://localhost:3000/api/issues/${issue.id}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Client-supplied "evidence" without a photo must not be trusted
        body: JSON.stringify({ action: "CLAIM_FIX", evidence: { role: "CLAIM_FIX", distanceM: 0 } }),
      }),
      { params: Promise.resolve({ id: issue.id }) }
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("EVIDENCE_REQUIRED");

    const after = await prisma.issue.findUnique({ where: { id: issue.id } });
    expect(after?.status).toBe(Status.CONFIRMED);
  });

  it("desk (AUTHORITY) accounts cannot verify fixes", async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce({
      user: { id: "test-sec-desk", email: "desk@example.com", role: Role.AUTHORITY },
      expires: new Date(Date.now() + 3600_000).toISOString(),
    });

    const res = await verifyPOST(
      new Request("http://localhost:3000/api/issues/any/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({ id: "any" }) }
    );

    expect(res.status).toBe(403);
  });

  it("safe routing requires a signed-in user", async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(null);

    const { NextRequest } = await import("next/server");
    const res = await safeRoutePOST(
      new NextRequest("http://localhost:3000/api/routes/safe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          origin: { latitude: 12.95, longitude: 77.7 },
          destination: { latitude: 12.96, longitude: 77.71 },
        }),
      })
    );

    expect(res.status).toBe(401);
  });
});
