# Test report

- **Run:** Friday, 16 October 2026 at 22:43 (UK time)
- **Commit:** `0dd540eb0043e1f5a81ef0a56c2d37274b66f6ed`
- **Target for end-to-end tests:** https://roomboard.pages.dev/ serving `assets/index-alk6E_xM.js`
- **Local production build:** `assets/index-alk6E_xM.js` (same asset as the target: the deployed site is this commit)
- **Totals:** unit 68/68 passed · SQL 58/58 passed · end-to-end 126/126 passed

All demo-mode checks below run without any of Donald's accounts. The live database, email and SMS checks need a real Supabase project, a Resend key and a Twilio account, and are **pending** (bottom section).

## 1. Unit tests (vitest) – 68/68 passed
Pure rules (`src/data/rules.ts`) driven by the shared `rules/cases.json`, date helpers, store rules (`core.ts`) and demo commands (`local.ts`: exception override, undo).

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
| 21 | data/local.test.ts › clean outside the window (Room 4: leaves +5, next arrival +6) › is refused without an exception | PASS |
| 22 | data/local.test.ts › clean outside the window (Room 4: leaves +5, next arrival +6) › is allowed as a provider exception and stays flagged until ready | PASS |
| 23 | data/local.test.ts › clean outside the window (Room 4: leaves +5, next arrival +6) › cannot be taken by the client as an exception | PASS |
| 24 | data/local.test.ts › clean outside the window (Room 4: leaves +5, next arrival +6) › ready needs "guest has left" | PASS |
| 25 | data/local.test.ts › undo › restores a cancelled stay with the same id and its booked clean | PASS |
| 26 | data/local.test.ts › undo › reverts an edit and bumps the version so other tabs see it | PASS |
| 27 | data/rules.test.ts › nights › one night | PASS |
| 28 | data/rules.test.ts › nights › across clocks going back (25 Oct) | PASS |
| 29 | data/rules.test.ts › nights › across clocks going forward (29 Mar) | PASS |
| 30 | data/rules.test.ts › nights › month boundary | PASS |
| 31 | data/rules.test.ts › nights › leap day | PASS |
| 32 | data/rules.test.ts › nights › year boundary | PASS |
| 33 | data/rules.test.ts › overlaps (arrival inclusive, departure exclusive) › back to back is not a clash | PASS |
| 34 | data/rules.test.ts › overlaps (arrival inclusive, departure exclusive) › one night overlap | PASS |
| 35 | data/rules.test.ts › overlaps (arrival inclusive, departure exclusive) › inside | PASS |
| 36 | data/rules.test.ts › overlaps (arrival inclusive, departure exclusive) › open-ended blocks later stays | PASS |
| 37 | data/rules.test.ts › overlaps (arrival inclusive, departure exclusive) › open-ended after a finished stay | PASS |
| 38 | data/rules.test.ts › overlaps (arrival inclusive, departure exclusive) › two open-ended | PASS |
| 39 | data/rules.test.ts › overlaps (arrival inclusive, departure exclusive) › entirely before | PASS |
| 40 | data/rules.test.ts › boundary: continues / zero-day / changeover › same worker same day continues | PASS |
| 41 | data/rules.test.ts › boundary: continues / zero-day / changeover › different worker same day is zero-day | PASS |
| 42 | data/rules.test.ts › boundary: continues / zero-day / changeover › hold arriving same day is zero-day | PASS |
| 43 | data/rules.test.ts › boundary: continues / zero-day / changeover › same worker after a gap needs a clean | PASS |
| 44 | data/rules.test.ts › boundary: continues / zero-day / changeover › no next arrival needs a clean | PASS |
| 45 | data/rules.test.ts › boundary: continues / zero-day / changeover › until further notice: no clean | PASS |
| 46 | data/rules.test.ts › boundary: continues / zero-day / changeover › departure TBC: no clean | PASS |
| 47 | data/rules.test.ts › clean window › on departure day | PASS |
| 48 | data/rules.test.ts › clean window › on next arrival day | PASS |
| 49 | data/rules.test.ts › clean window › before departure | PASS |
| 50 | data/rules.test.ts › clean window › after next arrival (Room 4 exception case) | PASS |
| 51 | data/rules.test.ts › clean window › no next arrival: any date after departure | PASS |
| 52 | data/rules.test.ts › status gate (vacated → clean → ready) › vacated before departure refused | PASS |
| 53 | data/rules.test.ts › status gate (vacated → clean → ready) › vacated on departure day | PASS |
| 54 | data/rules.test.ts › status gate (vacated → clean → ready) › ready without vacated refused | PASS |
| 55 | data/rules.test.ts › status gate (vacated → clean → ready) › ready with vacated | PASS |
| 56 | data/rules.test.ts › status gate (vacated → clean → ready) › start clean without vacated refused | PASS |
| 57 | data/rules.test.ts › status gate (vacated → clean → ready) › ready before departure refused even if ticked | PASS |
| 58 | data/rules.test.ts › stay validation › valid planned stay | PASS |
| 59 | data/rules.test.ts › stay validation › missing arrival | PASS |
| 60 | data/rules.test.ts › stay validation › planned without departure | PASS |
| 61 | data/rules.test.ts › stay validation › ufn ignores departure | PASS |
| 62 | data/rules.test.ts › stay validation › departure same as arrival | PASS |
| 63 | data/rules.test.ts › stay validation › away back before leaves | PASS |
| 64 | data/rules.test.ts › stay validation › away outside stay | PASS |
| 65 | data/rules.test.ts › stay validation › away inside open-ended stay | PASS |
| 66 | data/rules.test.ts › stay validation › clash with existing stay | PASS |
| 67 | data/rules.test.ts › stay validation › back to back is fine | PASS |
| 68 | data/rules.test.ts › stay validation › open-ended new stay clashes with later stay | PASS |

