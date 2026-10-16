import { describe, expect, it } from 'vitest';
import cases from '../../rules/cases.json';
import { boundary, cleanWindow, nights, overlaps, statusGate, stayError } from './rules';
import type { DepStatusCode } from './rules';

describe('nights', () => {
  for (const c of cases.nights) it(c.name, () => expect(nights(c.arrival, c.departure)).toBe(c.expect));
});
describe('overlaps (arrival inclusive, departure exclusive)', () => {
  for (const c of cases.overlaps)
    it(c.name, () => {
      expect(overlaps(c.a1, c.a2, c.b1, c.b2)).toBe(c.expect);
      expect(overlaps(c.b1, c.b2, c.a1, c.a2)).toBe(c.expect); // symmetric
    });
});
describe('boundary: continues / zero-day / changeover', () => {
  for (const c of cases.boundary)
    it(c.name, () =>
      expect(boundary({ ...c.dep, depStatus: c.dep.depStatus as DepStatusCode }, c.next)).toBe(c.expect),
    );
});
describe('clean window', () => {
  for (const c of cases.cleanWindow)
    it(c.name, () => expect(cleanWindow(c.afterDate, c.readyBy, c.date)).toBe(c.expect));
});
describe('status gate (vacated → clean → ready)', () => {
  for (const c of cases.statusGate)
    it(c.name, () => expect(statusGate(c.target as 'ready', c.vacated, c.today, c.afterDate)).toBe(c.expect));
});
describe('stay validation', () => {
  for (const c of cases.stay)
    it(c.name, () =>
      expect(stayError({ ...c.stay, depStatus: c.stay.depStatus as DepStatusCode }, c.others)).toBe(c.expect),
    );
});
