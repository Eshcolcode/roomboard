# Test report

## Release: Quick editing (live)
- **Run:** Saturday, 17 October 2026, 19:04–19:08 (UK time)
- **Code commit:** `3bbde46` (main `ccf2377` adds only README text); live site serves `assets/index-BGZTTuGS.js`, the same asset as the local production build.
- **Local:** unit 110/110 passed (adds `src/simple/logic.test.ts`, `src/data/batch.test.ts`) · lint (ESLint + Prettier) clean · `tsc` clean · build clean.
- **Against https://roomboard.pages.dev/:** `qa/qa.mjs` 161/161 (Classic, pinned) · `qa/board.mjs` 64/64 (Quick card on board, phone + desktop, widths 360–1440, split/join, crew rotations, swipe close, client sees no cleaner names, no console errors) · `qa/flow.mjs` 23/23 (#simple walk-through).
- **Not covered:** live database (Supabase) batch saves; SQL suite not re-run (no SQL changes).
- **Rollback:** tag `live-v2-restore` / branch `live-v2-backup` (`fcffd27`); see README.

The sections below are the previous full report (commit `1c1e856`).

- **Run:** Saturday, 17 October 2026 at 00:39 (UK time)
- **Commit:** `1c1e85687bb8cde9e5990a66e698aeca9beb7d8c`
- **Target for end-to-end tests:** https://roomboard.pages.dev/ serving `assets/index-Mky4h06u.js`
- **Local production build:** `assets/index-Mky4h06u.js` (same asset as the target: the deployed site is this commit)
- **Totals:** unit 93/93 passed · SQL 74/74 passed · end-to-end 161/161 passed · lint (ESLint + Prettier) clean

All demo-mode checks below run without any of Donald's accounts. The live database, email and SMS checks need a real Supabase project, a Resend key and a Twilio account, and are **pending** (bottom section).

## 1. Unit tests (vitest) – 93/93 passed
Pure rules (`src/data/rules.ts`) and the rotation generator (`src/data/rotation.ts`) driven by the shared `rules/cases.json`, date helpers, store rules (`core.ts`), demo commands (`local/`: exception override, undo), crew booking (`crew.ts`: allocation, all-or-nothing, extend / shorten / single occurrence) and the role-aware Copy summary.

