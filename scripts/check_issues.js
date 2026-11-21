const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://postgres.ofkshdculpzvqergntcs:3z5KuftkM48UuIxk@aws-0-ap-south-1.pooler.supabase.com:5432/postgres'
});

async function main() {
  const res = await pool.query('SELECT id, status, category, address FROM "Issue" LIMIT 10');
  console.log('Count:', res.rows.length);
  console.table(res.rows);
  await pool.end();
}

main().catch(e => { console.error(e); pool.end(); });
