# Progress ledger
Current task: T71 · Production Deploy Preparation (Awaiting User Execution)

> Keys-later mode: see docs/plan/KEYS_LATER.md

## Blocked (needs Sujay)
- User deployment of Vercel production instance and setting environment variables (STOP before T71 per instructions).

## Done

### Phase 1 · Real Per-Place Traffic Profile & Live Traffic Flow Intelligence · 2026-10-29
- **Goal:** Implement true per-place traffic profiles (without waiting for sparse live samples) using TomTom historic routing probes across 48 hourly slots, 14-day validity caching, 150m segment sharing, live sample blending, daily 1,200 quota guard, and live Flow intelligence endpoint with 24h sparklines.
- **Implemented Work:**
  1. Data Model (`prisma/schema.prisma` & migration `20261029183000_place_traffic_profile`):
     - Added `PlaceTrafficProfile` model (`id`, `issueId`, `segmentId`, `direction`, `dayType` WEEKDAY|WEEKEND, `hour` 0-23, `delayRatio`, `source` TOMTOM_HISTORIC|LIVE_SAMPLE|ESTIMATED, `fetchedAt`).
     - Added relations to `Issue` and `RoadSegment`.
     - Deployed migration to Supabase production (`public` schema) and synchronized to isolated `test` schema.
  2. Per-Place Profile Builder (`src/lib/traffic/profile.ts`):
     - `buildPlaceProfile(issue)`:
       - 14-day validity cache check.
       - Proximity sharing across issues within 150m on the same road segment.
       - Constructs ~300m probe route along road bearing computed from TomTom Flow segment coordinates (or East-West fallback).
       - Queries 48 hourly slots (24 weekday + 24 weekend) using TomTom Routing with `departAt` and `traffic=true` processed concurrently in batches.
       - Extracts `delayRatio = (travelTimeSeconds - noTrafficTravelTimeSeconds) / noTrafficTravelTimeSeconds`.
       - Blends in live `TrafficSample` rows when present (weighted by sample count), elevating source to `LIVE_SAMPLE`.
       - Deterministic graceful degradation to `ESTIMATED` arterial/collector profile when key is missing or quota is exhausted.
  3. Quota Management & Budget (`src/lib/external/tomtom.ts`):
     - Tracked daily TomTom calls with `provider: "tomtom_daily"`, capped at 1,200 calls/day across all jobs.
     - Preserved 20,000 monthly quota cap.
     - Exported `tryIncrementDailyQuota`, `getDailyTomTomCallCount`, and `resetDailyTomTomCallCount`.
  4. Scheduled Job (`src/lib/jobs/trafficProfile.ts` & `src/lib/jobs/runner.ts`):
     - Registered `"traffic-profile"` scheduled job (runs every 2h).
     - Processes up to 25 open issues per run ordered by highest Priority Index (`priority DESC`), respecting daily quota budget.
  5. Live Traffic Endpoint & UI (`src/app/api/issues/[id]/traffic-live/route.ts` & `LiveTrafficCard.tsx`):
     - `GET /api/issues/[id]/traffic-live`: authenticated endpoint with 5-minute cache returning current speed vs free-flow, slower %, confidence, summary text, and today's 24-hour profile with the current hour marked.
     - Built `LiveTrafficCard` component with live status dot, speed metrics, 24-bar congestion sparkline highlighting the current hour, and data source attribution.
     - Added `LiveTrafficCard` to the public issue page (`src/app/(public)/issue/[id]/page.tsx`) and the desk slide-over drawer (`src/components/desk/IssueDrawer.tsx`).
  6. Test Database Isolation:
     - Configured isolated `schema=test` in Supabase with fail-fast production checks in Vitest and Playwright.
     - Ensured zero writes to production database from test runs.
  7. Verification:
     - Added `tests/unit/traffic-profile.test.ts` (13 tests) covering profile geometry, bearing, 150m offset, 48 slots, 14-day caching, 150m proximity sharing, live sample blending, daily 1,200 quota enforcement, endpoint 401/404/200, and scheduled job runner.
     - Full gate passed: 54 test files passed (312 tests green).

### Phase 0 · Diagnosis: TomTom Flow, Routing, ApiUsage, and Repair Window Analysis · 2026-10-29
- **Goal:** Probe live TomTom Flow and Routing APIs with the production key for the pilot point (12.9575, 77.7011), inspect ApiUsage and TrafficSample distribution across issues and hours of week, and document why repair windows were uniformly returning 00:30–02:30 / 04:00–06:00.
- **Empirical Findings:**
  1. TomTom Flow Segment Data (Point: 12.9575, 77.7011):
     - HTTP Status: `200 OK` (649ms latency)
     - Fields: `frc: FRC2`, `currentSpeed: 26 km/h`, `freeFlowSpeed: 26 km/h`, `currentTravelTime: 50s`, `freeFlowTravelTime: 50s`, `confidence: 1`, `roadClosure: false`, `coordinates`: 18 points spanning ~330m from (12.95703, 77.70099) to (12.96006, 77.70130).
  2. TomTom Calculate Route (Pilot road probe 12.9565, 77.7001 -> 12.9585, 77.7021):
     - HTTP Status: `200 OK` (212ms latency) with `computeTravelTimeFor=all`
     - Fields: `lengthInMeters: 1447`, `travelTimeInSeconds: 579`, `trafficDelayInSeconds: 191`, `trafficLengthInMeters: 933`, `departureTime: 2026-10-29T16:05:33+05:30`, `noTrafficTravelTimeInSeconds: 345`, `historicTrafficTravelTimeInSeconds: 471`, `liveTrafficIncidentsTravelTimeInSeconds: 579`.
     - Derived `delayRatio = (579 - 345) / 345 = 0.678` (67.8% traffic delay ratio).
  3. ApiUsage Quota Tracking:
     - `Provider: tomtom`, Month: `2026-10`, Count: `3` (out of 20,000 monthly quota).
  4. TrafficSample Distribution:
     - Total samples in database: 590 rows across 212 distinct issues (and 310 unassigned legacy samples).
     - Distinct `hourOfWeek` buckets represented: only 3 out of 168 hours! (`hourOfWeek=0` has 310, `hourOfWeek=104` has 200, `hourOfWeek=112` has 80).
     - 165 out of 168 hour buckets have 0 samples in the database.
  5. Explanation of Flat 00:30–02:30 / 04:00–06:00 Repair Windows:
     - Because 165 of 168 hours have no live samples, `repairWindow.ts` falls back to `getDefaultRoadClassProfile()` for almost all hours.
     - In `getDefaultRoadClassProfile()`, hours 00:00 to 06:00 IST are hardcoded to a flat baseline of `0.05` congestion for every road, while daytime/evening hours are all $\ge 0.15$.
     - Candidate 2-hour slots are sorted by `avgCongestion` ascending, breaking ties by earlier start time.
     - Consequently, the first non-overlapping window picked is always the earliest post-midnight slot (`00:30–02:30` or `01:00–03:00`), followed immediately by the next non-overlapping slot in that same night valley (`04:00–06:00`), giving every single issue in Bengaluru identical repair windows regardless of its actual local traffic patterns.

### Fixes · Citizen Account Registration & Validation Feedback · 2026-10-29
- **Goal:** Resolve issues preventing users from creating accounts on `/login`, fix silent UI failures, and provide clear password length and email collision guidance.
- **Implemented Work:**
  1. UI Error Visibility:
     - Rendered an alert box with `AlertCircle` in `src/app/(auth)/login/page.tsx` displaying exact server error text (e.g. "Password must be at least 8 characters", "User already exists", "A valid email is required").
     - Added quick one-click switch action when email is already registered: "Switch to LOGIN to sign in with this email →".
  2. Input Requirements & Accessibility:
     - Added live password character length counter & emerald status dot (`password.length >= 8 ? '8+ chars (Valid)' : 'Min. 8 chars (x/8)'`).
     - Added pre-flight client-side validation for name (required), email (format), and password (min 8 chars) before making the network request.
     - Changed email placeholder from `citizen@example.com` (which was already registered in seed data) to `your.email@example.com` / `you@example.com`.
     - Added standard HTML `name` attributes (`name="name"`, `name="email"`, `name="password"`) for autofill and test selector compatibility.
     - Added `/register` route redirecting to `/login?signup=true`.
  3. Session Persistence:
     - Upgraded post-registration redirect to use `window.location.href = target` to avoid client-side RSC cookie desync and ensure clean document navigation into `/citizen/dashboard`.
  4. Tests:
     - Added `tests/unit/auth-register.test.ts` covering password length, missing name, invalid email, successful registration with profile creation, and duplicate rejection.
     - Full gate passed: `typecheck`, `lint` (0 errors), `test` (53 suites, 299 tests passing), `build` (all routes compiled).

### Fixes · Blind Repair Audit Sole Decision Path & Defect Liability Clause · 2026-10-29
- **Goal:**
  1. Enforce blind repair audit as the ONLY mechanism to decide `CLAIMED_FIXED` issues.
  2. Prevent leakage of repair claims to assigned citizen auditors before voting.
  3. Remove invented "Clause 38", replace with "the defect liability clause of the contract", add optional `liabilityClauseRef` (desk-editable), retitle page to "Defect Liability Evidence Report", and add official competent authority footer.
- **Implemented Work:**
  1. Blind Audit as Sole Decision Path:
     - Updated `POST /api/issues/[id]/verify` to immediately return `409 AUDIT_IN_PROGRESS` for any issue in `CLAIMED_FIXED` status.
     - Updated `processVerification` in `src/lib/issues/verification.ts` to reject `CLAIMED_FIXED` issues with `VerificationError(409, "AUDIT_IN_PROGRESS", ...)`.
     - Removed `VerifyFixModal` and verify button from the public issue page (`src/app/(public)/issue/[id]/page.tsx`) when status is `CLAIMED_FIXED`, showing instead: *"This repair is being independently audited."*
  2. Auditor Secrecy & Anti-Leakage Protection:
     - On the public issue page, if the current logged-in user has an `OPEN` audit task for that issue:
       - Hides the status badge.
       - Hides the `CLAIMED_FIXED` and `REOPENED_IN_WARRANTY` banners.
       - Hides any report with `role === "CLAIM_FIX"` from the signed photo gallery.
       - Withholds the action log and status transitions, displaying: *"Action log is temporarily withheld while you have an active independent audit assignment for this location."*
     - Enforced `challengeNonce` validation in `submitAuditVote` to reject mismatched nonces (e.g. from other tasks or normal reports) with `"Invalid challenge nonce for audit task"`.
  3. Defect Liability Evidence Report & Schema Updates:
     - Added optional `liabilityClauseRef String?` to `model Issue` in `prisma/schema.prisma`.
     - Created and applied migration `prisma/migrations/20261029130000_liability_clause_ref/migration.sql` with `npx prisma migrate deploy`.
     - Exposed `liabilityClauseRef` in desk actions (`POST /api/issues/[id]/actions`) and `IssueDrawer.tsx` form.
     - Retitled `/api/issues/[id]/liability` to *"Defect Liability Evidence Report"*.
     - Replaced all occurrences of "Clause 38" across backend, desk drawer, metrics bar, and report templates with *"the defect liability clause of the contract"*.
     - Added prominent display of `issue.liabilityClauseRef` on the liability report when set.
     - Added official footer: *"Generated by CivicPulse from signed citizen audit evidence. To be issued by the competent authority."*
  4. Test Suite & Verification:
     - `tests/unit/verification.test.ts`: verified verify route returns 409 `AUDIT_IN_PROGRESS` for `CLAIMED_FIXED`.
     - `tests/unit/public-issue.test.ts`: verified public issue page renders *"This repair is being independently audited."* without verify button, and completely hides status, claim, claim photos, and action log when user has an active audit task.
     - `tests/unit/blind-audit-unit.test.ts`: verified `submitAuditVote` rejects nonces from another task or report nonces.
     - `tests/unit/liability-package.test.ts`: verified page title is "Defect Liability Evidence Report", has no "Clause 38", renders `liabilityClauseRef` when set and omits when unset, and includes competent authority footer.
     - `tests/e2e/blind-repair-audit.spec.ts`: verified end-to-end flow with updated liability report assertions (passed in 26.2s).
     - Full Gate: `npm run lint` (0 errors), `npm run typecheck` (0 errors), `npm test` (52 suites, 294 tests passing), `npm run build` (all routes compiled).

### Feature · Track B Blind Repair Audit & Contractor Liability Package · 2026-10-29
- **Goal:** Implement Track B Core novelty: a repair counts as `VERIFIED_FIXED` only after a blind, randomised citizen audit, repairs are re-audited across the warranty period, durability failures trigger `REOPENED_IN_WARRANTY` and compute `lifespanDays`, and desk officers have access to a printable Contractor Liability Package under the defect liability clause of the contract.
- **Implemented Work:**
  1. Data Model & Migration:
     - Added models `AuditTask`, `AuditVote`, and `AuditorScore`.
     - Added `repairClaimedAt`, `warrantyUntil`, `contractorName`, `tenderId`, `lifespanDays` to `Issue`.
     - Added `REOPENED_IN_WARRANTY` to `Status` enum.
     - Added `AUDIT` to `EvidenceRole` enum.
     - Created and deployed migration `prisma/migrations/20261029093000_blind_repair_audit/migration.sql` with `npx prisma migrate deploy` and confirmed 0 drift with `prisma migrate diff`.
  2. State Machine:
     - Added `REOPEN_IN_WARRANTY` transition rule (`VERIFIED_FIXED` -> `REOPENED_IN_WARRANTY`, allowed for `Role.SYSTEM`).
     - Allowed `REOPENED_IN_WARRANTY` in `ASSIGN_AGENCY`, `START_WORK`, `CLAIM_FIX`, and `OVERRIDE_BAND`.
  3. Core Blind Audit Engine (`src/lib/audit/blindAudit.ts`):
     - `assignBlindAuditTasks`: selects 3 random eligible citizens (account > 24h old, not reporter, not desk, active in 30d, location within 3 km -> 10 km -> open public queue).
     - Every 1 in 5 tasks sent to an auditor is a `CONTROL` task on a known-state issue.
     - `submitAuditVote`: checks challenge nonce, heading (tolerance ±45°), GPS accuracy (≤ 30m), uploads evidence photo, awards points, updates `AuditorScore` with Laplace smoothing `(passed + 1) / (total + 2)`, and evaluates decision thresholds:
       - Weighted `INTACT` ≥ 1.5 and > `DAMAGED` -> `VERIFIED_FIXED`.
       - Weighted `DAMAGED` ≥ 1.0 -> `DISPUTED`.
       - Durability `DAMAGED` -> `REOPENED_IN_WARRANTY` and calculates `lifespanDays`.
     - Logs all decisions to immutable `ActionLog`.
  4. Durability Scheduled Job (`src/lib/jobs/durability.ts`):
     - Checks issues in `VERIFIED_FIXED` within warranty for milestones (+7, +30, +90 days) or rain ≥ 20 mm in past 48 hours (via Open-Meteo).
     - Generates `DURABILITY` audit tasks.
     - Registered in `JOB_NAMES`, `src/lib/jobs/runner.ts`, `/api/jobs/[name]`, and `.github/workflows/jobs.yml`.
  5. Contractor Liability Package (`src/app/api/issues/[id]/liability/route.ts`):
     - Desk-only (`Role.AUTHORITY`) printable HTML notice under the defect liability clause of the contract.
     - Includes contractor name, tender reference, location, map link, claim dates, warranty window, signed evidence photos with SHA-256 hashes, timestamps, GPS accuracy, and audit votes.
     - Added "Defect Liability Notice" button on desk issue drawer and public issue page when status is `REOPENED_IN_WARRANTY`.
  6. Citizen & Desk Dashboards:
     - Created mobile-first Citizen Audit Missions page (`/citizen/audit`) with challenge bearing guide, live compass, camera capture, and verdict submission.
     - Added "Audit Tasks" tab in citizen navigation (`MobileNav.tsx`, `AppSidebar.tsx`).
     - Added "Repair lifespan" (overall, by ward, by contractor) and "Reopened in warranty" metrics to desk view (`DeskMetricsBar.tsx`).
     - Created public ward page (`/ward/[id]`) displaying ward claim gap % and median repair lifespan.
  7. Test Coverage & Full Quality Gate:
     - Unit tests: `tests/unit/blind-audit-unit.test.ts` (11 tests), `tests/unit/liability-package.test.ts` (3 tests).
     - E2E Playwright test: `tests/e2e/blind-repair-audit.spec.ts` (claim fix -> 3 blind audit tasks -> citizen votes -> `VERIFIED_FIXED` -> durability `DAMAGED` -> `REOPENED_IN_WARRANTY` -> printable liability package).
     - Full gate passed: `lint` (0 errors), `typecheck` (0 errors), `test` (52 suites, 290 tests passing), `build` (all routes compiled).


### Review 29 Oct · Traffic Sample Fixes, Persistent Quota & Migration · 2026-10-29
- **Goal:** Exclude seed issues (`isSeed: false`) and cap assigned/claimed issues at 40 in `trafficSample.ts`, make TomTom monthly quota counter persistent in the database (`ApiUsage` table keyed by provider+month) shared across routing and flow calls (20k/month cap), add and deploy a Prisma migration for `TrafficSample` and `ApiUsage` via `prisma migrate deploy`, and verify production DB schema matches.
- **Implemented Fixes:**
  1. `src/lib/jobs/trafficSample.ts`:
     - Excluded seed issues (`where: { isSeed: false }`) from both the open issues query and the assigned/claimed issues query.
     - Capped the assigned/claimed query at 40 (highest priority first), bounding each run to at most ~80 candidate issues.
  2. Persistent Quota Tracking (`src/lib/external/tomtom.ts` & `ApiUsage` table):
     - Added `ApiUsage` table in `prisma/schema.prisma` with `@@unique([provider, month])`.
     - Replaced in-memory counter with atomic check/upsert against `ApiUsage` for provider `"tomtom"` and current month (e.g. `"2026-10"`).
     - Both TomTom Routing and Traffic Flow Segment calls share this persistent 20,000 calls/month budget.
     - Added `resetMonthlyTomTomCallCount()` and `getMonthlyTomTomCallCount()` database helpers.
  3. Prisma Migration & Production Schema Verification:
     - Created migration `prisma/migrations/20261029085500_traffic_sample_and_api_usage/migration.sql`.
     - Applied to production database using `npx prisma migrate deploy`.
     - Verified with `npx prisma migrate status` (3 migrations found, database schema is up to date).
     - Confirmed schema parity using `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma` ("No difference detected").
  4. Test Suite Updates:
     - `tests/unit/traffic-sample-job.test.ts`: verified `isSeed: false` and `take: 40` on both queries.
     - `tests/unit/traffic-endpoint-and-tomtom.test.ts`: verified persistent `ApiUsage` quota tracking and cap enforcement at 20,000 calls/month.
     - `tests/contract/tomtom-routing.test.ts`: updated `beforeEach` to await database quota reset.
- **Full Gate Results:**
  ```
  $ npm run lint
  > miniproject@0.1.0 lint
  > eslint
  C:\Users\sujay\Downloads\miniproject_v2\miniproject\src\app\citizen\report\[id]\page.tsx
    136:20  warning  Using `<img>` could result in slower LCP and higher bandwidth.  @next/next/no-img-element
  ✖ 1 problem (0 errors, 1 warning)

  $ npm run typecheck
  > miniproject@0.1.0 typecheck
  > tsc --noEmit
  [exit 0]

  $ npm test
  > miniproject@0.1.0 test
  > vitest run
   Test Files  50 passed (50)
        Tests  276 passed (276)
     Duration  8.71s

  $ npm run build
  > miniproject@0.1.0 build
  > next build --webpack
  ▲ Next.js 16.2.4 (webpack)
  ✓ Compiled successfully in 7.1s
  Finished TypeScript in 9.7s ...
  ✓ Generating static pages using 15 workers (21/21) in 685ms
  ```

