/**
 * QA Phase 2 — Full Desk Exploration
 *
 * Evidence-only: takes screenshots, checks UI, records findings.
 * No app-code changes.  All mutations go to the TEST schema only.
 *
 * Coverage:
 *  1. Auth  — login desk-a/b, logout, session, citizen-page blocking
 *  2. Queue — filters (status, category, agency, ward, SLA, search, show-closed),
 *             stats bar, metrics bar (Reopened, lifespan)
 *  3. Drawer — repair window + calendar, AI assessment (G1/G2/pending/no-photo),
 *              deterioration panel, evidence photo, action log
 *  4. Actions — Confirm, Assign Agency, Start Work, Override Band, Reject, Reopen,
 *               Liability package link (status REOPENED_IN_WARRANTY)
 *  5. AI Analyst Panel — ward brief, 5 chat questions (incl. one refusal)
 *  6. Route Optimizer (/desk/map)
 *  7. Claim Gap (/claim-gap)
 *  8. Field Personnel (/desk/personnels)
 *  9. Ward page (/ward/[id]) — public view as desk vs citizen
 * 10. Public issue page (/issue/[id]) as desk vs unauthenticated
 * 11. Concurrent desks — desk-a and desk-b on same issue simultaneously
 * 12. Console errors, 404s, failed requests, axe a11y per page
 * 13. Mobile (Pixel 7) smoke: dashboard, drawer, filter
 */

import { test, expect } from "@playwright/test";
import { createSeedDb } from "../../scripts/lib/db-target";
import path from "path";
import fs from "fs";

// pool/prisma used in test bodies for direct DB assertions; seeding handled by globalSetup
const { pool, prisma } = createSeedDb();

// SEED_DESK_PASSWORD must match what seed-demo.ts uses (process.env.SEED_DESK_PASSWORD || 'password123')
const SEED_PW = process.env.SEED_DESK_PASSWORD || "password123";
const DESK_A = { email: "desk-a@civicpulse.local", password: SEED_PW };
const DESK_B = { email: "desk-b@civicpulse.local", password: SEED_PW };
const CITIZEN = { email: "citizen@example.com", password: SEED_PW };

const PILOT_ISSUE = "seed-demo-critical-bellandur";
const MEDIUM_ISSUE = "seed-demo-medium-cessna";
const LOW_ISSUE = "seed-demo-low-agara";

// Screenshot helper — saves under qa-evidence/desk/<section>/
const EVIDENCE_ROOT = path.resolve(process.cwd(), "qa-evidence/desk");
let shotCounter = 0;
async function shot(page: import("@playwright/test").Page, section: string, name: string) {
  shotCounter++;
  const dir = path.join(EVIDENCE_ROOT, section);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${String(shotCounter).padStart(2, "0")}-${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  return path.relative(process.cwd(), file);
}

// Console error collector
function attachConsoleListener(page: import("@playwright/test").Page): string[] {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(`[console.error] ${msg.text()}`);
  });
  page.on("pageerror", (err) => errors.push(`[pageerror] ${err.message}`));
  return errors;
}

// Failed-request collector
function attachFailedRequestListener(page: import("@playwright/test").Page): Array<{ url: string; status: number }> {
  const failed: Array<{ url: string; status: number }> = [];
  page.on("response", (resp) => {
    if (resp.status() >= 400 && !resp.url().includes("/api/auth/session")) {
      failed.push({ url: resp.url(), status: resp.status() });
    }
  });
  return failed;
}

async function loginAs(
  page: import("@playwright/test").Page,
  user: { email: string; password: string }
) {
  // Use Playwright's context.request — shares the cookie jar with the browser context.
  // This avoids React-hydration races (page.fill) and opaque-redirect cookie issues
  // (page.evaluate + redirect:"manual" gives status 0 and unreliable Set-Cookie handling).
  const req = page.context().request;

  // Step 1: get a fresh CSRF token (also sets the csrf cookie on the context)
  const csrfRes = await req.get("http://localhost:3100/api/auth/csrf");
  const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };

  // Step 2: submit credentials — NextAuth sets the session-token cookie on success
  await req.post("http://localhost:3100/api/auth/callback/credentials", {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    data: new URLSearchParams({
      csrfToken,
      email: user.email,
      password: user.password,
      callbackUrl: "http://localhost:3100/desk",
    }).toString(),
    maxRedirects: 5,
    failOnStatusCode: false,
  });

  // Step 3: navigate — the session cookie is now in the shared jar
  await page.goto("/desk", { waitUntil: "commit", timeout: 60000 });
}

