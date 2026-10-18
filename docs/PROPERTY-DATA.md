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
https://www.whitefalls.co.uk/luxury-selfcatering-hebrides/. Photos from either Whitefalls lodge may be used (same design).

Description shown in the app, Donald's words verbatim:
> Monadh is a self-catering lodge at Whitefalls Spa Lodges in Breasclete on the Isle of Lewis. It has an open-plan living and dining area, a fully equipped kitchen, and a private indoor spa suite with a RiverBath whirlpool bath, infrared sauna and monsoon shower.

| Fact | Source |
|---|---|
| "Monadh is currently available to book, for up to four guests" | WF book-now |
| Two lodges, each with a private indoor spa: double-ended RiverBath whirlpool bath, infrared sauna, monsoon shower | WF |
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
| `whitefalls-*` | WF | whitefalls.co.uk. The photos may show either lodge |

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
**Main gap: the calendar (iCal) links** from Airbnb, Booking.com and freetobook (and SuperControl for Monadh), see below.
The public booking pages above do not replace them.

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

**freetobook** (Abhainn Cottage, the pods' booking portal) and **SuperControl** (Whitefalls): I could not verify their steps from official help pages, so ask the provider or look in their settings for "iCal" / "calendar export". Abhainn Cottage's freetobook calendar already has a public iCal feed (`https://www.freetobook.com/affiliates/ical/358179c72e.ics`). It returns one "NOT AVAILABLE" event per night, which Roomboard merges into stays.

## How the iCal sync works (live design, not deployed)
- `ical_feeds`: the links. Only the manager can see them, because the URLs are secret.
- `ical_blocks`: dates only, no guest details.
- `ical_exports`: one secret token per extra unit.
- Edge function `ical-sync`: every 30 minutes (pg_cron) and on "Read calendars now". It parses the feed with `supabase/functions/_shared/ical.ts`, which is identical to `src/data/ical.ts`; a unit test enforces that. It then calls `replace_ical_blocks`. If the read fails, it keeps the old blocks and shows the error. If a feed overlaps a Roomboard booking, Donald gets one alert: **⚠ Possible double booking**.
- Edge function `ical-export?t=<token>`: confirmed bookings only, as all-day "Booked" events with no guest details.
- Demo: sample feeds in five real-world styles, labelled **Simulated**.
