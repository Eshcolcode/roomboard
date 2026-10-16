# Roomboard: build brief (v0.2)

**Purpose:** a shared occupancy board between Donald Macarthur (provider) and his 3-year contract client. It records who is in which room, who is coming, and which room needs cleaning by when. No money is handled. The contract is invoiced separately.

## Users and roles
| Role | Who | Can |
|---|---|---|
| Client coordinator | Client's accommodation lead | Add/edit/cancel stays and holds in contracted rooms. Manage saved workers. See changeover status (read-only). Send requests for other properties. See the activity log |
| Provider manager | Donald / team | Everything. Schedule changeovers and assign cleaners. See all requests and the alert outbox |
| Cleaner | Housekeeping | Today/Upcoming and Changeovers only, with first names only. Move own tasks to In progress → Ready |

## Properties (confirmed by Donald, 16 Oct 2026)
- **Loch Roag Guest House** (contracted): 9 rooms. **Upstairs: Rooms 1–5. Downstairs: Rooms 6–9.** Rooms 2 and 3 share a shower room. Room 8 has a private shower room (not ensuite). Rooms 1, 4, 5, 6, 7 and 9 are ensuite. Two kitchens, a large games room and lounge. *Images to follow.*
- **Eshcol Worker Accommodation** (contracted): **10 rooms in total, one property.** Main house Rooms 1–7: 2, 3, 4, 6 and 7 are ensuite, and 1 and 5 have an allocated private shower room. The downstairs flat (shown as a group label) has Rooms 8–10: 10 is ensuite, and 8 and 9 share the flat's shower room.
- **Upsell (not contracted):**
  - **Hebridean Holiday Cabins**: Pod 1 and Pod 2 (1 bed each), The Lodge (2 ensuite), The Cottage (2 ensuite plus an office).
  - **Whitefalls Spa Lodges**: **Monadh**, the only lodge available. It is a separate card.

## Client
**Sheena, RJ McLeod** (client coordinator). Email and phone are still to come.
**Privacy rule: the client never sees cleaner names or details.** That covers the board, changeovers, activity log (shown as "Housekeeping"), digests and alerts. She sees status only: *Cleaning to be scheduled / Cleaning scheduled / Cleaning in progress / Ready*. In Supabase, the RLS on `profiles` hides cleaner profiles from clients, and alert rows are visible only to their recipient.

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
    - **The client sees only "Ready by Tue 20 Oct", "Being cleaned · ready by …" or "Ready ✓"**, and nothing at all for a room with no next arrival. Markers on her board are one calm colour until ready.
14. **Same worker in two rooms at once** is a warning, not a block ("Heads up: … is also in Loch Roag Room 4"). It can be intended (moving rooms mid-stay).
15. **Room picker** lists only rooms free for the chosen dates, labelled "Loch Roag · Room 8 · Ensuite"; "Show taken rooms too" reveals the rest (and the clash message explains who has it).
16. **Booking a worker** (Workers → Book, search, or picking them in Add stay) starts on the day their current dated stay ends, in the same room if it is free, so it continues without a clean. Dates the user already chose are never overwritten.
17. **Undo:** every save, cancel and departure confirmation shows a toast with **Undo** (about 8 seconds). Cancelling a stay asks first. Undo restores the exact records (same ids, booked cleans included) in the demo; in live mode it applies the inverse change through the same database rules.
18. **UK dates everywhere:** inputs are typed and shown as dd/mm/yyyy (with the weekday beside them and a calendar button) regardless of browser language; displays use "Fri 16 Oct".

## Shared rule tests (no drift between demo and database)
The pure rules live in `src/data/rules.ts` (TypeScript) and `supabase/migrations/0006_rule_functions.sql` (`rb_nights`, `rb_overlaps`, `rb_boundary`, `rb_clean_window`, `rb_status_gate`, `rb_stay_error`). The triggers in `0002_rules.sql` call the SQL functions; the demo store calls the TS ones. **One case file, `rules/cases.json`, drives both suites:** `npm test` (vitest) and `npm run test:sql` (`qa/sql.sh`: fresh local Postgres, all migrations, smoke test, then every case through the SQL functions). A rule changed on one side only fails the other suite.

## Alert routing
| Recipient | Gets |
|---|---|
| Cleaner | Changeover alerts only: scheduled, rescheduled, invalidated, ready-by moved, flagged/cancelled |
| Client (Sheena) | Stay changes made **by the provider**, and *room ready*. Never any cleaner names |
| Provider | Stay changes made **by the client**, departure confirmations, invalidated or flagged changeovers, requests for other properties |