### Review 29 Oct · Real Traffic in Priority & Recommended Repair Window · 2026-10-29
- **Goal:** Implement real traffic flow integration (TomTom free tier, India only) to influence Priority Index exposure calculations and provide recommended 2-hour repair windows for desk operators with rain forecast exclusion.
- **Implemented Changes:**
  1. `src/lib/external/tomtom.ts`:
     - Added `getFlowSegment(lat, lng)` querying TomTom Traffic Flow Segment API (absolute, zoom 10).
     - Returns `{ currentSpeed, freeFlowSpeed, confidence, frc }`.
     - Enforces India bounding box (`isLocationInIndia`), shared monthly quota counter (`MAX_MONTHLY_QUOTA = 20000`), and 15-minute in-memory cache.
     - Null-safe: returns `null` on missing key, quota exceeded, or network error (never throws).
  2. Prisma Schema:
     - Updated `model TrafficSample` with `issueId`, `hourOfWeek` (0-167 IST), `currentSpeed`, `freeFlowSpeed`, `congestionR = 1 - current/freeFlow` (clamped `[0, 1]`), `frc`, `confidence`, and relations to `Issue` and `RoadSegment`.
     - Updated `model Issue` with `trafficSamples TrafficSample[]`.
     - Ran `npx prisma db push` and `npx prisma generate`.
  3. Scheduled Job `traffic-sample`:
     - Implemented `src/lib/jobs/trafficSample.ts` (`runTrafficSample`).
     - Samples top 40 open issues by Priority Index plus any `ASSIGNED` or `CLAIMED_FIXED` issues.
     - Enforces daily budget of 1,500 TomTom calls (`DAILY_TOMTOM_BUDGET = 1500`).
     - Skips issues sampled for the same `hourOfWeek` in the last 7 days.
     - Registered in `JOB_NAMES` in `src/lib/jobs/runner.ts`, `/api/jobs/[name]`, and `.github/workflows/jobs.yml` (cron `0 */2 * * *`).
  4. Priority Recomputation:
     - In `src/lib/jobs/priorityRecompute.ts`, queries traffic samples from the last 14 days and computes median `congestionR`.
     - Maps TomTom `frc` to `roadClass` (`FRC0`→`trunk`, `FRC1`→`primary`, `FRC2`→`secondary`, `FRC3`→`tertiary`, `FRC4`/`FRC5`→`residential`, `FRC6`→`service`) when `roadClass` is empty.
     - Passes `congestionR` to `computePriority` (exposure factor).
     - Records `"traffic: live|estimated"` in priority explanation (`piText` and `piBreakdown`).
  5. Repair Window Calculation & API:
     - Created `src/lib/traffic/repairWindow.ts` calculating 168-hour congestion profiles from live samples with road-class fallback profile featuring daytime peaks (8-11 & 17-21 IST) and night lows.
     - Excludes hours on days with forecast rain ≥ 5.0 mm using Open-Meteo `WeatherForecast` data.
     - Returns top 3 non-overlapping 2-hour windows in next 7 days with expected congestion, condition, and data basis (`live` with sample count or `estimated`).
     - Created `GET /api/issues/[id]/repair-window` restricted to desk users (`Role.AUTHORITY`).
  6. Desk UI:
     - Created `src/components/desk/RepairWindowBadge.tsx` displaying `"Best repair window: Tue 01:00-03:00 (low traffic, dry) · based on N samples"` with `live` vs `estimated` badges.
     - Added repair window display to desk queue cards in `src/components/desk/DeskQueue.tsx`.
     - Added detailed repair window view with alternative windows to `src/components/desk/IssueDrawer.tsx`.
     - Added repair window view for desk operators in `src/app/(public)/issue/[id]/page.tsx`.
  7. Test Coverage:
     - `tests/unit/traffic-congestion.test.ts`: congestion math clamping `[0, 1]`, median calculation, `frc`→`roadClass` mapping, and IST hour of week calculation.
     - `tests/unit/traffic-repair-window.test.ts`: road-class fallback profile peak curves, window selection with rain exclusion, and live vs estimated data basis.
     - `tests/unit/traffic-sample-job.test.ts`: 1,500 daily budget limiting, top 40 open + claimed/assigned selection, skipping 7-day duplicates.
     - `tests/unit/traffic-priority-recompute.test.ts`: median congestion injection, FRC mapping, and `"traffic: live|estimated"` recorded in `piText`.
     - `tests/unit/traffic-endpoint-and-tomtom.test.ts`: desk-only auth enforcement (401/403/200), null-safety when key unset or quota hit, 15-minute caching.
- **Full Gate Results:**
  ```
  $ npm run lint
  > miniproject@0.1.0 lint
  > eslint
  C:\Users\sujay\Downloads\miniproject_v2\miniproject\src\app\citizen\report\[id]\page.tsx
    136:20  warning  Using `<img>` could result in slower LCP and higher bandwidth.  @next/next/no-img-element
  ✖ 1 problem (0 errors, 1 warning)

  $ npm run typecheck
  > miniproject@0.1.0 typecheck
  > tsc --noEmit
  [exit 0]

  $ npm test
  > miniproject@0.1.0 test
  > vitest run
   Test Files  50 passed (50)
        Tests  274 passed (274)
     Duration  8.23s

  $ npm run build
  > miniproject@0.1.0 build
  > next build --webpack
  ▲ Next.js 16.2.4 (webpack)
  ✓ Compiled successfully in 17.1s
  Finished TypeScript in 9.1s ...
  ✓ Generating static pages using 15 workers (21/21) in 642ms
  ```

### Review 29 Oct · AI Queue Error Diagnostics & Deleted Target Handling · 2026-10-29
- **Goal:** Fix production `ai-queue` job failure (`{"processed":0,"failed":20}`) where jobs were failing silently. Add error logging in catch blocks (`console.error("[ai-queue] job failed", jobId, err)`), return sanitized `firstError` in `runJob("ai-queue")`, handle deleted target reports/issues by marking `status: "failed"` with `attempts: 3` (no retry) and moving on without reporting an error, add reproduction unit tests, reset failed jobs with `attempts < 3` to `queued`, and run full gate.
- **Root Cause:**
  - In `src/lib/ai/triage.ts` (`processG1Job`) and `src/lib/ai/fixCheck.ts` (`processG2Job`), when an enqueued job pointed to a report or issue that was deleted during testing/migration, `findUnique` returned `null` and `processG1Triage`/`processG2FixCheck` returned `null`.
  - The functions treated `null` by updating `status: "failed"` and returning `false`, with `attempts` incremented by 1.
  - In `src/lib/jobs/runner.ts` (`runAiQueue`), `failed++` was incremented for every such job. Because `attempts: { lt: 3 }` was checked and the 20 oldest jobs in the queue all pointed to deleted reports, the same 20 deleted-target jobs occupied all 20 slots of `take: 20` and returned `{"processed":0,"failed":20}` on each run, blocking newer valid jobs from being processed.
- **Implemented Fixes:**
  - `src/lib/ai/triage.ts` & `src/lib/ai/fixCheck.ts`:
    - Detected when target report/issue no longer exists (`!report && !issueReport` or triage returning `null`).
    - Handled deleted targets by updating `aiJob` with `{ status: "failed", attempts: 3 }` (permanent failure with no retry) and returning `{ ok: true, skipped: "target_deleted" }`.
    - Catch blocks now log `console.error("[ai-queue] job failed", jobId, err)` and return `{ ok: false, error: err instanceof Error ? err.message : String(err) }`.
  - `src/lib/jobs/runner.ts`:
    - Updated `runAiQueue` to distinguish skipped jobs (`res.skipped`) from processed and failed jobs.
    - Captured first error via `sanitizeErrorMessage` and returned `firstError` in `JobResult` (message only, secrets/paths redacted).
  - `tests/contract/tomtom-routing.test.ts`:
    - Isolated `isConfigured("TOMTOM_API_KEY")` spy for the keys-later test case so that when `TOMTOM_API_KEY` is present in developer's local environment, the keys-later test continues to test synthetic route fallback deterministically.
  - `tests/unit/ai-queue-deleted-target.test.ts`:
    - Added comprehensive unit tests verifying:
      1. G1 job with deleted target is marked `status: "failed"`, `attempts: 3` and skipped cleanly.
      2. G2 job with deleted target is marked `status: "failed"`, `attempts: 3` and skipped cleanly.
      3. `processG1Job` catch block logs to `console.error` and returns sanitized error message when processing throws.
  - Database Reset:
    - Reset all 38 `AiJob` rows with `status: "failed"` and `attempts < 3` back to `status: "queued"`.
- **Full Gate Results:**
  ```
  $ npm run lint
  > miniproject@0.1.0 lint
  > eslint
  C:\Users\sujay\Downloads\miniproject_v2\miniproject\src\app\citizen\report\[id]\page.tsx
    136:20  warning  Using `<img>` could result in slower LCP and higher bandwidth.  @next/next/no-img-element
  ✖ 1 problem (0 errors, 1 warning)

  $ npm run typecheck
  > miniproject@0.1.0 typecheck
  > tsc --noEmit
  [exit 0]

  $ npm test
  > miniproject@0.1.0 test
  > vitest run
   Test Files  45 passed (45)
        Tests  243 passed (243)
     Duration  7.94s

  $ npm run build
  > miniproject@0.1.0 build
  > next build --webpack
  ▲ Next.js 16.2.4 (webpack)
  ✓ Compiled successfully in 8.5s
  Finished TypeScript in 8.1s ...
  ✓ Generating static pages using 15 workers (21/21) in 568ms
  ```

### Review 29 Oct · Gate Verification for Commit 1e257d3 · 2026-10-29
- **Goal:** Run `npm ci`, full gate (`npm run lint && npm run typecheck && npm test && npm run build`), and `npm run e2e` following code review commit `1e257d3` (security hardening, AI wiring, scheduled jobs). Fix any failures caused by that commit with smallest changes without weakening tests.
- **Verification Summary:**
  - `npm ci`: Added 543 packages, Prisma client generated cleanly.
  - `npm run lint`: 0 errors, 1 existing warning (`@next/next/no-img-element`).
  - `npm run typecheck`: 0 errors (`tsc --noEmit` clean).
  - `npm test`: 44 test files passed, 240 tests passed (including new `tests/unit/security-hardening.test.ts` and `tests/unit/jobs-route.test.ts`).
  - `npm run build`: Compiled successfully in 15.1s, static pages generated (21/21) cleanly.
  - `npm run e2e`: 16 passed, 2 skipped (legacy). Both `demo` and `mobile-flows` suites passed cleanly.
  - Zero code changes required: all 14 review fixes in `1e257d3` compiled and passed all gate and E2E checks without errors.
- **Real Output:**
  ```
  $ npm ci
  > miniproject@0.1.0 postinstall
  > prisma generate
  Loaded Prisma config from prisma.config.ts.
  Prisma schema loaded from prisma\schema.prisma.
  ✔ Generated Prisma Client (v7.8.0) to .\node_modules\@prisma\client in 260ms
  added 543 packages, and audited 544 packages in 1m

  $ npm run lint
  > miniproject@0.1.0 lint
  > eslint
  C:\Users\sujay\Downloads\miniproject_v2\miniproject\src\app\citizen\report\[id]\page.tsx
    136:20  warning  Using `<img>` could result in slower LCP and higher bandwidth. Consider using `<Image />` from `next/image` or a custom image loader to automatically optimize images. This may incur additional usage or cost from your provider. See: https://nextjs.org/docs/messages/no-img-element  @next/next/no-img-element
  ✖ 1 problem (0 errors, 1 warning)

  $ npm run typecheck
  > miniproject@0.1.0 typecheck
  > tsc --noEmit
  [exit 0]

  $ npm test
  > miniproject@0.1.0 test
  > vitest run
   RUN  v3.2.7 C:/Users/sujay/Downloads/miniproject_v2/miniproject
   ✓ tests/unit/state-machine.test.ts (29 tests) 23ms
   ✓ tests/unit/route-choice.test.ts (4 tests) 17ms
   ✓ tests/unit/priority.test.ts (5 tests) 26ms
   ✓ tests/unit/verification-eligibility-ui.test.tsx (12 tests) 80ms
   ✓ tests/contract/ai-provider-chain.test.ts (6 tests) 1976ms
   ✓ tests/unit/signing-verification.test.ts (8 tests) 1893ms
   ✓ tests/unit/storage-error-handling.test.ts (4 tests) 1737ms
   ✓ tests/contract/storage.test.ts (8 tests) 21ms
   ✓ tests/contract/tomtom-routing.test.ts (8 tests) 2211ms
   ✓ tests/unit/device-key.test.ts (6 tests) 766ms
   ✓ tests/unit/priority-breakdown.test.tsx (3 tests) 42ms
   ✓ tests/unit/security-hardening.test.ts (5 tests) 1478ms
   ✓ tests/unit/photo-triage.test.ts (3 tests) 3551ms
   ✓ tests/unit/segment-matching.test.ts (5 tests) 25ms
   ✓ tests/unit/public-issue.test.ts (4 tests) 2985ms
   ✓ tests/contract/actions.test.ts (4 tests) 3532ms
   ✓ tests/unit/explainer.test.ts (4 tests) 1150ms
   ✓ tests/unit/pwa.test.ts (4 tests) 32ms
   ✓ tests/unit/points.test.ts (8 tests) 14ms
   ✓ tests/unit/seed-location-display.test.ts (4 tests) 13ms
   ✓ tests/unit/priority-display.test.ts (4 tests) 11ms
   ✓ tests/unit/nonce.test.ts (7 tests) 1847ms
   ✓ tests/unit/readme-audit.test.ts (3 tests) 686ms
   ✓ tests/contract/merge.test.ts (5 tests) 5231ms
   ✓ tests/unit/ai-quota.test.ts (3 tests) 13ms
   ✓ tests/unit/pwa-install-banner.test.ts (3 tests) 15ms
   ✓ tests/contract/weather.test.ts (4 tests) 955ms
   ✓ tests/unit/claim-gap.test.ts (4 tests) 1760ms
   ✓ tests/contract/road-timeline.test.ts (5 tests) 1469ms
   ✓ tests/unit/verification.test.ts (4 tests) 6722ms
   ✓ tests/contract/seed-auth.test.ts (6 tests) 1555ms
   ✓ tests/contract/osm-snap.test.ts (6 tests) 2519ms
   ✓ tests/unit/mobile-logout.test.tsx (3 tests) 39ms
   ✓ tests/unit/config.test.ts (3 tests) 9ms
   ✓ tests/unit/desk-nav.test.ts (3 tests) 309ms
   ✓ tests/unit/jobs-route.test.ts (4 tests) 24ms
   ✓ tests/contract/health-aiqueue.test.ts (3 tests) 1045ms
   ✓ tests/contract/match-segments.test.ts (1 test) 827ms
   ✓ tests/contract/geom-trigger.test.ts (1 test) 643ms
   Test Files  44 passed (44)
        Tests  240 passed (240)
     Start at  00:20:30
     Duration  11.58s (transform 7.18s, setup 0ms, collect 47.79s, tests 60.04s, environment 24ms, prepare 20.13s)

  $ npm run build
  > miniproject@0.1.0 build
  > next build --webpack
  ▲ Next.js 16.2.4 (webpack)
  - Environments: .env.local, .env
    Creating an optimized production build ...
  ✓ Compiled successfully in 15.1s
    Running TypeScript ...
    Finished TypeScript in 9.8s ...
    Collecting page data using 15 workers ...
    Generating static pages using 15 workers (0/21) ...
    Generating static pages using 15 workers (5/21) 
    Generating static pages using 15 workers (10/21) 
    Generating static pages using 15 workers (15/21) 
  ✓ Generating static pages using 15 workers (21/21) in 645ms
    Finalizing page optimization ...
    Collecting build traces ...
  Route (app)
  ┌ ○ /
  ├ ○ /_not-found
  ├ ƒ /api/auth/[...nextauth]
  ├ ƒ /api/auth/register
  ├ ƒ /api/claim-gap
  ├ ƒ /api/desk/queue
  ├ ƒ /api/evidence/device
  ├ ƒ /api/evidence/nonce
  ├ ƒ /api/health
  ├ ƒ /api/issues/[id]/actions
  ├ ƒ /api/issues/[id]/log
  ├ ƒ /api/issues/[id]/verify
  ├ ƒ /api/jobs/[name]
  ├ ƒ /api/personnels
  ├ ƒ /api/personnels/[id]
  ├ ƒ /api/reports
  ├ ƒ /api/reports/[id]/comments
  ├ ƒ /api/reports/authority
  ├ ƒ /api/reports/nearby
  ├ ƒ /api/routes/safe
  ├ ƒ /api/segments/[id]/timeline
  ├ ƒ /api/stats
  ├ ƒ /citizen/dashboard
  ├ ƒ /citizen/extra
  ├ ƒ /citizen/map
  ├ ƒ /citizen/profile
  ├ ƒ /citizen/report
  ├ ƒ /citizen/report/[id]
  ├ ƒ /claim-gap
  ├ ƒ /desk
  ├ ƒ /desk/dashboard
  ├ ƒ /desk/map
  ├ ƒ /desk/personnels
  ├ ƒ /desk/status
  ├ ƒ /desk/tickets
  ├ ƒ /issue/[id]
  ├ ○ /login
  └ ƒ /road/[segmentId]

  $ npm run e2e
  > miniproject@0.1.0 e2e
  > playwright test
  Running 18 tests using 1 worker
    ok  1 [chromium] › tests\e2e\demo.spec.ts:55:7 › T73: End-to-End CivicPulse Demo Story › Demo Story: Citizen report -> No gallery picker -> Signed claim -> Citizen dispute -> Claim gap rises -> Road timeline recurrence (13.0s)
    -   2 [chromium] › tests\e2e\legacy\sync.spec.ts:5:7 › legacy sync test › Cross-module sync between Citizen and Authority
    -   3 [chromium] › tests\e2e\legacy\test-login.spec.js:5:3 › legacy login test › test login page
    ok  4 [chromium] › tests\e2e\map-layers.spec.ts:6:7 › T46: Map Layers Acceptance E2E › toggles issues and live traffic layers without console errors (5.0s)
    ok  5 [chromium] › tests\e2e\map-refactor.spec.ts:15:7 › T40 Map Refactor Acceptance: Citizen and Desk Maps › renders Citizen Map (/citizen/map) with Leaflet container and controls (4.2s)
    ok  6 [chromium] › tests\e2e\map-refactor.spec.ts:47:7 › T40 Map Refactor Acceptance: Citizen and Desk Maps › renders Desk Map (/desk/map) with Leaflet container and routing grid (4.1s)
    ok  7 [chromium] › tests\e2e\map-refactor.spec.ts:79:7 › T40 Map Refactor Acceptance: Citizen and Desk Maps › line counts of both wrapper components are below 150 lines (11ms)
    ok  8 [chromium] › tests\e2e\mobile-flows.spec.ts:48:7 › Mobile Viewport E2E: Desk Actions & Mobile Logout Flows › Desk logs in on mobile, opens /desk, confirms an issue via IssueDrawer and sees it logged, then logs out (2.6s)
    ok  9 [chromium] › tests\e2e\mobile-flows.spec.ts:107:7 › Mobile Viewport E2E: Desk Actions & Mobile Logout Flows › Citizen logs in on mobile, views profile, and logs out (1.9s)
    ok 10 [chromium] › tests\e2e\phase2-acceptance.spec.ts:52:7 › Phase 2 E2E Acceptance Suite (T20–T29) › T20 e2e: after login, a DeviceKey row exists; reloading the page reuses the same key (5.1s)
    ok 11 [chromium] › tests\e2e\phase2-acceptance.spec.ts:92:7 › Phase 2 E2E Acceptance Suite (T20–T29) › T22 e2e: capture page has no file input on camera component (2.2s)
    ok 12 [chromium] › tests\e2e\phase2-acceptance.spec.ts:121:7 › Phase 2 E2E Acceptance Suite (T20–T29) › T23 e2e: citizen files a report and lands on /issue/<id> with the photo visible; a second report 10 m away merges (3.3s)
    ok 13 [chromium] › tests\e2e\phase2-acceptance.spec.ts:243:7 › Phase 2 E2E Acceptance Suite (T20–T29) › T26 e2e: desk-a confirms an issue, desk-b sees "Confirmed by Desk A" (3.6s)
    ok 14 [chromium] › tests\e2e\phase2-acceptance.spec.ts:308:7 › Phase 2 E2E Acceptance Suite (T20–T29) › T27 e2e: desk claims, citizen disputes → DISPUTED (5.0s)
    ok 15 [chromium] › tests\e2e\phase2-acceptance.spec.ts:464:7 › Phase 2 E2E Acceptance Suite (T20–T29) › T28 e2e: logged-out visitor sees the timeline and photos; no desk-only controls rendered (574ms)
    ok 16 [chromium] › tests\e2e\phase2-acceptance.spec.ts:538:7 › Phase 2 E2E Acceptance Suite (T20–T29) › T29 e2e: claim-gap page renders with seed data labelled "seed" (491ms)
    ok 17 [chromium] › tests\e2e\pwa.spec.ts:4:7 › T70: PWA Installability and Static Shell › serves manifest.json and links it in page head (291ms)
    ok 18 [chromium] › tests\e2e\road-timeline.spec.ts:6:7 › T60: Road timeline public page › loads road timeline page, shows metadata, stats, chronological order, and seed tags (343ms)
    2 skipped
    16 passed (2.2m)

  $ npm run e2e -- demo
  1 passed (10.8s)

  $ npm run e2e -- mobile-flows
  2 passed (41.1s)
  ```

### Fix · Use SUPABASE_URL only, keep safe errors · 2026-10-28
- **Goal:** Remove workaround URL derivation, guessed retries, and stale project string detection from `src/lib/external/storage.ts`. Ensure the app strictly uses `SUPABASE_URL` from environment, fails cleanly with clear diagnostics if wrong, and preserves `sanitizeErrorMessage`, `formatSafeApiError`, `StorageUploadError`, and clear API error reporting.
- **Implemented:**
  - `src/lib/external/storage.ts`: Reverted URL derivation and automatic retry workarounds. App strictly reads `env.SUPABASE_URL`. If storage upload fails, throws `StorageUploadError` with clear diagnostics (`502 STORAGE_UPLOAD_FAILED`).
  - `src/lib/api/errors.ts`: Preserved `sanitizeErrorMessage` and `formatSafeApiError` (redacting DB passwords, JWTs, secret keys, internal filesystem paths).
  - `tests/contract/storage.test.ts` & `tests/unit/storage-error-handling.test.ts`: Updated tests to verify strict `SUPABASE_URL` usage, failure handling, and credential sanitization.
- **Checks Run:**
  ```
  [Full Gate: npm run lint && npm run typecheck && npm test && npm run build]
  > eslint
  ✖ 1 problem (0 errors, 1 warning: @next/next/no-img-element)
  > tsc --noEmit
  ✔ 0 errors
  > vitest run
  Test Files  36 passed (36)
  Tests  202 passed (202)
  > next build --webpack
  ✓ Compiled successfully in 13.5s
  Finished TypeScript in 22.1s ...
  ✓ Generating static pages using 15 workers (19/19) in 1563ms
  ```

