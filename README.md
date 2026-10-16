# Roomboard

A static React app for room occupancy across Loch Roag and Eshcol.

- `npm install && npm run dev` starts the demo, which keeps its data in the browser.
- `npm run build` writes the site to `dist/`; upload the contents of `dist/` to any static host (WPX).
- Live mode: copy `.env.example` to `.env`, set `VITE_DATA_MODE=supabase` plus the URL and anon key, then rebuild.
- Backend: `supabase/migrations/*.sql` in order, then `supabase functions deploy dispatch-alerts`.
- Docs: `docs/SPEC.md`, `docs/ACCEPTANCE.md`.
