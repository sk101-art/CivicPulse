import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const rootDir = process.cwd();
if (fs.existsSync(path.join(rootDir, '.env'))) {
  dotenv.config({ path: path.join(rootDir, '.env') });
}
if (fs.existsSync(path.join(rootDir, '.env.local'))) {
  dotenv.config({ path: path.join(rootDir, '.env.local'), override: true });
}

interface GbaFeature {
  type: 'Feature';
  properties: {
    id2?: string;
    Corporation?: string;
    corporation_kn?: string;
    corporation_id?: string;
    ward_id?: string;
    ward_name?: string;
    ward_name_kn?: string;
    zone?: string;
    zone_name?: string;
    Assembly?: string;
  };
  geometry: {
    type: string;
    coordinates: unknown;
  };
}

const EXPECTED_CORP_COUNTS: Record<string, number> = {
  Central: 63,
  North: 72,
  East: 50,
  South: 72,
  West: 112,
};

export async function importGbaWards() {
  const filePath = path.join(rootDir, 'data', 'gba-wards-2025.geojson');
  if (!fs.existsSync(filePath)) {
    throw new Error(`GBA 2025 GeoJSON dataset not found at ${filePath}`);
  }

  const raw = fs.readFileSync(filePath, 'utf-8');
  const geojson = JSON.parse(raw) as { features?: GbaFeature[] };
  const features = geojson.features || [];

  if (features.length !== 369) {
    throw new Error(`Expected 369 GBA wards, found ${features.length}`);
  }

  const isTestTarget = process.env.PRISMA_TARGET === 'test';
  const connectionString = isTestTarget
    ? (process.env.DIRECT_DATABASE_URL_TEST || process.env.DATABASE_URL_TEST)
    : (process.env.DIRECT_DATABASE_URL || process.env.APP_DATABASE_URL);
  const pool = new Pool({
    connectionString,
    ...(isTestTarget ? { options: '-c search_path=test,public' } : {}),
  });
  const adapter = new PrismaPg(pool, { schema: isTestTarget ? 'test' : 'public' });
  const prisma = new PrismaClient({ adapter });

  const missingNames: string[] = [];
  const missingGeoms: string[] = [];
  const duplicateIds: string[] = [];
  const seenOfficialIds = new Set<string>();
  const seenCodes = new Set<string>();

  try {
    // 1. Mark pre-existing legacy wards and operational areas without deleting them
    await pool.query(`
      UPDATE "Ward"
      SET "isOperationalArea" = true, "isLegacy" = false
      WHERE UPPER("code") LIKE '%PILOT%';
    `);
    await pool.query(`
      UPDATE "Ward"
      SET "isLegacy" = true
      WHERE UPPER("code") NOT LIKE '%PILOT%'
        AND ("geometrySource" IS NULL OR "geometrySource" <> 'GBA_2025_DELIMITATION');
    `);

    // 2. Upsert the 5 GBA City Corporations
    const corpMap = new Map<string, string>();
    const corpMeta = new Map<string, { officialId: string; shortName: string; name: string; nameKn: string | null }>();

    for (const f of features) {
      const shortName = (f.properties.Corporation || '').trim();
      if (!shortName) continue;
      if (!corpMeta.has(shortName)) {
        corpMeta.set(shortName, {
          officialId: String(f.properties.corporation_id || shortName).trim(),
          shortName,
          name: `Bengaluru ${shortName}`,
          nameKn: f.properties.corporation_kn?.trim() || null,
        });
      }
    }

    for (const [shortName, meta] of corpMeta.entries()) {
      const code = `GBA-${shortName.toUpperCase()}`;
      const existing = await prisma.corporation.findUnique({ where: { code } });
      const corpId = existing?.id || crypto.randomUUID();
      await prisma.corporation.upsert({
        where: { code },
        update: {
          officialId: meta.officialId,
          name: meta.name,
          shortName: meta.shortName,
          nameKn: meta.nameKn,
        },
        create: {
          id: corpId,
          code,
          officialId: meta.officialId,
          name: meta.name,
          shortName: meta.shortName,
          nameKn: meta.nameKn,
        },
      });
      const saved = await prisma.corporation.findUniqueOrThrow({ where: { code } });
      corpMap.set(shortName, saved.id);
    }

    // 3. Upsert all 369 GBA Wards idempotently
    const now = new Date();
    for (let i = 0; i < features.length; i++) {
      const f = features[i];
      const props = f.properties || {};
      const corpShort = (props.Corporation || '').trim();
      const wardNum = Number.parseInt(String(props.ward_id || ''), 10);
      const officialId = (props.id2 || '').trim();
      const name = (props.ward_name || '').trim();
      const nameKn = (props.ward_name_kn || '').trim() || null;

      if (!name) missingNames.push(officialId || `index-${i}`);
      if (!f.geometry || !f.geometry.coordinates) missingGeoms.push(officialId || `index-${i}`);

      const code = `GBA-${corpShort.toUpperCase()}-${String(wardNum).padStart(3, '0')}`;
      if (officialId && seenOfficialIds.has(officialId)) duplicateIds.push(officialId);
      if (seenCodes.has(code)) duplicateIds.push(code);
      if (officialId) seenOfficialIds.add(officialId);
      seenCodes.add(code);

      const corpId = corpMap.get(corpShort) || null;
      const existingWard = officialId
        ? await prisma.ward.findFirst({ where: { OR: [{ officialId }, { code }] } })
        : await prisma.ward.findUnique({ where: { code } });
      const wardId = existingWard?.id || crypto.randomUUID();
      const geomJson = JSON.stringify(f.geometry);

      await pool.query(
        `
        INSERT INTO "Ward" (
          "id", "code", "officialId", "wardNumber", "name", "nameKn",
          "corporationId", "zoneCode", "zoneName", "assemblyName",
          "isLegacy", "isOperationalArea", "geometrySource", "importedAt", "geom"
        )
        VALUES (
          $1, $2, $3, $4, $5, $6,
          $7, $8, $9, $10,
          false, false, 'GBA_2025_DELIMITATION', $11,
          ST_Multi(ST_CollectionExtract(ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON($12), 4326)), 3))::geography
        )
        ON CONFLICT ("code") DO UPDATE SET
          "officialId" = EXCLUDED."officialId",
          "wardNumber" = EXCLUDED."wardNumber",
          "name" = EXCLUDED."name",
          "nameKn" = EXCLUDED."nameKn",
          "corporationId" = EXCLUDED."corporationId",
          "zoneCode" = EXCLUDED."zoneCode",
          "zoneName" = EXCLUDED."zoneName",
          "assemblyName" = EXCLUDED."assemblyName",
          "isLegacy" = false,
          "isOperationalArea" = false,
          "geometrySource" = 'GBA_2025_DELIMITATION',
          "importedAt" = EXCLUDED."importedAt",
          "geom" = EXCLUDED."geom";
        `,
        [
          wardId,
          code,
          officialId || null,
          Number.isFinite(wardNum) ? wardNum : null,
          name || `Ward ${wardNum}`,
          nameKn,
          corpId,
          props.zone?.trim() || null,
          props.zone_name?.trim() || null,
          props.Assembly?.trim() || null,
          now,
          geomJson,
        ]
      );
    }

    // 4. Legacy-to-GBA issue mapping (preserves legacyWardId, never fabricates)
    const legacyIssues = await pool.query<{ id: string; wardId: string | null; lat: number; lng: number }>(`
      SELECT i.id, i."wardId", i.lat, i.lng
      FROM "Issue" i
      LEFT JOIN "Ward" w ON w.id = i."wardId"
      WHERE i."wardId" IS NULL
         OR w."isLegacy" = true
         OR w."isOperationalArea" = true;
    `);

    let mappedCount = 0;
    let ambiguousCount = 0;
    let unmappedCount = 0;

    for (const iss of legacyIssues.rows) {
      const matches = await pool.query<{ id: string }>(`
        SELECT id FROM "Ward"
        WHERE "isLegacy" = false
          AND "isOperationalArea" = false
          AND "geometrySource" = 'GBA_2025_DELIMITATION'
          AND geom IS NOT NULL
          AND ST_Covers(geom::geometry, ST_SetSRID(ST_Point($1, $2), 4326))
      `, [iss.lng, iss.lat]);

      if (matches.rows.length === 1) {
        await pool.query(
          `
          UPDATE "Issue"
          SET "legacyWardId" = COALESCE("legacyWardId", "wardId"),
              "wardId" = $1,
              "wardMappingStatus" = 'MAPPED'
          WHERE id = $2;
          `,
          [matches.rows[0].id, iss.id]
        );
        mappedCount++;
      } else if (matches.rows.length > 1) {
        await pool.query(
          `
          UPDATE "Issue"
          SET "legacyWardId" = COALESCE("legacyWardId", "wardId"),
              "wardMappingStatus" = 'AMBIGUOUS'
          WHERE id = $1;
          `,
          [iss.id]
        );
        ambiguousCount++;
      } else {
        await pool.query(
          `
          UPDATE "Issue"
          SET "legacyWardId" = COALESCE("legacyWardId", "wardId"),
              "wardMappingStatus" = 'UNMAPPED'
          WHERE id = $1;
          `,
          [iss.id]
        );
        unmappedCount++;
      }
    }

    // 5. Validation Report
    const corpCountsRes = await pool.query<{ shortName: string; count: number }>(`
      SELECT c."shortName", COUNT(w.id)::int AS count
      FROM "Corporation" c
      LEFT JOIN "Ward" w ON w."corporationId" = c.id AND w."isLegacy" = false AND w."isOperationalArea" = false
      GROUP BY c."shortName"
      ORDER BY c."shortName" ASC;
    `);

    const invalidGeomRes = await pool.query<{ count: number }>(`
      SELECT COUNT(*)::int AS count
      FROM "Ward"
      WHERE "geometrySource" = 'GBA_2025_DELIMITATION'
        AND (geom IS NULL OR NOT ST_IsValid(geom::geometry));
    `);

    const totalRes = await pool.query<{ count: number }>(`
      SELECT COUNT(*)::int AS count
      FROM "Ward"
      WHERE "geometrySource" = 'GBA_2025_DELIMITATION'
        AND "isLegacy" = false
        AND "isOperationalArea" = false;
    `);

    const report = {
      totalImportedWards: totalRes.rows[0]?.count ?? 0,
      countByCorporation: Object.fromEntries(corpCountsRes.rows.map((r) => [r.shortName, r.count])),
      expectedByCorporation: EXPECTED_CORP_COUNTS,
      missingWardNames: missingNames,
      missingGeometries: missingGeoms,
      invalidGeometriesCount: invalidGeomRes.rows[0]?.count ?? 0,
      duplicateIdentifiers: duplicateIds,
      legacyIssuesMigration: {
        totalChecked: legacyIssues.rows.length,
        mapped: mappedCount,
        ambiguousForReview: ambiguousCount,
        unmappedForReview: unmappedCount,
      },
    };

    console.log('=== GBA 369-WARD IMPORT VALIDATION REPORT ===');
    console.log(JSON.stringify(report, null, 2));
    return report;
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

if (require.main === module) {
  importGbaWards()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('GBA ward import failed:', err);
      process.exit(1);
    });
}