### Fix · Supabase Storage Resilience and API Error Sanitization · 2026-10-28
- **Goal:** Fix `POST /api/reports` 500 error on Vercel caused by Supabase Storage `fetch failed`, add automated test suite, ensure resilient canonical project URL recovery, and return sanitized, informative error diagnostics without leaking secrets.
- **Root Cause:**
  1. `SUPABASE_URL` in `.env.local` / Vercel was configured with `https://rljzuuwzwsdorimmbglx.supabase.co`, which has no DNS record (`getaddrinfo ENOTFOUND`). The actual database project ref is `ofkshdculpzvqergntcs` (`https://ofkshdculpzvqergntcs.supabase.co`).
  2. In `src/app/api/reports/route.ts`, the catch block caught storage failures and masked them with a generic `500 INTERNAL_ERROR "Internal server error filing report"`, giving the client zero actionable diagnostics.
- **Implemented:**
  - `src/lib/api/errors.ts`: Added `sanitizeErrorMessage` (redacts DB credentials with passwords, JWTs, API keys, internal filesystem paths) and `formatSafeApiError` (maps `StorageUploadError` to 502 Bad Gateway with diagnostic guidance, `StorageValidationError` to 400).
  - `src/lib/external/storage.ts`: Added `StorageUploadError`, `deriveUrlFromDatabaseString` (derives canonical Supabase project URL from `APP_DATABASE_URL` pooler username `postgres.<ref>`), and `resolveSupabaseUrl` (detects and recovers from stale/dead host `rljzuuwzwsdorimmbglx`, attempts fallback if initial upload fails with network `fetch failed`).
  - `src/app/api/reports/route.ts`, `src/app/api/issues/[id]/actions/route.ts`, `src/app/api/issues/[id]/verify/route.ts`: Switched error handlers to `formatSafeApiError` so clear sanitized messages are returned to the UI.
  - `tests/unit/storage-error-handling.test.ts`: Added comprehensive test suite verifying 502 `STORAGE_UPLOAD_FAILED` response on storage failure, 400 on storage validation error, secret/credential sanitization, and URL derivation.
  - `tests/contract/storage.test.ts`: Added unit tests for URL derivation and sanitization.
- **Checks Run:**
  ```
  [Full Gate: npm run lint && npm run typecheck && npm test && npm run build]
  > eslint
  ✖ 1 problem (0 errors, 1 warning)
  > tsc --noEmit
  ✔ 0 errors
  > vitest run
  Test Files  36 passed (36)
  Tests  205 passed (205)
  > next build --webpack
  ✓ Compiled successfully in 7.8s
  Finished TypeScript in 10.0s ...
  ✓ Generating static pages using 15 workers (19/19) in 564ms
  ```

### Fix · Prisma generate on Vercel · 2026-10-28
- **Goal:** Fix Vercel build failure (`Type error: Module "@prisma/client" has no exported member 'Role' (prisma/seed.ts)`).
- **Implemented:**
  - `package.json`: Added `"postinstall": "prisma generate"` to ensure Prisma Client is automatically generated when Vercel executes `npm install` prior to running `next build`.
  - `tsconfig.json`: Added `"prisma"` and `"scripts"` to `exclude` array so administrative/seed scripts outside Next.js are not compiled by `next build`'s production TypeScript type check.
  - `prisma.config.ts`: Added fallback empty string `process.env["DIRECT_DATABASE_URL"] || process.env["APP_DATABASE_URL"] || ""` to prevent undefined connection string errors during offline generation.
  - `src/lib/external/storage.ts`: Isolated remote network photo upload calls when running under Vitest/test environment (`process.env.NODE_ENV === "test" || process.env.VITEST === "true"`), returning deterministic synthetic URLs to comply with Rule 14.
- **Checks Run:**
  ```
  [Full Gate: npm run lint && npm run typecheck && npm test && npm run build]
  > eslint
  ✖ 1 problem (0 errors, 1 warning)
  > tsc --noEmit
  ✔ 0 errors
  > vitest run
  Test Files  35 passed (35)
  Tests  196 passed (196)
  > next build --webpack
  ✓ Compiled successfully in 7.3s
  Finished TypeScript in 10.7s ...
  ✓ Generating static pages using 15 workers (19/19) in 816ms
  ```

### T73 · Demo seed and demo story E2E suite · 2026-10-28
- **Goal:** Create labelled seed demo script (`scripts/seed-demo.ts`) covering pilot corridor segments with traffic samples, road fix-then-fail history, and issues across bands; build and verify complete end-to-end demo story Playwright suite (`tests/e2e/demo.spec.ts`) passing twice in a row.
- **Implemented:**
  - `scripts/seed-demo.ts`: Seeder for demo data:
    - 10 arterial road segments along Outer Ring Road corridor with realistic traffic samples (`currentSpeed`, `freeFlowSpeed`, `confidence`).
    - Fix-then-fail municipal history on Kadubeesanahalli segment (resurfacing, utility road cut, monsoon waterlogging, citizen report, agency handoff, verified fix, recurrence).
    - Multi-band issues: `CRITICAL` (waterlogging on Bellandur corridor), `HIGH` (recurrence on Kadubeesanahalli), `MEDIUM` (streetlights on Cessna Park road), and `LOW` (traffic signs on Agara lake section).
  - `package.json`: Added `"seed:demo": "tsx scripts/seed-demo.ts"`.
  - `tests/e2e/demo.spec.ts`: End-to-end demo story suite testing the full lifecycle:
    1. Citizen signs in and reports a pothole on Outer Ring Road corridor with signed ECDSA P-256 evidence.
    2. PostGIS automatically snaps the report to pilot segment `seed-seg-orr-kadubeesanahalli`.
    3. Desk confirms the issue (`OPEN` → `CONFIRMED`).
    4. Assert that NO generic gallery picker (`<input type="file">`) exists.
    5. Desk claims fix with signed photo evidence (`CONFIRMED` → `CLAIMED_FIXED`).
    6. Second citizen inspects and disputes the fix (`CLAIMED_FIXED` → `DISPUTED`).
    7. Public `/claim-gap` scorecard reflects the disputed claim and rising claim gap metrics.
    8. Public `/road/[segmentId]` timeline displays the full chronological history with visible `data-testid="seed-tag"`.
- **Verified Against Docs:** PLAN.md Section 10 T73 card, Section 11 P3 row.
- **Checks Run (Passed Twice in a Row):**
  ```
  [Run 1 of 2: npm run e2e -- demo]
  > miniproject@0.1.0 e2e
  > playwright test demo

  Running 1 test using 1 worker
  [Seed Demo] Initializing CivicPulse Demo Environment...
  [Seed Demo] Seeding ~10 pilot road segments and traffic samples...
  [Seed Demo] Seeding fix-then-fail history on Kadubeesanahalli segment...
  [Seed Demo] Seeding issues across bands (CRITICAL, HIGH, MEDIUM, LOW)...
  [Seed Demo] Demo environment seeded successfully!
    ok 1 [chromium] › tests\e2e\demo.spec.ts:55:7 › T73: End-to-End CivicPulse Demo Story › Demo Story: Citizen report -> No gallery picker -> Signed claim -> Citizen dispute -> Claim gap rises -> Road timeline recurrence (10.6s)

    1 passed (13.4s)

  [Run 2 of 2: npm run e2e -- demo]
  > miniproject@0.1.0 e2e
  > playwright test demo

  Running 1 test using 1 worker
  [Seed Demo] Initializing CivicPulse Demo Environment...
  [Seed Demo] Seeding ~10 pilot road segments and traffic samples...
  [Seed Demo] Seeding fix-then-fail history on Kadubeesanahalli segment...
  [Seed Demo] Seeding issues across bands (CRITICAL, HIGH, MEDIUM, LOW)...
  [Seed Demo] Demo environment seeded successfully!
    ok 1 [chromium] › tests\e2e\demo.spec.ts:55:7 › T73: End-to-End CivicPulse Demo Story › Demo Story: Citizen report -> No gallery picker -> Signed claim -> Citizen dispute -> Claim gap rises -> Road timeline recurrence (10.9s)

    1 passed (13.7s)

  [Full Gate: npm run lint && npm run typecheck && npm test && npm run build]
  > eslint
  ✔ 0 errors, 1 warning (img element in report page)
  > tsc --noEmit
  ✔ 0 errors
  > vitest run
  Test Files  35 passed (35)
  Tests  196 passed (196)
  > next build --webpack
  ✓ Compiled successfully in 8.0s
  ✓ Generating static pages (19/19) in 688ms
  ```

### T72 · Security, README and municipal framing audit · 2026-10-28
- **Goal:** Rewrite README around the municipal road truth ledger (what, why, how to run, environment variables table, Mermaid architecture diagram, data sources & attributions), and eliminate all "Metropolitan Security Grid" phrasing across the repository.
- **Implemented:**
  - `README.md`: Comprehensive rewrite covering:
    - CivicPulse mission and elimination of the "claim gap".
    - Full ASCII/Mermaid flowcharts depicting cryptographic device signing, PostGIS spatial deduplication, Priority Index engine, append-only ActionLog, and dual citizen verification.
    - Exhaustive environment variable table covering all 24 server schema variables and client configurations with keys-later mode fallback explanations.
    - Getting started, migrations, database seeding, and full quality gate instructions.
    - Data sources and OpenStreetMap / Open-Meteo / TomTom / OpenCity attributions.
    - Municipal public record notice.
  - Reframing Audit:
    - Removed `METROPOLITAN SECURITY GRID` badge from `src/app/(auth)/login/page.tsx`, replaced with `MUNICIPAL ROAD TRUTH LEDGER`.
    - Cleaned up `docs/legacy/context.txt`.
    - Verified `git grep -i "security grid"` returns 0 occurrences across all codebase sources.
  - `tests/unit/readme-audit.test.ts`: Acceptance suite verifying:
    - Presence of Mermaid architecture diagram, data sources, and truth ledger framing.
    - Every server schema environment variable is documented in README.md.
    - Zero occurrences of "security grid" in `src/`.
- **Verified Against Docs:** PLAN.md Section 10 T72 card, Section 11 P5 row.
- **Checks Run:**
  ```
  [Vitest: T72 Unit Suite]
  ✓ tests/unit/readme-audit.test.ts (3 tests) 309ms
  3 passed

  [Full Gate: npm run lint && npm run typecheck && npm test && npm run build]
  > eslint
  ✔ 0 errors, 1 warning (img element in report page)
  > tsc --noEmit
  ✔ 0 errors
  > vitest run
  Test Files  35 passed (35)
  Tests  196 passed (196)
  > next build --webpack
  ✓ Compiled successfully in 7.8s
  ✓ Generating static pages (19/19) in 615ms
  ```

### T70 · Installable PWA manifest and service worker · 2026-10-28
- **Goal:** Implement installable Progressive Web App (PWA) with valid web manifest, icons (192x192, 512x512, maskable, apple-touch), service worker (`public/sw.js`) with offline caching and shell fallback (`public/offline.html`), and in-app install prompt banner.
- **Implemented:**
  - `public/manifest.json`: Web app manifest configured with name ("CivicPulse - Municipal Road Truth Ledger"), short_name ("CivicPulse"), theme color `#0D1117`, background color `#020617`, display `standalone`, start URL `/`, and standard icon configurations.
  - `scripts/generate-pwa-icons.ts`: Generated crisp SVG-rendered icons using `sharp`:
    - `public/icons/icon-192x192.png`
    - `public/icons/icon-512x512.png`
    - `public/icons/icon-512x512-maskable.png`
    - `public/icons/apple-touch-icon.png`
  - `public/sw.js`: Service worker implementing precaching of shell assets, cache-first for static assets, network-first for HTML navigations with offline fallback, and bypass for `/api/` mutation requests.
  - `public/offline.html`: Self-contained municipal offline fallback page explaining device key local queueing.
  - `src/components/pwa/PwaManager.tsx`: React client component handling service worker registration, `beforeinstallprompt` handling, and dismissible install prompt banner.
  - `src/components/providers.tsx`: Mounted `PwaManager` into global client providers.
  - `src/app/layout.tsx`: Configured Next.js viewport (`themeColor: #0D1117`) and metadata (`manifest: /manifest.json`, `appleWebApp`, `icons`).
  - `tests/unit/pwa.test.ts`: Vitest suite validating manifest schema, icon files, service worker event listeners, and offline template.
  - `tests/e2e/pwa.spec.ts`: Playwright test verifying HTTP responses for manifest, offline page, icons, and presence of `<link rel="manifest">` in `<head>`.
- **Verified Against Docs:** PLAN.md Section 10 T70 card, Section 11 P6 row.
- **Checks Run:**
  ```
  [Vitest: T70 Unit Suite]
  ✓ tests/unit/pwa.test.ts (4 tests) 13ms
  4 passed

  [Playwright: T70 E2E Acceptance]
  ok 1 [chromium] › tests/e2e/pwa.spec.ts:4:7 › T70: PWA Installability and Static Shell (3.9s)
  1 passed (5.0s)

  [Full Gate: npm run lint && npm run typecheck && npm test && npm run build]
  > eslint
  ✔ 0 errors, 1 warning (img element in report page)
  > tsc --noEmit
  ✔ 0 errors
  > vitest run
  Test Files  34 passed (34)
  Tests  193 passed (193)
  > next build --webpack
  ✓ Compiled successfully in 8.7s
  ✓ Generating static pages (19/19) in 632ms
  ```

### T60(A) · Road timeline and seeded history · 2026-10-28
- **Goal:** Implement public road timeline page (`/road/[segmentId]`) and API endpoint (`/api/segments/[id]/timeline`) displaying chronological municipal road history for pilot Outer Ring Road segment with seed tags, agency labels, and handoffs.
- **Implemented:**
  - `prisma/seed.ts`: Upserted pilot road segment (`seed-seg-orr-kadubeesanahalli`, Outer Ring Road Kadubeesanahalli Section) and 6 chronological historical events:
    - `RESURFACED` (180d ago, GBA, contractor: Sri Lakshmi Infrastructure, WO: WO/GBA/2026/0411)
    - `ROAD_CUT` (120d ago, BWSSB, contractor: Cauvery Water Works, WO: BWSSB/UTILITY/9021)
    - `WATERLOGGED` (90d ago, GBA)
    - `REPORTED` (60d ago, citizen report)
    - `HANDOFF` (50d ago, agency reassign BESCOM → BWSSB)
    - `VERIFIED_FIX` (30d ago, citizen verification)
    - `RECURRENCE` (7d ago, recurrent pothole)
  - `src/lib/roads/timeline.ts`: Core timeline merger combining `SegmentEvent`, `Issue`, and `ActionLog` entries into a unified, chronological list sorted newest first with statistics calculation.
  - `src/app/api/segments/[id]/timeline/route.ts`: Public API endpoint returning segment metadata, stats, and timeline.
  - `src/app/(public)/road/[segmentId]/page.tsx`: Server-rendered municipal truth ledger timeline page with road attributes, stats grid, chronological cards, agency/contractor badges, and visible `data-testid="seed-tag"` on all seeded rows.
  - `tests/contract/road-timeline.test.ts`: Contract & unit tests verifying sorting order, metadata, seed tags, agency attribution, and HTTP status codes.
  - `tests/e2e/road-timeline.spec.ts`: Playwright e2e test verifying rendering, stats, newest-first ordering, and presence of `data-testid="seed-tag"`.
- **Verified Against Docs:** PLAN.md Section 10 T60 card, Section 11 R1 row.
- **Checks Run:**
  ```
  [Vitest: T60 Contract Suite]
  ✓ tests/contract/road-timeline.test.ts (5 tests) 893ms
  5 passed

  [Playwright: T60 E2E Acceptance]
  ok 1 [chromium] › tests/e2e/road-timeline.spec.ts:6:7 › T60: Road timeline public page (4.0s)
  1 passed (5.1s)

  [Full Gate: npm run lint && npm run typecheck && npm test && npm run build]
  > eslint
  ✔ 0 errors, 1 warning (img element in report page)
  > tsc --noEmit
  ✔ 0 errors
  > vitest run
  Test Files  33 passed (33)
  Tests  189 passed (189)
  > next build --webpack
  ✓ Compiled successfully in 9.4s
  ✓ Generating static pages (19/19) in 614ms
  Route (app)
  ├ ƒ /api/segments/[id]/timeline
  └ ƒ /road/[segmentId]
  ```

### T57(A) · G7 explainers and drafts (Track A: PI sentence rephrasing) · 2026-10-28
- **Goal:** Implement Track A scope of G7 explainer: synthesize Priority Index sentence facts into natural, grounded citizen explanations with cited fact IDs, enforce strict guardrails against invented numbers (`numbersGrounded`) and unknown fact IDs, and ensure immediate fallback to deterministic template on any discrepancy.
- **Implemented:**
  - `src/lib/ai/explainer.ts`:
    - `g7ExplainerSchema` & `g7JsonSchema`: Appendix D schema (`text: string`, `fact_ids: string[]`).
    - `explainPrioritySentence(facts, options)`: Formats facts as JSON with IDs, calls LLM provider chain, checks for unknown fact IDs, validates that all numbers in generated text are grounded in cited facts via `numbersGrounded`, and falls back to deterministic template string (`facts.map(f => f.text).join(". ")`) on guardrail rejection or provider error.
  - `src/lib/ai/run.ts`: Added `skipCache?: boolean` support to allow test suites to test adapter edge cases independently of cached runs.
  - `tests/fixtures/llm/synthetic-gemini-g7.json`: Synthetic Gemini response fixture (`_synthetic: true`).
  - `tests/fixtures/llm/synthetic-gemini-g7-hallucinated.json`: Synthetic fixture containing hallucinated number for guardrail testing (`_synthetic: true`).
  - `tests/unit/explainer.test.ts`: Acceptance suite verifying:
    - Normal explainer rephrasing with cited fact IDs.
    - Acceptance check: Invented number ("4 user reports" when fact had "2") triggers `INVENTED_NUMBER_REJECTED` and falls back to exact deterministic template.
    - Rejection of unknown fact IDs with fallback to template.
    - Graceful fallback to template on provider 429 quota exhaustion or missing keys.
  - `docs/agent/ASSUMPTIONS.md`: Logged synthetic fixtures for live verification in T75.
- **Verified Against Docs:** PLAN.md Section 10 T57 card, Appendix D G7 schema, Rule 20.
- **Checks Run:**
  ```
  [Vitest: T57 Acceptance Suite]
  ✓ tests/unit/explainer.test.ts (4 tests) 648ms
  4 passed

  [Full Gate: npm run lint && npm run typecheck && npm test && npm run build]
  > eslint
  ✔ 0 errors, 1 warning (img element in report page)
  > tsc --noEmit
  ✔ 0 errors
  > vitest run
  Test Files  32 passed (32)
  Tests  184 passed (184)
  > next build --webpack
  ✓ Compiled successfully in 6.4s
  ✓ Generating static pages (19/19) in 603ms
  ```

### T52 · G2 fix-check comparator · 2026-10-28
- **Goal:** Implement G2 fix-check comparator on CLAIMED_FIXED reports: compare original filing photo against claim photo with Appendix D JSON schema, flag issues where defect is still visible or location differs (with confidence >= 0.7), add the "Needs citizen check — AI flagged" badge on the public issue UI, write an ActionLog audit row, and strictly ensure AI output never invokes the state machine or mutates status.
- **Implemented:**
  - `src/lib/ai/fixCheck.ts`:
    - `g2FixCheckSchema` & `g2JsonSchema`: Appendix D schema (`same_location`, `defect_still_visible`, `confidence`).
    - `processG2FixCheck(claimReportId, options)`: Compares original report and claim report photos via LLM vision; stores result in `Report.aiTriage`; if flagged, sets `hazardFlag = "AI_FLAGGED_FIX_CHECK"` and writes `AI_FIX_CHECK_FLAGGED` ActionLog row; includes explicit runtime assertion that status is never mutated.
    - `processG2Job(jobId, options)`: Background worker processor for queued `AiJob` rows.
  - `src/app/(public)/issue/[id]/page.tsx`:
    - Rendered amber "Needs citizen check — AI flagged" badge with `AlertTriangle` icon in the Claimed Fixed banner when `hazardFlag` contains `AI_FLAGGED_FIX_CHECK`.
    - Added explanatory copy clarifying that AI vision flagged potential defect visibility or location mismatch, necessitating citizen verification.
  - `tests/fixtures/llm/synthetic-groq-g2-flagged.json`: Synthetic fixture returning `defect_still_visible = "yes"` (`_synthetic: true`).
  - `tests/unit/fix-check.test.ts`: Acceptance suite verifying:
    - Normal fix-check stores `aiTriage` and preserves `CLAIMED_FIXED` status.
    - Flagged fix-check adds "Needs citizen check — AI flagged" badge without altering status.
    - CRITICAL RULE test: Verifies that even with `same_location = "no"` and `defect_still_visible = "yes"` at 0.99 confidence, `Issue.status` remains strictly `CLAIMED_FIXED` and never transitions to `DISPUTED` or `REJECTED`.
  - `docs/plan/PLAN.md`: Ticked Section 11 row `G2`.
  - `docs/agent/ASSUMPTIONS.md`: Logged `synthetic-groq-g2-flagged.json` for live verification in T75.
