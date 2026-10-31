import { PrismaClient, Role, Tier, Category, Status, Band, EvidenceRole, SegmentEventType } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { upsertSeedReport } from './seed-evidence';

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

async function main() {
  console.log('[Seed] Starting CivicPulse v2 database seed...');

  const seedPassword = process.env.SEED_DESK_PASSWORD;
  if (!seedPassword) {
    throw new Error('SEED_DESK_PASSWORD is not set in environment. Required to generate user credentials.');
  }

  // 1. Clean up seed non-action models if needed (NEVER touch production data where isSeed = false)
  // Note: ActionLog has an append-only database trigger and must never be deleted.
  console.log('[Seed] Ensuring clean seed baseline without touching production data...');

  // 2. Upsert Agencies from U7
  console.log('[Seed] Upserting agencies from U7...');
  const agencyMap: Record<string, string> = {};
  for (const agency of AGENCIES) {
    const record = await prisma.agency.upsert({
      where: { code: agency.code },
      update: { name: agency.name, slaHours: agency.slaHours },
      create: { code: agency.code, name: agency.name, slaHours: agency.slaHours },
    });
    agencyMap[agency.code] = record.id;
  }

  // 3. Upsert Users (2 Desk Authorities, 3 Citizens)
  console.log('[Seed] Upserting desk and citizen users...');
  const hashedPassword = await bcrypt.hash(seedPassword, 10);

  const deskUsers = [
    { email: 'desk-a@civicpulse.local', name: 'Desk Officer A' },
    { email: 'desk-b@civicpulse.local', name: 'Desk Officer B' },
  ];

  for (const desk of deskUsers) {
    await prisma.user.upsert({
      where: { email: desk.email },
      update: {
        name: desk.name,
        passwordHash: hashedPassword,
        role: Role.AUTHORITY,
      },
      create: {
        email: desk.email,
        name: desk.name,
        passwordHash: hashedPassword,
        role: Role.AUTHORITY,
      },
    });
  }

  const citizenUsers = [
    { email: 'citizen@example.com', name: 'Aarav Patel (Alpha)', tier: Tier.CITIZEN, reputation: 50 },
    { email: 'citizen-b@civicpulse.local', name: 'Priya Sharma (Beta)', tier: Tier.CONTRIBUTOR, reputation: 250 },
    { email: 'citizen-c@civicpulse.local', name: 'Rohan Rao (Gamma)', tier: Tier.GUARDIAN, reputation: 600 },
  ];

  const seededCitizens: { id: string; email: string; profileId: string }[] = [];

  for (const c of citizenUsers) {
    const user = await prisma.user.upsert({
      where: { email: c.email },
      update: {
        name: c.name,
        passwordHash: hashedPassword,
        role: Role.CITIZEN,
      },
      create: {
        email: c.email,
        name: c.name,
        passwordHash: hashedPassword,
        role: Role.CITIZEN,
      },
    });

    const profile = await prisma.citizenProfile.upsert({
      where: { userId: user.id },
      update: {
        tier: c.tier,
        reputation: c.reputation,
        verified: true,
      },
      create: {
        userId: user.id,
        tier: c.tier,
        reputation: c.reputation,
        verified: true,
      },
    });

    seededCitizens.push({ id: user.id, email: user.email, profileId: profile.id });
  }

  // 4. Upsert sample seed issues (isSeed = true)
  console.log('[Seed] Upserting sample seed issues (isSeed = true)...');
  const now = new Date();
  const citizenA = seededCitizens[0];
  const citizenB = seededCitizens[1];

  const sampleIssues = [
    {
      id: 'seed-pothole-mgroad',
      nonce: 'seed-report-mgroad',
      category: Category.POTHOLES,
      status: Status.OPEN,
      lat: 12.9716,
      lng: 77.5946,
      address: 'MG Road near Anil Kumble Circle, Bengaluru',
      priority: 82.0,
      band: Band.CRITICAL,
      agencyId: agencyMap['GBA'],
      slaHours: 72,
      reporterId: citizenA.id,
      note: 'Deep crater pothole in the right lane slowing down bus traffic.',
      photoUrl: 'https://ofkshdculpzvqergntcs.supabase.co/storage/v1/object/public/evidence/demo/demo-evidence-potholes.jpg',
    },
    {
      id: 'seed-light-indiranagar',
      nonce: 'seed-report-indiranagar',
      category: Category.STREETLIGHTS,
      status: Status.OPEN,
      lat: 12.9800,
      lng: 77.6000,
      address: '100ft Road, Indiranagar, Bengaluru',
      priority: 45.0,
      band: Band.MEDIUM,
      agencyId: agencyMap['BESCOM'],
      slaHours: 24,
      reporterId: citizenB.id,
      note: 'Three continuous sodium vapor fixtures flickering and dark at night.',
      photoUrl: 'https://ofkshdculpzvqergntcs.supabase.co/storage/v1/object/public/evidence/demo/demo-evidence-streetlights.jpg',
    },
    {
      id: 'seed-water-koramangala',
      nonce: 'seed-report-koramangala',
      category: Category.WATERLOGGING,
      status: Status.CONFIRMED,
      lat: 12.9352,
      lng: 77.6245,
      address: '80ft Road, 4th Block Koramangala, Bengaluru',
      priority: 95.0,
      band: Band.CRITICAL,
      agencyId: agencyMap['BWSSB'],
      slaHours: 48,
      reporterId: citizenA.id,
      note: 'Severe water buildup after rain near Sony World junction.',
      photoUrl: 'https://ofkshdculpzvqergntcs.supabase.co/storage/v1/object/public/evidence/demo/demo-evidence-waterlogging.jpg',
    },
  ];

  for (const sample of sampleIssues) {
    const slaDueAt = new Date(now.getTime() + sample.slaHours * 3600 * 1000);

    const issue = await prisma.issue.upsert({
      where: { id: sample.id },
      update: {
        category: sample.category,
        status: sample.status,
        lat: sample.lat,
        lng: sample.lng,
        address: sample.address,
        priority: sample.priority,
        band: sample.band,
        agencyId: sample.agencyId,
        slaDueAt,
        isSeed: true,
      },
      create: {
        id: sample.id,
        category: sample.category,
        status: sample.status,
        lat: sample.lat,
        lng: sample.lng,
        address: sample.address,
        priority: sample.priority,
        band: sample.band,
        agencyId: sample.agencyId,
        slaDueAt,
        isSeed: true,
      },
    });

    await prisma.report.upsert({
      where: { nonce: sample.nonce },
      update: {
        issueId: issue.id,
        userId: sample.reporterId,
        role: EvidenceRole.REPORT,
        photoUrl: sample.photoUrl,
        lat: sample.lat,
        lng: sample.lng,
        gpsAccuracyM: 5.0,
        note: sample.note,
        isSeed: true,
      },
      create: {
        issueId: issue.id,
        userId: sample.reporterId,
        role: EvidenceRole.REPORT,
        photoUrl: sample.photoUrl,
        photoSha256: 'seed_sample_sha256_fixture',
        signature: 'seed',
        nonce: sample.nonce,
        lat: sample.lat,
        lng: sample.lng,
        gpsAccuracyM: 5.0,
        capturedAt: now,
        note: sample.note,
        isSeed: true,
      },
    });

    const existingLog = await prisma.actionLog.findFirst({
      where: {
        issueId: issue.id,
        action: 'CREATED',
      },
    });

    if (!existingLog) {
      await prisma.actionLog.create({
        data: {
          issueId: issue.id,
          actorId: sample.reporterId,
          action: 'CREATED',
          toStatus: sample.status,
          note: 'Seeded initial issue report',
        },
      });
    }
  }

  // 5. Upsert Pilot Road Segment and Seeded History for T60(A)
  console.log('[Seed] Upserting pilot road segment and historical events (T60)...');
  const pilotSegmentId = 'seed-seg-orr-kadubeesanahalli';
  const pilotSegment = await prisma.roadSegment.upsert({
    where: { id: pilotSegmentId },
    update: {
      name: 'Outer Ring Road (Kadubeesanahalli Section)',
      osmWayId: BigInt(99999901),
      roadClass: 'primary',
      lanes: 6,
      busesPerHour: 48,
      pedestrianEstimate: 120,
      nearSchoolOrHospital: false,
      soleAccess: false,
      tracked: true,
    },
    create: {
      id: pilotSegmentId,
      name: 'Outer Ring Road (Kadubeesanahalli Section)',
      osmWayId: BigInt(99999901),
      roadClass: 'primary',
      lanes: 6,
      busesPerHour: 48,
      pedestrianEstimate: 120,
      nearSchoolOrHospital: false,
      soleAccess: false,
      tracked: true,
    },
  });

  const dayMs = 24 * 60 * 60 * 1000;
  const pilotEvents = [
    {
      id: 'seed-evt-resurface-180d',
      segmentId: pilotSegment.id,
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
      segmentId: pilotSegment.id,
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
      segmentId: pilotSegment.id,
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
      segmentId: pilotSegment.id,
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

  // Seed two linked issues on this segment: a fixed prior issue with agency handoff, and an active recurrence
  const fixedIssueId = 'seed-issue-orr-fixed';
  const recurrenceIssueId = 'seed-issue-orr-recurrence';

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
      segmentId: pilotSegment.id,
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
      segmentId: pilotSegment.id,
      handoffCount: 1,
      createdAt: new Date(now.getTime() - 60 * dayMs),
      slaDueAt: new Date(now.getTime() - 55 * dayMs),
      isSeed: true,
    },
  });

  const fixedIssueLogs = [
    {
      action: 'CREATED',
      actorId: citizenA.id,
      toStatus: Status.OPEN,
      note: 'Citizen reported crater pothole in outer bus lane',
      createdAt: new Date(now.getTime() - 60 * dayMs),
    },
    {
      action: 'REASSIGN_AGENCY',
      actorId: citizenA.id,
      note: 'Jurisdiction transferred: Reassigned from BESCOM to BWSSB following utility trench settlement',
      createdAt: new Date(now.getTime() - 50 * dayMs),
    },
    {
      action: 'CLAIM_FIX',
      actorId: citizenB.id,
      fromStatus: Status.OPEN,
      toStatus: Status.CLAIMED_FIXED,
      note: 'Bitumen cold mix patch completed by Cauvery Water Works',
      createdAt: new Date(now.getTime() - 35 * dayMs),
    },
    {
      action: 'VERIFIED_FIX',
      actorId: citizenB.id,
      fromStatus: Status.CLAIMED_FIXED,
      toStatus: Status.VERIFIED_FIXED,
      note: 'Citizen verified fix: flush road surface restored and verified by dual citizen check',
      createdAt: new Date(now.getTime() - 30 * dayMs),
    },
  ];

  for (const log of fixedIssueLogs) {
    const existing = await prisma.actionLog.findFirst({
      where: {
        issueId: fixedIssue.id,
        action: log.action,
      },
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

  const recurrenceIssue = await prisma.issue.upsert({
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
      segmentId: pilotSegment.id,
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
      segmentId: pilotSegment.id,
      recurrenceOf: fixedIssue.id,
      createdAt: new Date(now.getTime() - 7 * dayMs),
      slaDueAt: new Date(now.getTime() + 48 * 3600 * 1000),
      isSeed: true,
    },
  });

  const existingRecurrenceLog = await prisma.actionLog.findFirst({
    where: {
      issueId: recurrenceIssue.id,
      action: 'CREATED',
    },
  });
  if (!existingRecurrenceLog) {
    await prisma.actionLog.create({
      data: {
        issueId: recurrenceIssue.id,
        actorId: citizenA.id,
        action: 'CREATED',
        toStatus: Status.OPEN,
        note: 'Recurrent pothole formed at prior BWSSB utility trench location',
        createdAt: new Date(now.getTime() - 7 * dayMs),
      },
    });
  }


  // Original citizen evidence for the linked ORR issues (previously seeded with zero reports)
  await upsertSeedReport(prisma, {
    id: 'seed-report-orr-fixed',
    issueId: fixedIssueId,
    userId: citizenA.id,
    category: Category.POTHOLES,
    lat: 12.9360,
    lng: 77.6955,
    capturedAt: new Date(now.getTime() - 60 * dayMs),
    note: 'Crater pothole in outer bus lane at Kadubeesanahalli Junction',
  });
  await upsertSeedReport(prisma, {
    id: 'seed-report-orr-recurrence',
    issueId: recurrenceIssueId,
    userId: citizenA.id,
    category: Category.POTHOLES,
    lat: 12.9361,
    lng: 77.6956,
    capturedAt: new Date(now.getTime() - 7 * dayMs),
    note: 'Recurrent pothole at prior utility trench location',
  });

  console.log('[Seed] Database seed completed successfully!');
  console.log(`  - Agencies seeded: ${AGENCIES.length}`);
  console.log(`  - Desk users seeded: 2 (desk-a@civicpulse.local, desk-b@civicpulse.local)`);
  console.log(`  - Citizen users seeded: 3`);
  console.log(`  - Sample seed issues created/upserted: ${sampleIssues.length}`);
}

main()
  .catch((e) => {
    console.error('[Seed] Error during seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await pool.end();
  });
