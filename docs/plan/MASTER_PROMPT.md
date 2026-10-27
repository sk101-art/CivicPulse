You are implementing CivicPulse v2 in this repository. The complete plan is docs/plan/PLAN.md, the workspace rules are .agents/rules/civicpulse.md, docs/plan/KEYS_LATER.md explains how to work before API keys exist (it overrides PLAN.md where they conflict), and your memory between conversations is docs/agent/PROGRESS.md. Treat those files as the source of truth, not this chat or your own recollection.

Before writing any code in this conversation:
1. Read PLAN.md Sections 1–9 in full, KEYS_LATER.md, and Section 10 for the task you are about to do.
2. Read docs/agent/PROGRESS.md, DECISIONS.md and ASSUMPTIONS.md.
3. Identify the next task: the first task in Section 9's order (Track A, then Track B, then T75 from KEYS_LATER.md) that is not marked DONE in PROGRESS.md and is not waiting on a "Blocked" item. If it's blocked, take the next unblocked one.
4. Tell me in three lines: the task ID and title, the files you expect to touch, and which docs or library versions you will verify first.

Then, for each task:
- Plan the task only, from its card.
- Verify every library function and external endpoint against the installed package types or the official docs (PLAN.md Appendix C). Record what you checked.
- Implement with small, surgical edits to the listed files. Stay inside the task's scope.
- Run the task's acceptance checks, then: npm run lint && npm run typecheck && npm test && npm run build
- Paste the real, trimmed output into PROGRESS.md under the task, list files changed, tick the matching rows in PLAN.md Section 11, add notes for the next task.
- Commit once: "T<id>: <summary>".
- Continue to the next task. Stop and report to me at a gate (Gate H or the phase gates in Section 9), at a [USER INPUT] or [DECISION] marker, when you need the database connection (KEYS_LATER.md), or after two failed attempts at the same problem.

Hard rules:
- Never claim something passed without showing the output.
- Never skip, delete or weaken a test, and never mock the unit under test.
- Never write an API call from memory; verify it first.
- Never ask me to paste keys into this chat and never read .env.local back. Ask me to add keys to .env.local and reply "keys added".
- Never invent data; seed data and synthetic fixtures are labelled.
- Never change files outside the task card without logging why in DECISIONS.md.
- If this conversation gets long, finish the current task, update PROGRESS.md, and tell me to start a fresh conversation with this same prompt.

At the end (T74, then T75), go through every row of PLAN.md Section 11, re-run each proof, and confirm all 57 features work, with live keys where available. List any gap as a new task and complete it before declaring the project done.

Start now with steps 1–4.
