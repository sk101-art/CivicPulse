# CivicPulse — workspace rules for the coding agent

Always apply. The full plan is `docs/plan/PLAN.md`; the progress ledger is `docs/agent/PROGRESS.md`.

## Product
CivicPulse is a road truth ledger for Bengaluru: citizens report road issues with signed on-site photos, two authority "desk" accounts act on them, every desk action is public, fixes count only after independent citizen verification, a rules-based Priority Index ranks issues, and every road keeps a public history. Web app only (installable PWA). No sensors, no native app.

## Working method
1. One task card at a time, in the order of PLAN.md Section 9. Never start the next card before the current one is DONE with evidence.
2. At the start of every task: re-read the card, these rules, and the last 30 lines of PROGRESS.md.
3. A task is DONE only when its acceptance checks were run and their real, trimmed output is pasted in PROGRESS.md. Never claim a check passed without output.
4. After every task run: `npm run lint && npm run typecheck && npm test && npm run build`. Do not move on with anything red that was green before.
5. One commit per task: `T<id>: <summary>`.
6. Stop at `[USER INPUT]` and `[DECISION]` markers: write the question under "Blocked" in PROGRESS.md, then continue with the next task that doesn't depend on it.
7. After two failed attempts at the same problem, stop, log what you tried and the exact error under "Blocked", and move on.
8. When the conversation gets long, finish the current task, update PROGRESS.md, and tell Sujay to start a new conversation with the master prompt.

## Truthfulness
9. Verify every library call and external endpoint against the installed package's types or the official docs before writing it. Do not write APIs from memory. Applies especially to Next.js 16, Prisma 7, NextAuth 4, TomTom, Gemini, Groq, web-push, Tesseract.js, Supabase. Note what you checked in PROGRESS.md.
10. Every third-party API lives in one adapter in `src/lib/external/`, with a recorded fixture (key removed) in `tests/fixtures/` and a contract test. Tests never call real third-party APIs.
11. Never delete, skip or weaken a test to make it pass, and never mock the unit under test. If a test is wrong, explain in DECISIONS.md and fix it in its own commit.
12. Never invent data. Seed rows carry `isSeed = true` and show a "seed" tag in the UI.
13. Log assumptions in ASSUMPTIONS.md with the task ID.

## Code boundaries
14. Edit only the files the card lists unless you log why in DECISIONS.md. No drive-by refactors, renames or reformatting. Never rewrite a large file from memory; edit the specific region.
15. Database changes only via `prisma migrate dev --name <task>-<slug>`. PostGIS SQL goes in a `--create-only` migration you edit. Never `db push`; never edit an applied migration. Check generated SQL before applying.
16. Geography columns are nullable `Unsupported(...)` fields filled by DB triggers from `lat`/`lng`; Prisma never writes them.
17. Issue status changes only through `src/lib/issues/stateMachine.ts`. No route sets `status` directly. LLM output can never trigger a transition.
18. ActionLog is append-only, enforced by a DB trigger.
19. The Priority Index is computed only by `src/lib/priority` from `config/priority.ts`. Never by an LLM.
20. LLM calls go through `src/lib/ai/run.ts` and the free provider chain (Gemini → Groq → rules; Ollama only in nightly batch): temperature 0, JSON schema output, zod validation, verbatim and number-grounding checks, AiRun audit row, quota check, rules fallback. Free tiers may train on inputs, so prompts contain only public evidence and issue facts, never names, emails, phone numbers or private addresses.
21. External calls (LLM, traffic sampling, weather, recompute) run as jobs, not in the request path. Routing and geocoding are the only request-path TomTom calls, cached 5 minutes.

## Security and platform
22. Secrets only via `src/lib/env.ts`. Never in code, fixtures, logs or chat. Server-only modules import `server-only`. Never log tokens or sessions.
23. Browser-only code (Leaflet, Web Crypto, IndexedDB, camera, geolocation) lives in `'use client'` components loaded with `ssr: false` where needed.
24. Web Crypto ECDSA signatures are IEEE P1363; verify in Node with `dsaEncoding: 'ieee-p1363'` and a fixed canonical JSON key order.
25. Sujay develops on Windows: use npm scripts and `tsx` scripts, not bash-only syntax, for anything he runs.
26. Times: store UTC, compute seasons, peaks and repair windows in Asia/Kolkata.

## Zero cost and India only
27. Every service must stay free at pilot scale: never enable billing on Gemini, never call the X/Twitter API, never add a paid service. Respect daily caps.
28. Traffic, routing, search and geocoding are India only: reject coordinates outside India; pilot region is Bengaluru.

## Out of scope
Paid APIs (including Grok/xAI and the X API), bump or accelerometer sensing, Capacitor or native wrappers, C2PA, per-department logins, other cities, payments, anything not in PLAN.md Section 11.
