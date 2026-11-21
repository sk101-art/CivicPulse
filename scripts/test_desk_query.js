const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://postgres.ofkshdculpzvqergntcs:3z5KuftkM48UuIxk@aws-0-ap-south-1.pooler.supabase.com:5432/postgres'
});

async function main() {
  const res = await pool.query(`
    SELECT i.id, i.category, i.status, i.lat, i.lng, i.address, i.priority, i.band, i."slaDueAt", i."slaBreached", i."createdAt"
    FROM "Issue" i
    WHERE i.status NOT IN ('VERIFIED_FIXED', 'REJECTED')
    ORDER BY i.priority DESC
    LIMIT 20
  `);
  console.log('Open issues found:', res.rows.length);
  console.table(res.rows);
  await pool.end();
}

main().catch(e => { console.error(e); pool.end(); });
