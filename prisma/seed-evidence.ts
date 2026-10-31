import { PrismaClient, Category, EvidenceRole } from '@prisma/client';

const DEMO_STORAGE = 'https://ofkshdculpzvqergntcs.supabase.co/storage/v1/object/public/evidence/demo';

// Only categories with a real matching demo photo. Anything else gets the explicit
// "photo-missing" placeholder, which the UI labels as such, rather than a mismatched image.
const DEMO_PHOTO_BY_CATEGORY: Partial<Record<Category, string>> = {
  [Category.POTHOLES]: `${DEMO_STORAGE}/demo-evidence-potholes.jpg`,
  [Category.ROAD_CUT]: `${DEMO_STORAGE}/demo-evidence-road_cut.jpg`,
  [Category.STREETLIGHTS]: `${DEMO_STORAGE}/demo-evidence-streetlights.jpg`,
  [Category.TRAFFIC_SIGNS]: `${DEMO_STORAGE}/demo-evidence-traffic_signs.jpg`,
  [Category.WATERLOGGING]: `${DEMO_STORAGE}/demo-evidence-waterlogging.jpg`,
};

export function demoPhotoForCategory(category: Category): string {
  return DEMO_PHOTO_BY_CATEGORY[category] ?? `${DEMO_STORAGE}/photo-missing.jpg`;
}

export interface SeedReportInput {
  id: string;
  issueId: string;
  userId: string;
  role?: EvidenceRole;
  category: Category;
  lat: number;
  lng: number;
  capturedAt: Date;
  note: string;
}

/** Idempotently seeds an evidence report (default: the original citizen REPORT) for a seed issue. */
export async function upsertSeedReport(prisma: PrismaClient, r: SeedReportInput): Promise<void> {
  const photoUrl = demoPhotoForCategory(r.category);
  const role = r.role ?? EvidenceRole.REPORT;
  await prisma.report.upsert({
    where: { id: r.id },
    update: { issueId: r.issueId, photoUrl, note: r.note, role, isSeed: true },
    create: {
      id: r.id,
      issueId: r.issueId,
      userId: r.userId,
      role,
      photoUrl,
      photoSha256: 'seed_sample_sha256_fixture',
      signature: 'seed',
      lat: r.lat,
      lng: r.lng,
      gpsAccuracyM: 5.0,
      capturedAt: r.capturedAt,
      createdAt: r.capturedAt,
      note: r.note,
      isSeed: true,
    },
  });
}
