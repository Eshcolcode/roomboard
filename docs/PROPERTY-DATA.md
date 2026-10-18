# Property data: sources, photos, gaps

Everything in `src/data/properties.ts` (and the same data in `supabase/migrations/0008_extras_ical.sql`) comes from
Donald or from a source below. Nothing was guessed: if no source was found, the app shows **Details to come**.
Collected 17 Oct 2026. Updated 18 Oct 2026 with Loch Roag room photos and Donald's confirmations (marked **confirmed**).

**Bed sizes are not used anywhere** (Donald, 18 Oct 2026): Roomboard does not show, store or ask for them, and none are
taken from photos, filenames or websites. To change the data, edit `properties.ts`, then run `node scripts/gen-sql-data.mjs` and paste
the output into the data section of 0008 (before it is deployed) or into a new migration (after).

Source key:
- **D**: Donald (chat brief, Oct 2026; confirmations 18 Oct 2026)
- **GP**: Donald's Google Photos room albums for Loch Roag (one album per room), supplied as a zip on 18 Oct 2026
- **Z**: Donald's Eshcol share page (`Eshcol Share Page Small 20260707-183938.zip`, `eshcol-worker-accommodation.html`)
- **LR**: https://lochroag.com/home-2/. The site would not load from here (HTTP 500 / TLS error, no Wayback copy),
  so this is the search-index copy of that page.
- **HHC**: https://hebrideanholidaycabins.co.uk/accommodation/ and /gallery/
- **AC**: https://luxuryhebrideancottage.co.uk/self_catering.php
- **WF**: https://www.whitefalls.co.uk/luxury-selfcatering-hebrides/, https://www.whitefalls.co.uk/book-now/, https://www.whitefalls.co.uk/accommodation/
- **BH**: http://www.businesshebrides.co.uk/businesses/viewById/518 (an old directory listing)

## Loch Roag Guest House (contract)
| Fact | Source |
|---|---|
| Rooms 1–5 upstairs, 6–9 downstairs | D |
| Rooms 2 and 3 share a shower room; Room 8 has a private shower room (not ensuite); the other rooms are ensuite | D |
| Two kitchens; large games room / lounge | D |
| Family-run, near the Callanish Standing Stones, overlooking Loch Roag | LR |
| "Most of our bedrooms have views across Loch Roag towards Callanish and the mountains of Uig and the Isle of Harris" | LR |
| Free parking, free Wi-Fi | LR |
| 22A Breasclete, Isle of Lewis HS2 9EF | LR (search snapshot) |
| Check-in 15:00 / check-out 10:00 | Roomboard's existing settings (D) |
| Room photos, Rooms 1–3 and 5–9 (none yet for Room 4) | GP |

## Eshcol Worker Accommodation (contract)
| Fact | Source |
|---|---|
| Main house Rooms 1–7: 2, 3, 4, 6, 7 ensuite; 1 and 5 have private shower rooms | D, and Z's room lines |
| Flat Rooms 8–10: 10 ensuite; 8 and 9 share the flat shower room | D, Z |
| Kitchen, games room, lounge | D, Z |
| "Premium Worker Accommodation · Formerly Eshcol Guest House", newly renovated 10-bedroom property | Z |
| Parking, high-speed Wi-Fi, laundry, shared kitchen, lounges, games room, outdoor seating; the flat has its own kitchen | Z |
| One line per room (e.g. "Room with an assigned private shower room") | Z |
| Map link https://maps.app.goo.gl/mvJ8TRz1fuh4FGsX9 | Z |
| 21 Breasclete, HS2 9ED (**confirmed by Donald, 18 Oct 2026**; first found in BH) | D |

## Extra properties (bookable, invoiced separately)
**Harris and Uig pods** (Hebridean Holiday Cabins). **Confirmed** (D): the pod once called "Pod 1" is Harris View
(`p-pod1`), the other is Uig View (`p-pod2`). The app shows them as **Harris** and **Uig**, never "Pod 1/2".
| Fact | Source |
|---|---|
| Elevated position in Breasclete, views of the mountains of Lewis and Harris | HHC |
| Each: 1 bedroom + pull-out sofa bed; sleeps 2 adults + 2 children | HHC |
| En-suite with electric shower and heated towel rail; kitchenette (2-ring hob, slow cooker, combination microwave, mini fridge); dining table for 4 | HHC |
| Free Wi-Fi, off-road parking, TV, decking; linen and towels included | HHC |
| Check-in 4pm, check-out 10am | HHC |
| 2A Breasclete, Isle of Lewis HS2 9ED; 01851 621397 | HHC |

