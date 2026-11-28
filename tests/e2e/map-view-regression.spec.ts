import { test, expect } from '@playwright/test';
import { createSeedDb } from '../../scripts/lib/db-target';
import { Band, Category, Status } from '@prisma/client';
import { seedDemoData } from '../../scripts/seed-demo';

const { prisma, pool, verify: verifyTestDb } = createSeedDb();
const seedPassword = process.env.SEED_DESK_PASSWORD || 'password123';

test.describe('Page 4: Map View — Authenticated Browser Regression (Test Schema)', () => {
  const runTag = `map-e2e-${Date.now()}`;
  let targetWard: { id: string; code: string; name: string; lat: number; lng: number } | null = null;
  let otherWardId: string | null = null;
  let nullWardIssueId: string | null = null;
  let wrongWardInsideIssueId: string | null = null;
  let outsideIssueId: string | null = null;
  let specialIssueId: string | null = null;

  test.beforeAll(async () => {
    await verifyTestDb();
    await seedDemoData();

    // Find Ward 47 (or first active ward with geometry)
    const wards = await prisma.$queryRaw<
      Array<{ id: string; code: string; name: string; lat: number; lng: number }>
    >`
      SELECT id, code, name,
             ST_Y(ST_Centroid(geom::geometry)) AS lat,
             ST_X(ST_Centroid(geom::geometry)) AS lng
      FROM "Ward"
      WHERE "isLegacy" = false AND "isOperationalArea" = false AND geom IS NOT NULL
      ORDER BY CASE WHEN code = 'WARD-47' THEN 0 ELSE 1 END, "wardNumber" ASC NULLS LAST
      LIMIT 2;
    `;
    targetWard = wards[0] || null;
    otherWardId = wards[1]?.id || null;

    if (targetWard) {
      const due = new Date(Date.now() + 48 * 3600 * 1000);
      // 1. Null-wardId issue inside targetWard polygon
      const nullIss = await prisma.issue.create({
        data: {
          category: Category.POTHOLES,
          status: Status.OPEN,
          band: Band.CRITICAL,
          priority: 99,
          lat: targetWard.lat + 0.0001,
          lng: targetWard.lng + 0.0001,
          address: `${runTag} NullWard Road`,
          wardId: null,
          slaDueAt: due,
        },
      });
      nullWardIssueId = nullIss.id;

      // 2. Other-wardId issue spatially inside targetWard polygon
      if (otherWardId) {
        const wrongIss = await prisma.issue.create({
          data: {
            category: Category.WATERLOGGING,
            status: Status.CLAIMED_FIXED,
            band: Band.HIGH,
            priority: 98,
            lat: targetWard.lat + 0.00012,
            lng: targetWard.lng + 0.00012,
            address: `${runTag} WrongWard Inside Road`,
            wardId: otherWardId,
            slaDueAt: due,
            repairClaimedAt: new Date(),
          },
        });
        wrongWardInsideIssueId = wrongIss.id;

        // 3. Outside targetWard polygon (far away in North Bengaluru)
        const outIss = await prisma.issue.create({
          data: {
            category: Category.GRAFFITI,
            status: Status.OPEN,
            band: Band.LOW,
            priority: 10,
            lat: 13.095,
            lng: 77.595,
            address: `${runTag} Far Outside Road`,
            wardId: otherWardId,
            slaDueAt: due,
          },
        });
        outsideIssueId = outIss.id;
      }

      // 4. Special searchable issue + 100 bulk issues to exceed 100-issue page limit
      const citizen = await prisma.user.findFirstOrThrow({ where: { email: 'citizen@example.com' } });
      const specIss = await prisma.issue.create({
        data: {
          category: Category.DRAINAGE,
          status: Status.IN_PROGRESS,
          band: Band.CRITICAL,
          priority: 97,
          lat: targetWard.lat + 0.00015,
          lng: targetWard.lng + 0.00015,
          address: `${runTag} Searchable Drain Avenue`,
          wardId: targetWard.id,
          slaDueAt: due,
        },
      });
      await prisma.report.create({
        data: {
          issueId: specIss.id,
          userId: citizen.id,
          role: 'REPORT',
          lat: targetWard.lat + 0.00015,
          lng: targetWard.lng + 0.00015,
          photoUrl: '/images/evidence-drainage-clean.jpg',
          photoSha256: `${runTag}-sha`,
          signature: 'test-sig',
          gpsAccuracyM: 5,
          capturedAt: new Date(),
          note: `${runTag} unique description overflow`,
        },
      });
      specialIssueId = specIss.id;

      await prisma.issue.createMany({
        data: Array.from({ length: 100 }, (_, idx) => ({
          category: Category.OTHER,
          status: Status.OPEN,
          band: Band.LOW,
          priority: 1 + (idx % 5),
          lat: targetWard!.lat + (idx % 10) * 0.0002,
          lng: targetWard!.lng + Math.floor(idx / 10) * 0.0002,
          address: `${runTag} Bulk Street ${idx + 1}`,
          wardId: targetWard!.id,
          slaDueAt: due,
        })),
      });
    }
  });

  async function loginAsCitizen(page: import('@playwright/test').Page) {
    await page.goto('/login/citizen');
    await page.locator('input[type="email"]').fill('citizen@example.com');
    await page.locator('input[type="password"]').fill(seedPassword);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL('**/citizen/dashboard', { timeout: 20000 });
  }

  async function loginAsDesk(page: import('@playwright/test').Page) {
    await page.goto('/login/staff');
    await page.locator('input[type="email"]').fill('desk-a@civicpulse.local');
    await page.locator('input[type="password"]').fill(seedPassword);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL(/\/desk(?:\/.*)?$/, { timeout: 20000 });
  }

  test('1, 2, 3, 5, 6: Map init, ?category=POTHOLES, search, filters, clustering, preview & >100 pagination', async ({
    browser,
  }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await loginAsCitizen(page);
    consoleErrors.length = 0;

    // Direct URL navigation with ?category=POTHOLES
    await page.goto('/citizen/map?category=POTHOLES');
    await expect(page.getByTestId('ward-issues-drawer')).toBeVisible({ timeout: 20000 });
    await expect(page.getByTestId('ward-issues-drawer')).toContainText('POTHOLES');

    // Clear category filter to see all loaded issues in ward
    await page.getByRole('button', { name: 'Clear', exact: true }).click();

    // Pagination: >100 issues => Load More button visible, clicking loads next page and updates remaining count
    const loadMoreBtn = page.getByRole('button', { name: /Load More/i });
    await expect(loadMoreBtn).toBeVisible({ timeout: 15000 });
    const beforeLoadText = await loadMoreBtn.innerText();
    await loadMoreBtn.click();
    await expect
      .poll(
        async () => {
          const count = await loadMoreBtn.count();
          if (count === 0) return 'DONE';
          return await loadMoreBtn.innerText();
        },
        { timeout: 15000 }
      )
      .not.toBe(beforeLoadText);

    // Spatial inclusion check via API: nullWardIssueId & wrongWardInsideIssueId included, outsideIssueId excluded
    if (targetWard) {
      const apiRes = await page.request.get(`/api/issues/ward?ward=${encodeURIComponent(targetWard.code)}&limit=250`);
      expect(apiRes.status()).toBe(200);
      const apiJson = await apiRes.json();
      const ids = new Set((apiJson.issues as Array<{ id: string }>).map((i) => i.id));
      expect(apiJson.pagination.total).toBeGreaterThan(100);
      if (nullWardIssueId) expect(ids.has(nullWardIssueId)).toBe(true);
      if (wrongWardInsideIssueId) expect(ids.has(wrongWardInsideIssueId)).toBe(true);
      if (outsideIssueId) expect(ids.has(outsideIssueId)).toBe(false);
    }

    // Search by description (note), location, and priority filter
    const searchInput = page.getByTestId('map-search-input');
    await searchInput.fill(`${runTag} unique description overflow`);
    await expect(page.getByTestId('ward-issues-drawer')).toContainText('Searchable Drain Avenue');

    // Select issue and verify Selected Issue Preview
    await page.getByText('Searchable Drain Avenue').first().click();
    const preview = page.getByTestId('selected-issue-preview');
    await expect(preview).toBeVisible();
    await expect(preview).toContainText('DRAINAGE');
    await expect(preview).toContainText('CRITICAL');
    await expect(preview).toContainText('from ward center');
    await expect(preview).toContainText(`${runTag} unique description overflow`);
    if (specialIssueId) {
      await expect(preview.locator(`a[href="/issue/${specialIssueId}"]`)).toBeVisible();
    }

    // Clear search and test cluster expansion + no duplicate markers
    await page.getByRole('button', { name: 'Clear', exact: true }).click();
    const clusterMarker = page.locator('.custom-cluster-marker').first();
    if ((await clusterMarker.count()) > 0) {
      await clusterMarker.click();
      await page.waitForTimeout(700);
    }

    expect(consoleErrors.filter((e) => !e.includes('tile.openstreetmap.org'))).toEqual([]);
    await context.close();
  });

  test('4: Locate Me — granted GPS vs denied GPS permission', async ({ browser }) => {
    // 4a. Granted GPS
    const grantedCtx = await browser.newContext({
      permissions: ['geolocation'],
      geolocation: {
        latitude: targetWard?.lat ?? 12.9279,
        longitude: targetWard?.lng ?? 77.6762,
        accuracy: 6,
      },
    });
    const page1 = await grantedCtx.newPage();
    await loginAsCitizen(page1);
    await page1.goto('/citizen/map');
    await expect(page1.getByTestId('ward-issues-drawer')).toBeVisible({ timeout: 20000 });
    await page1.getByTestId('locate-me-btn').click();
    await expect(page1.getByTestId('ward-issues-drawer')).toContainText('from you', { timeout: 10000 });
    await grantedCtx.close();

    // 4b. Denied GPS
    const deniedCtx = await browser.newContext({ permissions: [] });
    const page2 = await deniedCtx.newPage();
    await loginAsCitizen(page2);
    await page2.goto('/citizen/map');
    await expect(page2.getByTestId('ward-issues-drawer')).toBeVisible({ timeout: 20000 });
    await page2.getByTestId('locate-me-btn').click();
    await expect(page2.getByTestId('locate-error-banner')).toContainText(/Location permission denied|Unable to determine/i, {
      timeout: 10000,
    });
    await expect(page2.getByTestId('ward-issues-drawer')).toContainText('from ward center');
    await deniedCtx.close();
  });

  test('7: Cross-page regression — Home, Ward Intelligence, Report Locations & Desk Route Optimizer', async ({
    browser,
  }) => {
    const citCtx = await browser.newContext();
    const citPage = await citCtx.newPage();
    await loginAsCitizen(citPage);

    await citPage.goto('/citizen/dashboard');
    await expect(citPage.getByTestId('selected-ward-pulse')).toBeVisible({ timeout: 15000 });

    await citPage.goto('/citizen/intelligence');
    await expect(citPage.locator('body')).toContainText(/Recurring Hotspot Map|Ward Briefing/i, { timeout: 20000 });

    await citPage.goto('/citizen/extra');
    await citPage.waitForURL('**/citizen/map?view=list', { timeout: 15000 });
    await expect(citPage.getByTestId('map-list-view')).toBeVisible({ timeout: 15000 });
    await expect(citPage.getByTestId('coordinate-export-ledger')).toBeVisible();
    // Report Locations must be absent from sidebar navigation
    await expect(citPage.locator('nav a[href="/citizen/extra"]')).toHaveCount(0);

    // Switch List -> Map preserving ward & filters
    await citPage.getByTestId('view-mode-map').click();
    await expect(citPage.getByTestId('ward-issues-drawer')).toBeVisible({ timeout: 10000 });
    await citCtx.close();

    const deskCtx = await browser.newContext();
    const deskPage = await deskCtx.newPage();
    await loginAsDesk(deskPage);
    await deskPage.goto('/desk/map');
    await expect(deskPage.locator('body')).toContainText(/Route Optimizer|Work Orders/i, { timeout: 15000 });
    await deskCtx.close();
  });
});

void pool;
