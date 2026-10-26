# Roomboard

A static React app for room occupancy across Loch Roag and Eshcol.

- `npm install && npm run dev` starts the demo, which keeps its data in the browser.
- `npm run build` writes the site to `dist/`; upload the contents of `dist/` to any static host (WPX).
- Live mode: copy `.env.example` to `.env`, set `VITE_DATA_MODE=supabase` plus the URL and anon key, then rebuild.
- Backend: `supabase/migrations/*.sql` in order, then `supabase functions deploy dispatch-alerts ical-sync` and `supabase functions deploy ical-export --no-verify-jwt`.
- Editing: **Quick** (default) opens a big one-question card from the board, room cards and lists; **Classic** is the full form. Switch in the header (desktop), the More sheet (phone) or the Demo popover; the choice is kept in `localStorage` `rb-ui-mode`. `#simple` is the calm phone-first front door (home, book, arrivals, cleaning).
- Properties (`#available`, `#available/<id>`): real details and photos per house and room, with sources and gaps in `docs/PROPERTY-DATA.md`. Extra properties (Harris and Uig pods, Abhainn, Monadh) are bookable units, "Extra · invoiced separately". Order everywhere: Eshcol, Loch Roag, Harris, Uig, Monadh, Abhainn. The extras are on the **main board** (desktop: their own group of rows; phone: cards on Rooms) live from Roomboard bookings and their booking calendars. RJ McLeod **books them directly**: the booking is confirmed straight away, Eshcol is notified, invoicing is separate; taken dates (calendar or another booking) are refused. Each extra is booked **whole**. Eshcol and Loch Roag are on the **block contract** and never show a price ("Included in your contract"), driven by each property's `contracted` flag. Prices for the extras only are **indicative**: one rate per room per week (default £350, Eshcol changes it on Properties; `app_settings` live, this browser in the demo); extras charge their rooms (every bedroom; Abhainn 2 of 3, the sofa-bed/desk room is not charged); every rate change is kept for Eshcol (*Rate history*); pro rata = weekly ÷ 7 per night. See `docs/PROPERTY-DATA.md`, *Indicative prices*. `#availability` shows 3 months for every extra. Booking calendars (iCal import/export) mark dates booked or closed elsewhere as Taken (dates only, no guest details). Calendar links are server secrets (`ICAL_HARRIS`, `ICAL_UIG`, `ICAL_ABHAINN`, `ICAL_MONADH`), never in the repo or app; a unit with no link shows "Calendar not linked yet". **To add one, Eshcol pastes the link to Grok Bot**, which sets the secret (see `docs/PROPERTY-DATA.md`, *Adding a booking calendar*). The demo links only Monadh, from a sanitised sample; live needs migration 0008 and the `ical-sync` / `ical-export` functions.
- Docs: `docs/SPEC.md`, `docs/ACCEPTANCE.md`, `docs/TEST-REPORT.md`.

## Tests
- `npm run lint`: ESLint + Prettier check (clean). `npm run typecheck`: `tsc --noEmit`.
- CI: `ci/github-actions-ci.yml` (lint, type check, unit, build, e2e on every push). Move it to `.github/workflows/ci.yml` with a GitHub account or token that has the `workflow` scope; the deploy token cannot push workflow files.
- `npm test`: unit tests (vitest): rules, dates, store and demo commands. Shared rule cases are in `rules/cases.json`.
- `npm run test:sql`: local Postgres. Applies the migrations and runs the smoke test, then the same `rules/cases.json` through the SQL rule functions.
- `npm run build && npx vite preview --port 4173`, then `npm run test:e2e`: Playwright end-to-end (desktop, phone, every role, axe).
- `QA_URL=https://roomboard.pages.dev/ node qa/report.mjs` runs all three and writes `docs/TEST-REPORT.md`, including the commit and the deployed asset hash.
- `node qa/flow.mjs` (Simple mode walk-through) and `node qa/board.mjs` (Quick card on the board, phone + desktop, widths 360–1440, privacy) take `QA_URL` too. `qa/qa.mjs` pins Classic. `node qa/props.mjs`: properties, extra bookings (in-place sheet from the board and phone Rooms, open-ended with the end date set later), prices and rate history, photo viewer (swipe, wheel/click/pinch/double-tap zoom), availability page, privacy. `node qa/layout.mjs`: layout sanity on every route at 1440 and 390 for each role plus the overlays (no sideways scroll, nothing off screen, nothing screen-tall, no console errors; screens in `SHOTS/layout`); it self-tests that it catches a screen-tall input.
- `node qa/screens.mjs` regenerates `screens/`; `node qa/look3.mjs` regenerates the v2 screenshots (`OUT=screens`).

## Rolling back
The pre-Quick release is tagged `live-v2-restore` (also branch `live-v2-backup`, commit `fcffd27`).
- Fastest: Cloudflare Pages → roomboard → Deployments → the production deployment of `fcffd27` → "Rollback to this deployment".
- In git, without force-pushing: `git checkout main && git pull && git restore --source=live-v2-restore --staged --worktree . && git commit -m "Roll back to live-v2" && git push origin HEAD:main`.
- Softer: Classic is still one tap away (header / More sheet), so users can switch back without a deploy.
