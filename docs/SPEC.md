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
1. Dates are Europe/London calendar days. **Arrival is inclusive and departure exclusive.** Day maths is done on calendar dates, so the 25 Oct 2026 clock change has no effect.
2. Contract allocation, stay and readiness are separate things.
3. Naming a hold updates **the same record**.
4. **Overlaps are blocked by the database**: a gist exclusion constraint, plus a friendly clash message from the `stays_before` trigger.
5. **Stale edits are detected.** The client sends the version it loaded, and the trigger rejects a mismatch with SQLSTATE 40001. The demo does the same across browser tabs.
6. **Changeovers are persistent rows with stable IDs.**
   - A date change on either linked stay sets the row to *Needs scheduling* with an "invalidated" reason, writes an activity line, and alerts the provider and cleaner.
   - A scheduled changeover is never deleted silently. If its departure is removed or made open-ended, the row is kept and **flagged** until the provider dismisses it.
7. **Same day, same worker** = *continues*: the bar shows "Continues · no clean", no clean is created, and it is logged. **Same day, different worker** = a same-day changeover with a zero-day warning and the property's default times (checkout 10:00, check-in 15:00, editable by the provider on Changeovers).
8. **The sequence is departure → vacated → clean → ready, all before the next arrival.**
   - *Vacated* (the guest actually left) can be recorded only on or after the departure date.
   - Starting the clean and marking Ready both need Vacated.
   - A clean date outside departure → next arrival is refused, unless the provider records an explicit **exception**. An exception stays flagged on the Board, Changeovers and Today until resolved.
9. **A planned departure is not a confirmed one.** Cards say "Departs Wed 21 Oct (planned)" or "(confirmed)", never "Vacated" for a future date.
10. **Away, room retained** keeps the room allocated with no clean. KPIs show **Rooms allocated** and **Expected on site** separately.
11. **Departure TBC** and **Until further notice** are open-ended and create no changeover.
12. **Needs scheduling** shows changeovers in the next 7 days or with a next arrival booked. The rest go under **Later**.
13. Task status has **one source of truth** (`changeovers.status`). The Board, Today, Upcoming, Rooms and Changeovers all render it.

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
Board (tape chart with icon-only nav at 820–1180px and compact bars with a nights chip: properties and units down the left, days across, today line, hatched holds, brush markers for changeovers, side-panel editing, click an empty day to add) · Add/Edit stay panel (recent workers one tap, search, new worker inline, hold mode, departure status, away range, live clash check) · Today (departures, changeovers, arrivals, stayovers; plus Upcoming) · Workers directory · Changeovers board (4 columns, visible to the client) · Available elsewhere (hero, cards, Request form, long-term option) · Activity (log, 07:00 digest preview, alert outbox). On a phone: a bottom tab bar. The Board becomes Today / Upcoming / **Rooms** (per room: who's in, nights, departs, next arrival, readiness), with a floating **+ Add stay / Hold** button. Reset demo data is shown only to the provider, only in demo mode.

## Architecture
Static SPA (Vite + React + TS) → uploadable to WPX. One data interface, `src/data/repo.ts`, with two implementations: `local.ts` (demo, localStorage) and `supabase.ts` (Postgres + Auth + Realtime). Chosen by `VITE_DATA_MODE` at build time. In Supabase mode, derived changeovers, the activity log and alert queueing run in triggers (`0002_rules.sql`). The dispatcher is an edge function (`functions/dispatch-alerts`) called every minute by pg_cron.

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