- **Verified Against Docs:** PLAN.md Appendix D G2 schema, Rule 17 & 20.
- **Checks Run:**
  ```
  [Vitest: T52 Acceptance Suite]
  ✓ tests/unit/fix-check.test.ts (3 tests) 2.77s
  3 passed

  [Full Gate: npm run lint && npm run typecheck && npm test && npm run build]
  > eslint
  ✔ 0 errors, 1 warning (img element in report page)
  > tsc --noEmit
  ✔ 0 errors
  > vitest run
  Test Files  31 passed (31)
  Tests  180 passed (180)
  > next build --webpack
  ✓ Compiled successfully in 6.1s
  ✓ Generating static pages (19/19) in 609ms
  ```

### T51 · G1 photo triage · 2026-10-28
- **Goal:** Implement G1 photo triage job on newly submitted REPORT evidence: parse photo with Appendix D JSON schema, populate `Report.aiTriage`, flag category disagreement for desk review without ever auto-changing category, flag suspected recaptures as "needs one extra verifier", feed empty `Issue.sizeClass` and trigger priority recomputation, and render the "AI-assisted" badge on the evidence gallery UI.
- **Implemented:**
  - `src/lib/ai/triage.ts`:
    - `g1TriageSchema` & `g1JsonSchema`: Appendix D schema (`category`, `size_class`, `lane_position`, `water_present`, `recapture_suspected`, `faces_or_plates`, `confidence`).
    - `processG1Triage(reportId, options)`: Analyzes report photo, persists result to `Report.aiTriage`, checks category mismatch (flags `Issue.needsDuplicateReview = true` and writes `AI_FLAGGED_CATEGORY_MISMATCH` ActionLog row; strictly never mutates reported category), flags `recapture_suspected` as `NEEDS_EXTRA_VERIFIER` on `hazardFlag`, feeds `sizeClass` / `lanePosition` only when empty, and triggers `recomputeIssuePriority`.
    - `processG1Job(jobId, options)`: Background worker processor for queued `AiJob` rows.
  - `src/app/(public)/issue/[id]/page.tsx`:
    - Added floating "AI-assisted" cyan chip on photo evidence card.
    - Added detailed AI Triage Assessment breakdown (confidence percentage, suggested category, size class, lane position).
  - `tests/fixtures/llm/synthetic-gemini-g1-disagree.json`: Synthetic fixture for category disagreement and recapture suspected (`_synthetic: true`).
  - `tests/unit/photo-triage.test.ts`: Acceptance suite verifying:
    - Normal triage updates `aiTriage` and feeds empty `sizeClass` ("large") and `lanePosition` ("wheel_path").
    - Category disagreement sets `needsDuplicateReview = true`, leaves `Issue.category` intact as `POTHOLES`, and sets `NEEDS_EXTRA_VERIFIER`.
    - Pre-existing reporter `sizeClass` ("small") is strictly preserved against AI overwrite.
  - `docs/plan/PLAN.md`: Ticked Section 11 row `G1`.
  - `docs/agent/ASSUMPTIONS.md`: Logged `synthetic-gemini-g1-disagree.json` for live verification in T75.
- **Verified Against Docs:** PLAN.md Appendix D G1 schema, Rule 17 & 20.
- **Checks Run:**
  ```
  [Vitest: T51 Acceptance Suite]
  ✓ tests/unit/photo-triage.test.ts (3 tests) 2.68s
  3 passed

  [Full Gate: npm run lint && npm run typecheck && npm test && npm run build]
  > eslint
  ✔ 0 errors, 1 warning (img element in report page)
  > tsc --noEmit
  ✔ 0 errors
  > vitest run
  Test Files  30 passed (30)
  Tests  177 passed (177)
  > next build --webpack
  ✓ Compiled successfully in 6.2s
  ✓ Generating static pages (19/19) in 591ms
  ```

### T50 · LLM provider chain, validators, audit and quotas · 2026-10-28
- **Goal:** Implement Phase 5 LLM provider chain infrastructure (`gemini -> groq -> (ollama) -> rules`), output validators (`verbatimCheck`, `numbersGrounded`, `confidenceAtLeast`), quota governor tracking `AI_DAILY_CALL_CAP` with priority buffering for G1 & G2, deterministic input hashing (`computeInputHash`), response caching, and audit logging into `AiRun`.
- **Implemented:**
  - `src/lib/external/llm/types.ts`: Provider interfaces and types (`LlmProviderName`, `LlmImageInput`, `LlmGenerateOptions`, `LlmGenerateResult`, `LlmAdapter`).
  - `src/lib/external/llm/gemini.ts`: Google Gemini REST adapter supporting system instructions, image parts, `generationConfig`, JSON schema enforcement, timeout, and 429 quota handling without external SDK dependencies.
  - `src/lib/external/llm/groq.ts`: Groq OpenAI-compatible Chat Completions adapter with automatic vision model routing (`GROQ_MODEL_VISION`), JSON mode, and 429 quota handling.
  - `src/lib/external/llm/ollama.ts`: Local Ollama adapter for nightly batch jobs on developer laptop.
  - `src/lib/ai/providers/rules.ts`: Safe deterministic rules fallbacks for features G1 through G8.
  - `src/lib/ai/validators.ts`: `verbatimCheck` (case-insensitive, whitespace normalized), `numbersGrounded` (checks every number in generated text against source facts), and `confidenceAtLeast`.
  - `src/lib/ai/quota.ts`: Quota governor capping daily calls at `AI_DAILY_CALL_CAP` (400), reserving buffer slots strictly for high-priority citizen triage (G1 & G2).
  - `src/lib/ai/run.ts`: AI orchestrator enforcing temperature 0, Zod schema validation, SHA-256 input hashing, `AiRun` DB caching and auditing (costUsd: 0), provider chain iteration with graceful fallback, and grounding checks.
  - `tests/fixtures/llm/synthetic-gemini-g1.json`: Synthetic Gemini response fixture (`_synthetic: true`).
  - `tests/fixtures/llm/synthetic-groq-g2.json`: Synthetic Groq response fixture (`_synthetic: true`).
  - Updated `docs/agent/ASSUMPTIONS.md` with new synthetic fixtures for verification in T75.
- **Verified Against Docs:** Google Gemini `generateContent` v1beta REST specification, Groq OpenAI-compatible Chat Completions API, Prisma `AiRun` schema.
- **Checks Run:**
  ```
  [Vitest: T50 Unit & Contract Tests]
  ✓ tests/unit/ai-validators.test.ts (12 tests)
  ✓ tests/unit/ai-quota.test.ts (3 tests)
  ✓ tests/contract/ai-provider-chain.test.ts (6 tests)
  21 passed in 1.83s

  [Full Gate: npm run lint && npm run typecheck && npm test && npm run build]
  > eslint
  ✔ 0 errors, 1 warning (img element in report page)
  > tsc --noEmit
  ✔ 0 errors
  > vitest run
  Test Files  29 passed (29)
  Tests  174 passed (174)
  > next build --webpack
  ✓ Compiled successfully in 5.9s
  ✓ Generating static pages (19/19) in 643ms
  ```

### T46(A) · Map layers (clustered issues by band + live traffic) · 2026-10-28
- **Goal:** Implement Track A scope of map overlays in `src/components/map/layers/`: zoom-adaptive issue clustering colored by priority band (CRITICAL: rose, HIGH: amber, MEDIUM: sky, LOW: zinc), live TomTom traffic flow tiles with keys-later notice when unconfigured, and an overlay toggle control; verify via Playwright e2e layer toggling without console errors.
- **Implemented:**
  - `src/components/map/layers/IssueClustersLayer.tsx`: Reactive issue clustering layer using `useMapEvents`:
    - Groups reports into grid cells at zoom levels < 15, computing centroid and highest priority band in each cluster.
    - Cluster circle markers show count, band badge, and zoom in on click (`map.setView(center, zoom + 2)`).
    - At zoom >= 15, renders individual circle markers with priority band color, pulsing for new reports, and rich popup with category, priority score, and link to issue detail.
  - `src/components/map/layers/TrafficTilesLayer.tsx`: Live TomTom traffic flow tile layer (`relative0`), displaying friendly non-intrusive badge when key is not set to prevent console 403 errors in keys-later mode.
  - `src/components/map/layers/LayerControl.tsx`: Floating top-right overlay switcher dropdown with independent z-index (`z-[1010]`) and pointer event isolation, allowing independent toggling of "Issues (Bands)" and "Live Traffic".
  - `src/components/map/layers/index.ts`: Clean export barrel for map layer components.
  - `src/components/map/BaseMap.tsx`: Integrated `LayerControl`, `IssueClustersLayer`, and `TrafficTilesLayer`.
  - `src/components/map/RoutePanel.tsx`: Added pointer event transparency to container bar so top-right controls do not intercept click events.
  - `tests/e2e/map-layers.spec.ts`: Playwright e2e test logging in as citizen, loading `/citizen/map`, opening the LayerControl dropdown, toggling Live Traffic ON, toggling Issues OFF and ON, and asserting zero console errors.
- **Verified Against Docs:** Leaflet layer events, TomTom Traffic Flow Tile API v4 format (`/traffic/map/4/tile/flow/relative0/{z}/{x}/{y}.png`).
- **Checks Run:**
  ```
  [Playwright E2E: tests/e2e/map-layers.spec.ts]
  Running 1 test using 1 worker
  ok 1 [chromium] › tests/e2e/map-layers.spec.ts:6:7 › T46: Map Layers Acceptance E2E › toggles issues and live traffic layers without console errors (7.3s)
  1 passed (8.2s)

  [Full Gate: npm run lint && npm run typecheck && npm test && npm run build]
  > eslint
  ✖ 1 problem (0 errors, 1 warning)
  > tsc --noEmit
  > vitest run
  Test Files  26 passed (26)
  Tests  153 passed (153)
  > next build --webpack
  ✓ Compiled successfully in 6.6s
  ✓ Generating static pages using 15 workers (19/19) in 803ms
  ```
- **Feature Rows Ticked:** N6 (Track A scope complete; full row will be ticked upon completing T46(rest) in Track B).
- **Notes for the Next Task:** Sequence up to T46(A) is complete! Stop and report as mandated.

### T43 · Cost-based route choice and vehicle profiles · 2026-10-28
- **Goal:** Cost-based safe routing engine `src/lib/routing/cost.ts` implementing hazard cost and route scoring from Appendix A.3; vehicle profiles (motorcycle, car, pedestrian, wheelchair) with specific category sensitivity weights; safety slider ($\beta \in [0.0, 0.5]$); explanation generator ("avoids 2 hazards, +3 min"); critical blocking hazards become hard `avoidAreas`.
- **Implemented:**
  - `src/lib/routing/cost.ts`:
    - Full vehicle sensitivity matrix: motorcycle (potholes 1.0, waterlogging 1.0), car (potholes 0.5, sidewalks 0.0), pedestrian (sidewalks 1.0, potholes 0.1), wheelchair (sidewalks 1.5, road cuts 1.0).
    - Streetlights IST time window check (`isStreetlightsActiveIST`): sensitivity only applies during dark hours 19:00–06:00 IST.
    - Hazard cost formula: `hazardCost(route) = Σ over open issues of (PI / 100) * sensitivity[vehicle][category]`.
    - Route scoring formula: `score(route) = travelTimeSeconds * (1 + beta * hazardCost)`.
    - Avoid areas builder: `buildAvoidAreasForCriticalHazards` with 30m padding for CRITICAL issues with `blockedShare === "full"`.
    - Route choice adjudicator `chooseBestRoute` and explanation generator `generateRouteExplanation`.
  - `src/app/api/routes/safe/route.ts`:
    - Accepts `vehicle` and `beta` parameters.
    - Auto-injects hard avoidAreas for critical blocking hazards.
    - Matches segments along each TomTom/synthetic alternative route and evaluates open segment issues from Prisma.
    - Returns scored route alternatives with `hazardCost`, `routeScore`, `hazardsCount`, `selectedRouteIndex`, and `explanation`.
  - `src/components/map/RoutePanel.tsx`:
    - Added Vehicle selector buttons (🏍️ Moto, 🚗 Car, 🚶 Walk, ♿ Wheel).
    - Added Safety bias slider (⚡ Fast 0.0 to 🛡️ Safe 0.5) with real-time value display.
    - Added Choice Explanation banner ("Choice: avoids 1 hazard, +2 min").
    - Added keys-later status badge when TomTom live key is not set.
  - `src/components/map/BaseMap.tsx`: Wired vehicle, beta, and explanation state to route optimization.
  - `tests/fixtures/routing/vehicle-route-choice.json`: Synthetic fixture with pothole-heavy direct route and sidewalk-damaged bypass route.
  - `tests/unit/route-choice.test.ts`: 4 unit tests verifying vehicle profiles, time of day gates, avoidAreas, and the acceptance test: same alternatives, different vehicles pick different routes (Motorcycle picks bypass Route B to avoid potholes; Car, Pedestrian, and Wheelchair pick Route A).
  - `docs/plan/PLAN.md`: Ticked N3.
- **Verified Against Docs:** PLAN.md Appendix A.3 formula and vehicle sensitivity table.
- **Checks Run:**
  ```
  [vitest tests/unit/route-choice.test.ts]
  ✓ tests/unit/route-choice.test.ts (4 tests) 8ms
  Test Files  1 passed (1)
  Tests  4 passed (4)

  [Full Gate: npm run lint && npm run typecheck && npm test && npm run build]
  > eslint
  ✖ 1 problem (0 errors, 1 warning)
  > tsc --noEmit
  > vitest run
  Test Files  26 passed (26)
  Tests  153 passed (153)
  > next build --webpack
  ✓ Compiled successfully in 6.6s
  ✓ Generating static pages using 15 workers (19/19) in 802ms
  ```
- **Feature Rows Ticked:** N3.
- **Notes for the Next Task:** Proceed to T46(A) (Map layers Track A scope: clustered issues colored by band + live traffic tiles / synthetic notice).

### T42 · Segment matching (PostGIS ST_DWithin + Azimuth) · 2026-10-28
- **Goal:** Robust segment matching module `src/lib/routing/matchSegments.ts` selecting road segments along a route LineString within 10 m whose bearing differs by < 30° from the route's local bearing; return ordered segment IDs; verify with fixtures for parallel service road and flyovers.
- **Implemented:**
  - `src/lib/routing/matchSegments.ts`:
    - Spherical forward azimuth calculation `calculateBearing(lat1, lon1, lat2, lon2)`.
    - Circular bearing difference `bearingDifference(b1, b2)` with 0°/360° wrap-around.
    - Point-to-polyline geodesic distance computation `pointToPolylineDistanceM`.
    - Local step-by-step route traversal comparing local direction against segment bearing.
    - Integrated with PostGIS `ST_DWithin` spatial query on `RoadSegment` table for production routing.
    - Supports in-memory candidate segments for high-speed fixture evaluations.
  - `tests/fixtures/routing/orr-and-service-road.json`: Outer Ring Road main carriageway vs parallel service road fixture with `_synthetic: true`.
  - `tests/fixtures/routing/flyover-and-underpass.json`: Elevated flyover straight vs surface turning road underpass fixture with `_synthetic: true`.
  - `tests/unit/segment-matching.test.ts`: 5 unit tests verifying cardinal azimuths, bearing differences, point-to-line distances, and the two acceptance criteria:
    - A route on ORR matches main carriageway segments and does NOT match the parallel service road (> 10 m away or divergent bearing).
    - A route under a flyover matches the surface turn and does NOT match the overhead flyover (bearing difference > 30°).
  - `tests/contract/match-segments.test.ts`: Contract test confirming spatial matching against real OSM `RoadSegment` rows in the database along the ORR corridor.
  - `docs/plan/PLAN.md`: Ticked N2.
- **Verified Against Docs:** PostGIS `ST_DWithin` and `ST_Azimuth` specification.
- **Checks Run:**
  ```
  [vitest tests/unit/segment-matching.test.ts]
  ✓ tests/unit/segment-matching.test.ts (5 tests) 6ms
  Test Files  1 passed (1)
  Tests  5 passed (5)

  [vitest tests/contract/match-segments.test.ts]
  ✓ tests/contract/match-segments.test.ts (1 test) 694ms
  Test Files  1 passed (1)
  Tests  1 passed (1)

  [Full Gate: npm run lint && npm run typecheck && npm test && npm run build]
  > eslint
  ✖ 1 problem (0 errors, 1 warning)
  > tsc --noEmit
  > vitest run
  Test Files  25 passed (25)
  Tests  149 passed (149)
  > next build --webpack
  ✓ Compiled successfully in 6.2s
  ✓ Generating static pages using 15 workers (19/19) in 790ms
  ```
- **Feature Rows Ticked:** N2.
- **Notes for the Next Task:** Proceed to T43 (Cost-based route choice and vehicle profiles: hazard cost, route score, vehicle sensitivity matrix, "fastest ↔ safest" slider, explanation string, avoidAreas).

### T41 · Routing proxy (TomTom synthetic) · 2026-10-28
- **Goal:** Server-side routing proxy using TomTom Calculate Route API (or synthetic fixture in keys-later mode), supporting alternative routes, travel modes (car, motorcycle, pedestrian, bicycle, wheelchair), traffic delays, and avoidAreas; replace every `project-osrm` call in the application.
- **Implemented:**
  - `src/lib/external/tomtom.ts`: Server-only TomTom routing adapter enforcing:
    - India geographic bounding box validation (`APP_REGION=IN`, Lat 6.0°–38.0° N, Lon 68.0°–98.0° E).
    - 5-minute request caching via in-memory TTL map.
    - Monthly request quota tracking against the 20,000 requests/month cap.
    - POST body with `avoidAreas.rectangles` when critical road hazards need avoidance.
    - Keys-later synthetic fallback using `tests/fixtures/routing/synthetic-tomtom-route.json` with `_synthetic: true`.
    - Region travel mode fallback (falls back from motorcycle to car if unsupported in region).
  - `src/app/api/routes/safe/route.ts`: Secure server-side endpoint accepting POST or GET requests, validating coordinates via Zod, and returning normalized route alternatives with geometry, distance, duration, and traffic delay.
  - `src/components/map/utils.ts`: Switched `fetchAllRoutes` to call `/api/routes/safe` instead of calling `router.project-osrm.org`.
  - `src/components/map/RoutePanel.tsx` & `src/components/map/BaseMap.tsx`: Cleaned UI strings and comments of legacy OSRM references.
  - `tests/fixtures/routing/synthetic-tomtom-route.json`: TomTom Calculate Route v1 format fixture along Bengaluru ORR corridor with `_synthetic: true`.
  - `tests/contract/tomtom-routing.test.ts`: 8 contract tests verifying fixture parsing, India coordinate bounding box gates, 5-minute caching, keys-later mode, POST/GET API endpoints, and zero occurrences of `project-osrm` in the source code.
  - `docs/agent/ASSUMPTIONS.md`: Logged synthetic TomTom routing fixture assumption for live verification in T75.
  - `docs/plan/PLAN.md`: Ticked N1.
- **Verified Against Docs:** TomTom Routing API v1 documentation (`https://api.tomtom.com/routing/1/calculateRoute/{locations}/json`, `maxAlternatives`, `travelMode`, `avoidAreas`, `departAt`, `traffic`).
- **Checks Run:**
  ```
  [git grep project-osrm]
  docs/plan/PLAN.md: (spec only)
  (0 occurrences in all source files)

  [vitest tests/contract/tomtom-routing.test.ts]
  ✓ tests/contract/tomtom-routing.test.ts (8 tests) 99ms
  Test Files  1 passed (1)
  Tests  8 passed (8)

  [Full Gate: npm run lint && npm run typecheck && npm test && npm run build]
  > eslint
  ✖ 1 problem (0 errors, 1 warning)
  > tsc --noEmit
  > vitest run
  Test Files  23 passed (23)
  Tests  143 passed (143)
  > next build --webpack
  ✓ Compiled successfully in 8.3s
  ✓ Generating static pages using 15 workers (19/19) in 778ms
  ```
- **Feature Rows Ticked:** N1.
- **Notes for the Next Task:** Proceed to T42 (Segment matching: matching route LineString to OSM road segments using PostGIS ST_DWithin and bearing).

### T40 · Shared map module & component refactor · 2026-10-28
- **Goal:** Extract duplicated map and routing code between `AuthorityMap.tsx` and `IssuesNearMeMap.tsx` into a single shared `src/components/map/` module with zero behavior change; reduce line counts of both legacy components below 150 lines; verify visually and via Playwright screenshot comparisons before and after.
- **Implemented:**
  - `src/components/map/types.ts`: Shared types (`ReportPoint`, `RouteOption`, `PlacementMode`).
  - `src/components/map/utils.ts`: Shared utilities (`sourceIcon`, `destIcon`, `haversineMeters`, `pointToPolyDist`, `fetchAllRoutes`, `buildDetourWaypoints`).
  - `src/components/map/MapControls.tsx`: `MapSync`, `MapClickHandler`, `CustomZoomControls`.
  - `src/components/map/IssueMarkersLayer.tsx`: CircleMarker with priority color, pulse animation, and rich popup.
  - `src/components/map/RouteLayer.tsx`: Route polylines, hazard buffers, and source/dest pins.
  - `src/components/map/RoutePanel.tsx`: Route search controls, hazard warnings, and alternative selection.
  - `src/components/map/BaseMap.tsx`: Clean unified MapContainer coordinating layers, leaflet styles, and interactions.
  - `src/components/authority/AuthorityMap.tsx`: Thin wrapper around `BaseMap` (595 lines → 11 lines).
  - `src/components/citizen/IssuesNearMeMap.tsx`: Thin wrapper around `BaseMap` (617 lines → 38 lines).
  - `tests/screenshots/`: Captured before and after screenshots of citizen and desk map pages (`citizen-map-before.png`, `citizen-map-after.png`, `desk-map-before.png`, `desk-map-after.png`).
  - `tests/e2e/map-refactor.spec.ts`: Playwright e2e test confirming both map pages mount without console errors and both legacy files are < 150 lines.
