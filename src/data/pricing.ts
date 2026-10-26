// Indicative prices, for out-of-contract properties ONLY. A property with `contracted: true` (Eshcol, Loch Roag
// today) is on the block contract: a fixed weekly rate however many rooms are used, so it never shows a price or an
// estimate anywhere (priceLine / estimateLine return null and the screens show CONTRACT_LINE instead). The flag is
// the single source of truth (demo: src/data/properties.ts; database: properties.contracted); see
// docs/PROPERTY-DATA.md to switch a property onto or off the contract.
// One rate, set by Eshcol (app_settings in the database; demo: this browser). An extra property (Harris, Uig, Monadh,
// Abhainn Cottage) is always booked whole, so it is priced as its charged rooms (every bedroom, except Abhainn's
// sofa-bed/desk room: 2 of 3), even if only one is used.
// Pro rata: weekly price ÷ 7 per night, rounded to the nearest pound. Indicative only: invoiced separately, and
// long-term deals are possible.
import { DEFAULT_SETTINGS, S } from './core';
import type { DB, Property } from './core';

export const rate = (db: DB) => db.settings?.ratePerRoomWeek ?? DEFAULT_SETTINGS.ratePerRoomWeek;
export const gbp = (n: number) => '£' + Math.round(n).toLocaleString('en-GB');

/** Rooms charged for one booking: 1 in a contract house, every bedroom of an extra property. */
export const roomsCharged = (p: Property) => (p.contracted ? 1 : (p.charged ?? p.bedrooms ?? 1));
/** Indicative weekly price of one booking at this property. */
export const weekly = (db: DB, p: Property) => rate(db) * roomsCharged(p);
/** Pro-rata estimate for a number of nights: weekly ÷ 7 × nights, rounded to the nearest pound. */
export const estimate = (db: DB, p: Property, nights: number) => Math.round((weekly(db, p) / 7) * nights);

/** Shown instead of a price for a property on the block contract. No money. */
export const CONTRACT_LINE = 'Included in your contract';
/** The housekeeper never sees a price, anywhere (19 Oct 2026). */
export const noPrices = () => S.db?.users.find(u => u.id === S.db.currentUser)?.role === 'cleaner';
/** Does this property ever show a price? Only when it is not on the block contract, and never to the housekeeper. */
export const priced = (p: Property) => !p.contracted && !noPrices();

/** Extras: "Indicative £350 per room per week · whole property, 2 rooms charged = £700 a week". Contract: null. */
export function priceLine(db: DB, p: Property): string | null {
  if (!priced(p)) return null;
  const base = `Indicative ${gbp(rate(db))} per room per week`;
  const n = roomsCharged(p);
  return `${base} · whole property, ${n} room${n === 1 ? '' : 's'} charged = ${gbp(weekly(db, p))} a week`;
}
/** Extras: "Indicative £150 for 3 nights (£350 a week ÷ 7 × 3)" or, open-ended, the weekly price. Contract: null. */
export function estimateLine(db: DB, p: Property, nights: number | null): string | null {
  if (!priced(p)) return null;
  const w = weekly(db, p);
  if (!nights) return `Indicative ${gbp(w)} per week, until further notice`;
  return `Indicative ${gbp(estimate(db, p, nights))} for ${nights} night${nights === 1 ? '' : 's'} (${gbp(w)} a week ÷ 7 × ${nights})`;
}
export const PRICE_NOTE = 'Indicative only: invoiced separately. Long-term deals possible.';
