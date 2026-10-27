# Decisions ledger

`date · task · decision · why · alternatives rejected`

| Date | Task | Decision | Why | Alternatives Rejected |
| --- | --- | --- | --- | --- |
| 2026-10-27 | T-setup | Adopt Keys-later mode | User will provide API keys at the end of the project build per docs/plan/KEYS_LATER.md | Requiring all external service API keys before building adapters |
| 2026-10-27 | T01 | Remove unused root scripts (fix_maps.py, update_maps.py, update_docx.py, check.js, check.ts, test-update.js, docx_unpacked/) | Proven unused via git grep; contain hardcoded Windows paths and ad-hoc scripts | Keeping unused legacy files in repo root |
| 2026-10-27 | T01 | Relocate context.txt to docs/legacy/context.txt | Preserve project context history without cluttering root | Deleting context.txt |
| 2026-10-27 | T01 | Apply U10 default: keep AGENTS.md ignored and commit .agents/rules/ | Follows PLAN.md Section 8 U10 default for agent workspace rules | Committing all agent files or ignoring rules |