| # | Check | Result |
|---|---|---|
| 1 | dates.test.ts › dates › addDays across the October clock change | PASS |
| 2 | dates.test.ts › dates › addDays across month and year | PASS |
| 3 | dates.test.ts › dates › diffDays is whole days | PASS |
| 4 | dates.test.ts › dates › UK short format | PASS |
| 5 | dates.test.ts › dates › UK numeric format | PASS |
| 6 | dates.test.ts › dates › parses dd/mm/yyyy | PASS |
| 7 | dates.test.ts › dates › rejects impossible dates | PASS |
| 8 | data/core.test.ts › reconcile › creates one changeover per dated departure, none for open-ended | PASS |
| 9 | data/core.test.ts › reconcile › same worker back-to-back continues: no clean | PASS |
| 10 | data/core.test.ts › reconcile › different worker same day is a zero-day changeover | PASS |
| 11 | data/core.test.ts › reconcile › a booked clean is invalidated (same id) when dates change, never deleted | PASS |
| 12 | data/core.test.ts › reconcile › a booked clean whose departure becomes open-ended is flagged, not removed | PASS |
| 13 | data/core.test.ts › validate / warnings / finder › clash names the guest and the room | PASS |
| 14 | data/core.test.ts › validate / warnings / finder › same worker in two rooms is a warning, not an error | PASS |
| 15 | data/core.test.ts › validate / warnings / finder › free rooms excludes taken and non-contracted rooms | PASS |
| 16 | data/core.test.ts › validate / warnings / finder › booking a worker defaults to after their current stay, same room if free | PASS |
| 17 | data/core.test.ts › validate / warnings / finder › occupancy counts away guests as allocated but not on site | PASS |
| 18 | data/core.test.ts › readiness (single status source) › client sees "Ready by" only; provider sees the cleaning state | PASS |
| 19 | data/core.test.ts › readiness (single status source) › no next arrival: nothing shown to the client | PASS |
| 20 | data/core.test.ts › readiness (single status source) › exception keeps a warning tone until ready | PASS |
| 21 | data/crew.test.ts › crew planning › gives each person a different free room and flags nothing | PASS |
| 22 | data/crew.test.ts › crew planning › prefers a worker's usual room | PASS |
| 23 | data/crew.test.ts › crew planning › flags a clash before anything is saved when there are not enough rooms | PASS |
| 24 | data/crew.test.ts › crew booking › keep mode: one stay per cycle, joined back to back, away on off days, one clean per room at the end | PASS |
| 25 | data/crew.test.ts › crew booking › release mode: every on block ends in a changeover | PASS |
| 26 | data/crew.test.ts › crew booking › is all or nothing when a stay clashes | PASS |
| 27 | data/crew.test.ts › crew booking › undo removes the whole booking in one step | PASS |
| 28 | data/crew.test.ts › crew booking › extend adds cycles and turns the old last stay into a full cycle | PASS |
| 29 | data/crew.test.ts › crew booking › shorten to an end date drops later cycles | PASS |
| 30 | data/crew.test.ts › crew booking › a single occurrence can be changed on its own and is kept when the series is reshaped | PASS |
| 31 | data/crew.test.ts › crew booking › naming a hold keeps the room continuing across cycles | PASS |
| 32 | data/local.test.ts › clean outside the window (Room 4: leaves +5, next arrival +6) › is refused without an exception | PASS |
| 33 | data/local.test.ts › clean outside the window (Room 4: leaves +5, next arrival +6) › is allowed as a provider exception and stays flagged until ready | PASS |
| 34 | data/local.test.ts › clean outside the window (Room 4: leaves +5, next arrival +6) › cannot be taken by the client as an exception | PASS |
| 35 | data/local.test.ts › clean outside the window (Room 4: leaves +5, next arrival +6) › ready needs "guest has left" | PASS |
| 36 | data/local.test.ts › undo › restores a cancelled stay with the same id and its booked clean | PASS |
| 37 | data/local.test.ts › undo › reverts an edit and bumps the version so other tabs see it | PASS |
| 38 | data/rules.test.ts › nights › one night | PASS |
| 39 | data/rules.test.ts › nights › across clocks going back (25 Oct) | PASS |
| 40 | data/rules.test.ts › nights › across clocks going forward (29 Mar) | PASS |
| 41 | data/rules.test.ts › nights › month boundary | PASS |
| 42 | data/rules.test.ts › nights › leap day | PASS |
| 43 | data/rules.test.ts › nights › year boundary | PASS |
| 44 | data/rules.test.ts › overlaps (arrival inclusive, departure exclusive) › back to back is not a clash | PASS |
| 45 | data/rules.test.ts › overlaps (arrival inclusive, departure exclusive) › one night overlap | PASS |
| 46 | data/rules.test.ts › overlaps (arrival inclusive, departure exclusive) › inside | PASS |
| 47 | data/rules.test.ts › overlaps (arrival inclusive, departure exclusive) › open-ended blocks later stays | PASS |
| 48 | data/rules.test.ts › overlaps (arrival inclusive, departure exclusive) › open-ended after a finished stay | PASS |
| 49 | data/rules.test.ts › overlaps (arrival inclusive, departure exclusive) › two open-ended | PASS |
| 50 | data/rules.test.ts › overlaps (arrival inclusive, departure exclusive) › entirely before | PASS |
| 51 | data/rules.test.ts › boundary: continues / zero-day / changeover › same worker same day continues | PASS |
| 52 | data/rules.test.ts › boundary: continues / zero-day / changeover › different worker same day is zero-day | PASS |
| 53 | data/rules.test.ts › boundary: continues / zero-day / changeover › hold arriving same day is zero-day | PASS |
| 54 | data/rules.test.ts › boundary: continues / zero-day / changeover › same worker after a gap needs a clean | PASS |
| 55 | data/rules.test.ts › boundary: continues / zero-day / changeover › no next arrival needs a clean | PASS |
| 56 | data/rules.test.ts › boundary: continues / zero-day / changeover › until further notice: no clean | PASS |
| 57 | data/rules.test.ts › boundary: continues / zero-day / changeover › departure TBC: no clean | PASS |
| 58 | data/rules.test.ts › boundary: continues / zero-day / changeover › crew slot (unnamed hold) back to back continues | PASS |
| 59 | data/rules.test.ts › boundary: continues / zero-day / changeover › crew slot named on one cycle only still continues | PASS |
| 60 | data/rules.test.ts › boundary: continues / zero-day / changeover › different crew slots same day is zero-day | PASS |
| 61 | data/rules.test.ts › boundary: continues / zero-day / changeover › same crew slot after released off days needs a clean | PASS |
| 62 | data/rules.test.ts › clean window › on departure day | PASS |
| 63 | data/rules.test.ts › clean window › on next arrival day | PASS |
| 64 | data/rules.test.ts › clean window › before departure | PASS |
| 65 | data/rules.test.ts › clean window › after next arrival (Room 4 exception case) | PASS |
| 66 | data/rules.test.ts › clean window › no next arrival: any date after departure | PASS |
| 67 | data/rules.test.ts › status gate (vacated → clean → ready) › vacated before departure refused | PASS |
| 68 | data/rules.test.ts › status gate (vacated → clean → ready) › vacated on departure day | PASS |
| 69 | data/rules.test.ts › status gate (vacated → clean → ready) › ready without vacated refused | PASS |
| 70 | data/rules.test.ts › status gate (vacated → clean → ready) › ready with vacated | PASS |
| 71 | data/rules.test.ts › status gate (vacated → clean → ready) › start clean without vacated refused | PASS |
| 72 | data/rules.test.ts › status gate (vacated → clean → ready) › ready before departure refused even if ticked | PASS |
| 73 | data/rules.test.ts › stay validation › valid planned stay | PASS |
| 74 | data/rules.test.ts › stay validation › missing arrival | PASS |
| 75 | data/rules.test.ts › stay validation › planned without departure | PASS |
| 76 | data/rules.test.ts › stay validation › ufn ignores departure | PASS |
| 77 | data/rules.test.ts › stay validation › departure same as arrival | PASS |
| 78 | data/rules.test.ts › stay validation › away back before leaves | PASS |
| 79 | data/rules.test.ts › stay validation › away outside stay | PASS |
| 80 | data/rules.test.ts › stay validation › away inside open-ended stay | PASS |
| 81 | data/rules.test.ts › stay validation › clash with existing stay | PASS |
| 82 | data/rules.test.ts › stay validation › back to back is fine | PASS |
| 83 | data/rules.test.ts › stay validation › open-ended new stay clashes with later stay | PASS |
| 84 | data/rules.test.ts › crew rotation generator › 10 on 4 off, 3 cycles, keep room | PASS |
| 85 | data/rules.test.ts › crew rotation generator › 10 on 4 off, 3 cycles, release room | PASS |
| 86 | data/rules.test.ts › crew rotation generator › end date cuts the last block short | PASS |
| 87 | data/rules.test.ts › crew rotation generator › end date inside off days, keep: last stay ends at its block | PASS |
| 88 | data/rules.test.ts › crew rotation generator › across clocks going back | PASS |
| 89 | data/rules.test.ts › crew rotation generator › no off days: back-to-back blocks | PASS |
| 90 | data/rules.test.ts › crew rotation generator › until further notice: 12 weeks generated | PASS |
| 91 | ui/summary.test.ts › copy summary › covers today and tomorrow | PASS |
| 92 | ui/summary.test.ts › copy summary › provider version names the cleaner | PASS |
| 93 | ui/summary.test.ts › copy summary › client version has no cleaner names and only 'Ready by' wording | PASS |