- **Checks Run:**
  ```
  [Line Counts]
  AuthorityMap.tsx: 11 lines (< 150)
  IssuesNearMeMap.tsx: 38 lines (< 150)

  [Playwright E2E: tests/e2e/map-refactor.spec.ts]
  Running 3 tests using 1 worker
  ✓ tests/e2e/map-refactor.spec.ts:3:7 › T40: Map refactor acceptance › legacy map files have dropped below 150 lines (3ms)
  ✓ tests/e2e/map-refactor.spec.ts:13:7 › T40: Map refactor acceptance › citizen map renders correctly with BaseMap without console errors (1.2s)
  ✓ tests/e2e/map-refactor.spec.ts:30:7 › T40: Map refactor acceptance › desk map renders correctly with BaseMap without console errors (1.4s)
  3 passed (3.5s)

  [Full Gate: npm run lint && npm run typecheck && npm test && npm run build]
  > eslint
  ✖ 1 problem (0 errors, 1 warning)
  > tsc --noEmit
  > vitest run
  Test Files  22 passed (22)
  Tests  135 passed (135)
  > next build --webpack
  ✓ Compiled successfully in 5.2s
  ✓ Generating static pages using 15 workers (18/18) in 695ms
  ```
- **Feature Rows Ticked:** N6 prerequisite (T40 completed; T46 finishes N6).
- **Notes for the Next Task:** Proceed to T41 (Routing proxy - TomTom synthetic).

### T35 · Priority Index breakdown UI & audit log · 2026-10-28
- **Goal:** Priority explanation UI component `src/components/priority/PriorityBreakdown.tsx` featuring stacked bar of weighted factors, band chip, sentence built from `sentenceFacts`, "estimated" pill tags next to E (Exposure) and U (Usability), and SLA floor notice when applied; embedded in `/issue/[id]` public issue detail page.
- **Implemented:**
  - `src/components/priority/PriorityBreakdown.tsx`: Clean, accessible component rendering:
    - Stacked bar proportioned to weighted contributions `w_i × factor_i`.
    - Band badge chip with semantic colors (CRITICAL: rose, HIGH: amber, MEDIUM: sky, LOW: zinc).
    - Factor tags with `estimated` labels explicitly marked on E and U.
    - Multiplier summary for Confidence C and Season/Rain Σ.
    - SLA breach notice: `SLA breached (> 2x SLA): minimum priority floor of 60 enforced.`
    - Template sentence built only from `sentenceFacts.summary` or `piText`.
  - `src/app/(public)/issue/[id]/page.tsx`: Embedded `PriorityBreakdown` replacing raw placeholder.
  - `vitest.config.ts`: Added `.test.tsx` to test pattern match.
  - `tests/unit/priority-breakdown.test.tsx`: Component tests verifying Worked Examples 1, 2, and 3 with stacked bar, band chip, estimated pills, and floor notice.
- **Full Gate Output:**
  ```
  $ npm run lint
  ✔ 0 errors, 1 warning (img element in report page)

  $ npm run typecheck
  ✔ tsc --noEmit (0 errors)

  $ npm test
  ✓ tests/contract/geom-trigger.test.ts (1 test)
  ✓ tests/contract/health-aiqueue.test.ts (3 tests)
  ✓ tests/unit/device-key.test.ts (6 tests)
  ✓ tests/contract/weather.test.ts (4 tests)
  ✓ tests/contract/seed-auth.test.ts (6 tests)
  ✓ tests/unit/nonce.test.ts (7 tests)
  ✓ tests/unit/priority.test.ts (5 tests)
  ✓ tests/unit/priority-breakdown.test.tsx (3 tests)
  ✓ tests/unit/state-machine.test.ts (29 tests)
  ✓ tests/contract/storage.test.ts (6 tests)
  ✓ tests/unit/api-validation.test.ts (7 tests)
  ✓ tests/unit/signing-verification.test.ts (8 tests)
  ✓ tests/unit/config.test.ts (3 tests)
  ✓ tests/unit/points.test.ts (8 tests)
  ✓ tests/unit/claim-gap.test.ts (4 tests)
  ✓ tests/contract/osm-snap.test.ts (6 tests)
  ✓ tests/unit/public-issue.test.ts (4 tests)
  ✓ tests/unit/desk-queue.test.ts (5 tests)
  ✓ tests/unit/desk-actions.test.ts (7 tests)
  ✓ tests/unit/report-flow.test.ts (4 tests)
  ✓ tests/contract/merge.test.ts (5 tests)
  ✓ tests/unit/verification.test.ts (4 tests)
  Test Files  22 passed (22)
  Tests  135 passed (135)

  $ npm run build
  ✔ Compiled successfully in 15.2s
  ✔ Finished TypeScript in 10.1s
  ✔ Generating static pages (18/18) in 745ms
  ```

### T34 · Priority Index calculation and formula · 2026-10-28
- **Goal:** Implement the full CivicPulse Priority Index (PI) engine in pure TypeScript based strictly on PLAN.md Appendix A specifications (factors S, E, V, U, P, C, and Σ season/rain multiplier), age floor rule (> 2x SLA enforces min PI of 60), sentence facts generator, and background recomputation on evidence/action changes.
- **Implemented:**
  - `config/priority.ts`: Factor weights (severity 0.30, exposure 0.20, vulnerability 0.15, usability 0.20, persistence 0.15), bands (CRITICAL >= 70, HIGH >= 50, MEDIUM >= 30, LOW < 30), baseline lookups, and seasonal matrices.
  - `src/lib/priority/season.ts`: IST date-aware climatic season evaluator (Summer Mar–May, SW monsoon Jun–Sep, NE monsoon Oct–Dec, Winter Jan–Feb) with water-sensitive category rainfall multipliers (> 20mm forecast).
  - `src/lib/priority/factors/`: Isolated pure factor modules:
    - `severity.ts`: Category base (with domain overrides for open drain, signal down, lane blocked) × sizeClass × lanePosition.
    - `exposure.ts`: Logarithmic volume curve `log10(1 + Q) / log10(1 + 12000)` combining lane volumes, lanes, congestion factor r, bus weight, and POI pedestrian traffic.
    - `vulnerability.ts`: `min(1, max(roadClass, poi) + 0.2 * dark)`.
    - `usability.ts`: `blocked[share] * (0.5 + 0.5 * access)`.
    - `persistence.ts`: `min(1, 0.6 * ageHours / slaHours + 0.2 * recurrences)`.
    - `confidence.ts`: `0.5 + 0.5 * min(1, n / 3)` discounting offline/recaptured evidence to 0.5.
  - `src/lib/priority/index.ts`: Pure `computePriority(inputs, config, now)` returning `pi`, `band`, `breakdown`, and `sentenceFacts`. Never throws on missing inputs, logging to `breakdown.missing`.
  - `src/lib/jobs/priorityRecompute.ts`: Database integration recomputing PI, Band, Breakdown, and Sentence Facts on report ingestion and desk status actions.
  - `tests/unit/priority.test.ts`: Unit tests validating all three worked examples from Appendix A.4 within ±0.5, defensive missing input handling, and runtime configuration alteration.
- **Full Gate Output:**
  ```
  $ npm run lint
  ✔ 0 errors, 1 warning (img element in report page)

  $ npm run typecheck
  ✔ tsc --noEmit (0 errors)

  $ npm test
  ✓ tests/contract/geom-trigger.test.ts (1 test)
  ✓ tests/contract/weather.test.ts (4 tests)
  ✓ tests/contract/health-aiqueue.test.ts (3 tests)
  ✓ tests/unit/device-key.test.ts (6 tests)
  ✓ tests/contract/seed-auth.test.ts (6 tests)
  ✓ tests/unit/nonce.test.ts (7 tests)
  ✓ tests/unit/state-machine.test.ts (29 tests)
  ✓ tests/unit/priority.test.ts (5 tests)
  ✓ tests/unit/points.test.ts (8 tests)
  ✓ tests/contract/storage.test.ts (6 tests)
  ✓ tests/unit/signing-verification.test.ts (8 tests)
  ✓ tests/unit/api-validation.test.ts (7 tests)
  ✓ tests/unit/config.test.ts (3 tests)
  ✓ tests/unit/claim-gap.test.ts (4 tests)
  ✓ tests/contract/osm-snap.test.ts (6 tests)
  ✓ tests/unit/public-issue.test.ts (4 tests)
  ✓ tests/unit/desk-queue.test.ts (5 tests)
  ✓ tests/unit/desk-actions.test.ts (7 tests)
  ✓ tests/unit/report-flow.test.ts (4 tests)
  ✓ tests/contract/merge.test.ts (5 tests)
  ✓ tests/unit/verification.test.ts (4 tests)
  Test Files  21 passed (21)
  Tests  132 passed (132)

  $ npm run build
  ✔ Compiled successfully in 7.0s
  ✔ Finished TypeScript in 10.0s
  ✔ Generating static pages (18/18) in 705ms
  ```

### T33 · Open-Meteo weather adapter · 2026-10-28
- **Goal:** Hourly precipitation, precipitation probability, and temperature for next 72 h via Open-Meteo API (`timezone=Asia/Kolkata`); cache in `WeatherForecast` table, support high-speed bulk upsert, calculate rain risk summary for next 24h, verify CC-BY attribution string "Weather data by Open-Meteo.com", and store real live Bengaluru fixture.
- **Implemented:**
  - `tests/fixtures/weather/real-bangalore.json`: Live real Open-Meteo query output for Bengaluru pilot area (`12.9450, 77.7000`) containing 72 hourly rows.
  - `src/lib/external/openmeteo.ts`: Open-Meteo API client with `fetchOpenMeteoForecast`, payload parser `parseOpenMeteoPayload`, and `WEATHER_ATTRIBUTION = "Weather data by Open-Meteo.com"`.
  - `src/lib/jobs/weather.ts`: Forecast sync job `syncWeatherForecast` (using high performance parameterized SQL bulk upsert ON CONFLICT ("pointKey", "hour") DO UPDATE) and 24h rain aggregator `getRainForecast`.
  - `tests/contract/weather.test.ts`: Contract tests verifying real Bengaluru fixture parsing (72 records), attribution string, idempotent DB sync, and 24h summary evaluation.
- **Full Gate Output:**
  ```
  $ npm run lint
  ✔ 0 errors, 1 warning (img element in report page)

  $ npm run typecheck
  ✔ tsc --noEmit (0 errors)

  $ npm test
  ✓ tests/contract/geom-trigger.test.ts (1 test)
  ✓ tests/unit/device-key.test.ts (6 tests)
  ✓ tests/contract/health-aiqueue.test.ts (3 tests)
  ✓ tests/contract/seed-auth.test.ts (6 tests)
  ✓ tests/contract/weather.test.ts (4 tests)
  ✓ tests/unit/nonce.test.ts (7 tests)
  ✓ tests/unit/state-machine.test.ts (29 tests)
  ✓ tests/unit/points.test.ts (8 tests)
  ✓ tests/contract/storage.test.ts (6 tests)
  ✓ tests/unit/config.test.ts (3 tests)
  ✓ tests/unit/api-validation.test.ts (7 tests)
  ✓ tests/unit/signing-verification.test.ts (8 tests)
  ✓ tests/contract/osm-snap.test.ts (6 tests)
  ✓ tests/unit/claim-gap.test.ts (4 tests)
  ✓ tests/unit/public-issue.test.ts (4 tests)
  ✓ tests/unit/desk-queue.test.ts (5 tests)
  ✓ tests/unit/desk-actions.test.ts (7 tests)
  ✓ tests/unit/report-flow.test.ts (4 tests)
  ✓ tests/contract/merge.test.ts (5 tests)
  ✓ tests/unit/verification.test.ts (4 tests)
  Test Files  20 passed (20)
  Tests  127 passed (127)

  $ npm run build
  ✔ Compiled successfully in 6.9s
  ✔ Finished TypeScript in 11.2s
  ✔ Generating static pages (18/18) in 728ms
  ```

### T30 · OSM road segments & snapping · 2026-10-28
- **Goal:** Download real Overpass OSM road segments for pilot corridor (ORR Marathahalli to Kadubeesanahalli + 1 km), store in `RoadSegment` with PostGIS LineString geometry, lanes, corridor tracking, and POI proximity; provide `snapPointToSegment` PostGIS query with category suitability and integrate with report ingestion pipeline.
- **Implemented:**
  - `data/osm/pilot.json`: Live Overpass query output (3,528 elements: 3,466 highway ways, 62 school/hospital POIs, 3.08 MB).
  - `scripts/import-osm-segments.ts`: Imports ways into `RoadSegment`, derives lanes (defaults by highway class), evaluates `nearSchoolOrHospital <= 200m`, marks arterial corridors as `tracked`, and sets `wardId` via PostGIS `ST_Covers`.
  - `src/lib/db/segments.ts`: PostGIS `snapPointToSegment(lat, lng, category, maxDistanceM)` with category suitability filter `suitsCategory(roadClass, category)` ensuring vehicle incidents snap to road corridors.
  - `src/lib/issues/merge.ts`: Integrated snapping into `ingestReportWithSpatialMerge` so created issues automatically link to the snapped `RoadSegment`.
  - `tests/contract/osm-snap.test.ts`: Contract tests verifying snapping to Outer Ring Road, far point returns null, category suitability rules, and issue creation linking `segmentId`.
- **Full Gate Output:**
  ```
  $ npm run lint
  ✔ 0 errors, 1 warning (img element in report page)

  $ npm run typecheck
  ✔ tsc --noEmit (0 errors)

  $ npm test
  ✓ tests/contract/geom-trigger.test.ts (1 test)
  ✓ tests/unit/api-validation.test.ts (7 tests)
  ✓ tests/contract/seed-auth.test.ts (6 tests)
  ✓ tests/unit/state-machine.test.ts (29 tests)
  ✓ tests/contract/health-aiqueue.test.ts (3 tests)
  ✓ tests/unit/points.test.ts (8 tests)
  ✓ tests/unit/device-key.test.ts (6 tests)
  ✓ tests/contract/osm-snap.test.ts (6 tests)
  ✓ tests/unit/config.test.ts (3 tests)
  ✓ tests/contract/storage.test.ts (6 tests)
  ✓ tests/unit/signing-verification.test.ts (8 tests)
  ✓ tests/unit/nonce.test.ts (7 tests)
  ✓ tests/unit/claim-gap.test.ts (4 tests)
  ✓ tests/contract/merge.test.ts (5 tests)
  ✓ tests/unit/public-issue.test.ts (4 tests)
  ✓ tests/unit/desk-queue.test.ts (5 tests)
  ✓ tests/unit/desk-actions.test.ts (7 tests)
  ✓ tests/unit/report-flow.test.ts (4 tests)
  ✓ tests/unit/verification.test.ts (4 tests)
  Test Files  19 passed (19)
  Tests  123 passed (123)

  $ npm run build
  ✔ Compiled successfully in 9.2s
  ✔ Finished TypeScript in 10.0s
  ✔ Generating static pages (18/18) in 795ms
  ```

### Audit after Phase 2 · 2026-10-28
- **Goal:** Audit Phase 2 (T20–T29) acceptance checks specified as `e2e`, create and verify missing Playwright e2e tests against `npm run build && npm start` with cleanup, and confirm the 7 seeded U7 agencies.
- **a) Phase 2 E2E Acceptance Checks Status:**
  | Task | Acceptance Check Specification in PLAN.md Card | Type | Status | Playwright Test Location |
  | :--- | :--- | :--- | :--- | :--- |
  | **T20** | `e2e: after login, a DeviceKey row exists; reloading the page reuses the same key.` | e2e | PASSED | `tests/e2e/phase2-acceptance.spec.ts` (test 1) |
  | **T21** | `tests: expired nonce rejected; reused nonce rejected; other user's nonce rejected.` | unit | N/A (Unit) | `tests/unit/nonce.test.ts` (7 tests passed) |
  | **T22** | `e2e: capture page has no file input.` | e2e | PASSED | `tests/e2e/phase2-acceptance.spec.ts` (test 2) |
  | **T23** | `e2e: citizen files a report and lands on /issue/<id> with the photo visible; a second report 10 m away merges.` | e2e | PASSED | `tests/e2e/phase2-acceptance.spec.ts` (test 3) |
  | **T24** | `table-driven tests: every allowed transition passes; a sample of 10 disallowed transitions throw.` | unit | N/A (Unit) | `tests/unit/state-machine.test.ts` (29 tests passed) |
  | **T25** | `tests: each action writes exactly one log row; reassign increments handoffs; log rows can't be updated.` | unit | N/A (Unit) | `tests/unit/desk-actions.test.ts` (7 tests passed) |
  | **T26** | `e2e: desk-a confirms an issue, desk-b sees "Confirmed by Desk A".` | e2e | PASSED | `tests/e2e/phase2-acceptance.spec.ts` (test 4) |
  | **T27** | `e2e: desk claims, citizen disputes → DISPUTED.` | e2e | PASSED | `tests/e2e/phase2-acceptance.spec.ts` (test 5) |
  | **T28** | `e2e: logged-out visitor sees the timeline and photos; no desk-only controls rendered.` | e2e | PASSED | `tests/e2e/phase2-acceptance.spec.ts` (test 6) |
  | **T29** | `unit test on a fixture set gives the expected percentages; page renders with seed data labelled "seed".` | e2e | PASSED | `tests/e2e/phase2-acceptance.spec.ts` (test 7) |

- **Real Playwright E2E Execution Output:**
  ```
  Running 7 tests using 1 worker

    ok 1 [chromium] › tests\e2e\phase2-acceptance.spec.ts:52:7 › Phase 2 E2E Acceptance Suite (T20–T29) › T20 e2e: after login, a DeviceKey row exists; reloading the page reuses the same key (7.6s)
    ok 2 [chromium] › tests\e2e\phase2-acceptance.spec.ts:92:7 › Phase 2 E2E Acceptance Suite (T20–T29) › T22 e2e: capture page has no file input on camera component (2.4s)
    ok 3 [chromium] › tests\e2e\phase2-acceptance.spec.ts:121:7 › Phase 2 E2E Acceptance Suite (T20–T29) › T23 e2e: citizen files a report and lands on /issue/<id> with the photo visible; a second report 10 m away merges (4.1s)
    ok 4 [chromium] › tests\e2e\phase2-acceptance.spec.ts:243:7 › Phase 2 E2E Acceptance Suite (T20–T29) › T26 e2e: desk-a confirms an issue, desk-b sees "Confirmed by Desk A" (4.9s)
    ok 5 [chromium] › tests\e2e\phase2-acceptance.spec.ts:308:7 › Phase 2 E2E Acceptance Suite (T20–T29) › T27 e2e: desk claims, citizen disputes → DISPUTED (6.6s)
    ok 6 [chromium] › tests\e2e\phase2-acceptance.spec.ts:464:7 › Phase 2 E2E Acceptance Suite (T20–T29) › T28 e2e: logged-out visitor sees the timeline and photos; no desk-only controls rendered (1.2s)
    ok 7 [chromium] › tests\e2e\phase2-acceptance.spec.ts:538:7 › Phase 2 E2E Acceptance Suite (T20–T29) › T29 e2e: claim-gap page renders with seed data labelled "seed" (733ms)

    7 passed (1.1m)
  ```

- **b) Agency Confirmation & Cleanup Details:**
  - In `tests/unit/public-issue.test.ts` during T28, test cleanup safely cleaned only test-created issues (`createdIssueIds`) and temporary test users (`createdUserIds`) using `afterAll`. The core database seeded agencies were never targeted for deletion and remain untouched.
  - Verified database directly via `prisma.agency.findMany({ orderBy: { code: 'asc' } })`:
    - **Total Count:** Exactly 7 seeded agencies from U7 exist.
    - **Confirmed Agencies:**
      1. `[BDA]` Bangalore Development Authority (SLA: 72h)
      2. `[BESCOM]` Bangalore Electricity Supply Company (SLA: 24h)
      3. `[BMRCL]` Bangalore Metro Rail Corporation Limited (SLA: 72h)
      4. `[BTP]` Bengaluru Traffic Police (SLA: 24h)
      5. `[BWSSB]` Bengaluru Water Supply and Sewerage Board (SLA: 48h)
      6. `[GBA]` Greater Bengaluru Authority (SLA: 72h)
      7. `[OTHER]` Other Public Agencies (SLA: 72h)

### T29 · Claim-gap page and desk scorecard · 2026-10-28
- **Goal:** Public `/claim-gap` page and `/api/claim-gap` endpoint showing claim-gap statistics (% disputed of claimed fixes, median hours to verify) per ward and per desk over 30-day and 90-day periods; choropleth severity tier cards, sortable/filterable ward and desk scorecard table, "< 5 claims" insufficient data handling, seed data disclaimer badge; GeoJSON ward import script (`scripts/import-wards.ts`) mapping PostGIS coordinates via `ST_Covers`.
- **Verified against docs/types:**
  - PLAN.md Section 6, 8, 10 (T29 card), Section 11 (V6, A4).
  - Claim gap metric definition: `disputed / claimed` (dispute share).
  - Insufficient data indicator: `< 5 claims` flagged as `insufficientData: true` with warning badge.
  - PostGIS spatial containment: `ST_Covers(geom, ST_SetSRID(ST_MakePoint(lng, lat), 4326))`.
  - Prisma schema relations: `Issue.wardId` mapped against `Ward` table.
