import { PrismaClient, Role, Tier, Category, Status, Band, EvidenceRole } from '@prisma/client';
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
      priority: 0.82,
      band: Band.HIGH,
      agencyId: agencyMap['GBA'],
      slaHours: 72,
      reporterId: citizenA.id,
      note: 'Deep crater pothole in the right lane slowing down bus traffic.',
      photoUrl: 'https://images.unsplash.com/photo-1515162816999-a0c47dc192f7?w=800&auto=format&fit=crop&q=60',
    },
    {
      id: 'seed-light-indiranagar',
      nonce: 'seed-report-indiranagar',
      category: Category.STREETLIGHTS,
      status: Status.OPEN,
      lat: 12.9800,
      lng: 77.6000,
      address: '100ft Road, Indiranagar, Bengaluru',
      priority: 0.45,
      band: Band.MEDIUM,
      agencyId: agencyMap['BESCOM'],
      slaHours: 24,
      reporterId: citizenB.id,
      note: 'Three continuous sodium vapor fixtures flickering and dark at night.',
      photoUrl: 'https://images.unsplash.com/photo-1508873696983-2df5293cb32b?w=800&auto=format&fit=crop&q=60',
    },
    {
      id: 'seed-water-koramangala',
      nonce: 'seed-report-koramangala',
      category: Category.WATERLOGGING,
      status: Status.CONFIRMED,
      lat: 12.9352,
      lng: 77.6245,
      address: '80ft Road, 4th Block Koramangala, Bengaluru',
      priority: 0.95,
      band: Band.CRITICAL,
      agencyId: agencyMap['BWSSB'],
      slaHours: 48,
      reporterId: citizenA.id,
      note: 'Severe water buildup after rain near Sony World junction.',
      photoUrl: 'https://images.unsplash.com/photo-1547683905-f686c993aae5?w=800&auto=format&fit=crop&q=60',
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
