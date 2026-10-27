# Progress ledger
Current task: T17 · Track A · started 2026-10-27

> Keys-later mode: see docs/plan/KEYS_LATER.md

## Blocked (needs Sujay)
- None

## Done

### T15 · Points and XP rules; remove votes · 2026-10-27
- Changed: `src/lib/points.ts`, `src/lib/issues/merge.ts`, `src/components/citizen/Interactions.tsx`, deleted `src/app/api/reports/[id]/vote/route.ts`, `tests/unit/points.test.ts`, `docs/plan/PLAN.md`
- Verified against docs: PLAN.md Section 6 & 10 point calculation rules (new issue +10, confirmation of someone else +5, accepted verification +20, wrong verification -20, merged duplicate 0), transactional reputation updates on `CitizenProfile`
- Checks run:
  ```
  [npm test]
  ✓ tests/unit/points.test.ts (8 tests)
    ✓ rule: new Issue +10 points
    ✓ rule: confirmation of someone else's issue +5 points
    ✓ rule: confirmation of own issue earns 0 points
    ✓ rule: accepted verification +20 points
    ✓ rule: verification that later proves wrong −20 points
    ✓ rule: merged duplicate earns 0 points
    ✓ calculates tiers correctly based on reputation thresholds
    ✓ acceptance: no route exists under /vote
  ✓ tests/unit/config.test.ts (3 tests)
  ✓ tests/contract/storage.test.ts (6 tests)
  ✓ tests/unit/api-validation.test.ts (7 tests)
  ✓ tests/contract/geom-trigger.test.ts (1 test)
  ✓ tests/contract/seed-auth.test.ts (6 tests)
  ✓ tests/contract/merge.test.ts (5 tests)
  Test Files: 7 passed (7)
  Tests: 36 passed (36)

  [npx eslint src/lib/points.ts src/components/citizen/Interactions.tsx tests/unit/points.test.ts]
  Clean exit code 0
  ```
- Feature rows ticked: F3 (votes replaced by confirmations), F9 (XP for verifying)
- Notes for the next task: Proceeding to T17 (Async AI queue; remove Ollama and SSE).

### T14 · Duplicate merge · 2026-10-27
- Changed: `src/lib/issues/merge.ts`, `tests/contract/merge.test.ts`, `docs/plan/PLAN.md`
- Verified against docs: PostGIS `ST_DWithin` and `ST_Distance` on geography, cast to geography explicitly, PLAN.md Section 6 & 10 duplicate merge thresholds (25m auto-merge, 25-40m or different category within 25m duplicate review flag)
- Checks run:
  ```
  [npm test]
  ✓ tests/unit/config.test.ts (3 tests)
  ✓ tests/contract/storage.test.ts (6 tests)
  ✓ tests/unit/api-validation.test.ts (7 tests)
  ✓ tests/contract/geom-trigger.test.ts (1 test)
  ✓ tests/contract/seed-auth.test.ts (6 tests)
  ✓ tests/contract/merge.test.ts (5 tests)
    ✓ creates base issue at reference point
    ✓ 10 m apart, same category → merges into existing Issue with CONFIRM role
    ✓ 30 m apart, same category → creates new Issue with needsDuplicateReview = true
    ✓ 70 m apart, same category → creates independent Issue with needsDuplicateReview = false
    ✓ 10 m apart, different category → creates new Issue with needsDuplicateReview = true
  Test Files: 6 passed (6)
  Tests: 28 passed (28)

  [npx eslint src/lib/issues/merge.ts tests/contract/merge.test.ts]
  Clean exit code 0
  ```
- Feature rows ticked: F6 (`tests/contract/merge.test.ts`)
- Notes for the next task: Proceeding to T15 (Points and XP rules; remove votes).

### T13 · Photo storage · 2026-10-27
- Changed: `src/lib/external/storage.ts`, `tests/contract/storage.test.ts`, `tests/fixtures/storage/synthetic-upload-response.json`, `docs/agent/ASSUMPTIONS.md`, `docs/agent/DECISIONS.md`, `package.json`, `package-lock.json`
- Verified against docs: `@supabase/supabase-js` storage API (`upload`, `getPublicUrl`), Node.js `crypto` SHA-256 calculation, PLAN.md Section 10 T13 specifications (JPEG/WebP only, <= 2 MB, deterministic path structure)
- Checks run:
  ```
  [npm test]
  ✓ tests/unit/config.test.ts (3 tests)
  ✓ tests/contract/storage.test.ts (6 tests)
    ✓ validates fixture image and matches SHA-256 hash
    ✓ rejects photos exceeding 2 MB limit
    ✓ rejects unsupported MIME types (e.g., image/png or text/plain)
    ✓ rejects empty buffer
    ✓ uploads photo and generates path issues/<issueId>/<reportId>.jpg with matched hash
    ✓ supports WebP extension in path issues/<issueId>/<reportId>.webp
  ✓ tests/unit/api-validation.test.ts (7 tests)
  ✓ tests/contract/seed-auth.test.ts (6 tests)
  ✓ tests/contract/geom-trigger.test.ts (1 test)
  Test Files: 5 passed (5)
  Tests: 23 passed (23)

  [npx eslint src/lib/external/storage.ts tests/contract/storage.test.ts]
  Clean exit code 0
  ```
