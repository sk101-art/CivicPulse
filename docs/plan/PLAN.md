# CivicPulse v2 — Implementation Plan for an AI Coding Agent

**Repo:** github.com/sk101-art/CivicPulse (analysed at commit `d6813ae`) · **Owner:** Sujay K · **Version:** 1.0 · 23 Oct 2026

**Product in one line:** CivicPulse is a road truth ledger. It doesn't just take complaints; it checks whether fixes actually happened, prices each defect by the people it affects, and keeps a public history for every road.

---

## 0. How to use this document

**For Sujay (the human):**

1. Copy this plan into the repo as `docs/plan/PLAN.md` (the Markdown copy, not the PDF). AI agents read Markdown reliably; PDFs they often cannot open or they skim.
2. Copy `RULES.md` into `.agents/rules/civicpulse.md`. Antigravity loads workspace rules from `.agents/rules/` (the older `.agent/rules/` also works), and each rules file must stay under 12,000 characters.
3. Create the accounts and keys in Section 7 and fill `.env.local` yourself. Never paste keys into the agent chat.
4. Paste the master prompt (separate file) into Antigravity's Agent Manager. Work one phase per conversation. The progress ledger (Section 12) carries memory between conversations.
5. Review at every gate (Section 9). Do not let the agent run past a gate without your check.

**For the agent:** read Sections 1–9 fully before touching code. Then execute task cards (Section 10) **one at a time, in the order of Section 9**, recording evidence in `docs/agent/PROGRESS.md`. Section 11 is the checklist that proves nothing was missed.

---

## 1. Mission, scope and definition of done

**Mission:** turn the existing reporting app into a verified, prioritised, history-keeping civic platform, as a **web app only** (installable PWA). No native app, no IoT or sensor-based features.

**In scope:** the 57 features listed in the traceability matrix (Section 11): Foundation (F), Authority desk (A), Verify (V), Importance (M, I), Maps and routing (N), Remember (R), AI features (G, built on free LLM tiers), Platform (P).

**Zero-cost rule:** every service must be free at pilot scale. No paid LLM (Grok/xAI was dropped as too expensive), no X/Twitter API (reading posts is pay-per-use). **India only:** traffic, routing, search and geocoding are limited to India; adapters reject coordinates outside India and the pilot region is Bengaluru.

**Explicitly out of scope:** passive bump or accelerometer sensing, Capacitor or any native wrapper, C2PA, per-department authority logins, multiple cities, payments, any feature not in Section 11.

**Definition of done for the whole project:**

- Every row of Section 11 is ticked, with the task ID and the test that proves it.
- `npm run lint`, `npm run typecheck`, `npm test` and `npm run build` pass. `npm run e2e` passes the demo story.
- The app is deployed and the demo story works on the deployed URL from a phone.
- `docs/agent/PROGRESS.md` has evidence (command output) for every task.
- No secrets in git. `.env.example` lists every variable.

---

## 2. Agent operating rules

These rules exist because AI coding agents fail in predictable ways. Follow every one.

1. **One task at a time.** Start a task only when the previous one is marked DONE with evidence. Never work on two task cards at once.
2. **Re-read before you start.** At the start of every task, re-read its card, the rules section, and the last 30 lines of `PROGRESS.md`. Your memory of earlier work may be wrong or compressed.
3. **Verify, don't assume, external APIs and library versions.** Before using any library function or external endpoint, check the installed version's types (`node_modules/<pkg>/…d.ts`) or the official docs. Never write a call from memory. This applies especially to Next.js 16, Prisma 7, NextAuth 4, TomTom, Gemini, Groq and Web Push. Record what you checked in `PROGRESS.md`.
4. **Every external API goes through one adapter file** (`src/lib/external/<name>.ts`) with typed inputs and outputs, a recorded JSON fixture in `tests/fixtures/<name>/`, and a contract test that parses the fixture. UI and business logic never call `fetch` on third-party URLs directly.
5. **Evidence or it didn't happen.** A task is DONE only when its acceptance checks have been run and their real output (trimmed) is pasted into `PROGRESS.md`. Never write "tests pass" without the output.
6. **Never weaken a check to make it pass.** Do not delete, skip (`.skip`, `.only`), loosen assertions in, or mock the unit under test. If a test is wrong, explain why in `DECISIONS.md` and fix the test in its own commit.
7. **Run the full gate after every task:** `npm run lint && npm run typecheck && npm test && npm run build`. A task that breaks a previously passing check is not done.
8. **Small, surgical edits.** Edit only the files the card lists, unless you log why in `DECISIONS.md`. No drive-by refactors, renames or formatting changes. For large files, edit the specific region; never rewrite a whole file from memory.
9. **One commit per task,** message `T<id>: <summary>`, so any task can be reverted alone.
10. **Database changes only through migrations.** `prisma migrate dev --name <task-id>-<slug>`. PostGIS SQL goes in a migration created with `--create-only` and then edited. Never `db push` against shared data, never edit an applied migration.
11. **Secrets never in code, logs, fixtures or chat.** Read env only through `src/lib/env.ts`. Strip keys from recorded fixtures. Remove existing `console.log` of tokens or sessions.
12. **Stop and ask at `[USER INPUT]` and `[DECISION]` markers.** Write the question in `PROGRESS.md` under "Blocked", then continue with the next task that doesn't depend on it. Don't invent the answer.
13. **Log every assumption** in `docs/agent/ASSUMPTIONS.md` with the task ID. If an assumption turns out wrong, fix it and note it.
14. **Don't invent data.** Seed data must be labelled as seed (`isSeed = true` or a `seed:` prefix) and never shown as real. Never fabricate API responses outside test fixtures.
15. **Keep the app working at all times.** The free LLM providers, TomTom and Open-Meteo can be down or out of quota; every feature that uses them needs a tested fallback path.
16. **Cross-platform commands.** Sujay develops on Windows. Use npm scripts and Node or `tsx` scripts, not bash-only syntax, for anything Sujay will run.
17. **Server-only code stays on the server.** Files that read secrets import `server-only`. Leaflet and browser APIs load only in client components (`'use client'`, dynamic import with `ssr: false`).
18. **When stuck after two attempts, stop.** Write what you tried, the exact error and your best hypothesis under "Blocked", and move on. Don't loop.
19. **Context hygiene.** If the conversation gets long, finish the current task, update `PROGRESS.md`, and ask Sujay to start a new conversation with the master prompt. The ledger is the memory, not the chat.
20. **Finish with the audit.** The last task (T74) re-checks every row of Section 11 against the code and tests.

---

## 3. Known AI-agent failure modes and the countermeasure for each

| Failure mode | What it looks like | Countermeasure in this plan |
| --- | --- | --- |
| Hallucinated APIs | Calling a TomTom, Gemini or Groq endpoint or parameter that doesn't exist; old Next.js or Prisma syntax | Rule 3, adapter files and fixtures (rule 4), Appendix C lists every external contract to verify |
| Silent skipping | Marking a task done without doing all its steps | Acceptance checks with pasted evidence (rule 5); traceability audit T74 |
| Context loss | Forgetting decisions from earlier tasks; redoing or undoing work | PROGRESS, DECISIONS and ASSUMPTIONS ledgers; re-read rule 2; one phase per conversation |
| Test gaming | Weakening or deleting tests, mocking the unit under test | Rule 6; the gate in rule 7 |
| Over-reach | Rewriting large files, renaming things, adding unrequested features | Rule 8; out-of-scope list in Section 1 |
| Broken builds | A later task breaks an earlier feature | Full gate after every task; one commit per task |
| Invented data | Fake seed data shown as real; made-up numbers in UI | Rule 14; LLM number-grounding check (T50) |
| Secret leaks | Keys in code, fixtures or logs | Rule 11; env module; `.gitignore` check in T01 |
| SSR crashes | `window is not defined` from Leaflet, IndexedDB or Web Crypto on the server | Rule 17 |
| Platform mismatch | Bash scripts that fail on Windows | Rule 16 |
| Long-file truncation | A rewrite of a 600-line file loses half of it | Rule 8; T40 splits the two big map components first |
| Wrong guess on product decisions | Picking a pilot area, agency list or thresholds | `[DECISION]` and `[USER INPUT]` markers (rule 12) with stated defaults |

---

## 4. Repo facts (verified at commit d6813ae)

**Stack today:** Next.js 16.2.4 (App Router), React 19.2.4, TypeScript (strict), Tailwind 4, Prisma 7.8 with `@prisma/adapter-pg` and `pg`, NextAuth 4 (credentials, JWT sessions), Leaflet 1.9 + React-Leaflet 5, Framer Motion, Zustand, `idb`, Playwright. Database URL env var: `APP_DATABASE_URL` (used in `prisma.config.ts`, `src/lib/prisma.ts`, `prisma/seed.ts`). The developer's machine is Windows.

**Key files:**

- `prisma/schema.prisma` — models User, CitizenProfile, Department, Personnel, Report, Comment, PointLog, Vote, Assignment.
- `src/app/api/reports/route.ts` — creates reports; LLM priority via local Ollama; hardcoded category→department map; +25 XP per report.
- `src/app/api/reports/authority/route.ts` — authority-filed reports via a "system" citizen user with `passwordHash: 'N/A'`; also calls Ollama.
- `src/app/api/reports/[id]/{confirm,assign,status,resolve,vote,comments}/route.ts` — workflow actions.
- `src/app/api/reports/nearby/route.ts` — bounding box + haversine.
- `src/app/api/events/route.ts` — Server-Sent Events with `setInterval` pings.
- `src/components/authority/AuthorityMap.tsx` (~570 lines) and `src/components/citizen/IssuesNearMeMap.tsx` (~600 lines) — duplicated OSRM routing and detour logic, called from the browser.
- `src/lib/ollama.ts` — `localhost:11434`, model `qwen2.5-coder:7b`.
- `src/lib/auth.ts` — logs the JWT token and session to the console on every request.
- `src/hooks/useOfflineSync.ts` — IndexedDB queue of unsent reports.
- `tests/sync.spec.ts`, `test-login.spec.js` — Playwright tests with guessed selectors.

**Known defects to fix (each has a task):**

| Defect | Where | Task |
| --- | --- | --- |
| Photo collected but never sent or stored | `citizen/report/page.tsx`, `api/reports/route.ts` | T13, T23 |
| Invalid lat/lng silently becomes 12.9716, 77.5946 | `api/reports/route.ts` | T12 |
| Vote value unbounded, any role | `api/reports/[id]/vote` | T15 |
| `slaBreached` never set | nowhere | T16 |
| Any authority can act on any report | all action routes | T25 |
| LLM in the request path; can't run when hosted | `lib/ollama.ts` users | T17 |
| JWT and session logged to console | `lib/auth.ts` | T01 |
| `.gitignore` contains the bare pattern `page.tsx`, so any **new** `page.tsx` is never committed | `.gitignore` | T01 |
| `.gitignore` ignores `AGENTS.md` and `.agent/` | `.gitignore` | T01 `[DECISION]` |
| SSE stream with `setInterval` won't survive serverless hosting | `api/events/route.ts` | T17 |
| Stray scripts with hardcoded Windows paths: `fix_maps.py`, `update_maps.py`, `update_docx.py`, `check.js`, `check.ts`, `test-update.js`, folder `docx_unpacked/` | repo root | T01 |
| Public OSRM demo server used from the browser | both map components | T41 |