**Abhainn Cottage**: **confirmed** (D) as the three-bedroom cottage.
| Fact | Source |
|---|---|
| Completely renovated; garden with decking overlooking the river; Wi-Fi, Sky TV | AC |
| Bedroom 1: en-suite spa bathroom (spa bath, rain shower, infrared sauna) | AC |
| Bedroom 2: en-suite shower room | AC |
| Bedroom 3: sofa bed and desk | AC |
| 3rd room is reached through another room | D |
| Kitchen/dining room; lounge with open peat fire; sleeps 6 | AC |
| Breasclete, Isle of Lewis HS2 9ED | AC |

**Monadh** (Whitefalls Spa Lodges). **Confirmed** (D): "The Lodge" in the brief *is* Monadh, so there is one entry
(`p-monadh`; the old `p-lodge` / `x-lodge` from 0004 is removed by 0008). Website (D):
https://www.whitefalls.co.uk/luxury-selfcatering-hebrides/. Monadh is the only Whitefalls lodge Roomboard offers (D,
18 Oct 2026); no other lodge is listed anywhere in the app. Website photos may be used.

Description shown in the app, Donald's words verbatim:
> Monadh is a self-catering lodge at Whitefalls Spa Lodges in Breasclete on the Isle of Lewis. It has an open-plan living and dining area, a fully equipped kitchen, and a private indoor spa suite with a RiverBath whirlpool bath, infrared sauna and monsoon shower.

| Fact | Source |
|---|---|
| "Monadh is currently available to book, for up to four guests" | WF book-now |
| Private indoor spa: double-ended RiverBath whirlpool bath, infrared sauna, monsoon shower | WF |
| Open-plan living, fully equipped kitchen and dining area; utility area with washer/dryer; Wi-Fi and parking | WF |
| Check-in from 4pm, check-out by 10am; minimum 3 nights online; closed 20 Dec 2026 – 3 Jan 2027 | WF book-now |
| Breasclete, Isle of Lewis HS2 9ED | WF |

