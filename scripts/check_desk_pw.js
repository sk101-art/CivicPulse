const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
require('dotenv').config({ path: '.env.local' });

const connectionString = process.env.DIRECT_DATABASE_URL || process.env.APP_DATABASE_URL;
if (!connectionString) {
  console.error('Error: DIRECT_DATABASE_URL or APP_DATABASE_URL is not set in .env.local');
  process.exit(1);
}

const pool = new Pool({ connectionString });

async function main() {
  const res = await pool.query('SELECT id, email, "passwordHash" FROM "User" WHERE email = $1', ['desk-a@civicpulse.local']);
  const user = res.rows[0];
  console.log('User found:', user?.email);
  const candidates = [
    process.env.SEED_DESK_PASSWORD,
    'Password@1234',
  ].filter(Boolean);

  for (const pw of candidates) {
    const ok = await bcrypt.compare(pw, user.passwordHash);
    console.log(`Password candidate match: ${ok}`);
  }
  await pool.end();
}

main().catch(e => { console.error(e); pool.end(); });
