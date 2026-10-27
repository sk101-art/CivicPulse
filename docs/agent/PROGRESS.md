# Progress ledger
Current task: T01 · Track A · started 2026-10-27

> Keys-later mode: see docs/plan/KEYS_LATER.md

## Blocked (needs Sujay)
- None

## Done

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