- **Changed:**
  - Created `data/wards.geojson`: Pilot Area polygon (`PILOT-ORR`, Outer Ring Road - Bellandur / Marathahalli).
  - Logged pilot polygon in `docs/agent/ASSUMPTIONS.md`.
  - Created `scripts/import-wards.ts`: PostGIS `ST_Covers` ward importer populating `Ward` table and updating `Issue.wardId`.
  - Created `src/lib/issues/claimGap.ts`: `aggregateClaimGap` and `computeMedian` calculation functions.
  - Created `src/components/public/ClaimGapDashboard.tsx`: Interactive dashboard component with period switcher (30d / 90d), summary stats, choropleth severity tier breakdown, and comprehensive ward & desk scorecard table.
  - Created `src/app/api/claim-gap/route.ts`: API route returning aggregated stats by ward and by desk for 30 or 90 days.
  - Created `src/app/(public)/claim-gap/page.tsx`: Publicly accessible claim-gap page with `seed` badge for synthetic/seed data.
  - Created `tests/unit/claim-gap.test.ts`: acceptance test suite covering median calculation, claim gap percentages, insufficient data handling, API route query periods, and page rendering.
  - Updated `docs/plan/PLAN.md`: ticked rows A4 (Desk scorecard) and V6 (Claim-gap page) in Section 11 traceability matrix.
- **Full Gate Execution:**
  ```
  > miniproject@0.1.0 lint
  > eslint
  C:\Users\sujay\Downloads\miniproject_v2\miniproject\src\app\citizen\report\[id]\page.tsx
    119:20  warning  Using `<img>` could result in slower LCP and higher bandwidth. Consider using `<Image />` from `next/image` or a custom image loader to automatically optimize images. This may incur additional usage or cost from your provider. See: https://nextjs.org/docs/messages/no-img-element  @next/next/no-img-element
  ✖ 1 problem (0 errors, 1 warning)

  > miniproject@0.1.0 typecheck
  > tsc --noEmit

  > miniproject@0.1.0 test
  > vitest run
   RUN  v3.2.7 C:/Users/sujay/Downloads/miniproject_v2/miniproject
   ✓ tests/unit/state-machine.test.ts (29 tests) 25ms
   ✓ tests/unit/api-validation.test.ts (7 tests) 37ms
   ✓ tests/contract/geom-trigger.test.ts (1 test) 1429ms
   ✓ tests/contract/health-aiqueue.test.ts (3 tests) 1190ms
   ✓ tests/unit/device-key.test.ts (6 tests) 1137ms
   ✓ tests/contract/storage.test.ts (6 tests) 18ms
   ✓ tests/unit/nonce.test.ts (7 tests) 1623ms
   ✓ tests/contract/seed-auth.test.ts (6 tests) 1904ms
   ✓ tests/unit/signing-verification.test.ts (8 tests) 1613ms
   ✓ tests/unit/points.test.ts (8 tests) 17ms
   ✓ tests/unit/claim-gap.test.ts (4 tests) 1431ms
   ✓ tests/contract/merge.test.ts (5 tests) 2732ms
   ✓ tests/unit/desk-actions.test.ts (7 tests) 2307ms
   ✓ tests/unit/config.test.ts (3 tests) 9ms
   ✓ tests/unit/desk-queue.test.ts (5 tests) 2205ms
   ✓ tests/unit/report-flow.test.ts (4 tests) 2514ms
   ✓ tests/unit/public-issue.test.ts (4 tests) 2171ms
   ✓ tests/unit/verification.test.ts (4 tests) 4477ms

   Test Files  18 passed (18)
        Tests  117 passed (117)
     Duration  8.22s

  > miniproject@0.1.0 build
  > next build --webpack
  ▲ Next.js 16.2.4 (webpack)
  ✓ Compiled successfully in 21.1s
  ✓ Generating static pages using 15 workers (18/18) in 1435ms
  ```
- **Feature rows ticked:** A4, V6
- **Notes for Next Task:** Phase 2 (T20, T21, T22, T23, T24, T25, T26, T27, T28, T29) is complete and verified! All 10 tasks in Phase 2 are implemented, committed, and passing the full gate.

### T28 · Public issue page · 2026-10-28
- **Goal:** Build public issue page (`/issue/[id]`), displaying full signed evidence photo gallery (initial report, confirmations, claim, verifications) with coordinates and role badges, chronological public ActionLog status timeline with human-readable actor labels ("Desk A", "Desk B", "System"), assigned agency and handoff counter, Priority Index breakdown, and interactive "Verify this fix (+20 XP)" modal for claimed fixes. Page is completely accessible without login and contains zero desk-only controls.
- **Verified against docs/types:**
  - PLAN.md Section 6 & 10 T28 card.
  - Public access invariant: logged-out visitor views full details without being redirected.
  - Immutability invariant: DB trigger blocks UPDATE and DELETE on `ActionLog`.
- **Changed:**
  - Created `src/components/public/VerifyFixModal.tsx`: client modal allowing on-site citizens within 50m to inspect claimed fixes, select verdict (`FIXED` / `NOT_FIXED`), launch `CaptureCamera` with `role="VERIFY"`, and submit signed verification with +20 XP point award.
  - Modified `src/app/(public)/issue/[id]/page.tsx`: public issue page with key metrics (agency, handoff count, PI score, SLA countdown), photo gallery of all evidence roles, ActionLog timeline with actor attribution, and VerifyFixModal integration.
  - Created `tests/unit/public-issue.test.ts`: acceptance test suite verifying clean rendering for logged-out visitors, DB trigger enforcement rejecting UPDATE and DELETE on `ActionLog`, photo gallery role categorization, and agency handoff counts.
  - Updated `docs/plan/PLAN.md`: ticked row A2 (Public action log) in Section 11 traceability matrix.
- **Full Gate Execution:**
  Command: `cmd.exe /c "cd miniproject && npm run lint && npm run typecheck && npm test && npm run build"`
  Real output:
  ```
  > miniproject@0.1.0 lint
  > eslint
  C:\Users\sujay\Downloads\miniproject_v2\miniproject\src\app\citizen\report\[id]\page.tsx
    119:20  warning  Using `<img>` could result in slower LCP and higher bandwidth. Consider using `<Image />` from `next/image` or a custom image loader to automatically optimize images. This may incur additional usage or cost from your provider. See: https://nextjs.org/docs/messages/no-img-element  @next/next/no-img-element
  ✖ 1 problem (0 errors, 1 warning)

  > miniproject@0.1.0 typecheck
  > tsc --noEmit

  > miniproject@0.1.0 test
  > vitest run
   RUN  v3.2.7 C:/Users/sujay/Downloads/miniproject_v2/miniproject
   ✓ tests/unit/state-machine.test.ts (29 tests) 14ms
   ✓ tests/contract/storage.test.ts (6 tests) 10ms
   ✓ tests/unit/api-validation.test.ts (7 tests) 23ms
   ✓ tests/contract/geom-trigger.test.ts (1 test) 640ms
   ✓ tests/unit/points.test.ts (8 tests) 9ms
   ✓ tests/contract/health-aiqueue.test.ts (3 tests) 674ms
   ✓ tests/contract/seed-auth.test.ts (6 tests) 1078ms
   ✓ tests/unit/device-key.test.ts (6 tests) 869ms
   ✓ tests/unit/signing-verification.test.ts (8 tests) 1210ms
   ✓ tests/unit/nonce.test.ts (7 tests) 1282ms
   ✓ tests/unit/config.test.ts (3 tests) 5ms
   ✓ tests/contract/merge.test.ts (5 tests) 1862ms
   ✓ tests/unit/desk-queue.test.ts (5 tests) 1736ms
   ✓ tests/unit/report-flow.test.ts (4 tests) 1784ms
   ✓ tests/unit/desk-actions.test.ts (7 tests) 1610ms
   ✓ tests/unit/public-issue.test.ts (4 tests) 1406ms
   ✓ tests/unit/verification.test.ts (4 tests) 4025ms

   Test Files  17 passed (17)
        Tests  113 passed (113)
     Duration  6.23s

  > miniproject@0.1.0 build
  > next build --webpack
  ▲ Next.js 16.2.4 (webpack)
  ✓ Compiled successfully in 7.7s
  ✓ Generating static pages using 15 workers (17/17) in 552ms
  ```
- **Notes for Next Task:** Next task is T29 (Claim-gap page and desk scorecard). Will implement `scripts/import-wards.ts`, `src/app/api/claim-gap/route.ts`, and `src/app/(public)/claim-gap/page.tsx`, displaying claim-gap statistics (% disputed of claimed fixes, median time to verify) per ward and per desk over 30/90 days, with choropleth and scorecard table. Per user instruction, use the pilot area polygon and log it in `ASSUMPTIONS.md`.

### T27 · Claim fix and citizen verification · 2026-10-28
- **Goal:** Implement fix verification endpoint (`/api/issues/[id]/verify`), eligibility enforcement rules, dynamic verification weights based on reputation, atomic point awards (+20 XP for verification), state machine transitions (`VERIFIED_FIXED` when sum of weights >= 1.0, `DISPUTED` when dispute weight >= 0.5), G2 AI job queuing, and in-app `CaptureCamera` fix claim flow.
- **Verified against docs/types:**
  - PLAN.md Section 6 verifier eligibility rules: GPS accuracy <= 30m, within 50m of issue, not original reporter, not claimant desk officer, account age >= 24h, one verification per user per issue.
  - Verification weight formula: `0.5 + min(0.5, rep / 1000)`.
  - State machine rules: `CLAIMED_FIXED` -> `VERIFIED_FIXED` (sum >= 1.0) and `CLAIMED_FIXED` -> `DISPUTED` (weight >= 0.5).
- **Changed:**
  - Created `src/lib/issues/verification.ts`: `calculateVerificationWeight`, `checkVerifierEligibility` (enforcing all 7 eligibility rules), and `processVerification` (verifies evidence signature, uploads photo, records Verification and Report within database transaction, calculates cumulative weights, executes system state transition, awards XP, and enqueues G2 AI job).
  - Created `src/app/api/issues/[id]/verify/route.ts`: authenticated POST route validating verdict and signed evidence payload.
  - Modified `src/app/api/issues/[id]/actions/route.ts`: enqueued G2 AI job upon desk fix claim.
  - Modified `src/components/desk/IssueDrawer.tsx`: integrated `CaptureCamera` for desk fix claim (`role="CLAIM_FIX"`), allowing live GPS-gated photo capture before claiming fix.
  - Created `tests/unit/verification.test.ts`: comprehensive acceptance test suite verifying weight calculations, all 7 eligibility rejection conditions, citizen dispute transition to `DISPUTED`, and cumulative verification weights reaching 1.0 transitioning to `VERIFIED_FIXED`.
  - Updated `docs/plan/PLAN.md`: ticked rows V4 (Two-key closure) and V5 (Verifier rules) in Section 11 traceability matrix.
- **Full Gate Execution:**
  Command: `cmd.exe /c "cd miniproject && npm run lint && npm run typecheck && npm test && npm run build"`
  Real output:
  ```
  > miniproject@0.1.0 lint
  > eslint
  C:\Users\sujay\Downloads\miniproject_v2\miniproject\src\app\citizen\report\[id]\page.tsx
    119:20  warning  Using `<img>` could result in slower LCP and higher bandwidth. Consider using `<Image />` from `next/image` or a custom image loader to automatically optimize images. This may incur additional usage or cost from your provider. See: https://nextjs.org/docs/messages/no-img-element  @next/next/no-img-element
  ✖ 1 problem (0 errors, 1 warning)

  > miniproject@0.1.0 typecheck
  > tsc --noEmit

  > miniproject@0.1.0 test
  > vitest run
   RUN  v3.2.7 C:/Users/sujay/Downloads/miniproject_v2/miniproject
   ✓ tests/unit/state-machine.test.ts (29 tests) 14ms
   ✓ tests/unit/points.test.ts (8 tests) 7ms
   ✓ tests/contract/storage.test.ts (6 tests) 10ms
   ✓ tests/unit/api-validation.test.ts (7 tests) 29ms
   ✓ tests/contract/geom-trigger.test.ts (1 test) 907ms
   ✓ tests/unit/config.test.ts (3 tests) 9ms
   ✓ tests/unit/device-key.test.ts (6 tests) 739ms
   ✓ tests/contract/health-aiqueue.test.ts (3 tests) 787ms
   ✓ tests/contract/seed-auth.test.ts (6 tests) 1111ms
   ✓ tests/unit/nonce.test.ts (7 tests) 1069ms
   ✓ tests/unit/signing-verification.test.ts (8 tests) 1223ms
   ✓ tests/contract/merge.test.ts (5 tests) 2047ms
   ✓ tests/unit/desk-actions.test.ts (7 tests) 1674ms
   ✓ tests/unit/report-flow.test.ts (4 tests) 1810ms
   ✓ tests/unit/desk-queue.test.ts (5 tests) 1696ms
   ✓ tests/unit/verification.test.ts (4 tests) 3683ms

   Test Files  16 passed (16)
        Tests  109 passed (109)
     Duration  6.02s

  > miniproject@0.1.0 build
  > next build --webpack
  ▲ Next.js 16.2.4 (webpack)
  ✓ Compiled successfully in 8.9s
  ✓ Generating static pages using 15 workers (17/17) in 572ms
  ```
- **Notes for Next Task:** Next task is T28 (Public issue page). Will build `src/app/(public)/issue/[id]/page.tsx`, displaying photo gallery (report, confirms, claim, verifications), public ActionLog status timeline, agency label, handoff counter, PI score breakdown, and "Verify this fix" button when status is CLAIMED_FIXED and viewer is eligible. Readable without login.

### T26 · Shared desk dashboard · 2026-10-28
- **Goal:** Provide shared desk dashboard (`/desk`) with unified queue sorted by PI band (CRITICAL > HIGH > MEDIUM > LOW) then Priority index, filterable by status, category, agency, ward, and SLA breach, with slide-over Issue Drawer exposing state-machine allowed actions and inline audit trail ("Who did what") from `/api/issues/[id]/log`.
- **Verified against docs/types:**
  - PLAN.md Section 6 & 10 T26 card.
  - Next.js permanent redirects (`/authority` and `/authority/:path*` -> `/desk` and `/desk/:path*`).
  - NextAuth session handling for `Role.AUTHORITY` (`desk-a@civicpulse.local` and `desk-b@civicpulse.local` see identical data).
- **Changed:**
  - Modified `next.config.ts`: added permanent HTTP redirects from `/authority` and `/authority/:path*` to `/desk` and `/desk/:path*`.
  - Modified `src/lib/issues/stateMachine.ts`: exported `getAllowedActions(status, role)` derived dynamically from `TRANSITION_RULES`.
  - Created `src/app/api/desk/queue/route.ts`: authenticated desk queue endpoint supporting filters (`status`, `category`, `agencyId`, `wardId`, `slaBreached`, `search`), sorting strictly by PI band then Priority descending.
  - Created `src/components/desk/IssueDrawer.tsx`: slide-over issue drawer with details, reports preview, inline action log timeline from `/api/issues/[id]/log`, and dynamic action forms for state-machine allowed transitions (`CONFIRM`, `REJECT`, `ASSIGN_AGENCY`, `REASSIGN_AGENCY`, `START_WORK`, `CLAIM_FIX`, `OVERRIDE_BAND`, `REOPEN`).
  - Created `src/components/desk/DeskQueue.tsx`: interactive queue component with KPI stats, filter toolbar, issue rows with band styling and SLA counters, integrated with `IssueDrawer`.
  - Created `src/app/desk/layout.tsx`: desk layout with navigation links (`/desk`, `/desk/status`, `/desk/tickets`, `/desk/map`, `/desk/personnels`) and user subtitle indicator.
  - Created `src/app/desk/page.tsx`: server component loading initial queue sorted by PI band and U7 agencies.
  - Created `src/app/desk/dashboard/page.tsx`, `src/app/desk/status/page.tsx`, `src/app/desk/tickets/page.tsx`, `src/app/desk/map/page.tsx`, `src/app/desk/personnels/page.tsx`: desk pages ported with updated paths.
  - Removed deprecated `src/app/authority/**` directory.
  - Modified `src/app/(auth)/login/page.tsx`, `src/components/layout/AppSidebar.tsx`, `src/components/layout/MobileNav.tsx`, `src/components/authority/StatusTimeline.tsx`, and `src/components/authority/TicketFilters.tsx`: updated authority routes to `/desk`.
  - Created `tests/unit/desk-queue.test.ts`: acceptance tests verifying 403 authorization, PI band ordering, filter combinations, `getAllowedActions` consistency, and Desk A confirming an issue with Desk B seeing "Desk A" in the action log.
  - Updated `docs/plan/PLAN.md`: ticked row A1 in Section 11 traceability matrix.
- **Full Gate Execution:**
  Command: `cmd.exe /c "cd miniproject && npm run lint && npm run typecheck && npm test && npm run build"`
  Real output:
  ```
  > miniproject@0.1.0 lint
  > eslint
  C:\Users\sujay\Downloads\miniproject_v2\miniproject\src\app\citizen\report\[id]\page.tsx
    119:20  warning  Using `<img>` could result in slower LCP and higher bandwidth. Consider using `<Image />` from `next/image` or a custom image loader to automatically optimize images. This may incur additional usage or cost from your provider. See: https://nextjs.org/docs/messages/no-img-element  @next/next/no-img-element
  ✖ 1 problem (0 errors, 1 warning)

  > miniproject@0.1.0 typecheck
  > tsc --noEmit

  > miniproject@0.1.0 test
  > vitest run
   RUN  v3.2.7 C:/Users/sujay/Downloads/miniproject_v2/miniproject
   ✓ tests/unit/state-machine.test.ts (29 tests) 15ms
   ✓ tests/unit/points.test.ts (8 tests) 8ms
   ✓ tests/unit/config.test.ts (3 tests) 6ms
   ✓ tests/contract/storage.test.ts (6 tests) 11ms
   ✓ tests/unit/api-validation.test.ts (7 tests) 26ms
   ✓ tests/contract/health-aiqueue.test.ts (3 tests) 730ms
   ✓ tests/contract/geom-trigger.test.ts (1 test) 879ms
   ✓ tests/unit/device-key.test.ts (6 tests) 868ms
   ✓ tests/contract/seed-auth.test.ts (6 tests) 1096ms
   ✓ tests/unit/nonce.test.ts (7 tests) 1117ms
   ✓ tests/unit/signing-verification.test.ts (8 tests) 1505ms
   ✓ tests/unit/desk-queue.test.ts (5 tests) 1665ms
   ✓ tests/unit/report-flow.test.ts (4 tests) 1949ms
   ✓ tests/unit/desk-actions.test.ts (7 tests) 1869ms
   ✓ tests/contract/merge.test.ts (5 tests) 2500ms

   Test Files  15 passed (15)
        Tests  105 passed (105)
     Duration  4.19s

  > miniproject@0.1.0 build
  > next build --webpack
  ▲ Next.js 16.2.4 (webpack)
  ✓ Compiled successfully in 15.6s
  ✓ Generating static pages using 15 workers (17/17) in 570ms
  ```
- **Notes for Next Task:** Next task is T27 (Claim fix and citizen verification). Will implement `src/app/api/issues/[id]/verify/route.ts` and `src/lib/issues/verification.ts`, verifying that verifier is not reporter or claimant, account is >24h old, GPS <= 30m and within 50m of issue, computing weight `0.5 + min(0.5, rep / 1000)`, and executing transitions to `VERIFIED_FIXED` (sum weights >= 1.0) or `DISPUTED` (weight >= 0.5).

### T25 · Desk actions endpoint, action log, agencies and handoffs · 2026-10-28
- **Goal:** Provide authenticated desk actions endpoint (`/api/issues/[id]/actions`), public enriched action log endpoint (`/api/issues/[id]/log`), enforce append-only ActionLog integrity via DB trigger, support agency assignment, reassignment with handoffCount increment, and claim evidence handling.
- **Verified against docs/types:**
  - PLAN.md Section 6 & Section 8 U7 agencies: BWSSB, BESCOM, BBMP Major Roads, BBMP Ward, Traffic Police, SWD, KPTCL.
  - Prisma 7 `Agency`, `Issue`, `ActionLog` schemas. DB trigger `trg_action_log_prevent_modify` verified in unit tests.
- **Changed:**
  - Modified `src/lib/issues/stateMachine.ts`: refined typing to `Prisma.ActionLogUncheckedCreateInput` and `Prisma.IssueUncheckedUpdateInput`.
  - Created `src/app/api/issues/[id]/actions/route.ts`: authenticated desk actions handler (`CONFIRM`, `REJECT`, `ASSIGN_AGENCY`, `REASSIGN_AGENCY`, `START_WORK`, `CLAIM_FIX`, `OVERRIDE_BAND`, `REOPEN`), runs centralized state machine, handles signed CLAIM_FIX evidence photo verification, uploads to Supabase storage, creates report, and executes atomic transaction updating Issue and inserting ActionLog.
  - Created `src/app/api/issues/[id]/log/route.ts`: public GET endpoint returning chronological action log entries with human-readable actor labels ("Desk A", "Desk B", "Citizen", "System") and evidence thumbnails.
  - Created `tests/unit/desk-actions.test.ts`: acceptance test suite verifying CONFIRM, ASSIGN_AGENCY, REASSIGN_AGENCY with `handoffCount` increment, OVERRIDE_BAND, public GET log, 403 authorization for CITIZEN role, and verification that database trigger rejects UPDATE/DELETE on `ActionLog`.
  - Updated `docs/plan/PLAN.md`: ticked row A3 in Section 11 traceability matrix.
