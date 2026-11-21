const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const pool = new Pool({
  connectionString: 'postgresql://postgres.ofkshdculpzvqergntcs:3z5KuftkM48UuIxk@aws-0-ap-south-1.pooler.supabase.com:5432/postgres'
});

async function main() {
  const res = await pool.query('SELECT id, email, "passwordHash" FROM "User" WHERE email = $1', ['desk-a@civicpulse.local']);
  const user = res.rows[0];
  console.log('User found:', user?.email);
  const candidates = [
    'jhnpQHUVbP3EUR_vIKgGQyHpmUkUypfx!Ab9#xK',
    'Password@1234',
    'password',
    'admin',
    'desk-a'
  ];
  for (const pw of candidates) {
    const ok = await bcrypt.compare(pw, user.passwordHash);
    console.log(`Password "${pw}": ${ok}`);
  }
  await pool.end();
}

main().catch(e => { console.error(e); pool.end(); });
