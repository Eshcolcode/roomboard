import { describe, expect, it } from 'vitest';
import { awayRuns, dayState, defaultCycleStart, flipDay, nextIn, patternSummary } from './shifts';
import { addDays } from '../dates';

const P10 = { on: 10, off: 4 }; // 10 on / 4 off, Monday start
const SUN5 = { on: 5, off: 2 }; // Sun to Thu, leave Fri
const sh = (cycleStart: string, overrides = {}) => ({ stayId: 's', patternId: 'p', cycleStart, overrides });
const days = (from: string, n: number, f: (d: string) => string | null) =>
  Array.from({ length: n }, (_, i) =>
    f(addDays(from, i)) === 'in' ? 'I' : f(addDays(from, i)) === 'away' ? 'a' : '-',
  ).join('');

describe('shift pattern date maths', () => {
  it('10 on / 4 off from a Monday: in Mon to the second Wed, away Thu to Sun, back Mon', () => {
    const st = { arrival: '2026-11-02', departure: '2026-12-14' }; // Mon 2 Nov
    const s = sh('2026-11-02');
    expect(days('2026-11-02', 28, d => dayState(st, P10, s, d))).toBe('IIIIIIIIIIaaaaIIIIIIIIIIaaaa');
    expect(dayState(st, P10, s, '2026-11-12')).toBe('away'); // Thu 12 Nov
    expect(dayState(st, P10, s, '2026-11-16')).toBe('in'); // back Mon 16 Nov
  });
  it('cycle carries across a month boundary and a year boundary', () => {
    const st = { arrival: '2026-12-21', departure: '2027-02-15' };
    const s = sh('2026-12-21');
    // 21 Dec + 10 = 31 Dec away … 3 Jan away, 4 Jan in
    expect(dayState(st, P10, s, '2026-12-30')).toBe('in');
    expect(dayState(st, P10, s, '2026-12-31')).toBe('away');
    expect(dayState(st, P10, s, '2027-01-03')).toBe('away');
    expect(dayState(st, P10, s, '2027-01-04')).toBe('in');
    // February (28 days): 21 Dec + 14*4 = 15 Feb, + 14*3 = 1 Feb in; 11 Feb away
    expect(dayState(st, P10, s, '2027-02-01')).toBe('in');
    expect(dayState(st, P10, s, '2027-02-11')).toBe('away');
  });
  it('Sun to Thu, leave Fri: every week', () => {
    const st = { arrival: '2026-11-01', departure: null };
    const s = sh('2026-11-01'); // Sunday
    expect(days('2026-11-01', 14, d => dayState(st, SUN5, s, d))).toBe('IIIIIaaIIIIIaa');
  });
  it('nights before the cycle starts count as in; outside the stay is null', () => {
    const st = { arrival: '2026-10-29', departure: '2026-11-20' }; // arrives Thu, cycle from Mon 2 Nov
    const s = sh(defaultCycleStart('2026-10-29', 1));
    expect(s.cycleStart).toBe('2026-11-02');
    expect(dayState(st, P10, s, '2026-10-28')).toBeNull();
    expect(dayState(st, P10, s, '2026-10-31')).toBe('in');
    expect(dayState(st, P10, s, '2026-11-20')).toBeNull(); // departure day is not a night
  });
  it('a stay ending mid-cycle stops at the departure', () => {
    const st = { arrival: '2026-11-02', departure: '2026-11-14' }; // leaves Sat, in the middle of the away block
    const s = sh('2026-11-02');
    expect(awayRuns(st, P10, s, '2026-11-01', '2026-12-01')).toEqual([{ from: '2026-11-12', to: '2026-11-14' }]);
  });
  it('open-ended stays repeat for as long as the window runs', () => {
    const st = { arrival: '2026-11-02', departure: null };
    const runs = awayRuns(st, P10, sh('2026-11-02'), '2026-11-01', '2027-01-01');
    expect(runs.map(r => r.from)).toEqual(['2026-11-12', '2026-11-26', '2026-12-10', '2026-12-24']);
    expect(runs.every(r => r.to === addDays(r.from, 4))).toBe(true);
  });
  it('one-off days: back a day early, or away an extra night; flipping back removes the one-off', () => {
    const st = { arrival: '2026-11-02', departure: null };
    const base = sh('2026-11-02');
    const early = { ...base, overrides: flipDay(st, P10, base, '2026-11-15') };
    expect(early.overrides).toEqual({ '2026-11-15': 'in' });
    expect(dayState(st, P10, early, '2026-11-15')).toBe('in');
    expect(nextIn(st, P10, early, '2026-11-12')).toBe('2026-11-15');
    expect(flipDay(st, P10, early, '2026-11-15')).toEqual({});
    const extra = flipDay(st, P10, base, '2026-11-11');
    expect(dayState(st, P10, { ...base, overrides: extra }, '2026-11-11')).toBe('away');
    expect(awayRuns(st, P10, { ...base, overrides: extra }, '2026-11-01', '2026-11-20')).toEqual([
      { from: '2026-11-11', to: '2026-11-16' },
    ]);
  });
  it('editing the pattern changes the days (no stored copy)', () => {
    const st = { arrival: '2026-11-02', departure: null };
    expect(dayState(st, { on: 10, off: 4 }, sh('2026-11-02'), '2026-11-12')).toBe('away');
    expect(dayState(st, { on: 12, off: 2 }, sh('2026-11-02'), '2026-11-12')).toBe('in');
  });
  it('no pattern means in every night', () => {
    const st = { arrival: '2026-11-02', departure: '2026-11-30' };
    expect(dayState(st, null, null, '2026-11-12')).toBe('in');
    expect(awayRuns(st, null, null, '2026-11-01', '2026-12-01')).toEqual([]);
  });
  it('summary and default start', () => {
    expect(patternSummary({ on: 10, off: 4, startDow: 1 })).toBe('In 10 days, away 4 · starts Monday');
    expect(defaultCycleStart('2026-11-02', 1)).toBe('2026-11-02');
    expect(defaultCycleStart('2026-11-03', 0)).toBe('2026-11-08');
  });
});
