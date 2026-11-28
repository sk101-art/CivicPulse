/** Migrations require a session connection; keep runtime pooling separate.
 * Supabase guidance: https://supabase.com/docs/guides/database/prisma
 */
export function testMigrationUrl(env: { DIRECT_DATABASE_URL_TEST?: string; DATABASE_URL_TEST?: string }): string {
  const raw = env.DIRECT_DATABASE_URL_TEST || env.DATABASE_URL_TEST;
  if (!raw) throw new Error("An isolated test database URL is required for migrations");
  let url: URL;
  try { url = new URL(raw); } catch { throw new Error("Test migration URL is invalid"); }
  if (!["postgres:", "postgresql:"].includes(url.protocol) || url.searchParams.get("schema") !== "test") {
    throw new Error("Test migrations must explicitly target schema=test");
  }
  if (url.hostname.endsWith(".pooler.supabase.com") && url.port === "6543") {
    url.port = "5432";
    url.searchParams.delete("pgbouncer");
  }
  return url.toString();
}
