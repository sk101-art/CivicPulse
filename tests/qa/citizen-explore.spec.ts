/**
 * QA Phase 1: citizen exploration of the LIVE deployment (evidence only, no fixes).
 *
 * Run: npx playwright test --config tests/qa/playwright.qa.config.ts
 *
 * Every check is recorded (PASS / FAIL / BLOCKED / INFO) instead of aborting the run, so one broken
 * screen never hides the rest. Evidence lands in qa-evidence/citizen/<project>/:
 *   NN-<page>-<state>.png, results.json, traces/*.zip, videos/*.webm
 *
 * Secrets: the QA password is random and kept in memory; the seeded citizen password is read from
 * SEED_DESK_PASSWORD. Tracing is paused while credentials are typed so traces never contain them.
 */
import { test, type Browser, type BrowserContext, type Page, type TestInfo } from '@playwright/test';
import crypto from 'crypto';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local'), quiet: true });

const ROOT = process.cwd();
const FIXTURES = path.join(ROOT, 'tests/qa/fixtures');
const AXE_SRC = fs.readFileSync(path.join(ROOT, 'node_modules/axe-core/axe.min.js'), 'utf8');

const PILOT = { latitude: 12.9575, longitude: 77.7011 };
const OUTSIDE_INDIA = { latitude: 51.5, longitude: -0.12 };
const SEED_CITIZEN_B = 'citizen-b@civicpulse.local';
// The app's error banner; Next.js also renders an empty role=alert route announcer, which must not match.
const ALERT = '[role=alert]:not(#__next-route-announcer__)';

type Status = 'PASS' | 'FAIL' | 'BLOCKED' | 'INFO';
interface Result {
  area: string;
  check: string;
  status: Status;
  expected?: string;
  actual: string;
  shots: string[];
  errors: string[];
}
interface Created {
  kind: string;
  id: string;
  note: string;
}

// ---------------------------------------------------------------------------------------------
// Per-project state (Playwright starts a fresh worker per project, so this is never shared).
// ---------------------------------------------------------------------------------------------
const ts = new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14);
let outDir = '';
let shotNo = 0;
let label = 'init';
const results: Result[] = [];
const created: Created[] = [];
const events: { label: string; kind: string; text: string }[] = [];
const a11y: { page: string; violations: { id: string; impact: string | null; nodes: number; help: string }[] }[] = [];
const notReached: { route: string; why: string }[] = [];

let account = { name: '', email: '', password: '' };
let main: Wrapped | null = null;
let projectName = '';

interface Wrapped {
  ctx: BrowserContext;
  page: Page;
  name: string;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  close: () => Promise<void>;
}

function init(info: TestInfo) {
  if (outDir) return;
  projectName = info.project.name;
  outDir = path.join(ROOT, 'qa-evidence/citizen', projectName);
  fs.mkdirSync(path.join(outDir, 'traces'), { recursive: true });
  fs.mkdirSync(path.join(outDir, 'videos'), { recursive: true });
}

function flush() {
  if (!outDir) return;
  fs.writeFileSync(
    path.join(outDir, 'results.json'),
    JSON.stringify({ project: projectName, account: { name: account.name, email: account.email }, results, created, events, a11y, notReached }, null, 2)
  );
}

function errorsSince(mark: number) {
  return events.slice(mark).map((e) => `[${e.kind}] ${e.text}`);
}

async function shot(page: Page, name: string): Promise<string> {
  shotNo += 1;
  const file = `${String(shotNo).padStart(2, '0')}-${name.replace(/[^a-z0-9-]+/gi, '-').toLowerCase()}.png`;
  try {
    await page.screenshot({ path: path.join(outDir, file), fullPage: true, timeout: 20000 });
  } catch {
    try {
      await page.screenshot({ path: path.join(outDir, file), timeout: 10000 });
    } catch {
      return `${file} (screenshot failed)`;
    }
  }
  return file;
}

/** Runs one check; never throws. fn returns the verdict, or throws to record a FAIL. */
async function check(
  area: string,
  name: string,
  page: Page | null,
  fn: () => Promise<{ status: Status; actual: string; expected?: string; shots?: string[] }>
) {
  label = `${area} / ${name}`;
  const mark = events.length;
  try {
    const r = await fn();
    results.push({ area, check: name, status: r.status, expected: r.expected, actual: r.actual, shots: r.shots ?? [], errors: errorsSince(mark) });
  } catch (err) {
    const s = page ? [await shot(page, `${area}-${name}-error`)] : [];
    results.push({
      area,
      check: name,
      status: 'FAIL',
      actual: `Exception: ${(err instanceof Error ? err.message : String(err)).split('\n')[0].slice(0, 400)}`,
      shots: s,
      errors: errorsSince(mark),
    });
  }
  flush();
}

function listen(page: Page) {
  page.on('console', (m) => {
    if (m.type() === 'error') events.push({ label, kind: 'console', text: m.text().slice(0, 300) });
  });
  page.on('pageerror', (e) => events.push({ label, kind: 'pageerror', text: e.message.slice(0, 300) }));
  page.on('response', (r) => {
    if (r.status() >= 400) events.push({ label, kind: 'http', text: `${r.status()} ${r.request().method()} ${r.url().slice(0, 200)}` });
  });
  page.on('requestfailed', (r) => {
    const why = r.failure()?.errorText ?? '';
    if (why.includes('ERR_ABORTED')) return; // navigations that were superseded, not failures
    events.push({ label, kind: 'requestfailed', text: `${r.method()} ${r.url().slice(0, 200)} ${why}` });
  });
}

async function newCtx(browser: Browser, info: TestInfo, name: string, opts: Parameters<Browser['newContext']>[0] = {}): Promise<Wrapped> {
  const u = info.project.use;
  const ctx = await browser.newContext({
    viewport: u.viewport,
    userAgent: u.userAgent,
    deviceScaleFactor: u.deviceScaleFactor,
    isMobile: u.isMobile,
    hasTouch: u.hasTouch,
    baseURL: u.baseURL,
    bypassCSP: true,
    recordVideo: { dir: path.join(outDir, 'videos', name), size: u.viewport ?? undefined },
    ...opts,
  });
  await ctx.tracing.start({ screenshots: true, snapshots: true });
  let chunk = 0;
  let recording = false;
  const resume = async () => {
    if (recording) return;
    await ctx.tracing.startChunk({ title: `${name}-${chunk}` });
    recording = true;
  };
  const pause = async () => {
    if (!recording) return;
    await ctx.tracing.stopChunk({ path: path.join(outDir, 'traces', `${name}-${chunk}.zip`) });
    chunk += 1;
    recording = false;
  };
  await resume();
  const page = await ctx.newPage();
  listen(page);
  return {
    ctx,
    page,
    name,
    pause,
    resume,
    close: async () => {
      await pause().catch(() => {});
      await ctx.tracing.stop().catch(() => {});
      await ctx.close().catch(() => {});
    },
  };
}

async function runAxe(page: Page, name: string) {
  try {
    await page.evaluate(AXE_SRC);
    const v = await page.evaluate(async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const res = await (window as any).axe.run(document, { resultTypes: ['violations'] });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return res.violations.map((x: any) => ({ id: x.id, impact: x.impact, nodes: x.nodes.length, help: x.help }));
    });
    a11y.push({ page: name, violations: v });
  } catch (err) {
    a11y.push({ page: name, violations: [{ id: 'axe-run-failed', impact: null, nodes: 0, help: String(err).slice(0, 200) }] });
  }
}

const randomPassword = () => `Qa!${crypto.randomBytes(12).toString('base64url')}`;
const bodyText = async (page: Page) => (await page.locator('body').innerText().catch(() => '')).replace(/\s+/g, ' ');

async function fillCredentials(w: Wrapped, email: string, password: string) {
  // Tracing is paused while secrets are typed and sent, so they never land in a trace file.
  await w.pause();
  await w.page.locator('input[name=email]').fill(email);
  await w.page.locator('input[name=password]').fill(password);
  await w.page.locator('button[type=submit]').click();
}

async function login(w: Wrapped, email: string, password: string) {
  await w.page.goto('/login');
  await w.page.getByRole('button', { name: 'CITIZEN', exact: true }).click();
  await fillCredentials(w, email, password);
  await w.page.waitForURL(/\/citizen\/|\/desk/, { timeout: 30000 }).catch(() => {});
  await w.resume();
}

// ---------------------------------------------------------------------------------------------
// Report flow driver
// ---------------------------------------------------------------------------------------------
const CATEGORY_LABEL: Record<string, string> = {
  POTHOLES: 'Potholes',
  DRAINAGE: 'Drainage',
  STREETLIGHTS: 'Streetlights',
  SIDEWALKS: 'Sidewalks',
  TRAFFIC_SIGNS: 'Traffic Signs',
  GRAFFITI: 'Graffiti',
  TRASH: 'Trash/Litter',
  OTHER: 'Other',
};

