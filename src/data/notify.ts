// Notification tiers (Donald, 19 Oct 2026). Pure functions: the demo store, the screens and the tests use these, and
// supabase/migrations/0009_notifications.sql mirrors classify() as rb_change_tier().
//   IMMEDIATE: a new booking (contract or extras), a cancellation, a changed arrival or leaving date, an open-ended
//              stay getting an end date, a move to another room. In-app alert (red dot) + an email in the outbox.
//   MINOR:     guest name, phone, notes, away dates, rota changes, a guest swap within the same dates, a confirmed
//              departure. Activity log only: no email, no red dot.
// Housekeeper: alerted only when an IMMEDIATE change at Eshcol / Loch Roag touches the next 7 days.
import { addDays } from '../dates';
import { ROLE_LABEL } from './core';
import type { Activity, ActKind, DB, Stay, Tier, User } from './core';

type S = Pick<Stay, 'id' | 'roomId' | 'arrival' | 'departure' | 'depStatus' | 'workerId' | 'holdLabel' | 'notes'> &
  Partial<Pick<Stay, 'away'>>;
export interface Change {
  before: S | null;
  after: S | null;
}
export interface Classified {
  tier: Tier;
  reasons: string[];
}

/** One stay: what changed, and how much it matters. */
export function classify(c: Change, extra = false): Classified {
  const { before: b, after: a } = c;
  if (!b && a) return { tier: 'immediate', reasons: [extra ? 'new extras booking' : 'new booking'] };
  if (b && !a) return { tier: 'immediate', reasons: [extra ? 'extras booking cancelled' : 'cancellation'] };
  if (!b || !a) return { tier: 'minor', reasons: [] };
  const imm: string[] = [];
  const minor: string[] = [];
  if (b.arrival !== a.arrival) imm.push('arrival date changed');
  if (!b.departure && a.departure) imm.push('end date set');
  else if (b.departure !== a.departure) imm.push('leaving date changed');
  if (b.roomId !== a.roomId) imm.push('room changed');
  if (b.workerId !== a.workerId || (!a.workerId && (b.holdLabel ?? '') !== (a.holdLabel ?? '')))
    minor.push(b.workerId || a.workerId ? 'guest changed' : 'name changed');
  if ((b.notes ?? '') !== (a.notes ?? '')) minor.push('notes');
  if (JSON.stringify(b.away ?? null) !== JSON.stringify(a.away ?? null)) minor.push('away dates');
  if (b.depStatus !== a.depStatus && b.departure === a.departure && a.departure) minor.push('departure confirmed');
  return imm.length ? { tier: 'immediate', reasons: imm } : { tier: 'minor', reasons: minor };
}

/** Before/after lists of stays → one Change per stay that is new, gone or different. */
export function diffStays(before: Stay[], after: Stay[]): Change[] {
  const old = new Map(before.map(s => [s.id, s]));
  const out: Change[] = [];
  for (const a of after) {
    const b = old.get(a.id);
    if (!b) out.push({ before: null, after: a });
    else if (b.version !== a.version || JSON.stringify(b) !== JSON.stringify(a)) out.push({ before: b, after: a });
    old.delete(a.id);
  }
  for (const b of old.values()) out.push({ before: b, after: null });
  return out;
}

/** Several stays in one command: important if any one of them is. */
export function classifyAll(cs: Change[], isExtra: (roomId: string) => boolean = () => false): Classified {
  const all = cs.map(c => classify(c, isExtra((c.after ?? c.before)!.roomId)));
  const imm = all.filter(x => x.tier === 'immediate');
  const pick = imm.length ? imm : all;
  return { tier: imm.length ? 'immediate' : 'minor', reasons: [...new Set(pick.flatMap(x => x.reasons))] };
}

/** Does this change move an arrival or a departure into (or out of) the next `days` days? (housekeeper) */
export function touchesWindow(c: Change, today: string, days = 7): boolean {
  const end = addDays(today, days);
  const dates = [c.before?.arrival, c.before?.departure, c.after?.arrival, c.after?.departure].filter(
    (d): d is string => !!d,
  );
  return dates.some(d => d >= today && d <= end);
}

/** How a person is shown to this viewer. Eshcol sees who did it; RJ McLeod and the housekeeper see roles only. */
export function actorName(db: DB, id: string, viewer: Pick<User, 'role'>): string {
  const x = db.users.find(u => u.id === id);
  if (!x) return 'Someone';
  if (viewer.role === 'manager') return x.name;
  return ROLE_LABEL[x.role];
}

/** Kinds RJ McLeod may see. Never cleaning (cleaner names), rate changes, calendar sync, settings or enquiries. */
const CLIENT_KINDS: ActKind[] = ['stay', 'rota', 'worker'];

/** The Activity log as this viewer may see it. Eshcol: everything. RJ McLeod: their own rooms and bookings only. */
export function visibleActivity(db: DB, viewer: Pick<User, 'id' | 'role'>): Activity[] {
  if (viewer.role === 'manager') return db.activity;
  if (viewer.role !== 'client') return [];
  const contracted = new Set(db.properties.filter(p => p.contracted).map(p => p.id));
  return db.activity.filter(
    a =>
      !a.managerOnly &&
      !!a.kind &&
      CLIENT_KINDS.includes(a.kind) &&
      // contract rooms are all theirs; an extra-property entry is only kept when it is not private (theirs)
      (!a.propertyId || contracted.has(a.propertyId) || a.kind === 'stay'),
  );
}
