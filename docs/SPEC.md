# Roomboard: build brief (v0.3, v2 release)

**Purpose:** a shared occupancy board between Eshcol (provider) and their 3-year contract client. It records who is in which room, who is coming, and which room needs cleaning by when. No money is handled. The contract is invoiced separately.

## Users and roles
| Role | Who | Can |
|---|---|---|
| Client coordinator | Client's accommodation lead | Add/edit/cancel stays and holds in contracted rooms. Manage saved workers. See changeover status (read-only). Book the extra properties directly (confirmed straight away, whole property; they see and change only their own, others as dates). See the activity log |
| Provider manager | Eshcol / team | Everything. Schedule changeovers and assign cleaners. Sees every extra booking and the alert outbox; sets the indicative rate |
| Cleaner | Housekeeping | Today/Upcoming and Changeovers only, with first names only. Move own tasks to In progress → Ready |

## Properties (confirmed by Eshcol, 16 Oct 2026)
- **Loch Roag** (contracted): 9 rooms. **Upstairs: Rooms 1–5. Downstairs: Rooms 6–9.** Rooms 2 and 3 share a shower room. Room 8 has a private shower room (not ensuite). Rooms 1, 4, 5, 6, 7 and 9 are ensuite. Two kitchens, a large games room and lounge. *Images to follow.*
- **Eshcol** (contracted): **10 rooms in total, one property.** Main house Rooms 1–7: 2, 3, 4, 6 and 7 are ensuite, and 1 and 5 have an allocated private shower room. The downstairs flat (shown as a group label) has Rooms 8–10: 10 is ensuite, and 8 and 9 share the flat's shower room.
- **Upsell (not contracted):**
  - **Hebridean Holiday Cabins**: the Harris and Uig pods (shown as **Harris** and **Uig**; Harris View was once "Pod 1") and Abhainn Cottage (3 bedrooms). "The Lodge" in the original brief is Monadh (Eshcol, 18 Oct 2026).
  - **Whitefalls Spa Lodges**: **Monadh**, the only lodge available. It is a separate card.

## Client
**RJ McLeod** (client coordinator). Email and phone are still to come.
**Privacy rule: the client never sees cleaner names or details.** That covers the board, changeovers, activity log (shown as "Housekeeping"), digests and alerts. They see status only: *Cleaning to be scheduled / Cleaning scheduled / Cleaning in progress / Ready*. In Supabase, the RLS on `profiles` hides cleaner profiles from clients, and alert rows are visible only to their recipient.

## Data model (identical in `src/data/core.ts` and `supabase/migrations`)
Property → Unit → Room (bath: ensuite/private/shared) · ContractAllocation (room, period) · Worker (saved profile) · **Stay** (room, worker or null = *Hold, name to follow*, arrival, departure, depStatus `planned|confirmed|tbc|ufn`, away range, version) · **Changeover** (room, from/to stay, afterDate, readyBy, status `needs|scheduled|in_progress|ready` shown as *To book / Booked in / Cleaning now / Ready*, cleaner) · Activity · AlertOutbox · Enquiry · Profile (user + role).

## Rules
1. Dates are Europe/London calendar days. **Arrival is inclusive and departure exclusive.** Day maths is done on calendar dates, so the 25 Oct 2026 clock change has no effect.
2. Contract allocation, stay and readiness are separate things.
3. Naming a hold updates **the same record**.
4. **Overlaps are blocked by the database**: a gist exclusion constraint, plus a friendly clash message from the `stays_before` trigger.
5. **Stale edits are detected.** The client sends the version it loaded, and the trigger rejects a mismatch with SQLSTATE 40001. The demo does the same across browser tabs.
6. **Changeovers are persistent rows with stable IDs.**
   - A date change on either linked stay puts the row back to *To book* with the reason "Dates changed after this clean was booked – please book it again", writes an activity line, and alerts the provider and cleaner.
   - A scheduled changeover is never deleted silently. If its departure is removed or made open-ended, the row is kept and **flagged** until the provider dismisses it.
