# Roomboard

A static React app for room occupancy across Loch Roag and Eshcol.

- `npm install && npm run dev` starts the demo, which keeps its data in the browser.
- `npm run build` writes the site to `dist/`; upload the contents of `dist/` to any static host (WPX).
- Live mode: copy `.env.example` to `.env`, set `VITE_DATA_MODE=supabase` plus the URL and anon key, then rebuild.
- Backend: `supabase/migrations/*.sql` in order, then `supabase functions deploy dispatch-alerts`.
- Docs: `docs/SPEC.md`, `docs/ACCEPTANCE.md`, `docs/TEST-REPORT.md`.

## Tests
- `npm run lint`: ESLint + Prettier check (clean). `npm run typecheck`: `tsc --noEmit`.
- CI: `.github/workflows/ci.yml` runs lint, type check, unit tests, build and e2e on every push.
- `npm test`: unit tests (vitest): rules, dates, store and demo commands. Shared rule cases are in `rules/cases.json`.
- `npm run test:sql`: local Postgres. Applies the migrations and runs the smoke test, then the same `rules/cases.json` through the SQL rule functions.
- `npm run build && npx vite preview --port 4173`, then `npm run test:e2e`: Playwright end-to-end (desktop, phone, every role, axe).
- `QA_URL=https://roomboard.pages.dev/ node qa/report.mjs` runs all three and writes `docs/TEST-REPORT.md`, including the commit and the deployed asset hash.
- `node qa/screens.mjs` regenerates `screens/`; `node qa/look3.mjs` regenerates the v2 screenshots (`OUT=screens`).
