import { PrismaClient, Role, Tier, Category, Status, Band, SegmentEventType } from '@prisma/client';
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

const connectionString = process.env.DIRECT_DATABASE_URL || process.env.APP_DATABASE_URL;
if (!connectionString) {
  throw new Error('Database connection URL (DIRECT_DATABASE_URL or APP_DATABASE_URL) is required.');
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
    { id: 'seed-demo-seg-cessna-park', name: 'Cessna Business Park Access Road', lanes: 4, buses: 20, speed: 30.0, freeFlow: 40.0 },
    { id: 'seed-demo-seg-agara-lake', name: 'Outer Ring Road (Agara Lake Section)', lanes: 6, buses: 45, speed: 35.0, freeFlow: 55.0 },
  ];

  for (let i = 0; i < pilotSegments.length; i++) {
    const s = pilotSegments[i];
    const seg = await prisma.roadSegment.upsert({
      where: { id: s.id },
      update: {
        name: s.name,
        osmWayId: BigInt(99999000 + i),
        roadClass: 'primary',
        lanes: s.lanes,
        busesPerHour: s.buses,
        pedestrianEstimate: 100,
        tracked: true,
      },
      create: {
        id: s.id,
        name: s.name,
        osmWayId: BigInt(99999000 + i),
        roadClass: 'primary',
        lanes: s.lanes,
        busesPerHour: s.buses,
        pedestrianEstimate: 100,
        tracked: true,
      },
    });

    // Seed 2 traffic samples for each segment
    await prisma.trafficSample.create({
      data: {
        segmentId: seg.id,
        sampledAt: new Date(now.getTime() - 15 * 60 * 1000),
        currentSpeed: s.speed,
        freeFlowSpeed: s.freeFlow,
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
      recurrenceOf: fixedIssue.id,
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
      recurrenceOf: fixedIssue.id,
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
      band: Band.LOW,
      agencyId: agencyMap['GBA'],
      segmentId: 'seed-demo-seg-agara-lake',
      createdAt: new Date(now.getTime() - 10 * dayMs),
      slaDueAt: new Date(now.getTime() + 72 * 3600 * 1000),
      isSeed: true,
    },
  });

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
