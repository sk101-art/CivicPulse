import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { POST as registerPOST } from "@/app/api/auth/register/route";

describe("Account Registration & Validation (/api/auth/register)", () => {
  const stamp = Date.now();
  const createdEmails: string[] = [];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterAll(async () => {
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

  it("fails when password is fewer than 8 characters and returns clear message", async () => {
    const res = await registerPOST(
      new Request("http://localhost:3000/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Sujay Test",
          email: `shortpw-${stamp}@example.com`,
          password: "short",
        }),
      })
    );

    expect(res.status).toBe(400);
    const bodyText = await res.text();
    expect(bodyText).toContain("Password must be at least 8 characters");
  });

  it("fails when name is missing or whitespace only", async () => {
    const res = await registerPOST(
      new Request("http://localhost:3000/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "   ",
          email: `noname-${stamp}@example.com`,
          password: "validpassword123",
        }),
      })
    );

    expect(res.status).toBe(400);
    const bodyText = await res.text();
    expect(bodyText).toContain("Name is required");
  });

  it("fails when email is invalid format", async () => {
    const res = await registerPOST(
      new Request("http://localhost:3000/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Sujay Test",
          email: "invalid-email-format",
          password: "validpassword123",
        }),
      })
    );

    expect(res.status).toBe(400);
    const bodyText = await res.text();
    expect(bodyText).toContain("A valid email is required");
  });

  it("successfully registers a new citizen account and creates profile", async () => {
    const email = `newcitizen-${stamp}@example.com`;
    createdEmails.push(email);

    const res = await registerPOST(
      new Request("http://localhost:3000/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "New Citizen User",
          email,
          password: "strongpassword123",
        }),
      })
    );

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.email).toBe(email);

    const user = await prisma.user.findUnique({
      where: { email },
      include: { citizenProfile: true },
    });
    expect(user).not.toBeNull();
    expect(user?.role).toBe(Role.CITIZEN);
    expect(user?.citizenProfile).not.toBeNull();
    expect(user?.citizenProfile?.reputation).toBe(0);
  });

  it("rejects duplicate registration when email already exists", async () => {
    const email = `newcitizen-${stamp}@example.com`;

    const res = await registerPOST(
      new Request("http://localhost:3000/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Duplicate User",
          email,
          password: "strongpassword123",
        }),
      })
    );

    expect(res.status).toBe(400);
    const bodyText = await res.text();
    expect(bodyText).toBe("User already exists");
  });
});
