import { describe, expect, it } from 'vitest';
import { addDays, diffDays, fmt, fmtUK, parseUK } from './dates';

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
