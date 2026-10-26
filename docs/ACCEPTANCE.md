# Acceptance checklist

Automated: `npm run build && npx vite preview --port 4173 &` then `npm run test:e2e:all` (qa, flow, board, props, find, views, layout: desktop and phone, all three logins). Unit: `npm test`. Database: `bash qa/sql.sh` (smoke + shared rules) and `bash qa/sql-rls.sh` (all migrations 0001–0014 on a fresh Postgres with Supabase-like roles, then the live-safe `live_rls.sql`, `live_flow.sql`, `stale_edit.sql` and `friendly_dates.sql` checks).

Run on 26 Oct 2026 (branch `properties`): unit 174/174, lint clean, qa 162/162, flow 33/33, board 114/114, props 139/139, find 19/19, views 61/61, layout 154/154 (134 screens), sql smoke 76/76 + rules 53/53, sql-rls 35/35.

> **Superseded since this list was written** (the automated suites check the current behaviour): logins are by role only
> (RJ McLeod, Eshcol, Housekeeper; no personal names anywhere, so "first names" for the cleaner no longer apply);
> the housekeeper sees no prices; alerts are tiered (important → red dot + email, minor → activity log only), with no
> SMS, no 6pm/07:00 digest switch, and the housekeeper alerted only for changes in the next 7 days; *More rooms* became
> the four bookable extras (Harris, Uig, Monadh, Abhainn) on the board, Rooms, Find a room and Properties; the
> Room 8 / Room 4 journeys used demo dates around 16–23 Oct 2026, and the demo now seeds relative to today.

Run the demo (`npm run build && npx vite preview`, or open the uploaded site), then press **Reset demo**. Use the role switcher top-right.

## Structure
- [ ] Board shows **Loch Roag Rooms 1–9**, grouped *Upstairs · Rooms 1–5* / *Downstairs · Rooms 6–9*. Rooms 2 and 3 show a shared shower, Room 8 shows *Private shower room*, and the others show Ensuite. The room panel shows the floor and bathroom detail.
- [ ] Board shows **Eshcol** as one property (10 rooms) with group labels *Main house · Rooms 1–7* and *Downstairs flat · Rooms 8–10*.
- [ ] *More rooms* shows **Hebridean Holiday Cabins** (Harris, Uig, Abhainn) and **Whitefalls Spa Lodges** (Monadh) as separate groups. None of them are on the board.

## Room 8 journey (Loch Roag)
- [ ] Room 8 shows Neil Mackenzie as **Leaves today (confirmed)** (amber bar ending today, Fri 16 Oct 2026).
- [ ] A cleaning marker sits in the gap at today's boundary. Cleaning shows **Loch Roag Room 8 · Booked in · Sat 17 Oct · needed by Tue 20 Oct** (Housekeeper).
- [ ] From Tue 20 Oct, Room 8 shows a hatched **"Hold · Name to follow · electrician"** bar, departure TBC.
- [ ] Opening that hold and picking a worker **names the same record**. The activity log says "named hold as …" and no second bar appears.
- [ ] Editing the hold's arrival to Mon 19 Oct (brought forward) puts the Room 8 clean back to **To book** with a red "Dates changed … please book it again" warning, and alerts the provider and cleaner.

## Holds and bookings
- [ ] **Hold room** creates a stay with no name (hatched).
- [ ] **+ Add stay** → tap a **recent worker chip** → pick a room (only free rooms are listed) → save → **Undo** is offered. No retyping. Name, company and phone come from the saved profile.
- [ ] Workers → **Book** on a row opens the panel with that worker preselected, starting the day their current stay ends.
- [ ] Choosing an occupied room and dates shows a clash message and disables Save (the DB exclusion constraint does the same in Supabase mode).
- [ ] Departure day = next arrival day is allowed (departure exclusive).

## Visibility per room
- [ ] Each bar shows **Night N** (nights so far). The tooltip and panel show arrival → departure and the nights count.
- [ ] A **next arrival** is visible as the next bar in the row, and in Cleaning as "Next: …" / "needed by …", and in Rooms as "Next: …".
- [ ] Today lists Leaving (planned vs confirmed), Cleans, Arriving and Staying on with night numbers, and prints.

## Open-ended stays
- [ ] Loch Roag Room 3 shows **Until further notice** (bar fades out on the right). No changeover is created.
- [ ] Loch Roag Room 7 shows **Departure TBC**.
- [ ] Loch Roag Room 5 shows **Away · room kept** with no changeover for the away dates.