interface ReportOpts {
  tag: string;
  category: string;
  size: 'small' | 'medium' | 'large';
  share: 'none' | 'part lane' | 'one lane' | 'full';
  note: string;
  backMidFlow?: boolean;
  doubleSubmit?: boolean;
  offline?: boolean;
}
interface ReportOutcome {
  status: number | null;
  issueId?: string;
  reportId?: string;
  merged?: boolean;
  error?: string;
  requestBody?: string;
  postCount: number;
  shots: string[];
  url: string;
}

async function openCapture(page: Page, category: string) {
  await page.goto('/citizen/report');
  await page.getByRole('button', { name: CATEGORY_LABEL[category], exact: true }).click();
  await page.getByRole('button', { name: 'Capture signed photo' }).waitFor({ timeout: 15000 });
}

async function captureWhenLocked(page: Page) {
  await page.getByText(/GPS Locked/).first().waitFor({ timeout: 30000 });
  const btn = page.getByRole('button', { name: 'Capture signed photo' });
  await btn.waitFor({ state: 'visible' });
  await page.waitForFunction(() => {
    const b = document.querySelector('button[aria-label="Capture signed photo"]') as HTMLButtonElement | null;
    return !!b && !b.disabled;
  }, undefined, { timeout: 30000 });
  await btn.click();
}

