import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { PrismaClient, Category, Status } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const rootDir = process.cwd();
if (fs.existsSync(path.join(rootDir, '.env'))) {
  dotenv.config({ path: path.join(rootDir, '.env') });
}
if (fs.existsSync(path.join(rootDir, '.env.local'))) {
  dotenv.config({ path: path.join(rootDir, '.env.local'), override: true });
}

interface LegacyReportItem {
  id: string;
  title?: string;
  description?: string;
  category?: string;
  status?: string;
  latitude?: number;
  longitude?: number;
  lat?: number;
  lng?: number;
  address?: string;
  citizenUserId?: string;
  photoUrl?: string;
  photoSha256?: string;
  createdAt?: string | Date;
}

async function main() {
  const isDryRun = process.argv.includes('--dry-run');
  const fileArgIndex = process.argv.indexOf('--file');
  const customFilePath = fileArgIndex !== -1 && process.argv[fileArgIndex + 1] ? process.argv[fileArgIndex + 1] : null;

  console.log(`[T11 Migrate] Starting legacy v1 to v2 migration... Mode: ${isDryRun ? 'DRY-RUN' : 'EXECUTE'}`);

  const connectionString = process.env.DIRECT_DATABASE_URL || process.env.APP_DATABASE_URL;
  if (!connectionString) {
    throw new Error('Database connection URL missing in environment');
  }

  const pool = new Pool({ connectionString });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  let legacyItems: LegacyReportItem[] = [];
  let source = 'none';

  const defaultDataFile = path.join(rootDir, 'data', 'legacy_reports.json');
  const fileToLoad = customFilePath ? path.resolve(rootDir, customFilePath) : defaultDataFile;

  if (fs.existsSync(fileToLoad)) {
    source = `file (${path.relative(rootDir, fileToLoad)})`;
    try {
      const content = fs.readFileSync(fileToLoad, 'utf-8');
      legacyItems = JSON.parse(content);
    } catch (err) {
      console.error(`Failed to read legacy reports file: ${err instanceof Error ? err.message : String(err)}`);
    }
  } else {
    // Check if a legacy database table exists
    try {
      const tableCheck = await pool.query(
        "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'legacy_reports');"
      );
      if (tableCheck.rows[0]?.exists) {
        source = 'database table (legacy_reports)';
        const rows = await pool.query('SELECT * FROM "legacy_reports";');
        legacyItems = rows.rows;
      }
    } catch {
      // ignore table check error
    }
  }

  console.log(`[T11 Migrate] Source detected: ${source}. Found ${legacyItems.length} legacy report(s).`);

  let countToMigrate = 0;
  let countSkipped = 0;
  let countMigrated = 0;

  // Find a fallback user if citizenUserId is not provided
  const fallbackUser = await prisma.user.findFirst();

  for (const item of legacyItems) {
    const legacyNonce = `legacy:${item.id}`;
    const existing = await prisma.report.findUnique({
      where: { nonce: legacyNonce },
    });

    if (existing) {
      countSkipped++;
      continue;
    }

    countToMigrate++;

    if (!isDryRun) {
      const rawCategory = (item.category || 'OTHER').toUpperCase();
      const category: Category = (Object.values(Category).includes(rawCategory as Category)
        ? rawCategory
        : 'OTHER') as Category;

      let status: Status = Status.OPEN;
      if (item.status === 'RESOLVED' || item.status === 'VERIFIED_FIXED') {
        status = Status.VERIFIED_FIXED;
      } else if (item.status && Object.values(Status).includes(item.status as Status)) {
        status = item.status as Status;
      }

      const lat = item.latitude ?? item.lat ?? 12.9716;
      const lng = item.longitude ?? item.lng ?? 77.5946;
      const address = item.address || `Legacy Report #${item.id}`;
      const createdAt = item.createdAt ? new Date(item.createdAt) : new Date();
      const userId = item.citizenUserId || fallbackUser?.id;

      if (!userId) {
        console.warn(`[T11 Migrate] Skipping item ${item.id}: no valid user found.`);
        continue;
      }

      const issue = await prisma.issue.create({
        data: {
          category,
          status,
          lat,
          lng,
          address,
          priority: 0,
          slaDueAt: new Date(createdAt.getTime() + 72 * 3600 * 1000),
          isSeed: false,
          createdAt,
        },
      });

      await prisma.report.create({
        data: {
          issueId: issue.id,
          userId,
          role: 'REPORT',
          photoUrl: item.photoUrl || 'https://placehold.co/600x400/png?text=Legacy+Report',
          photoSha256: item.photoSha256 || 'legacy_sha256_unhashed',
          signature: 'legacy',
          nonce: legacyNonce,
          offline: false,
          legacy: true,
          lat,
          lng,
          gpsAccuracyM: 10,
          capturedAt: createdAt,
          note: item.description || item.title || 'Legacy migrated report',
          isSeed: false,
          createdAt,
        },
      });

      countMigrated++;
    }
  }

  await pool.end();

  console.log(`--- [T11 Migrate Summary] ---`);
  console.log(`Source: ${source}`);
  console.log(`Total inspected: ${legacyItems.length}`);
  console.log(`Already migrated (skipped): ${countSkipped}`);
  console.log(`Eligible to migrate: ${countToMigrate}`);
  if (isDryRun) {
    console.log(`Dry-run finished: 0 changes written to database.`);
  } else {
    console.log(`Migration finished: ${countMigrated} issue(s) and evidence report(s) written.`);
  }
}

main().catch((err) => {
  console.error('[T11 Migrate] Error:', err);
  process.exit(1);
});