---

## 5. Target architecture

```text
src/
  app/                     # routes and pages (App Router)
    api/
      evidence/nonce/      reports/            issues/[id]/{actions,verify,log,priority,repair-window,escalation}
      routes/{safe,saved}  geocode/            claim-gap/          segments/[id]/{timeline,events}
      signals/             feed/hazards.geojson/                   push/subscribe/      jobs/[name]/
    (public)/issue/[id]/   (public)/claim-gap/  (public)/road/[segmentId]/   (public)/data-policy/
    citizen/…              desk/…  (renamed from authority/)
  components/
    map/                   # ONE shared map module (T40)
    evidence/              # camera capture, signing (T20–T22)
    desk/  issue/  priority/
  lib/
    env.ts                 # zod-validated env (T02)
    db/                    # prisma client, raw PostGIS helpers
    evidence/              # signing, verification, nonce
    issues/                # state machine, merge, verification rules
    priority/              # PI engine + config.ts (T34)
    routing/               # route cost, segment matching (T41–T45)
    external/              # tomtom.ts, openmeteo.ts, overpass.ts, llm/{gemini,groq,ollama}.ts, news.ts, reddit.ts, storage.ts, push.ts
    ai/                    # AI features G1–G8, provider chain, validators, quotas (T50–T59)
    jobs/                  # one file per scheduled job
config/priority.ts         # weights, bases, seasonal matrix (editable without code changes)
data/                      # imported GeoJSON, GTFS (gitignored if large), eval set
docs/plan/PLAN.md          docs/agent/{PROGRESS,DECISIONS,ASSUMPTIONS}.md
tests/unit/  tests/contract/  tests/fixtures/  tests/e2e/
.github/workflows/{ci.yml,jobs.yml}
```

**Request path rule:** a user request may touch the database, storage and (for routing and geocoding only) TomTom. LLM calls, weather, traffic sampling, recurrence and recompute all run as jobs.

---

## 6. Glossary and invariants

| Term | Meaning |
| --- | --- |
| Issue | One problem at one place on a road. Many Reports can belong to it. |
| Report (evidence) | One signed photo with GPS and time, in a role: `REPORT`, `CONFIRM`, `CLAIM_FIX` or `VERIFY`. |
| Desk | One of the two authority accounts. Both see the same dashboard. |
| ActionLog | Append-only record of every desk action. Public on the issue page. Never updated or deleted. |
| Agency | Responsible-agency **label** (GBA corporation, BWSSB, BESCOM, Traffic Police, BMRCL, …). No logins. |
| Handoff | A change of agency label. Counted publicly. |
| Claim gap | For a ward or desk: disputed claimed fixes ÷ all claimed fixes in a period. |
| PI | Priority Index 0–100, computed only by `lib/priority`. |
| Segment | One OSM way (or a split part of it) stored as a PostGIS LineString. |
| Signal | An unverified pin from social posts (G5). Never an Issue until a citizen verifies on-site. |

**Issue state machine (the only allowed transitions; implement as a table in `lib/issues/stateMachine.ts`):**

| From | To | Who | Requires |
| --- | --- | --- | --- |
| OPEN | CONFIRMED | Desk | — |
| OPEN | REJECTED | Desk | Written reason |
| CONFIRMED | ASSIGNED | Desk | Agency label set |
| ASSIGNED | IN_PROGRESS | Desk | — |
| CONFIRMED, ASSIGNED, IN_PROGRESS | CLAIMED_FIXED | Desk | Signed `CLAIM_FIX` photo within 50 m |
| CLAIMED_FIXED | VERIFIED_FIXED | System | Sum of `FIXED` verification weights ≥ 1.0 |
| CLAIMED_FIXED | DISPUTED | System | Any single `NOT_FIXED` verification with weight ≥ 0.5 |
| DISPUTED | IN_PROGRESS | Desk | — |
| DISPUTED | CLAIMED_FIXED | Desk | A new signed `CLAIM_FIX` photo |
| REJECTED | OPEN | Desk | Written reason (reopen) |

Verifying is deliberately harder than disputing. LLM output can never trigger a transition. A failure at the same spot after `VERIFIED_FIXED` creates a **new** Issue with `recurrenceOf` set; closed issues are never reopened.

**Verifier eligibility:** signed `VERIFY` photo, GPS accuracy ≤ 30 m, within 50 m of the issue, not the issue's original reporter, not the claimant desk, account older than 24 hours, one verification per user per issue. Weight = 0.5 + min(0.5, reputation ÷ 1000).

**Priority Index (implement exactly; constants in `config/priority.ts`):**

```text
PI = min(100, 100 × C × Σ × (0.30·S + 0.20·E + 0.15·V + 0.20·U + 0.15·P))
Floor: if age > 2 × SLA then PI = max(PI, 60)
Bands: CRITICAL ≥ 70 · HIGH 50–69 · MEDIUM 30–49 · LOW < 30
```

Factor definitions, defaults and the seasonal matrix are in Appendix A.

---

## 7. Environment, accounts and API keys

**Accounts Sujay must create (agent: never create these, ask):**

