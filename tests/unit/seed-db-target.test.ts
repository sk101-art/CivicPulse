import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { Pool } from "pg";
import {
  isTestRun,
  resolveDbTarget,
  assertTestDatabaseUrl,
  assertDbTarget,
  createPool,
} from "../../scripts/lib/db-target";

const asEnv = (vars: Record<string, string>) => vars as unknown as NodeJS.ProcessEnv;

const PROD = "postgresql://u:p@prod.example.com:5432/postgres";
const TEST = "postgresql://u:p@prod.example.com:6543/postgres?pgbouncer=true&schema=test";

describe("seed DB targeting", () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "seed-target-"));
    fs.writeFileSync(path.join(dir, ".env"), `APP_DATABASE_URL=${PROD}\n`);
    fs.writeFileSync(
      path.join(dir, ".env.local"),
      `APP_DATABASE_URL=${PROD}\nDIRECT_DATABASE_URL=${PROD}\nDATABASE_URL_TEST=${TEST}\n`
    );
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("detects test runs from Vitest, Playwright, NODE_ENV or SEED_TARGET", () => {
    expect(isTestRun(asEnv({ VITEST: "true" }))).toBe(true);
    expect(isTestRun(asEnv({ PLAYWRIGHT_TEST: "true" }))).toBe(true);
    expect(isTestRun(asEnv({ NODE_ENV: "test" }))).toBe(true);
    expect(isTestRun(asEnv({ SEED_TARGET: "test" }))).toBe(true);
    expect(isTestRun(asEnv({}))).toBe(false);
  });

  it("test run: .env.local never overrides the runner's URLs; uses DATABASE_URL_TEST with schema=test", () => {
    // Simulates playwright.config: APP_DATABASE_URL already pointed at the test DB.
    const env = asEnv({ PLAYWRIGHT_TEST: "true", APP_DATABASE_URL: TEST, DATABASE_URL_TEST: TEST });
    const target = resolveDbTarget(undefined, env, dir);
    expect(target).toEqual({ mode: "test", schema: "test", connectionString: TEST });
    expect(env.APP_DATABASE_URL).toBe(TEST);
  });

  it("test run: even if APP_DATABASE_URL is prod, the seed connects to DATABASE_URL_TEST", () => {
    const env = asEnv({ VITEST: "true", APP_DATABASE_URL: PROD });
    const target = resolveDbTarget(undefined, env, dir);
    expect(target.connectionString).toBe(TEST);
    expect(env.APP_DATABASE_URL).toBe(TEST);
  });

  it("test run: fails fast when the URL would target the public schema", () => {
    expect(() => assertTestDatabaseUrl(undefined, [PROD])).toThrow(/DATABASE_URL_TEST must be set/);
    expect(() => assertTestDatabaseUrl("postgresql://u:p@h:5432/postgres", [PROD])).toThrow(/public schema/);
    expect(() => assertTestDatabaseUrl("postgresql://u:p@h:5432/postgres?schema=public", [PROD])).toThrow(/schema=public/);
    expect(() => assertTestDatabaseUrl(`${PROD}?schema=test`, [`${PROD}?schema=test`])).toThrow(/production/);

    const env = asEnv({ VITEST: "true", DATABASE_URL_TEST: PROD });
    expect(() => resolveDbTarget(undefined, env, dir)).toThrow(/schema=test/);
  });

  it("production run keeps the historic .env.local precedence", () => {
    const env = asEnv({ APP_DATABASE_URL: "postgresql://shell/override" });
    const target = resolveDbTarget(["APP_DATABASE_URL"], env, dir);
    expect(target).toEqual({ mode: "production", schema: "public", connectionString: PROD });
  });

  it("runtime guard passes on the real test schema and refuses a connection that lands in public", async () => {
    const url = process.env.DATABASE_URL_TEST!;
    const target = { mode: "test" as const, schema: "test" as const, connectionString: url };

    const good = createPool(target);
    try {
      await expect(assertDbTarget(good, target)).resolves.toBeUndefined();
    } finally {
      await good.end();
    }

    // A bare Pool ignores ?schema=test and resolves to public: this is exactly the old bug.
    const bare = new Pool({ connectionString: url });
    try {
      await expect(assertDbTarget(bare, target)).rejects.toThrow(/Refusing to continue/);
    } finally {
      await bare.end();
    }
  });

  it("seed scripts and e2e specs no longer reload .env.local with override", () => {
    const files = [
      "scripts/seed-demo.ts",
      "prisma/seed.ts",
      "tests/e2e/blind-repair-audit.spec.ts",
      "tests/e2e/demo.spec.ts",
      "tests/e2e/mobile-flows.spec.ts",
      "tests/e2e/phase2-acceptance.spec.ts",
    ];
    for (const f of files) {
      const src = fs.readFileSync(path.join(process.cwd(), f), "utf-8");
      expect(src, f).not.toMatch(/override:\s*true/);
      expect(src, f).not.toMatch(/new Pool\(/);
      expect(src, f).toMatch(/scripts\/lib\/db-target|\.\/lib\/db-target/);
    }
  });

  it("claim-gap Verifications reference seed-rep-* reports that the seed now creates", () => {
    const src = fs.readFileSync(path.join(process.cwd(), "scripts/seed-demo.ts"), "utf-8");
    expect(src).toContain("reportId: `seed-rep-${c.id}`");
    expect(src).toMatch(/upsertSeedReport\(prisma, \{\s*id: `seed-rep-\$\{c\.id\}`[\s\S]*?role: EvidenceRole\.VERIFY/);
  });
});
