const { Pool } = require('pg');
require('dotenv').config({ path: '.env.local' });

const connectionString = process.env.DIRECT_DATABASE_URL || process.env.APP_DATABASE_URL;
if (!connectionString) {
  console.error('Error: DIRECT_DATABASE_URL or APP_DATABASE_URL is not set in .env.local');
  process.exit(1);
}

const pool = new Pool({ connectionString });

async function main() {
  const res = await pool.query(`
    SELECT i.id, i.title, i.category, i.status, w.name as ward
    FROM "Issue" i
    LEFT JOIN "Ward" w ON i."wardId" = w.id
    LIMIT 5
  `);
  console.table(res.rows);
  await pool.end();
}

main().catch(e => { console.error(e); pool.end(); });
