import { PrismaClient, Role, Tier, Category, Status, Band, SegmentEventType, AuditKind, AuditTaskStatus, AuditObserved, DeteriorationRisk, DayType, ProfileSource, EvidenceRole } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

const rootDir = process.cwd();
if (fs.existsSync(path.join(rootDir, '.env'))) {
  dotenv.config({ path: path.join(rootDir, '.env') });
}
if (fs.existsSync(path.join(rootDir, '.env.local'))) {
  dotenv.config({ path: path.join(rootDir, '.env.local'), override: true });
}

const connectionString = process.env.APP_DATABASE_URL || process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('Database connection URL (DATABASE_URL, DIRECT_DATABASE_URL, or APP_DATABASE_URL) is required.');
}

const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const AGENCIES = [
  { code: 'GBA', name: 'Greater Bengaluru Authority', slaHours: 72 },
  { code: 'BWSSB', name: 'Bengaluru Water Supply and Sewerage Board', slaHours: 48 },
  { code: 'BESCOM', name: 'Bangalore Electricity Supply Company', slaHours: 24 },
  { code: 'BTP', name: 'Bengaluru Traffic Police', slaHours: 24 },
  { code: 'BMRCL', name: 'Bangalore Metro Rail Corporation Limited', slaHours: 72 },
  { code: 'BDA', name: 'Bangalore Development Authority', slaHours: 72 },
  { code: 'OTHER', name: 'Other Public Agencies', slaHours: 72 },
];

