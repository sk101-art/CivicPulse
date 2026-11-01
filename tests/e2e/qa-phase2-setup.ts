/**
 * Global setup for QA Phase 2: seeds test DB once, logs in each role,
 * saves Playwright storage state so all tests start with a valid session.
 *
 * If login fails for any role, throws immediately — prevents the worker-restart loop
 * that happens when tests fail and crash the worker on every single test.
 */
import { chromium, FullConfig } from "@playwright/test";
import { createSeedDb } from "../../scripts/lib/db-target";
import { seedDemoData } from "../../scripts/seed-demo";
import { verifySchemaParity } from "../../scripts/verify-schema-parity";
import path from "path";
import fs from "fs";

const BASE = "http://localhost:3100";
const SEED_PW = process.env.SEED_DESK_PASSWORD || "password123";

const ROLES = [
  { name: "desk-a", email: "desk-a@civicpulse.local", password: SEED_PW },
  { name: "desk-b", email: "desk-b@civicpulse.local", password: SEED_PW },
  { name: "citizen", email: "citizen@example.com", password: SEED_PW },
];

export default async function globalSetup(_config: FullConfig) {
  // 0. Verify public & test schema parity (no column drift)
  const parity = await verifySchemaParity();
  if (!parity.ok) {
    throw new Error(`Schema drift detected between public and test schemas: ${JSON.stringify(parity.discrepancies)}`);
  }

  // 1. Seed
  if (process.env.QA_SKIP_SEED === "1") {
    console.log("[QA Phase 2 Setup] QA_SKIP_SEED=1 set; skipping database reseeding.");
  } else {
    const { pool, verify } = createSeedDb();
    await verify();
    await seedDemoData();
    await pool.end().catch(() => {});
  }

  // 2. Login each role and save storage state
  const stateDir = path.resolve(process.cwd(), ".playwright-auth");
  fs.mkdirSync(stateDir, { recursive: true });

  const allAuthExist = ROLES.every((r) =>
    fs.existsSync(path.join(stateDir, `${r.name}.json`))
  );

  if (process.env.QA_SKIP_SEED === "1" && allAuthExist) {
    console.log("[QA Phase 2 Setup] Auth sessions already exist; skipping re-login.");
    return;
  }

  const browser = await chromium.launch();
  try {
    for (const role of ROLES) {
      const ctx = await browser.newContext();
      const req = ctx.request;

      const csrfRes = await req.get(`${BASE}/api/auth/csrf`);
      const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };

      const authRes = await req.post(`${BASE}/api/auth/callback/credentials`, {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        data: new URLSearchParams({
          csrfToken,
          email: role.email,
          password: role.password,
          json: "true",
          callbackUrl: `${BASE}/desk`,
        }).toString(),
        maxRedirects: 5,
        failOnStatusCode: false,
      });

      const cookies = await ctx.cookies(BASE);
      const hasSession = cookies.some((c) => c.name.includes("session-token"));
      if (!hasSession) {
        const body = await authRes.text().catch(() => "");
        throw new Error(
          `[QA Phase 2 Setup] Login FAILED for ${role.email} (status ${authRes.status()}): ${body.slice(0, 200)}\n` +
          `Fix seed or credentials before running the suite.`
        );
      }

      const statePath = path.join(stateDir, `${role.name}.json`);
      await ctx.storageState({ path: statePath });
      await ctx.close();
      console.log(`[QA Phase 2 Setup] ✓ ${role.email} → ${statePath}`);
    }
  } finally {
    await browser.close();
  }
}
