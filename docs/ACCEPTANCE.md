# Acceptance checklist

Automated: `npm run build && npx vite preview --port 4173 &` then `node qa/qa.mjs` (77 checks, desktop and phone, all roles). Database: `supabase/tests/smoke.sql` (12 checks plus notices).

Run the demo (`npm run build && npx vite preview`, or open the uploaded site), then press **Reset demo**. Use the role switcher top-right.

## Structure
- [ ] Board shows **Loch Roag Guest House Rooms 1–9**, grouped *Upstairs · Rooms 1–5* / *Downstairs · Rooms 6–9*. Rooms 2 and 3 show a shared shower, Room 8 shows *Private shower room*, and the others show Ensuite. The room panel shows the floor and bathroom detail.
- [ ] Board shows **Eshcol** as one property (10 rooms) with group labels *Main house · Rooms 1–7* and *Downstairs flat · Rooms 8–10*.
- [ ] *Available elsewhere* shows **Hebridean Holiday Cabins** (Pod 1, Pod 2, The Lodge, The Cottage "2 bedrooms + office") and **Whitefalls Spa Lodges** (Monadh) as separate groups. None of them are on the board.

## Room 8 journey (Loch Roag)
- [ ] Room 8 shows Neil Mackenzie as **Departing today ✓** (amber bar ending today, Fri 16 Oct 2026).
- [ ] A brush marker sits at today's boundary. Changeovers shows **Loch Roag Room 8 · Scheduled Sat 17 Oct · ready by Tue 20 Oct** (Mairi).
- [ ] From Tue 20 Oct, Room 8 shows a hatched **"Hold · Name to follow · electrician"** bar, departure TBC.
- [ ] Opening that hold and picking a worker **names the same record**. The activity log says "named hold as …" and no second bar appears.
- [ ] Editing the hold's arrival to Mon 19 Oct (brought forward) resets the Room 8 changeover to **Needs scheduling** with a red "Dates changed" warning, and queues SMS alerts.

## Holds and bookings
- [ ] **Hold room** creates a stay with no name (hatched).
- [ ] **+ Add stay** → tap a **recent worker chip** → pick a room → save. No retyping. Name, company and phone come from the saved profile.
- [ ] Workers → **Book** on a row opens the panel with that worker preselected.
- [ ] Choosing an occupied room and dates shows a clash message and disables Save (the DB exclusion constraint does the same in Supabase mode).
- [ ] Departure day = next arrival day is allowed (departure exclusive).

## Visibility per room
- [ ] Each bar shows **Night N** (nights so far). The tooltip and panel show arrival → departure and the nights count.
- [ ] A **next arrival** is visible as the next bar in the row, and in Changeovers as "Next: …" / "ready by …".
- [ ] Today tab lists Departures (planned vs confirmed), Changeovers, Arrivals and Stayovers with night numbers.

## Open-ended stays
- [ ] Loch Roag Room 3 shows **Until further notice** (bar fades out on the right). No changeover is created.
- [ ] Loch Roag Room 7 shows **Departure TBC**.
- [ ] Loch Roag Room 5 shows **Away · room kept** with no changeover for the away dates.

## Changeover rules (review items 1–3, C1–C3)
- [ ] Extending Euan (Loch Roag Room 2) after his changeover is scheduled → same card returns to *Needs scheduling* with "Dates changed". The activity log has a line, and the provider gets an alert.
- [ ] Making a scheduled changeover's departure *Until further notice* keeps the card, flagged, until the provider dismisses it.
- [ ] Loch Roag Room 9 (Daniel → Daniel the same day) shows **Continues · no clean**. Eshcol Room 8 (Kenny → Craig the same day) shows a **Same-day turnaround** with checkout 10:00 → check-in 15:00.
- [ ] Cards say "Departs Wed 21 Oct (planned)" or "(confirmed)", never "Vacated" for a future date.
- [ ] **Room 4 (C1):** on 16 Oct, Iain leaves 21 Oct, so Vacated can't be ticked and Start clean / Ready are disabled.
- [ ] **Room 4 (C2):** scheduling the clean on Fri 23 Oct (the next hold starts Thu 22) is refused. Accepting the provider exception flags it on the Board, Changeovers and Upcoming.
- [ ] **Room 8:** tick Vacated → Start clean → Ready. The Board, Upcoming and Changeovers all show Ready (C3).
- [ ] *Needs scheduling* holds only the next 7 days or rooms with an arrival booked. The rest show under *Later*.

