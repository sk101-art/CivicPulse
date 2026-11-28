# CivicPulse Live Data Status

Branch under review: `ui-redesign`
Database snapshot checked: 2026-11-28 03:46 UTC (read-only)

## Data sources already implemented

| Data | Provider/source | How it enters CivicPulse | Freshness meaning |
| --- | --- | --- | --- |
| Citizen reports and verified fixes | CivicPulse database | Created by citizen and authority workflows | Product records; these are not external API data |
| Weather | Open-Meteo forecast | Hourly scheduled job stores 72-hour hourly forecasts | `WeatherForecast.fetchedAt` is the time CivicPulse fetched the forecast; the forecast itself is predictive, not a live sensor reading |
| Current traffic samples | TomTom Flow | Scheduled sampler stores non-seed observations in `TrafficSample` | `TrafficSample.sampledAt` is the time of an actual stored provider observation |
| Traffic planning profile | TomTom historical routing, traffic samples, or estimated baseline | Background profile job refreshes 48 hourly weekday/weekend slots | A recent profile rebuild does not prove the underlying current traffic sample is recent |
| Road network | OpenStreetMap import | Imported static road/ward/POI data | Not a real-time feed; refresh it as a separate data-maintenance operation |

## Observed database snapshot

These are counts and timestamps only; no credentials or personal data were read.

| Table/source | Rows | Latest stored source time (UTC) | Assessment at snapshot time |
| --- | ---: | --- | --- |
| Weather forecasts | 34,944 | 2026-11-27 17:54:45 | About 9h 52m old; behind the hourly refresh schedule |
| Non-seed traffic samples | 1,178 | 2026-11-22 03:30:29 | About 6 days old; too old to present as current traffic |
| TomTom historic profile rows | 1,166 | 2026-11-20 21:49:57 | Historical planning data |
| Live-sample profile rows | 230 | 2026-11-27 17:19:40 | Recently rebuilt, but based on stored samples; not proof of current conditions |
| Estimated profile rows | 812 | 2026-11-27 17:19:40 | Estimated fallback data; must remain labelled estimated |

The configured database had 33 non-seed issues and 37 seed issues at this snapshot. Seed records must remain visibly labelled and excluded from any claim about real civic activity.

## Scheduler and credentials

- `.env.local` has non-empty entries for TomTom, Supabase, and `JOB_SECRET`; values were not read into output. Key presence alone does not prove that a credential is valid or that the deployed app has the same value.
- The repo has GitHub Actions schedules for weather (hourly), traffic sampling (every two hours), traffic profile refresh (every two hours), and repair-window refresh (every two hours).
- The latest observed scheduled workflow run was successful on **`v2`**, not `ui-redesign`: [workflow run 652](https://github.com/sk101-art/CivicPulse/actions/runs/46104245368). A successful HTTP request does not by itself prove the provider returned fresh data or that a job processed rows. This branch adds per-feed `processed`, `failed`, and last-run persistence; the active `v2` deployment does not have that code yet.
- The dashboard now displays feed timestamps from the database, marking weather delayed after 3 hours and raw traffic delayed after 4 hours. A delayed status indicates stale stored data, not a confirmed provider outage.

## Remaining data operations work

- [x] Add `ScheduledJobRun` tracking for start/end, processed/failed counts, skips, partial runs, duration, and sanitized summary; the authority feed panel reads the latest weather, traffic-sample, and traffic-profile runs.
- [ ] Apply migration `20261128042000_scheduled_job_run_tracking` to the intended database before deploying this branch. The existing database snapshot predates this table, so job history is not populated until the migration is applied.
- [ ] Alert when a scheduled feed is stale or has repeated failures; do not treat HTTP 200 as a healthy data refresh.
- [ ] Confirm the production deployment has valid TomTom and job credentials and targets the intended database. Local key presence is not production verification.
- [ ] Deploy the `ui-redesign` feed-status UI and dashboard data-truth fixes; scheduled jobs currently run from `v2`.
- [ ] Decide a traffic freshness contract the product can meet. If actual observations are not recent enough, show “last observed …” and use a clearly labelled historical/estimated planning profile rather than “live.”
- [ ] Decide which public data can be shown without exposing exact citizen coordinates or identity; aggregate to ward/area where appropriate.

## UI changes on `ui-redesign`

- Citizen dashboard counts now come from database counts; an unavailable query shows dashes and an explanatory message, and an empty account shows real zeroes rather than demo reports.
- “Resolved” now counts verified fixes only. Repairs awaiting verification are not included as resolved.
- Authority dashboard includes a live-feed status section for forecast fetches and raw traffic observations, with provider attribution and separate traffic-profile freshness wording.
- Authority dashboard freshness is calculated per tracked weather point and traffic location, and shows the latest persisted job result when the telemetry migration is installed.
- Targeted verification: typecheck passed; 34 tests passed across job-route and traffic suites; full lint passed with 0 errors and 80 warnings.

## Jury presentation data integrity

- Citizen activity lists show only evidence actually attached to a report. Missing photos use a neutral icon instead of category stock imagery.
- Profile and ward telemetry show unavailable states when their queries fail, so a database error cannot be mistaken for zero civic activity.
- Citizen/authority ward maps do not place missing-coordinate wards at a guessed Bengaluru center. Route planning refuses to calculate from an invented depot.
- Repair-window scores appear only when supplied by the underlying recommendation data.
- These safeguards keep the interface truthful, but cannot create provider availability. When a source is unavailable, the screen says so; the deployed `v2` workflow and pending migration still block proving fresh live weather/traffic on the jury deployment.
- Latest follow-up checks: typecheck passed; 35 focused tests passed across 5 files; full lint passed with 0 errors and 60 repository warnings. Focused ESLint for the edited citizen/authority files reports no warnings.
