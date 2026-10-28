# Assumptions ledger

`date · task · assumption · how to check it · status (open, confirmed, wrong-fixed)`

| Date | Task | Assumption | How to check it | Status |
| --- | --- | --- | --- | --- |
| 2026-10-27 | T-setup | External service keys will be provided at the end of the build; synthetic fixtures with `_synthetic: true` will be used for contract tests until then | Verify with `npm run check:keys` and live contract test calls in T75 | open |
| 2026-10-27 | T13 | `tests/fixtures/storage/synthetic-upload-response.json` conforms to Supabase Storage v2 response schema | To verify with a live call in T75 | open |
| 2026-10-28 | T22 | Camera (getUserMedia) and Geolocation (watchPosition) built and verified on localhost/synthetic test harness; real mobile hardware verified at deploy (T71) | Verify on physical mobile phone at deployment in T71 | open |
| 2026-10-28 | T29 | GBA ward boundary GeoJSON not provided yet; single "Pilot area" polygon (Outer Ring Road pilot boundary) imported into Ward table | Replace with real `data/wards.geojson` when Sujay downloads from data.opencity.in (U5) | open |
| 2026-10-28 | T41 | `tests/fixtures/routing/synthetic-tomtom-route.json` conforms to TomTom Calculate Route v1 API schema for Bengaluru ORR corridor | To verify with a live call in T75 | open |
| 2026-10-28 | T50 | `tests/fixtures/llm/synthetic-gemini-g1.json` conforms to Google Gemini 1.5/2.5 Flash `generateContent` response schema | To verify with a live call in T75 | open |
| 2026-10-28 | T50 | `tests/fixtures/llm/synthetic-groq-g2.json` conforms to Groq OpenAI-compatible Chat Completions response schema | To verify with a live call in T75 | open |
| 2026-10-28 | T51 | `tests/fixtures/llm/synthetic-gemini-g1-disagree.json` conforms to Google Gemini 1.5/2.5 Flash `generateContent` response schema | To verify with a live call in T75 | open |
