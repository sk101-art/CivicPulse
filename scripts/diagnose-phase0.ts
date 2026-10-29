import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";

// Load .env then .env.local
const rootDir = process.cwd();
if (fs.existsSync(path.join(rootDir, ".env"))) {
  dotenv.config({ path: path.join(rootDir, ".env") });
}
if (fs.existsSync(path.join(rootDir, ".env.local"))) {
  dotenv.config({ path: path.join(rootDir, ".env.local"), override: true });
}

const connectionString = process.env.DIRECT_DATABASE_URL || process.env.APP_DATABASE_URL;
if (!connectionString) {
  throw new Error("Database connection URL (DIRECT_DATABASE_URL or APP_DATABASE_URL) is required.");
}

const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

interface FlowResponse {
  flowSegmentData?: {
    frc?: string;
    currentSpeed?: number;
    freeFlowSpeed?: number;
    currentTravelTime?: number;
    freeFlowTravelTime?: number;
    confidence?: number;
    roadClosure?: boolean;
    coordinates?: {
      coordinate?: Array<{ latitude: number; longitude: number }>;
    };
  };
}

interface RouteResponse {
  routes?: Array<{
    summary?: {
      lengthInMeters?: number;
      travelTimeInSeconds?: number;
      trafficDelayInSeconds?: number;
      trafficLengthInMeters?: number;
      departureTime?: string;
      arrivalTime?: string;
      noTrafficTravelTimeInSeconds?: number;
      historicTrafficTravelTimeInSeconds?: number;
      liveTrafficIncidentsTravelTimeInSeconds?: number;
    };
    legs?: Array<{
      points?: Array<{ latitude: number; longitude: number }>;
    }>;
  }>;
}

