import { expect, it } from "vitest";
import { testMigrationUrl } from "../../scripts/lib/test-migration-url";
it("uses Supabase session pooling for test migrations when only the runtime secret exists", () => {
  const url = new URL(testMigrationUrl({ DATABASE_URL_TEST: "postgresql://fixture:fixture@aws-0-ap-south-1.pooler.supabase.com:6543/postgres?schema=test&pgbouncer=true" }));
  expect(url.port).toBe("5432");
  expect(url.searchParams.get("schema")).toBe("test");
  expect(url.searchParams.has("pgbouncer")).toBe(false);
});
it("rejects missing, public or default-schema URLs before invoking migrations", () => {
  for (const DATABASE_URL_TEST of [undefined, "invalid", "postgresql://fixture@host/db", "postgresql://fixture@host/db?schema=public"]) expect(() => testMigrationUrl({ DATABASE_URL_TEST })).toThrow();
});
it("honours an explicit isolated direct URL", () => {
  expect(testMigrationUrl({ DATABASE_URL_TEST: "invalid", DIRECT_DATABASE_URL_TEST: "postgresql://fixture:fixture@db.test:5432/db?schema=test" })).toContain("db.test:5432");
});