## Photos
These are in `public/img/*.webp`: max 1280 px wide, quality 72, plus 480 px thumbs in `public/img/t/`. There were 44 files (3.8 MB) on 17 Oct; with the 28 Loch Roag files there are now 72 (about 4.8 MB). Build them with `python3 scripts/photos.py`.
| Files | From | Credit shown in app |
|---|---|---|
| `eshcol-*` (exterior, rooms 1–10, baths, kitchen, lounge, games, deck, flat) | Z (mapped by each image's alt text) | Donald's share page |
| `pod-*` | HHC accommodation + gallery | hebrideanholidaycabins.co.uk. The photos may show either pod |
| `cottage-*` | AC | luxuryhebrideancottage.co.uk |
| `whitefalls-*` | WF | whitefalls.co.uk |

**Loch Roag (`lr-*`, 14 files + 14 thumbs, 0.95 MB)**: from GP, supplied 18 Oct 2026 (16 files in 8 room albums,
14 distinct by SHA-256; checksums matched Donald's inventory). Built with `python3 scripts/photos.py lr-`: EXIF
orientation applied, then all EXIF/GPS/XMP metadata dropped. Each photo is assigned to the room whose album it came
from. Two photos appear in two albums and are shown in both rooms, as supplied: `lr-room2-3-shower` (Rooms 2 and 3)
and `lr-room6-7` (Rooms 6 and 7). They are stored once and referenced twice. There is no Room 4 album, so Room 4
shows "Photo to come". Original filenames are not used as facts: nothing about beds is taken from them.

| Files | Rooms |
|---|---|
| `lr-room1` | 1 |
| `lr-room2`, `lr-room2-3-shower` | 2 |
| `lr-room3`, `lr-room3-b`, `lr-room2-3-shower` | 3 |
| `lr-room5` | 5 |
| `lr-room6-7` | 6 |
| `lr-room6-7`, `lr-room7`, `lr-room7-bath` | 7 |
| `lr-room8`, `lr-room8-b`, `lr-room8-bath` | 8 |
| `lr-room9`, `lr-room9-bath` | 9 |

The property gallery reuses five of these room photos; there are no outside or shared-space photos of Loch Roag yet.

**Confirmed** (D, 18 Oct 2026): the property website photos may be used in the app.

## Gaps
**Main gap: the booking-calendar (iCal) links for Harris, Uig and Abhainn Cottage.** Monadh's (SuperControl) is in
hand (18 Oct 2026). Until a link is set, the unit shows **Calendar not linked yet** and blocks nothing. The public booking
pages below do not replace them. How to add one: see *Adding a booking calendar* below.

Smaller items, shown in the app as "Details to come":
- **Loch Roag**: no Room 4 photos (no Room 4 album); no outside or shared-space photos (kitchens, games room, lounge).
- **Abhainn Cottage**: check-in and check-out times (none published; nothing invented).

Resolved 18 Oct 2026 (D): Eshcol address; which pod is which (Harris / Uig); The Lodge = Monadh; the 3-bed cottage is
Abhainn Cottage; Monadh's description; permission to use the website photos; bed sizes not needed.

## Public booking pages (not iCal)
From Donald, 18 Oct 2026. Stored as `bookingUrl` and shown on each extra's property page as a **Check availability**
button that opens in a new tab. Tracking and date/occupancy query strings were removed. These are ordinary web pages,
**not calendar feeds**: Roomboard does not read dates from them, so the iCal links below are still needed.
| Property | Booking page |
|---|---|
| Harris and Uig pods (one page for both) | https://booking-directly.com/widgets/AFdwunTlQtRXLGG59glXBg6bzyX2zGOL7uVYq3BXiXjQVNUL0wvLZtXa9p9Fd/properties |
| Abhainn Cottage | https://booking-directly.com/widgets/Zi8g2tHyjcHeV1rY7shfws1inCMurecf736nZuRt2Q5ApN9GLY9lBQDGnSivz/properties/17285/unit-selection |
| Monadh (SuperControl) | https://secure.supercontrol.co.uk/availability/availability_search.asp?ownerID=859&siteID=10573 |

## Calendar links (iCal): what Donald needs
Roomboard reads each unit's **export** link from the other sites, and gives each unit its own link for those sites to **import**.

**Airbnb** (verified in Airbnb Help, https://www.airbnb.co.uk/help/article/99):
Calendar → select the listing → Availability → **Connect calendars** → **Connect to another website**.
- To give Airbnb's dates to Roomboard: copy the **Airbnb calendar link** shown there.
- To block Airbnb from Roomboard's dates: paste Roomboard's link (it ends in `.ics`), give it a name, then **Add calendar**.
- Airbnb refreshes imported calendars about every 3 hours.

**Booking.com** (verified in the Partner Help Centre, https://partner.booking.com/en-gb/help/rates-availability/extranet-calendar/how-synchronise-your-calendars-across-channels):
Extranet → **Rates & Availability** → **Sync calendars** → **Add calendar connection**.
- Import: paste Roomboard's link, name it, Next step, Done.
- Export: **Skip to export**, name it, **Copy link**. The link contains `/ical/`.
- Booking.com imports every 2 hours. There is also **Import now**.
- Only for properties that are Open/Bookable, with 20 room types or fewer and one unit per room type, and with no connectivity provider.

**freetobook** and **booking-directly** (Abhainn Cottage, the pods): I could not verify their steps from official help pages, so ask the provider or look in their settings for "iCal" / "calendar export". freetobook feeds send one "NOT AVAILABLE" event per night, which Roomboard merges into stays.

**SuperControl** (Monadh): the iCal export link is in hand. Its events are all-day bookings and "Closed" periods,
written as local midnights (`DTSTART;TZID=Europe/London:…T000000` with `X-MICROSOFT-CDO-ALLDAYEVENT:TRUE`); guest
names and booking details are in SUMMARY/DESCRIPTION and are never stored.

## Adding a booking calendar (one small step for Donald)
1. Copy the calendar's iCal / "export" link (it usually ends in `.ics`) and paste it to Grok Bot in chat.

That is all. Grok Bot then sets it as a secret on the server, never in the repo, database or app:
`supabase secrets set ICAL_HARRIS=<link>` (or `ICAL_UIG`, `ICAL_ABHAINN`, `ICAL_MONADH`), then presses
**Read calendars now** (or waits for the 3-hourly read). The unit's calendar panel changes from **Calendar not linked
yet** to **Calendar linked**. To change a link, set the secret again; to unlink, `supabase secrets unset ICAL_…`.

| Unit | Secret name | Status (18 Oct 2026) |
|---|---|---|
| Harris pod (`x-pod1`) | `ICAL_HARRIS` | waiting for the link |
| Uig pod (`x-pod2`) | `ICAL_UIG` | waiting for the link |
| Abhainn Cottage (`x-cottage`) | `ICAL_ABHAINN` | waiting for the link |
| Monadh (`x-monadh`) | `ICAL_MONADH` | link in hand (SuperControl), kept outside the repo; set it when the live database is set up |

## Indicative prices (Donald, 18 Oct 2026)
- One rate for every property: **Indicative £350 per room per week**. Donald changes it on *Properties* (live:
  `app_settings.rate_per_room_week`, readable by everyone signed in, writable by the manager only; demo: this
  browser). Sheena sees prices but cannot change them.
- Eshcol and Loch Roag are priced **per room**. Harris, Uig, Monadh and Abhainn Cottage are booked **whole**: their
  charged rooms are priced even if one is used (every bedroom, except Abhainn's sofa-bed/desk room: `charged: 2`).
- Every rate change is kept with who, when, old and new (`app_settings_history`, Donald only; demo: this browser),
  shown to Donald under *Rate history* on Properties.
- Pro rata: **weekly ÷ 7 per night**, rounded to the nearest pound (at £350: £50 a room a night).
- Always shown as indicative: invoiced separately, long-term deals possible.

| Property | Bedrooms assumed | Source | Indicative price at £350 |
|---|---|---|---|
| Eshcol | 10 rooms | D, rooms above | £350 per room per week |
| Loch Roag | 9 rooms | D, rooms above | £350 per room per week |
| Harris | 1 | HHC: 1 bedroom + sofa bed (sofa bed not charged) | £350 a week, whole |
| Uig | 1 | HHC: 1 bedroom + sofa bed (sofa bed not charged) | £350 a week, whole |
| Monadh | 2 | D brief, "The Lodge (2 ensuite)" = Monadh | £700 a week, whole |
| Abhainn Cottage | 3 bedrooms, **2 charged** | D, 18 Oct 2026: charge 2 rooms; the sofa-bed/desk room (bedroom 3, reached through another) is not charged | £700 a week, whole |

## Booking an extra property
Sheena books directly (no request step): the booking is confirmed straight away and Donald gets a "New booking"
alert with the indicative price. Dates already taken (a booking calendar or another Roomboard booking) are refused,
without saying who has them. Sheena sees and changes only her own extra bookings; Donald's other guests show to her
as **Taken**, and his bookings there do not appear in her activity or alerts (`activity.manager_only`, 0008).

- **Where:** from a free day on the desktop board, a free night or **Book** on the phone Rooms card (both open a booking
  sheet in place, no page change), or from the property / availability page.
- **Open-ended (until further notice):** a first night and no end date (`departure` null, `dep_status` 'ufn'). It
  needs every later night free (`openBlocker` in `src/data/extras.ts`; the 0008 trigger refuses it in the database
  too). Price: "Indicative £W per week, until further notice" (`indicative_price(room, from, null)`). It blocks every
  later night in the app; the iCal export (`unitIcs` / `ical-export`) sends it as a block from its first night (or
  today) to a rolling year ahead, because other calendars cannot hold an open event. The end date is set later on the
  booking card (Donald, or Sheena for her own booking); the nights after it become free again.

## How the iCal sync works (ready to deploy, not deployed)
- Calendar links are **secrets**. They are stored only as Supabase Edge Function secrets (`ICAL_*`). They are not in
  the repo, not in the database and never shown in the app. Error messages never include them.
- `ical_feeds`: one row per extra unit (seeded by 0008) with the **name** of its secret (`env_key`), whether it is
  linked, when it was last read and the last error. Donald can read it; only the sync writes it; Sheena cannot see it.
  `env_key` must start with `ICAL_`, so a row can never point at another secret.
- `ical_blocks`: dates only (`start_date`, exclusive `end_date`), no guest details. Sheena sees them as **Taken**.
- `ical_exports`: one secret token per extra unit.
- Edge function `ical-sync` (`index.ts` wiring + `sync.ts` work): every 3 hours (pg_cron, minute 17) and on **Read
  calendars now**. For each feed: no secret = not linked (old blocks cleared, no error); otherwise fetch, parse with
  `supabase/functions/_shared/ical.ts` (identical to `src/data/ical.ts`; a unit test enforces that), keep ranges
  ending after today, call `replace_ical_blocks`. A failed read keeps the old blocks and shows a plain reason. A new
  overlap with a Roomboard booking sends Donald one **⚠ Possible double booking** alert (the activity line is
  Donald-only and names no booking site).
- Parser rules: all-day DTEND is the check-out day (exclusive); local-midnight all-day events are read as plain dates,
  so the 25 Oct 2026 BST→GMT change cannot shift them; bookings and "Closed" periods are both unavailable; cancelled
  events are ignored; the same UID twice counts once (highest SEQUENCE wins); only dates leave the parser.
- Edge function `ical-export?t=<token>`: every Roomboard booking of the unit, as all-day "Booked" events with no guest details.
- Demo / preview: only Monadh is linked, using `src/data/local/monadh-sample.ics`: a sanitised copy of the real
  SuperControl feed's structure and dates, with guest names, booking refs and UIDs replaced by fakes. Labelled
  **Simulated**. Harris, Uig and Abhainn Cottage show **Calendar not linked yet**.
- Checked 18 Oct 2026 against the real Monadh feed (run locally with the link as an environment variable): 14
  events read; from today it blocks 16–19 Nov 2026 (booked) and 20 Dec 2026 – 4 Jan 2027 (closed).
