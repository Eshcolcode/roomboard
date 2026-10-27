// Demo backend for shift patterns (live: tables shift_patterns / stay_shifts, 0015).
import { S, uid, roomLabel } from '../core';
import type { DB, ShiftPattern, DayState } from '../core';
import { commit, log } from './store';
import { addDays, londonToday, fmt } from '../../dates';
import { defaultCycleStart } from '../shifts';

const clean = (p: Omit<ShiftPattern, 'id'>) => {
  const name = p.name.trim();
  if (!name) throw new Error('Give the pattern a name.');
  if (!(p.on >= 1 && p.on <= 60) || !(p.off >= 1 && p.off <= 60))
    throw new Error('Days in and days away must each be between 1 and 60.');
  return { name: name.slice(0, 60), on: Math.round(p.on), off: Math.round(p.off), startDow: p.startDow };
};
export function savePattern(p: Omit<ShiftPattern, 'id'> & { id?: string }): ShiftPattern {
  const v = clean(p);
  const list = (S.db.shiftPatterns = S.db.shiftPatterns ?? []);
  const cur = p.id ? list.find(x => x.id === p.id) : undefined;
  if (cur) {
    Object.assign(cur, v);
    log(`Shift pattern "${v.name}" changed`, undefined, false, 'rota');
    S.db.shiftPatterns = [...list];
    commit();
    return cur;
  }
  const n: ShiftPattern = { id: uid(), ...v };
  S.db.shiftPatterns = [...list, n];
  log(`Shift pattern "${v.name}" added`, undefined, false, 'rota');
  commit();
  return n;
}
export function deletePattern(id: string) {
  const p = S.db.shiftPatterns?.find(x => x.id === id);
  S.db.shiftPatterns = (S.db.shiftPatterns ?? []).filter(x => x.id !== id);
  S.db.stayShifts = (S.db.stayShifts ?? []).filter(x => x.patternId !== id);
  if (p) log(`Shift pattern "${p.name}" deleted`, undefined, false, 'rota');
  commit();
}
export function setStayShift(stayId: string, v: { patternId: string; cycleStart: string } | null) {
  const st = S.db.stays.find(s => s.id === stayId);
  if (!st) throw new Error('That stay is no longer there.');
  const list = (S.db.stayShifts ?? []).filter(x => x.stayId !== stayId);
  const old = S.db.stayShifts?.find(x => x.stayId === stayId);
  const pid = S.db.properties.find(p => p.id === S.db.rooms.find(r => r.id === st.roomId)?.propertyId)?.id;
  if (v) {
    const p = S.db.shiftPatterns?.find(x => x.id === v.patternId);
    if (!p) throw new Error('That shift pattern no longer exists.');
    list.push({ stayId, patternId: v.patternId, cycleStart: v.cycleStart, overrides: old?.overrides ?? {} });
    log(`${roomLabel(st.roomId)}: shift pattern "${p.name}" from ${fmt(v.cycleStart)}`, pid, false, 'rota');
  } else if (old) log(`${roomLabel(st.roomId)}: no shift pattern`, pid, false, 'rota');
  S.db.stayShifts = list;
  commit();
}
export function setOverrides(stayId: string, overrides: Record<string, DayState>) {
  const cur = S.db.stayShifts?.find(x => x.stayId === stayId);
  if (!cur) throw new Error('Choose a shift pattern first.');
  S.db.stayShifts = (S.db.stayShifts ?? []).map(x => (x.stayId === stayId ? { ...x, overrides } : x));
  commit();
}
/** Demo only: the two example patterns, applied to two contract stays. Never on the live database. */
export function demoShifts(x: DB): Pick<DB, 'shiftPatterns' | 'stayShifts'> {
  const T = londonToday();
  const patterns: ShiftPattern[] = [
    { id: 'sp-10-4', name: '10 on / 4 off, Mon start', on: 10, off: 4, startDow: 1 },
    { id: 'sp-sun-thu', name: 'Sun to Thu, leave Fri', on: 5, off: 2, startDow: 0 },
  ];
  const pick = (roomId: string) => x.stays.find(s => s.roomId === roomId && s.arrival <= T && (s.departure ?? '9') > T);
  const a = pick('es-1');
  const b = pick('lr-3');
  const c = pick('es-7');
  const stayShifts = [
    a && { stayId: a.id, patternId: 'sp-10-4', cycleStart: defaultCycleStart(addDays(T, -13), 1), overrides: {} },
    b && { stayId: b.id, patternId: 'sp-sun-thu', cycleStart: defaultCycleStart(addDays(T, -6), 0), overrides: {} },
    // a one-off: away tonight as well (shows the away / 'good day to clean' views on any day)
    c && {
      stayId: c.id,
      patternId: 'sp-10-4',
      cycleStart: defaultCycleStart(addDays(T, -6), 1),
      overrides: { [T]: 'away' as const },
    },
  ].filter(Boolean) as DB['stayShifts'];
  return { shiftPatterns: patterns, stayShifts };
}
