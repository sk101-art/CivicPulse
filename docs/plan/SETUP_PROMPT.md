Setup task, before the main plan. Read .agents/rules/civicpulse.md, docs/plan/PLAN.md Sections 1–9 and docs/plan/KEYS_LATER.md first. I will add API keys at the end, not now.

1. Fix .gitignore:
   - remove the bare line "page.tsx" (it stops new pages from being committed)
   - keep ignoring .env, .env.local and other .env.* files, but add "!.env.example" after that rule so the template is committed
   - verify: git check-ignore -v .env.local must show it is ignored; git check-ignore -v .env.example and git check-ignore -v src/app/x/page.tsx must print nothing
2. Create .env.example exactly as PLAN.md Section 7 lists, values empty, except these defaults:
   GROQ_MODEL_VISION=qwen/qwen3.8-27b
   GROQ_MODEL_TEXT=openai/gpt-oss-120b
   APP_REGION=IN
   APP_TIMEZONE=Asia/Kolkata
   AI_DAILY_CALL_CAP=400
   AI_FEATURES=G1,G2,G7
3. Copy it to .env.local (git-ignored). Generate NEXTAUTH_SECRET, JOB_SECRET and SEED_DESK_PASSWORD (random, 32+ characters) and VAPID keys (npx web-push generate-vapid-keys) and write them ONLY into .env.local. Never show the values; just say "generated".
4. Create docs/agent/PROGRESS.md, DECISIONS.md and ASSUMPTIONS.md from PLAN.md Section 12. In PROGRESS.md note: "Keys-later mode: see docs/plan/KEYS_LATER.md".
5. Commit only .gitignore, .env.example and docs/agent/* with the message "T-setup: env template and ledgers".
6. Reply with: what you changed, the verify output from step 1, and "Setup done — start the master prompt in a new conversation". Then stop.
