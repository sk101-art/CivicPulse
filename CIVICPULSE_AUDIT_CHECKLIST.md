# CivicPulse Audit Checklist

Branch: `ui-redesign`

This checklist tracks only observed findings and completed verification. Update counts after each full run.

## Previously completed and verified

- [x] Citizen capture requires live camera evidence and a current GPS fix; sample-photo and gallery-signing paths removed.
- [x] Issue detail and authority views show missing evidence instead of substituting a sample photo.
- [x] Authority status changes use the lifecycle actions; direct status override removed.
- [x] Warranty reopen requires an authority reason.
- [x] Authority all-ward issue feed, legacy null-category handling, and mobile drawer interaction fixed.
- [x] Seed records are labelled in claim-gap and authority issue detail views.
- [x] Removed fictional sample reports, leaderboard names, reputation, verification counts, and fixed resolved totals from citizen profile fallback states.
- [x] Briefing KPI totals now come from database counts instead of a 500-issue detail window.
- [x] Citizens assigned an open repair audit see only original evidence and a neutral status; claimed evidence and action history are withheld.
- [x] Citizens are told when a report was merged into an existing issue.
- [x] Desk analyst no longer treats every mention of rain as a weather forecast request.
- [x] Desk analyst rules fallback no longer invents seed issue IDs, ward counts, contractor rates, or repair-lifespan values when source context is absent.
- [x] `npm run typecheck` passed after the latest code changes.
- [x] Latest focused unit run: 43 tests passed across 4 files.
- [x] Mobile authority browser journey passed after the drawer portal change; citizen camera browser check passed with fake camera/GPS.

## Remaining work

- [x] Reproduced the full unit/contract suite and saved exact results to `%TEMP%/civicpulse-vitest.json` (temporary, outside the repository).
- [x] Triaged the original 15 failures; separated stale expectations, test setup, performance-sensitive integration cases, and product defects.
- [x] Fixed the confirmed product defects and updated only assertions contradicted by the current implemented behavior.
- [x] Re-run the full unit/contract suite: 504 passed, 0 failed across 241 suites.
- [x] Reproduce full lint and compare changed files; record remaining findings below.
- [x] Clear all lint errors in changed citizen/authority files and the wider repository.
- [x] Re-run typecheck after final edits.
- [x] Re-run browser journeys: mobile authority desk, mobile citizen profile, and logged-out public issue page all passed.
- [x] Check whitespace and branch (`ui-redesign`); verification reports were written outside the repository.

## Final verification

- Full test run (latest): 536 passed, 0 failed, 97 suites.
- TypeScript typecheck passed.
- Browser journeys passed: 3 of 3 selected flows. Earlier camera capture E2E also passed with fake camera and GPS.
- `git diff --check` passed; branch is `ui-redesign`.
- Full lint passes with 0 errors and 80 warnings. The remaining warnings are primarily unused imports/variables in legacy files, plus a few accessibility, image optimization, and hook dependency warnings. They are not lint errors; the exact output is from the latest full `npm run lint` run.
- `npm run typecheck` passed after the lint cleanup.
- Exact machine-readable reports are outside the repository at `%TEMP%/civicpulse-vitest-final.json` and `%TEMP%/civicpulse-eslint-final.json`.

## Live data follow-up (2026-11-28)

- [x] Read-only query of the configured database found 34,944 weather rows, 1,178 non-seed traffic samples, 33 non-seed issues, and 37 labelled seed issues.
- [x] Weather rows were last fetched at 2026-11-27 17:54 UTC; latest non-seed traffic sample was 2026-11-22 03:30 UTC. A traffic profile rebuilt on 2026-11-27 is not evidence of a fresh raw observation.
- [x] Confirmed non-empty local credential entries by name only; no secret values were displayed. This does not verify production credentials.
- [x] GitHub Actions run 652 completed successfully on branch `v2`; the local work branch remains `ui-redesign`.
- [x] Removed fabricated citizen report cards and reputation/stat fallbacks; dashboard counts now use complete database counts and distinguish unavailable data from real zeroes.
- [x] Added authority feed freshness by tracked location, plus scheduled-job outcome recording and a feed source/status reference document.
- [x] Follow-up checks: `npx prisma validate`, `npm run typecheck`, full lint (0 errors, 80 warnings), and 34 focused tests passed.
- [x] Apply scheduled-job telemetry migration `20261128042000_scheduled_job_run_tracking` to the configured public database; `prisma migrate status` reports up-to-date.
- [ ] Deploy `ui-redesign` to production; PR #1 targets `v2`. The latest CI failure was the workflow omitting required `DATABASE_URL_TEST`; the workflow now maps isolated database secrets and is awaiting rerun.
- [ ] Confirm traffic and weather freshness after deployment using persisted job-run results and per-location timestamps.
- [ ] Add alerting for repeated failed/partial jobs or stale feeds.

## No-fabricated-data follow-up (2026-11-28)

- [x] Citizen report lists use actual attached report evidence when present and a neutral icon otherwise; category stock photos are no longer presented as evidence.
- [x] Citizen profile and ward KPI failures no longer render as zero; unavailable counts use a dash and explain the failure.
- [x] Ward citizen and authority queues distinguish failed reads from genuine empty results and keep retry messaging visible.
- [x] Ward intelligence and citizen issue maps do not center missing-coordinate wards on a hard-coded Bengaluru point.
- [x] The citizen report map does not show a guessed city pin when coordinates are absent.
- [x] Route planning does not invent a Bengaluru depot; calculation requires a valid ward center, GPS start, or first-stop mode.
- [x] Repair-window displays no longer invent missing recommendation scores.
- [x] Latest `npm run typecheck` passed; focused tests passed (35 tests across 5 files); full `npm run lint` passed with 0 errors and 60 existing warnings. The edited citizen/authority files pass focused ESLint with no warnings.
- [x] Apply the scheduled-job telemetry migration to the configured public database.
- [ ] Deploy the `ui-redesign` feed-status UI and confirm provider updates in the deployed environment.
- [ ] Add production stale-feed alerts and validate provider credentials/quotas in the deployed environment.

## Deployment status (2026-11-28)

- [x] `ui-redesign` pushed to GitHub at `9105b2f` with production build, typecheck, lint error check, and 536/536 local tests passing.
- [x] PR #1 opened from `ui-redesign` to `v2`: https://github.com/sk101-art/CivicPulse/pull/1
- [ ] GitHub CI rerun and Vercel production deployment are pending; do not describe production data as live until both complete and feed timestamps are verified there.
- [ ] Trigger/observe weather and traffic refresh after deployment, then verify provider-backed sample timestamps and persisted job outcomes.

