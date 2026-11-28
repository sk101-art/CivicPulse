# CivicPulse reliability checklist

Started 2026-11-28. Base: merged v2 (044bf142). Working branch: codex/civicpulse-reliability.
Status means verified evidence, not an assurance about untested production behavior.

Live release gate: [PR #2 checks](https://github.com/sk101-art/CivicPulse/pull/2/checks). The linked checks show the current commit result; the log below preserves earlier findings and their corrections.

| Order | Work | Status | Acceptance evidence |
| --- | --- | --- | --- |
| 1 | Remove invented analyst inputs and contractor names; preserve unknowns and provenance | Implemented; focused tests passed | Missing vs measured-zero regression tests passed; full-suite release gate is linked above |
| 2 | Verify deployment and feed freshness; expose meaningful health failures | Implemented monitor; production verification blocked | Weather and 32 traffic observations verified fresh; product quotas reconciled; automatic deployed refresh still pending |
| 3 | Refresh across separate browsers/devices; make status next steps clear | Verified in two browser sessions | Staff CONFIRM returned 200; separate citizen view updated to Confirmed with next step and demonstration label |
| 4 | Shared login protection, access revocation, recovery guidance and accessibility | Implemented; focused checks passed | Atomic concurrency test passed; test and public migration status verified; automated recovery email unavailable |
| 5 | Jury evidence and reproducible rehearsal | Runbook added; browser rehearsal partly verified | Cross-session status and mobile security form passed; field outcomes and restore drill unavailable |

## Verification log (implementation history)

- No changes deployed from this branch yet.
- Existing local CI changes were preserved in Git stash; their functional changes are already merged into v2.
- At the start of this work, fresh production readings had not yet been verified; later dated checks below supersede that initial state.

## Production evidence (2026-11-28)

- GitHub marks merged commit 044bf142 as deployed by Vercel; production-domain release identity still needs independent verification.
- Public health endpoint returned HTTP 200 and database Healthy.
- Authorized weather refresh reported 279 processed, 0 failed. Traffic refresh reported 0 processed. These HTTP results are not proof of a successful source refresh.
- Subsequent configured-public-database snapshot: weather 2026-11-28T11:26:18.271Z; traffic 2026-11-22T09:00:29.576Z; 33 non-seed issues, 37 seed issues, 0 non-seed verified fixes, no recorded job history. This discrepancy must be resolved before claiming production freshness.
- Login-protection migration applied successfully to schema=test only.
- Isolated test credentials re-seeded after the prior CI run had changed their password; seed-auth checks pass again.
- Typecheck passed after the recovery and monitoring additions.

## Updated verification

- Snapshot timestamps are parsed explicitly as UTC; earlier local-time interpretation was corrected.
- A real provider diagnostic returned TomTom HTTP 200, currentSpeed 28, freeFlowSpeed 28, confidence 1 at 2026-11-28T11:40:41Z. This is a single diagnostic observation, not evidence of sustained production refresh.
- The application monthly counter is 20,001 against 20,000. A manual refresh using normal app limits processed 0 and recorded 32 failures. No counter was reset. Provider allowance requested from the owner before raising the cap.
- New TOMTOM_MONTHLY_CALL_CAP configuration retains the 20,000 default. Exhaustion is now explicitly reported as a skipped budget-limited refresh.
- Independent sessions passed the staff-to-citizen status update check using an explicitly labelled isolated test fixture. Mobile account security form labels and recovery page checked; no browser runtime errors were observed in those journeys.
- Optimized Next build passed. Typecheck passed after source labels and allowance configuration; final timestamp guard recheck pending.
- Repository lint: 0 errors, 61 pre-existing warnings. New recovery, monitoring, refresh and regression-test files passed lint with 0 warnings.
- First full suite: 540 passed, 1 obsolete fallback-expectation assertion failed. That assertion now requires honest staff-review messaging.
- Second full suite while edits were still in progress: 547 passed, 1 budget-configuration test failed. Added a conservative default when the optional cap field is absent; the affected test now passes. The full frozen-source run will be verified by PR CI.
- Later focused checks: 42 tests passed, plus 25 fallback/profile tests, 14 traffic-budget tests and 44 combined final changed-area tests passed.

## External requirements still open

- TomTom allowance confirmed by owner dashboard and reconciled per product; no shared-cap increase is needed. Continue checking provider dashboard against local reservations.
- Deploy this branch and independently confirm the production database target. Login-protection migration status is now up-to-date on the configured public and test schemas.
- Confirm production-domain release SHA and scheduled job history; /api/health now exposes release identity after deployment.
- Automated email recovery and notification delivery require a configured delivery service/account. The implemented recovery path is administrator-assisted; it does not promise an email or OTP.
- Verify provider backups and rehearse restoration into a separate database. No destructive restore was attempted, and no recovery-time guarantee is claimed.

## TomTom dashboard reconciliation and live refresh

- The owner confirmed the free tier and supplied a provider-dashboard screenshot showing **separate** product allowances. The previous shared 20,001 counter was not proof that Traffic Flow was exhausted. That diagnosis is superseded.
- Dated, manually supplied November baselines were recorded separately: Routing 11,331/20,000; Traffic Flow 1,652/20,000; Incidents 608/2,500; Reverse Geocoding 53/20,000. These are dashboard snapshot figures, not live billing telemetry. The lower usage chart in the screenshot has its own custom date range; future reconciliation must use the current monthly summary.
- The old aggregate counter remains untouched. New outbound requests reserve product/day/month budgets atomically and exactly once. Unknown historical usage requires reconciliation instead of silently starting at zero.
- A real refresh using the corrected accounting processed **32** operational traffic locations with **0 failures**. Recorded SUCCEEDED at 2026-11-28T11:55:29Z, latest observation 2026-11-28T11:55:19Z. Weather latest fetched 2026-11-28T11:26:18Z.
- Five focused quota tests plus routing/flow/profile checks passed: **42 tests**, including concurrent monthly-cap enforcement and rollback when daily allowance is exhausted.
- Scheduled historic profiling now excludes demonstration issues to conserve real operational capacity. Production quota reset helpers are disabled.
- CI workflow YAML was parsed successfully after correcting a multiline curl command. Test migrations now use a validated session connection when the only supplied Supabase secret is a transaction-pool URL. Three URL/isolation regression tests passed.
- Public migration status reports no pending migrations. Automatic production deployment and its subsequent scheduled refresh still require verification after merge.

The earlier "20,000 shared quota exhausted" blocker is resolved by product accounting and reconciliation. The application caps have not been raised above the supplied product allowances.

- Production routing no longer emits synthetic route fixtures when its key is missing; those fixtures are restricted to isolated tests. An empty route response no longer claims a direct route was computed.

- Feed monitoring reports partial bounded batches explicitly; a partial batch with fresh readings and no failures is a warning, not a fabricated outage. Stale data and actual failures still return 503. Per-location completeness remains visible in the desk panel.

- Analyst numeric grounding now uses the complete actual input snapshot plus only output-schema constants. A regression check accepts the recorded score, its /100 denominator and zero adjustment while rejecting an invented score of 97; 12 analyst checks passed. This also removes a swallowed-error assertion from the earlier test.
