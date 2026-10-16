// Demo store: crew rotations. A series is created or reshaped as ONE command (one undo step, one alert),
// and every generated stay goes through the same validate() / reconcile() as a single booking.
import { fmt, londonToday } from '../../dates';
import { S, uid, iso, reconcile, validate, propOf, roomLabel } from '../core';
import type { Series, Stay, StayInput } from '../core';
import { reshape } from '../crew';
import { patternText } from '../rotation';
import { snap, undoStack, commit, log } from './store';
import { alertStayChange, handle } from './alerts';

function applyAll(create: StayInput[], update: StayInput[], remove: string[]) {
  const before = { stays: structuredClone(S.db.stays) };
  try {
    S.db.stays = S.db.stays.filter(s => !remove.includes(s.id));
    for (const u of update) {
      const cur = S.db.stays.find(s => s.id === u.id)!;
      const err = validate({ ...u, version: cur.version });
      if (err) throw new Error(err);
      Object.assign(cur, u, { version: cur.version + 1, updatedBy: S.db.currentUser, updatedAt: iso() });
    }
    for (const c of create) {
      const err = validate(c);
      if (err) throw new Error(err);
      S.db.stays.push({ id: uid(), ...c, version: 1, updatedBy: S.db.currentUser, updatedAt: iso() } as Stay);
    }
  } catch (e) {
    S.db.stays = before.stays;
    undoStack.pop();
    throw e;
  }
}

export function createSeries(base: Omit<Series, 'id' | 'createdBy' | 'createdAt'>, inputs: StayInput[]): Series {
  const s: Series = { ...base, id: uid(), createdBy: S.db.currentUser, createdAt: iso() };
  snap(`crew booking ${s.label}`);
  applyAll(
    inputs.map(i => ({ ...i, seriesId: s.id })),
    [],
    [],
  );
  S.db.series = [...(S.db.series ?? []), s];
  for (const sl of s.slots) {
    if (!sl.workerId) continue;
    const w = S.db.workers.find(x => x.id === sl.workerId);
    if (w) {
      w.uses++;
      w.lastUsed = londonToday();
    }
  }
  const text = `Crew booked: ${s.label} · ${s.slots.length} people · ${patternText(s)} from ${fmt(s.start)} · ${inputs.length} stays at ${propOf(s.propertyId).name}`;
  log(text, s.propertyId);
  handle(reconcile(S.db));
  alertStayChange(`Crew booked · ${s.label}`, text);
  commit();
  return s;
}

/** Extend, shorten or cancel a whole series. */
export function updateSeries(next: Series, what: string) {
  const cur = (S.db.series ?? []).find(x => x.id === next.id);
  if (!cur) throw new Error('That crew booking no longer exists.');
  const r = reshape(S.db, cur, next, londonToday());
  snap(`${what} · ${cur.label}`);
  applyAll(r.create, r.update, r.remove);
  S.db.series = (S.db.series ?? []).map(x => (x.id === next.id ? next : x));
  const rooms = new Set([...r.create, ...r.update].map(x => roomLabel(x.roomId)));
  const text = `Crew ${cur.label}: ${what} (${r.create.length} added, ${r.update.length} changed, ${r.remove.length} removed${rooms.size ? ' · ' + [...rooms].slice(0, 4).join(', ') : ''})`;
  log(text, cur.propertyId);
  handle(reconcile(S.db));
  alertStayChange(`Crew booking changed · ${cur.label}`, text);
  commit();
  return r;
}