## 2. SQL tests on local Postgres 17 – 74/74 passed
Fresh database, migrations 0001–0004, 0006 and 0007 (pg_cron 0005 skipped), `supabase/tests/smoke.sql` (trigger behaviour, including crew bookings through `apply_series()`), then **the same `rules/cases.json`** through the `rb_*` SQL functions that the triggers call. Runs as a superuser, so row-level security is **not** exercised here.

| # | Check | Result |
|---|---|---|
| 1 | T1 changeover created | PASS |
| 2 | T2 provider alerted for client edit | PASS |
| 3 | T3 client not alerted for own edit | PASS |
| 4 | T4 cleaner alerted on schedule | PASS |
| 5 | C2 out-of-window clean blocked: Clean date must be between the departure (2026-10-16) and the next arrival (2026-10-20) | PASS |
| 6 | T5 provider exception allowed + flagged | PASS |
| 7 | C1 ready without vacated blocked: Ready needs a recorded actual departure (vacated) | PASS |
| 8 | T6 invalidated, same id, needs | PASS |
| 9 | T7 provider alerted on invalidation | PASS |
| 10 | T8 scheduled changeover never silently deleted | PASS |
| 11 | stale edit rejected | PASS |
| 12 | clash blocked: Clashes with Neil (2026-10-02 → open-ended) in Loch Roag Room 8 | PASS |
| 13 | T9 continues: no clean | PASS |
| 14 | T10 zero-day changeover | PASS |
| 15 | T11 dedupe key unique | PASS |
| 16 | T12 no_address for blank email | PASS |
| 17 | T13 crew: 6 stays generated | PASS |
| 18 | T14 crew keep: one clean per room (end only) | PASS |
| 19 | T15 crew: one summary alert per recipient, not one per stay | PASS |
| 20 | crew clash rolls back whole booking: Clashes with Name TBC 0 (2027-02-01 → 2027-02-08) in Loch Roag Room 2 | PASS |
| 21 | T16 crew clash left nothing behind | PASS |
| 22 | nights: one night | PASS |
| 23 | nights: across clocks going back (25 Oct) | PASS |
| 24 | nights: across clocks going forward (29 Mar) | PASS |
| 25 | nights: month boundary | PASS |
| 26 | nights: leap day | PASS |
| 27 | nights: year boundary | PASS |
| 28 | overlaps: back to back is not a clash | PASS |
| 29 | overlaps: one night overlap | PASS |
| 30 | overlaps: inside | PASS |
| 31 | overlaps: open-ended blocks later stays | PASS |
| 32 | overlaps: open-ended after a finished stay | PASS |
| 33 | overlaps: two open-ended | PASS |
| 34 | overlaps: entirely before | PASS |
| 35 | boundary: same worker same day continues | PASS |
| 36 | boundary: different worker same day is zero-day | PASS |
| 37 | boundary: hold arriving same day is zero-day | PASS |
| 38 | boundary: same worker after a gap needs a clean | PASS |
| 39 | boundary: no next arrival needs a clean | PASS |
| 40 | boundary: until further notice: no clean | PASS |
| 41 | boundary: departure TBC: no clean | PASS |
| 42 | boundary: crew slot (unnamed hold) back to back continues | PASS |
| 43 | boundary: crew slot named on one cycle only still continues | PASS |
| 44 | boundary: different crew slots same day is zero-day | PASS |
| 45 | boundary: same crew slot after released off days needs a clean | PASS |
| 46 | cleanWindow: on departure day | PASS |
| 47 | cleanWindow: on next arrival day | PASS |
| 48 | cleanWindow: before departure | PASS |
| 49 | cleanWindow: after next arrival (Room 4 exception case) | PASS |
| 50 | cleanWindow: no next arrival: any date after departure | PASS |
| 51 | statusGate: vacated before departure refused | PASS |
| 52 | statusGate: vacated on departure day | PASS |
| 53 | statusGate: ready without vacated refused | PASS |
| 54 | statusGate: ready with vacated | PASS |
| 55 | statusGate: start clean without vacated refused | PASS |
| 56 | statusGate: ready before departure refused even if ticked | PASS |
| 57 | stay: valid planned stay | PASS |
| 58 | stay: missing arrival | PASS |
| 59 | stay: planned without departure | PASS |
| 60 | stay: ufn ignores departure | PASS |
| 61 | stay: departure same as arrival | PASS |
| 62 | stay: away back before leaves | PASS |
| 63 | stay: away outside stay | PASS |
| 64 | stay: away inside open-ended stay | PASS |
| 65 | stay: clash with existing stay | PASS |
| 66 | stay: back to back is fine | PASS |
| 67 | stay: open-ended new stay clashes with later stay | PASS |
| 68 | rotation: 10 on 4 off, 3 cycles, keep room | PASS |
| 69 | rotation: 10 on 4 off, 3 cycles, release room | PASS |
| 70 | rotation: end date cuts the last block short | PASS |
| 71 | rotation: end date inside off days, keep: last stay ends at its block | PASS |
| 72 | rotation: across clocks going back | PASS |
| 73 | rotation: no off days: back-to-back blocks | PASS |
| 74 | rotation: until further notice: 12 weeks generated | PASS |

