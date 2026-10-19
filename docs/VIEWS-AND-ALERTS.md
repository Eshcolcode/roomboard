# Three logins and the alert tiers (19 Oct 2026)

## Logins
Labelled by role only, never by a person's name: **RJ McLeod**, **Eshcol**, **Housekeeper** (`ROLE_LABEL` in
`src/data/core.ts`). Several people can share a login later; the Activity log still records which person made each
change, and only Eshcol sees those names.

| | RJ McLeod | Eshcol | Housekeeper |
|---|---|---|---|
| Board, Find a room, Workers, bookings | yes | yes | no |
| Prices | extras only, never contract properties | yes | **never** (`noPrices()` in `src/data/pricing.ts`) |
| Activity log | own rooms and bookings only (see below) | everything, with names | no |
| Today, Cleaning, room status | Today | yes | yes |
| Rate, rate history, calendar links, settings | no | yes | no |

RJ McLeod's Activity log (`visibleActivity` in `src/data/notify.ts`; live: the `activity read` policy in 0009) only
holds stay, crew and worker entries that are not Eshcol-only. Never cleaning (cleaner names), rate changes, calendar
(iCal / SuperControl) sync, settings or enquiries. People are shown as "RJ McLeod", "Eshcol" or "Housekeeper".

## Alert tiers (`classify` in `src/data/notify.ts`; live: `rb_change_tier` in 0009)
- **Important**: new booking (contract or extras), cancellation, arrival or leaving date change, an open-ended stay
  getting an end date, a move to another room. Red dot in the header for the other side (RJ McLeod's changes reach
  Eshcol; Eshcol's reach RJ McLeod, never Eshcol's own extra-property guests), and an email in the outbox.
- **Minor**: names, phone numbers, notes, away dates, rota tweaks, swapping who stays on the same dates, a confirmed
  departure. Activity log only: no email, no red dot.
- **Housekeeper**: a red dot only when an important change at Eshcol or Loch Roag touches the next 7 days. Eshcol can
  switch this off (Activity → Alerts).
- Crew changes are classified by what they really change: a rota tweak is minor, adding, cancelling or shortening
  stays is important.

## Email is OFF
The demo never sends anything (outbox rows show "not sent (demo)"). Live, rows queue in `alert_outbox`, but the
`dispatch-alerts` function sends nothing until `app_settings.notifications_live` is set to `true`, which is a
deliberate step for Donald once Supabase and Resend are set up. Migration: `supabase/migrations/0009_notifications.sql`
(tested locally by `supabase/tests/notify.sql`).

Checks: `npm test` (`src/data/notify.test.ts`) and `node qa/views.mjs`.