## Changeover rules (review items 1–3, C1–C3)
- [ ] Extending Euan (Loch Roag Room 2) after his changeover is scheduled → same card returns to *To book* with "Dates changed … book it again". The activity log has a line, and the provider gets an alert.
- [ ] Making a scheduled changeover's departure *Until further notice* keeps the card, flagged, until the provider dismisses it.
- [ ] Loch Roag Room 9 (Daniel → Daniel the same day) shows **Continues · no clean**. Eshcol Room 8 (Kenny → Craig the same day) shows a **Same-day turnaround** with checkout 10:00 → check-in 15:00.
- [ ] Cards say "Guest leaves Wed 21 Oct (planned)" or "(confirmed)". The actual departure is the "Guest has left" tick, shown on the bar as "Left ✓".
- [ ] **Room 4 (C1):** on 16 Oct, Iain leaves 21 Oct, so "Guest has left" can't be ticked and Start clean / Ready are disabled.
- [ ] **Room 4 (C2):** booking the clean on Fri 23 Oct (the next hold starts Thu 22) asks first and is refused on "Go back". "Book as exception" flags it on the Board, Cleaning, Upcoming and the printed list, and the flag survives a reload (automated test). RJ McLeod never sees it.
- [ ] **Room 8:** tick Guest has left → Start clean → Mark ready. The Board, Upcoming, Cleaning and RJ McLeod's Rooms all show Ready (C3).
- [ ] *To book* holds only the next 7 days or rooms with an arrival booked. The rest show under *Later*.

## Alerts (who gets what)
- [ ] A provider stay edit alerts RJ McLeod only. A client edit alerts Eshcol only. Cleaners get only changeover alerts.
- [ ] Email only by default. SMS only after ticking it in *My alerts*. The outbox in demo says **Simulated**, and the header says **Demo**.
- [ ] After any change, Activity → *Alert outbox* lists queued → sent rows for the other roles (push + email, plus SMS when urgent). The actor is not alerted.
- [ ] Some SMS rows show a retry (`sent ·2`), demonstrating the queue-with-retry behaviour.
- [ ] Marking a changeover **Ready** alerts the client and manager only.
- [ ] A request from *Available elsewhere* alerts the manager by email and SMS.
- [ ] The 07:00 digest preview differs by role (the cleaner sees first names only).

## Activity log
- [ ] Every create, edit, cancel, confirm, changeover move and request appears with **who** and **when** (London time).

## More rooms (upsell)
- [ ] *More rooms* shows the two brands with **unit counts and "subject to confirmation"** (never "N available" or "currently available"), cards with features and "Photos to follow", and **Enquire about dates** (dates, long-term, people, note).
- [ ] Sending echoes the dates and says it is not a booking. The provider sees it under "Enquiries received".

## Client privacy and calm (RJ McLeod)
- [ ] As RJ McLeod, no cleaner name appears anywhere (Board, Rooms, Today, Activity, digest, alerts, print). Actions by cleaners show as "Housekeeping".
- [ ] RJ McLeod sees **no scheduling noise**: no "to book", "booked in" or exceptions, only *Ready by Tue 20 Oct*, *Being cleaned · ready by …* or *Ready ✓*, and board markers in one calm colour.
- [ ] RJ McLeod sees only their own digest and alerts.

## Ease of use
- [ ] **Find a room**: dates in → free rooms grouped by property with a count and nights → tap → booking prefilled.
- [ ] The room picker shows free rooms only ("Loch Roag · Room 8 · Ensuite"); taken rooms on request.
- [ ] **Book** for a worker in house starts the day their stay ends.
- [ ] Every save / cancel shows **Undo**; cancelling asks first ("Go back" keeps it).
- [ ] **Search** (`/`) finds a worker or room and opens their stay.
- [ ] **Welcome** on first login with three hints; not shown again after "Got it".
- [ ] **Print** today's movements and the cleaning list (A4, tick boxes, no app chrome).
- [ ] All date inputs are dd/mm/yyyy; impossible dates (31/02) are flagged; displays read "Fri 16 Oct".
- [ ] No visible version numbers, no "invalidated", no code-logic explanations; the night rule is behind ⓘ.
- [ ] Same worker in two rooms → a warning, still saveable.
- [ ] Rooms list: open-ended stays say "Until further notice" / "Departure TBC"; *Next* never repeats the same worker continuing; away guests show "Away · room kept".

