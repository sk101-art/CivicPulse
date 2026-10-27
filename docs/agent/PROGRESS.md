# Progress ledger
Current task: T11 · Track A · started 2026-10-27

> Keys-later mode: see docs/plan/KEYS_LATER.md

## Blocked (needs Sujay)
- None

## Done

### T10 · Schema v2 · 2026-10-27
- Changed: `prisma/schema.prisma`, `prisma/migrations/20261027153000_t10_schema_v2/migration.sql`, `vitest.config.ts`, `tests/contract/geom-trigger.test.ts`
- Verified against docs: PostGIS 3.3 geography triggers, GiST indexes, `docs/plan/PLAN.md` Appendix B, Prisma 7 client generation
- Checks run:
  ```
  [npx prisma migrate status]
  2 migrations found in prisma/migrations
  Database schema is up to date!

  [npm test]
  ✓ tests/unit/config.test.ts (3 tests)
  ✓ tests/contract/geom-trigger.test.ts (1 test)
    ✓ inserts an Issue via Prisma and reads back a non-null geom filled by trigger: POINT(77.5946 12.9716)
  Test Files: 2 passed (2)
  Tests: 4 passed (4)
  ```
- Feature rows ticked: F3, F7, F10, A1, A2, A3, V4 (schema models, enums, triggers, and GiST indexes)
- Notes for the next task: Proceeding to T11 (Issue state machine and ActionLog validation).

### T04 · Supabase Postgres + PostGIS · 2026-10-27
- Changed: `prisma.config.ts`, `prisma/migrations/20261027152433_t04_postgis/migration.sql`, `scripts/db-check.ts`, `src/lib/db/prisma.ts`, `src/lib/prisma.ts`
- Verified against docs: Prisma 7 `@prisma/config` types, Supabase session pooler on port 5432 for DIRECT_DATABASE_URL, PostGIS 3.3 extension syntax
- Checks run:
  ```
  [prisma migrate dev]
  Applying migration 20261027152433_t04_postgis
  The following migration(s) have been applied:
    migrations/
      └─ 20261027152433_t04_postgis/
        └─ migration.sql
  Your database is now in sync with your schema.

  [npx tsx scripts/db-check.ts]
  PostGIS version: 3.3 USE_GEOS=1 USE_PROJ=1 USE_STATS=1

  [npm test]
  ✓ tests/unit/config.test.ts (3 tests) passed

  [npm run typecheck]
  Clean exit code 0 (43 baseline errors resolved via client generation)
  ```
- Feature rows ticked: F7 (part)
- Notes for the next task: Proceeding to T10 (Prisma schema v2 and migrations).

### T03 · Test and CI harness · 2026-10-27
- Changed: `vitest.config.ts`, `playwright.config.ts`, `package.json`, `package-lock.json`, `tests/unit/config.test.ts`, `tests/e2e/legacy/test-login.spec.js`, `tests/e2e/legacy/sync.spec.ts`, `.github/workflows/ci.yml`
- Verified against docs: Vitest 3.x documentation and types; Playwright configuration docs; GitHub Actions syntax
- Checks run:
  ```
  [npm test]
  RUN  v3.2.7 C:/Users/sujay/Downloads/miniproject_v2/miniproject
  ✓ tests/unit/config.test.ts (3 tests) 3ms

  Test Files  1 passed (1)
       Tests  3 passed (3)
    Duration  2.46s

  [Legacy E2E migration]
  test-login.spec.js and tests/sync.spec.ts moved to tests/e2e/legacy/ and marked test.describe.skip ("replaced by T73").

  [CI workflow]
  .github/workflows/ci.yml created (actionlint not locally installed, workflow structure verified).
  ```
- Feature rows ticked: P3 (part)
- Notes for the next task: Blocked before T04 awaiting database connection strings in `.env.local`.

### T02 · Env validation and config module · 2026-10-27
- Changed: `package.json`, `src/lib/env.ts`, `config/priority.ts`, `scripts/check-keys.ts`, `src/lib/prisma.ts`
- Verified against docs: Zod 4.6.7 package types, `docs/plan/PLAN.md` Section 7 & 10 (T02), `docs/plan/KEYS_LATER.md`
- Checks run:
  ```
  [npm run check:keys]
  === CivicPulse Environment Key Check ===
  APP_DATABASE_URL: NOT SET
  DIRECT_DATABASE_URL: NOT SET
  NEXTAUTH_URL: SET
  NEXTAUTH_SECRET: SET
  SEED_DESK_PASSWORD: SET
  SUPABASE_URL: NOT SET
  SUPABASE_SERVICE_ROLE_KEY: NOT SET
  SUPABASE_EVIDENCE_BUCKET: SET
  TOMTOM_API_KEY: NOT SET
  NEXT_PUBLIC_TOMTOM_TILES_KEY: NOT SET
  GEMINI_API_KEY: NOT SET
  GEMINI_MODEL: NOT SET
  GROQ_API_KEY: NOT SET
  GROQ_MODEL_VISION: SET
  GROQ_MODEL_TEXT: SET
  OLLAMA_URL: NOT SET
  AI_DAILY_CALL_CAP: SET
  AI_FEATURES: SET
  REDDIT_CLIENT_ID: NOT SET
  REDDIT_CLIENT_SECRET: NOT SET
  REDDIT_USER_AGENT: SET
  APP_REGION: SET
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: SET
  VAPID_PRIVATE_KEY: SET
  VAPID_SUBJECT: SET
  JOB_SECRET: SET
  APP_TIMEZONE: SET
  ========================================
  Summary: 15/27 keys set.

  [npm run typecheck]
  Executed (no errors in src/lib/env.ts or config/priority.ts; baseline 43 Prisma errors unchanged)
  ```