## 2. SQL tests on local Postgres 17 – 58/58 passed
Fresh database, migrations 0001–0004 and 0006 (pg_cron 0005 skipped), `supabase/tests/smoke.sql` (trigger behaviour), then **the same `rules/cases.json`** through the `rb_*` SQL functions that the triggers call. Runs as a superuser, so row-level security is **not** exercised here.

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
| 17 | nights: one night | PASS |
| 18 | nights: across clocks going back (25 Oct) | PASS |
| 19 | nights: across clocks going forward (29 Mar) | PASS |
| 20 | nights: month boundary | PASS |
| 21 | nights: leap day | PASS |
| 22 | nights: year boundary | PASS |
| 23 | overlaps: back to back is not a clash | PASS |
| 24 | overlaps: one night overlap | PASS |
| 25 | overlaps: inside | PASS |
| 26 | overlaps: open-ended blocks later stays | PASS |
| 27 | overlaps: open-ended after a finished stay | PASS |
| 28 | overlaps: two open-ended | PASS |
| 29 | overlaps: entirely before | PASS |
| 30 | boundary: same worker same day continues | PASS |
| 31 | boundary: different worker same day is zero-day | PASS |
| 32 | boundary: hold arriving same day is zero-day | PASS |
| 33 | boundary: same worker after a gap needs a clean | PASS |
| 34 | boundary: no next arrival needs a clean | PASS |
| 35 | boundary: until further notice: no clean | PASS |
| 36 | boundary: departure TBC: no clean | PASS |
| 37 | cleanWindow: on departure day | PASS |
| 38 | cleanWindow: on next arrival day | PASS |
| 39 | cleanWindow: before departure | PASS |
| 40 | cleanWindow: after next arrival (Room 4 exception case) | PASS |
| 41 | cleanWindow: no next arrival: any date after departure | PASS |
| 42 | statusGate: vacated before departure refused | PASS |
| 43 | statusGate: vacated on departure day | PASS |
| 44 | statusGate: ready without vacated refused | PASS |
| 45 | statusGate: ready with vacated | PASS |
| 46 | statusGate: start clean without vacated refused | PASS |
| 47 | statusGate: ready before departure refused even if ticked | PASS |
| 48 | stay: valid planned stay | PASS |
| 49 | stay: missing arrival | PASS |
| 50 | stay: planned without departure | PASS |
| 51 | stay: ufn ignores departure | PASS |
| 52 | stay: departure same as arrival | PASS |
| 53 | stay: away back before leaves | PASS |
| 54 | stay: away outside stay | PASS |
| 55 | stay: away inside open-ended stay | PASS |
| 56 | stay: clash with existing stay | PASS |
| 57 | stay: back to back is fine | PASS |
| 58 | stay: open-ended new stay clashes with later stay | PASS |

## 3. End-to-end (Playwright, Chrome) – 126/126 passed
Desktop 1440px plus 820/900/1000px layout checks, phone 390×844, every role (provider, Sheena, cleaner), axe WCAG 2 A/AA.

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
| 91 | [a11y] a11y free: no WCAG A/AA violations | PASS |
| 92 | [a11y] a11y changeovers: no WCAG A/AA violations | PASS |
| 93 | [a11y] a11y available: no WCAG A/AA violations | PASS |
| 94 | [a11y] a11y activity: no WCAG A/AA violations | PASS |
| 95 | [a11y] a11y workers: no WCAG A/AA violations | PASS |
| 96 | [a11y] a11y today: no WCAG A/AA violations | PASS |
| 97 | [a11y] a11y stay panel: ok | PASS |
| 98 | [a11y] closing the panel returns focus to the button that opened it | PASS |
| 99 | [a11y] keyboard: first Tab reaches the main nav | PASS |
| 100 | first login: welcome with 3 hints | PASS |
| 101 | welcome dismissed and remembered | PASS |
| 102 | [layout] 820px header one line (56px) | PASS |
| 103 | [layout] 820px no clipped bar text  | PASS |
| 104 | [layout] 900px header one line (56px) | PASS |
| 105 | [layout] 900px no clipped bar text  | PASS |
| 106 | [layout] 1000px header one line (56px) | PASS |
| 107 | [layout] 1000px no clipped bar text  | PASS |
| 108 | [layout] 1440px header one line (56px) | PASS |
| 109 | [layout] 1440px no clipped bar text  | PASS |
| 110 | [phone] phone: no horizontal overflow | PASS |
| 111 | [phone] C5 phone FAB Add stay / Hold | PASS |
| 112 | [phone] 6/C5 phone per-room list (19 rooms) | PASS |
| 113 | [phone] phone: stay panel is a full-screen sheet | PASS |
| 114 | [phone] phone today: no horizontal overflow | PASS |
| 115 | [phone] phone changeovers: no horizontal overflow | PASS |
| 116 | [phone] phone free: no horizontal overflow | PASS |
| 117 | [phone] phone available: no horizontal overflow | PASS |
| 118 | [phone] phone activity: no horizontal overflow | PASS |
| 119 | [phone] phone workers: no horizontal overflow | PASS |
| 120 | [phone] phone cleaner tabs | PASS |
| 121 | [phone] Sheena's phone opens on Rooms (5 tabs) | PASS |
| 122 | [phone] Sheena's phone: only 'Ready by …' statuses | PASS |
| 123 | [phone] phone Rooms: Ruairidh (Room 5) shows 'Away · room kept' | PASS |
| 124 | [phone] phone: Find a room in the bottom bar | PASS |
| 125 | [phone] phone: More sheet | PASS |
| 126 | no console/page errors or native dialogs  | PASS |

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