async function run() {
  console.log("=== Phase 0 Diagnosis Starting ===");
  const apiKey = process.env.TOMTOM_API_KEY;
  if (!apiKey) {
    console.error("ERROR: TOMTOM_API_KEY is not set in environment!");
    process.exit(1);
  }

  const pilotLat = 12.9575;
  const pilotLng = 77.7011;

  // 1. Hit TomTom Flow
  console.log("\n--- 1. Testing TomTom Flow API for pilot point (12.9575, 77.7011) ---");
  const flowUrl = `https://api.tomtom.com/traffic/services/4/flowSegmentData/absolute/10/json?key=${encodeURIComponent(apiKey)}&point=${pilotLat},${pilotLng}&unit=KMPH`;
  
  const flowStart = Date.now();
  const flowRes = await fetch(flowUrl);
  const flowDuration = Date.now() - flowStart;
  console.log(`Flow HTTP Status: ${flowRes.status} ${flowRes.statusText} (${flowDuration}ms)`);
  
  if (flowRes.ok) {
    const flowData = (await flowRes.json()) as FlowResponse;
    const seg = flowData?.flowSegmentData;
    console.log("Flow Response Fields:");
    console.log(` - frc (Functional Road Class): ${seg?.frc}`);
    console.log(` - currentSpeed: ${seg?.currentSpeed} km/h`);
    console.log(` - freeFlowSpeed: ${seg?.freeFlowSpeed} km/h`);
    console.log(` - currentTravelTime: ${seg?.currentTravelTime}s`);
    console.log(` - freeFlowTravelTime: ${seg?.freeFlowTravelTime}s`);
    console.log(` - confidence: ${seg?.confidence}`);
    console.log(` - roadClosure: ${seg?.roadClosure}`);
    console.log(` - coordinates points count: ${seg?.coordinates?.coordinate?.length ?? 0}`);
    if (seg?.coordinates?.coordinate && seg.coordinates.coordinate.length > 0) {
      const firstCoord = seg.coordinates.coordinate[0];
      const lastCoord = seg.coordinates.coordinate[seg.coordinates.coordinate.length - 1];
      console.log(`   * Coordinate start: (${firstCoord.latitude}, ${firstCoord.longitude})`);
      console.log(`   * Coordinate end:   (${lastCoord.latitude}, ${lastCoord.longitude})`);
    }
  } else {
    const errText = await flowRes.text();
    console.error(`Flow API Error response: ${errText.slice(0, 200)}`);
  }

  // 2. Hit TomTom Routing
  console.log("\n--- 2. Testing TomTom Routing API near pilot point ---");
  const originLat = 12.9565;
  const originLng = 77.7001;
  const destLat = 12.9585;
  const destLng = 77.7021;
  const routeUrl = `https://api.tomtom.com/routing/1/calculateRoute/${originLat},${originLng}:${destLat},${destLng}/json?key=${encodeURIComponent(apiKey)}&traffic=true&travelMode=car&language=en-IN&computeTravelTimeFor=all`;
  
  const routeStart = Date.now();
  const routeRes = await fetch(routeUrl);
  const routeDuration = Date.now() - routeStart;
  console.log(`Routing HTTP Status: ${routeRes.status} ${routeRes.statusText} (${routeDuration}ms)`);
  
  if (routeRes.ok) {
    const routeData = (await routeRes.json()) as RouteResponse;
    const summary = routeData?.routes?.[0]?.summary;
    console.log("Routing Summary Keys:", Object.keys(summary || {}));
    console.log("Routing Response Fields:");
    console.log(` - lengthInMeters: ${summary?.lengthInMeters}`);
    console.log(` - travelTimeInSeconds: ${summary?.travelTimeInSeconds}`);
    console.log(` - trafficDelayInSeconds: ${summary?.trafficDelayInSeconds}`);
    console.log(` - trafficLengthInMeters: ${summary?.trafficLengthInMeters}`);
    console.log(` - departureTime: ${summary?.departureTime}`);
    console.log(` - arrivalTime: ${summary?.arrivalTime}`);
    console.log(` - noTrafficTravelTimeInSeconds: ${summary?.noTrafficTravelTimeInSeconds}`);
    console.log(` - historicTrafficTravelTimeInSeconds: ${summary?.historicTrafficTravelTimeInSeconds}`);
    console.log(` - liveTrafficIncidentsTravelTimeInSeconds: ${summary?.liveTrafficIncidentsTravelTimeInSeconds}`);
    console.log(` - routes returned: ${routeData?.routes?.length ?? 0}`);
    console.log(` - legs points count: ${routeData?.routes?.[0]?.legs?.[0]?.points?.length ?? 0}`);
  } else {
    const errText = await routeRes.text();
    console.error(`Routing API Error response: ${errText.slice(0, 200)}`);
  }

  // 3. Database ApiUsage Count
  console.log("\n--- 3. ApiUsage Table Inspection ---");
  const usages = await prisma.apiUsage.findMany({
    orderBy: { month: "desc" },
  });
  console.log(`ApiUsage records found: ${usages.length}`);
  for (const u of usages) {
    console.log(` - Provider: ${u.provider}, Month: ${u.month}, Count: ${u.count}`);
  }

  // 4. Database TrafficSample Rows Inspection
  console.log("\n--- 4. TrafficSample Rows Inspection ---");
  const totalSamples = await prisma.trafficSample.count();
  console.log(`Total TrafficSample rows in database: ${totalSamples}`);

  const samples = await prisma.trafficSample.findMany({
    take: 10,
    orderBy: { sampledAt: "desc" },
  });
  console.log(`Most recent 10 samples:`);
  for (const s of samples) {
    console.log(` - ID: ${s.id}, issueId: ${s.issueId}, hourOfWeek: ${s.hourOfWeek}, speed: ${s.currentSpeed}/${s.freeFlowSpeed}, congestionR: ${s.congestionR}, isSeed: ${s.isSeed}`);
  }

  // Group by issueId across all samples
  const issueDistribution = await prisma.$queryRaw<Array<{ issueId: string | null; count: bigint }>>`
    SELECT "issueId", COUNT(*)::bigint as count 
    FROM "TrafficSample" 
    GROUP BY "issueId" 
    ORDER BY count DESC
  `.catch((err) => {
    console.log("Raw query issue distribution error:", err.message);
    return [];
  });

  console.log(`\nDistinct issues with traffic samples: ${issueDistribution.length}`);
  console.log("Top issues by sample count:");
  for (const row of issueDistribution.slice(0, 15)) {
    console.log(` - Issue ${row.issueId ?? "NULL"}: ${row.count} samples`);
  }

  // Group by hourOfWeek across all samples
  const allHourDist = await prisma.$queryRaw<Array<{ hourOfWeek: number; count: bigint }>>`
    SELECT "hourOfWeek", COUNT(*)::bigint as count 
    FROM "TrafficSample" 
    GROUP BY "hourOfWeek" 
    ORDER BY "hourOfWeek" ASC
  `.catch((err) => {
    console.log("Raw query not available or error:", err.message);
    return [];
  });

  console.log(`\nDistinct hourOfWeek buckets represented in DB: ${allHourDist.length} / 168`);
  console.log("Hour distribution breakdown:");
  for (const row of allHourDist) {
    console.log(` - HourOfWeek ${row.hourOfWeek}: ${row.count} samples`);
  }

  // Check how many issues exist
  const totalIssues = await prisma.issue.count();
  console.log(`\nTotal Issues in database: ${totalIssues}`);

  console.log("\n=== Phase 0 Diagnosis Completed ===");
  await prisma.$disconnect();
  await pool.end();
}

run().catch((e) => {
  console.error("FATAL in Phase 0 diagnosis:", e);
  process.exit(1);
});
