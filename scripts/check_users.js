const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://postgres.ofkshdculpzvqergntcs:3z5KuftkM48UuIxk@aws-0-ap-south-1.pooler.supabase.com:5432/postgres'
});

async function main() {
  const res = await pool.query('SELECT id, email, role FROM "User" LIMIT 20');
  console.log('Users in DB:');
  console.table(res.rows);
  await pool.end();
}

main().catch(err => {
  console.error(err);
  pool.end();
});