- **Channels:** each user gets **one channel by default (email)**. SMS is opt-in per user (Activity → My alerts). Push only when enabled.
- **Own edits:** a user is never alerted about their own edit.
- **Dedupe:** alerts are deduped by event, recipient and channel.
- **Outbox states:** in live mode, `queued → accepted → delivered (where known) / failed → acknowledged`, plus `no_address`. **The demo labels everything "Simulated".**

**07:00 digest:** today's departures and arrivals, changeovers due in the next 7 days, and the in-house count.

## Screens
- **Header:** one band. Icon nav at 820–1180px, **Search** (press `/`: workers and rooms), the *Demo* pill (explains demo mode; provider-only *Reset demo data* inside, with confirmation) and the person switcher.
- **Board** (tape chart): properties and units down the left with "N allocated · M on site", days across, today line, hatched holds, cleaning markers placed in the gap between stays (never over a bar), "Left ✓" on bars once the guest has left. The night rule sits behind an ⓘ. KPIs: Rooms allocated tonight, Expected on site, Departing today, Arriving in 7 days, Holds, Cleans due in 7 days (client: Rooms getting ready).
- **Find a room:** pick arriving / leaving (or until further notice) and bathroom type. Free rooms are grouped by property; tap one to open the booking with room and dates filled in.
- **Rooms** (per-room list): who is in and which night, "Leaves Fri 23 Oct (planned)" / "Until further notice" / "Departure TBC", **Away · room kept** tags, *Next* (skipping the same worker continuing), and readiness. **Sheena's phone opens here.**
- **Stay panel:** side panel on desktop, **full-screen sheet on phone**; closes on Escape, on role switch and returns focus to the opener. Recent workers, search, new worker inline, hold mode, departure status, away range, free-only room picker, live clash check, two-room warning, "Last changed by …".
- **Today / Upcoming** with a **Print** button. **Cleaning** (provider and cleaners; 5 columns with plain titles; default checkout/check-in times) with **Print cleaning list**.
- **Print views** (`#print-today`, `#print-cleaning`): A4 tables with tick boxes; print CSS hides the app chrome, so "Save as PDF" gives a clean sheet.
- **Workers**, **More rooms** (other brands as enquiries: "4 units · subject to confirmation", never "available"), **Activity** (log, 07:00 email preview, my alerts, outbox).
- **First login:** a welcome with three role-specific hints, dismissed once and remembered per person. Friendly empty states everywhere.
- **Phone:** bottom bar with at most five tabs (client: Rooms, Find a room, Today, Workers, More; provider: Rooms, Today, Cleaning, Find a room, More; cleaner: Today, Cleaning) and a floating **+ Add stay / Hold** on Rooms and Today.

## Architecture
Static SPA (Vite + React + TS) → uploadable to WPX. UI is split into `src/ui/*` (one file per screen plus `DateField`, `overlays` for toasts/confirm, `Search`, `Welcome`, `Print`); `src/App.tsx` is only the shell and routing. Code is formatted with Prettier (`npm run format`). One data interface, `src/data/repo.ts`, with two implementations: `local.ts` (demo, localStorage) and `supabase.ts` (Postgres + Auth + Realtime). Chosen by `VITE_DATA_MODE` at build time. In Supabase mode, derived changeovers, the activity log and alert queueing run in triggers (`0002_rules.sql`). The dispatcher is an edge function (`functions/dispatch-alerts`) called every minute by pg_cron.

## Later
Recurring rotations · WhatsApp · CSV worker import · occupancy export for the contract · maintenance reports · photo proof on Ready · PWA install · branded domain.

## Hosting and access (Donald's dashboard step)
The site is on **Cloudflare Pages** (`roomboard.pages.dev`), auto-deployed from `github.com/Eshcolcode/roomboard` `main`.
**Before sharing the link, put it behind Cloudflare Access:**
1. Cloudflare dashboard → **Zero Trust** → Access → Applications → *Add an application* → **Self-hosted**.
2. Application domain: `roomboard.pages.dev` (and `*.roomboard.pages.dev`, which covers preview deployments).
3. Policy *Allow* → Include → **Emails**: Donald, Sheena and the cleaners (or "Emails ending in" a domain). Identity: **One-time PIN** (no accounts needed).
4. Save, then check in a private window that the site asks for an email code.
Access protects the demo, which has no login of its own. In live mode, Supabase login and RLS still apply behind it.
