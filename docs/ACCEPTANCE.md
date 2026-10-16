# Acceptance checklist

Run the demo (`npm run build && npx vite preview`, or open the uploaded site), then press **Reset demo**. Use the role switcher top-right.

## Structure
- [ ] Board shows **Loch Roag Guest House Rooms 1–9**. Rooms 1–7 are labelled Ensuite and 8–9 Shared shower.
- [ ] Board shows **Eshcol** with *Main accommodation* Rooms 1–7 and the *Downstairs flat* Rooms 8–10 as a separate unit, with each room's bathroom type.
- [ ] The cabins and other units (Pod 1, Pod 2, Lodge, Cottage "2 bedrooms + office") appear **only** on *Available elsewhere*, not on the board.

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

## Alerts (who gets what)
- [ ] After any change, Activity → *Alert outbox* lists queued → sent rows for the other roles (push + email, plus SMS when urgent). The actor is not alerted.
- [ ] Some SMS rows show a retry (`sent ·2`), demonstrating the queue-with-retry behaviour.
- [ ] Marking a changeover **Ready** alerts the client and manager only.
- [ ] A request from *Available elsewhere* alerts the manager by email and SMS.
- [ ] The 07:00 digest preview differs by role (the cleaner sees first names only).

## Activity log
- [ ] Every create, edit, cancel, confirm, changeover move and request appears with **who** and **when** (London time).

## Showcase / upsell
- [ ] *Available elsewhere* shows a branded hero and 4 cards with features and "Available now", plus a **Request** button that opens dates, long-term and people fields and a note.
- [ ] Sending shows a confirmation. The manager sees it under "Requests received".

## Roles
- [ ] The cleaner sees only Today and Changeovers, with first names, and can Start clean / Mark Ready.
- [ ] The client cannot schedule changeovers but sees all their statuses.

## Phone
- [ ] At phone width the top nav becomes a bottom tab bar, and the Board shows the Today/Upcoming list.

## Go-live (Supabase mode)
- [ ] `VITE_DATA_MODE=supabase` build signs in by email magic link. Same screens, with no code change.
- [ ] Two browsers: a change in one appears in the other within about 1 second (Realtime).
- [ ] Two users editing the same stay: the second save gets the "changed by someone else" message.
