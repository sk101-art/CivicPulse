# Assumptions ledger

`date · task · assumption · how to check it · status (open, confirmed, wrong-fixed)`

| Date | Task | Assumption | How to check it | Status |
| --- | --- | --- | --- | --- |
| 2026-10-27 | T-setup | External service keys will be provided at the end of the build; synthetic fixtures with `_synthetic: true` will be used for contract tests until then | Verify with `npm run check:keys` and live contract test calls in T75 | open |
| 2026-10-27 | T13 | `tests/fixtures/storage/synthetic-upload-response.json` conforms to Supabase Storage v2 response schema | To verify with a live call in T75 | open |