- Feature rows ticked: Infrastructure (T02)
- Notes for the next task: Proceeding to T03 (Test and CI harness).

### T01 · Repo hygiene and security fixes · 2026-10-27
- Changed: `.gitignore`, `src/lib/auth.ts`, `docs/legacy/context.txt` (moved), deleted `fix_maps.py`, `update_maps.py`, `update_docx.py`, `check.js`, `check.ts`, `test-update.js`, `docx_unpacked/`, `docs/agent/DECISIONS.md`
- Verified against docs: `docs/plan/PLAN.md` Section 10 (T01); NextAuth session security rules
- Checks run:
  ```
  [git check-ignore -v src/app/x/page.tsx]
  (no output - exit code 1, not ignored)

  [git grep "console.log" src/lib/auth.ts]
  (no output - no console.log remaining in auth.ts)

  [npx eslint src/lib/auth.ts]
  (clean exit code 0)
  ```
- Feature rows ticked: P5 (part)
- Notes for the next task: Proceeding to T02 (Env validation and config module).

### T00 · Baseline audit · 2026-10-27
- Changed: `docs/agent/PROGRESS.md`
- Verified against docs: `package.json`, `node_modules/*/package.json`, `docs/plan/PLAN.md` Section 10 (T00)
  - Node version: `v24.14.0`
  - npm version: `11.9.0`
  - next: `16.2.4`
  - prisma: `7.8.0`
  - @prisma/client: `7.8.0`
  - next-auth: `4.24.14`
  - react-leaflet: `5.0.0`
  - leaflet: `1.9.4`
- Existing Routes (`src/app/api`):
  - `api/auth/register/route.ts`
  - `api/auth/[...nextauth]/route.ts`
  - `api/events/route.ts`
  - `api/health/route.ts`
  - `api/personnels/route.ts`
  - `api/personnels/[id]/route.ts`
  - `api/reports/authority/route.ts`
  - `api/reports/nearby/route.ts`
  - `api/reports/route.ts`
  - `api/reports/[id]/assign/route.ts`
  - `api/reports/[id]/comments/route.ts`
  - `api/reports/[id]/confirm/route.ts`
  - `api/reports/[id]/resolve/route.ts`
  - `api/reports/[id]/status/route.ts`
  - `api/reports/[id]/vote/route.ts`
  - `api/stats/route.ts`
- Existing Pages (`src/app`):
  - `(auth)/login/page.tsx`
  - `authority/dashboard/page.tsx`
  - `authority/map/page.tsx`
  - `authority/personnels/page.tsx`
  - `authority/status/page.tsx`
  - `authority/tickets/page.tsx`
  - `citizen/dashboard/page.tsx`
  - `citizen/extra/page.tsx`
  - `citizen/map/page.tsx`
  - `citizen/profile/page.tsx`
  - `citizen/report/page.tsx`
  - `citizen/report/[id]/page.tsx`
  - `page.tsx`
- Checks run:
  ```
  [npm ci]
  added 496 packages, and audited 497 packages in 1m
  161 packages are looking for funding
  23 vulnerabilities (2 low, 5 moderate, 14 high, 2 critical)

  [npx tsc --noEmit]
  prisma/seed.ts(1,10): error TS2305: Module '"@prisma/client"' has no exported member 'PrismaClient'.
  src/app/api/auth/register/route.ts(24,51): error TS7006: Parameter 'tx' implicitly has an 'any' type.
  src/app/api/reports/[id]/assign/route.ts(6,10): error TS2305: Module '"@prisma/client"' has no exported member 'Status'.
  src/app/authority/dashboard/page.tsx(28,41): error TS7006: Parameter 'r' implicitly has an 'any' type.
  src/components/citizen/ActiveReports.tsx(3,10): error TS2305: Module '"@prisma/client"' has no exported member 'Status'.
  (43 TypeScript errors total across models, routes, and components)

  [npm run lint]
  ✖ 228 problems (141 errors, 87 warnings)
  2 errors and 1 warning potentially fixable with the `--fix` option.

  [npm run build]
  ▲ Next.js 16.2.4 (Turbopack)
  ⚠ Warning: Next.js inferred your workspace root, but it may not be correct. We detected multiple lockfiles and selected the directory of C:\Users\sujay\package-lock.json as the root directory.
  Error [TurbopackInternalError]: reading dir "C:\\Users\\sujay\\node_modules" Caused by: Access is denied. (os error 5)
  ```
- Feature rows ticked: Baseline audit recorded for P3.
- Notes for the next task: Proceeding directly to T01 (Repo cleanup and dead-code purge).

### T-setup · Setup: env template and ledgers · 2026-10-27
- Changed: `.gitignore`, `.env.example`, `.env.local` (git-ignored), `docs/agent/PROGRESS.md`, `docs/agent/DECISIONS.md`, `docs/agent/ASSUMPTIONS.md`
- Verified against docs: `docs/plan/PLAN.md` Sections 1–9, 12; `docs/plan/KEYS_LATER.md`; `.agents/rules/civicpulse.md`
- Checks run:
  ```
  git check-ignore -v .env.local -> .gitignore:34:.env* .env.local
  git check-ignore .env.example -> (not ignored)
  git check-ignore -v src/app/x/page.tsx -> (not ignored)
  ```
- Feature rows ticked: Setup
- Notes for the next task: Keys-later mode active. Proceed to master prompt in a new conversation starting at T00.