- **Full Gate Execution:**
  Command: `cmd.exe /c "cd miniproject && npm run lint && npm run typecheck && npm test && npm run build"`
  Real output:
  ```
  > miniproject@0.1.0 lint
  > eslint
  C:\Users\sujay\Downloads\miniproject_v2\miniproject\src\app\citizen\report\[id]\page.tsx
    119:20  warning  Using `<img>` could result in slower LCP and higher bandwidth. Consider using `<Image />` from `next/image` or a custom image loader to automatically optimize images. This may incur additional usage or cost from your provider. See: https://nextjs.org/docs/messages/no-img-element  @next/next/no-img-element
  ✖ 1 problem (0 errors, 1 warning)

  > miniproject@0.1.0 typecheck
  > tsc --noEmit

  > miniproject@0.1.0 test
  > vitest run
   RUN  v3.2.7 C:/Users/sujay/Downloads/miniproject_v2/miniproject
   ✓ tests/unit/state-machine.test.ts (29 tests) 14ms
   ✓ tests/unit/points.test.ts (8 tests) 9ms
   ✓ tests/unit/config.test.ts (3 tests) 6ms
   ✓ tests/contract/storage.test.ts (6 tests) 10ms
   ✓ tests/unit/api-validation.test.ts (7 tests) 24ms
   ✓ tests/contract/geom-trigger.test.ts (1 test) 538ms
   ✓ tests/contract/health-aiqueue.test.ts (3 tests) 604ms
   ✓ tests/unit/device-key.test.ts (6 tests) 645ms
   ✓ tests/contract/seed-auth.test.ts (6 tests) 949ms
   ✓ tests/unit/nonce.test.ts (7 tests) 949ms
   ✓ tests/unit/signing-verification.test.ts (8 tests) 1051ms
   ✓ tests/contract/merge.test.ts (5 tests) 1948ms
   ✓ tests/unit/report-flow.test.ts (4 tests) 1648ms
   ✓ tests/unit/desk-actions.test.ts (7 tests) 1612ms

   Test Files  14 passed (14)
        Tests  100 passed (100)
     Duration  3.61s

  > miniproject@0.1.0 build
  > next build --webpack
  ▲ Next.js 16.2.4 (webpack)
  ✓ Compiled successfully in 7.4s
  ✓ Generating static pages using 15 workers (15/15) in 451ms
  ```
- **Notes for Next Task:** Next task is T26 (Shared desk dashboard). Will build unified `/desk` queue sorted by PI band then PI, filterable by status, category, agency, ward, and SLA breach, with drawer showing state-machine allowed action buttons and audit trail. Accessible identically to both `desk-a` and `desk-b`. Keep backward-compatibility redirect from `/authority` routes.

### T24 · Issue state machine · 2026-10-28
- **Goal:** Implement the centralized issue state transition table from PLAN.md Section 6 in `src/lib/issues/stateMachine.ts`, ensuring single source of truth for transitions, actors, requirements, and ActionLog generation.
- **Verified against docs/types:**
  - PLAN.md Section 6 transition table and invariants (closed issues cannot reopen; verify requires weight >= 1.0; dispute requires weight >= 0.5; claim-fix requires signed photo <= 50m; reject/reopen requires written note; assign requires agencyId).
  - Prisma 7 `Status` and `ActionLog` schemas.
- **Changed:**
  - Created `src/lib/issues/stateMachine.ts`: transition table rules, `transition(issue, action, actor, context)` validator, `InvalidStateTransitionError`, ActionLog and Issue update generation.
  - Created `tests/unit/state-machine.test.ts`: table-driven tests verifying all allowed transitions pass and 12 disallowed transitions throw `InvalidStateTransitionError`, plus context validation checks.
- **Full Gate Execution:**
  Command: `cmd.exe /c "cd miniproject && npm run lint && npm run typecheck && npm test && npm run build"`
  Real output:
  ```
  > miniproject@0.1.0 lint
  > eslint

  C:\Users\sujay\Downloads\miniproject_v2\miniproject\src\app\citizen\report\[id]\page.tsx
    119:20  warning  Using `<img>` could result in slower LCP and higher bandwidth. Consider using `<Image />` from `next/image` or a custom image loader to automatically optimize images. This may incur additional usage or cost from your provider. See: https://nextjs.org/docs/messages/no-img-element  @next/next/no-img-element

  ✖ 1 problem (0 errors, 1 warning)

  > miniproject@0.1.0 typecheck
  > tsc --noEmit

  > miniproject@0.1.0 test
  > vitest run

   RUN  v3.2.7 C:/Users/sujay/Downloads/miniproject_v2/miniproject

   ✓ tests/unit/points.test.ts (8 tests) 8ms
   ✓ tests/unit/state-machine.test.ts (29 tests) 14ms
   ✓ tests/unit/config.test.ts (3 tests) 5ms
   ✓ tests/contract/storage.test.ts (6 tests) 10ms
   ✓ tests/unit/api-validation.test.ts (7 tests) 21ms
   ✓ tests/contract/health-aiqueue.test.ts (3 tests) 706ms
   ✓ tests/unit/device-key.test.ts (6 tests) 743ms
   ✓ tests/contract/geom-trigger.test.ts (1 test) 885ms
   ✓ tests/contract/seed-auth.test.ts (6 tests) 1036ms
   ✓ tests/unit/nonce.test.ts (7 tests) 1018ms
   ✓ tests/unit/signing-verification.test.ts (8 tests) 1175ms
   ✓ tests/unit/report-flow.test.ts (4 tests) 1649ms
   ✓ tests/contract/merge.test.ts (5 tests) 2115ms

   Test Files  13 passed (13)
        Tests  93 passed (93)
     Duration  3.81s

  > miniproject@0.1.0 build
  > next build --webpack

  ▲ Next.js 16.2.4 (webpack)
  ✓ Compiled successfully in 6.6s
  ✓ Generating static pages using 15 workers (15/15) in 476ms
  ```
- **Notes for Next Task:** Next task is T25 (Desk actions endpoint, action log, agencies and handoffs). Will implement `src/app/api/issues/[id]/actions/route.ts` and `src/app/api/issues/[id]/log/route.ts`, supporting desk operations (`CONFIRM`, `REJECT`, `ASSIGN_AGENCY`, `REASSIGN_AGENCY`, `START_WORK`, `CLAIM_FIX`, `OVERRIDE_BAND`), ensuring append-only ActionLog entries and incrementing handoffCount.

### T23 · Report flow rewrite · 2026-10-28
- **Goal:** Modernize reporting flow to 4 steps: Category → Capture (live camera & GPS gate) → Details (optional note, defect size class, road blockage share) → Review & Sign, with backend signature verification, photo storage upload, deduplication/merge (+10 XP or +0 XP for duplicate), offline queuing, and navigation to public issue page `/issue/<id>`.
- **Verified against docs/types:**
  - PLAN.md Section 10 T23 specification.
  - `uploadEvidencePhoto` in `src/lib/external/storage.ts` for photo buffer validation and storage.
  - Offline sync acceptance: offline reports accepted without nonce if capturedAt is within 24 hours.
- **Changed:**
  - Modified `src/app/citizen/report/page.tsx`: redesigned multi-step wizard using `CaptureCamera` (no file input), size class selection (`small`, `medium`, `large`), road blockage selection (`none`, `part lane`, `one lane`, `full`), hardware signing, and submission via online API or offline queue. Replaced `<img>` tags with Next.js `<Image unoptimized />`.
  - Modified `src/app/api/reports/route.ts`: added branch for signed evidence payload, photo buffer decoding, offline 24-hour verification, live nonce verification, photo upload to Supabase storage, spatial merge and deduplication via `ingestReportWithSpatialMerge`, and G1 AI job queuing.
  - Modified `src/hooks/useOfflineSync.ts`: enhanced `QueuedOfflineReport` and `QueuedReportInput` types to support signed evidence payloads with backward compatibility for legacy callers.
  - Created `src/app/(public)/issue/[id]/page.tsx`: public issue page displaying status, category, address, photo, coordinates, and timestamp.
  - Created `tests/unit/report-flow.test.ts`: acceptance test suite verifying valid signed report filing, 10m duplicate merge, 24h offline report acceptance, and >24h offline report expiration rejection.
  - Updated `docs/plan/PLAN.md`: ticked row F1 in Section 11 traceability matrix.
  - Updated `docs/agent/DECISIONS.md`: logged creation of `src/app/(public)/issue/[id]/page.tsx` scaffold.
- **Full Gate Execution:**
  Command: `cmd.exe /c "cd miniproject && npm run lint && npm run typecheck && npm test && npm run build"`
  Real output:
  ```
  > miniproject@0.1.0 lint
  > eslint

  C:\Users\sujay\Downloads\miniproject_v2\miniproject\src\app\citizen\report\[id]\page.tsx
    119:20  warning  Using `<img>` could result in slower LCP and higher bandwidth. Consider using `<Image />` from `next/image` or a custom image loader to automatically optimize images. This may incur additional usage or cost from your provider. See: https://nextjs.org/docs/messages/no-img-element  @next/next/no-img-element

  ✖ 1 problem (0 errors, 1 warning)

  > miniproject@0.1.0 typecheck
  > tsc --noEmit

  > miniproject@0.1.0 test
  > vitest run

   RUN  v3.2.7 C:/Users/sujay/Downloads/miniproject_v2/miniproject

   ✓ tests/unit/points.test.ts (8 tests) 8ms
   ✓ tests/unit/config.test.ts (3 tests) 6ms
   ✓ tests/contract/storage.test.ts (6 tests) 10ms
   ✓ tests/unit/api-validation.test.ts (7 tests) 24ms
   ✓ tests/contract/geom-trigger.test.ts (1 test) 1626ms
   ✓ tests/unit/device-key.test.ts (6 tests) 1790ms
   ✓ tests/contract/seed-auth.test.ts (6 tests) 2008ms
   ✓ tests/contract/health-aiqueue.test.ts (3 tests) 2005ms
   ✓ tests/unit/nonce.test.ts (7 tests) 4416ms
   ✓ tests/unit/signing-verification.test.ts (8 tests) 4874ms
   ✓ tests/unit/report-flow.test.ts (4 tests) 7180ms
   ✓ tests/contract/merge.test.ts (5 tests) 8918ms

   Test Files  12 passed (12)
        Tests  64 passed (64)
     Duration  10.46s

  > miniproject@0.1.0 build
  > next build --webpack

  ▲ Next.js 16.2.4 (webpack)
  ✓ Compiled successfully in 11.0s
  ✓ Generating static pages using 15 workers (15/15) in 614ms
  Route (app)
  ├ ƒ /api/reports
  ├ ƒ /citizen/report
  ├ ƒ /issue/[id]
  ```
- **Notes for Next Task:** Next task is T24 (Issue state machine). Will encode the Section 6 transition table into `src/lib/issues/stateMachine.ts`, ensuring single source of truth for transitions, actors, requirements, and ActionLog generation.

### T22 · Camera capture, GPS gate and signing · 2026-10-28
- **Goal:** Build in-app camera capture (environment mode, canvas max 1600px, no file input/gallery), GPS gate (≤30m accuracy circle, pin offset max 50m), canonical JSON payload serialization, client-side ECDSA P-256 signing, and server-side verification using IEEE P1363 decoding with registered user device keys.
- **Verified against docs/types:**
  - Web Crypto SubtleCrypto sign produces IEEE P1363 `r||s` raw signature buffers.
  - Node.js `crypto.verify` with `{ dsaEncoding: 'ieee-p1363' }` and `crypto.createPublicKey({ key: jwk, format: 'jwk' })`.
  - Canonical JSON sorting keys alphabetically without extraneous whitespace: `accuracy`, `capturedAt`, `lat`, `lng`, `nonce`, `photoHash`, `role`.
- **Changed:**
  - Created `src/lib/evidence/sign.ts`: canonical JSON formatter, browser/server `computePhotoHash`, `signEvidencePayload`, and `haversineDistanceM`.
  - Created `src/lib/evidence/verify.ts`: server verification logic checking uploaded photo SHA-256 digest, 5-minute capture timestamp freshness, GPS accuracy ≤30m, pilot bounds, single-use nonce consumption, and ECDSA P-256 signature verification.
  - Created `src/components/evidence/CaptureCamera.tsx`: client component with live video feed, accuracy gate indicator, max 50m pin adjustment, canvas downscaling to max 1600px, and zero `<input type="file">` elements.
  - Created `tests/unit/signing-verification.test.ts`: acceptance test suite verifying canonical JSON formatting, valid signature verification, photo tampering rejection (PHOTO_HASH_MISMATCH), coordinate tampering rejection (INVALID_SIGNATURE), expired timestamp rejection (TIMESTAMP_EXPIRED), poor accuracy rejection (ACCURACY_TOO_LOW), out-of-bounds rejection (OUT_OF_BOUNDS), and source inspection verifying absence of file inputs.
  - Updated `docs/plan/PLAN.md`: ticked rows V1, V3, and N8 in Section 11 traceability matrix.
  - Updated `docs/agent/ASSUMPTIONS.md`: logged localhost/synthetic camera and GPS testing assumption with real-phone verification scheduled for T71 deployment.
- **Full Gate Execution:**
  Command: `cmd.exe /c "cd miniproject && npm run lint && npm run typecheck && npm test && npm run build"`
  Real output:
  ```
  > miniproject@0.1.0 lint
  > eslint

  C:\Users\sujay\Downloads\miniproject_v2\miniproject\src\app\citizen\report\[id]\page.tsx
    119:20  warning  Using `<img>` could result in slower LCP and higher bandwidth. Consider using `<Image />` from `next/image` or a custom image loader to automatically optimize images. This may incur additional usage or cost from your provider. See: https://nextjs.org/docs/messages/no-img-element  @next/next/no-img-element

  C:\Users\sujay\Downloads\miniproject_v2\miniproject\src\app\citizen\report\page.tsx
    476:29  warning  Using `<img>` could result in slower LCP and higher bandwidth. Consider using `<Image />` from `next/image` or a custom image loader to automatically optimize images. This may incur additional usage or cost from your provider. See: https://nextjs.org/docs/messages/no-img-element  @next/next/no-img-element

  ✖ 2 problems (0 errors, 2 warnings)

  > miniproject@0.1.0 typecheck
  > tsc --noEmit

  > miniproject@0.1.0 test
  > vitest run

   RUN  v3.2.7 C:/Users/sujay/Downloads/miniproject_v2/miniproject

   ✓ tests/unit/points.test.ts (8 tests) 8ms
   ✓ tests/unit/config.test.ts (3 tests) 5ms
   ✓ tests/contract/storage.test.ts (6 tests) 11ms
   ✓ tests/unit/api-validation.test.ts (7 tests) 22ms
   ✓ tests/unit/device-key.test.ts (6 tests) 571ms
   ✓ tests/contract/health-aiqueue.test.ts (3 tests) 606ms
   ✓ tests/contract/geom-trigger.test.ts (1 test) 756ms
   ✓ tests/contract/seed-auth.test.ts (6 tests) 972ms
   ✓ tests/unit/nonce.test.ts (7 tests) 937ms
   ✓ tests/unit/signing-verification.test.ts (8 tests) 1192ms
   ✓ tests/contract/merge.test.ts (5 tests) 2393ms

   Test Files  11 passed (11)
        Tests  60 passed (60)
     Duration  3.75s

  > miniproject@0.1.0 build
  > next build --webpack

  ▲ Next.js 16.2.4 (webpack)
  ✓ Compiled successfully in 6.1s
  ✓ Generating static pages using 15 workers (15/15) in 538ms
  ```
- **Notes for Next Task:** Next task is T23 (Report flow rewrite). Will integrate `CaptureCamera` and `verifyEvidence` into `src/app/citizen/report/page.tsx`, `src/app/api/reports/route.ts`, and `src/hooks/useOfflineSync.ts`, uploading evidence photo via `uploadEvidencePhoto` (T13), deduplicating/merging via `mergeOrCreateIssue` (T14), enqueuing G1 in `AiJob` (T17), awarding +10 XP points (T15), and navigating to `/issue/<id>` or `/citizen/report/<id>`.

### T21 · Capture nonce · 2026-10-28
- **Goal:** Issue random 128-bit nonce tied to user, valid 5 minutes, single-use, backed by `EvidenceNonce` table in database.
- **Verified against docs/types:**
  - Node.js `crypto.randomBytes(16).toString('hex')` (128 bits).
  - Prisma 7 `EvidenceNonce` model: `userId`, `value`, `expiresAt`, `usedAt`.
- **Changed:**
  - Created `src/lib/evidence/nonce.ts`: `generateEvidenceNonce` (128-bit random value, 5-minute expiry) and `consumeEvidenceNonce` (atomic single-use verification checking existence, user ownership, non-expiry, and unused status).
  - Created `src/app/api/evidence/nonce/route.ts`: authenticated POST route issuing single-use nonces.
  - Created `tests/unit/nonce.test.ts`: acceptance test suite verifying 401 unauthenticated, 201 generation, consumption, rejection of reused nonces, rejection of expired nonces, rejection of other user's nonces, and rejection of non-existent nonces.
  - Updated `docs/plan/PLAN.md`: ticked row V2 in Section 11 traceability matrix.
- **Full Gate Execution:**
  Command: `cmd.exe /c "cd miniproject && npm run lint && npm run typecheck && npm test && npm run build"`
  Real output:
  ```
  > miniproject@0.1.0 lint
  > eslint

  C:\Users\sujay\Downloads\miniproject_v2\miniproject\src\app\citizen\report\[id]\page.tsx
    119:20  warning  Using `<img>` could result in slower LCP and higher bandwidth. Consider using `<Image />` from `next/image` or a custom image loader to automatically optimize images. This may incur additional usage or cost from your provider. See: https://nextjs.org/docs/messages/no-img-element  @next/next/no-img-element

  C:\Users\sujay\Downloads\miniproject_v2\miniproject\src\app\citizen\report\page.tsx
    476:29  warning  Using `<img>` could result in slower LCP and higher bandwidth. Consider using `<Image />` from `next/image` or a custom image loader to automatically optimize images. This may incur additional usage or cost from your provider. See: https://nextjs.org/docs/messages/no-img-element  @next/next/no-img-element

  ✖ 2 problems (0 errors, 2 warnings)

  > miniproject@0.1.0 typecheck
  > tsc --noEmit

  > miniproject@0.1.0 test
  > vitest run

   RUN  v3.2.7 C:/Users/sujay/Downloads/miniproject_v2/miniproject

   ✓ tests/unit/points.test.ts (8 tests) 13ms
   ✓ tests/unit/config.test.ts (3 tests) 9ms
   ✓ tests/contract/storage.test.ts (6 tests) 17ms
   ✓ tests/unit/api-validation.test.ts (7 tests) 33ms
   ✓ tests/contract/geom-trigger.test.ts (1 test) 671ms
   ✓ tests/unit/device-key.test.ts (6 tests) 638ms
   ✓ tests/contract/health-aiqueue.test.ts (3 tests) 673ms
   ✓ tests/unit/nonce.test.ts (7 tests) 1074ms
   ✓ tests/contract/seed-auth.test.ts (6 tests) 1344ms
   ✓ tests/contract/merge.test.ts (5 tests) 2282ms

   Test Files  10 passed (10)
        Tests  52 passed (52)
     Duration  4.34s

  > miniproject@0.1.0 build
  > next build --webpack

  ▲ Next.js 16.2.4 (webpack)
  ✓ Compiled successfully in 13.6s
  ✓ Generating static pages using 15 workers (15/15) in 1290ms
  Route (app)
  ├ ƒ /api/evidence/nonce
  ```
- **Notes for Next Task:** Next task is T22 (Camera capture, GPS gate and signing). Will build `src/components/evidence/CaptureCamera.tsx`, `src/lib/evidence/sign.ts`, `src/lib/evidence/verify.ts`, with canonical JSON serialization, IEEE P1363 ECDSA verification on Node server, GPS accuracy <= 30m enforcement, and <= 50m pin drag constraint.

### T20 · Device signing keys · 2026-10-28
- **Goal:** Generate non-extractable ECDSA P-256 key pair on client with Web Crypto, store CryptoKey in IndexedDB via `idb`, export public key as JWK, register with server via `/api/evidence/device`.
- **Verified against docs/types:**
  - W3C Web Cryptography API: `SubtleCrypto.generateKey` with `{ name: 'ECDSA', namedCurve: 'P-256' }`, `extractable: false`, usages `['sign', 'verify']`. Export public key via `exportKey('jwk', keyPair.publicKey)`.
  - `idb` (v8.0.3): Structured cloning of `CryptoKey` in IndexedDB object store `device_keys`.
  - Prisma 7 `DeviceKey` model in schema: `id`, `userId`, `publicJwk`, `createdAt`, `revokedAt`.
- **Changed:**
  - Created `src/lib/evidence/deviceKey.ts`: client-side key generation, IndexedDB storage with `idb`, public JWK export, server registration.
  - Created `src/app/api/evidence/device/route.ts`: POST endpoint validates ECDSA P-256 public JWK, ensures authentication via `withAuth`, deduplicates/reuses existing key if identical coordinates, persists `DeviceKey` row in Prisma; GET endpoint lists user's active device keys.
  - Created `src/components/evidence/DeviceKeyInitializer.tsx`: client component to auto-initialize and register device keys when session is active.
  - Modified `src/components/providers.tsx`: mounted `DeviceKeyInitializer` inside `SessionProvider`.
  - Created `tests/unit/device-key.test.ts`: verified 401 unauthenticated, 400 invalid JWK, 201 valid registration, 200 key reuse, GET registered keys, and Web Crypto non-extractable private key properties.
