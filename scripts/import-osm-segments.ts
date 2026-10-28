import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { Pool } from 'pg';
import crypto from 'crypto';

const rootDir = process.cwd();
if (fs.existsSync(path.join(rootDir, '.env'))) {
  dotenv.config({ path: path.join(rootDir, '.env') });
}
if (fs.existsSync(path.join(rootDir, '.env.local'))) {
  dotenv.config({ path: path.join(rootDir, '.env.local'), override: true });
}

interface OsmNode {
  type: 'node';
  id: number;
  lat: number;
  lon: number;
  tags?: Record<string, string>;
}

interface OsmWay {
  type: 'way';
  id: number;
  nodes?: number[];
  geometry?: Array<{ lat: number; lon: number }>;
  tags?: Record<string, string>;
}

type OsmElement = OsmNode | OsmWay;

function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export async function importOsmSegments(filePath?: string): Promise<{
  importedCount: number;
  nearSchoolHospitalCount: number;
  trackedCount: number;
}> {
  const jsonPath = filePath || path.join(rootDir, 'data', 'osm', 'pilot.json');
  if (!fs.existsSync(jsonPath)) {
    throw new Error(`OSM pilot data not found at ${jsonPath}. Run Overpass query first.`);
  }

  const raw = fs.readFileSync(jsonPath, 'utf-8');
  const data = JSON.parse(raw);
  const elements: OsmElement[] = data.elements || [];

  // 1. Collect POIs (schools, hospitals, clinics, colleges, universities)
  const schoolHospitalPois: Array<{ lat: number; lon: number; name?: string }> = [];
  for (const el of elements) {
    if (el.tags && el.tags.amenity) {
      const amenity = el.tags.amenity.toLowerCase();
      if (['school', 'hospital', 'clinic', 'college', 'university'].includes(amenity)) {
        if (el.type === 'node') {
          schoolHospitalPois.push({ lat: el.lat, lon: el.lon, name: el.tags.name });
        } else if (el.type === 'way' && el.geometry && el.geometry.length > 0) {
          const avgLat = el.geometry.reduce((acc, p) => acc + p.lat, 0) / el.geometry.length;
          const avgLon = el.geometry.reduce((acc, p) => acc + p.lon, 0) / el.geometry.length;
          schoolHospitalPois.push({ lat: avgLat, lon: avgLon, name: el.tags.name });
        }
      }
    }
  }

  console.log(`Found ${schoolHospitalPois.length} school/hospital POIs in pilot dataset.`);

  // 2. Filter highway ways with geometry points >= 2
  const roadWays = elements.filter(
    (el): el is OsmWay =>
      el.type === 'way' &&
      Boolean(el.tags && el.tags.highway) &&
      Boolean(el.geometry && el.geometry.length >= 2)
  );

  console.log(`Found ${roadWays.length} valid highway ways to import into RoadSegment.`);

  const connectionString = process.env.DIRECT_DATABASE_URL || process.env.APP_DATABASE_URL;
  const pool = new Pool({ connectionString });

  try {
    // Ensure unique index on osmWayId exists for idempotence
    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "idx_roadsegment_osm_way_id" ON "RoadSegment" ("osmWayId");
    `);

    let importedCount = 0;
    let nearSchoolHospitalCount = 0;
    let trackedCount = 0;

    const batchSize = 100;
    for (let i = 0; i < roadWays.length; i += batchSize) {
      const batch = roadWays.slice(i, i + batchSize);

      for (const way of batch) {
        const osmWayId = BigInt(way.id);
        const roadClass = way.tags!.highway!;
        const name = way.tags!.name || way.tags!['name:en'] || null;

        // Parse lanes or default based on classification
        let lanes: number | null = null;
        if (way.tags!.lanes) {
          const parsed = parseInt(way.tags!.lanes, 10);
          if (!isNaN(parsed) && parsed > 0) lanes = parsed;
        }
        if (!lanes) {
          if (['motorway', 'trunk'].includes(roadClass)) lanes = 3;
          else if (['primary', 'secondary'].includes(roadClass)) lanes = 2;
          else lanes = 1;
        }

        // Check if any point of the way is within 200m of a school or hospital
        let nearSchoolOrHospital = false;
        if (way.geometry && schoolHospitalPois.length > 0) {
          for (const poi of schoolHospitalPois) {
            for (const pt of way.geometry) {
              if (haversineM(pt.lat, pt.lon, poi.lat, poi.lon) <= 200) {
                nearSchoolOrHospital = true;
                break;
              }
            }
            if (nearSchoolOrHospital) break;
          }
        }
        if (nearSchoolOrHospital) nearSchoolHospitalCount++;

        // Track arterial / major roads for traffic sampling
        const tracked = ['motorway', 'trunk', 'primary', 'secondary'].includes(roadClass);
        if (tracked) trackedCount++;

        // Build GeoJSON LineString
        const geojsonLine = {
          type: 'LineString',
          coordinates: way.geometry!.map((pt) => [pt.lon, pt.lat]),
        };
        const geojsonStr = JSON.stringify(geojsonLine);

        const id = `seg_${way.id}_${crypto.randomBytes(3).toString('hex')}`;

        await pool.query(
          `
          INSERT INTO "RoadSegment" (
            "id",
            "osmWayId",
            "name",
            "roadClass",
            "lanes",
            "nearSchoolOrHospital",
            "tracked",
            "geom"
          )
          VALUES (
            $1,
            $2,
            $3,
            $4,
            $5,
            $6,
            $7,
            ST_SetSRID(ST_GeomFromGeoJSON($8), 4326)::geography
          )
          ON CONFLICT ("osmWayId") DO UPDATE
          SET "name" = EXCLUDED."name",
              "roadClass" = EXCLUDED."roadClass",
              "lanes" = EXCLUDED."lanes",
              "nearSchoolOrHospital" = EXCLUDED."nearSchoolOrHospital",
              "tracked" = EXCLUDED."tracked",
              "geom" = EXCLUDED."geom"
          `,
          [
            id,
            osmWayId.toString(),
            name,
            roadClass,
            lanes,
            nearSchoolOrHospital,
            tracked,
            geojsonStr,
          ]
        );

        importedCount++;
      }
    }

    // Link segments to Ward if spatial match exists
    await pool.query(`
      UPDATE "RoadSegment" s
      SET "wardId" = w.id
      FROM "Ward" w
      WHERE s."wardId" IS NULL
        AND s.geom IS NOT NULL
        AND w.geom IS NOT NULL
        AND ST_Covers(w.geom, ST_Centroid(s.geom::geometry)::geography);
    `);

    console.log(`Successfully imported ${importedCount} road segments!`);
    console.log(`Near school or hospital: ${nearSchoolHospitalCount}`);
    console.log(`Tracked arterial corridors: ${trackedCount}`);

    return { importedCount, nearSchoolHospitalCount, trackedCount };
  } finally {
    await pool.end();
  }
}

if (require.main === module || process.argv[1]?.endsWith('import-osm-segments.ts')) {
  importOsmSegments()
    .then((res) => {
      console.log('OSM segment import complete:', res);
      process.exit(0);
    })
    .catch((err) => {
      console.error('OSM segment import error:', err);
      process.exit(1);
    });
}