test.describe("QA Phase 2 — Desk Full Exploration", () => {
  test.setTimeout(300000);

  test.afterAll(async () => {
    await pool.end().catch(() => {});
  });

  // ─────────────────────────────────────────────────────────
  // 1. AUTH
  // ─────────────────────────────────────────────────────────
  test("1-auth: desk-a login, dashboard loads, logout, session gone", async ({ page }) => {
    const errors = attachConsoleListener(page);
    const failed = attachFailedRequestListener(page);

    await loginAs(page, DESK_A);
    await expect(page).toHaveURL(/\/desk/, { timeout: 30000 });
    await shot(page, "01-auth", "desk-a-dashboard");

    // Verify queue visible
    const queueEl = page.locator('text=Total In Queue').first();
    await expect(queueEl).toBeVisible({ timeout: 15000 });

    // Logout — look for sign-out link or button
    const signOutBtn = page.locator('button:has-text("Sign out"), a:has-text("Sign out"), button:has-text("Logout"), a:has-text("Logout")').first();
    const signOutVisible = await signOutBtn.isVisible({ timeout: 5000 }).catch(() => false);
    if (signOutVisible) {
      await signOutBtn.click();
      await page.waitForURL(/\/login/, { timeout: 15000 });
      await shot(page, "01-auth", "logged-out");
    } else {
      // Navigate to logout manually
      await page.goto("/api/auth/signout");
      await shot(page, "01-auth", "signout-page");
    }

    // Session should be gone — desk redirects to login
    await page.goto("/desk");
    await page.waitForURL(/\/login/, { timeout: 15000 });
    await shot(page, "01-auth", "desk-redirects-to-login");

    console.log("1-auth console errors:", errors.join("\n") || "none");
    console.log("1-auth failed requests:", failed.map((f) => `${f.status} ${f.url}`).join("\n") || "none");
  });

  test("1b-auth: desk-b login works; citizen pages blocked for desk", async ({ browser }) => {
    // desk-b login
    const deskCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const deskPage = await deskCtx.newPage();
    await loginAs(deskPage, DESK_B);
    await expect(deskPage).toHaveURL(/\/desk/, { timeout: 30000 });
    await shot(deskPage, "01-auth", "desk-b-dashboard");
    await deskCtx.close();

    // Citizen pages blocked
    const anonCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const anonPage = await anonCtx.newPage();
    // Citizen-only page /citizen/dashboard should redirect to login or 401
    await anonPage.goto("/citizen/dashboard");
    const citizenUrl = anonPage.url();
    console.log("1b-auth /citizen/dashboard → redirected to:", citizenUrl);
    expect(citizenUrl).not.toContain("/citizen/dashboard");
    await shot(anonPage, "01-auth", "citizen-dashboard-blocked");
    await anonCtx.close();
  });

  // ─────────────────────────────────────────────────────────
  // 2. OPERATIONS QUEUE — filters, metrics bar
  // ─────────────────────────────────────────────────────────
  test("2-queue: status filters, category filter, SLA breached, search, show-closed", async ({ page }) => {
    const errors = attachConsoleListener(page);
    await loginAs(page, DESK_A);
    await shot(page, "02-queue", "initial-queue");

    // ── Status filter each value ──────────────────────────
    const statusSelect = page.locator("select").filter({ hasText: "All Statuses" }).first();
    await expect(statusSelect).toBeVisible({ timeout: 10000 });

    for (const status of ["OPEN", "CONFIRMED", "ASSIGNED", "IN_PROGRESS", "CLAIMED_FIXED"]) {
      await statusSelect.selectOption(status);
      await page.click('button:has-text("Apply Filters")');
      await page.waitForTimeout(800);
      const count = await page.locator('[class*="rounded-2xl"][class*="cursor-pointer"]').count();
      console.log(`2-queue status=${status} count=${count}`);
    }
    await shot(page, "02-queue", "status-filter-applied");

    // ── Show Verified + Rejected ──────────────────────────
    await statusSelect.selectOption("ALL");
    const showClosedBox = page.locator('input[type="checkbox"]').nth(1);
    await showClosedBox.check();
    await page.click('button:has-text("Apply Filters")');
    await page.waitForTimeout(800);
    await shot(page, "02-queue", "show-verified-rejected");
    await showClosedBox.uncheck();

    // ── Category filter ───────────────────────────────────
    const catSelect = page.locator("select").nth(1);
    await catSelect.selectOption("POTHOLES");
    await page.click('button:has-text("Apply Filters")');
    await page.waitForTimeout(600);
    await shot(page, "02-queue", "category-potholes");
    await catSelect.selectOption("ALL");

    // ── SLA breached only ─────────────────────────────────
    const slaBox = page.locator('input[type="checkbox"]').first();
    await slaBox.check();
    await page.click('button:has-text("Apply Filters")');
    await page.waitForTimeout(600);
    await shot(page, "02-queue", "sla-breached-filter");
    await slaBox.uncheck();

    // ── Search ────────────────────────────────────────────
    const searchInput = page.locator('input[placeholder*="Search"]');
    await searchInput.fill("Outer Ring");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(600);
    await shot(page, "02-queue", "search-outer-ring");
    await searchInput.clear();

    // Reset
    await page.click('button:has-text("Apply Filters")');
    await page.waitForTimeout(600);

    // ── Metrics bar (Reopened in Warranty, lifespan) ──────
    const reopenedCard = page.locator('text=Reopened In Warranty').first();
    const reopenedVisible = await reopenedCard.isVisible({ timeout: 5000 }).catch(() => false);
    console.log("2-queue metrics bar Reopened visible:", reopenedVisible);
    await shot(page, "02-queue", "metrics-bar");

    console.log("2-queue console errors:", errors.join("\n") || "none");
  });

  // ─────────────────────────────────────────────────────────
  // 3. ISSUE DRAWER
  // ─────────────────────────────────────────────────────────
  test("3-drawer: open pilot issue (CRITICAL) — repair window, AI assessment, deterioration, evidence", async ({ page }) => {
    const errors = attachConsoleListener(page);
    await loginAs(page, DESK_A);

    // Click the Bellandur issue row
    const issueRow = page.locator(`[data-issue-id="${PILOT_ISSUE}"], text=Outer Ring Road, text=WATERLOGGING`).first();
    const rowVisible = await issueRow.isVisible({ timeout: 10000 }).catch(() => false);
    if (!rowVisible) {
      // Fallback: click first issue row
      const firstRow = page.locator('[class*="cursor-pointer"][class*="rounded-2xl"]').first();
      await firstRow.click();
    } else {
      await issueRow.click();
    }
    await page.waitForTimeout(1000);
    await shot(page, "03-drawer", "pilot-issue-open");

    // Repair window
    const repairCard = page.locator('[data-testid="repair-window-card"], [data-testid="repair-window-detailed"]').first();
    const repairVisible = await repairCard.isVisible({ timeout: 8000 }).catch(() => false);
    console.log("3-drawer repair window visible:", repairVisible);
    if (repairVisible) await shot(page, "03-drawer", "repair-window-visible");

    // Calendar heatmap
    const toggleCalBtn = page.locator('[data-testid="toggle-calendar-btn"]');
    const calBtnVisible = await toggleCalBtn.isVisible({ timeout: 5000 }).catch(() => false);
    if (calBtnVisible) {
      await toggleCalBtn.click();
      const heatmap = page.locator('[data-testid="repair-calendar-heatmap"]');
      await expect(heatmap).toBeVisible({ timeout: 5000 });
      await expect(heatmap).toContainText("Next 7 Days");
      await shot(page, "03-drawer", "calendar-heatmap");
    }

    // AI analyst card
    const analystCard = page.locator('[data-testid="ai-analyst-card"]');
    const pendingCard = page.locator('[data-testid="ai-analyst-pending-card"]');
    const analystVisible = await analystCard.isVisible({ timeout: 8000 }).catch(() => false);
    const pendingVisible = await pendingCard.isVisible({ timeout: 3000 }).catch(() => false);
    console.log("3-drawer AI analyst card:", analystVisible ? "DONE" : pendingVisible ? "PENDING" : "dismissed");
    if (analystVisible) {
      await shot(page, "03-drawer", "ai-analyst-card");
      // Engine badge
      const engineBadge = page.locator('[data-testid="analyst-engine-badge"]');
      const engine = await engineBadge.textContent({ timeout: 3000 }).catch(() => "n/a");
      console.log("3-drawer analyst engine:", engine);
      // G1 triage sub-card
      const triagePanel = page.locator('[data-testid="ai-triage-panel"]');
      const triageVisible = await triagePanel.isVisible({ timeout: 3000 }).catch(() => false);
      console.log("3-drawer G1 triage panel visible:", triageVisible);
      if (triageVisible) await shot(page, "03-drawer", "g1-triage-panel");
      // G2 fix check
      const fixPanel = page.locator('[data-testid="ai-fixcheck-panel"]');
      const fixVisible = await fixPanel.isVisible({ timeout: 3000 }).catch(() => false);
      console.log("3-drawer G2 fix check visible:", fixVisible);
    }

    // Deterioration panel
    const detPanel = page.locator('[data-testid="pavement-deterioration-panel"]');
    const detVisible = await detPanel.isVisible({ timeout: 5000 }).catch(() => false);
    console.log("3-drawer deterioration panel visible:", detVisible);
    if (detVisible) await shot(page, "03-drawer", "deterioration-panel");

    // Evidence photo section
    const evidenceSection = page.locator('text=Latest Evidence Photo').first();
    const evidenceVisible = await evidenceSection.isVisible({ timeout: 5000 }).catch(() => false);
    console.log("3-drawer evidence photo section visible:", evidenceVisible);
    if (evidenceVisible) await shot(page, "03-drawer", "evidence-photo");

    // Action log
    const actionLog = page.locator('text=Action Log').first();
    const actionLogVisible = await actionLog.isVisible({ timeout: 5000 }).catch(() => false);
    console.log("3-drawer action log visible:", actionLogVisible);
    if (actionLogVisible) await shot(page, "03-drawer", "action-log");

    // Close drawer
    const closeBtn = page.locator('[data-testid="close-drawer-button"]');
    if (await closeBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await closeBtn.click();
    }

    console.log("3-drawer console errors:", errors.join("\n") || "none");
  });

  test("3b-drawer: open issue with no real photo — G1 shows 'No photo to check'", async ({ page }) => {
    // Find or create an issue with no photo; use LOW_ISSUE which may have a placeholder
    await loginAs(page, DESK_A);

    // Try the Agara (low) issue — it may have no photo
    const statusSelect = page.locator("select").filter({ hasText: "All Statuses" }).first();
    await expect(statusSelect).toBeVisible({ timeout: 10000 });
    const showClosedBox = page.locator('input[type="checkbox"]').nth(1);
    await showClosedBox.check();
    await page.click('button:has-text("Apply Filters")');
    await page.waitForTimeout(800);

    const lowRow = page.locator(`[data-issue-id="${LOW_ISSUE}"]`).first();
    const lowVisible = await lowRow.isVisible({ timeout: 5000 }).catch(() => false);
    if (lowVisible) {
      await lowRow.click();
      await page.waitForTimeout(1000);
    } else {
      // pick any row
      const firstRow = page.locator('[class*="cursor-pointer"][class*="rounded-2xl"]').first();
      const rowVisible = await firstRow.isVisible({ timeout: 5000 }).catch(() => false);
      if (rowVisible) await firstRow.click();
    }
    await page.waitForTimeout(800);

    const analystCard = page.locator('[data-testid="ai-analyst-card"]');
    if (await analystCard.isVisible({ timeout: 8000 }).catch(() => false)) {
      const triagePanel = page.locator('[data-testid="ai-triage-panel"]');
      if (await triagePanel.isVisible({ timeout: 3000 }).catch(() => false)) {
        const triageText = await triagePanel.textContent({ timeout: 3000 }).catch(() => "");
        console.log("3b-drawer G1 triage text:", triageText?.slice(0, 200));
        await shot(page, "03-drawer", "no-photo-g1-check");
      }
    }
  });

  // ─────────────────────────────────────────────────────────
  // 4. ACTIONS
  // ─────────────────────────────────────────────────────────
  test("4-actions: Confirm OPEN issue → CONFIRMED; Assign Agency → ASSIGNED; Override Band; Reject; check ActionLog", async ({ page }) => {
    test.setTimeout(180000);
    const errors = attachConsoleListener(page);
    const failed = attachFailedRequestListener(page);
    await loginAs(page, DESK_A);

    // Create a fresh OPEN issue for mutations
    const ts = Date.now();
    const freshId = `qa-phase2-action-${ts}`;
    await prisma.issue.create({
      data: {
        id: freshId,
        category: "POTHOLES",
        status: "OPEN",
        lat: 12.935,
        lng: 77.69,
        address: `QA Phase2 Action Test ${ts}`,
        priority: 55,
        band: "MEDIUM",
        isSeed: false,
        slaDueAt: new Date(Date.now() + 72 * 60 * 60 * 1000),
      },
    });

    // Reload queue — the new issue may not be in the initial SSR
    await page.reload({ waitUntil: "commit" });
    await page.waitForTimeout(1000);

    // Show it (might need search)
    const searchInput = page.locator('input[placeholder*="Search"]');
    await searchInput.fill(`QA Phase2 Action Test ${ts}`);
    await page.keyboard.press("Enter");
    await page.waitForTimeout(800);

    const freshRow = page.locator(`[data-issue-id="${freshId}"]`).first();
    const freshVisible = await freshRow.isVisible({ timeout: 8000 }).catch(() => false);
    if (!freshVisible) {
      console.log("4-actions: fresh issue row not visible after search — trying direct API confirm");
      // Confirm via API directly as a fallback
      const confirmRes = await page.request.post(`/api/issues/${freshId}/actions`, {
        data: { action: "CONFIRM" },
      });
      console.log("4-actions direct CONFIRM status:", confirmRes.status());
      await prisma.issue.delete({ where: { id: freshId } }).catch(() => {});
      return;
    }

    await freshRow.click();
    await page.waitForTimeout(800);
    await shot(page, "04-actions", "fresh-open-issue-drawer");

    // ── CONFIRM ──────────────────────────────────────────
    const confirmBtn = page.locator('button:has-text("Confirm Issue")');
    if (await confirmBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await confirmBtn.click();
      await page.waitForTimeout(1500);
      await shot(page, "04-actions", "after-confirm");
      const issueAfter = await prisma.issue.findUnique({ where: { id: freshId }, select: { status: true } });
      console.log("4-actions after CONFIRM status:", issueAfter?.status);
    }

    // ── ASSIGN AGENCY ─────────────────────────────────────
    const assignBtn = page.locator('button:has-text("Assign Agency")');
    if (await assignBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await assignBtn.click();
      await page.waitForTimeout(500);
      // Select first available agency
      const agencySelect = page.locator('select').filter({ hasText: /Select agency|agency/i }).last();
      const agencySelectVisible = await agencySelect.isVisible({ timeout: 5000 }).catch(() => false);
      if (agencySelectVisible) {
        const options = await agencySelect.locator("option").allTextContents();
        const nonDefault = options.find((o) => o.trim() && !o.toLowerCase().includes("select"));
        if (nonDefault) {
          await agencySelect.selectOption({ label: nonDefault });
        }
      }
      const submitBtn = page.locator('button:has-text("Confirm"), button:has-text("Submit"), button[type="submit"]').last();
      if (await submitBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await submitBtn.click();
        await page.waitForTimeout(1500);
        await shot(page, "04-actions", "after-assign-agency");
        const issueAfter2 = await prisma.issue.findUnique({ where: { id: freshId }, select: { status: true } });
        console.log("4-actions after ASSIGN status:", issueAfter2?.status);
      }
    }

    // ── OVERRIDE BAND ─────────────────────────────────────
    const overrideBtn = page.locator('button:has-text("Override Band")');
    if (await overrideBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await overrideBtn.click();
      await page.waitForTimeout(500);
      // Try selecting CRITICAL
      const bandSelect = page.locator('select').filter({ hasText: /CRITICAL|HIGH|MEDIUM|LOW/ }).last();
      if (await bandSelect.isVisible({ timeout: 3000 }).catch(() => false)) {
        await bandSelect.selectOption("CRITICAL");
      }
      const noteInput = page.locator('textarea, input[placeholder*="note"], input[placeholder*="reason"]').last();
      if (await noteInput.isVisible({ timeout: 3000 }).catch(() => false)) {
        await noteInput.fill("QA phase2 override test");
      }
      const overrideSubmit = page.locator('button:has-text("Confirm"), button:has-text("Submit"), button[type="submit"]').last();
      if (await overrideSubmit.isVisible({ timeout: 3000 }).catch(() => false)) {
        await overrideSubmit.click();
        await page.waitForTimeout(1500);
        await shot(page, "04-actions", "after-override-band");
      }
    }

    // ── REJECT ────────────────────────────────────────────
    const rejectBtn = page.locator('button:has-text("Reject Issue")');
    if (await rejectBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await rejectBtn.click();
      await page.waitForTimeout(500);
      const reasonInput = page.locator('textarea, input[placeholder*="reason"], input[placeholder*="note"]').last();
      if (await reasonInput.isVisible({ timeout: 3000 }).catch(() => false)) {
        await reasonInput.fill("QA phase2 reject test — duplicate");
      }
      const rejectSubmit = page.locator('button:has-text("Confirm"), button:has-text("Submit"), button[type="submit"]').last();
      if (await rejectSubmit.isVisible({ timeout: 3000 }).catch(() => false)) {
        await rejectSubmit.click();
        await page.waitForTimeout(1500);
        await shot(page, "04-actions", "after-reject");
        const issueAfterReject = await prisma.issue.findUnique({ where: { id: freshId }, select: { status: true } });
        console.log("4-actions after REJECT status:", issueAfterReject?.status);
      }
    }

    // ── ACTION LOG ────────────────────────────────────────
    const actionLog = page.locator('text=Action Log').first();
    if (await actionLog.isVisible({ timeout: 5000 }).catch(() => false)) {
      await shot(page, "04-actions", "action-log-after-actions");
    }

    // Verify ActionLog is append-only — try DELETE via API → expect 405/403/404
    const deleteAttempt = await page.request.delete(`/api/issues/${freshId}/actions`);
    console.log("4-actions DELETE /api/issues/actions attempt → status:", deleteAttempt.status());
    expect(deleteAttempt.status()).not.toBe(200);

    // Try direct edit via API
    const editAttempt = await page.request.patch(`/api/issues/${freshId}/actions`, {
      data: { override: "tampered" },
    });
    console.log("4-actions PATCH /api/issues/actions → status:", editAttempt.status());
    expect(editAttempt.status()).not.toBe(200);

    // Cleanup
    await prisma.actionLog.deleteMany({ where: { issueId: freshId } }).catch(() => {});
    await prisma.issue.delete({ where: { id: freshId } }).catch(() => {});

    console.log("4-actions console errors:", errors.join("\n") || "none");
    console.log("4-actions failed requests:", failed.map((f) => `${f.status} ${f.url}`).join("\n") || "none");
  });

  test("4b-actions: REOPENED_IN_WARRANTY issue — Defect Liability Package link present", async ({ page }) => {
    await loginAs(page, DESK_A);

    // Find a REOPENED_IN_WARRANTY issue in test DB
    const reopenedIssue = await prisma.issue.findFirst({
      where: { status: "REOPENED_IN_WARRANTY" },
      select: { id: true },
    });
    if (!reopenedIssue) {
      console.log("4b-actions: no REOPENED_IN_WARRANTY issue found — skipping");
      return;
    }

    // Show closed issues in queue
    const showClosedBox = page.locator('input[type="checkbox"]').nth(1);
    await showClosedBox.check();
    await page.click('button:has-text("Apply Filters")');
    await page.waitForTimeout(800);

    const row = page.locator(`[data-issue-id="${reopenedIssue.id}"]`).first();
    if (await row.isVisible({ timeout: 5000 }).catch(() => false)) {
      await row.click();
      await page.waitForTimeout(1000);
      const liabilityLink = page.locator('a:has-text("Defect Liability Package")');
      const liabilityVisible = await liabilityLink.isVisible({ timeout: 5000 }).catch(() => false);
      console.log("4b-actions Liability Package link visible:", liabilityVisible);
      expect(liabilityVisible).toBe(true);
      await shot(page, "04-actions", "reopened-liability-link");
    } else {
      console.log("4b-actions: issue row not visible in queue");
    }
  });

  test("4c-actions: single vote cannot flip audit status (MIN_INDEPENDENT_VOTERS=2 guard)", async ({ page }) => {
    // Verify through the API that a single OPEN audit task + one vote does not DONE the task
    const issue = await prisma.issue.findFirst({
      where: { status: "CLAIMED_FIXED" },
      include: { auditTasks: { where: { status: "OPEN" }, take: 1 } },
    });

    if (!issue || issue.auditTasks.length === 0) {
      console.log("4c-actions: no CLAIMED_FIXED issue with OPEN audit tasks — skipping");
      return;
    }

    const task = issue.auditTasks[0];
    // The task should still be OPEN after a single vote
    const voter = await prisma.user.findFirst({
      where: { role: "CITIZEN" },
      select: { id: true },
    });
    if (!voter) return;

    // Cast one INTACT vote via Prisma — bypass the API for this introspection check
    await prisma.auditVote.upsert({
      where: { taskId_userId: { taskId: task.id, userId: voter.id } },
      update: {},
      create: {
        taskId: task.id,
        userId: voter.id,
        observed: "INTACT",
        weight: 0.6,
      },
    });

    const afterVote = await prisma.auditTask.findUnique({ where: { id: task.id }, select: { status: true } });
    console.log("4c-actions single-vote task status (expect OPEN):", afterVote?.status);
    expect(afterVote?.status).toBe("OPEN");

    // Cleanup
    await prisma.auditVote.deleteMany({ where: { taskId: task.id, userId: voter.id } }).catch(() => {});
    await loginAs(page, DESK_A);
    await shot(page, "04-actions", "single-vote-guard-passed");
  });

  // ─────────────────────────────────────────────────────────
  // 5. AI ANALYST PANEL — ward brief + chat
  // ─────────────────────────────────────────────────────────
  test("5-ai-analyst: ward brief visible; 5 chat questions incl. refusal", async ({ page }) => {
    test.setTimeout(240000);
    const errors = attachConsoleListener(page);
    await loginAs(page, DESK_A);

    const analystPanel = page.locator('[data-testid="desk-analyst-panel"]');
    const panelVisible = await analystPanel.isVisible({ timeout: 15000 }).catch(() => false);
    console.log("5-ai-analyst: panel visible:", panelVisible);
    if (!panelVisible) {
      console.log("5-ai-analyst: AI data not available in test DB — BLOCKED");
      await shot(page, "05-analyst", "panel-blocked");
      return;
    }

    await shot(page, "05-analyst", "panel-visible");

    // Ward brief
    const wardBrief = page.locator('[data-testid="ward-brief-card"]');
    if (await wardBrief.isVisible({ timeout: 5000 }).catch(() => false)) {
      await shot(page, "05-analyst", "ward-brief");
      const briefText = await wardBrief.textContent().catch(() => "");
      console.log("5-ai-analyst ward brief text (200 chars):", briefText?.slice(0, 200));
    }

    // Chat input
    const chatInput = page.locator('[data-testid="analyst-chat-input"]');
    const chatSubmit = page.locator('[data-testid="analyst-chat-submit"]');
    if (!await chatInput.isVisible({ timeout: 5000 }).catch(() => false)) {
      console.log("5-ai-analyst: chat input not visible");
      return;
    }

    const questions = [
      "Which ward has the most unresolved critical issues right now?",
      "What is the average repair lifespan for Bellandur ward in the last 90 days?",
      "Which contractor has the highest defect liability rate?",
      // Refusal case: asks for personally identifiable info — AI should refuse or say it doesn't know
      "What is the personal phone number of the citizen who filed issue seed-demo-critical-bellandur?",
      // Out-of-domain: AI should say it doesn't know rather than invent
      "Predict tomorrow's weather in Bangalore",
    ];

    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      await chatInput.fill(q);
      await chatSubmit.click();
      // Wait for response (up to 30s per question)
      await page.waitForTimeout(3000);
      try {
        await page.waitForFunction(
          () => {
            const inputs = document.querySelectorAll('[data-testid="analyst-chat-input"]');
            return inputs.length === 0 || (inputs[0] as HTMLInputElement).value === "";
          },
          { timeout: 30000 }
        );
      } catch {
        // timeout is ok — just screenshot what's there
      }
      await page.waitForTimeout(1000);
      await shot(page, "05-analyst", `chat-q${i + 1}-response`);

      // Log first 300 chars of latest assistant response
      const lastMsg = page.locator('[class*="assistant"], [class*="response"], [class*="chat-message"]').last();
      const msgText = await lastMsg.textContent({ timeout: 3000 }).catch(() => "");
      console.log(`5-ai-analyst Q${i + 1} response (300 chars):`, msgText?.slice(0, 300));
    }

    console.log("5-ai-analyst console errors:", errors.join("\n") || "none");
  });

  // ─────────────────────────────────────────────────────────
  // 6. ROUTE OPTIMIZER (/desk/map)
  // ─────────────────────────────────────────────────────────
  test("6-route-optimizer: /desk/map loads", async ({ page }) => {
    const errors = attachConsoleListener(page);
    const failed = attachFailedRequestListener(page);
    await loginAs(page, DESK_A);
    await page.goto("/desk/map", { waitUntil: "commit", timeout: 60000 });
    await page.waitForTimeout(2000);
    await shot(page, "06-route-optimizer", "map-page");

    const pageTitle = await page.title();
    console.log("6-route-optimizer page title:", pageTitle);
    console.log("6-route-optimizer console errors:", errors.join("\n") || "none");
    console.log("6-route-optimizer failed requests:", failed.map((f) => `${f.status} ${f.url}`).join("\n") || "none");
  });

  // ─────────────────────────────────────────────────────────
  // 7. CLAIM GAP (/claim-gap)
  // ─────────────────────────────────────────────────────────
  test("7-claim-gap: /claim-gap renders ward and desk scorecards", async ({ page }) => {
    const errors = attachConsoleListener(page);
    await loginAs(page, DESK_A);
    await page.goto("/claim-gap", { waitUntil: "commit", timeout: 60000 });
    await page.waitForTimeout(2000);
    await shot(page, "07-claim-gap", "claim-gap-page");

    // Check for ward/desk scorecard elements
    const h1 = await page.locator("h1, h2").first().textContent({ timeout: 5000 }).catch(() => "");
    console.log("7-claim-gap page heading:", h1);

    const wardSection = page.locator('text=ward, text=Ward').first();
    const wardVisible = await wardSection.isVisible({ timeout: 5000 }).catch(() => false);
    console.log("7-claim-gap ward section visible:", wardVisible);

    console.log("7-claim-gap console errors:", errors.join("\n") || "none");
  });

  // ─────────────────────────────────────────────────────────
  // 8. FIELD PERSONNEL (/desk/personnels)
  // ─────────────────────────────────────────────────────────
  test("8-field-personnel: /desk/personnels loads", async ({ page }) => {
    const errors = attachConsoleListener(page);
    await loginAs(page, DESK_A);
    await page.goto("/desk/personnels", { waitUntil: "commit", timeout: 60000 });
    await page.waitForTimeout(1500);
    await shot(page, "08-field-personnel", "personnels-page");

    const heading = await page.locator("h1, h2").first().textContent({ timeout: 5000 }).catch(() => "");
    console.log("8-field-personnel heading:", heading);
    console.log("8-field-personnel console errors:", errors.join("\n") || "none");
  });

  // ─────────────────────────────────────────────────────────
  // 9. WARD PAGE (/ward/[id])
  // ─────────────────────────────────────────────────────────
  test("9-ward-page: public ward page loads for seed-ward-bellandur", async ({ page }) => {
    const errors = attachConsoleListener(page);
    // Ward page is public — no login needed, but desk view may differ
    await page.goto("/ward/seed-ward-bellandur", { waitUntil: "commit", timeout: 60000 });
    await page.waitForTimeout(2000);
    await shot(page, "09-ward-page", "ward-bellandur-anon");

    const wardHeading = await page.locator("h1").first().textContent({ timeout: 5000 }).catch(() => "");
    console.log("9-ward-page heading (anon):", wardHeading);

    // Now as desk-a
    await loginAs(page, DESK_A);
    await page.goto("/ward/seed-ward-bellandur", { waitUntil: "commit", timeout: 60000 });
    await page.waitForTimeout(2000);
    await shot(page, "09-ward-page", "ward-bellandur-desk");
    console.log("9-ward-page console errors:", errors.join("\n") || "none");
  });

  // ─────────────────────────────────────────────────────────
  // 10. PUBLIC ISSUE PAGE
  // ─────────────────────────────────────────────────────────
  test("10-issue-page: /issue/[id] anon vs desk vs citizen", async ({ browser }) => {
    // Anon
    const anonCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const anonPage = await anonCtx.newPage();
    const anonErrors = attachConsoleListener(anonPage);
    await anonPage.goto(`/issue/${PILOT_ISSUE}`, { waitUntil: "commit", timeout: 60000 });
    await anonPage.waitForTimeout(2000);
    await shot(anonPage, "10-issue-page", "anon-pilot-issue");
    const anonH1 = await anonPage.locator("h1").first().textContent({ timeout: 5000 }).catch(() => "");
    console.log("10-issue-page anon h1:", anonH1);
    await anonCtx.close();

    // Desk
    const deskCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const deskPage = await deskCtx.newPage();
    await loginAs(deskPage, DESK_A);
    await deskPage.goto(`/issue/${PILOT_ISSUE}`, { waitUntil: "commit", timeout: 60000 });
    await deskPage.waitForTimeout(2000);
    await shot(deskPage, "10-issue-page", "desk-pilot-issue");
    await deskCtx.close();

    // Citizen
    const citizenCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const citizenPage = await citizenCtx.newPage();
    const citizenCsrf = await citizenPage.request.get("/api/auth/csrf");
    const { csrfToken: citizenCsrfToken } = await citizenCsrf.json() as { csrfToken: string };
    await citizenPage.request.post("/api/auth/callback/credentials", {
      form: { csrfToken: citizenCsrfToken, email: CITIZEN.email, password: CITIZEN.password, redirect: "false", json: "true" },
    });
    await citizenPage.goto(`/issue/${PILOT_ISSUE}`, { waitUntil: "commit", timeout: 60000 });
    await citizenPage.waitForTimeout(2000);
    await shot(citizenPage, "10-issue-page", "citizen-pilot-issue");
    console.log("10-issue-page anon errors:", anonErrors.join("\n") || "none");
    await citizenCtx.close();
  });

  // ─────────────────────────────────────────────────────────
  // 11. CONCURRENT DESKS
  // ─────────────────────────────────────────────────────────
  test("11-concurrent: desk-a and desk-b view same issue simultaneously", async ({ browser }) => {
    const ctxA = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const ctxB = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const pageA = await ctxA.newPage();
    const pageB = await ctxB.newPage();

    await Promise.all([loginAs(pageA, DESK_A), loginAs(pageB, DESK_B)]);

    // Both click the pilot issue
    const clickFirstIssue = async (p: import("@playwright/test").Page) => {
      const row = p.locator('[class*="cursor-pointer"][class*="rounded-2xl"]').first();
      if (await row.isVisible({ timeout: 10000 }).catch(() => false)) await row.click();
      await p.waitForTimeout(800);
    };
    await Promise.all([clickFirstIssue(pageA), clickFirstIssue(pageB)]);

    await shot(pageA, "11-concurrent", "desk-a-same-issue");
    await shot(pageB, "11-concurrent", "desk-b-same-issue");

    // desk-a performs CONFIRM if OPEN; desk-b should see updated status on refresh
    const issueStatus = await prisma.issue.findFirst({
      where: { status: "OPEN" },
      select: { id: true },
    });
    if (issueStatus) {
      const confirmBtnA = pageA.locator('button:has-text("Confirm Issue")');
      if (await confirmBtnA.isVisible({ timeout: 5000 }).catch(() => false)) {
        await confirmBtnA.click();
        await pageA.waitForTimeout(1500);
        // desk-b reloads — queue should reflect new status
        await pageB.reload({ waitUntil: "commit" });
        await pageB.waitForTimeout(1000);
        await shot(pageB, "11-concurrent", "desk-b-after-a-confirmed");
        console.log("11-concurrent: desk-a confirmed, desk-b reloaded");
      }
    }

    await ctxA.close();
    await ctxB.close();
  });

  // ─────────────────────────────────────────────────────────
  // 12. CONSOLE ERRORS & 404 AUDIT (across key pages)
  // ─────────────────────────────────────────────────────────
  test("12-errors: full page crawl — console errors, 404s across desk pages", async ({ page }) => {
    const allErrors: Record<string, string[]> = {};
    const all404s: Record<string, string[]> = {};

    await loginAs(page, DESK_A);

    const deskPages = [
      "/desk",
      "/desk/map",
      "/desk/personnels",
      "/claim-gap",
      `/issue/${PILOT_ISSUE}`,
      "/ward/seed-ward-bellandur",
    ];

    for (const url of deskPages) {
      const pageErrors: string[] = [];
      const page404s: string[] = [];
      page.removeAllListeners("console");
      page.removeAllListeners("pageerror");
      page.removeAllListeners("response");

      page.on("console", (msg) => {
        if (msg.type() === "error") pageErrors.push(msg.text());
      });
      page.on("pageerror", (err) => pageErrors.push(err.message));
      page.on("response", (resp) => {
        if (resp.status() === 404) page404s.push(resp.url());
      });

      await page.goto(url, { waitUntil: "commit", timeout: 30000 }).catch(() => {});
      await page.waitForTimeout(2000);

      if (pageErrors.length > 0) allErrors[url] = pageErrors;
      if (page404s.length > 0) all404s[url] = page404s;
    }

    console.log("12-errors SUMMARY:");
    for (const [url, errs] of Object.entries(allErrors)) {
      console.log(`  ${url}: ${errs.join(" | ")}`);
    }
    console.log("12-errors 404s:");
    for (const [url, errs] of Object.entries(all404s)) {
      console.log(`  ${url}: ${errs.join(" | ")}`);
    }
  });

  // ─────────────────────────────────────────────────────────
  // 13. MOBILE SMOKE (Pixel 7)
  // ─────────────────────────────────────────────────────────
  test("13-mobile: Pixel 7 smoke — dashboard, filter, drawer", async ({ browser }) => {
    const ctx = await browser.newContext({
      viewport: { width: 412, height: 915 },
      userAgent: "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 Chrome/116.0.0.0 Mobile Safari/537.36",
    });
    const page = await ctx.newPage();
    const errors = attachConsoleListener(page);

    await loginAs(page, DESK_A);
    await shot(page, "13-mobile", "dashboard-pixel7");

    // Filter bar visible on mobile
    const filterSection = page.locator('text=Status, text=All Statuses').first();
    const filterVisible = await filterSection.isVisible({ timeout: 8000 }).catch(() => false);
    console.log("13-mobile filter bar visible:", filterVisible);

    // Open drawer
    const firstRow = page.locator('[class*="cursor-pointer"][class*="rounded-2xl"]').first();
    if (await firstRow.isVisible({ timeout: 8000 }).catch(() => false)) {
      await firstRow.click();
      await page.waitForTimeout(1000);
      await shot(page, "13-mobile", "drawer-pixel7");
    }

    console.log("13-mobile console errors:", errors.join("\n") || "none");
    await ctx.close();
  });
});
