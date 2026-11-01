import { Pool } from "pg";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";

const rootDir = process.cwd();
if (fs.existsSync(path.join(rootDir, ".env"))) {
  dotenv.config({ path: path.join(rootDir, ".env") });
}
if (fs.existsSync(path.join(rootDir, ".env.local"))) {
  dotenv.config({ path: path.join(rootDir, ".env.local"), override: true });
}

const connectionString = process.env.DIRECT_DATABASE_URL_TEST || process.env.DATABASE_URL_TEST;
if (!connectionString) {
  throw new Error("Missing DATABASE_URL_TEST or DIRECT_DATABASE_URL_TEST");
}

export async function verifySchemaParity(): Promise<{ ok: boolean; discrepancies: unknown[] }> {
  const pool = new Pool({ connectionString });
  try {
    const res = await pool.query(`
      SELECT 
        COALESCE(p.table_name, t.table_name) AS table_name,
        COALESCE(p.column_name, t.column_name) AS column_name,
        p.data_type AS public_type,
        t.data_type AS test_type
      FROM (
        SELECT table_name, column_name, data_type 
        FROM information_schema.columns 
        WHERE table_schema = 'public'
          AND table_name NOT LIKE 'pg_%' AND table_name NOT LIKE 'sql_%'
          AND table_name NOT IN ('spatial_ref_sys', 'geography_columns', 'geometry_columns', '_prisma_migrations')
      ) p
      FULL OUTER JOIN (
        SELECT table_name, column_name, data_type 
        FROM information_schema.columns 
        WHERE table_schema = 'test'
          AND table_name NOT LIKE 'pg_%' AND table_name NOT LIKE 'sql_%'
          AND table_name NOT IN ('spatial_ref_sys', 'geography_columns', 'geometry_columns', '_prisma_migrations')
      ) t ON p.table_name = t.table_name AND p.column_name = t.column_name
      WHERE p.column_name IS NULL OR t.column_name IS NULL OR p.data_type <> t.data_type;
    `);

    const discrepancies = res.rows;
    if (discrepancies.length > 0) {
      console.error("[Schema Parity] Found discrepancies between public and test schemas:", discrepancies);
      return { ok: false, discrepancies };
    } else {
      console.log("[Schema Parity] Verified: public and test schemas have identical tables and columns ✓");
      return { ok: true, discrepancies: [] };
    }
  } finally {
    await pool.end();
  }
}

if (require.main === module || process.argv[1]?.endsWith("verify-schema-parity.ts")) {
  verifySchemaParity().then(({ ok }) => {
    if (!ok) process.exit(1);
  }).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