## 3. End-to-end (Playwright, Chrome) – 161/161 passed
Desktop 1440px plus 820/900/1000px layout checks, phone 390×844, every role (provider, Sheena, cleaner), axe WCAG 2 A/AA. Group `[v2]`: room cards, filtering tiles, urgent banner, Copy summary (clipboard read back), crew booking end to end, drag to move / resize with clash feedback and undo.

| # | Check | Result |
|---|---|---|
| 1 | C6 header says Demo | PASS |
| 2 | single header band (no separate demo strip) | PASS |
| 3 | night rule moved behind an info icon | PASS |
| 4 | C4 KPIs: Rooms allocated + Expected on site | PASS |
| 5 | open cleans KPI counts the next 7 days only | PASS |
| 6 | property headings: N allocated · M on site | PASS |
| 7 | 7 Reset demo data available to provider | PASS |
| 8 | UK date format (dd/mm/yyyy) in date inputs | PASS |
| 9 | cleaning markers never overlap bars  | PASS |
| 10 | room picker: free rooms only, labelled 'Eshcol · Room 9' | PASS |
| 11 | add stay | PASS |
| 12 | undo toast after save | PASS |
| 13 | undo removes the new stay | PASS |
| 14 | reload persistence | PASS |
| 15 | no version numbers shown | PASS |
| 16 | extend logged | PASS |
| 17 | move stay to another room | PASS |
| 18 | confirmation before cancelling | PASS |
| 19 | Go back keeps the stay | PASS |
| 20 | cancel stay | PASS |
| 21 | undo restores a cancelled stay | PASS |
| 22 | clash blocked (taken room shown only on request) | PASS |
| 23 | departure before arrival blocked | PASS |
| 24 | empty departure blocked | PASS |
| 25 | impossible date (31/02) flagged | PASS |
| 26 | UFN disables departure | PASS |
| 27 | UFN stay open-ended | PASS |
| 28 | TBC stay shown open-ended | PASS |
| 29 | same worker in two rooms: warning shown | PASS |
| 30 | away: back before leaves blocked | PASS |
| 31 | away, room kept shown on board | PASS |
| 32 | Escape closes panel | PASS |
| 33 | role switch closes the stay panel | PASS |
| 34 | naming a hold keeps the same record | PASS |
| 35 | global search: worker → their stay | PASS |
| 36 | global search: room | PASS |
| 37 | [exception] exception: out-of-window date asks first | PASS |
| 38 | [exception] exception: refused unless confirmed | PASS |
| 39 | [exception] exception: booked and flagged on Cleaning | PASS |
| 40 | [exception] exception: warning persists after reload | PASS |
| 41 | [exception] exception: flagged on Board | PASS |
| 42 | [exception] exception: flagged on Today/Upcoming | PASS |
| 43 | [exception] exception: shown on printed cleaning list | PASS |
| 44 | [exception] exception: logged | PASS |
| 45 | [exception] exception: provider detail not shown to client | PASS |
| 46 | C1 Room 4: cannot tick left / start before departure | PASS |
| 47 | 2 planned departures say 'Guest leaves … (planned)', never 'Vacated' | PASS |
| 48 | Room 8 leaves today (confirmed) | PASS |
| 49 | board bar shows 'Left ✓' once the guest has left | PASS |
| 50 | Room 8 → Ready after guest left | PASS |
| 51 | C3 Board shows Ready | PASS |
| 52 | C3 Upcoming shows Ready | PASS |
| 53 | C3 Rooms (client) shows Ready | PASS |
| 54 | 1 date change on a booked clean → book again (row kept) | PASS |
| 55 | no 'invalidated' wording | PASS |
| 56 | 1 activity line for the date change | PASS |
| 57 | 1 provider alerted | PASS |
| 58 | 1 same worker same day shows 'continues' | PASS |
| 59 | 1 different worker same day → same-day turnaround | PASS |
| 60 | 3 cleans with no arrival and > 7 days go under Later | PASS |
| 61 | 3 digest content | PASS |
| 62 | 4 provider edit → client only; not cleaner; not self | PASS |
| 63 | 4 email only by default | PASS |
| 64 | C6 outbox says simulated | PASS |
| 65 | 7 cleaner: 2 tabs | PASS |
| 66 | 7 cleaner: no reset | PASS |
| 67 | 7 client: no reset | PASS |
| 68 | Sheena: no cleaner names and no scheduling noise  | PASS |
| 69 | free-rooms finder: grouped by property with count + nights | PASS |
| 70 | finder: tap a room → booking prefilled | PASS |
| 71 | finder: booked room no longer free | PASS |
| 72 | Book for a worker in house defaults to the day their stay ends | PASS |
| 73 | More rooms: unit counts + 'subject to confirmation', no availability claims | PASS |
| 74 | enquiry: invalid people rejected | PASS |
| 75 | C7 enquiry echoes dates, not a booking | PASS |
| 76 | Next: never shows the same worker continuing as a new arrival | PASS |
| 77 | open-ended stays say 'Until further notice', no 'departs' | PASS |
| 78 | rooms list headings: N allocated · M on site | PASS |
| 79 | week navigation | PASS |
| 80 | clock change 25 Oct: consecutive days | PASS |
| 81 | month boundary labelled | PASS |
| 82 | print view: today’s movements | PASS |
| 83 | print CSS hides the toolbar | PASS |
| 84 | print view: cleaning list | PASS |
| 85 | friendly empty state (enquiries) | PASS |
| 86 | friendly empty state (worker search) | PASS |
| 87 | stale edit across tabs detected | PASS |
| 88 | corrupt storage → falls back to seed | PASS |
| 89 | reset restores starting example | PASS |
| 90 | [a11y] a11y board: no WCAG A/AA violations | PASS |
| 91 | [a11y] a11y rooms: no WCAG A/AA violations | PASS |
| 92 | [a11y] a11y crew: no WCAG A/AA violations | PASS |
| 93 | [a11y] a11y free: no WCAG A/AA violations | PASS |
| 94 | [a11y] a11y changeovers: no WCAG A/AA violations | PASS |
| 95 | [a11y] a11y available: no WCAG A/AA violations | PASS |
| 96 | [a11y] a11y activity: no WCAG A/AA violations | PASS |
| 97 | [a11y] a11y workers: no WCAG A/AA violations | PASS |
| 98 | [a11y] a11y today: no WCAG A/AA violations | PASS |
| 99 | [a11y] a11y stay panel: ok | PASS |
| 100 | [a11y] closing the panel returns focus to the button that opened it | PASS |
| 101 | [a11y] keyboard: first Tab reaches the main nav | PASS |
| 102 | first login: welcome with 3 hints | PASS |
| 103 | welcome dismissed and remembered | PASS |
| 104 | [layout] 820px header one line (56px) | PASS |
| 105 | [layout] 820px no clipped bar text  | PASS |
| 106 | [layout] 900px header one line (56px) | PASS |
| 107 | [layout] 900px no clipped bar text  | PASS |
| 108 | [layout] 1000px header one line (56px) | PASS |
| 109 | [layout] 1000px no clipped bar text  | PASS |
| 110 | [layout] 1440px header one line (56px) | PASS |
| 111 | [layout] 1440px no clipped bar text  | PASS |
| 112 | [phone] phone: no horizontal overflow | PASS |
| 113 | [phone] C5 phone FAB Add stay / Hold | PASS |
| 114 | [phone] 6/C5 phone per-room list (19 rooms) | PASS |
| 115 | [phone] phone: stay panel is a full-screen sheet | PASS |
| 116 | [phone] phone today: no horizontal overflow | PASS |
| 117 | [phone] phone changeovers: no horizontal overflow | PASS |
| 118 | [phone] phone free: no horizontal overflow | PASS |
| 119 | [phone] phone available: no horizontal overflow | PASS |
| 120 | [phone] phone activity: no horizontal overflow | PASS |
| 121 | [phone] phone workers: no horizontal overflow | PASS |
| 122 | [phone] phone crew: no horizontal overflow | PASS |
| 123 | [phone] phone cleaner tabs | PASS |
| 124 | [phone] Sheena's phone opens on Rooms (5 tabs) | PASS |
| 125 | [phone] Sheena's phone: only 'Ready by …' statuses | PASS |
| 126 | [phone] phone Rooms: Ruairidh (Room 5) shows 'Away · room kept' | PASS |
| 127 | [phone] phone: Find a room in the bottom bar | PASS |
| 128 | [phone] phone: More sheet | PASS |
| 129 | [v2] v2 Rooms: one card per contracted room (19) | PASS |
| 130 | [v2] v2 card: status pill, dates, Quick update | PASS |
| 131 | [v2] v2 card: next arrival shows the gap | PASS |
| 132 | [v2] v2 tile "Departing today" filters the cards | PASS |
| 133 | [v2] v2 tile and filter pill stay in step | PASS |
| 134 | [v2] v2 Name TBC filter shows only rooms with a hold | PASS |
| 135 | [v2] v2 Extra capacity tile makes no availability claim | PASS |
| 136 | [v2] v2 urgent banner computed from changeovers | PASS |
| 137 | [v2] v2 banner: one-tap Book clean (provider) | PASS |
| 138 | [v2] v2 banner: Book clean confirms then books | PASS |
| 139 | [v2] v2 Copy summary: today + tomorrow movements as text | PASS |
| 140 | [v2] v2 Copy summary (provider) names the cleaner | PASS |
| 141 | [v2] v2 banner (client): no scheduling buttons, no cleaner names | PASS |
| 142 | [v2] v2 Copy summary (Sheena): no cleaner names, only 'Ready by' | PASS |
| 143 | [v2] v2 crew preview: 5 places × 3 rotations grid | PASS |
| 144 | [v2] v2 crew preview: no clashes far ahead | PASS |
| 145 | [v2] v2 crew: confirm step before saving | PASS |
| 146 | [v2] v2 crew: 15 real stays grouped under one series id | PASS |
| 147 | [v2] v2 crew (room kept on off days): one clean per room, at the end only | PASS |
| 148 | [v2] v2 crew: series listed with Extend / Change end / Cancel | PASS |
| 149 | [v2] v2 crew: Extend adds a rotation for everyone | PASS |
| 150 | [v2] v2 crew: Undo reverts the whole extension | PASS |
| 151 | [v2] v2 crew: Cancel rest removes future stays | PASS |
| 152 | [v2] v2 crew: clashes highlighted and Confirm blocked | PASS |
| 153 | [v2] v2 drag: live preview of the new dates | PASS |
| 154 | [v2] v2 drag: confirm step on drop | PASS |
| 155 | [v2] v2 drag: stay moved by 2 days | PASS |
| 156 | [v2] v2 drag: Undo puts it back | PASS |
| 157 | [v2] v2 drag: clash shown live in red | PASS |
| 158 | [v2] v2 drag: clash is refused, nothing saved | PASS |
| 159 | [v2] v2 drag: right edge resizes (changes departure) | PASS |
| 160 | [v2] v2 drag: keyboard alternative kept (bars focusable, Enter opens panel) | PASS |
| 161 | no console/page errors or native dialogs  | PASS |

