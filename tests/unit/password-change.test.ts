import { expect, it, vi } from "vitest";
import bcrypt from "bcryptjs";
import { createHash } from "node:crypto";
import { POST } from "@/app/api/account/password/route";
import { withAuth } from "@/lib/api/auth";
import { prisma } from "@/lib/db/prisma";
import { authOptions } from "@/lib/auth";
vi.mock("@/lib/api/auth", () => ({ withAuth: vi.fn() }));
it("changes a verified account password, rejects cross-origin requests and revokes old sessions", async () => {
  const oldPassword = "Isolated-fixture-old-123";
  const newPassword = "Isolated-fixture-new-456";
  const hash = await bcrypt.hash(oldPassword, 10);
  const user = await prisma.user.create({ data: { email: `password-test-${Date.now()}@test.invalid`, passwordHash: hash, role: "CITIZEN" } });
  vi.mocked(withAuth).mockResolvedValue({ user: { id: user.id, email: user.email, role: "CITIZEN" }, error: null });
  try {
    const req = (origin: string, currentPassword: string) => new Request("http://localhost/api/account/password", { method: "POST", headers: { origin, "Content-Type": "application/json" }, body: JSON.stringify({ currentPassword, newPassword }) });
    expect((await POST(req("https://untrusted.invalid", oldPassword))).status).toBe(403);
    expect((await POST(req("http://localhost", "incorrect"))).status).toBe(400);
    expect((await POST(req("http://localhost", oldPassword))).status).toBe(200);
    const changed = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(await bcrypt.compare(newPassword, changed.passwordHash)).toBe(true);
    expect(await bcrypt.compare(oldPassword, changed.passwordHash)).toBe(false);
    await expect(authOptions.callbacks!.jwt!({ token: { id: user.id, role: "CITIZEN", passwordVersion: createHash("sha256").update(hash).digest("hex") } } as never)).rejects.toThrow("SESSION_REVOKED");
  } finally { await prisma.user.delete({ where: { id: user.id } }); }
});