- Feature rows ticked: F1 (`tests/contract/storage.test.ts` passing)
- Notes for the next task: Proceeding to T14 (Duplicate merge and spatial queries).

### T12 · Validation layer and API error contract · 2026-10-27
- Changed: `src/lib/api/errors.ts`, `src/lib/api/validate.ts`, `src/lib/api/auth.ts`, `src/types/next-auth.d.ts`, `src/lib/auth.ts`, `src/app/api/reports/authority/route.ts`, `tests/unit/api-validation.test.ts`, `docs/plan/PLAN.md`
- Verified against docs: NextAuth 4 module augmentation types, Zod 4.6.7 validation schemas and error reporting, PLAN.md Section 6/7 pilot coordinate boundaries (lat 11.5–14.5, lng 76.5–78.5, gpsAccuracyM <= 30m)
- Checks run:
  ```
  [npm test]
  ✓ tests/unit/config.test.ts (3 tests)
  ✓ tests/contract/geom-trigger.test.ts (1 test)
  ✓ tests/contract/seed-auth.test.ts (6 tests)
  ✓ tests/unit/api-validation.test.ts (7 tests)
    ✓ missing lat → 400 with fields.lat
    ✓ lat 0 → 400 (outside pilot bounds)
    ✓ accuracy 80 m → 400 (exceeds max allowable GPS accuracy for evidence)
    ✓ valid coordinates and accuracy within pilot region succeed
    ✓ citizen calling a desk route → 403 FORBIDDEN
    ✓ unauthenticated request to protected route → 401 UNAUTHORIZED
    ✓ authorized user with matching role succeeds with typed user
  Test Files: 4 passed (4)
  Tests: 17 passed (17)

  [npx eslint src/lib/api/ src/types/ tests/unit/api-validation.test.ts src/app/api/reports/authority/route.ts]
  Clean exit code 0
  ```
- Feature rows ticked: F2 (`tests/unit/api-validation.test.ts`)
- Notes for the next task: Proceeding to T13 (Photo storage adapter and contract test).

### T11 · Data migration and seed v2 · 2026-10-27
- Changed: `scripts/migrate-v1-to-v2.ts`, `prisma/seed.ts`, `src/app/api/reports/authority/route.ts`, `tests/contract/seed-auth.test.ts`, `package.json`, `eslint.config.mjs`
- Verified against docs: NextAuth 4 credentials provider authorize contract, bcrypt hashing, U7 agencies list, Prisma upsert idempotency
- Checks run:
  ```
  [npm run migrate:v1 -- --dry-run]
  [T11 Migrate] Starting legacy v1 to v2 migration... Mode: DRY-RUN
  [T11 Migrate] Source detected: none. Found 0 legacy report(s).
  --- [T11 Migrate Summary] ---
  Total inspected: 0, Migrated: 0, Skipped: 0
  Dry-run finished: 0 changes written to database.

  [npm run db:seed (run 1 & run 2)]
  [Seed] Database seed completed successfully!
    - Agencies seeded: 7 (GBA, BWSSB, BESCOM, BTP, BMRCL, BDA, OTHER)
    - Desk users seeded: 2 (desk-a@civicpulse.local, desk-b@civicpulse.local)
    - Citizen users seeded: 3 (citizen@example.com, citizen-b@civicpulse.local, citizen-c@civicpulse.local)
    - Sample seed issues created/upserted: 3

  [npm test]
  ✓ tests/unit/config.test.ts (3 tests)
  ✓ tests/contract/geom-trigger.test.ts (1 test)
  ✓ tests/contract/seed-auth.test.ts (6 tests)
    ✓ environment contains SEED_DESK_PASSWORD
    ✓ all 7 U7 agencies are present in the database
    ✓ authenticates desk-a@civicpulse.local with AUTHORITY role
    ✓ authenticates desk-b@civicpulse.local with AUTHORITY role
    ✓ authenticates citizen@example.com with CITIZEN role
    ✓ rejects invalid password for seeded user
  Test Files: 3 passed (3)
  Tests: 10 passed (10)

  [npx eslint scripts/migrate-v1-to-v2.ts prisma/seed.ts tests/contract/seed-auth.test.ts src/app/api/reports/authority/route.ts]
  Clean exit code 0
  ```
- Feature rows ticked: A1 (seed accounts)
- Notes for the next task: Proceeding to T12 (Validation layer, API error contracts, and typed NextAuth session).

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