## 4. Live database, email and SMS – pending (needs Donald's accounts)
| Check | Status |
|---|---|
| Magic-link sign-in for Donald and Sheena on separate devices | pending |
| RLS through the API: client cannot read cleaner profiles, write changeovers or read others' alerts; cleaner cannot edit stays | pending |
| Concurrent double-booking: exactly one succeeds (exclusion constraint) | pending |
| Stale edit rejected across two real sessions (40001) | pending |
| Duplicate submissions deduped | pending |
| Realtime: change appears in the other browser within ~1 s | pending |
| Undo in live mode (inverse change through the triggers) | pending |
| `node qa/sql-rules.mjs` against the live project | pending |
| Email via Resend with every browser closed (pg_cron → dispatch-alerts); failure → retry → delivered | pending |
| SMS via Twilio for an opted-in user | pending |
| 07:00 digest on both sides of the 25 Oct clock change | pending |
| Restore from backup into an isolated project | pending |
| Cloudflare Access in front of roomboard.pages.dev | pending |
| Crew booking through `apply_series()` with real RLS (client + manager tokens) | pending |

## 5. Scores (strict self-review, v2)
| Area | Score | Why not higher |
|---|---|---|
| Rules and consistency (TS = SQL) | 9.0 | Shared cases cover rules + rotation; reconcile itself is mirrored, not shared |
| Crew booking with rotations | 8.0 | No "move the whole series to other rooms" action (one occurrence at a time); live RPC not yet run on a real project |
| Drag to move / resize | 8.0 | Desktop mouse/pen only (phone keeps the panel); no auto-scroll while dragging past the visible weeks |
| Look (v2) and clarity | 8.5 | Board bars keep the earlier navy style; tiles wrap to 3 per row below 1100px |
| Copy summary | 9.0 | Plain text only (no per-property split) |
| Phone | 8.5 | Crew booking works on the phone but the preview grid needs sideways scrolling |
| Accessibility | 8.5 | axe clean on every screen; drag has the panel as its keyboard route |
| Code quality | 8.5 | Lint/type clean, typed Supabase rows, store split, CI; Board.tsx and StayPanel.tsx are still the largest files |
| Live readiness | 6.0 | Supabase, email and SMS still need Donald's accounts (section 4) |
| **Overall** | **8.3** | |