| # | Service | What you get | Cost | Used by |
| --- | --- | --- | --- | --- |
| K1 | Supabase project (region: Mumbai `ap-south-1` if offered) | Pooled + direct Postgres URLs, project URL, service-role key | Free tier | DB, PostGIS, photo storage |
| K2 | TomTom Developer account | API key (create two: server key, and a tiles key restricted to your domain if the dashboard allows) | Free tier, no card | Routing, traffic flow, traffic tiles, search |
| K3 | Google AI Studio | Gemini API key (free tier, no card; don't enable billing) | Free | Primary LLM for G1–G8 (vision + JSON schema) |
| K3b | GroqCloud console | API key (free plan) | Free | Fallback LLM when the Gemini daily quota runs out |
| K3c | Reddit app (script type, non-commercial) — optional | Client ID and secret | Free for non-commercial use | G5 radar: r/bangalore posts |
| K4 | Vercel account linked to GitHub | Deployment | Hobby (free, non-commercial) | Hosting |
| K5 | GitHub repo secrets | `JOB_SECRET`, `APP_URL` | Free | Scheduled jobs |

**Generated locally, no account:** `NEXTAUTH_SECRET` (`npx auth secret` or any 32-byte random string), VAPID keys for Web Push (`npx web-push generate-vapid-keys`), `JOB_SECRET` (random 32 bytes), `SEED_DESK_PASSWORD`.

**No key needed:** Open-Meteo, Overpass (OpenStreetMap), OSM map tiles (attribution required), BMTC GTFS, ward GeoJSON, Tesseract.js.

**`.env.example` (create in T02; real values only in `.env.local` and Vercel):**

```bash
# Database (Supabase)
APP_DATABASE_URL=            # pooled connection (port 6543) for the app
DIRECT_DATABASE_URL=         # direct connection (port 5432) for prisma migrate
# Auth
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=
SEED_DESK_PASSWORD=
# Storage
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=   # server only
SUPABASE_EVIDENCE_BUCKET=evidence
# TomTom
TOMTOM_API_KEY=              # server only
NEXT_PUBLIC_TOMTOM_TILES_KEY=  # domain-restricted, used by the browser for traffic tiles
# AI (free tiers only; never enable billing)
GEMINI_API_KEY=              # server only, Google AI Studio free tier
GEMINI_MODEL=                # a free Flash-Lite model id listed in AI Studio
GROQ_API_KEY=                # server only, fallback
GROQ_MODEL_VISION=           # a free Groq vision model id (JSON mode)
GROQ_MODEL_TEXT=             # a free Groq text model id
OLLAMA_URL=                  # optional: http://localhost:11434 for nightly batch on your laptop
AI_DAILY_CALL_CAP=400        # stay under the free daily quota
AI_FEATURES=G1,G2,G7         # comma list of enabled AI features
# Social radar (G5), all optional
REDDIT_CLIENT_ID=
REDDIT_CLIENT_SECRET=
REDDIT_USER_AGENT=civicpulse/1.0 by <your reddit username>
# Region
APP_REGION=IN                # traffic, routing and geocoding limited to India
# Web Push
NEXT_PUBLIC_VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:you@example.com
# Jobs
JOB_SECRET=
APP_TIMEZONE=Asia/Kolkata
```

---

## 8. User-input checkpoints

The agent must stop at each of these and ask. Defaults apply only if Sujay says "use the default".

| ID | Needed for | Question | Default |
| --- | --- | --- | --- |
| U1 | T04 | Supabase URLs and keys in `.env.local`? | — (required) |
| U2 | T32, T41 | TomTom keys in `.env.local`? | — (required) |
| U3 | T50 | Gemini key and Groq key in `.env.local`, model IDs copied from each console? | — (required; Groq optional but recommended) |
| U4 | T30 | Pilot area bounding box | Outer Ring Road from Marathahalli bridge to Kadubeesanahalli, plus 1 km either side |
| U5 | T29 | GBA ward boundary GeoJSON file placed in `data/wards.geojson` | — (Sujay downloads from data.opencity.in) |
| U6 | T31 | BMTC GTFS zip placed in `data/gtfs/` | — (Sujay downloads from the DULT open-data page) |
| U7 | T25 | Agency label list | GBA (by corporation), BWSSB, BESCOM, Bengaluru Traffic Police, BMRCL, BDA, Other |
| U8 | T71 | Vercel project linked? | — |
| U9 | T59 | ~100 labelled local photos for the AI eval set | Build the harness; mark G1/G2 "eval pending" |
| U10 | T01 | Commit `AGENTS.md` and `.agents/`, or keep them ignored? | Commit `.agents/rules/`; keep `AGENTS.md` ignored |

---

## 9. Execution order and gates

**Track A — hackathon-ready build (do first, in this order):**

`T00 → T01 → T02 → T03 → T04 → T10 → T11 → T12 → T13 → T14 → T15 → T17 → T20 → T21 → T22 → T23 → T24 → T25 → T26 → T27 → T28 → T29 → T30(A) → T33 → T34(A) → T35 → T40 → T41 → T42 → T43 → T46(A) → T50 → T51 → T52 → T57(A) → T60(A) → T70 → T71 → T72 → T73`

`(A)` = do only the part of the card marked **Track A scope**; the rest is finished in Track B.

**Gate H (hackathon):** stop and show Sujay:
- the demo story e2e (`npm run e2e -- demo`) passing twice in a row,
- the deployed URL working on a phone,
- the full gate (rule 7) green,
- `PROGRESS.md` complete for every Track A task.

**Track B — complete build:**

`T16 → T2A → T2B → T30(rest) → T31 → T32 → T34(rest) → T36 → T37 → T44 → T45 → T46(rest) → T47 → T48 → T62 → T53 → T54 → T55 → T56 → T57(rest) → T58 → T59 → T60(rest) → T61 → T63 → T64 → T65 → T66 → T74`

**Gates:** after T2B (Verify complete), after T37 (Importance complete), after T48 (Maps complete), after T59 (AI complete), after T74 (final). At each gate: full test run, deployed check, Sujay reviews.

## 10. Task cards

Each card lists the features it delivers, what it depends on, the files it may touch, the steps, the acceptance checks (run them and paste the output into `PROGRESS.md`), and the pitfalls specific to that task.

### Phase 0 — Setup and safety rails

#### T00 · Baseline audit · Features: P3 · Track A

**Depends on:** nothing.

**Files:** `docs/agent/PROGRESS.md`, `docs/agent/DECISIONS.md`, `docs/agent/ASSUMPTIONS.md` (create from Section 12 templates).

**Steps:**

1. Create the three ledger files.
2. Run `npm ci`, `npx tsc --noEmit`, `npm run lint`, `npm run build`. Do **not** fix anything yet.
3. Record each command's result, the Node and npm versions, and the installed versions of next, prisma, @prisma/client, next-auth, react-leaflet, leaflet.
4. List every route under `src/app/api` and every page under `src/app` in `PROGRESS.md`.

**Accept:** ledgers exist; baseline results recorded verbatim (failures allowed).

**Pitfalls:** don't "quickly fix" errors here; the baseline is the reference for later tasks.

#### T01 · Repo hygiene and security fixes · Features: P5 (part) · Track A

**Depends on:** T00.

**Files:** `.gitignore`, `src/lib/auth.ts`, root stray files.

**Steps:**

1. Remove the bare `page.tsx` line from `.gitignore` (it blocks every new page from being committed). Ask U10 about `AGENTS.md` and `.agent/`.
2. `git grep` each of `fix_maps.py`, `update_maps.py`, `update_docx.py`, `check.js`, `check.ts`, `test-update.js`, `docx_unpacked/`, `context.txt`. If nothing imports them, `git rm` them (move `context.txt` to `docs/legacy/context.txt`).
3. Delete the `console.log` calls for the JWT token and the session in `src/lib/auth.ts`.
4. Add `test-results/`, `playwright-report/`, `data/gtfs/`, `.env.local` to `.gitignore` if missing.

**Accept:** `git check-ignore -v src/app/x/page.tsx` prints nothing; no `console.log` in `src/lib/auth.ts`; build still passes.

**Pitfalls:** `git rm` only files proven unused; list them in `DECISIONS.md`.

#### T02 · Env validation and config module · Features: infrastructure · Track A

**Depends on:** T01.

**Files:** `src/lib/env.ts`, `.env.example`, `config/priority.ts` (stub), `package.json`.

**Steps:**

1. Add `zod` and `server-only`.
2. `src/lib/env.ts`: zod schemas for server and public env (Section 7), parsed once; throw a readable error listing missing keys. Optional keys (Groq, Reddit, VAPID) make their features report "disabled" instead of crashing.
3. Write `.env.example` exactly as Section 7.
4. Replace direct `process.env.X` reads in `src/lib/**` with `env`.
5. Add scripts: `"typecheck": "tsc --noEmit"`.

**Accept:** starting the app without `TOMTOM_API_KEY` shows a clear startup error naming it; `npm run typecheck` runs.

**Pitfalls:** `NEXT_PUBLIC_*` values are inlined at build time; don't read them through the server schema.

#### T03 · Test and CI harness · Features: P3 · Track A

**Depends on:** T02.

**Files:** `vitest.config.ts`, `playwright.config.ts`, `tests/**`, `.github/workflows/ci.yml`, `package.json`.

**Steps:**

1. Add Vitest; scripts `test` (unit + contract), `e2e` (Playwright).
2. Move `test-login.spec.js` and `tests/sync.spec.ts` to `tests/e2e/legacy/` and mark them `test.describe.skip` with a comment "replaced by T73" — the only allowed skip.
3. Playwright config: `webServer` runs `npm run build && npm start` on port 3000; base URL from env.
4. CI workflow on push and PR: install, lint, typecheck, test, build. No secrets needed (tests use fixtures).

**Accept:** `npm test` runs one sample unit test; CI workflow file valid (`npx actionlint` if available, otherwise note it).

**Pitfalls:** never call real third-party APIs in `npm test`.

#### T04 · Supabase Postgres + PostGIS · Features: F7 · Track A · `[USER INPUT U1]`

**Depends on:** T03.

**Files:** `prisma.config.ts`, `prisma/migrations/*_t04_postgis/migration.sql`, `src/lib/db/prisma.ts` (move from `src/lib/prisma.ts`, keep a re-export).

**Steps:**

1. Ask Sujay for U1. Use `DIRECT_DATABASE_URL` for migrations in `prisma.config.ts` and `APP_DATABASE_URL` (pooled) for the app.
2. Create a migration with `--create-only` containing `CREATE EXTENSION IF NOT EXISTS postgis;` and apply it.
3. Add `scripts/db-check.ts`: prints `SELECT postgis_version()`.

**Accept:** `npx tsx scripts/db-check.ts` prints a PostGIS version.

**Pitfalls:** check Prisma 7's docs for where the datasource URL and the direct URL go (it moved to `prisma.config.ts`); if the pooled URL causes prepared-statement errors, use Supabase's session pooler and log it.

### Phase 1 — Foundation

#### T10 · Schema v2 · Features: F3, F7, F10, A1, A2, A3, V4 (schema) · Track A

**Depends on:** T04.

**Files:** `prisma/schema.prisma`, new migrations.

**Steps:**

1. Implement the models from Appendix B: `Agency` (replaces Department as a label), `Issue`, `Report` (evidence), `ActionLog`, `Verification`, `RoadSegment`, `SegmentEvent`, `TrafficSample`, `Signal`, `AiRun`, `AiJob`, `SavedRoute`, `PushSubscription`, `DeviceKey`, `EvidenceNonce`. Keep `User`, `CitizenProfile`, `Comment`, `PointLog`, `Personnel`, `Assignment` (repoint to `issueId`). Remove `Vote`.
2. Keep `lat`/`lng` as `Float` columns that Prisma writes. Add `geom` as `Unsupported("geography(Point,4326)")?` and fill it with a **database trigger** (raw SQL migration) on insert/update of `lat`/`lng`. Add GiST indexes on every `geom`.
3. Add `isSeed Boolean @default(false)` to Issue, Report, SegmentEvent, TrafficSample.

**Accept:** `prisma migrate dev` applies cleanly; a unit test inserts an Issue via Prisma and reads back a non-null `geom` via `$queryRaw` (`ST_AsText`).

**Pitfalls:** Prisma can't create rows with a **required** `Unsupported` field, hence nullable + trigger. Never let `prisma migrate` drop the trigger: check the generated SQL before applying.

#### T11 · Data migration and seed v2 · Features: A1 · Track A

**Depends on:** T10.

**Files:** `scripts/migrate-v1-to-v2.ts`, `prisma/seed.ts`.

**Steps:**

1. Script maps each old Report to one Issue + one REPORT evidence row (`signature = 'legacy'`, `isSeed = false`, flagged `legacy = true`). Idempotent; dry-run flag prints counts only.
2. Rewrite the seed: two desk users `desk-a@civicpulse.local` and `desk-b@civicpulse.local` (role AUTHORITY, password from `SEED_DESK_PASSWORD`), three citizen users, agencies from U7, no hardcoded passwords.
3. Remove the "system citizen" pattern from `api/reports/authority`.

**Accept:** dry-run prints counts; seed runs twice without duplicates; login works for desk-a, desk-b and a citizen.

**Pitfalls:** never delete production rows in the seed; the seed may only delete rows where `isSeed = true`.

#### T12 · Validation layer and API error contract · Features: F2 · Track A

**Depends on:** T10.

**Files:** `src/lib/api/{validate.ts,errors.ts,auth.ts}`, all `src/app/api/**/route.ts`.

**Steps:**

1. `withAuth(role?)` helper returns the typed session user or a 401/403.
2. Every route parses input with a zod schema; errors return `{ error: { code, message, fields? } }` with 400.
3. Coordinates: lat 11.5–14.5 and lng 76.5–78.5 for the pilot region (config), finite numbers, `gpsAccuracyM ≤ 30` for evidence. No defaults to the city centre.
4. Replace `(session.user as any)` casts with a typed session (module augmentation for next-auth).

**Accept:** unit tests: missing lat → 400 with `fields.lat`; lat 0 → 400; accuracy 80 m → 400; citizen calling a desk route → 403.

**Pitfalls:** keep messages user-readable; don't echo raw input back.

#### T13 · Photo storage · Features: F1 · Track A

**Depends on:** T12.

**Files:** `src/lib/external/storage.ts`, `tests/contract/storage.test.ts`.

**Steps:**

1. Server-side upload to the Supabase bucket `evidence` using the service-role key; path `issues/<issueId>/<reportId>.jpg`; return a signed or public URL per `[DECISION]` (default: public bucket for photos, since issues are public).
2. Accept only JPEG/WebP ≤ 2 MB after client resize (client resizes to max 1600 px in T22).
3. Store `photoSha256` computed on the server from the received bytes.

**Accept:** contract test with a fixture image; hash matches; >2 MB rejected.

**Pitfalls:** use the official `@supabase/supabase-js` storage API as documented for the installed version; never expose the service-role key to the client.

#### T14 · Duplicate merge · Features: F6 · Track A

**Depends on:** T10, T12.

**Files:** `src/lib/issues/merge.ts`, tests.

**Steps:**

1. On a new REPORT: find an open Issue (status not in VERIFIED_FIXED, REJECTED) of the same category within 25 m (`ST_DWithin(geom, point, 25)`), newest first.
2. If found, attach the evidence as `CONFIRM` and return the existing Issue; else create a new Issue.
3. Ambiguous cases (within 25 m but different category, or 25–40 m same category) get `needsDuplicateReview = true` for G3 later.

**Accept:** tests with three points (10 m, 30 m, 60 m apart) produce the expected merges.

**Pitfalls:** geography distances are metres only when both sides are `geography`; cast explicitly.

#### T15 · Points and XP rules; remove votes · Features: F9, F3 · Track A

**Depends on:** T14.

**Files:** `src/lib/points.ts`, delete `api/reports/[id]/vote`, `components/citizen/Interactions.tsx`.

**Steps:**

1. Rules: new Issue +10; confirmation of someone else's issue +5; accepted verification +20; verification that later proves wrong −20; merged duplicate 0.
2. Remove the vote endpoint and the vote UI; show "confirmations" count instead.

**Accept:** unit tests for each rule; no route under `/vote` exists.

**Pitfalls:** points are written in the same transaction as the event that earns them.

#### T16 · Job runner and SLA job · Features: F5 · Track B

**Depends on:** T10.

**Files:** `src/app/api/jobs/[name]/route.ts`, `src/lib/jobs/sla.ts`, `.github/workflows/jobs.yml`.

**Steps:**

1. Job route requires header `x-job-secret` equal to `JOB_SECRET`; unknown job → 404; each job returns `{ processed, durationMs }` and finishes within 10 s (process in batches).
2. SLA job sets `slaBreached = true` where `now() > slaDueAt` and status is not closed; writes an ActionLog row with actor `system`.
3. GitHub Actions workflow with one schedule per job, calling `curl -fsS -X POST -H "x-job-secret: …" $APP_URL/api/jobs/<name>`.

**Accept:** unit test for the SLA query; manual call returns counts; wrong secret → 401.

**Pitfalls:** GitHub schedules run in UTC and can start late; jobs must be idempotent.

#### T17 · Async AI queue; remove Ollama and SSE · Features: F8 · Track A

**Depends on:** T10.

**Files:** delete `src/lib/ollama.ts`; edit `api/health`, `api/reports/*`; `src/lib/jobs/aiQueue.ts`; delete `api/events`; `SyncProvider.tsx`.

**Steps:**

1. Remove every Ollama call. New Issues get PI from the rules engine (T34; until then `priority = 0`).
2. Add `AiJob` rows (`feature`, `targetId`, `status`, `attempts`) that later AI tasks consume.
3. Replace the SSE route with client polling every 15 s (SWR or `setInterval` in a client component) and `router.refresh()` after mutations.
4. Health route reports database, storage, TomTom key present, Gemini and Groq keys present.

**Accept:** `git grep -i ollama` returns nothing in `src/`; build passes; health returns JSON.

**Pitfalls:** don't leave dead imports.

### Phase 2 — Verify and the authority desk

#### T20 · Device signing keys · Features: V3 · Track A

**Depends on:** T10.

**Files:** `src/lib/evidence/deviceKey.ts` (client), `src/app/api/evidence/device/route.ts`.

**Steps:**

1. On first use, generate an ECDSA P-256 key pair with Web Crypto, `extractable: false` for the private key; store the `CryptoKey` objects in IndexedDB (they are structured-cloneable).
2. Export the public key as JWK; register it with the server (`DeviceKey`: userId, publicJwk, createdAt). A user may have several devices.

**Accept:** e2e: after login, a DeviceKey row exists; reloading the page reuses the same key.

**Pitfalls:** client-only module (`'use client'`, no SSR import). Web Crypto requires a secure context (HTTPS or localhost).

#### T21 · Capture nonce · Features: V2 · Track A

**Depends on:** T20.

**Files:** `src/app/api/evidence/nonce/route.ts`, `src/lib/evidence/nonce.ts`.

**Steps:** issue a random 128-bit nonce tied to the user, valid 5 minutes, single use (`EvidenceNonce` row with `usedAt`).

**Accept:** tests: expired nonce rejected; reused nonce rejected; other user's nonce rejected.

#### T22 · Camera capture, GPS gate and signing · Features: V1, N8, V3 · Track A

**Depends on:** T20, T21.

**Files:** `src/components/evidence/CaptureCamera.tsx`, `src/lib/evidence/sign.ts`, `src/lib/evidence/verify.ts` (server).

**Steps:**

1. Camera via `getUserMedia({ video: { facingMode: 'environment' } })`, draw the frame to a canvas, export JPEG max 1600 px. No file input, no gallery.
2. GPS via `watchPosition` with high accuracy; show the accuracy circle; block capture until accuracy ≤ 30 m (show a "move to open sky" hint). Pin may be dragged at most 50 m from the GPS fix.
3. Payload = SHA-256(photo bytes) + nonce + lat + lng + accuracy + capturedAt (ISO) + role. Sign the canonical JSON string with the device key.
4. Server verify: recompute the hash from the uploaded bytes, rebuild the canonical string, verify the signature with the registered public key, check nonce, check `capturedAt` within 5 minutes of server time.

**Accept:** unit tests: valid signature passes; one changed byte fails; changed lat fails; old timestamp fails. e2e: capture page has no file input.

**Pitfalls:** Web Crypto ECDSA signatures are raw `r||s` (IEEE P1363). Node's `crypto.verify` expects DER unless you pass `{ dsaEncoding: 'ieee-p1363' }`. Canonical JSON must have a fixed key order on both sides.

#### T23 · Report flow rewrite · Features: F1, F6, V1–V3, N8 · Track A

**Depends on:** T13, T14, T22.

**Files:** `src/app/citizen/report/page.tsx`, `src/app/api/reports/route.ts`, `src/hooks/useOfflineSync.ts`.

**Steps:**

1. Steps: category → capture (T22) → optional note and size class (small, medium, large) and blocked share (none, part lane, one lane, full) → submit.
2. Server: validate → verify signature → upload photo → merge or create Issue (T14) → snap to segment if segments exist → enqueue G1 → award points → return the Issue id.
3. Offline: if offline, queue the signed evidence **without** a nonce, marked `offline = true`; on sync the server accepts it if `capturedAt` is within 24 h and gives it lower confidence (counts as 0.5 report in C).

**Accept:** e2e: citizen files a report and lands on `/issue/<id>` with the photo visible; a second report 10 m away merges.

**Pitfalls:** keep the existing visual style; don't redesign the page.

#### T24 · Issue state machine · Features: V4 · Track A

**Depends on:** T10.

**Files:** `src/lib/issues/stateMachine.ts`, tests.

**Steps:** encode the transition table from Section 6 as data; one function `transition(issue, action, actor, context)` that validates and returns the new status and the ActionLog row to write. All routes use it; no route sets `status` directly.

**Accept:** table-driven tests: every allowed transition passes; a sample of 10 disallowed transitions throw.

#### T25 · Desk actions endpoint, action log, agencies and handoffs · Features: A1, A2, A3 · Track A · `[USER INPUT U7]`

**Depends on:** T24.

**Files:** `src/app/api/issues/[id]/actions/route.ts`, `src/app/api/issues/[id]/log/route.ts`; delete `api/reports/[id]/{confirm,assign,status,resolve}`.

**Steps:**

1. One POST endpoint with `{ action, note?, agencyId?, evidence? }`; desk role only; runs the state machine; writes ActionLog in the same transaction.
2. `REASSIGN_AGENCY` increments `handoffCount`.
3. `OVERRIDE_BAND` requires a note; stored on the issue and logged.
4. GET log is public and returns actor display name ("Desk A"), action, note, time, evidence thumbnail.

**Accept:** tests: each action writes exactly one log row; reassign increments handoffs; log rows can't be updated (no update route; DB permission or trigger blocks UPDATE/DELETE on ActionLog).

**Pitfalls:** the append-only guarantee should be enforced in the DB (trigger raising an exception on UPDATE/DELETE), not just in code.

#### T26 · Shared desk dashboard · Features: A1 · Track A

**Depends on:** T25.

**Files:** rename `src/app/authority/**` to `src/app/desk/**` (keep a redirect), dashboard components.

**Steps:** one queue sorted by PI band then PI, filters (status, category, agency, ward, SLA breached), issue drawer with the action buttons allowed by the state machine, "who did what" shown inline from the log. Both desk accounts see the same data.

**Accept:** e2e: desk-a confirms an issue, desk-b sees "Confirmed by Desk A".

**Pitfalls:** reuse existing components where possible; remove personnel-per-department assumptions.

#### T27 · Claim fix and citizen verification · Features: V4, V5 · Track A

**Depends on:** T23, T25.

**Files:** `src/app/api/issues/[id]/verify/route.ts`, `src/lib/issues/verification.ts`, desk claim-fix UI using `CaptureCamera` with role `CLAIM_FIX`.

**Steps:**

1. Claim fix = desk action with signed photo within 50 m → CLAIMED_FIXED; enqueue G2.
2. Verify endpoint applies the eligibility rules and weights from Section 6, then runs the state machine (VERIFIED_FIXED or DISPUTED).

**Accept:** tests for each eligibility rule (distance, own report, claimant, account age, duplicate verify); e2e: desk claims, citizen disputes → DISPUTED.

**Pitfalls:** compute distance from the signed GPS, not a client-supplied number.

#### T28 · Public issue page · Features: A2, V4 · Track A

**Depends on:** T25, T27.

**Files:** `src/app/(public)/issue/[id]/page.tsx`.

**Steps:** photo gallery (report, confirmations, claim, verifications), status timeline from the ActionLog, agency label and handoff count, PI with breakdown (T35), "Verify this fix" button when CLAIMED_FIXED and the viewer is eligible. Readable without login.

**Accept:** e2e: logged-out visitor sees the timeline and photos; no desk-only controls rendered.

#### T29 · Claim-gap page and desk scorecard · Features: V6, A4 · Track A · `[USER INPUT U5]`

**Depends on:** T27.

**Files:** `scripts/import-wards.ts`, `src/app/(public)/claim-gap/page.tsx`, `src/app/api/claim-gap/route.ts`.

**Steps:**

1. Import ward polygons from `data/wards.geojson` into a `Ward` table (PostGIS polygon); set `Issue.wardId` by `ST_Contains`.
2. Claim gap per ward and per desk for 30/90 days: claimed, verified, disputed, disputed share, median hours from claim to verification.
3. Ward choropleth + table; show "insufficient data" under 5 claims.

**Accept:** unit test on a fixture set gives the expected percentages; page renders with seed data labelled "seed".

**Pitfalls:** without U5, use a single "Pilot area" polygon and mark it in ASSUMPTIONS.

#### T2A · Web Push and verify-nearby · Features: V8 · Track B

**Depends on:** T27, T70.

**Files:** `src/lib/external/push.ts` (web-push), `public/sw.js` push handler, `api/push/subscribe`.

**Steps:** users opt in; store subscriptions; when an issue becomes CLAIMED_FIXED, notify eligible users whose saved routes (T47) or last-known home area (opt-in) are within 1 km; max 3 notifications per user per day.

**Accept:** unit test for recipient selection; manual test on Android Chrome recorded.

**Pitfalls:** iOS delivers web push only to installed PWAs (iOS 16.4+); say so in the UI.

#### T2B · Privacy and retention · Features: P2 · Track B

**Depends on:** T23.

**Files:** `src/app/(public)/data-policy/page.tsx`, `src/lib/jobs/retention.ts`.

**Steps:** plain-language policy (what is stored, why, how long, how to delete); account deletion endpoint; retention job deletes raw GPS accuracy traces and unused nonces after 30 days; photos are checked by G8 for faces and plates before going public.

**Accept:** tests for the retention query; policy page linked from the footer and signup.

### Phase 3 — Importance

#### T30 · Road segments and snapping · Features: M1 · Track A scope: pilot area only · `[USER INPUT U4]`

**Depends on:** T10.

**Files:** `scripts/import-osm-segments.ts`, `src/lib/db/segments.ts`.

**Steps:**

1. Overpass query for `highway` ways (motorway to residential, plus footway near primary roads) inside the pilot bbox; save the raw response to `data/osm/pilot.json` (commit if under 5 MB).
2. Insert into `RoadSegment` with class, lanes, name, geometry; mark `nearSchoolOrHospital` from POIs within 200 m.
3. Snap: on Issue create, the nearest segment within 20 m whose class suits the category (footpath issues may snap to footways).
4. Track B: extend to the whole city in batches; keep the raw files out of git if large.

**Accept:** count of segments printed; a fixture Issue on ORR snaps to an ORR segment.

**Pitfalls:** respect the Overpass usage policy (one bulk query, cached); don't query Overpass from the request path.

#### T31 · Exposure and vulnerability data · Features: M2 · Track B · `[USER INPUT U6]`

**Depends on:** T30.

**Files:** `scripts/import-gtfs.ts`, `src/lib/priority/exposure.ts`.

**Steps:** parse GTFS (`stops.txt`, `stop_times.txt`, `trips.txt`, `shapes.txt` if present) to compute buses per hour per segment for weekday peak; POIs (schools, hospitals, bus stops, markets) from OSM; store on `RoadSegment`.

**Accept:** unit tests on a tiny GTFS fixture; a known BMTC corridor shows > 0 buses/hour.

**Pitfalls:** if `shapes.txt` is missing, approximate with consecutive stop pairs; log it.

#### T32 · TomTom adapter and traffic sampling · Features: M3 · Track B · `[USER INPUT U2]`

**Depends on:** T30, T16.

**Files:** `src/lib/external/tomtom.ts`, `tests/contract/tomtom.*.test.ts`, `src/lib/jobs/trafficSample.ts`.

**Steps:**

1. Verify the current Flow Segment Data endpoint and response fields in TomTom's docs; record one real response as a fixture (strip the key).
2. Job every 4 h samples up to 100 `tracked` segments (midpoint coordinate) and stores current and free-flow speed.
3. Track a monthly request counter in the DB; stop at 18,000.

**Accept:** contract test parses the fixture; job respects the cap (unit test with a fake counter).

**Pitfalls:** zoom level and point snapping affect which road TomTom returns; compare the returned coordinates with the segment and drop mismatches. In India, live data comes from GPS probes, so minor and residential roads can return low `confidence`; store it, ignore samples below 0.6 for the congestion profile, and fall back to road-class defaults. Reject sample points outside India.

#### T33 · Weather adapter · Features: I1 (data) · Track A

**Depends on:** T16 or a manual trigger.

**Files:** `src/lib/external/openmeteo.ts`, `src/lib/jobs/weather.ts`, contract test.

**Steps:** hourly precipitation, precipitation probability and temperature for the next 72 h per ward centroid (pilot: one point), `timezone=Asia/Kolkata`; cache in a `WeatherForecast` table.

**Accept:** contract test on a fixture; job stores 72 hourly rows.

**Pitfalls:** add the CC-BY attribution "Weather data by Open-Meteo.com" on pages that show it.

#### T34 · Priority engine · Features: M4, I1 · Track A scope: S, V, P, C, Σ fully; E from road class only; U from blocked share and the `soleAccess` flag

**Depends on:** T30, T33.

**Files:** `config/priority.ts`, `src/lib/priority/{index.ts,factors/*.ts,season.ts}`, `src/lib/jobs/priorityRecompute.ts`.

**Steps:**

1. Pure function `computePriority(inputs, config, now) → { pi, band, breakdown, sentenceFacts }`. No I/O inside.
2. Implement every factor exactly as Appendix A, with the seasonal matrix and the forecast boost.
3. Recompute on new evidence, on status change and hourly (job).
4. Track B: E with traffic samples and buses/hour; U access need from a routing call that avoids the segment (cache per segment for 7 days).

**Accept:** unit tests with the three worked examples in Appendix A (exact values ± 0.5); config change alters results without code changes.

**Pitfalls:** dates in IST for season selection; never let a missing input throw — use the documented default and mark it in `breakdown.missing`.

#### T35 · Priority explanation UI · Features: I2 · Track A

**Depends on:** T34.

**Files:** `src/components/priority/PriorityBreakdown.tsx`.

**Steps:** a stacked bar of the weighted factors, the band chip, and one template sentence built only from `sentenceFacts` (G7 may later rephrase it). Show "estimated" next to E and U.

**Accept:** component test renders the example from Appendix A.

#### T36 · Repair-window planner · Features: M5 · Track B

**Depends on:** T32, T33, T34.

**Files:** `src/lib/priority/repairWindow.ts`, `api/issues/[id]/repair-window`.

**Steps:** for each of the next 72 hours: disruption = estimated vehicles/hour × congestion profile for that hour-of-week; drop hours with precipitation probability > 40% (unless the repair method is marked wet-capable); return the best 3-hour window and the peak-hour comparison.

**Accept:** unit test on fixtures returns the expected window.

**Pitfalls:** with fewer than 2 weeks of samples, label the result "low confidence".

#### T37 · Commuter-hours estimate · Features: M9 · Track B

**Depends on:** T32.

**Files:** `src/lib/priority/commuterHours.ts`.

**Steps:** for VERIFIED_FIXED issues on tracked segments: compare mean travel time for the same hour-of-week 14 days before the claim and 14 days after; hours/day = Δtime × estimated vehicles; show only when both windows have ≥ 20 samples.

**Accept:** unit test; UI labels it "estimate".

### Phase 4 — Maps and routing

#### T40 · Shared map module · Features: N6 (prerequisite) · Track A

**Depends on:** T03.

**Files:** `src/components/map/**`, `AuthorityMap.tsx`, `IssuesNearMeMap.tsx`.

**Steps:** extract the duplicated code into `components/map/` (base map, issue markers, route layer) with **no behaviour change**; both old components become thin wrappers. Then delete the duplicated code.

**Accept:** both map pages render as before (Playwright screenshot compared by eye and noted); line count of the two old files drops below 150 each.

**Pitfalls:** do this before any routing change; it's the riskiest edit in the plan, so commit in small steps.

#### T41 · Routing proxy (TomTom) · Features: N1 · Track A · `[USER INPUT U2]`

**Depends on:** T40.

**Files:** `src/lib/external/tomtom.ts` (routing part), `src/app/api/routes/safe/route.ts`; remove every `router.project-osrm.org` call.

**Steps:** verify the Calculate Route API in TomTom's docs (traffic, `travelMode`, `maxAlternatives`, `departAt`, POST body with `avoidAreas`); record fixtures; return up to 5 alternatives with geometry, travel time and delay.

**Accept:** contract test; `git grep project-osrm` returns nothing.

**Pitfalls:** key stays server-side; cache identical requests 5 minutes; count requests against 20,000/month; reject origins or destinations outside India (`APP_REGION=IN`); use km and en-IN; check which `travelMode` values TomTom supports for India (motorcycle matters most for Bengaluru) and fall back to car with a note if one isn't available.

#### T42 · Segment matching · Features: N2 · Track A

**Depends on:** T30, T41.

**Files:** `src/lib/routing/matchSegments.ts`.

**Steps:** for a route LineString, select segments within 10 m whose bearing differs by < 30° from the route's local bearing (PostGIS `ST_DWithin` + azimuth); return ordered segment IDs.

**Accept:** fixtures: a route on ORR does not match the parallel service road; a route under a flyover does not match the flyover.

#### T43 · Cost-based route choice and vehicle profiles · Features: N3 · Track A

**Depends on:** T42, T34.

**Files:** `src/lib/routing/cost.ts`, routing UI.

**Steps:** hazard cost and route score as in Appendix A.3; vehicle selector (motorcycle, car, pedestrian, wheelchair); "fastest ↔ safest" slider maps to λ 0–0.5 (default 0.15); response explains the choice ("avoids 2 hazards, +3 min"). Critical blocking hazards become `avoidAreas`.

**Accept:** unit tests: same alternatives, different vehicles pick different routes as expected in the fixture.

#### T44 · Diversion cap · Features: N4 · Track B

**Depends on:** T43.

**Files:** `src/lib/routing/diversion.ts`.

**Steps:** count recommended routes per residential segment per 15 minutes (DB table with TTL); above the threshold (config, default 30) add a penalty to routes using it.

**Accept:** unit test.

#### T45 · Departure advice · Features: N5 · Track B

**Depends on:** T43.

**Steps:** query now, +15, +30 and +45 minutes with `departAt` (4 calls; show only when the user asks, to save quota); suggest the best if it saves ≥ 5 minutes.

**Accept:** unit test on fixtures.

#### T46 · Map layers · Features: N6 · Track A scope: clustered issues coloured by band + live traffic tiles

**Depends on:** T40, T34.

**Files:** `src/components/map/layers/*`.

**Steps:** layer control with issues (markercluster), priority heat (leaflet.heat), road health (segments coloured by worst open PI), ward claim gap (choropleth), live traffic (TomTom flow tiles with the public tiles key), season view (filter by season over R1/R5 data). Lazy-load each layer.

**Accept:** e2e toggles each layer without console errors.

**Pitfalls:** OSM tile usage policy: keep attribution and avoid bulk tile downloads.

#### T47 · Saved commutes and alerts · Features: N7 · Track B

**Depends on:** T43, T2A.

**Steps:** save a route with vehicle type; job checks new or newly verified issues within 30 m of saved routes and sends a push; users can delete saved routes.

**Accept:** unit test for the spatial match.

#### T48 · Search and reverse geocoding · Features: N9 · Track B

**Depends on:** T41.

**Steps:** proxy TomTom search and reverse geocode, restricted to India (`countrySet=IN` or the documented equivalent, `language=en-IN`) and biased to the pilot area; fill `address` on Issue create (async, non-blocking); search box on the map.

**Accept:** contract tests on fixtures.

### Phase 5 — AI features on free LLM tiers, with guardrails

#### T50 · LLM provider chain, validators, audit and quotas · Features: G1–G8 (infrastructure) · Track A · `[USER INPUT U3]`

**Depends on:** T17.

**Files:** `src/lib/external/llm/{types.ts,gemini.ts,groq.ts,ollama.ts}`, `src/lib/ai/{validators.ts,quota.ts,run.ts}`, tests.

**Steps:**

1. One provider interface `generate({ system, text, images?, jsonSchema }) → { json, provider, model }` with three adapters. Verify each in its official docs before writing it: **Gemini** (free tier: how to pass images and a response JSON schema, current free model IDs, rate limits shown in AI Studio), **Groq** (OpenAI-compatible chat endpoint, which free model accepts images, JSON mode), **Ollama** (optional local adapter for nightly batch jobs on Sujay's laptop). Record a fixture per adapter and call type.
2. Provider chain: Gemini → Groq → (Ollama, only inside the nightly batch) → rules fallback. Move to the next provider on quota (429), timeout or invalid JSON. Never send a request to any provider that would incur charges; read model IDs from env.
3. `runAi(feature, input, schema, opts)`: temperature 0; JSON-schema output; zod-parse; on invalid → `valid=false`; store every call in `AiRun` (provider, model, prompt version, input hash, output, valid, failReason); return cached output for the same input hash.
4. Validators: `verbatimCheck(fields, sourceText)` (every extracted string appears in the source, case-insensitive, whitespace-normalised); `numbersGrounded(text, facts)` (every number in the text appears in the facts); `confidenceAtLeast(x)`.
5. Quota: a daily call counter per provider (reset at the provider's reset time) capped by `AI_DAILY_CALL_CAP`, split per feature (G1 and G2 first); when all providers are exhausted the feature returns "disabled" and the app uses rules. Low-priority jobs (G3, G7 digests) wait for the next day.
6. Feature flags from `AI_FEATURES`.

**Accept:** unit tests for each validator (passing and failing cases); a fake client test shows invalid JSON → fallback; quota exhaustion → disabled.

**Pitfalls:** free tiers may use inputs to improve the provider's models and may be read by human reviewers, so send only what is already public (evidence photos after G8 checks, issue facts) and never names, emails, phone numbers or locations of private homes; send downscaled images (≤ 1024 px).

#### T51 · G1 photo triage · Track A

**Depends on:** T50, T23.

**Steps:** on new REPORT evidence, a job sends the photo with a fixed prompt and the schema from Appendix D; results stored as a suggestion; if the category disagrees with the reporter's choice, flag for desk review (never auto-change); `recapture_suspected = yes` sets "needs one extra verifier"; size class feeds S only when the reporter left it empty.

**Accept:** fixture-based unit tests; UI shows "AI-assisted" label.

#### T52 · G2 fix-check comparator · Track A

**Depends on:** T50, T27.

**Steps:** on CLAIMED_FIXED, compare the original report photo and the claim photo (Appendix D schema); "defect still visible: yes" or "same location: no" with confidence ≥ 0.7 adds a "Needs citizen check — AI flagged" badge and triggers verify-nearby (T2A); never changes status.

**Accept:** unit tests prove G2 output can't call the state machine.

#### T53 · G3 duplicate adjudicator · Track B

**Depends on:** T50, T14.

**Steps:** for `needsDuplicateReview` pairs, ask same / different / unclear; "same" with confidence ≥ 0.8 merges **only after** a desk click ("Merge suggested").

**Accept:** unit tests.

#### T54 · G4 signboard extraction · Track B

**Depends on:** T50, T62.

**Steps:** input = Tesseract OCR text + photo; output fields per Appendix D; drop any field failing `verbatimCheck` against the OCR text; result creates a `SegmentEvent` of type ROAD_CUT with `source = signboard`.

**Accept:** tests where a hallucinated work-order number is dropped.

#### T55 · G5 social signal radar · Track B

**Depends on:** T50, T30.

**Sources (all free, no X/Twitter):** (1) Google News RSS search for Bengaluru queries ("waterlogging", "tree fall", "road closed", "pothole", "traffic diversion"), no key; (2) Reddit r/bangalore new posts through the official Data API with an OAuth script app for non-commercial use, optional (skip if Sujay has no approved app); (3) in-app "quick heads-up" alerts from users, which are unsigned and therefore unverified.

**Steps:** job (3× a day; hourly while > 20 mm rain is forecast) fetches each source's recent items through `src/lib/external/{news,reddit}.ts`; the LLM (T50) extracts place text, category and time per Appendix D; drop items without a source URL, whose `place_text` isn't verbatim in the item text, or older than 6 h (12 h for news); geocode place text (T48, India only); create `Signal` rows that expire (waterlogging 3 h, others 12 h); show as hollow pins "Unverified · from news/Reddit · open source"; a nearby citizen can turn a signal into an Issue by capturing evidence. Flooded-underpass signals add a soft routing penalty only while unexpired.

**Accept:** fixture tests for each drop rule; quota respected.

**Pitfalls:** never show usernames on the map; link to the source instead. Follow Reddit's API terms and rate limits (OAuth, descriptive user agent); if Reddit access isn't available, ship with news and in-app alerts only and note it. News coverage lags by hours, so label news signals with their publish time.

#### T56 · G6 language bridge · Track B

**Depends on:** T50.

**Steps:** detect the note's language; store the original; produce an English summary for desks; translate status updates back for the reporter; numbers and place names must survive verbatim (validator).

**Accept:** tests with fixture notes.

#### T57 · G7 explainers and drafts · Track A scope: PI sentence rephrasing only

**Depends on:** T50, T34.

**Steps:** input = `sentenceFacts` JSON with fact IDs; output = text + used fact IDs; reject if `numbersGrounded` fails or an ID is unknown, then use the template. Track B adds escalation draft bodies (T63) and the weekly ward digest.

**Accept:** tests where an invented number causes fallback to the template.

#### T58 · G8 moderation · Track B

**Depends on:** T50.

**Steps:** comments: abuse or personal data → hidden pending desk review; photos: faces or number plates visible → owner is asked to crop before the photo goes public (client-side crop tool).

**Accept:** tests.

#### T59 · AI evaluation harness and flags · Track B · `[USER INPUT U9]`

**Depends on:** T51–T58.

**Files:** `scripts/eval-ai.ts`, `data/eval/labels.csv`.

**Steps:** run G1 and G2 against the labelled set; report accuracy per field and a confusion matrix; a feature may be enabled in production only if it meets its threshold (G1 category ≥ 90%, G2 "still visible" ≥ 85%); results saved to `docs/agent/ai-eval.md`.

**Accept:** the script runs on a 5-image sample set; thresholds enforced by a check in `env.ts` (feature stays off without a passing eval file).

### Phase 6 — Remember

#### T60 · Road timeline · Features: R1 · Track A scope: page + seeded history for one segment

**Depends on:** T30, T25.

**Files:** `src/app/(public)/road/[segmentId]/page.tsx`, `api/segments/[id]/timeline`.

**Steps:** merge Issue events, verified fixes, SegmentEvents and recurrences into one dated list, newest first; show agency labels and handoffs.

**Accept:** e2e on seed data; seed rows show a "seed" tag.

#### T61 · Recurrence detector · Features: R2 · Track B

**Depends on:** T60.

**Steps:** nightly: new Issues within 15 m and 90 days of a VERIFIED_FIXED Issue of a compatible category get `recurrenceOf`, a SegmentEvent RECURRENCE and +0.2 per recurrence in P.

**Accept:** unit test.

#### T62 · Signboard capture · Features: R3 · Track B

**Depends on:** T22.

**Steps:** a "Road cut / signboard" capture mode; Tesseract.js OCR in the browser (English + Kannada language data, lazy-loaded); send OCR text with the signed photo; G4 (T54) extracts fields.

**Accept:** e2e with a fixture image.

#### T63 · Escalation drafts · Features: R4 · Track B

**Depends on:** T16, T57.

**Steps:** after SLA breach, the issue page offers three drafts: a GBA or Sahaaya complaint, a public post, and an RTI application for the segment's work orders and repair records. Facts come from templates; G7 may write only the connecting text. The citizen copies and files it; the app never submits anything.

**Accept:** snapshot tests of the three templates with fixture facts.

#### T64 · Flood memory · Features: R5 · Track B

**Depends on:** T33, T60.

**Steps:** WATERLOGGING issues and verified signals become SegmentEvents WATERLOGGED with rainfall of the previous 24 h (Open-Meteo history); segments with ≥ 2 events get a pre-monsoon warning badge from April to June and a routing penalty when > 20 mm rain is forecast.

**Accept:** unit test.

#### T65 · Open hazard feed · Features: R6 · Track B

**Steps:** `GET /api/feed/hazards.geojson` with verified, open issues only (PI, category, band, updatedAt), cached 5 minutes, licence note.

**Accept:** contract test of the GeoJSON shape.

#### T66 · Photo points · Features: R7 · Track B

**Depends on:** T22.

**Steps:** a desk or trusted citizen creates a photo point (location + reference photo); later captures show the reference as a 40% overlay to align; the point page shows photos side by side over time.

**Accept:** e2e with fixtures.

### Phase 7 — Ship

#### T70 · Installable PWA · Features: P6 · Track A

**Steps:** web manifest, icons, service worker (offline shell, push handler, offline evidence queue from T23); install prompt.

**Accept:** Lighthouse PWA installability passes (record the output).

#### T71 · Deploy · Features: P1 · Track A · `[USER INPUT U8]`

**Steps:** Vercel project, env vars set by Sujay, production migrations with `prisma migrate deploy`, GitHub Actions secrets for jobs; health check green on the deployed URL.

**Accept:** deployed URL in `PROGRESS.md`; `/api/health` all green.

**Pitfalls:** check current Vercel Hobby function limits; keep each job under 10 s.

#### T72 · README and reframing · Features: P5 · Track A

**Steps:** rewrite README around the road truth ledger (what, why, how to run, env, architecture diagram as Mermaid, data sources and attributions); remove "Metropolitan Security Grid" wording everywhere (`git grep -i "security grid"`).

**Accept:** grep returns nothing; README lists every env var.

#### T73 · Demo seed and demo e2e · Features: P3 · Track A

**Steps:** `scripts/seed-demo.ts` creates labelled seed data for the pilot: ~10 segments with traffic samples, one road with a fix-then-fail history, a few issues across bands. Playwright `tests/e2e/demo.spec.ts` runs the demo story: citizen reports a pothole → desk tries to claim with a gallery image (no file input exists; assert it) → desk claims with a signed photo → a second citizen disputes → claim gap rises → road timeline shows the recurrence.

**Accept:** `npm run e2e -- demo` passes twice in a row (paste both outputs).

#### T74 · Final traceability audit · Track B (last)

**Steps:** for every row of Section 11: open the code, run the listed test, confirm the feature exists in the UI or API; tick the row with evidence; list any gaps as new tasks and do them.

**Accept:** every row ticked; gap list empty.

## 11. Traceability matrix — all 57 features

The agent ticks a row only after running its proof and pasting the output in `PROGRESS.md`. T74 re-checks every row.

| Done | Feature | Name | Task(s) | Proof |
| --- | --- | --- | --- | --- |
| [ ] | F1 | Save report photos | T13, T23 | `tests/contract/storage.test.ts`; e2e photo visible on issue page |
| [x] | F2 | Input validation, no fake GPS | T12 | `tests/unit/api-validation.test.ts` |
| [ ] | F3 | Votes replaced by confirmations | T10, T15 | no `/vote` route; points tests |
| [ ] | F5 | SLA breach job | T16 | `tests/unit/jobs-sla.test.ts` |
| [ ] | F6 | Merge duplicates | T14 | `tests/unit/issues-merge.test.ts` |
| [ ] | F7 | PostGIS database | T04, T10 | `scripts/db-check.ts` output; geom trigger test |
| [ ] | F8 | AI off the request path | T17 | `git grep -i ollama src` empty; AiJob tests |
| [ ] | F9 | XP for verifying | T15 | `tests/unit/points.test.ts` |
| [ ] | F10 | New categories | T10 | schema enum; category picker e2e |
| [ ] | A1 | Two desk accounts, shared dashboard | T11, T26 | e2e desk-a/desk-b |
| [ ] | A2 | Public action log | T25, T28 | log tests; DB blocks UPDATE/DELETE |
| [ ] | A3 | Agency label + handoff counter | T25 | reassign test |
| [ ] | A4 | Desk scorecard | T29 | claim-gap unit test (by desk) |
| [ ] | V1 | In-app camera only | T22 | e2e: no file input on capture |
| [ ] | V2 | Capture nonce | T21 | nonce tests |
| [ ] | V3 | Signed evidence | T20, T22 | signature tests (byte, lat, time tamper) |
| [ ] | V4 | Two-key closure | T24, T27 | state machine table tests |
| [ ] | V5 | Verifier rules | T27 | eligibility tests |
| [ ] | V6 | Claim-gap page | T29 | unit test + page e2e |
| [ ] | V8 | Verify-nearby push | T2A | recipient selection test |
| [ ] | M1 | Road segments + snapping | T30 | snap test on fixture |
| [ ] | M2 | Exposure proxies | T31 | GTFS fixture test |
| [ ] | M3 | Traffic sampling | T32 | TomTom contract test; cap test |
| [ ] | M4 | Priority Index | T34 | three worked examples (Appendix A.4) |
| [ ] | I1 | Season + forecast boost | T33, T34 | season tests by month; boost test |
| [ ] | I2 | Score explained | T35 | component test |
| [ ] | M5 | Repair-window planner | T36 | fixture test |
| [ ] | M9 | Commuter-hours estimate | T37 | unit test |
| [ ] | N1 | Server-side TomTom routing | T41 | contract test; no `project-osrm` |
| [ ] | N2 | Segment-based hazard matching | T42 | parallel road and flyover fixtures |
| [ ] | N3 | Cost-based choice, vehicle profiles | T43 | per-vehicle choice test |
| [ ] | N4 | Diversion cap | T44 | unit test |
| [ ] | N5 | Departure advice | T45 | fixture test |
| [ ] | N6 | Map layers | T40, T46 | layer toggle e2e |
| [ ] | N7 | Saved commutes + alerts | T47 | spatial match test |
| [ ] | N8 | GPS accuracy gate + pin bounds | T12, T22 | validation test; capture e2e |
| [ ] | N9 | Search + reverse geocoding | T48 | contract tests |
| [ ] | R1 | Road timeline | T60 | e2e on seed |
| [ ] | R2 | Recurrence detector | T61 | unit test |
| [ ] | R3 | "Who dug this?" capture | T62 | e2e with fixture image |
| [ ] | R4 | Escalation drafts | T63 | snapshot tests |
| [ ] | R5 | Flood memory | T64 | unit test |
| [ ] | R6 | Open hazard feed | T65 | GeoJSON contract test |
| [ ] | R7 | Photo points | T66 | e2e |
| [ ] | G1 | Photo triage | T51 | fixture tests; never auto-changes category |
| [ ] | G2 | Fix-check comparator | T52 | test: cannot call state machine |
| [ ] | G3 | Duplicate adjudicator | T53 | merge needs desk click |
| [ ] | G4 | Signboard extraction | T54 | hallucinated field dropped |
| [ ] | G5 | Signal radar (news, Reddit, in-app; no X) | T55 | drop rules; expiry |
| [ ] | G6 | Language bridge | T56 | numbers and places verbatim |
| [ ] | G7 | Explainers and drafts | T57 | invented number → template |
| [ ] | G8 | Moderation | T58 | unit tests |
| [ ] | P1 | Deploy | T71 | deployed health check |
| [ ] | P2 | Privacy by design | T2B | retention test; policy page |
| [ ] | P3 | Tests for demo and logic | T00, T03, T73 | demo e2e passes twice |
| [ ] | P5 | Drop "Security Grid" framing | T01, T72 | grep empty |
| [ ] | P6 | Installable PWA | T70 | Lighthouse installability |

Infrastructure tasks without a feature row: T02 (env), T40 (map refactor), T50 (LLM provider chain and guardrails), T59 (AI eval), T74 (audit). They are still required.

---

## 12. Ledger templates

**`docs/agent/PROGRESS.md`**

~~~markdown
# Progress ledger
Current task: T__ · Track A/B · started <date>

## Blocked (needs Sujay)
- [U_/DECISION] <question> — asked in task T__ — default if approved: <...>

## Done
### T__ · <title> · <date>
- Changed: <files>
- Verified against docs: <library/API, version, URL or file checked>
- Checks run:
  ```
  <trimmed real output of lint / typecheck / test / build / task-specific checks>
  ```
- Feature rows ticked: <IDs>
- Notes for the next task: <anything the next task must know>
~~~

**`docs/agent/DECISIONS.md`** — `date · task · decision · why · alternatives rejected`.

**`docs/agent/ASSUMPTIONS.md`** — `date · task · assumption · how to check it · status (open, confirmed, wrong-fixed)`.

---

## Appendix A — Importance and routing constants

All values below go in `config/priority.ts`. They are starting values to tune after one season of data.

### A.1 Factors

| Factor | Formula | Defaults and lookups |
| --- | --- | --- |
| S Severity | `min(1, base[category] × size[sizeClass] × position[lanePosition])` | base: POTHOLES 0.6, DRAINAGE 0.7 (0.9 if open drain or missing cover), WATERLOGGING 0.7, STREETLIGHTS 0.5, SIDEWALKS 0.5, FOOTPATH 0.5, TRAFFIC_SIGNS 0.6 (0.9 if signal down), ROAD_CUT 0.6, TREE_FALL 0.6 (0.9 if blocking a lane), TRASH 0.3, GRAFFITI 0.1, OTHER 0.4 · size: small 0.7, medium 1.0, large 1.3, unknown 1.0 · position: wheel path 1.2, otherwise 1.0 |
| E Exposure | `log10(1 + Q) / log10(1 + 12000)` with `Q = laneVolume[class] × lanes × (0.6 + 0.8 × r) × 1.2 + 40 × busesPerHour + pedestrians` | laneVolume (vehicles/hour/lane): trunk 1800, primary 1200, secondary 800, tertiary 500, residential 150, service 80, footway 0 · default lanes: trunk/primary 3, secondary/tertiary 2, others 1 · r = weekday peak congestion `1 − current/freeFlow` (default 0.3 without samples) · pedestrians within 200 m: school 300, market 300, hospital 200, bus stop 100, cap 1000 |
| V Vulnerability | `min(1, max(road[class], poi) + 0.2 × dark)` | road: trunk/primary 0.6, secondary/tertiary 0.7, residential/service 0.8, footway 0.9 · poi: school or hospital within 200 m 0.9, bus stop within 50 m 0.7 · dark = an open STREETLIGHTS issue within 50 m |
| U Usability | `blocked[share] × (0.5 + 0.5 × access)` | blocked: none 0.1, part lane 0.3, one lane 0.6, full (or footpath fully blocked) 1.0 · access = `clamp((detourTime / normalTime − 1) / 0.5, 0, 1)`, at least 0.8 if `soleAccess`; default 0.3 before routing data exists |
| P Persistence | `min(1, 0.6 × ageHours / slaHours + 0.2 × recurrences)` | SLA from the agency (default 72 h) |
| C Confidence | `0.5 + 0.5 × min(1, n / 3)` | n = independent signed REPORT/CONFIRM evidence from distinct users; offline or recapture-suspected evidence counts 0.5 |
| Σ Season | `min(1.8, matrix[category][season] × rain × event)` | rain = 1.2 if > 20 mm forecast in the next 72 h and the category is water-sensitive (DRAINAGE, WATERLOGGING, POTHOLES, ROAD_CUT, TREE_FALL); event = 1.1 on a configured festival or procession day; seasons in IST: Summer Mar–May, SW monsoon Jun–Sep, NE monsoon Oct–Dec, Winter Jan–Feb |

**Final:** `PI = min(100, 100 × C × Σ × (0.30S + 0.20E + 0.15V + 0.20U + 0.15P))`; if `ageHours > 2 × slaHours` then `PI = max(PI, 60)`. Bands: CRITICAL ≥ 70, HIGH 50–69, MEDIUM 30–49, LOW < 30.

### A.2 Seasonal matrix

| Category | Summer (Mar–May) | SW monsoon (Jun–Sep) | NE monsoon (Oct–Dec) | Winter (Jan–Feb) |
| --- | --- | --- | --- | --- |
| DRAINAGE | 1.3 | 1.6 | 1.5 | 0.9 |
| WATERLOGGING | 1.0 | 1.6 | 1.5 | 0.8 |
| POTHOLES | 1.0 | 1.4 | 1.3 | 1.0 |
| ROAD_CUT | 1.0 | 1.4 | 1.3 | 1.0 |
| TREE_FALL | 1.2 | 1.5 | 1.3 | 0.9 |
| STREETLIGHTS | 1.0 | 1.2 | 1.2 | 1.1 |
| TRASH | 1.3 | 1.3 | 1.2 | 1.0 |
| SIDEWALKS, FOOTPATH | 1.1 | 1.2 | 1.1 | 1.0 |
| TRAFFIC_SIGNS | 1.0 | 1.1 | 1.1 | 1.0 |
| GRAFFITI, OTHER | 1.0 | 1.0 | 1.0 | 1.0 |

### A.3 Routing cost

`hazardCost(route) = Σ over open issues on matched segments of (PI / 100) × sensitivity[vehicle][category]`

`score(route) = travelTimeSeconds × (1 + λ × hazardCost)`, λ default 0.15, slider range 0–0.5. Lowest score wins. CRITICAL issues with blocked share "full" become hard `avoidAreas` (a rectangle around the segment, 30 m padding).

| Category | Motorcycle | Car | Pedestrian | Wheelchair |
| --- | --- | --- | --- | --- |
| POTHOLES | 1.0 | 0.5 | 0.1 | 0.3 |
| WATERLOGGING | 1.0 | 0.8 | 0.8 | 1.0 |
| DRAINAGE (open drain or cover) | 1.0 | 0.6 | 1.0 | 1.0 |
| SIDEWALKS, FOOTPATH | 0.1 | 0 | 1.0 | 1.5 |
| STREETLIGHTS (19:00–06:00 IST only) | 0.6 | 0.3 | 0.8 | 0.8 |
| ROAD_CUT | 0.8 | 0.5 | 0.6 | 1.0 |
| TREE_FALL | 1.0 | 1.0 | 0.8 | 1.0 |
| TRAFFIC_SIGNS | 0.3 | 0.3 | 0.5 | 0.5 |
| TRASH, GRAFFITI, OTHER | 0.1 | 0 | 0.2 | 0.3 |

### A.4 Worked examples (unit tests must reproduce these within ±0.5)

| # | Case | S | E | V | U | P | C | Σ | Raw PI | Final |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Large pothole in the wheel path; primary road, 3 lanes, r = 0.5, 30 buses/h, bus stop within 50 m; part lane blocked, access 0.2; open 30 h of a 72 h SLA; 1 previous recurrence; 3 reports; July with 35 mm forecast | 0.936 | 0.919 | 0.70 | 0.18 | 0.45 | 1.0 | 1.68 | 113.1 | 100 · CRITICAL |
| 2 | Broken footpath fully blocked near a school; residential, 1 lane, no samples, no buses; access 0.3; open 200 h of 72 h; 1 report; February | 0.50 | 0.651 | 0.90 | 0.65 | 1.0 | 0.667 | 1.0 | 46.4 | 60 (floor) · HIGH |
| 3 | Small trash pile; secondary road, 2 lanes, no samples, 5 buses/h; nothing blocked, access 0.3; open 10 h of 72 h; 2 reports; April | 0.21 | 0.799 | 0.70 | 0.065 | 0.083 | 0.833 | 1.3 | 38.3 | 38.3 · MEDIUM |

---

## Appendix B — Prisma schema v2 (target)

Relations to `User` are omitted for brevity; `prisma format` adds back-relations. Geography columns are nullable and filled by triggers (T10).

```prisma
enum Role { CITIZEN AUTHORITY }
enum Status { OPEN CONFIRMED ASSIGNED IN_PROGRESS CLAIMED_FIXED VERIFIED_FIXED DISPUTED REJECTED }
enum Category { POTHOLES DRAINAGE WATERLOGGING STREETLIGHTS SIDEWALKS FOOTPATH TRAFFIC_SIGNS ROAD_CUT TREE_FALL GRAFFITI TRASH OTHER }
enum Band { CRITICAL HIGH MEDIUM LOW }
enum EvidenceRole { REPORT CONFIRM CLAIM_FIX VERIFY }
enum SegmentEventType { REPORTED VERIFIED_FIX RESURFACED ROAD_CUT WATERLOGGED RECURRENCE }

model Agency {
  id       String  @id @default(cuid())
  code     String  @unique
  name     String
  slaHours Int     @default(72)
  issues   Issue[]
}

model Ward {
  id    String @id @default(cuid())
  code  String @unique
  name  String
  geom  Unsupported("geography(MultiPolygon,4326)")?
}

model RoadSegment {
  id                   String   @id @default(cuid())
  osmWayId             BigInt
  name                 String?
  roadClass            String
  lanes                Int?
  busesPerHour         Float    @default(0)
  pedestrianEstimate   Float    @default(0)
  nearSchoolOrHospital Boolean  @default(false)
  soleAccess           Boolean  @default(false)
  wardId               String?
  tracked              Boolean  @default(false)
  geom                 Unsupported("geography(LineString,4326)")?
  issues               Issue[]
  events               SegmentEvent[]
  samples              TrafficSample[]
}

model Issue {
  id                   String    @id @default(cuid())
  category             Category
  status               Status    @default(OPEN)
  lat                  Float
  lng                  Float
  geom                 Unsupported("geography(Point,4326)")?
  address              String?
  wardId               String?
  segmentId            String?
  agencyId             String?
  handoffCount         Int       @default(0)
  sizeClass            String?
  lanePosition         String?
  blockedShare         String    @default("none")
  hazardFlag           String?   // open_drain | signal_down | blocking
  priority             Float     @default(0)
  band                 Band      @default(LOW)
  piBreakdown          Json?
  piText               String?
  bandOverride         Band?
  bandOverrideNote     String?
  recurrenceOf         String?
  needsDuplicateReview Boolean   @default(false)
  slaDueAt             DateTime
  slaBreached          Boolean   @default(false)
  isSeed               Boolean   @default(false)
  createdAt            DateTime  @default(now())
  updatedAt            DateTime  @updatedAt
  reports              Report[]
  verifications        Verification[]
  actions              ActionLog[]
  segment              RoadSegment? @relation(fields: [segmentId], references: [id])
  agency               Agency?      @relation(fields: [agencyId], references: [id])
}

model Report {
  id           String       @id @default(cuid())
  issueId      String
  userId       String
  role         EvidenceRole
  photoUrl     String
  photoSha256  String
  signature    String
  deviceKeyId  String?
  nonce        String?      @unique
  offline      Boolean      @default(false)
  legacy       Boolean      @default(false)
  lat          Float
  lng          Float
  gpsAccuracyM Float
  capturedAt   DateTime
  note         String?
  noteLang     String?
  noteEnglish  String?
  aiTriage     Json?
  isSeed       Boolean      @default(false)
  createdAt    DateTime     @default(now())
  issue        Issue        @relation(fields: [issueId], references: [id])
}

model DeviceKey {
  id        String   @id @default(cuid())
  userId    String
  publicJwk Json
  createdAt DateTime @default(now())
  revokedAt DateTime?
}

model EvidenceNonce {
  id        String    @id @default(cuid())
  userId    String
  value     String    @unique
  expiresAt DateTime
  usedAt    DateTime?
}

model ActionLog {      // append-only: DB trigger rejects UPDATE and DELETE
  id        String   @id @default(cuid())
  issueId   String
  actorId   String   // desk user id or "system"
  action    String   // CONFIRM | ASSIGN | REASSIGN_AGENCY | START | CLAIM_FIX | OVERRIDE_BAND | REJECT | REOPEN | SYSTEM_SLA | SYSTEM_VERIFIED | SYSTEM_DISPUTED
  note      String?
  reportId  String?
  fromStatus Status?
  toStatus   Status?
  createdAt DateTime @default(now())
  issue     Issue    @relation(fields: [issueId], references: [id])
}

model Verification {
  id         String   @id @default(cuid())
  issueId    String
  verifierId String
  reportId   String
  verdict    String   // FIXED | NOT_FIXED
  weight     Float
  createdAt  DateTime @default(now())
  issue      Issue    @relation(fields: [issueId], references: [id])
  @@unique([issueId, verifierId])
}

model SegmentEvent {
  id             String           @id @default(cuid())
  segmentId      String
  type           SegmentEventType
  agency         String?
  contractor     String?
  workOrder      String?
  source         String           // issue | signboard | desk | signal
  sourceId       String?
  occurredAt     DateTime
  isSeed         Boolean          @default(false)
  segment        RoadSegment      @relation(fields: [segmentId], references: [id])
}

model TrafficSample {
  id            String      @id @default(cuid())
  segmentId     String
  sampledAt     DateTime
  currentSpeed  Float
  freeFlowSpeed Float
  confidence    Float?
  isSeed        Boolean     @default(false)
  segment       RoadSegment @relation(fields: [segmentId], references: [id])
  @@index([segmentId, sampledAt])
}

model WeatherForecast {
  id         String   @id @default(cuid())
  pointKey   String
  hour       DateTime
  precipMm   Float
  precipProb Float
  tempC      Float
  fetchedAt  DateTime @default(now())
  @@unique([pointKey, hour])
}

model Signal {
  id        String   @id @default(cuid())
  source    String   // news | reddit | app
  sourceUrl String   @unique
  sourceText String
  placeText String
  category  Category
  lat       Float?
  lng       Float?
  expiresAt DateTime
  issueId   String?
  createdAt DateTime @default(now())
}

model AiJob {
  id        String   @id @default(cuid())
  feature   String   // G1..G8
  targetId  String
  status    String   @default("queued") // queued | done | failed | skipped
  attempts  Int      @default(0)
  createdAt DateTime @default(now())
  @@index([status, feature])
}

model AiRun {
  id         String   @id @default(cuid())
  feature    String
  model      String
  promptVer  String
  inputHash  String
  output     Json
  valid      Boolean
  failReason String?
  costUsd    Float    @default(0)
  createdAt  DateTime @default(now())
  @@index([feature, inputHash])
}

model SavedRoute {
  id        String   @id @default(cuid())
  userId    String
  name      String
  vehicle   String
  geomJson  Json     // also mirrored to a geography column by trigger
  createdAt DateTime @default(now())
}

model PushSubscription {
  id        String   @id @default(cuid())
  userId    String
  endpoint  String   @unique
  keys      Json
  createdAt DateTime @default(now())
}
```

---

## Appendix C — External contracts the agent must verify before use

The endpoints below are written from knowledge as of mid-2026 and may have changed. For each one: open the official docs, confirm the URL, parameters and response fields, make one real call, save the response (key removed) as a fixture, and write a contract test. Record the docs URL and date in `PROGRESS.md`.

| Service | Use | What to confirm |
| --- | --- | --- |
| TomTom Routing — Calculate Route | N1, N3, N5, U access | URL shape (`/routing/1/calculateRoute/{points}/json`), `traffic`, `travelMode` values (car, motorcycle, pedestrian), `maxAlternatives` limit, `departAt`, POST body `avoidAreas.rectangles` limit, geometry field names |
| TomTom Traffic — Flow Segment Data | M3 | URL (`/traffic/services/4/flowSegmentData/...`), zoom effect, fields `currentSpeed`, `freeFlowSpeed`, `currentTravelTime`, `confidence`, `roadClosure`, `coordinates` |
| TomTom Traffic flow tiles | N6 | Tile URL template and styles; whether keys can be domain-restricted |
| TomTom Search / Reverse Geocode | N9 | URLs and address fields for India |
| TomTom free-tier terms | all TomTom | Whether storing flow samples is allowed; monthly free quotas |
| Open-Meteo forecast and archive | I1, M5, R5 | `hourly=precipitation,precipitation_probability,temperature_2m`, `timezone=Asia/Kolkata`, archive endpoint; attribution text |
| Overpass API | M1, M2 | Endpoint, timeout and size limits, usage policy |
| Gemini API (free tier) | G1–G8 | Free model IDs and the project's daily limits in AI Studio; image input format; response JSON schema syntax; free-tier data-use terms |
| Groq API (free plan) | G1–G8 fallback | OpenAI-compatible endpoint, free vision model ID, JSON mode with images, daily and per-minute limits |
| Ollama (optional, local) | nightly batch | `/api/chat` with images and `format` JSON schema for the installed version |
| Google News RSS search | G5 | Search feed URL format, parameters for India and English (`hl=en-IN&gl=IN&ceid=IN:en`), item fields; terms of use |
| Reddit Data API | G5 (optional) | Current access rules for non-commercial script apps, OAuth flow, rate limits, required user agent |
| TomTom coverage in India | M3, N1 | Live traffic availability and `confidence` on Bengaluru arterial vs residential roads; India `travelMode` support |
| Supabase Storage JS | F1 | Upload and public URL API for the installed `@supabase/supabase-js` version |
| web-push (npm) | V8, N7 | `setVapidDetails`, `sendNotification`, error codes for expired subscriptions (delete on 404/410) |
| Tesseract.js | R3 | Worker creation API for the installed major version; `eng` and `kan` language data |
| Next.js 16 | all | Route handler signatures, `params` as a Promise, whether `middleware.ts` is now `proxy.ts`, caching defaults |
| Prisma 7 | T04, T10 | `prisma.config.ts` datasource and direct URL settings, `Unsupported` field rules, raw query APIs |
| NextAuth 4 with Next 16 | T12 | Session typing via module augmentation; `getServerSession` usage in route handlers |
| Vercel Hobby | T71 | Function duration limits, cron alternatives, non-commercial terms |

---

## Appendix D — LLM output schemas and prompt skeletons

Every prompt starts with the same system text:

```text
You are a careful assistant inside a civic-infrastructure app. Only use information present in the
input. If you cannot tell, answer "unknown" (or "unclear"). Never guess names, numbers, dates or
places. Output must match the JSON schema exactly. Do not add fields.
```

**G1 photo triage (input: one photo, the reporter's chosen category)**

```json
{ "type": "object", "additionalProperties": false,
  "required": ["category","size_class","lane_position","water_present","recapture_suspected","faces_or_plates","confidence"],
  "properties": {
    "category": { "enum": ["POTHOLES","DRAINAGE","WATERLOGGING","STREETLIGHTS","SIDEWALKS","FOOTPATH","TRAFFIC_SIGNS","ROAD_CUT","TREE_FALL","GRAFFITI","TRASH","OTHER","unknown"] },
    "size_class": { "enum": ["small","medium","large","unknown"] },
    "lane_position": { "enum": ["wheel_path","edge","footpath","unknown"] },
    "water_present": { "enum": ["yes","no","unknown"] },
    "recapture_suspected": { "enum": ["yes","no","unknown"] },
    "faces_or_plates": { "enum": ["yes","no","unknown"] },
    "confidence": { "type": "number", "minimum": 0, "maximum": 1 } } }
```

**G2 fix-check (input: report photo, claim photo)**

```json
{ "type": "object", "additionalProperties": false,
  "required": ["same_location","defect_still_visible","confidence"],
  "properties": {
    "same_location": { "enum": ["yes","no","unclear"] },
    "defect_still_visible": { "enum": ["yes","no","unclear"] },
    "confidence": { "type": "number", "minimum": 0, "maximum": 1 } } }
```

**G3 duplicate (input: two notes, categories, distance, two photos)** → `{ "verdict": "same" | "different" | "unclear", "confidence": number }`

**G4 signboard (input: OCR text, photo)** → `{ "agency": string|null, "contractor": string|null, "work_order": string|null, "start_date": string|null, "end_date": string|null }`. Code drops any non-null value not found verbatim in the OCR text.

**G5 signal extraction (input: one news or Reddit item: url, title, text, published time)** → `{ "relevant": "yes"|"no", "place_text": string|null, "category": enum|"unknown", "happened_at": string|null }`. Code drops items that aren't relevant, whose `place_text` isn't inside the item text, that geocode outside India, or that are older than 6 h (12 h for news).

**G6 language (input: note)** → `{ "language": string, "english": string }`. Code rejects if any number or capitalised place name in the original is missing from `english`.

**G7 explainer (input: facts as `{id, text}` list)** → `{ "text": string, "fact_ids": string[] }`. Code rejects unknown IDs and any number not present in the cited facts.

**G8 moderation (input: comment text or photo)** → `{ "abuse": "yes"|"no", "personal_info": "yes"|"no", "faces_or_plates": "yes"|"no"|"unknown" }`.
