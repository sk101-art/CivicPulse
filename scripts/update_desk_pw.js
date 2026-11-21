const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const pool = new Pool({
  connectionString: 'postgresql://postgres.ofkshdculpzvqergntcs:3z5KuftkM48UuIxk@aws-0-ap-south-1.pooler.supabase.com:5432/postgres'
});

async function main() {
  const hash = await bcrypt.hash('Password@1234', 10);
  await pool.query('UPDATE "User" SET "passwordHash" = $1 WHERE email = $2', [hash, 'desk-a@civicpulse.local']);
  console.log('Updated desk-a password hash to Password@1234');
  await pool.end();
}

main().catch(e => { console.error(e); pool.end(); });
