// Indicative prices: out-of-contract properties only. Extras are whole-property; pro rata weekly ÷ 7 per night.
// A property on the block contract (contracted: true) never has a price or an estimate.
import { describe, expect, it } from 'vitest';
import { CONTRACT_LINE, estimate, estimateLine, priceLine, priced, roomsCharged, weekly } from './pricing';
import type { DB, Property } from './core';

const db = (r?: number) => ({ settings: r ? { ratePerRoomWeek: r } : undefined }) as unknown as DB;
const prop = (contracted: boolean, bedrooms?: number, charged?: number) =>
  ({ contracted, bedrooms, charged }) as Property;

describe('pricing', () => {
  it('block-contract properties have no price and no estimate, whatever the rate', () => {
    for (const r of [undefined, 350, 400]) {
      expect(priced(prop(true, 10))).toBe(false);
      expect(priceLine(db(r), prop(true, 10))).toBeNull();
      expect(estimateLine(db(r), prop(true, 10), 3)).toBeNull();
      expect(estimateLine(db(r), prop(true, 10), null)).toBeNull();
    }
    expect(CONTRACT_LINE).not.toMatch(/£|\d/);
  });
  it('the flag alone decides: the same house off the contract gets a price', () => {
    expect(priceLine(db(), prop(false, 1))).toBe(
      'Indicative £350 per room per week · whole property, 1 room charged = £350 a week',
    );
  });
  it('defaults to £350 per room per week when nothing is set', () => {
    expect(priceLine(db(), prop(false, 2))).toMatch(/^Indicative £350 per room per week/);
  });
  it('extras charge every bedroom (Abhainn: its charged rooms)', () => {
    expect(roomsCharged(prop(false, 3))).toBe(3);
    expect(roomsCharged(prop(false))).toBe(1); // unknown bedroom count: one room, never invented
    expect(weekly(db(), prop(false, 3))).toBe(1050);
    expect(weekly(db(), prop(false, 3, 2))).toBe(700); // Abhainn: 3 bedrooms, 2 charged
  });
  it('pro rata per night = weekly ÷ 7, rounded to the nearest pound', () => {
    expect(estimate(db(), prop(false, 1), 1)).toBe(50);
    expect(estimate(db(400), prop(false, 1), 1)).toBe(57); // 57.14
    expect(estimate(db(), prop(false, 2), 10)).toBe(1000);
    expect(estimateLine(db(), prop(false, 1), 1)).toBe('Indicative £50 for 1 night (£350 a week ÷ 7 × 1)');
  });
  it('open-ended stays show the weekly price', () => {
    expect(estimateLine(db(), prop(false, 2), null)).toBe('Indicative £700 per week, until further notice');
  });
});
