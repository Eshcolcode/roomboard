import { describe, expect, it } from 'vitest';
import { addDays, diffDays, fmt, fmtUK, friendlyDate, friendlyDates, parseUK } from './dates';

describe('dates', () => {
  it('addDays across the October clock change', () => {
    expect(addDays('2026-10-24', 1)).toBe('2026-10-25');
    expect(addDays('2026-10-25', 1)).toBe('2026-10-26');
  });
  it('addDays across month and year', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
  it('diffDays is whole days', () => expect(diffDays('2026-03-28', '2026-03-30')).toBe(2));
  it('UK short format', () => expect(fmt('2026-10-16')).toBe('Fri 16 Oct'));
  it('UK numeric format', () => expect(fmtUK('2026-10-06')).toBe('06/10/2026'));
  it('parses dd/mm/yyyy', () => {
    expect(parseUK('16/10/2026')).toBe('2026-10-16');
    expect(parseUK('1/2/2027')).toBe('2027-02-01');
    expect(parseUK('16-10-26')).toBe('2026-10-16');
  });
  it('rejects impossible dates', () => {
    expect(parseUK('31/02/2026')).toBeNull();
    expect(parseUK('10/13/2026')).toBeNull();
    expect(parseUK('hello')).toBeNull();
  });
});
describe('friendly dates in activity text', () => {
  const today = '2026-10-26';
  it('drops the year in the current year and keeps it otherwise', () => {
    expect(friendlyDate('2026-11-06', today)).toBe('6 Nov');
    expect(friendlyDate('2027-01-04', today)).toBe('4 Jan 2027');
  });
  it('rewrites ISO dates and padded weekday dates inside text', () => {
    expect(friendlyDates('Eshcol Room 3 · TEST Worker: departure 2026-11-06', today)).toBe(
      'Eshcol Room 3 · TEST Worker: departure 6 Nov',
    );
    expect(friendlyDates('arrival 2026-12-20 → 2027-01-04', today)).toBe('arrival 20 Dec → 4 Jan 2027');
    expect(friendlyDates('Booked Uig for Name TBC · Thu 05 Nov → Sun 08 Nov', today)).toBe(
      'Booked Uig for Name TBC · Thu 5 Nov → Sun 8 Nov',
    );
  });
  it('leaves non-dates and other text alone', () => {
    expect(friendlyDates('Room 10 · 2026-13-40 · ref 1234-56-78 · Mon 12 Nov', today)).toBe(
      'Room 10 · 2026-13-40 · ref 1234-56-78 · Mon 12 Nov',
    );
  });
});
