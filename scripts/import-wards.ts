import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import crypto from 'crypto';

const rootDir = process.cwd();
if (fs.existsSync(path.join(rootDir, '.env'))) {
  dotenv.config({ path: path.join(rootDir, '.env') });
}
if (fs.existsSync(path.join(rootDir, '.env.local'))) {
  dotenv.config({ path: path.join(rootDir, '.env.local'), override: true });
}

export async function importWardsFromGeoJson(customPath?: string) {
  const filePath = customPath || path.join(rootDir, 'data', 'wards.geojson');
  if (!fs.existsSync(filePath)) {
    throw new Error(`GeoJSON file not found at ${filePath}`);
  }

  const raw = fs.readFileSync(filePath, 'utf-8');
  const geojson = JSON.parse(raw);

  if (!geojson.features || !Array.isArray(geojson.features)) {
    throw new Error('Invalid GeoJSON: missing features array');
  }

  const connectionString = process.env.DIRECT_DATABASE_URL || process.env.APP_DATABASE_URL;
  const pool = new Pool({ connectionString });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  try {
    let importedCount = 0;

    for (const feature of geojson.features) {
      const code =
        feature.properties?.code ||
        feature.properties?.WARD_NO ||
        feature.properties?.ward_no ||
        `WARD-${crypto.randomBytes(3).toString('hex')}`;
      const name =
        feature.properties?.name ||
        feature.properties?.WARD_NAME ||
        feature.properties?.ward_name ||
        `Ward ${code}`;

      const geometryJson = JSON.stringify(feature.geometry);

      // Check if ward exists
      const existing = await prisma.ward.findUnique({
        where: { code: String(code) },
      });

      const wardId = existing?.id || crypto.randomUUID();

      await pool.query(
        `
        INSERT INTO "Ward" ("id", "code", "name", "geom")
        VALUES (
          $1,
          $2,
          $3,
          ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON($4), 4326))::geography
        )
        ON CONFLICT ("code") DO UPDATE
        SET "name" = EXCLUDED."name",
            "geom" = EXCLUDED."geom"
        `,
        [wardId, String(code), String(name), geometryJson]
      );

      importedCount++;
    }

    // Spatially link issues to wards using ST_Covers on PostGIS geometry
    const updateResult = await pool.query(
      `
      UPDATE "Issue"
      SET "wardId" = w.id
      FROM "Ward" w
      WHERE "Issue".geom IS NOT NULL
        AND w.geom IS NOT NULL
        AND ST_Covers(w.geom::geometry, "Issue".geom::geometry)
      `
    );

    console.log(`Successfully imported ${importedCount} ward(s).`);
    console.log(`Updated ${updateResult.rowCount || 0} issue(s) with spatial ward mapping.`);

    return {
      importedWards: importedCount,
      mappedIssues: updateResult.rowCount || 0,
    };
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

if (require.main === module) {
  importWardsFromGeoJson()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Failed to import wards:', err);
      process.exit(1);
    });
}
