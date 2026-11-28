import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { withAuth } from "@/lib/api/auth";
import { prisma } from "@/lib/db/prisma";
import { reserveLoginAttempt, clearLoginAttempts } from "@/lib/auth/sharedRateLimit";

const schema = z.object({ currentPassword: z.string().min(1).max(200), newPassword: z.string().min(12).max(200) });
export async function POST(req: Request) {
  if (req.headers.get("origin") !== new URL(req.url).origin) return NextResponse.json({ error: "Request origin rejected" }, { status: 403 });
  const auth = await withAuth();
  if (auth.error) return auth.error;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Use a new password of at least 12 characters." }, { status: 400 });
  try {
    const identifier = `password-change:${auth.user.id}`;
    if (!(await reserveLoginAttempt(identifier)).allowed) return NextResponse.json({ error: "Too many attempts. Try again in 15 minutes." }, { status: 429 });
    const user = await prisma.user.findUnique({ where: { id: auth.user.id } });
    if (!user?.isActive || !(await bcrypt.compare(parsed.data.currentPassword, user.passwordHash))) return NextResponse.json({ error: "Current password is incorrect." }, { status: 400 });
    if (parsed.data.currentPassword === parsed.data.newPassword) return NextResponse.json({ error: "Choose a different password." }, { status: 400 });
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(parsed.data.newPassword, 12) } });
    await clearLoginAttempts(identifier);
    return NextResponse.json({ changed: true });
  } catch {
    return NextResponse.json({ error: "Password could not be changed. Please retry." }, { status: 503 });
  }
}
