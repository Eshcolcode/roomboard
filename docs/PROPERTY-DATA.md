# Property data: sources, photos, gaps

Everything in `src/data/properties.ts` (and the same data in `supabase/migrations/0008_extras_ical.sql`) comes from
Donald or from a source below. Nothing was guessed: if no source was found, the app shows **Details to come**.
Collected 17 Oct 2026. To change the data, edit `properties.ts`, then run `node scripts/gen-sql-data.mjs` and paste
the output into the data section of 0008 (before it is deployed) or into a new migration (after).

Source key:
- **D**: Donald (chat brief, Oct 2026)
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
| 21 Breasclete, HS2 9ED | BH (old listing: **needs confirming**) |

## Extra properties (bookable, invoiced separately)
**Uig View pod / Harris View pod** (Hebridean Holiday Cabins). Donald said there are "two 1-bed pods". HHC has exactly two pods, Harris View and Uig View.
| Fact | Source |
|---|---|
| Elevated position in Breasclete, views of the mountains of Lewis and Harris | HHC |
| Each sleeps 2 adults + 2 children: double bed + pull-out sofa bed | HHC |
| En-suite with electric shower and heated towel rail; kitchenette (2-ring hob, slow cooker, combination microwave, mini fridge); dining table for 4 | HHC |
| Free Wi-Fi, off-road parking, TV, decking; linen and towels included | HHC |
| Check-in 4pm, check-out 10am | HHC |
| 2A Breasclete, Isle of Lewis HS2 9ED; 01851 621397 | HHC |

**Abhainn Cottage**: *inferred* to be Donald's "3-bed cottage marketed as 2 beds + office" (same phone number as HHC, and the same layout). **Donald to confirm.**
| Fact | Source |
|---|---|
| Completely renovated; garden with decking overlooking the river; Wi-Fi, Sky TV | AC |
| Bedroom 1: king-size, en-suite spa bathroom (spa bath, rain shower, infrared sauna) | AC |
| Bedroom 2: double, en-suite shower room | AC |
| Bedroom 3: leather sofa bed (small double) and desk, also used for spa treatments | AC |
| 3rd room is reached through another room | D |
| Kitchen/dining room; lounge with open peat fire; sleeps 6 | AC |
| Breasclete, Isle of Lewis HS2 9ED | AC |

**Monadh** (Whitefalls)
| Fact | Source |
|---|---|
| "Monadh is currently available to book, for up to four guests" | WF book-now |
| Two lodges, each with a private indoor spa: double-ended RiverBath whirlpool bath, infrared sauna, monsoon shower | WF |
| Super-king beds (twin possible in some rooms); second bedroom option in one lodge | WF |
| Open-plan living, fully equipped kitchen and dining area; utility area with washer/dryer; Wi-Fi and parking | WF |
| Check-in from 4pm, check-out by 10am; minimum 3 nights online; closed 20 Dec 2026 – 3 Jan 2027 | WF book-now |
| Breasclete, Isle of Lewis HS2 9ED | WF |

**The Lodge (2-bed, both ensuite)**: only what Donald said. No public listing was found that clearly matches it.

## Photos
These are in `public/img/*.webp`: max 1280 px wide, quality 72, plus 480 px thumbs in `public/img/t/`. There are 44 files, 3.8 MB in total. Build them with `python3 scripts/photos.py`.
| Files | From | Credit shown in app |
|---|---|---|
| `eshcol-*` (exterior, rooms 1–10, baths, kitchen, lounge, games, deck, flat) | Z (mapped by each image's alt text) | Donald's share page |
| `pod-*` | HHC accommodation + gallery | hebrideanholidaycabins.co.uk. The photos may show either pod |
| `cottage-*` | AC | luxuryhebrideancottage.co.uk |
| `whitefalls-*` | WF | whitefalls.co.uk. The photos may show either lodge |

These are Donald's family's own sites, but check that he's happy for us to reuse the photos before going live.

## Gaps (shown as "Details to come")
1. **Loch Roag photos**: none obtained (the site is down). Bed sizes per room are also missing.
2. **Eshcol**: confirm the street address (only an old directory has it); bed sizes per room.
3. **Pods**: which one is "Pod 1" and which is "Pod 2"; photos of each pod on its own.
4. **The Lodge**: name, address, description, photos, facilities, check-in/out times. Is it Whitefalls' second lodge (Eala)? Unverified.
5. **Abhainn Cottage**: confirm it is the 3-bed cottage; check-in/out times (none published).
6. **Monadh**: Donald's own description for worker stays; photos of Monadh only.
7. Bed sizes everywhere except the pods, the cottage and Monadh.

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
