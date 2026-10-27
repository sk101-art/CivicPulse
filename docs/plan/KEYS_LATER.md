# Keys-later mode (read together with PLAN.md)

Sujay will add API keys at the END of the build, not now. This file changes how you handle that. It overrides PLAN.md wherever they conflict.

## What changes
1. **Database is the one exception.** The app can't run or be tested without a database. When you reach T04, stop and ask Sujay for ONE thing only: the Supabase database connection strings (pooled `APP_DATABASE_URL` and direct `DIRECT_DATABASE_URL`), which he pastes into `.env.local` himself. Until then, do T00–T03 and T40 (no database needed).
2. **All other keys come last** (TomTom, Gemini, Groq, Reddit, Supabase storage key). Build every adapter anyway:
   - Read the official docs first (rule 3) and write the adapter against them.
   - Write test fixtures by hand from the documented response format. Put them in `tests/fixtures/<service>/synthetic-*.json` and add `"_synthetic": true` to each file.
   - Contract tests use these fixtures. Nothing calls a real third-party API without a key.
   - Each feature that needs a missing key must show a clear "disabled — key not set" state instead of crashing (`src/lib/env.ts` treats these keys as optional in keys-later mode).
   - Log every synthetic fixture in `docs/agent/ASSUMPTIONS.md` as "to verify with a live call in T75".
3. **Never ask Sujay to paste keys into chat.** When keys are needed, ask him to put them in `.env.local` and reply "keys added". Never read `.env.local` back into the chat.

## New final task: T75 · Live key check (runs after T74)
When Sujay says "keys added":
1. Run `npm run check:keys` (create it in T02): it reports which env vars are set (yes/no only, never the values).
2. For each service now configured, make ONE real call, save the response as a real fixture (key removed), and compare it with the synthetic one. Fix the adapter if the real format differs; re-run its tests.
3. Delete the `synthetic-*` fixtures that now have real replacements, and close their ASSUMPTIONS entries.
4. Run the full gate and the demo e2e against real services. Record everything in PROGRESS.md.
5. Report which features are live and which are still disabled (and why).