## v2 (look, crew booking, drag, copy summary)
- [ ] Rooms shows one card per room with status pill, nights badge, departure, next arrival with the gap, incoming guest, cleaning strip and Quick update (desktop and phone).
- [ ] Tapping a tile (Departing today, Needs clean, Name TBC, Long stay) filters the cards; the matching pill is highlighted; tapping again shows all. Extra capacity makes no availability claim.
- [ ] The urgent banner reflects a real changeover; the provider can book the clean in one tap (with a confirm); RJ McLeod sees "Ready by" only. No hard-coded dates anywhere.
- [ ] On the phone, the first screen shows the banner, the tile row and the first room card.
- [ ] **Copy summary** puts today's and tomorrow's movements and cleans on the clipboard; RJ McLeod's copy contains no cleaner names.
- [ ] **Crew booking:** 2 workers + 3 × Name TBC, 10 on / 4 off, 3 rotations → a 5 × 3 preview; clashes in red block Confirm; Confirm asks first and creates 15 stays under one crew id; one clean per room at the end (room kept on off days) or one per block (released).
- [ ] Usual rooms are preferred; any place's room can be changed in the preview.
- [ ] Extend / Change end / Cancel rest act on the whole series; Undo reverts the whole step; a single occurrence can be edited on its own and survives a reshape.
- [ ] **Drag:** moving a bar shows the new room/dates live (red with the reason on a clash), asks for confirmation on drop, and can be undone; a clash is refused. Dragging the right edge changes the departure. Enter on a bar still opens the panel.
- [ ] `npm run lint` is clean; the CI workflow (`ci/github-actions-ci.yml`, to be moved into `.github/workflows/`) runs lint, types, unit, build and e2e on push.

## Extra properties and prices (18 Oct 2026)
- [ ] Order everywhere (board, Rooms, availability, Properties): Eshcol, Loch Roag, Harris, Uig, Monadh, Abhainn.
- [ ] Desktop board: an *Extra properties* group with one row each; RJ McLeod sees their own bookings as bars and everything else as **Taken**; Eshcol sees names and **Booked elsewhere**. Clicking a free day opens a booking sheet on the board itself. Phone: the same four on Rooms with tonight, the next 14 nights and **Book**.
- [ ] RJ McLeod books an extra directly: **Book these dates** shows the indicative estimate first; the booking is confirmed straight away, Eshcol gets a "New booking" alert; no confirm/decline step anywhere.
- [ ] Taken dates (calendar or another booking) cannot be booked; the message names nobody.
- [ ] **Eshcol and Loch Roag (block contract) show no £, price or estimate anywhere** for Eshcol, RJ McLeod or the cleaner, desktop or phone (Room held, booking cards, Classic panel, property pages, Properties list, room cards, board, alerts, activity); they say "Included in your contract". Driven only by each property's `contracted` flag.
- [ ] The extras show **Indicative £350 per room per week**, whole property with the rooms charged (Monadh 2 = £700, Abhainn 2 of 3 = £700, Harris and Uig 1 = £350); "long-term deals possible".
- [ ] Eshcol changes the rate on Properties and every price follows; RJ McLeod has no rate setting (and the database refuses their update).
- [ ] RJ McLeod's activity shows none of Eshcol's own extra guests and no booking-site names.
- [ ] A free day on an extras row (desktop board) or a free night / **Book** on the phone Rooms card opens a booking sheet **in place** (side panel on desktop, bottom sheet on phone): the night (up to a week) already picked and in view, − / + to change the length, the estimate, **Book these dates**, then **Done**; the page never changes. Esc or ✕ closes it.
- [ ] **Open-ended** (until further notice): choose a first night, tap *Open-ended*: every later night is shown as part of the booking, the price reads "Indicative £W per week, until further notice". Refused (with the clashing date, no names) if any later night is taken. Once booked, every later night is taken on the board, Rooms and availability; the iCal export blocks a rolling year ahead. The booking card (*Current booking* / the bar) has **End date → Save end date**, and *Make it open-ended* to undo; after an end date the later nights are free again.
- [ ] RJ McLeod's own extra bookings show as **Yours** on the availability calendars, with a "Your bookings here" list; Eshcol's guests stay "Taken".
- [ ] *Rate history* (Eshcol only): who, when (UK time), old → new for every change.
- [ ] Photos: tap the gallery or a room cover to enlarge; swipe or ← → to move; Esc / ✕ closes. Zoom: pinch or double-tap on a phone, mouse wheel, a click on the photo, + / − buttons or keys on desktop (up to 400%); drag to look around while zoomed (kept in bounds); swipe only changes photo at 100%. Room cards are all the same size, "Photo to come" included.

- [ ] `node qa/layout.mjs` passes: every route at 1440 and 390 for Eshcol, RJ McLeod and the cleaner, plus the booking sheet, photo viewer and quick cards: no sideways scroll, nothing off the screen, no control or text block taller than half the screen, no image taller than the screen, no console errors.

- [ ] Open-ended contract stays (e.g. Alasdair Matheson, Eshcol Room 1): Quick *Set leaving date* or *Change dates → Set a leaving date*, or Classic *Leaves* (always editable), saves the date; the board bar / room card updates straight away and the nights after it are free. *No leaving date yet* puts it back to until further notice; changing the start keeps it open-ended. The first date offered is never in the past.

