# CivicPulse operations and jury runbook

## Release gate

Deploy only a commit with passing typecheck, lint, tests and build. Apply migrations to the intended database before switching traffic. Confirm Vercel production branch and domain point to that commit; a successful preview is not proof of production deployment.

The new migration is `20261128120000_shared_login_protection`. Until applied, login protection fails closed rather than silently reverting to per-instance counters.

## Feed operations

Run `node scripts/reliability-snapshot.mjs` for read-only aggregate evidence from the configured public database. It emits no citizen identities, coordinates or secrets. This verifies that database only; independently confirm Vercel uses it.

`GET /api/health/feeds` requires the existing x-job-secret header and returns 503 for stale source observations or unhealthy latest jobs. Scheduled workflows call it, causing a visible Actions failure instead of a misleading successful run. Configure GitHub notification delivery in the project owner's account to receive those failures; delivery has not been verified.

Weather is a forecast, not a rain sensor. Traffic samples are provider observations. Historical traffic and estimated planning baselines must never be called live. Weather is delayed after 3h, traffic after 4h; per-location coverage remains visible in the desk dashboard. These are freshness thresholds, not guarantees that every location has data.

The application monthly TomTom budget defaults to 20,000 via TOMTOM_MONTHLY_CALL_CAP; this is not a statement about the account plan. Verify the provider allowance before changing it. Do not reset API quotas or seed demo data to make health indicators green. If a job processes zero rows, inspect provider and eligibility results. Preserve the actual reading time.

## Account recovery and staff departure

Signed-in users can change passwords at `/account/security`. Current password and request origin are checked. Existing sessions are rejected on their next server check after a password change, deactivation or role change.

Forgotten-password recovery is administrator-assisted. Independently verify account ownership through the institution's established identity process. Supply RECOVERY_EMAIL and a temporary RECOVERY_PASSWORD through a secure process environment, then run `npx tsx scripts/recover-account.ts`. Never put passwords in command-line arguments or commit them. Ask the owner to change the temporary password immediately. For an isolated test account set SEED_TARGET=test. Automated email reset is not configured; never tell a user that a reset email was sent.

Deactivate departing staff (`User.isActive=false`) through an authenticated administrator process. Do not issue a replacement citizen account with authority permissions. Test rejection of the old session after the change.

## Database backup and recovery

A backup exists only when an actual provider backup or encrypted export has been verified. Confirm backup availability and retention in Supabase; this account's backup entitlement has not been checked.

Before a migration: identify the target project/schema, confirm a recoverable backup, and retain the previous deployment. Rehearse restoration into a separate database, apply migrations there, and run health/auth/report lifecycle checks. Compare aggregate counts and sample ledger links. Do not restore over the production database during a demo. Record measured recovery time and data-loss window; no recovery-time claims have been measured yet.

## Jury rehearsal and evidence

1. Show the exact deployed commit and data-source timestamps.
2. Use explicitly labelled test accounts/fixtures in the isolated test environment. Label the demonstration as a simulation of workflow, never a repair accomplished in the city.
3. On separate browser sessions/devices, submit signed camera evidence, review and assign it, claim the repair, then collect independent audit votes. Show that a claim alone is not a verified repair.
4. Wait for the bounded 30-second refresh (or refocus the page); verify citizen history, authority queue and map agree. Verify the denied-camera, offline, stale-feed and failed-upload paths.
5. Repeat on a narrow mobile viewport using keyboard navigation, labels, visible focus, status messages and reduced motion. Do not claim accessibility certification from these checks.
6. Record actual elapsed submission/assignment/refresh times and exact observed outcomes. Report sample size. No claim of reduced municipal response time is justified without a field comparison.

Deployment and provider integration are working only after these checks pass on the production domain. A green unit suite alone is insufficient.
