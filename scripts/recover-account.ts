import bcrypt from "bcryptjs";
import { resolveDbTarget, createPool, createPrisma, assertDbTarget } from "./lib/db-target";

// Run only after independently verifying account ownership. Password stays in the
// environment; it must never appear in shell arguments, URLs, logs or this file.
async function main() {
  const target = resolveDbTarget();
  const password = process.env.RECOVERY_PASSWORD;
  const email = process.env.RECOVERY_EMAIL?.trim().toLowerCase();
  if (!email || !password || password.length < 12 || password.length > 200) throw new Error("Set RECOVERY_EMAIL and RECOVERY_PASSWORD (12–200 characters) in the process environment.");
  const pool = createPool(target);
  const prisma = createPrisma(pool, target);
  try {
    await assertDbTarget(pool, target);
    const user = await prisma.user.findUnique({ where: { email }, select: { id: true, isActive: true } });
    if (!user?.isActive) throw new Error("Active account not found; recovery cannot reactivate a suspended account.");
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(password, 12) } });
    console.log("Password recovered. Existing sessions will be rejected when they next contact the server. Ask the owner to sign in and choose a private password.");
  } finally { await prisma.$disconnect(); await pool.end(); }
}
main().catch(() => { console.error("Account recovery failed. Check the target, verified account and recovery environment; no credentials were printed."); process.exitCode = 1; });
