// Indicative prices. One rate for every property, set by Donald (app_settings in the database; demo: this
// browser). Contract houses (Eshcol, Loch Roag) are priced per room. An extra property (Harris, Uig, Monadh,
// Abhainn Cottage) is always booked whole, so it is priced as all its bedrooms, even if only one is used.
// Pro rata: weekly price ÷ 7 per night, rounded to the nearest pound. Indicative only: invoiced separately, and
// long-term deals are possible.
import { DEFAULT_SETTINGS } from './core';
import type { DB, Property } from './core';

export const rate = (db: DB) => db.settings?.ratePerRoomWeek ?? DEFAULT_SETTINGS.ratePerRoomWeek;
export const gbp = (n: number) => '£' + Math.round(n).toLocaleString('en-GB');

/** Rooms charged for one booking: 1 in a contract house, every bedroom of an extra property. */
export const roomsCharged = (p: Property) => (p.contracted ? 1 : (p.bedrooms ?? 1));
/** Indicative weekly price of one booking at this property. */
export const weekly = (db: DB, p: Property) => rate(db) * roomsCharged(p);
/** Pro-rata estimate for a number of nights: weekly ÷ 7 × nights, rounded to the nearest pound. */
export const estimate = (db: DB, p: Property, nights: number) => Math.round((weekly(db, p) / 7) * nights);

/** "Indicative £350 per room per week", plus for an extra "· whole property, 2 bedrooms = £700 a week". */
export function priceLine(db: DB, p: Property): string {
  const base = `Indicative ${gbp(rate(db))} per room per week`;
  if (p.contracted) return base;
  const n = roomsCharged(p);
  return `${base} · whole property, ${n} bedroom${n === 1 ? '' : 's'} = ${gbp(weekly(db, p))} a week`;
}
/** "Indicative £150 for 3 nights (£350 a week ÷ 7 × 3)" or, open-ended, the weekly price. */
export function estimateLine(db: DB, p: Property, nights: number | null): string {
  const w = weekly(db, p);
  if (!nights) return `Indicative ${gbp(w)} per week${p.contracted ? ' per room' : ''}`;
  return `Indicative ${gbp(estimate(db, p, nights))} for ${nights} night${nights === 1 ? '' : 's'} (${gbp(w)} a week ÷ 7 × ${nights})`;
}
export const PRICE_NOTE = 'Indicative only: invoiced separately. Long-term deals possible.';