7. **Same day, same worker** = *continues*: the bar shows "Continues · no clean", no clean is created, and it is logged. **Same day, different worker** = a same-day changeover with a zero-day warning and the property's default times (checkout 10:00, check-in 15:00, editable by the provider on Changeovers).
8. **The sequence is departure → vacated → clean → ready, all before the next arrival.**
   - *Guest has left* (vacated) can be ticked only on or after the departure date.
   - Starting the clean and marking Ready both need it.
   - A clean date outside departure → next arrival is refused, unless the provider records an explicit **exception**. An exception stays flagged on the Board, Changeovers and Today until resolved.
9. **A planned departure is not a confirmed one.** Cards say "Guest leaves Wed 21 Oct (planned)" or "(confirmed)". The fact that someone actually left is the **"Guest has left"** tick, shown on the Board bar as **"Left ✓"**.
10. **Away, room retained** keeps the room allocated with no clean. KPIs show **Rooms allocated** and **Expected on site** separately.
11. **Departure TBC** and **Until further notice** are open-ended and create no changeover.
12. **To book** shows cleans in the next 7 days or with a next arrival booked. The rest go under **Later**. The "Cleans due in 7 days" KPI and the nav badge count the same 7-day window.
13. Task status has **one source of truth** (`changeovers.status`), turned into words by one function, `readinessFor()` in `core.ts`. The Board, Today, Upcoming, Rooms, print sheets and digest all use it.
    - The provider and cleaners see *Clean to book · needed by Tue 20 Oct*, *Clean booked Sat 17 Oct*, *Cleaning now*, *Ready ✓*, or a warning (*Dates changed · book clean again*, *outside usual window*).
    - **The client sees only "Ready by Tue 20 Oct", "Being cleaned · ready by …" or "Ready ✓"**, and nothing at all for a room with no next arrival. Markers on their board are one calm colour until ready.
