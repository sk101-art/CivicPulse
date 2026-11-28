# CivicPulse reliability checklist

Started 2026-11-28. Base: merged v2 (044bf142). Working branch: codex/civicpulse-reliability.
Status means verified evidence, not an assurance about untested production behavior.

| Order | Work | Status | Acceptance evidence |
| --- | --- | --- | --- |
| 1 | Remove invented analyst inputs and contractor names; preserve unknowns and provenance | Implemented; focused tests passed | Missing vs measured-zero regression tests; CI full-suite verification pending |
| 2 | Verify deployment and feed freshness; expose meaningful health failures | Implemented monitor; production verification blocked | Weather refresh verified at 11:26 UTC; traffic blocked by monthly application budget (20,001 / 20,000); production job history unresolved |
| 3 | Refresh across separate browsers/devices; make status next steps clear | Verified in two browser sessions | Staff CONFIRM returned 200; separate citizen view updated to Confirmed with next step and demonstration label |
| 4 | Shared login protection, access revocation, recovery guidance and accessibility | Implemented; final checks pending | Atomic concurrency test passed; test migration applied; public migration pending; automated recovery email unavailable |
| 5 | Jury evidence and reproducible rehearsal | Runbook added; browser rehearsal partly verified | Cross-session status and mobile security form passed; field outcomes and restore drill unavailable |

## Verification log

- No changes deployed from this branch yet.
- Existing local CI changes were preserved in Git stash; their functional changes are already merged into v2.
- No fresh production verification claimed yet.

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

- Confirm actual TomTom plan allowance before changing the application cap. Current traffic cannot truthfully be called live while refresh is budget-blocked.
- Deploy this branch and apply its additive login-protection migration to the actual production database. Test-schema migration is already applied.
- Confirm production-domain release SHA and scheduled job history; /api/health now exposes release identity after deployment.
- Automated email recovery and notification delivery require a configured delivery service/account. The implemented recovery path is administrator-assisted; it does not promise an email or OTP.
- Verify provider backups and rehearse restoration into a separate database. No destructive restore was attempted, and no recovery-time guarantee is claimed.