## Roles
- [ ] The cleaner sees only Today and Cleaning, with first names, and can tick Guest has left / Start clean / Mark ready.
- [ ] Only the provider books cleans or takes an out-of-window exception.

## Layout
- [ ] One header band at every width; at 820–1180px the nav collapses to icons and stays on one line. No bar text is clipped. Cleaning markers never overlap bars.
- [ ] KPIs show *Rooms allocated tonight* and *Expected on site* separately (C4); property headings say "N allocated · M on site".
- [ ] *Reset demo data* appears only for the provider, only in demo mode, and asks first.

## Phone
- [ ] Bottom bar (≤ 5 tabs + More sheet), Rooms list with readiness, floating **+ Add stay / Hold**, stay panel as a full-screen sheet, no horizontal scrolling on any screen (C5).

## Go-live (Supabase mode)
- [ ] `VITE_DATA_MODE=supabase` build signs in by email magic link. Same screens, with no code change.
- [ ] Two browsers: a change in one appears in the other within about 1 second (Realtime).
- [ ] Two users editing the same stay: the second save gets the "changed by someone else" message.

## Live backend sign-off (before operational use)
Do this on a real Supabase project with the production build in `VITE_DATA_MODE=supabase`. Record the evidence (screenshots, SQL output) for each item.
- [ ] **Two invited accounts:** Eshcol (manager) and RJ McLeod (client) sign in by magic link on separate devices. A cleaner account is optional.
- [ ] **Server permissions** are checked with the API, not the UI:
  - RJ McLeod's token cannot read cleaner profiles, cannot write to the changeovers table, and cannot read other users' alerts.
  - A cleaner cannot edit stays.
- [ ] **Concurrent overlaps:** two sessions book the same room and nights at the same moment. Exactly one succeeds, and the other gets the clash message (exclusion constraint).
- [ ] **Stale edits:** both open the same stay, and A saves first. B's save is rejected with "changed by someone else" (40001), and nothing is overwritten.
- [ ] **Duplicate submissions:** double-click Save / Send enquiry, and replay the same request. One row only, and alerts are deduped (`dedupe_key`).
- [ ] **Room 8 journey:** Neil leaves Fri 16 Oct → clean booked → Guest has left → Cleaning now → Ready → the Tue 20 Oct hold is named. RJ McLeod sees status only.
- [ ] **Room 4, case 1:** Ready/Start are refused by the database before the 21 Oct departure is recorded as vacated.
- [ ] **Room 4, case 2:** a clean on 23 Oct after the 22 Oct arrival is refused without an exception, and stays flagged with one.
- [ ] **Notifications with every browser closed:** pg_cron runs `dispatch-alerts`, and email arrives.
- [ ] **Booking calendars (iCal):** run migration 0008; deploy `ical-sync` and `ical-export`
  (`supabase functions deploy ical-sync` / `supabase functions deploy ical-export --no-verify-jwt`); add Vault secrets
  `project_url` and `service_role_key` (Dashboard → Project Settings → Vault) so the 3-hourly pg_cron job can call
  `ical-sync`; set `supabase secrets set ICAL_MONADH=<link>` (Grok Bot holds it; never commit it). Then:
  - [ ] **Read calendars now** on Monadh → "Calendar linked · SuperControl"; on the availability page RJ McLeod sees
    16–19 Nov 2026 and 20 Dec 2026 – 4 Jan 2027 as **Taken** (check-out days free), with no names and no site name.
  - [ ] Harris, Uig and Abhainn say **Calendar not linked yet**, with no error, and block nothing.
  - [ ] `select * from cron.job where jobname = 'ical-sync'` shows `17 */3 * * *`; after 3 hours `last_synced_at` moves.
  - [ ] `ical_blocks` holds dates only; `ical_feeds` holds no URL; RJ McLeod's API key reads 0 rows from `ical_feeds`.
  - Force a failure (bad API key) → row is `failed`/retry with backoff → fix the key → `accepted` / `delivered`.
  - The same event never sends twice (dedupe).
  - The 07:00 digest arrives at 07:00 London time on both sides of the 25 Oct clock change.
- [ ] **Restore from backup** into an isolated project (Supabase daily backup or PITR). Verify row counts, the Room 8 history and the activity log, then delete the isolated project.
- [ ] **Undo in live mode:** cancel a stay, press Undo: the stay returns (same id) and the clean is re-linked; both sides get the alert.
- [ ] **Shared rules on the live database:** run `node qa/sql-rules.mjs` against the project (PG* env vars) – all cases pass.
- [ ] **Cloudflare Access** is on for `roomboard.pages.dev` (see SPEC → Hosting and access).
