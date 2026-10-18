// Indicative prices: one rate per room per week; extras whole-property; pro rata weekly ÷ 7 per night.
import { describe, expect, it } from 'vitest';
import { estimate, estimateLine, priceLine, roomsCharged, weekly } from './pricing';
import type { DB, Property } from './core';

const db = (r?: number) => ({ settings: r ? { ratePerRoomWeek: r } : undefined }) as unknown as DB;
const prop = (contracted: boolean, bedrooms?: number) => ({ contracted, bedrooms }) as Property;

describe('pricing', () => {
  it('defaults to £350 per room per week when nothing is set', () => {
    expect(priceLine(db(), prop(true))).toBe('Indicative £350 per room per week');
  });
  it('contract houses charge one room; extras charge every bedroom', () => {
    expect(roomsCharged(prop(true, 10))).toBe(1);
    expect(roomsCharged(prop(false, 3))).toBe(3);
    expect(roomsCharged(prop(false))).toBe(1); // unknown bedroom count: one room, never invented
    expect(weekly(db(), prop(false, 3))).toBe(1050);
  });
  it('pro rata per night = weekly ÷ 7, rounded to the nearest pound', () => {
    expect(estimate(db(), prop(true), 1)).toBe(50);
    expect(estimate(db(400), prop(true), 1)).toBe(57); // 57.14
    expect(estimate(db(), prop(false, 2), 10)).toBe(1000);
    expect(estimateLine(db(), prop(true), 1)).toBe('Indicative £50 for 1 night (£350 a week ÷ 7 × 1)');
  });
  it('open-ended stays show the weekly price', () => {
    expect(estimateLine(db(), prop(true), null)).toBe('Indicative £350 per week per room');
    expect(estimateLine(db(), prop(false, 2), null)).toBe('Indicative £700 per week');
  });
});
