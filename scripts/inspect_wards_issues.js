const { Pool } = require('pg');
require('dotenv').config({ path: '.env.local' });

const pool = new Pool({
  connectionString: process.env.APP_DATABASE_URL
});

async function check() {
  const issues = await pool.query(`
    SELECT id, category, status, address, lat, lng, "wardId" 
    FROM "Issue" 
    WHERE address ILIKE '%Ward 12%' OR address ILIKE '%MG Road%' OR address ILIKE '%Park%' OR address ILIKE '%Church%'
  `);
  console.log('Issues with Ward 12 / Central addresses:');
  console.table(issues.rows);
  await pool.end();
}

check().catch(err => {
  console.error(err);
  pool.end();
});