## Alerts (who gets what)
- [ ] A provider stay edit alerts Sheena only. A client edit alerts Donald only. Cleaners get only changeover alerts.
- [ ] Email only by default. SMS only after ticking it in *My alerts*. The outbox in demo says **Simulated**, and the header says **Demo**.
- [ ] After any change, Activity → *Alert outbox* lists queued → sent rows for the other roles (push + email, plus SMS when urgent). The actor is not alerted.
- [ ] Some SMS rows show a retry (`sent ·2`), demonstrating the queue-with-retry behaviour.
- [ ] Marking a changeover **Ready** alerts the client and manager only.
- [ ] A request from *Available elsewhere* alerts the manager by email and SMS.
- [ ] The 07:00 digest preview differs by role (the cleaner sees first names only).

## Activity log
- [ ] Every create, edit, cancel, confirm, changeover move and request appears with **who** and **when** (London time).

## Showcase / upsell
- [ ] No "Available now". Cards say "Enquire for dates · Donald confirms availability". After sending, the confirmation repeats the property, people and dates, and says it is not yet a booking (C7).
- [ ] *Available elsewhere* shows a branded hero and 4 cards with features and "Available now", plus a **Request** button that opens dates, long-term and people fields and a note.
- [ ] Sending shows a confirmation. The manager sees it under "Requests received".

## Client privacy (Sheena · RJ McLeod)
- [ ] As Sheena, no cleaner name appears on the Board, Changeovers, Activity, digest or alerts. Changeovers show only *Cleaning scheduled / Ready* and similar statuses, and actions by cleaners show as "Housekeeping".
- [ ] Sheena sees only her own digest and only the alerts addressed to her.

## Roles
- [ ] The cleaner sees only Today and Changeovers, with first names, and can Start clean / Mark Ready.
- [ ] The client cannot schedule changeovers but sees all their statuses.

## Layout
- [ ] At 820–1180px the nav collapses to icons and the header stays on one line. No bar text is clipped (narrow bars show a surname and a nights chip).
- [ ] KPIs show *Rooms allocated tonight* and *Expected on site* separately (C4).
- [ ] *Reset demo data* appears only for the provider, only in demo mode.

## Phone
- [ ] At phone width the top nav becomes a bottom tab bar. The Board shows Today / Upcoming / **Rooms** (who's in, nights, departs, next, readiness), with a floating **+ Add stay / Hold** button (C5).

## Go-live (Supabase mode)
- [ ] `VITE_DATA_MODE=supabase` build signs in by email magic link. Same screens, with no code change.
- [ ] Two browsers: a change in one appears in the other within about 1 second (Realtime).
- [ ] Two users editing the same stay: the second save gets the "changed by someone else" message.

## Live backend sign-off (before operational use)
Do this on a real Supabase project with the production build in `VITE_DATA_MODE=supabase`. Record the evidence (screenshots, SQL output) for each item.
- [ ] **Two invited accounts:** Donald (manager) and Sheena (client) sign in by magic link on separate devices. A cleaner account is optional.
- [ ] **Server permissions** are checked with the API, not the UI:
  - Sheena's token cannot read cleaner profiles, cannot write to the changeovers table, and cannot read other users' alerts.
  - A cleaner cannot edit stays.
- [ ] **Concurrent overlaps:** two sessions book the same room and nights at the same moment. Exactly one succeeds, and the other gets the clash message (exclusion constraint).
- [ ] **Stale edits:** both open the same stay, and A saves first. B's save is rejected with "changed by someone else" (40001), and nothing is overwritten.
- [ ] **Duplicate submissions:** double-click Save / Send enquiry, and replay the same request. One row only, and alerts are deduped (`dedupe_key`).
- [ ] **Room 8 journey:** Neil departs Fri 16 Oct → clean scheduled → Vacated → In progress → Ready → the Tue 20 Oct hold is named. Sheena sees status only.
- [ ] **Room 4, case 1:** Ready/Start are refused by the database before the 21 Oct departure is recorded as vacated.
- [ ] **Room 4, case 2:** a clean on 23 Oct after the 22 Oct arrival is refused without an exception, and stays flagged with one.
- [ ] **Notifications with every browser closed:** pg_cron runs `dispatch-alerts`, and email arrives.
  - Force a failure (bad API key) → row is `failed`/retry with backoff → fix the key → `accepted` / `delivered`.
  - The same event never sends twice (dedupe).
  - The 07:00 digest arrives at 07:00 London time on both sides of the 25 Oct clock change.
- [ ] **Restore from backup** into an isolated project (Supabase daily backup or PITR). Verify row counts, the Room 8 history and the activity log, then delete the isolated project.
- [ ] **Cloudflare Access** is on for `roomboard.pages.dev` (see SPEC → Hosting and access).