14. **Same worker in two rooms at once** is a warning, not a block ("Heads up: … is also in Loch Roag Room 4"). It can be intended (moving rooms mid-stay).
15. **Room picker** lists only rooms free for the chosen dates, labelled "Loch Roag · Room 8 · Ensuite"; "Show taken rooms too" reveals the rest (and the clash message explains who has it).
16. **Booking a worker** (Workers → Book, search, or picking them in Add stay) starts on the day their current dated stay ends, in the same room if it is free, so it continues without a clean. Dates the user already chose are never overwritten.
17. **Undo:** every save, cancel and departure confirmation shows a toast with **Undo** (about 8 seconds). Cancelling a stay asks first. Undo restores the exact records (same ids, booked cleans included) in the demo; in live mode it applies the inverse change through the same database rules.
18. **UK dates everywhere:** inputs are typed and shown as dd/mm/yyyy (with the weekday beside them and a calendar button) regardless of browser language; displays use "Fri 16 Oct".
19. **Crew booking with rotations** (Crew tab). RJ McLeod or the provider picks several workers and/or *N × Name TBC* places, a property (any room) or a set of rooms, a first arrival and a pattern such as **10 on / 4 off**, repeated **for N rotations**, **until a date**, or **until further notice** (the first 12 weeks are generated; *Extend* adds 12 more).
    - **Allocation:** each place gets its **usual room** (room of the worker's latest stay) if it is free for every rotation, else the first room free for every rotation. If none is, the room with the fewest clashes is shown with the clashes in red. Any place's room can be changed in the preview.
    - **Preview first:** a grid of every generated stay (place × rotation), clashes in red ("Taken by …", "Also given to …"), worker-already-booked warnings in amber. **Confirm is blocked while any clash remains.** Nothing is saved before Confirm.
    - **Off days (per booking, documented choice):** default **"Away, room kept"**: one stay per rotation covering the on and off days, with the off days marked *away*; rotations join back to back in the same room and continue with **no clean between blocks** (rule 7 extended: the same rotation *place* continues even while it is still an unnamed hold). Alternative **"Release the room"**: one stay per on-block; the room is free on off days and **every block ends in a changeover**.
    - **Real stays:** confirming creates ordinary stays (`series_id` + `slot`) in **one atomic command** (`apply_series()` in `0007_crew_series.sql`; one undo step; one summary alert instead of one per stay). Every generated stay goes through the same validation, clash constraint, changeover and alert rules as a single booking; a clash anywhere rolls back the whole booking.
    - **Whole series:** *Extend*, *Change end* (shorten or lengthen to a date) and *Cancel rest* (removes every stay from today on; stays already started are only shortened). A **single occurrence** is edited like any stay (panel or drag) and is kept when the series is reshaped.
    - The generator `occurrences()` (`src/data/rotation.ts`) and `rb_rotation()` (SQL) are tested against the same `rules/cases.json` cases.
20. **A continuing stay drops its unbooked clean.** If a stay becomes "continues" (same worker or same rotation place back to back) an unbooked clean is removed; a booked clean is kept as it is and a re-flagged one stays flagged, so nothing scheduled is silently dropped (rule 6 unchanged).
21. **Drag on the desktop board:** drag a bar to move a stay (days and/or another room), drag its right edge to change the departure. A live outline shows the new room and dates in green, or the clash reason in red. Dropping asks for confirmation; the save then shows **Undo**. A clash is refused and nothing is saved. Esc cancels. The keyboard / button route (Enter opens the panel) is unchanged.
22. **Copy summary** (Rooms): today's and tomorrow's departures, arrivals and cleans as plain text on the clipboard. The provider's copy names the cleaner; **RJ McLeod's copy has no cleaner names and only "Ready by …" wording**; the cleaner's copy uses first names.

## Shared rule tests (no drift between demo and database)
The pure rules live in `src/data/rules.ts` (TypeScript) and `supabase/migrations/0006_rule_functions.sql` (`rb_nights`, `rb_overlaps`, `rb_boundary`, `rb_clean_window`, `rb_status_gate`, `rb_stay_error`). The triggers in `0002_rules.sql` call the SQL functions; the demo store calls the TS ones. **One case file, `rules/cases.json`, drives both suites:** `npm test` (vitest) and `npm run test:sql` (`qa/sql.sh`: fresh local Postgres, all migrations, smoke test, then every case through the SQL functions). A rule changed on one side only fails the other suite.

## Alert routing
| Recipient | Gets |
|---|---|
| Cleaner | Changeover alerts only: scheduled, rescheduled, invalidated, ready-by moved, flagged/cancelled |
| Client (RJ McLeod) | Stay changes made **by the provider**, and *room ready*. Never any cleaner names |
| Provider | Stay changes made **by the client**, departure confirmations, invalidated or flagged changeovers, new bookings of extra properties made by the client |

- **Channels:** each user gets **one channel by default (email)**. SMS is opt-in per user (Activity → My alerts). Push only when enabled.
- **Own edits:** a user is never alerted about their own edit.
- **Dedupe:** alerts are deduped by event, recipient and channel.
- **Outbox states:** in live mode, `queued → accepted → delivered (where known) / failed → acknowledged`, plus `no_address`. **The demo labels everything "Simulated".**

**07:00 digest:** today's departures and arrivals, changeovers due in the next 7 days, and the in-house count.

## Screens
- **Header:** one band. Icon nav at 820–1180px, **Search** (press `/`: workers and rooms), the *Demo* pill (explains demo mode; provider-only *Reset demo data* inside, with confirmation) and the person switcher.
- **Board** (tape chart): properties and units down the left with "N allocated · M on site", days across, today line, hatched holds, cleaning markers placed in the gap between stays (never over a bar), "Left ✓" on bars once the guest has left. The night rule sits behind an ⓘ. KPIs: Rooms allocated tonight, Expected on site, Departing today, Arriving in 7 days, Holds, Cleans due in 7 days (client: Rooms getting ready).
- **Find a room:** pick arriving / leaving (or until further notice) and bathroom type. Free rooms are grouped by property; tap one to open the booking with room and dates filled in.
- **Look (v2):** slate-navy header with an emerald accent; colour means the same everywhere: **amber = departing**, **purple = Name TBC / hold**, **sky = incoming / away**, **emerald = occupied / ready**.
- **Rooms** (room cards, desktop and phone): status pill (Departing today, Occupied, Name TBC, Away · room kept, Arriving today, Free tonight), nights badge, departure ("Sat 24 Oct (planned)" / "Until further notice" / "Departure TBC", "staying on" for a continuation), next arrival with the **gap in days**, incoming-guest box (purple for a hold), cleaning strip (role-aware readiness), **Quick update** (opens the side panel).
  - **Summary tiles that filter when tapped:** Departing today, Needs clean (7 days), Name TBC, Long stay (28+ nights or open-ended), plus **Extra capacity** (links to More rooms: "more properties · ask about dates", never an availability claim). Matching filter pills on desktop.
  - **Urgent banner:** the most urgent real changeover (turnaround today, or next arrival within 3 days) with one-tap actions: provider *Book clean <date>* (asks first), *Cleaning*, *Open room*; RJ McLeod sees the "Ready by" wording only. Nothing is shown when nothing is urgent.
  - **Phone:** tiles become one swipeable row and filter pills are hidden, so the first room card is on the first screen. **RJ McLeod's phone opens here.**
- **Crew** (rule 19): form on the left, live preview grid on the right, crew bookings list underneath.
- **Stay panel:** side panel on desktop, **full-screen sheet on phone**; closes on Escape, on role switch and returns focus to the opener. Recent workers, search, new worker inline, hold mode, departure status, away range, free-only room picker, live clash check, two-room warning, "Last changed by …".
- **Today / Upcoming** with a **Print** button. **Cleaning** (provider and cleaners; 5 columns with plain titles; default checkout/check-in times) with **Print cleaning list**.
- **Print views** (`#print-today`, `#print-cleaning`): A4 tables with tick boxes; print CSS hides the app chrome, so "Save as PDF" gives a clean sheet.
- **Workers**, **More rooms** (other brands as enquiries: "4 units · subject to confirmation", never "available"), **Activity** (log, 07:00 email preview, my alerts, outbox).
- **First login:** a welcome with three role-specific hints, dismissed once and remembered per person. Friendly empty states everywhere.
- **Phone:** bottom bar with at most five tabs (client: Rooms, Find a room, Today, Workers, More; provider: Rooms, Today, Cleaning, Find a room, More; cleaner: Today, Cleaning) and a floating **+ Add stay / Hold** on Rooms and Today.

## Architecture
Static SPA (Vite + React + TS) → uploadable to WPX. UI is split into `src/ui/*` (one file per screen plus `DateField`, `overlays` for toasts/confirm, `Search`, `Welcome`, `Print`, `Crew`, `drag.ts`, `summary.ts`); `src/App.tsx` is only the shell and routing. **ESLint (typescript-eslint + react-hooks) and Prettier pass clean** (`npm run lint`). One data interface, `src/data/repo.ts`, with two implementations: `local/` (demo, localStorage; split into `store`, `seed`, `alerts`, `stays`, `changeovers`, `series`, `misc`) and `supabase.ts` (Postgres + Auth + Realtime, rows typed in `db-rows.ts`, no `any`). Pure crew logic: `rotation.ts` (generator) and `crew.ts` (allocation, reshape). **CI:** `ci/github-actions-ci.yml` runs lint, type check, unit tests, build and the e2e suite on every push once it is moved to `.github/workflows/ci.yml` (the deploy token has no `workflow` scope, so GitHub refused it there; move it with an account that has that scope). Chosen by `VITE_DATA_MODE` at build time. In Supabase mode, derived changeovers, the activity log and alert queueing run in triggers (`0002_rules.sql`). The dispatcher is an edge function (`functions/dispatch-alerts`) called every minute by pg_cron.

## Later
WhatsApp · CSV worker import · occupancy export for the contract · maintenance reports · photo proof on Ready · PWA install · branded domain.

## Hosting and access (Eshcol's dashboard step)
The site is on **Cloudflare Pages** (`roomboard.pages.dev`), auto-deployed from `github.com/Eshcolcode/roomboard` `main`.
**Before sharing the link, put it behind Cloudflare Access:**
1. Cloudflare dashboard → **Zero Trust** → Access → Applications → *Add an application* → **Self-hosted**.
2. Application domain: `roomboard.pages.dev` (and `*.roomboard.pages.dev`, which covers preview deployments).
3. Policy *Allow* → Include → **Emails**: Eshcol, RJ McLeod and the cleaners (or "Emails ending in" a domain). Identity: **One-time PIN** (no accounts needed).
4. Save, then check in a private window that the site asks for an email code.
Access protects the demo, which has no login of its own. In live mode, Supabase login and RLS still apply behind it.
