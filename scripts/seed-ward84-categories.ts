import { resolveDbTarget, createPool, createPrisma } from './lib/db-target';
import { Category, Status, Band, EvidenceRole } from '@prisma/client';

const dbTarget = resolveDbTarget(['DIRECT_DATABASE_URL', 'APP_DATABASE_URL']);
const pool = createPool(dbTarget);
const prisma = createPrisma(pool, dbTarget);

async function run() {
  const ward84 = await prisma.ward.findFirst({
    where: { code: 'WARD-84' }
  });
  if (!ward84) {
    console.error('Ward 84 not found');
    await pool.end();
    return;
  }

  const defaultUser = await prisma.user.findFirst({
    where: { role: 'CITIZEN' }
  });
  if (!defaultUser) {
    console.error('Citizen user not found');
    await pool.end();
    return;
  }

  const gba = await prisma.agency.findFirst({ where: { code: 'GBA' } });
  const bescom = await prisma.agency.findFirst({ where: { code: 'BESCOM' } });
  const btp = await prisma.agency.findFirst({ where: { code: 'BTP' } });

  const issuesToSeed = [
    {
      id: 'seed-w84-sl-1',
      wardId: ward84.id,
      category: Category.STREETLIGHTS,
      status: Status.OPEN,
      address: 'Marathahalli Main Market Road, Ward 84',
      lat: 12.9575,
      lng: 77.7025,
      agencyId: bescom?.id || gba?.id,
      priority: 0.72,
      band: Band.HIGH,
      note: 'Multiple street light fixtures unpowered along main market stretch',
    },
    {
      id: 'seed-w84-tr-1',
      wardId: ward84.id,
      category: Category.TRASH,
      status: Status.ASSIGNED,
      address: 'Service Road near Marathahalli Ring Road, Ward 84',
      lat: 12.9535,
      lng: 77.6970,
      agencyId: gba?.id,
      priority: 0.65,
      band: Band.MEDIUM,
      note: 'Commercial waste accumulation obstructing pedestrian walkway',
    },
    {
      id: 'seed-w84-sw-1',
      wardId: ward84.id,
      category: Category.SIDEWALKS,
      status: Status.OPEN,
      address: 'Anand Nagar Footpath, Ward 84',
      lat: 12.9590,
      lng: 77.7060,
      agencyId: gba?.id,
      priority: 0.58,
      band: Band.MEDIUM,
      note: 'Broken pavement pavers with exposed reinforcement bars',
    },
    {
      id: 'seed-w84-ts-1',
      wardId: ward84.id,
      category: Category.TRAFFIC_SIGNS,
      status: Status.OPEN,
      address: 'Munnekollal Junction, Ward 84',
      lat: 12.9515,
      lng: 77.7030,
      agencyId: btp?.id || gba?.id,
      priority: 0.70,
      band: Band.HIGH,
      note: 'Bent one-way traffic regulatory sign causing vehicle conflicts',
    },
    {
      id: 'seed-w84-wl-1',
      wardId: ward84.id,
      category: Category.WATERLOGGING,
      status: Status.IN_PROGRESS,
      address: 'Old Airport Road Underpass, Ward 84',
      lat: 12.9550,
      lng: 77.6940,
      agencyId: gba?.id,
      priority: 0.85,
      band: Band.CRITICAL,
      note: 'Severe stagnant water ponding blocking two traffic lanes after rainfall',
    },
  ];

  for (const item of issuesToSeed) {
    const existing = await prisma.issue.findUnique({ where: { id: item.id } });
    if (!existing) {
      await prisma.issue.create({
        data: {
          id: item.id,
          wardId: item.wardId,
          category: item.category,
          status: item.status,
          address: item.address,
          lat: item.lat,
          lng: item.lng,
          agencyId: item.agencyId,
          priority: item.priority,
          band: item.band,
          slaDueAt: new Date(Date.now() + 48 * 3600 * 1000),
          isSeed: true,
          reports: {
            create: {
              userId: defaultUser.id,
              role: EvidenceRole.REPORT,
              photoUrl: 'https://placehold.co/600x400.jpg',
              photoSha256: `hash_${item.id}`,
              signature: 'verified_sig_w84',
              lat: item.lat,
              lng: item.lng,
              gpsAccuracyM: 5.0,
              capturedAt: new Date(),
              note: item.note,
              isSeed: true,
            }
          }
        }
      });
      console.log(`Created seed issue: ${item.id} (${item.category}) in Ward 84`);
    } else {
      console.log(`Issue ${item.id} already exists`);
    }
  }

  console.log('Seeding completed for Ward 84 categories.');
  await pool.end();
}

run().catch(console.error);
