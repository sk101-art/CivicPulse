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
  const hash = await bcrypt.hash('Password@1234', 10);
  await pool.query('UPDATE "User" SET "passwordHash" = $1 WHERE email = $2', [hash, 'desk-a@civicpulse.local']);
  console.log('Updated desk-a password hash to Password@1234');
  await pool.end();
}

main().catch(e => { console.error(e); pool.end(); });