export async function seedDemoData() {
  console.log('[Seed Demo] Initializing CivicPulse Demo Environment...');
  const now = new Date();
  const dayMs = 24 * 60 * 60 * 1000;
  const seedPassword = process.env.SEED_DESK_PASSWORD || 'password123';
  const hashedPassword = await bcrypt.hash(seedPassword, 10);

  // 1. Ensure Agencies
  const agencyMap: Record<string, string> = {};
  for (const agency of AGENCIES) {
    const record = await prisma.agency.upsert({
      where: { code: agency.code },
      update: { name: agency.name, slaHours: agency.slaHours },
      create: { code: agency.code, name: agency.name, slaHours: agency.slaHours },
    });
    agencyMap[agency.code] = record.id;
  }

  // 2. Ensure Users (Authority & Citizens)
  const deskA = await prisma.user.upsert({
    where: { email: 'desk-a@civicpulse.local' },
    update: { name: 'Desk Officer A', role: Role.AUTHORITY },
    create: { email: 'desk-a@civicpulse.local', name: 'Desk Officer A', passwordHash: hashedPassword, role: Role.AUTHORITY },
  });

  const deskB = await prisma.user.upsert({
    where: { email: 'desk-b@civicpulse.local' },
    update: { name: 'Desk Officer B', role: Role.AUTHORITY },
    create: { email: 'desk-b@civicpulse.local', name: 'Desk Officer B', passwordHash: hashedPassword, role: Role.AUTHORITY },
  });

  const citizenA = await prisma.user.upsert({
    where: { email: 'citizen@example.com' },
    update: { name: 'Aarav Patel (Alpha)', role: Role.CITIZEN },
    create: { email: 'citizen@example.com', name: 'Aarav Patel (Alpha)', passwordHash: hashedPassword, role: Role.CITIZEN },
  });

  const citizenB = await prisma.user.upsert({
    where: { email: 'citizen-b@civicpulse.local' },
    update: { name: 'Priya Sharma (Beta)', role: Role.CITIZEN, createdAt: new Date(now.getTime() - 48 * dayMs) },
    create: { email: 'citizen-b@civicpulse.local', name: 'Priya Sharma (Beta)', passwordHash: hashedPassword, role: Role.CITIZEN, createdAt: new Date(now.getTime() - 48 * dayMs) },
  });

  const citizenC = await prisma.user.upsert({
    where: { email: 'citizen-c@civicpulse.local' },
    update: { name: 'Kavita Rao (Gamma)', role: Role.CITIZEN, createdAt: new Date(now.getTime() - 15 * dayMs) },
    create: { email: 'citizen-c@civicpulse.local', name: 'Kavita Rao (Gamma)', passwordHash: hashedPassword, role: Role.CITIZEN, createdAt: new Date(now.getTime() - 15 * dayMs) },
  });

  await prisma.citizenProfile.upsert({
    where: { userId: citizenA.id },
    update: { tier: Tier.CITIZEN, reputation: 50, verified: true },
    create: { userId: citizenA.id, tier: Tier.CITIZEN, reputation: 50, verified: true },
  });

  await prisma.citizenProfile.upsert({
    where: { userId: citizenB.id },
    update: { tier: Tier.CONTRIBUTOR, reputation: 250, verified: true },
    create: { userId: citizenB.id, tier: Tier.CONTRIBUTOR, reputation: 250, verified: true },
  });

  await prisma.citizenProfile.upsert({
    where: { userId: citizenC.id },
    update: { tier: Tier.GUARDIAN, reputation: 600, verified: true },
    create: { userId: citizenC.id, tier: Tier.GUARDIAN, reputation: 600, verified: true },
  });

  // 3. Ensure ~10 segments with traffic samples along ORR corridor
  console.log('[Seed Demo] Seeding ~10 pilot road segments and traffic samples...');
  const pilotSegments = [
    { id: 'seed-seg-orr-kadubeesanahalli', name: 'Outer Ring Road (Kadubeesanahalli Section)', lanes: 6, buses: 48, speed: 22.5, freeFlow: 55.0 },
    { id: 'seed-demo-seg-marathahalli', name: 'Outer Ring Road (Marathahalli Bridge South)', lanes: 6, buses: 52, speed: 18.0, freeFlow: 50.0 },
    { id: 'seed-demo-seg-devarabeesanahalli', name: 'Outer Ring Road (Devarabeesanahalli Flyover)', lanes: 6, buses: 46, speed: 28.0, freeFlow: 60.0 },
    { id: 'seed-demo-seg-bellandur', name: 'Outer Ring Road (Bellandur Junction)', lanes: 8, buses: 60, speed: 12.0, freeFlow: 45.0 },
    { id: 'seed-demo-seg-ecospace', name: 'Outer Ring Road (Ecospace Tech Park Frontage)', lanes: 6, buses: 50, speed: 20.0, freeFlow: 50.0 },
    { id: 'seed-demo-seg-ibalur', name: 'Outer Ring Road (Ibalur Junction Flyover)', lanes: 6, buses: 44, speed: 16.5, freeFlow: 50.0 },
    { id: 'seed-demo-seg-sarjapur-ramp', name: 'Sarjapur Road - ORR Entry Ramp', lanes: 4, buses: 32, speed: 25.0, freeFlow: 45.0 },
    { id: 'seed-demo-seg-panathur-link', name: 'Panathur Main Road Link', lanes: 2, buses: 12, speed: 15.0, freeFlow: 35.0 },
    { id: 'seed-demo-seg-cessna-park', name: 'Cessna Business Park Access Road', roadClass: 'tertiary', lanes: 4, buses: 20, speed: 30.0, freeFlow: 40.0 },
    { id: 'seed-demo-seg-agara-lake', name: 'Agara Residential Access Road', roadClass: 'residential', lanes: 2, buses: 4, speed: 25.0, freeFlow: 30.0 },
  ];

  for (let i = 0; i < pilotSegments.length; i++) {
    const s = pilotSegments[i];
    const seg = await prisma.roadSegment.upsert({
      where: { id: s.id },
      update: {
        name: s.name,
        osmWayId: BigInt(99999000 + i),
        roadClass: (s as any).roadClass || 'primary',
        lanes: s.lanes,
        busesPerHour: s.buses,
        pedestrianEstimate: 100,
        tracked: true,
      },
      create: {
        id: s.id,
        name: s.name,
        osmWayId: BigInt(99999000 + i),
        roadClass: (s as any).roadClass || 'primary',
        lanes: s.lanes,
        busesPerHour: s.buses,
        pedestrianEstimate: 100,
        tracked: true,
      },
    });

    // Seed traffic sample for each segment
    const sampleTime = new Date(now.getTime() - 15 * 60 * 1000);
    const congestionR = s.freeFlow > 0 ? Math.max(0, (s.freeFlow - s.speed) / s.freeFlow) : 0;
    await prisma.trafficSample.create({
      data: {
        segmentId: seg.id,
        sampledAt: sampleTime,
        hourOfWeek: sampleTime.getDay() * 24 + sampleTime.getHours(),
        currentSpeed: s.speed,
        freeFlowSpeed: s.freeFlow,
        congestionR,
        confidence: 0.92,
        isSeed: true,
      },
    });
  }

  // 4. One road with a fix-then-fail history (Kadubeesanahalli segment)
  console.log('[Seed Demo] Seeding fix-then-fail history on Kadubeesanahalli segment...');
  const pilotSegmentId = 'seed-seg-orr-kadubeesanahalli';

  const pilotEvents = [
    {
      id: 'seed-evt-resurface-180d',
      segmentId: pilotSegmentId,
      type: SegmentEventType.RESURFACED,
      agency: 'Greater Bengaluru Authority (GBA)',
      contractor: 'Sri Lakshmi Infrastructure',
      workOrder: 'WO/GBA/2026/0411',
      source: 'OFFICIAL_RECORD',
      occurredAt: new Date(now.getTime() - 180 * dayMs),
      isSeed: true,
    },
    {
      id: 'seed-evt-roadcut-120d',
      segmentId: pilotSegmentId,
      type: SegmentEventType.ROAD_CUT,
      agency: 'Bengaluru Water Supply and Sewerage Board (BWSSB)',
      contractor: 'Cauvery Water Works',
      workOrder: 'BWSSB/UTILITY/9021',
      source: 'OFFICIAL_RECORD',
      occurredAt: new Date(now.getTime() - 120 * dayMs),
      isSeed: true,
    },
    {
      id: 'seed-evt-flood-90d',
      segmentId: pilotSegmentId,
      type: SegmentEventType.WATERLOGGED,
      agency: 'Greater Bengaluru Authority (GBA)',
      contractor: null,
      workOrder: null,
      source: 'MONSOON_AUDIT',
      occurredAt: new Date(now.getTime() - 90 * dayMs),
      isSeed: true,
    },
    {
      id: 'seed-evt-recurrence-7d',
      segmentId: pilotSegmentId,
      type: SegmentEventType.RECURRENCE,
      agency: 'Greater Bengaluru Authority (GBA)',
      contractor: 'Sri Lakshmi Infrastructure',
      workOrder: 'WO/GBA/2026/0411',
      source: 'SYSTEM_DETECTOR',
      occurredAt: new Date(now.getTime() - 7 * dayMs),
      isSeed: true,
    },
  ];

  for (const evt of pilotEvents) {
    await prisma.segmentEvent.upsert({
      where: { id: evt.id },
      update: {
        type: evt.type,
        agency: evt.agency,
        contractor: evt.contractor,
        workOrder: evt.workOrder,
        source: evt.source,
        occurredAt: evt.occurredAt,
        isSeed: true,
      },
      create: {
        id: evt.id,
        segmentId: evt.segmentId,
        type: evt.type,
        agency: evt.agency,
        contractor: evt.contractor,
        workOrder: evt.workOrder,
        source: evt.source,
        occurredAt: evt.occurredAt,
        isSeed: true,
      },
    });
  }

  // 4b. Seed Demo Wards
  console.log('[Seed Demo] Seeding demo wards...');
  const demoWards = [
    { id: 'seed-ward-bellandur', code: 'WARD-150', name: 'Bellandur (Demo)' },
    { id: 'seed-ward-mahadevapura', code: 'WARD-85', name: 'Mahadevapura (Demo)' },
    { id: 'seed-ward-marathahalli', code: 'WARD-84', name: 'Marathahalli (Demo)' },
  ];

  for (const w of demoWards) {
    await prisma.ward.upsert({
      where: { code: w.code },
      update: { name: w.name },
      create: { id: w.id, code: w.code, name: w.name },
    });
  }

  // 5. Seed issues across bands (CRITICAL, HIGH, MEDIUM, LOW)
  console.log('[Seed Demo] Seeding issues across bands (CRITICAL, HIGH, MEDIUM, LOW)...');
  const fixedIssueId = 'seed-issue-orr-fixed';
  const recurrenceIssueId = 'seed-issue-orr-recurrence';

  // HIGH band: resolved prior issue on Kadubeesanahalli
  const fixedIssue = await prisma.issue.upsert({
    where: { id: fixedIssueId },
    update: {
      category: Category.POTHOLES,
      status: Status.VERIFIED_FIXED,
      lat: 12.9360,
      lng: 77.6955,
      address: 'Outer Ring Road, Kadubeesanahalli Junction (Near Bus Bay)',
      priority: 78.0,
      band: Band.CRITICAL,
      agencyId: agencyMap['BWSSB'],
      segmentId: pilotSegmentId,
      wardId: 'seed-ward-mahadevapura',
      handoffCount: 1,
      createdAt: new Date(now.getTime() - 60 * dayMs),
      slaDueAt: new Date(now.getTime() - 55 * dayMs),
      isSeed: true,
    },
    create: {
      id: fixedIssueId,
      category: Category.POTHOLES,
      status: Status.VERIFIED_FIXED,
      lat: 12.9360,
      lng: 77.6955,
      address: 'Outer Ring Road, Kadubeesanahalli Junction (Near Bus Bay)',
      priority: 78.0,
      band: Band.CRITICAL,
      agencyId: agencyMap['BWSSB'],
      segmentId: pilotSegmentId,
      wardId: 'seed-ward-mahadevapura',
      handoffCount: 1,
      createdAt: new Date(now.getTime() - 60 * dayMs),
      slaDueAt: new Date(now.getTime() - 55 * dayMs),
      isSeed: true,
    },
  });

  // Action logs for fixedIssue
  const fixedLogs = [
    { action: 'CREATED', actorId: citizenA.id, toStatus: Status.OPEN, note: 'Citizen reported crater pothole in outer bus lane', createdAt: new Date(now.getTime() - 60 * dayMs) },
    { action: 'REASSIGN_AGENCY', actorId: deskA.id, note: 'Jurisdiction transferred: Reassigned from BESCOM to BWSSB following utility trench settlement', createdAt: new Date(now.getTime() - 50 * dayMs) },
    { action: 'CLAIM_FIX', actorId: deskA.id, fromStatus: Status.OPEN, toStatus: Status.CLAIMED_FIXED, note: 'Bitumen cold mix patch completed by Cauvery Water Works', createdAt: new Date(now.getTime() - 35 * dayMs) },
    { action: 'VERIFIED_FIX', actorId: citizenB.id, fromStatus: Status.CLAIMED_FIXED, toStatus: Status.VERIFIED_FIXED, note: 'Citizen verified fix: flush road surface restored and verified by dual citizen check', createdAt: new Date(now.getTime() - 30 * dayMs) },
  ];

  for (const log of fixedLogs) {
    const existing = await prisma.actionLog.findFirst({
      where: { issueId: fixedIssue.id, action: log.action },
    });
    if (!existing) {
      await prisma.actionLog.create({
        data: {
          issueId: fixedIssue.id,
          actorId: log.actorId,
          action: log.action,
          toStatus: log.toStatus,
          fromStatus: log.fromStatus,
          note: log.note,
          createdAt: log.createdAt,
        },
      });
    }
  }

  // Active recurrence issue (HIGH band)
  await prisma.issue.upsert({
    where: { id: recurrenceIssueId },
    update: {
      category: Category.POTHOLES,
      status: Status.OPEN,
      lat: 12.9361,
      lng: 77.6956,
      address: 'Outer Ring Road, Kadubeesanahalli Junction (Near Bus Bay)',
      priority: 88.0,
      band: Band.CRITICAL,
      agencyId: agencyMap['GBA'],
      segmentId: pilotSegmentId,
      wardId: 'seed-ward-bellandur',
      recurrenceOf: fixedIssue.id,
      deteriorationRisk: DeteriorationRisk.HIGH,
      deteriorationScore: 84,
      expectedDaysToWorsen: 3,
      isHotspot: true,
      lanePosition: 'CURB',
      deteriorationDrivers: [
        { name: 'Heavy rain: 38 mm past 7 d', impactScore: 28 },
        { name: 'High bus frequency: 45 buses/h', impactScore: 25 },
        { name: 'Stop-and-go braking: delay 62%', impactScore: 15 },
      ] as any,
      createdAt: new Date(now.getTime() - 7 * dayMs),
      slaDueAt: new Date(now.getTime() + 48 * 3600 * 1000),
      isSeed: true,
    },
    create: {
      id: recurrenceIssueId,
      category: Category.POTHOLES,
      status: Status.OPEN,
      lat: 12.9361,
      lng: 77.6956,
      address: 'Outer Ring Road, Kadubeesanahalli Junction (Near Bus Bay)',
      priority: 88.0,
      band: Band.CRITICAL,
      agencyId: agencyMap['GBA'],
      segmentId: pilotSegmentId,
      wardId: 'seed-ward-bellandur',
      recurrenceOf: fixedIssue.id,
      deteriorationRisk: DeteriorationRisk.HIGH,
      deteriorationScore: 84,
      expectedDaysToWorsen: 3,
      isHotspot: true,
      lanePosition: 'CURB',
      deteriorationDrivers: [
        { name: 'Heavy rain: 38 mm past 7 d', impactScore: 28 },
        { name: 'High bus frequency: 45 buses/h', impactScore: 25 },
        { name: 'Stop-and-go braking: delay 62%', impactScore: 15 },
      ] as any,
      createdAt: new Date(now.getTime() - 7 * dayMs),
      slaDueAt: new Date(now.getTime() + 48 * 3600 * 1000),
      isSeed: true,
    },
  });

  // CRITICAL band: severe waterlogging on Bellandur corridor
  await prisma.issue.upsert({
    where: { id: 'seed-demo-critical-bellandur' },
    update: {
      category: Category.WATERLOGGING,
      status: Status.OPEN,
      lat: 12.9280,
      lng: 77.6820,
      address: 'Outer Ring Road near Bellandur EcoWorld Junction',
      priority: 96.0,
      band: Band.CRITICAL,
      agencyId: agencyMap['BWSSB'],
      segmentId: 'seed-demo-seg-bellandur',
      wardId: 'seed-ward-bellandur',
      createdAt: new Date(now.getTime() - 2 * dayMs),
      slaDueAt: new Date(now.getTime() + 24 * 3600 * 1000),
      isSeed: true,
    },
    create: {
      id: 'seed-demo-critical-bellandur',
      category: Category.WATERLOGGING,
      status: Status.OPEN,
      lat: 12.9280,
      lng: 77.6820,
      address: 'Outer Ring Road near Bellandur EcoWorld Junction',
      priority: 96.0,
      band: Band.CRITICAL,
      agencyId: agencyMap['BWSSB'],
      segmentId: 'seed-demo-seg-bellandur',
      wardId: 'seed-ward-bellandur',
      createdAt: new Date(now.getTime() - 2 * dayMs),
      slaDueAt: new Date(now.getTime() + 24 * 3600 * 1000),
      isSeed: true,
    },
  });

  // MEDIUM band: streetlight outage on Cessna Park access road
  await prisma.issue.upsert({
    where: { id: 'seed-demo-medium-cessna' },
    update: {
      category: Category.STREETLIGHTS,
      status: Status.CONFIRMED,
      lat: 12.9390,
      lng: 77.6910,
      address: 'Cessna Business Park Main Access Corridor',
      priority: 48.0,
      band: Band.MEDIUM,
      agencyId: agencyMap['BESCOM'],
      segmentId: 'seed-demo-seg-cessna-park',
      wardId: 'seed-ward-mahadevapura',
      deteriorationRisk: DeteriorationRisk.MED,
      deteriorationScore: 52,
      expectedDaysToWorsen: 10,
      isHotspot: false,
      lanePosition: 'CENTER',
      deteriorationDrivers: [
        { name: 'Moderate moisture: 14 mm rain', impactScore: 15 },
        { name: 'Collector corridor bus traffic', impactScore: 12 },
      ] as any,
      createdAt: new Date(now.getTime() - 5 * dayMs),
      slaDueAt: new Date(now.getTime() + 18 * 3600 * 1000),
      isSeed: true,
    },
    create: {
      id: 'seed-demo-medium-cessna',
      category: Category.STREETLIGHTS,
      status: Status.CONFIRMED,
      lat: 12.9390,
      lng: 77.6910,
      address: 'Cessna Business Park Main Access Corridor',
      priority: 48.0,
      band: Band.MEDIUM,
      agencyId: agencyMap['BESCOM'],
      segmentId: 'seed-demo-seg-cessna-park',
      wardId: 'seed-ward-mahadevapura',
      deteriorationRisk: DeteriorationRisk.MED,
      deteriorationScore: 52,
      expectedDaysToWorsen: 10,
      isHotspot: false,
      lanePosition: 'CENTER',
      deteriorationDrivers: [
        { name: 'Moderate moisture: 14 mm rain', impactScore: 15 },
        { name: 'Collector corridor bus traffic', impactScore: 12 },
      ] as any,
      createdAt: new Date(now.getTime() - 5 * dayMs),
      slaDueAt: new Date(now.getTime() + 18 * 3600 * 1000),
      isSeed: true,
    },
  });

  // LOW band: faded lane signs on Agara Lake Section
  await prisma.issue.upsert({
    where: { id: 'seed-demo-low-agara' },
    update: {
      category: Category.TRAFFIC_SIGNS,
      status: Status.ASSIGNED,
      lat: 12.9210,
      lng: 77.6530,
      address: 'Outer Ring Road, Agara Lake Northbound Median',
      priority: 22.0,
      band: Band.LOW,
      agencyId: agencyMap['GBA'],
      segmentId: 'seed-demo-seg-agara-lake',
      wardId: 'seed-ward-bellandur',
      deteriorationRisk: DeteriorationRisk.LOW,
      deteriorationScore: 20,
      expectedDaysToWorsen: 21,
      isHotspot: false,
      lanePosition: 'SHOULDER',
      deteriorationDrivers: [
        { name: 'Standard residential roadbed wear', impactScore: 10 },
      ] as any,
      createdAt: new Date(now.getTime() - 10 * dayMs),
      slaDueAt: new Date(now.getTime() + 72 * 3600 * 1000),
      isSeed: true,
    },
    create: {
      id: 'seed-demo-low-agara',
      category: Category.TRAFFIC_SIGNS,
      status: Status.ASSIGNED,
      lat: 12.9210,
      lng: 77.6530,
      address: 'Outer Ring Road, Agara Lake Northbound Median',
      priority: 22.0,
      band: Band.LOW,
      agencyId: agencyMap['GBA'],
      segmentId: 'seed-demo-seg-agara-lake',
      wardId: 'seed-ward-bellandur',
      deteriorationRisk: DeteriorationRisk.LOW,
      deteriorationScore: 20,
      expectedDaysToWorsen: 21,
      isHotspot: false,
      lanePosition: 'SHOULDER',
      deteriorationDrivers: [
        { name: 'Standard residential roadbed wear', impactScore: 10 },
      ] as any,
      createdAt: new Date(now.getTime() - 10 * dayMs),
      slaDueAt: new Date(now.getTime() + 72 * 3600 * 1000),
      isSeed: true,
    },
  });

  // 4. Track B Blind Repair Audit Seeds
  console.log('[Seed Demo] Seeding Track B Blind Repair Audit demo scenarios...');

  // Scenario 1: One claimed fix with open audit tasks
  const claimedAuditIssue = await prisma.issue.upsert({
    where: { id: 'seed-demo-claimed-audit' },
    update: {
      category: Category.POTHOLES,
      status: Status.CLAIMED_FIXED,
      lat: 12.9355,
      lng: 77.6890,
      address: 'Outer Ring Road near Ecospace East Gate',
      priority: 68.5,
      band: Band.HIGH,
      agencyId: agencyMap['GBA'],
      segmentId: 'seed-demo-seg-ecospace',
      wardId: 'seed-ward-marathahalli',
      repairClaimedAt: new Date(now.getTime() - 4 * 3600 * 1000),
      warrantyUntil: new Date(now.getTime() + 365 * dayMs),
      contractorName: 'Cauvery Infrastructure Ltd.',
      tenderId: 'BBMP/EE/RRD/2026-27/W-4192',
      isSeed: true,
      slaDueAt: new Date(now.getTime() + 24 * 3600 * 1000),
    },
    create: {
      id: 'seed-demo-claimed-audit',
      category: Category.POTHOLES,
      status: Status.CLAIMED_FIXED,
      lat: 12.9355,
      lng: 77.6890,
      address: 'Outer Ring Road near Ecospace East Gate',
      priority: 68.5,
      band: Band.HIGH,
      agencyId: agencyMap['GBA'],
      segmentId: 'seed-demo-seg-ecospace',
      wardId: 'seed-ward-marathahalli',
      repairClaimedAt: new Date(now.getTime() - 4 * 3600 * 1000),
      warrantyUntil: new Date(now.getTime() + 365 * dayMs),
      contractorName: 'Cauvery Infrastructure Ltd.',
      tenderId: 'BBMP/EE/RRD/2026-27/W-4192',
      isSeed: true,
      slaDueAt: new Date(now.getTime() + 24 * 3600 * 1000),
    },
  });

  // Create 3 open audit tasks assigned to the 3 demo citizens
  const citizens = [citizenA, citizenB, citizenC];
  for (let i = 0; i < 3; i++) {
    const taskId = `seed-audit-task-${i + 1}`;
    await prisma.auditTask.upsert({
      where: { id: taskId },
      update: {
        issueId: claimedAuditIssue.id,
        assigneeId: citizens[i].id,
        kind: AuditKind.CLAIM_CHECK,
        dueAt: new Date(now.getTime() + 44 * 3600 * 1000),
        challengeBearingDeg: (45 * (i + 1) * 2) % 360,
        challengeNonce: `seed-nonce-challenge-${i + 1}`,
        status: AuditTaskStatus.OPEN,
        isSeed: true,
      },
      create: {
        id: taskId,
        issueId: claimedAuditIssue.id,
        assigneeId: citizens[i].id,
        kind: AuditKind.CLAIM_CHECK,
        dueAt: new Date(now.getTime() + 44 * 3600 * 1000),
        challengeBearingDeg: (45 * (i + 1) * 2) % 360,
        challengeNonce: `seed-nonce-challenge-${i + 1}`,
        status: AuditTaskStatus.OPEN,
        isSeed: true,
      },
    });
  }

  // Scenario 2: One REOPENED_IN_WARRANTY issue with a liability package
  const reopenedWarrantyIssue = await prisma.issue.upsert({
    where: { id: 'seed-demo-reopened-warranty' },
    update: {
      category: Category.ROAD_CUT,
      status: Status.REOPENED_IN_WARRANTY,
      lat: 12.9280,
      lng: 77.6780,
      address: 'Outer Ring Road, Bellandur South Underpass',
      priority: 82.0,
      band: Band.CRITICAL,
      agencyId: agencyMap['BWSSB'],
      segmentId: 'seed-demo-seg-bellandur',
      wardId: 'seed-ward-bellandur',
      repairClaimedAt: new Date(now.getTime() - 45 * dayMs),
      warrantyUntil: new Date(now.getTime() + 320 * dayMs),
      contractorName: 'Cauvery Infrastructure Ltd.',
      tenderId: 'BBMP/EE/RRD/2026-27/W-4192',
      lifespanDays: 42,
      isSeed: true,
      slaDueAt: new Date(now.getTime() + 12 * 3600 * 1000),
    },
    create: {
      id: 'seed-demo-reopened-warranty',
      category: Category.ROAD_CUT,
      status: Status.REOPENED_IN_WARRANTY,
      lat: 12.9280,
      lng: 77.6780,
      address: 'Outer Ring Road, Bellandur South Underpass',
      priority: 82.0,
      band: Band.CRITICAL,
      agencyId: agencyMap['BWSSB'],
      segmentId: 'seed-demo-seg-bellandur',
      wardId: 'seed-ward-bellandur',
      repairClaimedAt: new Date(now.getTime() - 45 * dayMs),
      warrantyUntil: new Date(now.getTime() + 320 * dayMs),
      contractorName: 'Cauvery Infrastructure Ltd.',
      tenderId: 'BBMP/EE/RRD/2026-27/W-4192',
      lifespanDays: 42,
      isSeed: true,
      slaDueAt: new Date(now.getTime() + 12 * 3600 * 1000),
    },
  });

  // Seed durability task & votes for the reopened warranty issue
  const durabilityTaskId = 'seed-durability-task-bellandur';
  const durabilityTask = await prisma.auditTask.upsert({
    where: { id: durabilityTaskId },
    update: {
      issueId: reopenedWarrantyIssue.id,
      assigneeId: citizenA.id,
      kind: AuditKind.DURABILITY,
      dueAt: new Date(now.getTime() - 2 * dayMs),
      challengeBearingDeg: 180,
      challengeNonce: 'seed-nonce-durability-done',
      status: AuditTaskStatus.DONE,
      completedAt: new Date(now.getTime() - 3 * dayMs),
      isSeed: true,
    },
    create: {
      id: durabilityTaskId,
      issueId: reopenedWarrantyIssue.id,
      assigneeId: citizenA.id,
      kind: AuditKind.DURABILITY,
      dueAt: new Date(now.getTime() - 2 * dayMs),
      challengeBearingDeg: 180,
      challengeNonce: 'seed-nonce-durability-done',
      status: AuditTaskStatus.DONE,
      completedAt: new Date(now.getTime() - 3 * dayMs),
      isSeed: true,
    },
  });

  // Seed audit vote indicating DAMAGED
  await prisma.auditVote.upsert({
    where: {
      taskId_userId: { taskId: durabilityTask.id, userId: citizenA.id },
    },
    update: {
      observed: AuditObserved.DAMAGED,
      weight: 1.0,
      createdAt: new Date(now.getTime() - 3 * dayMs),
    },
    create: {
      id: 'seed-vote-durability-damaged-1',
      taskId: durabilityTask.id,
      userId: citizenA.id,
      observed: AuditObserved.DAMAGED,
      weight: 1.0,
      createdAt: new Date(now.getTime() - 3 * dayMs),
    },
  });

  // 9. Seed Evidence Reports & Action Logs for Demo Issues
  console.log('[Seed Demo] Seeding evidence reports and realistic action logs for demo issues...');
  const demoIssuesEnrichment = [
    {
      issueId: 'seed-demo-critical-bellandur',
      photoUrl: 'https://images.unsplash.com/photo-1517649763962-0c623266ddc0?w=800&auto=format&fit=crop&q=60',
      note: 'Severe waterlogging blocking outer corridor lanes near EcoWorld (demo)',
      lat: 12.9280,
      lng: 77.6820,
      reporterId: citizenA.id,
      logs: [
        { action: 'REPORTED', actorId: citizenA.id, toStatus: Status.OPEN, timeAgoMs: 2 * dayMs, note: 'Citizen reported severe waterlogging' },
        { action: 'CONFIRM', actorId: deskA.id, fromStatus: Status.OPEN, toStatus: Status.CONFIRMED, timeAgoMs: 1.8 * dayMs, note: 'Confirmed critical priority by Desk A' },
        { action: 'ASSIGN', actorId: deskA.id, fromStatus: Status.CONFIRMED, toStatus: Status.ASSIGNED, timeAgoMs: 1.5 * dayMs, note: 'Assigned to BWSSB Stormwater Division' },
      ],
    },
    {
      issueId: 'seed-demo-medium-cessna',
      photoUrl: 'https://images.unsplash.com/photo-1507034589631-9433cc6bc453?w=800&auto=format&fit=crop&q=60',
      note: 'Multiple dark streetlights along Cessna access corridor (demo)',
      lat: 12.9390,
      lng: 77.6910,
      reporterId: citizenB.id,
      logs: [
        { action: 'REPORTED', actorId: citizenB.id, toStatus: Status.OPEN, timeAgoMs: 5 * dayMs, note: 'Citizen reported outage' },
        { action: 'CONFIRM', actorId: deskB.id, fromStatus: Status.OPEN, toStatus: Status.CONFIRMED, timeAgoMs: 4.8 * dayMs, note: 'Defect confirmed by Desk B' },
        { action: 'ASSIGN', actorId: deskB.id, fromStatus: Status.CONFIRMED, toStatus: Status.ASSIGNED, timeAgoMs: 4 * dayMs, note: 'Assigned to BESCOM electrical division' },
      ],
    },
    {
      issueId: 'seed-demo-low-agara',
      photoUrl: 'https://images.unsplash.com/photo-1584438784894-089d6a62b8fa?w=800&auto=format&fit=crop&q=60',
      note: 'Damaged traffic signage on Agara residential section (demo)',
      lat: 12.9210,
      lng: 77.6530,
      reporterId: citizenC.id,
      logs: [
        { action: 'REPORTED', actorId: citizenC.id, toStatus: Status.OPEN, timeAgoMs: 10 * dayMs, note: 'Citizen reported signage damage' },
        { action: 'CONFIRM', actorId: deskA.id, fromStatus: Status.OPEN, toStatus: Status.CONFIRMED, timeAgoMs: 9.5 * dayMs, note: 'Confirmed by Desk A' },
        { action: 'ASSIGN', actorId: deskA.id, fromStatus: Status.CONFIRMED, toStatus: Status.ASSIGNED, timeAgoMs: 8 * dayMs, note: 'Assigned to GBA signage crew' },
      ],
    },
    {
      issueId: 'seed-demo-claimed-audit',
      photoUrl: 'https://images.unsplash.com/photo-1515162816999-a0c47dc192f7?w=800&auto=format&fit=crop&q=60',
      note: 'Deep asphalt pothole near Ecospace East Gate (demo)',
      lat: 12.9355,
      lng: 77.6890,
      reporterId: citizenA.id,
      logs: [
        { action: 'REPORTED', actorId: citizenA.id, toStatus: Status.OPEN, timeAgoMs: 4 * dayMs, note: 'Citizen reported pothole' },
        { action: 'CONFIRM', actorId: deskA.id, fromStatus: Status.OPEN, toStatus: Status.CONFIRMED, timeAgoMs: 3.5 * dayMs, note: 'Confirmed by Desk A' },
        { action: 'ASSIGN', actorId: deskA.id, fromStatus: Status.CONFIRMED, toStatus: Status.ASSIGNED, timeAgoMs: 3 * dayMs, note: 'Assigned to Cauvery Infrastructure Ltd.' },
        { action: 'CLAIM_FIX', actorId: deskA.id, fromStatus: Status.ASSIGNED, toStatus: Status.CLAIMED_FIXED, timeAgoMs: 4 * 3600 * 1000, note: 'Cauvery Infrastructure claimed asphalt patch fix' },
        { action: 'DISPATCH_AUDIT', actorId: deskA.id, timeAgoMs: 3.5 * 3600 * 1000, note: 'Dispatched 3 blind citizen audit tasks' },
        { action: 'AUDIT_DECISION', actorId: deskA.id, timeAgoMs: 1 * 3600 * 1000, note: 'Blind citizen audit consensus evaluated: 2 damaged votes recorded. Inspector dispatch recommended.' },
      ],
    },
    {
      issueId: 'seed-demo-reopened-warranty',
      photoUrl: 'https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?w=800&auto=format&fit=crop&q=60',
      note: 'Subsiding road cut trench along Bellandur Underpass (demo)',
      lat: 12.9280,
      lng: 77.6780,
      reporterId: citizenA.id,
      logs: [
        { action: 'REPORTED', actorId: citizenA.id, toStatus: Status.OPEN, timeAgoMs: 50 * dayMs, note: 'Citizen reported initial road cut' },
        { action: 'CONFIRM', actorId: deskB.id, fromStatus: Status.OPEN, toStatus: Status.CONFIRMED, timeAgoMs: 49 * dayMs, note: 'Confirmed by Desk B' },
        { action: 'CLAIM_FIX', actorId: deskB.id, fromStatus: Status.ASSIGNED, toStatus: Status.CLAIMED_FIXED, timeAgoMs: 45 * dayMs, note: 'Cauvery Infrastructure claimed road reinstatement' },
        { action: 'VERIFY_FIX', actorId: deskB.id, fromStatus: Status.CLAIMED_FIXED, toStatus: Status.VERIFIED_FIXED, timeAgoMs: 44 * dayMs, note: 'Repair verified and 365-day warranty registered' },
        { action: 'REOPEN', actorId: deskB.id, fromStatus: Status.VERIFIED_FIXED, toStatus: Status.REOPENED_IN_WARRANTY, timeAgoMs: 1 * dayMs, note: 'Pavement subsiding within warranty period. Reopened under warranty.' },
      ],
    },
  ];

  for (const item of demoIssuesEnrichment) {
    // 1. Evidence Report
    await prisma.report.upsert({
      where: { id: `report-${item.issueId}` },
      update: {
        photoUrl: item.photoUrl,
        note: item.note,
        isSeed: true,
        role: EvidenceRole.REPORT,
      },
      create: {
        id: `report-${item.issueId}`,
        issueId: item.issueId,
        userId: item.reporterId,
        role: EvidenceRole.REPORT,
        photoUrl: item.photoUrl,
        photoSha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        signature: 'demo-signature-verified',
        lat: item.lat,
        lng: item.lng,
        gpsAccuracyM: 3.5,
        capturedAt: new Date(now.getTime() - 2 * dayMs),
        note: item.note,
        isSeed: true,
      },
    });

    // 2. Action Logs
    for (const l of item.logs) {
      const existing = await prisma.actionLog.findFirst({
        where: {
          issueId: item.issueId,
          action: l.action,
          actorId: l.actorId,
        },
      });
      if (!existing) {
        await prisma.actionLog.create({
          data: {
            issueId: item.issueId,
            actorId: l.actorId,
            action: l.action,
            note: l.note,
            fromStatus: l.fromStatus,
            toStatus: l.toStatus,
            createdAt: new Date(now.getTime() - l.timeAgoMs),
          },
        });
      }
    }
  }

  // 10. Seed Completed Claims for Claim-Gap & Lifespan Scorecards
  console.log('[Seed Demo] Seeding completed claim-gap audits across demo wards...');

  interface SeedClaimDef {
    id: string;
    wardId: string;
    contractorName: string;
    category: Category;
    address: string;
    lat: number;
    lng: number;
    daysAgoClaimed: number;
    lifespanDays?: number;
    status: Status;
    hoursToVerify?: number;
    verifier: typeof citizenB;
  }

  const demoClaims: SeedClaimDef[] = [
    // Bellandur (Demo) — Cauvery Infrastructure Ltd. (Demo)
    { id: 'seed-claim-blr-1', wardId: 'seed-ward-bellandur', contractorName: 'Cauvery Infrastructure Ltd. (Demo)', category: Category.POTHOLES, address: 'Sarjapur-ORR Junction', lat: 12.9260, lng: 77.6770, daysAgoClaimed: 18, hoursToVerify: 34, lifespanDays: 140, status: Status.VERIFIED_FIXED, verifier: citizenB },
    { id: 'seed-claim-blr-2', wardId: 'seed-ward-bellandur', contractorName: 'Cauvery Infrastructure Ltd. (Demo)', category: Category.DRAINAGE, address: 'Bellandur Central Flyover', lat: 12.9295, lng: 77.6810, daysAgoClaimed: 14, hoursToVerify: 28, lifespanDays: 160, status: Status.VERIFIED_FIXED, verifier: citizenB },
    { id: 'seed-claim-blr-3', wardId: 'seed-ward-bellandur', contractorName: 'Cauvery Infrastructure Ltd. (Demo)', category: Category.POTHOLES, address: 'Green Glen Layout Access', lat: 12.9310, lng: 77.6740, daysAgoClaimed: 10, hoursToVerify: 42, lifespanDays: 120, status: Status.VERIFIED_FIXED, verifier: citizenC },
    { id: 'seed-claim-blr-4', wardId: 'seed-ward-bellandur', contractorName: 'Cauvery Infrastructure Ltd. (Demo)', category: Category.ROAD_CUT, address: 'Outer Ring Road Sector 2', lat: 12.9340, lng: 77.6850, daysAgoClaimed: 7, hoursToVerify: 30, lifespanDays: 180, status: Status.VERIFIED_FIXED, verifier: citizenB },
    { id: 'seed-claim-blr-5', wardId: 'seed-ward-bellandur', contractorName: 'Cauvery Infrastructure Ltd. (Demo)', category: Category.POTHOLES, address: 'Kaverappa Layout Service Road', lat: 12.9348, lng: 77.6925, daysAgoClaimed: 12, hoursToVerify: 22, status: Status.DISPUTED, verifier: citizenC },
    { id: 'seed-claim-blr-6', wardId: 'seed-ward-bellandur', contractorName: 'Cauvery Infrastructure Ltd. (Demo)', category: Category.ROAD_CUT, address: 'Bellandur South Underpass Service Road', lat: 12.9282, lng: 77.6784, daysAgoClaimed: 22, hoursToVerify: 26, lifespanDays: 42, status: Status.REOPENED_IN_WARRANTY, verifier: citizenC },

    // Mahadevapura (Demo) — Southern Asphalt Works (Demo)
    { id: 'seed-claim-mdp-1', wardId: 'seed-ward-mahadevapura', contractorName: 'Southern Asphalt Works (Demo)', category: Category.POTHOLES, address: 'Whitefield Main Road near Metro', lat: 12.9860, lng: 77.7120, daysAgoClaimed: 20, hoursToVerify: 22, lifespanDays: 95, status: Status.VERIFIED_FIXED, verifier: citizenB },
    { id: 'seed-claim-mdp-2', wardId: 'seed-ward-mahadevapura', contractorName: 'Southern Asphalt Works (Demo)', category: Category.DRAINAGE, address: 'ITPL Main Road Junction', lat: 12.9890, lng: 77.7200, daysAgoClaimed: 15, hoursToVerify: 24, lifespanDays: 110, status: Status.VERIFIED_FIXED, verifier: citizenB },
    { id: 'seed-claim-mdp-3', wardId: 'seed-ward-mahadevapura', contractorName: 'Southern Asphalt Works (Demo)', category: Category.POTHOLES, address: 'Hoodi Circle North', lat: 12.9920, lng: 77.7150, daysAgoClaimed: 11, hoursToVerify: 26, lifespanDays: 105, status: Status.VERIFIED_FIXED, verifier: citizenB },
    { id: 'seed-claim-mdp-4', wardId: 'seed-ward-mahadevapura', contractorName: 'Southern Asphalt Works (Demo)', category: Category.ROAD_CUT, address: 'Garudacharpalya Service Lane', lat: 12.9830, lng: 77.7050, daysAgoClaimed: 8, hoursToVerify: 28, lifespanDays: 125, status: Status.VERIFIED_FIXED, verifier: citizenB },
    { id: 'seed-claim-mdp-5', wardId: 'seed-ward-mahadevapura', contractorName: 'Southern Asphalt Works (Demo)', category: Category.POTHOLES, address: 'Seetharampalya Underpass', lat: 12.9810, lng: 77.7020, daysAgoClaimed: 16, hoursToVerify: 18, status: Status.DISPUTED, verifier: citizenC },
    { id: 'seed-claim-mdp-6', wardId: 'seed-ward-mahadevapura', contractorName: 'Southern Asphalt Works (Demo)', category: Category.POTHOLES, address: 'Mahadevapura Ring Road Crossing', lat: 12.9870, lng: 77.7080, daysAgoClaimed: 9, hoursToVerify: 20, status: Status.DISPUTED, verifier: citizenC },
    { id: 'seed-claim-mdp-7', wardId: 'seed-ward-mahadevapura', contractorName: 'Southern Asphalt Works (Demo)', category: Category.DRAINAGE, address: 'Channasandra Main Road', lat: 12.9950, lng: 77.7250, daysAgoClaimed: 2, status: Status.CLAIMED_FIXED, verifier: citizenB },

    // Marathahalli (Demo) — Apex Urban Build (Demo)
    { id: 'seed-claim-mrh-1', wardId: 'seed-ward-marathahalli', contractorName: 'Apex Urban Build (Demo)', category: Category.POTHOLES, address: 'Marathahalli Bridge Eastbound', lat: 12.9560, lng: 77.6980, daysAgoClaimed: 21, hoursToVerify: 16, lifespanDays: 240, status: Status.VERIFIED_FIXED, verifier: citizenB },
    { id: 'seed-claim-mrh-2', wardId: 'seed-ward-marathahalli', contractorName: 'Apex Urban Build (Demo)', category: Category.DRAINAGE, address: 'Varthur Road Cross', lat: 12.9540, lng: 77.7020, daysAgoClaimed: 17, hoursToVerify: 18, lifespanDays: 260, status: Status.VERIFIED_FIXED, verifier: citizenB },
    { id: 'seed-claim-mrh-3', wardId: 'seed-ward-marathahalli', contractorName: 'Apex Urban Build (Demo)', category: Category.POTHOLES, address: 'HAL Airport Road Junction', lat: 12.9580, lng: 77.6950, daysAgoClaimed: 13, hoursToVerify: 15, lifespanDays: 280, status: Status.VERIFIED_FIXED, verifier: citizenB },
    { id: 'seed-claim-mrh-4', wardId: 'seed-ward-marathahalli', contractorName: 'Apex Urban Build (Demo)', category: Category.ROAD_CUT, address: 'Kalamandir Service Road', lat: 12.9520, lng: 77.6990, daysAgoClaimed: 9, hoursToVerify: 20, lifespanDays: 250, status: Status.VERIFIED_FIXED, verifier: citizenB },
    { id: 'seed-claim-mrh-5', wardId: 'seed-ward-marathahalli', contractorName: 'Apex Urban Build (Demo)', category: Category.POTHOLES, address: 'Munnekollal Main Road', lat: 12.9500, lng: 77.7050, daysAgoClaimed: 5, hoursToVerify: 19, lifespanDays: 300, status: Status.VERIFIED_FIXED, verifier: citizenB },
    { id: 'seed-claim-mrh-6', wardId: 'seed-ward-marathahalli', contractorName: 'Apex Urban Build (Demo)', category: Category.DRAINAGE, address: 'Spice Garden Junction', lat: 12.9480, lng: 77.7080, daysAgoClaimed: 1, status: Status.CLAIMED_FIXED, verifier: citizenB },
  ];

  for (const c of demoClaims) {
    const claimedDate = new Date(now.getTime() - c.daysAgoClaimed * dayMs);
    const verifyDate = c.hoursToVerify ? new Date(claimedDate.getTime() + c.hoursToVerify * 3600 * 1000) : undefined;

    // 1. Issue
    await prisma.issue.upsert({
      where: { id: c.id },
      update: {
        category: c.category,
        status: c.status,
        address: c.address,
        lat: c.lat,
        lng: c.lng,
        wardId: c.wardId,
        contractorName: c.contractorName,
        tenderId: `DEMO-TENDER-${c.wardId.toUpperCase()}`,
        lifespanDays: c.lifespanDays,
        repairClaimedAt: claimedDate,
        warrantyUntil: new Date(claimedDate.getTime() + 365 * dayMs),
        priority: 50,
        band: Band.MEDIUM,
        agencyId: agencyMap['GBA'],
        isSeed: true,
        slaDueAt: new Date(claimedDate.getTime() + 48 * 3600 * 1000),
      },
      create: {
        id: c.id,
        category: c.category,
        status: c.status,
        address: c.address,
        lat: c.lat,
        lng: c.lng,
        wardId: c.wardId,
        contractorName: c.contractorName,
        tenderId: `DEMO-TENDER-${c.wardId.toUpperCase()}`,
        lifespanDays: c.lifespanDays,
        repairClaimedAt: claimedDate,
        warrantyUntil: new Date(claimedDate.getTime() + 365 * dayMs),
        priority: 50,
        band: Band.MEDIUM,
        agencyId: agencyMap['GBA'],
        isSeed: true,
        slaDueAt: new Date(claimedDate.getTime() + 48 * 3600 * 1000),
      },
    });

    // 2. ActionLog: CLAIM_FIX (created if not exists)
    const claimLogId = `seed-act-claim-${c.id}`;
    const existingClaimLog = await prisma.actionLog.findUnique({ where: { id: claimLogId } });
    if (!existingClaimLog) {
      await prisma.actionLog.create({
        data: {
          id: claimLogId,
          issueId: c.id,
          action: 'CLAIM_FIX',
          actorId: deskA.id,
          fromStatus: Status.OPEN,
          toStatus: Status.CLAIMED_FIXED,
          note: `Contractor repair completed: ${c.contractorName}`,
          createdAt: claimedDate,
        },
      });
    }

    // 3. If verified or disputed, create Verification, ActionLog, AuditTask, and AuditVote
    if (verifyDate && (c.status === Status.VERIFIED_FIXED || c.status === Status.DISPUTED || c.status === Status.REOPENED_IN_WARRANTY)) {
      const isFixed = c.status === Status.VERIFIED_FIXED;
      const verdict = isFixed ? 'FIXED' : 'NOT_FIXED';
      const auditAction = isFixed ? 'VERIFY_FIX' : 'DISPUTE_FIX';

      // Verification
      const verifId = `seed-verif-${c.id}`;
      const existingVerif = await prisma.verification.findUnique({ where: { id: verifId } });
      if (!existingVerif) {
        await prisma.verification.create({
          data: {
            id: verifId,
            issueId: c.id,
            verifierId: c.verifier.id,
            reportId: `seed-rep-${c.id}`,
            verdict,
            weight: 1.0,
            createdAt: verifyDate,
          },
        });
      }

      // ActionLog: VERIFY_FIX or DISPUTE_FIX
      const auditActLogId = `seed-act-${auditAction.toLowerCase()}-${c.id}`;
      const existingAuditActLog = await prisma.actionLog.findUnique({ where: { id: auditActLogId } });
      if (!existingAuditActLog) {
        await prisma.actionLog.create({
          data: {
            id: auditActLogId,
            issueId: c.id,
            action: auditAction as any,
            actorId: deskA.id,
            fromStatus: Status.CLAIMED_FIXED,
            toStatus: c.status,
            note: isFixed ? 'Citizen blind audit accepted fix.' : 'Citizen blind audit disputed repair quality.',
            createdAt: verifyDate,
          },
        });
      }

      // AuditTask
      const taskId = `seed-task-${c.id}`;
      await prisma.auditTask.upsert({
        where: { id: taskId },
        update: {
          issueId: c.id,
          assigneeId: c.verifier.id,
          kind: AuditKind.CLAIM_CHECK,
          status: AuditTaskStatus.DONE,
          completedAt: verifyDate,
          isSeed: true,
        },
        create: {
          id: taskId,
          issueId: c.id,
          assigneeId: c.verifier.id,
          kind: AuditKind.CLAIM_CHECK,
          dueAt: new Date(claimedDate.getTime() + 48 * 3600 * 1000),
          challengeBearingDeg: 90,
          challengeNonce: `nonce-${c.id}`,
          status: AuditTaskStatus.DONE,
          completedAt: verifyDate,
          isSeed: true,
        },
      });

      // AuditVote
      const voteId = `seed-vote-${c.id}`;
      await prisma.auditVote.upsert({
        where: { taskId_userId: { taskId, userId: c.verifier.id } },
        update: {
          observed: isFixed ? AuditObserved.INTACT : AuditObserved.DAMAGED,
          weight: 1.0,
          createdAt: verifyDate,
        },
        create: {
          id: voteId,
          taskId,
          userId: c.verifier.id,
          observed: isFixed ? AuditObserved.INTACT : AuditObserved.DAMAGED,
          weight: 1.0,
          createdAt: verifyDate,
        },
      });
    }
  }

  // 11. Ensure all issues in the DB are assigned to a pilot ward
  const unassignedIssues = await prisma.issue.findMany({
    where: { wardId: null },
    select: { id: true, lat: true, lng: true },
  });
  if (unassignedIssues.length > 0) {
    console.log(`[Seed Demo] Assigning ${unassignedIssues.length} unassigned issues to nearest pilot wards...`);
    const WARD_CENTERS = [
      { id: 'seed-ward-bellandur', lat: 12.9280, lng: 77.6820 },
      { id: 'seed-ward-marathahalli', lat: 12.9560, lng: 77.6980 },
      { id: 'seed-ward-mahadevapura', lat: 12.9860, lng: 77.7120 },
    ];
    for (const iss of unassignedIssues) {
      let nearestWardId = WARD_CENTERS[0].id;
      let minDist = Infinity;
      for (const w of WARD_CENTERS) {
        const d = (iss.lat - w.lat) ** 2 + (iss.lng - w.lng) ** 2;
        if (d < minDist) {
          minDist = d;
          nearestWardId = w.id;
        }
      }
      await prisma.issue.update({
        where: { id: iss.id },
        data: { wardId: nearestWardId },
      });
    }
  }

  console.log('[Seed Demo] Demo environment seeded successfully!');
}

if (require.main === module) {
  seedDemoData()
    .catch((err) => {
      console.error('[Seed Demo] Error seeding demo data:', err);
      process.exit(1);
    })
    .finally(async () => {
      await pool.end();
    });
}
