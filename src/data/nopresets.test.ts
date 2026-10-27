// 27 Oct 2026 (bug report): the quick booking offered built-in rotas ('10 on · 4 off', '14 on · 7 off' …) that were
// not in the Shift patterns list. Patterns now come only from that list; the examples exist in demo data only.
import { describe, expect, it } from 'vitest';

const all = import.meta.glob('/src/**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true }) as Record<
  string,
  string
>;
const src = Object.fromEntries(Object.entries(all).filter(([f]) => !/\.test\.tsx?$/.test(f)));

describe('no built-in shift patterns or rota presets outside demo data', () => {
  it('the quick booking has no preset on/off list', () => {
    const book = src['/src/simple/Book.tsx'];
    expect(book).toBeTruthy();
    expect(book).not.toMatch(/\[\s*10,\s*4\s*\]/);
    expect(book).not.toMatch(/Repeat as a rota/);
  });
  it('the example patterns are only in the demo backend', () => {
    const named = Object.keys(src).filter(f => /10 on \/ 4 off, Mon start|Sun to Thu, leave Fri/.test(src[f]));
    expect(named).toEqual(['/src/data/local/shifts.ts']);
    const users = Object.keys(src).filter(f => /demoShifts/.test(src[f]));
    expect(users.length).toBeGreaterThan(0);
    expect(users.every(f => f.startsWith('/src/data/local/'))).toBe(true);
  });
  it('the live backend reads patterns only from the shift_patterns table', () => {
    const sb = src['/src/data/supabase.ts'];
    expect(sb).toMatch(/q\('shift_patterns'/);
    expect(sb).not.toMatch(/demoShifts|sp-10-4/);
  });
});
