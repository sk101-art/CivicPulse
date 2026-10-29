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

const pool = new Pool({ connectionString });

export async function setupTestDatabase() {
  const client = await pool.connect();
  try {
    console.log("Setting up test database schema (schema=test)...");
    await client.query("CREATE SCHEMA IF NOT EXISTS test;");

    // 1. Recreate Enums in test schema
    const enums = await client.query(`
      SELECT t.typname
      FROM pg_type t
      JOIN pg_namespace n ON t.typnamespace = n.oid
      WHERE n.nspname = 'public' AND t.typtype = 'e';
    `);

    for (const row of enums.rows) {
      const labelsRes = await client.query(`
        SELECT e.enumlabel
        FROM pg_enum e
        JOIN pg_type t ON e.enumtypid = t.oid
        JOIN pg_namespace n ON t.typnamespace = n.oid
        WHERE n.nspname = 'public' AND t.typname = $1
        ORDER BY e.enumsortorder;
      `, [row.typname]);

      const vals = labelsRes.rows.map((r: { enumlabel: string }) => `'${r.enumlabel}'`).join(", ");
      await client.query(`DROP TYPE IF EXISTS test."${row.typname}" CASCADE;`);
      await client.query(`CREATE TYPE test."${row.typname}" AS ENUM (${vals});`);
    }

    // 2. Clone tables from public if not present
    const tables = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
        AND table_name NOT LIKE 'pg_%' AND table_name NOT LIKE 'sql_%'
        AND table_name NOT IN ('spatial_ref_sys', 'geography_columns', 'geometry_columns');
    `);

    for (const row of tables.rows) {
      const tbl = row.table_name;
      await client.query(`CREATE TABLE IF NOT EXISTS test."${tbl}" (LIKE public."${tbl}" INCLUDING ALL);`);
    }

    // 3. Convert enum columns in test tables
    const cols = await client.query(`
      SELECT c.table_name, c.column_name, c.udt_name, c.column_default
      FROM information_schema.columns c
      WHERE c.table_schema = 'test'
        AND c.udt_name IN (SELECT typname FROM pg_type t JOIN pg_namespace n ON t.typnamespace = n.oid WHERE n.nspname = 'public' AND t.typtype = 'e');
    `);

    for (const col of cols.rows) {
      if (col.column_default) {
        await client.query(`ALTER TABLE test."${col.table_name}" ALTER COLUMN "${col.column_name}" DROP DEFAULT;`);
      }
      await client.query(`
        ALTER TABLE test."${col.table_name}"
        ALTER COLUMN "${col.column_name}" TYPE test."${col.udt_name}"
        USING "${col.column_name}"::text::test."${col.udt_name}";
      `);
      if (col.column_default) {
        const cleanDefault = col.column_default.replace(/::[^)]+/, `::test."${col.udt_name}"`);
        await client.query(`
          ALTER TABLE test."${col.table_name}"
          ALTER COLUMN "${col.column_name}" SET DEFAULT ${cleanDefault};
        `);
      }
    }

    // 4. Install PostGIS & audit triggers
    await client.query(`
      DROP TRIGGER IF EXISTS trg_issue_update_geom ON test."Issue";
      CREATE TRIGGER trg_issue_update_geom
      BEFORE INSERT OR UPDATE OF lat, lng ON test."Issue"
      FOR EACH ROW EXECUTE FUNCTION public.issue_update_geom();

      DROP TRIGGER IF EXISTS trg_signal_update_geom ON test."Signal";
      CREATE TRIGGER trg_signal_update_geom
      BEFORE INSERT OR UPDATE OF lat, lng ON test."Signal"
      FOR EACH ROW EXECUTE FUNCTION public.signal_update_geom();

      DROP TRIGGER IF EXISTS trg_action_log_prevent_modify ON test."ActionLog";
      CREATE TRIGGER trg_action_log_prevent_modify
      BEFORE UPDATE OR DELETE ON test."ActionLog"
      FOR EACH ROW EXECUTE FUNCTION public.action_log_prevent_modify();
    `);

    console.log("Test database schema ready!");
  } finally {
    client.release();
    await pool.end();
  }
}

if (require.main === module) {
  setupTestDatabase().catch(console.error);
}