- **Full Gate Execution:**
  Command: `cmd.exe /c "cd miniproject && npm run lint && npm run typecheck && npm test && npm run build"`
  Real output:
  ```
  > miniproject@0.1.0 lint
  > eslint

  C:\Users\sujay\Downloads\miniproject_v2\miniproject\src\app\citizen\report\[id]\page.tsx
    119:20  warning  Using `<img>` could result in slower LCP and higher bandwidth. Consider using `<Image />` from `next/image` or a custom image loader to automatically optimize images. This may incur additional usage or cost from your provider. See: https://nextjs.org/docs/messages/no-img-element  @next/next/no-img-element

  C:\Users\sujay\Downloads\miniproject_v2\miniproject\src\app\citizen\report\page.tsx
    476:29  warning  Using `<img>` could result in slower LCP and higher bandwidth. Consider using `<Image />` from `next/image` or a custom image loader to automatically optimize images. This may incur additional usage or cost from your provider. See: https://nextjs.org/docs/messages/no-img-element  @next/next/no-img-element

  ✖ 2 problems (0 errors, 2 warnings)

  > miniproject@0.1.0 typecheck
  > tsc --noEmit

  > miniproject@0.1.0 test
  > vitest run

   RUN  v3.2.7 C:/Users/sujay/Downloads/miniproject_v2/miniproject

   ✓ tests/unit/points.test.ts (8 tests) 12ms
   ✓ tests/unit/config.test.ts (3 tests) 8ms
   ✓ tests/contract/storage.test.ts (6 tests) 16ms
   ✓ tests/unit/api-validation.test.ts (7 tests) 34ms
   ✓ tests/contract/geom-trigger.test.ts (1 test) 743ms
   ✓ tests/contract/health-aiqueue.test.ts (3 tests) 707ms
   ✓ tests/unit/device-key.test.ts (6 tests) 647ms
   ✓ tests/contract/seed-auth.test.ts (6 tests) 1286ms
   ✓ tests/contract/merge.test.ts (5 tests) 2068ms

   Test Files  9 passed (9)
        Tests  45 passed (45)
     Duration  4.12s

  > miniproject@0.1.0 build
  > next build --webpack

  ▲ Next.js 16.2.4 (webpack)
  ✓ Compiled successfully in 17.0s
  ✓ Generating static pages using 15 workers (14/14) in 1114ms
  Route (app)
  ├ ƒ /api/evidence/device
  ```
- **Notes for Next Task:** Next task is T21 (Capture nonce). Will create `src/app/api/evidence/nonce/route.ts` and `src/lib/evidence/nonce.ts`, issuing 128-bit single-use cryptographically random nonces with 5-minute validity stored in `EvidenceNonce`.

### T19 · Stabilisation before Phase 2 · 2026-10-27
- **Goal:** Green gate (`npm run lint && npm run typecheck && npm test && npm run build`), no disabled rules, no ts-ignore/eslint-disable, no skipped tests.
- **Changed:**
  - Deleted legacy scripts in `scripts/`: `assign-dept.js`, `assign-dept.ts`, `delete-report.mjs`.
  - Deleted obsolete action routes in `src/app/api/reports/[id]/`: `confirm/route.ts`, `assign/route.ts`, `status/route.ts`, `resolve/route.ts` (replaced in T25; legacy callers replaced by v2 state machine actions; recorded in `DECISIONS.md`).
  - Adapted API routes and UI pages to v2 schema: `src/app/api/auth/register/route.ts`, `src/app/api/personnels/route.ts`, `src/app/api/personnels/[id]/route.ts`, `src/app/api/reports/[id]/comments/route.ts`, `src/app/api/reports/nearby/route.ts`, `src/app/api/stats/route.ts`, `src/app/authority/layout.tsx`, `src/app/authority/dashboard/page.tsx`, `src/app/authority/map/page.tsx`, `src/app/authority/personnels/page.tsx`, `src/app/authority/status/page.tsx`, `src/app/authority/tickets/page.tsx`, `src/app/citizen/dashboard/page.tsx`, `src/app/citizen/extra/page.tsx`, `src/app/citizen/profile/page.tsx`, `src/app/citizen/report/[id]/page.tsx`, `src/components/citizen/ActiveReports.tsx`, `src/components/citizen/StatusTracker.tsx`.
  - Fixed lint errors, removed `any` casts, eliminated cascading `setState` effects and impure `Date.now` renders: `login/page.tsx`, `citizen/layout.tsx`, `citizen/map/page.tsx`, `citizen/report/page.tsx`, `AuthorityMap.tsx`, `MapDashboardWrapper.tsx`, `IssuesNearMeMap.tsx`, `MapWrapper.tsx`, `ReportPickerMap.tsx`, `ReputationCard.tsx`, `useOfflineSync.ts`, `useReports.ts`, `RefreshButton.tsx`, `CommandSearch.tsx`, `KPICard.tsx`, `PersonnelManager.tsx`.
  - Tests database safety: ensured `tests/contract/geom-trigger.test.ts` marks created issue with `isSeed: true` and deletes in `afterAll`; ensured `tests/contract/health-aiqueue.test.ts` uses `test_target_*` prefix and deletes in `afterAll`.
  - Warning count: 2 warnings (`@next/next/no-img-element` in `citizen/report/[id]/page.tsx` and `citizen/report/page.tsx` for dynamic user photo previews). 0 errors.
  - Build configuration: configured `package.json` `"build": "next build --webpack"` and converted `src/app/layout.tsx` viewport to Next.js `Viewport` export.
- **Full Gate Execution 1:**
  Command: `cmd.exe /c "cd miniproject && npm run lint && npm run typecheck && npm test && npm run build"`
  Real output:
  ```
  > miniproject@0.1.0 lint
  > eslint

  C:\Users\sujay\Downloads\miniproject_v2\miniproject\src\app\citizen\report\[id]\page.tsx
    119:20  warning  Using `<img>` could result in slower LCP and higher bandwidth. Consider using `<Image />` from `next/image` or a custom image loader to automatically optimize images. This may incur additional usage or cost from your provider. See: https://nextjs.org/docs/messages/no-img-element  @next/next/no-img-element

  C:\Users\sujay\Downloads\miniproject_v2\miniproject\src\app\citizen\report\page.tsx
    469:29  warning  Using `<img>` could result in slower LCP and higher bandwidth. Consider using `<Image />` from `next/image` or a custom image loader to automatically optimize images. This may incur additional usage or cost from your provider. See: https://nextjs.org/docs/messages/no-img-element  @next/next/no-img-element

  ✖ 2 problems (0 errors, 2 warnings)

  > miniproject@0.1.0 typecheck
  > tsc --noEmit

  > miniproject@0.1.0 test
  > vitest run

   RUN  v3.2.7 C:/Users/sujay/Downloads/miniproject_v2/miniproject

   ✓ tests/unit/points.test.ts (8 tests) 11ms
   ✓ tests/unit/config.test.ts (3 tests) 7ms
   ✓ tests/contract/storage.test.ts (6 tests) 15ms
   ✓ tests/unit/api-validation.test.ts (7 tests) 28ms
   ✓ tests/contract/geom-trigger.test.ts (1 test) 686ms
     ✓ T10 PostGIS Trigger Acceptance Test > inserts an Issue via Prisma and reads back a non-null geom filled by trigger  633ms
   ✓ tests/contract/health-aiqueue.test.ts (3 tests) 838ms
     ✓ T17 Contract Test: Async AI Queue & Health Check > GET /api/health returns valid JSON with health fields  581ms
   ✓ tests/contract/seed-auth.test.ts (6 tests) 1400ms
     ✓ T11 Acceptance: Seed and Authentication > all 7 U7 agencies are present in the database  661ms
   ✓ tests/contract/merge.test.ts (5 tests) 1888ms

   Test Files  8 passed (8)
        Tests  39 passed (39)
     Start at  23:30:35
     Duration  3.77s (transform 1.22s, setup 0ms, collect 5.82s, tests 4.87s, environment 3ms, prepare 2.42s)

  > miniproject@0.1.0 build
  > next build --webpack

  ▲ Next.js 16.2.4 (webpack)
  - Environments: .env.local, .env

    Creating an optimized production build ...
  ✓ Compiled successfully in 11.9s
    Running TypeScript ...
    Finished TypeScript in 15.0s ...
    Collecting page data using 15 workers ...
    Generating static pages using 15 workers (0/13) ...
    Generating static pages using 15 workers (3/13) 
    Generating static pages using 15 workers (6/13) 
    Generating static pages using 15 workers (9/13) 
  ✓ Generating static pages using 15 workers (13/13) in 1057ms
    Finalizing page optimization ...
    Collecting build traces ...

  Route (app)
  ┌ ○ /
  ├ ○ /_not-found
  ├ ƒ /api/auth/[...nextauth]
  ├ ƒ /api/auth/register
  ├ ƒ /api/health
  ├ ƒ /api/personnels
  ├ ƒ /api/personnels/[id]
  ├ ƒ /api/reports
  ├ ƒ /api/reports/[id]/comments
  ├ ƒ /api/reports/authority
  ├ ƒ /api/reports/nearby
  ├ ƒ /api/stats
  ├ ƒ /authority/dashboard
  ├ ƒ /authority/map
  ├ ƒ /authority/personnels
  ├ ƒ /authority/status
  ├ ƒ /authority/tickets
  ├ ƒ /citizen/dashboard
  ├ ƒ /citizen/extra
  ├ ƒ /citizen/map
  ├ ƒ /citizen/profile
  ├ ƒ /citizen/report
  ├ ƒ /citizen/report/[id]
  └ ○ /login

  ○  (Static)   prerendered as static content
  ƒ  (Dynamic)  server-rendered on demand
  ```

- **Full Gate Execution 2:**
  Command: `cmd.exe /c "cd miniproject && npm run lint && npm run typecheck && npm test && npm run build"`
  Real output:
  ```
  > miniproject@0.1.0 lint
  > eslint

  C:\Users\sujay\Downloads\miniproject_v2\miniproject\src\app\citizen\report\[id]\page.tsx
    119:20  warning  Using `<img>` could result in slower LCP and higher bandwidth. Consider using `<Image />` from `next/image` or a custom image loader to automatically optimize images. This may incur additional usage or cost from your provider. See: https://nextjs.org/docs/messages/no-img-element  @next/next/no-img-element

  C:\Users\sujay\Downloads\miniproject_v2\miniproject\src\app\citizen\report\page.tsx
    469:29  warning  Using `<img>` could result in slower LCP and higher bandwidth. Consider using `<Image />` from `next/image` or a custom image loader to automatically optimize images. This may incur additional usage or cost from your provider. See: https://nextjs.org/docs/messages/no-img-element  @next/next/no-img-element

  ✖ 2 problems (0 errors, 2 warnings)

  > miniproject@0.1.0 typecheck
  > tsc --noEmit

  > miniproject@0.1.0 test
  > vitest run

   RUN  v3.2.7 C:/Users/sujay/Downloads/miniproject_v2/miniproject

   ✓ tests/unit/points.test.ts (8 tests) 12ms
   ✓ tests/unit/config.test.ts (3 tests) 8ms
   ✓ tests/contract/storage.test.ts (6 tests) 15ms
   ✓ tests/unit/api-validation.test.ts (7 tests) 35ms
   ✓ tests/contract/geom-trigger.test.ts (1 test) 519ms
     ✓ T10 PostGIS Trigger Acceptance Test > inserts an Issue via Prisma and reads back a non-null geom filled by trigger  472ms
   ✓ tests/contract/health-aiqueue.test.ts (3 tests) 579ms
     ✓ T17 Contract Test: Async AI Queue & Health Check > GET /api/health returns valid JSON with health fields  331ms
   ✓ tests/contract/seed-auth.test.ts (6 tests) 1174ms
     ✓ T11 Acceptance: Seed and Authentication > all 7 U7 agencies are present in the database  389ms
   ✓ tests/contract/merge.test.ts (5 tests) 2261ms
     ✓ T14 Contract Test: Spatial Deduplication & Merge > creates base issue at reference point  321ms

   Test Files  8 passed (8)
        Tests  39 passed (39)
     Start at  23:32:15
     Duration  4.11s (transform 1.05s, setup 0ms, collect 5.99s, tests 4.60s, environment 3ms, prepare 3.06s)

  > miniproject@0.1.0 build
  > next build --webpack

  ▲ Next.js 16.2.4 (webpack)
  - Environments: .env.local, .env

    Creating an optimized production build ...
  ✓ Compiled successfully in 8.6s
    Running TypeScript ...
    Finished TypeScript in 15.0s ...
    Collecting page data using 15 workers ...
    Generating static pages using 15 workers (0/13) ...
    Generating static pages using 15 workers (3/13) 
    Generating static pages using 15 workers (6/13) 
    Generating static pages using 15 workers (9/13) 
  ✓ Generating static pages using 15 workers (13/13) in 763ms
    Finalizing page optimization ...
    Collecting build traces ...

  Route (app)
  ┌ ○ /
  ├ ○ /_not-found
  ├ ƒ /api/auth/[...nextauth]
  ├ ƒ /api/auth/register
  ├ ƒ /api/health
  ├ ƒ /api/personnels
  ├ ƒ /api/personnels/[id]
  ├ ƒ /api/reports
  ├ ƒ /api/reports/[id]/comments
  ├ ƒ /api/reports/authority
  ├ ƒ /api/reports/nearby
  ├ ƒ /api/stats
  ├ ƒ /authority/dashboard
  ├ ƒ /authority/map
  ├ ƒ /authority/personnels
  ├ ƒ /authority/status
  ├ ƒ /authority/tickets
  ├ ƒ /citizen/dashboard
  ├ ƒ /citizen/extra
  ├ ƒ /citizen/map
  ├ ƒ /citizen/profile
  ├ ƒ /citizen/report
  ├ ƒ /citizen/report/[id]
  └ ○ /login

  ○  (Static)   prerendered as static content
  ƒ  (Dynamic)  server-rendered on demand
  ```

### Audit after Phase 1 · 2026-10-27
- **Full Gate Execution:**
  Command executed: `npm run lint && npm run typecheck && npm test && npm run build`
  Real output:
  ```
  > miniproject@0.1.0 lint
  > eslint

  C:\Users\sujay\Downloads\miniproject_v2\miniproject\scripts\assign-dept.js
    1:26  error  A `require()` style import is forbidden  @typescript-eslint/no-require-imports

  C:\Users\sujay\Downloads\miniproject_v2\miniproject\src\app\(auth)\login\page.tsx
      4:18  warning  'AnimatePresence' is defined but never used     @typescript-eslint/no-unused-vars
      7:10  warning  'Loader2' is defined but never used             @typescript-eslint/no-unused-vars
      7:32  warning  'CheckCircle2' is defined but never used        @typescript-eslint/no-unused-vars
      7:46  warning  'Shield' is defined but never used              @typescript-eslint/no-unused-vars
      7:84  warning  'Sparkles' is defined but never used            @typescript-eslint/no-unused-vars
      8:35  warning  'SMOOTH' is defined but never used              @typescript-eslint/no-unused-vars
     29:10  error    Unexpected any. Specify a different type        @typescript-eslint/no-explicit-any
     86:9   warning  'isCitizen' is assigned a value but never used  @typescript-eslint/no-unused-vars
    126:19  error    Unexpected any. Specify a different type        @typescript-eslint/no-explicit-any

  [...126 problems: 71 errors, 55 warnings across legacy v1 UI pages, legacy routes, and legacy scripts...]
  ```
  - Gate status breakdown:
    - `npm run lint`: Fails on legacy v1 files not yet refactored (71 errors, 55 warnings). All files written/modified in Phase 1 pass with 0 lint errors.
    - `npm run typecheck`: Fails on legacy v1 UI components and endpoints referencing deprecated schema v1 fields (`departmentId`, `report.citizen`, `report.status`). All Phase 1 modules pass typecheck cleanly.
    - `npm test`: PASSES completely (8/8 test files passed, 39/39 tests passed).
    - `npm run build`: Turbopack compiles successfully (`✓ Compiled successfully in 6.6s`); halts at Next.js type check step on the legacy files.
- **Failures Fixed in Proper Commits:**
  1. Commit `cf5a0a9` (`fix(scripts): type catch error as unknown in db-check.ts`): Replaced `catch (err: any)` with `catch (err: unknown)` and `err instanceof Error` narrowing in `scripts/db-check.ts`.
  2. Commit `49ab66c` (`fix(build): configure turbopack.root to project directory in next.config.ts`): Set `turbopack.root = path.resolve(__dirname)` in `next.config.ts` to prevent Turbopack from inferring root directory as `C:\Users\sujay\` and panicking on `C:\Users\sujay\node_modules`.
- **ESLint Config Audit:**
  Diff for `eslint.config.mjs` since T10 (`dc32056`):
  ```diff
  --- a/eslint.config.mjs
  +++ b/eslint.config.mjs
  @@ -12,6 +12,9 @@ const eslintConfig = defineConfig([
       "out/**",
       "build/**",
       "next-env.d.ts",
  +    ".agent/**",
  +    ".agents/**",
  +    "tests/e2e/legacy/**",
     ]),
   ]);
  ```
  No rules were disabled or relaxed. Only ignore patterns were added for vendor agent rules/skills and legacy archived E2E specs.
- **Auth Audit (`src/lib/auth.ts`):**
  Diff since T10 (`dc32056`):
  ```diff
  --- a/src/lib/auth.ts
  +++ b/src/lib/auth.ts
  @@ -38,15 +38,15 @@ export const authOptions: NextAuthOptions = {
     callbacks: {
       async jwt({ token, user }) {
         if (user) {
  -        token.role = (user as { id: string; role: string }).role;
  +        token.role = user.role;
           token.id = user.id;
         }
         return token;
       },
       async session({ session, token }) {
         if (session.user) {
  -        (session.user as { id?: string; role?: string }).role = token.role as string;
  -        (session.user as { id?: string; role?: string }).id = token.id as string;
  +        session.user.role = token.role;
  +        session.user.id = token.id;
         }
         return session;
       },
  ```
  Plain words: Replaced manual type assertions `as { id: string; role: string }` with typed properties enabled by `src/types/next-auth.d.ts`. Verified that `bcrypt.compare` continues to validate password hashes on login, and 0 `console.log` calls exist (no tokens or sessions logged).
- **PLAN.md Section 11 Verification:**
  - Audited all rows in Section 11.
  - Verified that features with incomplete tasks remain un-ticked (e.g., `A1` requires T11 and T26; it is `[ ]`).
  - Current ticked rows in Section 11:
    - `[x] F2`: Input validation, no fake GPS (Task: T12)
    - `[x] F3`: Votes replaced by confirmations (Tasks: T10, T15)
    - `[x] F6`: Merge duplicates (Task: T14)
    - `[x] F8`: AI off the request path (Task: T17)
    - `[x] F9`: XP for verifying (Task: T15)
- **T04 DB Check Confirmation:**
  Confirmed T04 entry in `PROGRESS.md` contains the real output of `npx tsx scripts/db-check.ts`:
  `PostGIS version: 3.3 USE_GEOS=1 USE_PROJ=1 USE_STATS=1`.
- **Status:** Phase 1 audit complete. Ready for Phase 2 review. T20 not started.

### T17 · Async AI queue; remove Ollama and SSE · 2026-10-27
- Changed: deleted `src/lib/ollama.ts`, deleted `src/app/api/events/route.ts`, `src/components/SyncProvider.tsx`, `src/lib/jobs/aiQueue.ts`, `src/app/api/health/route.ts`, `src/app/api/reports/route.ts`, `src/lib/env.ts`, `tests/contract/health-aiqueue.test.ts`, `docs/plan/PLAN.md`
- Verified against docs: PLAN.md Section 10 T17 rules, `AiJob` queuing mechanism, 15s SWR/interval polling in `SyncProvider`, `health` endpoint contract returning db, storage, and key readiness
- Checks run:
  ```
  [git grep -n -i "ollama" src/]
  Exit code 1 (no occurrences found in src/)

  [npm test]
  ✓ tests/unit/points.test.ts (8 tests)
  ✓ tests/unit/config.test.ts (3 tests)
  ✓ tests/contract/storage.test.ts (6 tests)
  ✓ tests/unit/api-validation.test.ts (7 tests)
  ✓ tests/contract/health-aiqueue.test.ts (3 tests)
    ✓ GET /api/health returns valid JSON with health fields
    ✓ enqueues and dequeues AiJob rows asynchronously off the request path
    ✓ acceptance: no SSE route exists under api/events
  ✓ tests/contract/seed-auth.test.ts (6 tests)
  ✓ tests/contract/geom-trigger.test.ts (1 test)
  ✓ tests/contract/merge.test.ts (5 tests)
  Test Files: 8 passed (8)
  Tests: 39 passed (39)

  [npx eslint src/lib/jobs/aiQueue.ts src/app/api/health/route.ts src/app/api/reports/route.ts src/components/SyncProvider.tsx tests/contract/health-aiqueue.test.ts]
  Clean exit code 0
  ```
- Feature rows ticked: F8 (AI off the request path)
- Notes for the next task: Proceeding to Phase 2, T20 (Device signing keys).

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
