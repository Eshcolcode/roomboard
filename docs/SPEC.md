# Roomboard: build brief (v0.1)

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
Property → Unit → Room (bath: ensuite/private/shared) · ContractAllocation (room, period) · Worker (saved profile) · **Stay** (room, worker or null = *Hold, name to follow*, arrival, departure, depStatus `planned|confirmed|tbc|ufn`, away range, version) · **Changeover** (room, from/to stay, afterDate, readyBy, status `needs|scheduled|in_progress|ready`, cleaner) · Activity · AlertOutbox · Enquiry · Profile (user + role).

## Rules
1. Dates are Europe/London calendar days. **Arrival is inclusive and departure exclusive**, so a guest leaving on the 16th and the next arriving on the 16th do not clash.
2. Contract allocation, stay and readiness are three separate things.
3. Naming a hold updates **the same record**.
4. **Overlaps are blocked by the database** (gist exclusion on `daterange(arrival, coalesce(departure,'infinity'))`). The UI pre-checks and explains the clash.
5. **Stale edits are detected** using an optimistic `version` column. A save against an old version is refused with a "changed by X" message.
6. Changeovers are derived from stay boundaries. **Extending a stay or bringing an arrival forward invalidates Scheduled/Ready**, resets it to Needs scheduling, and re-alerts everyone by SMS.
7. **A planned departure is not a confirmed departure.** Today shows "Planned, confirm before stripping", and a Confirm departure action is provided.
8. **Away, room retained** keeps the room allocated and triggers no clean.
9. **Departure TBC** and **Until further notice** are open-ended. No changeover is created until a date is set.
10. A back-to-back re-stay by the same worker is a stayover, not a clean.
11. **Alerts are queued** in an outbox and sent by a dispatcher with retry and exponential backoff (up to 6 attempts). Channels: push (realtime in-app), email, SMS. WhatsApp is reserved.

## Alert matrix
| Event | Client | Manager | Cleaner | SMS? |
|---|---|---|---|---|
| New stay / hold | ✓ | ✓ | ✓ | if arrival ≤ 2 days |
| Stay edited (dates, room, naming a hold) | ✓ | ✓ | ✓ | if it departs today or arrival is brought forward |
| Departure confirmed | | ✓ | ✓ | ✓ |
| Changeover invalidated (extend / bring forward) | ✓ | ✓ | ✓ | ✓ |
| Changeover scheduled / in progress | ✓ | ✓ | ✓ | scheduled only |
| Changeover Ready | ✓ | ✓ | | |
| Request for another property | | ✓ | | ✓ |
| 07:00 digest | ✓ | ✓ | ✓ (first names) | email |
The person making a change is never alerted about it.

## Screens
Board (tape chart: properties and units down the left, days across, today line, hatched holds, brush markers for changeovers, side-panel editing, click an empty day to add) · Add/Edit stay panel (recent workers one tap, search, new worker inline, hold mode, departure status, away range, live clash check) · Today (departures, changeovers, arrivals, stayovers; plus Upcoming) · Workers directory · Changeovers board (4 columns, visible to the client) · Available elsewhere (hero, cards, Request form, long-term option) · Activity (log, 07:00 digest preview, alert outbox). On a phone: a bottom tab bar, and the Board becomes the Today/Upcoming list.

## Architecture
Static SPA (Vite + React + TS) → uploadable to WPX. One data interface, `src/data/repo.ts`, with two implementations: `local.ts` (demo, localStorage) and `supabase.ts` (Postgres + Auth + Realtime). Chosen by `VITE_DATA_MODE` at build time. In Supabase mode, derived changeovers, the activity log and alert queueing run in triggers (`0002_rules.sql`). The dispatcher is an edge function (`functions/dispatch-alerts`) called every minute by pg_cron.

## Later
Recurring rotations · WhatsApp · CSV worker import · occupancy export for the contract · maintenance reports · photo proof on Ready · PWA install · branded domain.