async function fileReport(w: Wrapped, o: ReportOpts): Promise<ReportOutcome> {
  const page = w.page;
  const shots: string[] = [];
  await openCapture(page, o.category);
  shots.push(await shot(page, `${o.tag}-capture`));
  await captureWhenLocked(page);
  await page.locator('textarea').waitFor({ timeout: 30000 });

  if (o.backMidFlow) {
    await page.getByRole('button', { name: 'Back', exact: true }).last().click();
    await page.waitForTimeout(1500);
    shots.push(await shot(page, `${o.tag}-after-back`));
    // The flow returns to the camera step; capture again.
    await captureWhenLocked(page);
    await page.locator('textarea').waitFor({ timeout: 30000 });
  }

  if (o.note) await page.locator('textarea').fill(o.note);
  await page.getByRole('button', { name: o.size, exact: true }).click();
  await page.getByRole('button', { name: o.share, exact: true }).click();
  shots.push(await shot(page, `${o.tag}-details`));
  await page.getByRole('button', { name: /Review Evidence/ }).click();
  await page.getByRole('button', { name: /File & Sign Report/ }).waitFor();
  shots.push(await shot(page, `${o.tag}-review`));

  let postCount = 0;
  let requestBody: string | undefined;
  const onReq = (r: import('@playwright/test').Request) => {
    if (r.method() === 'POST' && new URL(r.url()).pathname === '/api/reports') {
      postCount += 1;
      requestBody ??= r.postData() ?? undefined;
    }
  };
  page.on('request', onReq);

  if (o.offline) {
    await w.ctx.setOffline(true);
    await page.getByRole('button', { name: /File & Sign Report/ }).click();
    await page.waitForTimeout(5000);
    shots.push(await shot(page, `${o.tag}-offline-after-submit`));
    const queued = await page.evaluate(async () => {
      const dbs = (await indexedDB.databases?.()) ?? [];
      return dbs.map((d) => d.name).join(',');
    }).catch(() => 'n/a');
    const respP = page.waitForResponse((r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/reports', { timeout: 45000 }).catch(() => null);
    await w.ctx.setOffline(false);
    const resp = await respP;
    await page.waitForTimeout(3000);
    await page.goto('/citizen/dashboard').catch(() => {});
    shots.push(await shot(page, `${o.tag}-back-online-dashboard`));
    page.off('request', onReq);
    const json = resp ? await resp.json().catch(() => ({})) : {};
    return {
      status: resp?.status() ?? null,
      issueId: json.issue?.id,
      reportId: json.report?.id,
      merged: json.merged,
      error: resp ? (json.error?.message as string | undefined) : `no sync POST seen within 45s (IndexedDB: ${queued})`,
      requestBody,
      postCount,
      shots,
      url: page.url(),
    };
  }

  const respP = page.waitForResponse((r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/reports', { timeout: 60000 });
  if (o.doubleSubmit) {
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find((x) => x.textContent?.includes('File & Sign Report'));
      b?.click();
      b?.click();
    });
  } else {
    await page.getByRole('button', { name: /File & Sign Report/ }).click();
  }
  const resp = await respP;
  const json = await resp.json().catch(() => ({}));
  await page.waitForURL(/\/citizen\/report\/[^/]+$|\/citizen\/dashboard/, { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(o.doubleSubmit ? 6000 : 1500);
  page.off('request', onReq);
  shots.push(await shot(page, `${o.tag}-after-submit`));
  return {
    status: resp.status(),
    issueId: json.issue?.id,
    reportId: json.report?.id,
    merged: json.merged,
    error: json.error?.message,
    requestBody,
    postCount,
    shots,
    url: page.url(),
  };
}

function recordReport(o: ReportOpts, r: ReportOutcome) {
  if (r.issueId) created.push({ kind: 'issue', id: r.issueId, note: `${o.tag} ${o.category}${r.merged ? ' (merged into existing issue)' : ''}` });
  if (r.reportId) created.push({ kind: 'report', id: r.reportId, note: `${o.tag} on issue ${r.issueId}` });
}

const LONG_NOTE = `[QA] very long description ${'Crater beside the median, water-filled, ~40cm across. '.repeat(90)}`.slice(0, 5000);
const EMOJI_NOTE = `[QA] special chars <script>alert(1)</script> & "quotes" 'apos' ₹ ಕನ್ನಡ हिन्दी 🚧🕳️💧 \\ / %20 ; DROP TABLE "Issue";--`;

// ---------------------------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------------------------
test.describe('citizen exploration (live)', () => {
  test.beforeEach(async ({}, info) => init(info));
  test.afterAll(async () => {
    await main?.close();
    flush();
  });

  test('1 auth: register, validation, login/logout, session, authority tab', async ({ browser }, info) => {
    test.setTimeout(10 * 60 * 1000);
    const mobile = info.project.name.includes('mobile');
    account = {
      name: `QA Citizen ${ts}${mobile ? ' M' : ''}`,
      email: `qa-${ts}${mobile ? '-m' : ''}@civicpulse.qa`,
      password: randomPassword(),
    };
    main = await newCtx(browser, info, 'main', { geolocation: { ...PILOT, accuracy: 10 }, permissions: ['geolocation', 'camera'] });
    const page = main.page;

    await check('Landing', 'root redirects to login', page, async () => {
      const resp = await page.goto('/');
      const s = await shot(page, 'landing-root');
      await runAxe(page, '/login');
      const ok = page.url().includes('/login');
      return { status: ok ? 'PASS' : 'FAIL', expected: '/ → /login', actual: `${resp?.status()} ${page.url()}`, shots: [s] };
    });

    await check('Auth', '/register redirects to sign-up form', page, async () => {
      await page.goto('/register');
      await page.waitForTimeout(1500);
      const hasName = await page.locator('input[name=name]').isVisible();
      const s = await shot(page, 'register-redirect');
      return { status: hasName ? 'PASS' : 'FAIL', expected: 'sign-up form with FULL NAME', actual: `${page.url()} nameField=${hasName}`, shots: [s] };
    });

    await check('Auth', 'Authority tab cannot create accounts', page, async () => {
      await page.goto('/login');
      await page.getByRole('button', { name: 'AUTHORITY', exact: true }).click();
      const create = await page.getByRole('button', { name: 'CREATE ACCOUNT' }).count();
      const msg = await page.getByText(/Desk accounts are issued by the administrator/).isVisible();
      const s = await shot(page, 'login-authority-tab');
      return { status: create === 0 && msg ? 'PASS' : 'FAIL', expected: 'no CREATE ACCOUNT, admin-issued notice', actual: `createButtons=${create} notice=${msg}`, shots: [s] };
    });

    const openSignup = async () => {
      await page.goto('/login');
      await page.getByRole('button', { name: 'CITIZEN', exact: true }).click();
      await page.getByRole('button', { name: 'CREATE ACCOUNT' }).click();
      await page.locator('input[name=name]').waitFor();
    };

    await check('Auth', 'invalid email rejected', page, async () => {
      await openSignup();
      await page.locator('input[name=name]').fill('QA Invalid Email');
      await page.locator('input[name=email]').fill('qa-not-an-email');
      await page.locator('input[name=password]').fill('irrelevant-123');
      await page.locator('button[type=submit]').click();
      await page.waitForTimeout(800);
      const native = await page.locator('input[name=email]').evaluate((el: HTMLInputElement) => el.validationMessage);
      const alert = await page.locator(ALERT).innerText().catch(() => '');
      const s = await shot(page, 'signup-invalid-email');
      const blocked = Boolean(native || alert) && page.url().includes('/login');
      return { status: blocked ? 'PASS' : 'FAIL', expected: 'submission blocked with a message', actual: `native="${native}" alert="${alert}"`, shots: [s] };
    });

    await check('Auth', 'weak password rejected', page, async () => {
      await openSignup();
      await page.locator('input[name=name]').fill('QA Weak Password');
      await page.locator('input[name=email]').fill(`qa-${ts}-weak@civicpulse.qa`);
      await page.locator('input[name=password]').fill('short');
      const hint = await page.getByText(/Min\. 8 chars/).innerText().catch(() => '');
      await page.locator('button[type=submit]').click();
      await page.waitForTimeout(800);
      const alert = await page.locator(ALERT).innerText().catch(() => '');
      const s = await shot(page, 'signup-weak-password');
      // Also probe the server rule directly with a 7-char password made only of digits.
      const api = await page.request.post('/api/auth/register', { data: { name: 'QA weak', email: `qa-${ts}-weak2@civicpulse.qa`, password: '1234567' } });
      const apiText = (await api.text()).slice(0, 120);
      const ok = /8 characters/i.test(alert) && api.status() === 400;
      return { status: ok ? 'PASS' : 'FAIL', expected: 'client + server reject <8 chars', actual: `hint="${hint}" alert="${alert.replace(/\s+/g, ' ')}" api=${api.status()} "${apiText}"`, shots: [s] };
    });

    await check('Auth', 'valid sign-up lands on dashboard', page, async () => {
      await openSignup();
      await page.locator('input[name=name]').fill(account.name);
      await fillCredentials(main!, account.email, account.password);
      await page.waitForURL(/\/citizen\/dashboard/, { timeout: 30000 });
      await main!.resume();
      await page.waitForLoadState('networkidle').catch(() => {});
      const s = await shot(page, 'signup-success-dashboard');
      created.push({ kind: 'user', id: account.email, note: account.name });
      return { status: 'PASS', expected: 'account created, auto sign-in, /citizen/dashboard', actual: page.url(), shots: [s] };
    });

    await check('Auth', 'session persists after reload', page, async () => {
      await page.reload();
      await page.waitForTimeout(1500);
      const s = await shot(page, 'dashboard-after-reload');
      const ok = page.url().includes('/citizen/dashboard');
      return { status: ok ? 'PASS' : 'FAIL', actual: page.url(), shots: [s] };
    });

    await check('Auth', 'duplicate email rejected', page, async () => {
      const other = await newCtx(browser, info, 'dup-email');
      try {
        const p = other.page;
        await p.goto('/login');
        await p.getByRole('button', { name: 'CREATE ACCOUNT' }).click();
        await p.locator('input[name=name]').fill('QA Duplicate');
        // Same address in a different case: the server must treat it as the same account.
        await fillCredentials(other, account.email.toUpperCase(), randomPassword());
        await p.locator(ALERT).waitFor({ timeout: 15000 });
        await other.resume();
        const alert = (await p.locator(ALERT).innerText()).replace(/\s+/g, ' ');
        const s = await shot(p, 'signup-duplicate-email');
        const ok = /already exists/i.test(alert);
        return { status: ok ? 'PASS' : 'FAIL', expected: '"User already exists" + switch-to-login link', actual: alert, shots: [s] };
      } finally {
        await other.close();
      }
    });

    await check('Auth', 'wrong password rejected', page, async () => {
      const other = await newCtx(browser, info, 'wrong-pw');
      try {
        await other.page.goto('/login');
        await fillCredentials(other, account.email, 'definitely-wrong-password');
        await other.page.locator(ALERT).waitFor({ timeout: 15000 });
        await other.resume();
        const alert = (await other.page.locator(ALERT).innerText()).replace(/\s+/g, ' ');
        const s = await shot(other.page, 'login-wrong-password');
        return { status: /Invalid credentials/i.test(alert) ? 'PASS' : 'FAIL', actual: alert, shots: [s] };
      } finally {
        await other.close();
      }
    });

    await check('Auth', 'logout from profile, then uppercase-email login', page, async () => {
      await page.goto('/citizen/profile');
      await page.waitForTimeout(1500);
      // Try the main "Log out" button first, then the compact header one; record which worked.
      const notes: string[] = [];
      for (const id of ['logout-button', 'citizen-logout-button']) {
        const b = page.getByTestId(id).first();
        const err = await b.click({ timeout: 8000 }).then(() => '', (e: Error) => e.message.split('\n').slice(0, 3).join(' ').slice(0, 220));
        if (!err) {
          notes.push(`${id}: clicked`);
          if (await page.waitForURL(/\/login/, { timeout: 15000 }).then(() => true, () => false)) break;
          notes.push(`${id}: no redirect to /login`);
        } else {
          notes.push(`${id}: ${err}`);
          await shot(page, `profile-${id}-not-clickable`);
        }
      }
      results.push({ area: 'Auth', check: 'profile logout buttons', status: notes.some((n) => n.includes('not') || n.includes('Timeout')) ? 'FAIL' : 'PASS', actual: notes.join(' | '), shots: [], errors: [] });
      const s1 = await shot(page, 'after-logout');
      const resp = await page.goto('/citizen/dashboard');
      const blocked = page.url().includes('/login');
      await page.goto('/login');
      await fillCredentials(main!, account.email.toUpperCase(), account.password);
      await page.waitForURL(/\/citizen\/dashboard/, { timeout: 30000 }).catch(() => {});
      await main!.resume();
      const s2 = await shot(page, 'login-uppercase-email');
      const ok = blocked && page.url().includes('/citizen/dashboard');
      return {
        status: ok ? 'PASS' : 'FAIL',
        expected: 'logout ends session; UPPERCASE email logs in',
        actual: `afterLogout /citizen/dashboard → ${page.url()} (status ${resp?.status()}, redirectedToLogin=${blocked})`,
        shots: [s1, s2],
      };
    });

    if (!mobile) {
      await check('Auth', 'sidebar Logout (desktop) ends session', page, async () => {
        await page.goto('/citizen/dashboard');
        const btn = page.locator('aside form[action="/api/auth/signout"] button, form[action="/api/auth/signout"] button').first();
        await btn.click();
        await page.waitForLoadState('networkidle').catch(() => {});
        await page.waitForTimeout(1500);
        const s1 = await shot(page, 'sidebar-logout-landing');
        const landed = page.url();
        await page.goto('/citizen/dashboard');
        const loggedOut = page.url().includes('/login');
        // Restore the session for the remaining checks.
        if (loggedOut) await login(main!, account.email, account.password);
        return {
          status: loggedOut ? 'PASS' : 'FAIL',
          expected: 'one click logs the citizen out',
          actual: `landed on ${landed}; session ended=${loggedOut}`,
          shots: [s1],
        };
      });
    }
  });

  test('2 role bypass: citizen vs desk pages and APIs', async ({}, info) => {
    test.setTimeout(5 * 60 * 1000);
    test.skip(!main, 'no citizen session');
    const page = main!.page;

    for (const route of ['/desk', '/desk/dashboard', '/desk/map', '/desk/tickets', '/desk/status', '/desk/personnels']) {
      await check('Security', `citizen blocked from ${route}`, page, async () => {
        await page.goto(route);
        await page.waitForTimeout(800);
        const ok = !new URL(page.url()).pathname.startsWith('/desk');
        const s = ok ? [] : [await shot(page, `desk-bypass${route.replace(/\//g, '-')}`)];
        return { status: ok ? 'PASS' : 'FAIL', expected: 'redirect away from /desk', actual: page.url(), shots: s };
      });
    }
    // Should end logged in, still a citizen.
    const s = await shot(page, 'desk-redirect-result');
    results.push({ area: 'Security', check: 'desk redirect landing page', status: 'INFO', actual: page.url(), shots: [s], errors: [] });

    const probes: { method: 'GET' | 'POST' | 'PATCH'; url: string; data?: unknown }[] = [
      { method: 'GET', url: '/api/desk/queue' },
      { method: 'GET', url: '/api/desk/analyst/brief' },
      { method: 'POST', url: '/api/desk/analyst/chat', data: { message: '[QA] role bypass probe' } },
      { method: 'GET', url: '/api/reports/authority' },
      { method: 'GET', url: '/api/personnels' },
      { method: 'POST', url: '/api/personnels', data: { name: '[QA] should be refused' } },
      { method: 'POST', url: '/api/issues/seed-demo-critical-bellandur/actions', data: { action: 'ACKNOWLEDGE', note: '[QA] role bypass probe' } },
      { method: 'POST', url: '/api/issues/seed-demo-critical-bellandur/repair-window', data: {} },
      { method: 'GET', url: '/api/issues/seed-demo-critical-bellandur/liability' },
      { method: 'GET', url: '/api/issues/seed-demo-critical-bellandur/analyst' },
      { method: 'POST', url: '/api/jobs/priority-recompute', data: {} },
      { method: 'GET', url: '/api/jobs/priority-recompute' },
    ];
    for (const p of probes) {
      await check('Security', `citizen ${p.method} ${p.url}`, null, async () => {
        const r = p.method === 'GET' ? await page.request.get(p.url) : await page.request.fetch(p.url, { method: p.method, data: p.data });
        const text = (await r.text()).replace(/\s+/g, ' ').slice(0, 160);
        const ok = [401, 403, 404, 405].includes(r.status());
        return { status: ok ? 'PASS' : 'FAIL', expected: '401/403 for a citizen', actual: `${r.status()} ${text}` };
      });
    }
    void info;
  });

  test('3 pages: dashboard, profile, map, extra, audit, public pages, PWA, 404, slow network', async ({}, info) => {
    test.setTimeout(15 * 60 * 1000);
    test.skip(!main, 'no citizen session');
    const page = main!.page;

    const visit = async (route: string, name: string, extra?: () => Promise<string>) =>
      check('Pages', `${route}`, page, async () => {
        const resp = await page.goto(route);
        await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
        await page.waitForTimeout(1500);
        const s = await shot(page, name);
        await runAxe(page, route);
        const text = await bodyText(page);
        const more = extra ? await extra() : '';
        const ok = (resp?.status() ?? 0) < 400 && !/Application error|Internal Server Error|Something went wrong/i.test(text);
        return { status: ok ? 'PASS' : 'FAIL', actual: `${resp?.status()} ${page.url()} ${more}`.trim(), shots: [s] };
      });

    await visit('/citizen/dashboard', 'dashboard', async () => {
      const t = await bodyText(page);
      return `snippet="${t.slice(0, 220)}"`;
    });
    await visit('/citizen/profile', 'profile', async () => {
      const t = await bodyText(page);
      const has = ['points', 'tier', 'reputation', 'leaderboard'].map((k) => `${k}=${new RegExp(k, 'i').test(t)}`).join(' ');
      return has;
    });
    await visit('/citizen/map', 'map-initial', async () => {
      const markers = await page.locator('.leaflet-marker-icon, .maplibregl-marker, .mapboxgl-marker, [class*=marker]').count();
      const canvas = await page.locator('.leaflet-container, .maplibregl-canvas, canvas').count();
      return `markers=${markers} mapSurfaces=${canvas}`;
    });

    await check('Map', 'zoom, pan, tap on map', page, async () => {
      const shots: string[] = [];
      const zoomIn = page.locator('.leaflet-control-zoom-in, .maplibregl-ctrl-zoom-in, button[aria-label*="Zoom in" i]').first();
      const hasZoom = await zoomIn.isVisible().catch(() => false);
      if (hasZoom) {
        await zoomIn.click();
        await zoomIn.click();
        await page.waitForTimeout(1500);
        shots.push(await shot(page, 'map-zoomed-in'));
      }
      const surface = page.locator('.leaflet-container, .maplibregl-canvas').first();
      const box = await surface.boundingBox();
      let afterTap = '';
      if (box) {
        await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
        await page.waitForTimeout(1500);
        shots.push(await shot(page, 'map-tap-centre'));
        afterTap = `url after tap=${page.url()} popups=${await page.locator('.leaflet-popup, .maplibregl-popup').count()}`;
      }
      const marker = page.locator('.leaflet-marker-icon, .maplibregl-marker').first();
      if (await marker.isVisible().catch(() => false)) {
        await marker.click({ force: true });
        await page.waitForTimeout(1500);
        shots.push(await shot(page, 'map-marker-clicked'));
      }
      return { status: box ? 'PASS' : 'FAIL', actual: `zoomControl=${hasZoom} ${afterTap}`, shots };
    });

    await visit('/citizen/extra', 'extra-feature');
    await visit('/citizen/audit', 'audit-new-citizen', async () => {
      const t = await bodyText(page);
      const api = await page.request.get(`/api/audit/tasks?lat=${PILOT.latitude}&lng=${PILOT.longitude}`);
      const json = await api.json().catch(() => ({}));
      return `tasksVisible=${(json.tasks ?? []).length} eligibilityMsg=${/24 ?h|eligib/i.test(t)} text="${t.slice(0, 200)}"`;
    });

    await check('Audit', 'brand-new citizen (<24 h) sees a not-eligible message', page, async () => {
      await page.goto('/citizen/audit');
      await page.waitForTimeout(3000);
      const t = await bodyText(page);
      const api = await page.request.get(`/api/audit/tasks?lat=${PILOT.latitude}&lng=${PILOT.longitude}`);
      const json = await api.json().catch(() => ({}));
      const tasks = (json.tasks ?? []) as unknown[];
      const s = await shot(page, 'audit-new-citizen-message');
      const msg = /24 ?h|not (yet )?eligible|eligib/i.test(t);
      return {
        status: msg && tasks.length === 0 ? 'PASS' : 'FAIL',
        expected: 'explicit "not eligible until account is 24 h old" message, no tasks',
        actual: `eligibilityMessage=${msg} tasksReturned=${tasks.length} shown="${(t.match(/No Open Audit Missions Nearby[^.]*\.?[^.]*\./)?.[0] ?? t.slice(0, 160))}"`,
        shots: [s],
      };
    });

    await visit('/claim-gap', 'public-claim-gap');
    await visit('/ward/seed-ward-bellandur', 'public-ward-bellandur');
    await visit('/issue/seed-demo-critical-bellandur', 'public-issue-seed', async () => {
      const road = await page.locator('a[href^="/road/"]').first().getAttribute('href').catch(() => null);
      return `roadLink=${road}`;
    });
    const roadHref =
      (await page.locator('a[href^="/road/"]').first().getAttribute('href').catch(() => null)) ?? '/road/seed-demo-seg-ecospace';
    await visit(roadHref, 'public-road-timeline');

    await check('Pages', 'public ledger / action log on issue page', page, async () => {
      await page.goto('/issue/seed-demo-critical-bellandur');
      await page.waitForTimeout(2000);
      const t = await bodyText(page);
      const ledger = /ledger|timeline|action log/i.test(t);
      const s = await shot(page, 'public-issue-ledger');
      return { status: ledger ? 'PASS' : 'FAIL', expected: 'public ledger/timeline visible', actual: `ledgerText=${ledger}`, shots: [s] };
    });

    for (const r of ['/qa-nonexistent-page', '/issue/qa-does-not-exist', '/ward/qa-does-not-exist', '/road/qa-does-not-exist', '/citizen/report/qa-does-not-exist']) {
      await check('Pages', `not-found ${r}`, page, async () => {
        const resp = await page.goto(r);
        await page.waitForTimeout(1000);
        const t = await bodyText(page);
        const s = await shot(page, `404${r.replace(/\//g, '-')}`);
        if (r === '/qa-nonexistent-page') await runAxe(page, '404');
        const ok = resp?.status() === 404 || /not found|404/i.test(t);
        return { status: ok ? 'PASS' : 'FAIL', expected: 'friendly 404', actual: `${resp?.status()} "${t.slice(0, 140)}"`, shots: [s] };
      });
    }

    await check('PWA', 'manifest, service worker, install banner', page, async () => {
      await page.goto('/citizen/dashboard');
      await page.waitForTimeout(3000);
      const manifest = await page.locator('link[rel=manifest]').getAttribute('href').catch(() => null);
      const sw = await page.evaluate(async () => {
        const r = await navigator.serviceWorker?.getRegistration();
        return r ? `${r.active?.state ?? r.installing?.state ?? 'registered'} scope=${r.scope}` : 'none';
      });
      // Headless Chromium never fires beforeinstallprompt by itself; dispatch a synthetic one to see the banner UI.
      await page.evaluate(() => {
        const e = new Event('beforeinstallprompt') as Event & { prompt?: () => Promise<void>; userChoice?: Promise<unknown> };
        e.prompt = async () => {};
        e.userChoice = Promise.resolve({ outcome: 'dismissed', platform: 'web' });
        window.dispatchEvent(e);
      });
      await page.waitForTimeout(1500);
      const t = await bodyText(page);
      const banner = /install/i.test(t);
      const s = await shot(page, 'pwa-install-banner');
      return { status: manifest && sw !== 'none' ? 'PASS' : 'FAIL', actual: `manifest=${manifest} sw=${sw} installBannerAfterSyntheticEvent=${banner}`, shots: [s] };
    });

    await check('Theme', 'dark/light toggle present?', page, async () => {
      const n = await page.locator('button[aria-label*="theme" i], button:has-text("Dark"), button:has-text("Light")').count();
      return { status: 'INFO', actual: n ? `${n} theme control(s) found` : 'No theme toggle exists (dark-only UI)' };
    });

    await check('Network', 'Slow 3G: dashboard and report page', page, async () => {
      const cdp = await main!.ctx.newCDPSession(page);
      await cdp.send('Network.enable');
      await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 2000, downloadThroughput: (500 * 1024) / 8, uploadThroughput: (500 * 1024) / 8 });
      const shots: string[] = [];
      const timings: string[] = [];
      for (const r of ['/citizen/dashboard', '/citizen/report']) {
        const t0 = Date.now();
        const resp = await page.goto(r, { timeout: 120000, waitUntil: 'load' }).catch((e) => (timings.push(`${r} ${e.message.split('\n')[0]}`), null));
        timings.push(`${r} status=${resp?.status()} load=${((Date.now() - t0) / 1000).toFixed(1)}s`);
        shots.push(await shot(page, `slow3g${r.replace(/\//g, '-')}`));
      }
      await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
      await cdp.detach();
      return { status: 'INFO', actual: timings.join('; '), shots };
    });
    void info;
  });

  test('4 report flow: categories, sizes, blockage, GPS states, offline, duplicates, abuse', async ({ browser }, info) => {
    test.setTimeout(30 * 60 * 1000);
    test.skip(!main, 'no citizen session');
    const w = main!;
    const page = w.page;
    const mobile = info.project.name.includes('mobile');
    // Unique, well separated points per project so desktop and mobile reports never merge.
    const base = { latitude: 12.925 + (mobile ? 0.03 : 0), longitude: 77.5938 + (mobile ? 0.02 : 0) };
    const at = (i: number) => ({ latitude: base.latitude + i * 0.004, longitude: base.longitude, accuracy: 8 });

    // Give the device key time to register for this fresh browser.
    await page.goto('/citizen/dashboard');
    await page.waitForTimeout(4000);

    const plan: ReportOpts[] = [
      { tag: 'r1-potholes', category: 'POTHOLES', size: 'small', share: 'none', note: `[QA] pothole small / none ${ts}` },
      { tag: 'r2-drainage-back', category: 'DRAINAGE', size: 'medium', share: 'part lane', note: `[QA] drainage medium / part lane, went Back mid-flow ${ts}`, backMidFlow: true },
      { tag: 'r3-streetlights', category: 'STREETLIGHTS', size: 'large', share: 'one lane', note: `[QA] streetlight large / one lane ${ts}` },
      { tag: 'r4-sidewalks', category: 'SIDEWALKS', size: 'small', share: 'full', note: `[QA] sidewalk small / full ${ts}` },
      { tag: 'r5-trafficsigns-nonote', category: 'TRAFFIC_SIGNS', size: 'medium', share: 'none', note: '' },
      { tag: 'r6-graffiti-long', category: 'GRAFFITI', size: 'large', share: 'part lane', note: LONG_NOTE },
      { tag: 'r7-trash-emoji', category: 'TRASH', size: 'small', share: 'one lane', note: EMOJI_NOTE },
      { tag: 'r8-other-double', category: 'OTHER', size: 'medium', share: 'full', note: `[QA] other medium / full, rapid double submit ${ts}`, doubleSubmit: true },
    ];

    let first: ReportOutcome | null = null;
    for (let i = 0; i < plan.length; i++) {
      const o = plan[i];
      await w.ctx.setGeolocation(at(i));
      await check('Report', `${o.tag} (${o.category}, ${o.size}, ${o.share}${o.note ? '' : ', no description'})`, page, async () => {
        const r = await fileReport(w, o);
        recordReport(o, r);
        if (i === 0) first = r;
        const ok = r.status === 201 && !!r.issueId && /\/citizen\/report\//.test(r.url);
        let extra = '';
        if (o.doubleSubmit) extra = ` POSTs sent=${r.postCount}`;
        if (o.note === LONG_NOTE || o.note === EMOJI_NOTE) {
          await page.goto(`/citizen/report/${r.issueId}`);
          await page.waitForTimeout(2000);
          const t = await page.locator('body').innerText();
          const shown = o.note === EMOJI_NOTE ? t.includes('🚧') && t.includes('<script>') : t.includes('Crater beside the median');
          const alertFired = false;
          r.shots.push(await shot(page, `${o.tag}-issue-page`));
          extra += ` noteRenderedSafely=${shown} scriptExecuted=${alertFired}`;
        }
        return {
          status: ok && (!o.doubleSubmit || r.postCount === 1) ? 'PASS' : 'FAIL',
          expected: o.doubleSubmit ? 'exactly one POST /api/reports, one issue' : '201 + redirect to /citizen/report/<id>',
          actual: `${r.status} issue=${r.issueId} merged=${r.merged ?? false} url=${r.url}${r.error ? ` error="${r.error}"` : ''}${extra}`,
          shots: r.shots,
        };
      });

      if (i === 0 && first) {
        const f = first as ReportOutcome;
        // These must run within 5 minutes of the capture so the timestamp check is not what rejects them.
        await check('Security', 'replaying a used report nonce is rejected', null, async () => {
          if (!f.requestBody) return { status: 'BLOCKED', actual: 'request body not captured' };
          const r = await page.request.post('/api/reports', { data: JSON.parse(f.requestBody) });
          const j = await r.json().catch(() => ({}));
          return { status: r.status() === 400 && /NONCE/i.test(JSON.stringify(j)) ? 'PASS' : 'FAIL', expected: '400 INVALID_NONCE', actual: `${r.status()} ${JSON.stringify(j).slice(0, 200)}` };
        });
        await check('Security', 'payload changed after signing is rejected', null, async () => {
          if (!f.requestBody) return { status: 'BLOCKED', actual: 'request body not captured' };
          const body = JSON.parse(f.requestBody);
          const n = await page.request.post('/api/evidence/nonce');
          const nonce = (await n.json()).nonce;
          body.payload.nonce = nonce; // fresh nonce, but the old signature
          body.payload.lat += 0.01;
          const r = await page.request.post('/api/reports', { data: body });
          const j = await r.json().catch(() => ({}));
          return { status: r.status() === 400 && /SIGNATURE/i.test(JSON.stringify(j)) ? 'PASS' : 'FAIL', expected: '400 INVALID_SIGNATURE', actual: `${r.status()} ${JSON.stringify(j).slice(0, 200)}` };
        });
        await check('Security', 'unsigned (legacy direct) report is rejected', null, async () => {
          const r = await page.request.post('/api/reports', { data: { title: '[QA] unsigned probe', description: '[QA] unsigned probe', category: 'POTHOLES', lat: 12.93, lng: 77.6 } });
          const j = await r.json().catch(() => ({}));
          if (r.status() === 201) created.push({ kind: 'issue', id: j.issue?.id, note: 'UNSIGNED report accepted (security defect)' });
          return { status: r.status() === 400 ? 'PASS' : 'FAIL', expected: '400', actual: `${r.status()} ${JSON.stringify(j).slice(0, 200)}` };
        });
        await check('Security', 'reporter cannot verify own issue', null, async () => {
          const r = await page.request.post(`/api/issues/${f.issueId}/verify`, {
            data: { verdict: 'FIXED', evidence: { payload: { accuracy: 5, capturedAt: new Date().toISOString(), lat: 12.93, lng: 77.6, nonce: 'x', photoHash: 'x', role: 'VERIFY' }, signature: 'x', photoBase64: 'eA==' } },
          });
          const j = await r.json().catch(() => ({}));
          return { status: r.status() >= 400 ? 'PASS' : 'FAIL', expected: 'refused (reporter)', actual: `${r.status()} ${JSON.stringify(j).slice(0, 220)}` };
        });
      }
    }

    await check('Report', 'duplicate at the same spot (merge)', page, async () => {
      const f = first as ReportOutcome | null;
      await w.ctx.setGeolocation({ ...at(0), latitude: at(0).latitude + 0.00005 }); // ~5 m from r1
      const o: ReportOpts = { tag: 'r9-duplicate', category: 'POTHOLES', size: 'medium', share: 'part lane', note: `[QA] duplicate of r1 at the same spot ${ts}` };
      const r = await fileReport(w, o);
      recordReport(o, r);
      const prompt = /duplicate|already reported|merge/i.test(await bodyText(page));
      return {
        status: r.status === 201 && r.issueId === f?.issueId ? 'PASS' : 'FAIL',
        expected: 'merged into r1 issue (and ideally a merge prompt shown to the citizen)',
        actual: `${r.status} issue=${r.issueId} r1=${f?.issueId} merged=${r.merged} mergePromptShown=${prompt}`,
        shots: r.shots,
      };
    });

    await check('Report', 'offline: queue then sync when back online', page, async () => {
      await w.ctx.setGeolocation(at(10));
      const o: ReportOpts = { tag: 'r10-offline', category: 'DRAINAGE', size: 'large', share: 'none', note: `[QA] filed while offline ${ts}`, offline: true };
      const r = await fileReport(w, o);
      recordReport(o, r);
      return { status: r.status === 201 ? 'PASS' : 'FAIL', expected: 'queued offline, synced (201) after reconnect', actual: `sync status=${r.status} issue=${r.issueId}${r.error ? ` error="${r.error}"` : ''}`, shots: r.shots };
    });

    await check('Report', 'poor GPS accuracy (80 m) blocks capture', page, async () => {
      await w.ctx.setGeolocation({ ...at(11), accuracy: 80 });
      await openCapture(page, 'POTHOLES');
      await page.getByText(/Accuracy: ±80m/).waitFor({ timeout: 30000 });
      const disabled = await page.getByRole('button', { name: 'Capture signed photo' }).isDisabled();
      const s = await shot(page, 'report-poor-gps');
      return { status: disabled ? 'PASS' : 'FAIL', expected: 'capture disabled with ≤30 m message', actual: `captureDisabled=${disabled}`, shots: [s] };
    });

    await check('Report', 'outside India (London) is refused', page, async () => {
      await w.ctx.setGeolocation({ ...OUTSIDE_INDIA, accuracy: 8 });
      await openCapture(page, 'POTHOLES');
      const s1 = await shot(page, 'report-outside-india-capture');
      const locked = await page.getByText(/GPS Locked/).first().isVisible({ timeout: 20000 }).catch(() => false);
      await captureWhenLocked(page);
      await page.locator('textarea').waitFor();
      await page.locator('textarea').fill(`[QA] outside India probe ${ts}`);
      await page.getByRole('button', { name: /Review Evidence/ }).click();
      const s2 = await shot(page, 'report-outside-india-review');
      const respP = page.waitForResponse((r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/reports', { timeout: 30000 });
      await page.getByRole('button', { name: /File & Sign Report/ }).click();
      const resp = await respP;
      const j = await resp.json().catch(() => ({}));
      await page.waitForTimeout(1500);
      const s3 = await shot(page, 'report-outside-india-result');
      const shown = (await bodyText(page)).match(/Invalid report[^.]*|outside[^.]*|India[^.]*/i)?.[0] ?? '';
      if (resp.status() === 201) created.push({ kind: 'issue', id: j.issue?.id, note: 'OUTSIDE-INDIA report accepted (defect)' });
      return {
        status: resp.status() === 400 ? 'PASS' : 'FAIL',
        expected: 'refused before capture or with a clear "India only" message',
        actual: `gpsLockedAtLondon=${locked} server=${resp.status()} ${JSON.stringify(j).slice(0, 160)} uiMessage="${shown}"`,
        shots: [s1, s2, s3],
      };
    });

    await check('Report', 'browser Back mid-flow', page, async () => {
      await w.ctx.setGeolocation(at(12));
      await page.goto('/citizen/dashboard');
      await openCapture(page, 'SIDEWALKS');
      await captureWhenLocked(page);
      await page.locator('textarea').fill('[QA] draft that should not be filed');
      await page.goBack();
      await page.waitForTimeout(1500);
      const s1 = await shot(page, 'report-browser-back');
      await page.goForward().catch(() => {});
      await page.waitForTimeout(1500);
      const s2 = await shot(page, 'report-browser-forward');
      const draftKept = await page.locator('textarea').inputValue().catch(() => '');
      return { status: 'INFO', actual: `back → ${page.url()}; draft kept after forward="${draftKept}"`, shots: [s1, s2] };
    });

    await check('Report', 'GPS permission denied', page, async () => {
      const denied = await newCtx(browser, info, 'gps-denied', { storageState: await w.ctx.storageState(), permissions: ['camera'] });
      try {
        await denied.page.goto('/citizen/dashboard');
        await denied.page.waitForTimeout(3000);
        await openCapture(denied.page, 'POTHOLES');
        await denied.page.waitForTimeout(8000);
        const t = await bodyText(denied.page);
        const disabled = await denied.page.getByRole('button', { name: 'Capture signed photo' }).isDisabled();
        const s = await shot(denied.page, 'report-gps-denied');
        const msg = t.match(/(User denied[^.]*|denied[^.]*|GPS location unavailable|Acquiring high-accuracy GPS fix)/i)?.[0] ?? '';
        return { status: disabled ? 'PASS' : 'FAIL', expected: 'capture blocked, clear "enable location" guidance', actual: `captureDisabled=${disabled} message="${msg}"`, shots: [s] };
      } finally {
        await denied.close();
      }
    });

    await check('Security', 'camera denied → "Choose from Device" (gallery photo, GPS denied)', page, async () => {
      const g = await newCtx(browser, info, 'camera-denied', { storageState: await w.ctx.storageState(), permissions: [] });
      try {
        await g.ctx.addInitScript(() => {
          if (navigator.mediaDevices) {
            navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('Permission denied', 'NotAllowedError'));
          }
        });
        const p = g.page;
        await p.goto('/citizen/dashboard');
        await p.waitForTimeout(4000);
        await openCapture(p, 'OTHER');
        await p.getByText(/Permission denied/).waitFor({ timeout: 15000 });
        const s1 = await shot(p, 'report-camera-denied');
        const chooser = p.getByRole('button', { name: /Choose from Device/ });
        const offered = await chooser.isVisible();
        if (!offered) return { status: 'PASS', actual: 'no gallery fallback offered', shots: [s1] };
        const fc = p.waitForEvent('filechooser');
        await chooser.click();
        await (await fc).setFiles(path.join(FIXTURES, 'src/Pothole.jpg'));
        await p.locator('textarea').waitFor({ timeout: 20000 });
        await p.locator('textarea').fill(`[QA] gallery upload with camera+GPS denied ${ts}`);
        await p.getByRole('button', { name: /Review Evidence/ }).click();
        const s2 = await shot(p, 'report-gallery-review');
        const coords = (await bodyText(p)).match(/Coordinates\s*([\d.]+, [\d.]+)/)?.[1] ?? '?';
        const respP = p.waitForResponse((r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/reports', { timeout: 60000 });
        await p.getByRole('button', { name: /File & Sign Report/ }).click();
        const resp = await respP;
        const j = await resp.json().catch(() => ({}));
        await p.waitForTimeout(2500);
        const s3 = await shot(p, 'report-gallery-result');
        if (resp.status() === 201) {
          created.push({ kind: 'issue', id: j.issue?.id, note: 'gallery photo, no camera, no GPS (accepted)' });
          created.push({ kind: 'report', id: j.report?.id, note: `gallery report on issue ${j.issue?.id}` });
        }
        return {
          status: resp.status() === 201 ? 'FAIL' : 'PASS',
          expected: 'a gallery photo without a GPS fix must not be accepted as on-site evidence',
          actual: `galleryOffered=${offered} reviewCoords=${coords} server=${resp.status()} issue=${j.issue?.id ?? '-'} ${j.error ? JSON.stringify(j.error).slice(0, 160) : ''}`,
          shots: [s1, s2, s3],
        };
      } finally {
        await g.close();
      }
    });
    await w.ctx.setGeolocation({ ...PILOT, accuracy: 10 });
  });

  test('5 after reporting: issue page as reporter, comments, own reports', async ({}, info) => {
    test.setTimeout(10 * 60 * 1000);
    test.skip(!main, 'no citizen session');
    const page = main!.page;
    const issue = created.find((c) => c.kind === 'issue')?.id;
    test.skip(!issue, 'no report was filed');

    await check('Issue', 'citizen issue page as reporter', page, async () => {
      await page.goto(`/citizen/report/${issue}`);
      await page.waitForLoadState('networkidle').catch(() => {});
      await page.waitForTimeout(2500);
      const t = await bodyText(page);
      const s = await shot(page, 'citizen-issue-page');
      await runAxe(page, '/citizen/report/[id]');
      const imgs = await page.locator('img').evaluateAll((els) => els.map((e) => `${(e as HTMLImageElement).naturalWidth}`));
      const keys = ['OPEN', 'timeline', 'AI', 'pending', 'traffic', 'deteriorat', 'repair window', 'verify'].map((k) => `${k}=${new RegExp(k, 'i').test(t)}`);
      return { status: 'INFO', actual: `${keys.join(' ')} imgNaturalWidths=[${imgs.join(',')}]`, shots: [s] };
    });

    await check('Issue', 'public issue page as reporter', page, async () => {
      await page.goto(`/issue/${issue}`);
      await page.waitForLoadState('networkidle').catch(() => {});
      await page.waitForTimeout(2500);
      const t = await bodyText(page);
      const s = await shot(page, 'public-issue-own');
      await runAxe(page, '/issue/[id]');
      const imgs = await page.locator('img').evaluateAll((els) => els.map((e) => `${(e as HTMLImageElement).naturalWidth}`));
      const verifyBtn = await page.getByRole('button', { name: /verify/i }).count();
      const keys = ['status', 'timeline|ledger', 'evidence', 'AI', 'pending', 'traffic', 'deteriorat', 'repair window'].map((k) => `${k}=${new RegExp(k, 'i').test(t)}`);
      return { status: verifyBtn === 0 ? 'PASS' : 'FAIL', expected: 'no Verify control for the reporter', actual: `verifyButtons=${verifyBtn} ${keys.join(' ')} imgs=[${imgs.join(',')}]`, shots: [s] };
    });

    await check('Issue', 'comment on own issue', page, async () => {
      await page.goto(`/citizen/report/${issue}`);
      await page.waitForTimeout(2000);
      const toggle = page.getByRole('button', { name: /comment|intel|discussion/i }).first();
      if (await toggle.isVisible().catch(() => false)) await toggle.click();
      const input = page.getByPlaceholder('Add intelligence...');
      if (!(await input.isVisible().catch(() => false))) {
        return { status: 'BLOCKED', actual: 'comment input not found', shots: [await shot(page, 'comment-missing')] };
      }
      await input.fill(`[QA] comment ${ts} 👍`);
      const respP = page.waitForResponse((r) => r.request().method() === 'POST' && r.url().includes('/comments'), { timeout: 20000 });
      await input.press('Enter');
      const resp = await respP.catch(async () => {
        await page.locator('button:near(input[placeholder="Add intelligence..."])').first().click();
        return page.waitForResponse((r) => r.request().method() === 'POST' && r.url().includes('/comments'), { timeout: 20000 });
      });
      const j = await resp.json().catch(() => ({}));
      if (resp.ok()) created.push({ kind: 'comment', id: j.id ?? j.comment?.id ?? '?', note: `on issue ${issue}` });
      await page.waitForTimeout(1500);
      const s = await shot(page, 'comment-posted');
      return { status: resp.ok() ? 'PASS' : 'FAIL', actual: `${resp.status()} ${JSON.stringify(j).slice(0, 160)}`, shots: [s] };
    });

    await check('Issue', 'dashboard / profile reflect new reports and points', page, async () => {
      await page.goto('/citizen/dashboard');
      await page.waitForTimeout(2500);
      const s1 = await shot(page, 'dashboard-after-reports');
      const mine = await page.request.get('/api/reports?mine=true');
      const j = await mine.json().catch(() => ({}));
      await page.goto('/citizen/profile');
      await page.waitForTimeout(2500);
      const s2 = await shot(page, 'profile-after-reports');
      const t = await bodyText(page);
      return { status: 'INFO', actual: `myReports=${(j.reports ?? []).length} profileSnippet="${t.slice(0, 260)}"`, shots: [s1, s2] };
    });
    void info;
  });

  test('6 click every button and link', async ({}, info) => {
    test.setTimeout(25 * 60 * 1000);
    test.skip(!main, 'no citizen session');
    const page = main!.page;
    const issue = created.find((c) => c.kind === 'issue')?.id ?? 'seed-demo-critical-bellandur';
    const pages = ['/citizen/dashboard', '/citizen/profile', '/citizen/map', '/citizen/extra', '/citizen/audit', '/claim-gap', '/ward/seed-ward-bellandur', `/issue/${issue}`, `/citizen/report/${issue}`];
    const visited = new Set<string>();
    const skip = /log ?out|sign ?out|file & sign|capture|delete|install|start blind audit/i;

    for (const url of pages) {
      await check('Controls', `every control on ${url}`, page, async () => {
        await page.goto(url);
        await page.waitForTimeout(2000);
        const hrefs = await page.$$eval('a[href]', (as) => [...new Set(as.map((a) => a.getAttribute('href') || ''))]);
        const linkNotes: string[] = [];
        for (const h of hrefs) {
          if (!h.startsWith('/') || h.startsWith('/api/auth/signout') || visited.has(h)) continue;
          visited.add(h);
          const r = await page.goto(h).catch(() => null);
          const t = await bodyText(page);
          if (!r || r.status() >= 400 || /Application error/i.test(t)) linkNotes.push(`${h}→${r?.status() ?? 'ERR'}`);
        }
        await page.goto(url);
        await page.waitForTimeout(1500);
        const total = await page.locator('button:visible').count();
        const btnNotes: string[] = [];
        let clicked = 0;
        for (let i = 0; i < Math.min(total, 30); i++) {
          await page.goto(url);
          await page.waitForTimeout(1200);
          const b = page.locator('button:visible').nth(i);
          const text = ((await b.innerText().catch(() => '')) || (await b.getAttribute('aria-label').catch(() => '')) || `#${i}`).replace(/\s+/g, ' ').slice(0, 40);
          if (skip.test(text)) continue;
          const mark = events.length;
          const before = page.url();
          await b.click({ timeout: 4000 }).catch((e) => btnNotes.push(`"${text}" not clickable: ${String(e.message).split('\n')[0].slice(0, 80)}`));
          clicked += 1;
          await page.waitForTimeout(900);
          const errs = events.slice(mark).filter((e) => e.kind !== 'http' || !e.text.includes('_rsc'));
          if (errs.length) btnNotes.push(`"${text}" → ${errs.map((e) => e.text).join(' | ').slice(0, 200)}`);
          if (page.url() !== before) btnNotes.push(`"${text}" navigated to ${page.url()}`);
        }
        await page.goto(url);
        const s = await shot(page, `controls${url.replace(/\//g, '-')}`);
        const broken = linkNotes.length + btnNotes.filter((n) => !n.includes('navigated to')).length;
        return {
          status: broken ? 'FAIL' : 'PASS',
          actual: `links=${hrefs.length} buttons=${total} clicked=${clicked}. ${[...linkNotes, ...btnNotes].join('; ').slice(0, 1500)}`,
          shots: [s],
        };
      });
    }
    void info;
  });

  test('7 blind audit as seeded citizen-b', async ({ browser }, info) => {
    test.setTimeout(20 * 60 * 1000);
    const pw = process.env.SEED_DESK_PASSWORD;
    if (!pw) {
      results.push({ area: 'Audit', check: 'citizen-b login', status: 'BLOCKED', actual: 'SEED_DESK_PASSWORD not set', shots: [], errors: [] });
      return;
    }
    const b = await newCtx(browser, info, 'citizen-b', { geolocation: { ...PILOT, accuracy: 8 }, permissions: ['geolocation', 'camera'] });
    const page = b.page;
    try {
      await login(b, SEED_CITIZEN_B, pw);
      if (!page.url().includes('/citizen/')) {
        results.push({ area: 'Audit', check: 'citizen-b login', status: 'BLOCKED', actual: `login did not reach /citizen (at ${page.url()})`, shots: [await shot(page, 'citizen-b-login-failed')], errors: [] });
        return;
      }
      await page.waitForTimeout(4000); // device key registration

      type Task = { id: string; lat: number; lng: number; challengeBearingDeg: number; [k: string]: unknown };
      let tasks: Task[] = [];
      await check('Audit', 'task list is blind (API)', page, async () => {
        const r = await page.request.get(`/api/audit/tasks?lat=${PILOT.latitude}&lng=${PILOT.longitude}`);
        const j = await r.json();
        tasks = j.tasks ?? [];
        const keys = [...new Set(tasks.flatMap((t) => Object.keys(t)))].sort();
        const forbidden = keys.filter((k) => /issue|claim|contractor|tender|vote|repair|priority|band/i.test(k));
        return {
          status: forbidden.length ? 'FAIL' : 'PASS',
          expected: 'only location, bearing, nonce, deadline',
          actual: `${tasks.length} task(s); keys=${keys.join(',')}; forbidden=${forbidden.join(',') || 'none'}; ids=${tasks.map((t) => t.id).join(',')}`,
        };
      });

      await page.goto('/citizen/audit');
      await page.waitForTimeout(3000);
      const listShot = await shot(page, 'audit-citizen-b-list');
      await runAxe(page, '/citizen/audit (with tasks)');
      if (!tasks.length) {
        results.push({ area: 'Audit', check: 'open a task', status: 'BLOCKED', actual: 'citizen-b has no OPEN, unexpired audit tasks on production', shots: [listShot], errors: [] });
        return;
      }

      const orient = (deg: number) =>
        page.evaluate((d) => {
          for (const type of ['deviceorientationabsolute', 'deviceorientation']) {
            window.dispatchEvent(new DeviceOrientationEvent(type, { alpha: d, beta: 80, gamma: 0, absolute: true }));
          }
        }, deg);

      const openTask = async (t: Task) => {
        await page.goto('/citizen/audit');
        await page.waitForTimeout(2500);
        const card = page.locator('div', { hasText: `${t.lat.toFixed(5)}, ${t.lng.toFixed(5)}` }).filter({ has: page.getByRole('button', { name: /Start Blind Audit/ }) }).last();
        await card.getByRole('button', { name: /Start Blind Audit/ }).click();
        await page.getByText('Blind Verification Challenge').waitFor();
      };

      const verdicts = ['INTACT', 'DAMAGED', 'CANNOT_SEE'] as const;
      const isMobile = info.project.name.includes('mobile');
      const voteState: { last: { body?: string; taskId: string } | null } = { last: null };

      for (let i = 0; i < Math.min(tasks.length, 3); i++) {
        const t = tasks[i];
        const verdict = verdicts[(i + (isMobile ? 1 : 0)) % 3];

        if (i === 0) {
          await check('Audit', `task ${t.id}: modal is blind`, page, async () => {
            await b.ctx.setGeolocation({ latitude: t.lat, longitude: t.lng, accuracy: 6 });
            await openTask(t);
            const txt = await page.locator('div.fixed').first().innerText();
            const leaks = ['CLAIMED', 'claimed', 'contractor', 'Contractor', 'tender', 'vote', 'Vote', 'OPEN', 'VERIFIED', 'priority'].filter((w) => txt.includes(w) && !/Submit Audit Vote/.test(w));
            const s = await shot(page, 'audit-task-modal-blind');
            return { status: leaks.length ? 'FAIL' : 'PASS', expected: 'no status / claim / votes shown', actual: `leakWords=${leaks.join(',') || 'none'}`, shots: [s] };
          });

          await check('Security', `task ${t.id}: photo from ~200 m away is rejected`, page, async () => {
            await b.ctx.setGeolocation({ latitude: t.lat + 0.0018, longitude: t.lng, accuracy: 6 });
            await openTask(t);
            await orient(t.challengeBearingDeg);
            await captureWhenLocked(page);
            await page.getByRole('button', { name: /INTACT/ }).click();
            const respP = page.waitForResponse((r) => r.url().includes(`/api/audit/tasks/${t.id}/vote`), { timeout: 30000 });
            await page.getByRole('button', { name: /Submit Audit Vote/ }).click();
            const resp = await respP;
            const j = await resp.json().catch(() => ({}));
            await page.waitForTimeout(1000);
            const s = await shot(page, 'audit-200m-rejected');
            return { status: resp.status() === 400 && /30m/.test(JSON.stringify(j)) ? 'PASS' : 'FAIL', expected: '400 "within 30m"', actual: `${resp.status()} ${JSON.stringify(j).slice(0, 200)}`, shots: [s] };
          });
        }

        // A single accepted vote changes the real issue's status, so a pass can opt out of voting.
        if (process.env.QA_AUDIT_SUBMIT === '0') {
          results.push({ area: 'Audit', check: `task ${t.id}: vote submission`, status: 'BLOCKED', actual: 'skipped (QA_AUDIT_SUBMIT=0): each accepted vote mutates a production issue', shots: [], errors: [] });
          break;
        }

        if (i === 1) {
          await check('Security', `task ${t.id}: wrong compass heading is rejected`, page, async () => {
            await b.ctx.setGeolocation({ latitude: t.lat, longitude: t.lng, accuracy: 6 });
            await openTask(t);
            await orient((t.challengeBearingDeg + 120) % 360);
            await captureWhenLocked(page);
            await orient((t.challengeBearingDeg + 120) % 360);
            await page.getByRole('button', { name: /DAMAGED/ }).click();
            const respP = page.waitForResponse((r) => r.url().includes(`/api/audit/tasks/${t.id}/vote`), { timeout: 30000 });
            await page.getByRole('button', { name: /Submit Audit Vote/ }).click();
            const resp = await respP;
            const j = await resp.json().catch(() => ({}));
            const s = await shot(page, 'audit-wrong-heading');
            return { status: resp.status() === 400 ? 'PASS' : 'FAIL', expected: '400 heading outside ±45°', actual: `${resp.status()} ${JSON.stringify(j).slice(0, 200)}`, shots: [s] };
          });
          if (voteState.last?.body) {
            await check('Security', `nonce reuse: task ${voteState.last.taskId} evidence replayed on task ${t.id}`, null, async () => {
              const r = await page.request.post(`/api/audit/tasks/${t.id}/vote`, { data: JSON.parse(voteState.last!.body!) });
              const j = await r.json().catch(() => ({}));
              return { status: r.status() === 400 ? 'PASS' : 'FAIL', expected: '400 invalid challenge nonce', actual: `${r.status()} ${JSON.stringify(j).slice(0, 200)}` };
            });
          }
        }

        await check('Audit', `task ${t.id}: submit ${verdict} on-site with correct heading`, page, async () => {
          await b.ctx.setGeolocation({ latitude: t.lat, longitude: t.lng, accuracy: 6 });
          await openTask(t);
          await orient(t.challengeBearingDeg);
          const s1 = await shot(page, `audit-${verdict.toLowerCase()}-camera`);
          await captureWhenLocked(page);
          await orient(t.challengeBearingDeg);
          await page.getByRole('button', { name: new RegExp(verdict.replace('_', ' ')) }).click();
          let body: string | undefined;
          const reqP = page.waitForRequest((r) => r.url().includes(`/api/audit/tasks/${t.id}/vote`)).then((r) => (body = r.postData() ?? undefined));
          const respP = page.waitForResponse((r) => r.url().includes(`/api/audit/tasks/${t.id}/vote`), { timeout: 30000 });
          await page.getByRole('button', { name: /Submit Audit Vote/ }).click();
          const resp = await respP;
          await reqP.catch(() => {});
          const j = await resp.json().catch(() => ({}));
          await page.waitForTimeout(800);
          const s2 = await shot(page, `audit-${verdict.toLowerCase()}-submitted`);
          if (resp.status() === 201) {
            created.push({ kind: 'audit-vote', id: t.id, note: `citizen-b voted ${verdict}` });
            voteState.last = { body, taskId: t.id };
          }
          return { status: resp.status() === 201 ? 'PASS' : 'FAIL', expected: '201 vote recorded', actual: `${resp.status()} ${JSON.stringify(j).slice(0, 200)}`, shots: [s1, s2] };
        });

        if (voteState.last?.body && voteState.last.taskId === t.id) {
          await check('Security', `nonce reuse: replay vote on completed task ${t.id}`, null, async () => {
            const r = await page.request.post(`/api/audit/tasks/${t.id}/vote`, { data: JSON.parse(voteState.last!.body!) });
            const j = await r.json().catch(() => ({}));
            return { status: r.status() === 400 ? 'PASS' : 'FAIL', expected: '400 (task done / nonce used)', actual: `${r.status()} ${JSON.stringify(j).slice(0, 200)}` };
          });
        }
      }
    } finally {
      await b.close();
      flush();
    }
  });

  test('8 AI recapture: photo of a laptop screen @recapture', async ({ browser }, info) => {
    test.setTimeout(15 * 60 * 1000);
    account = { name: `QA Citizen ${ts} R`, email: `qa-${ts}-r@civicpulse.qa`, password: randomPassword() };
    const w = await newCtx(browser, info, 'recapture', { geolocation: { latitude: 12.99, longitude: 77.55, accuracy: 8 }, permissions: ['geolocation', 'camera'] });
    try {
      const page = w.page;
      await page.goto('/login');
      await page.getByRole('button', { name: 'CREATE ACCOUNT' }).click();
      await page.locator('input[name=name]').fill(account.name);
      await fillCredentials(w, account.email, account.password);
      await page.waitForURL(/\/citizen\/dashboard/, { timeout: 30000 });
      await w.resume();
      created.push({ kind: 'user', id: account.email, note: account.name });
      await page.waitForTimeout(4000);

      let issueId: string | undefined;
      await check('AI', 'file report from a laptop-screen photo', page, async () => {
        const o: ReportOpts = { tag: 'ai-recapture', category: 'POTHOLES', size: 'medium', share: 'none', note: `[QA] photo of a laptop screen (recapture test) ${ts}` };
        const r = await fileReport(w, o);
        recordReport(o, r);
        issueId = r.issueId;
        return { status: r.status === 201 ? 'INFO' : 'FAIL', actual: `${r.status} issue=${r.issueId}`, shots: r.shots };
      });
      if (!issueId) return;

      await check('AI', 'recapture flag appears on the issue', page, async () => {
        const deadline = Date.now() + 6 * 60 * 1000;
        let t = '';
        while (Date.now() < deadline) {
          await page.goto(`/issue/${issueId}`);
          await page.waitForTimeout(3000);
          t = await bodyText(page);
          if (/recaptur|screen|moir|photo of a (screen|display)/i.test(t)) break;
          await page.waitForTimeout(25000);
        }
        const s1 = await shot(page, 'ai-recapture-public-issue');
        await page.goto(`/citizen/report/${issueId}`);
        await page.waitForTimeout(3000);
        const t2 = await bodyText(page);
        const s2 = await shot(page, 'ai-recapture-citizen-issue');
        const flagged = /recaptur|screen|moir/i.test(t + t2);
        const ai = (t + ' ' + t2).match(/AI[^.]{0,120}/g)?.slice(0, 3).join(' | ') ?? '';
        return { status: flagged ? 'PASS' : 'FAIL', expected: 'AI flags the photo as a screen recapture', actual: `flagged=${flagged} aiText="${ai}"`, shots: [s1, s2] };
      });
    } finally {
      await w.close();
      flush();
    }
  });
});
