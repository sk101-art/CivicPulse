# Progress ledger
Current task: T28 · Public issue page

> Keys-later mode: see docs/plan/KEYS_LATER.md

## Blocked (needs Sujay)
- None

## Done

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
  - Deleted obsolete action routes in `src/app/api/reports/[id]/`: `confirm/route.ts`, `assign/route.ts`, `status/route.ts`, `resolve/route.ts` (replaced in T25; callers `ActiveIssuesList`, `StatusTimeline`, `StatusTracker` show "Coming in T25" toasts; recorded in `DECISIONS.md`).
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
