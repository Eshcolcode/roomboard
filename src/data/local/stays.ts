import { londonToday, fmt } from '../../dates';
import {
  S,
  uid,
  iso,
  reconcile,
  validate,
  ConflictError,
  roomOf,
  workerOf,
  stayLabel,
  roomLabel,
  depText,
} from '../core';
import type { Stay, StayInput } from '../core';
import { snap, commit, log } from './store';
import { alertStayChange, handle } from './alerts';

export function saveStay(inp: StayInput): Stay {
  if (inp.depStatus === 'tbc' || inp.depStatus === 'ufn') inp = { ...inp, departure: null };
  const err = validate(inp);
  if (err) throw new Error(err);
  if (inp.id) {
    const cur = S.db.stays.find(s => s.id === inp.id);
    if (cur && cur.version === inp.version) snap(`change to ${stayLabel(cur)} · ${roomLabel(cur.roomId)}`);
  } else snap(`new stay · ${roomLabel(inp.roomId)}`);
  const r = roomOf(inp.roomId);
  const who = inp.workerId ? workerOf(inp.workerId)!.name : inp.holdLabel || 'Name to follow';
  if (inp.workerId) {
    const w = workerOf(inp.workerId)!;
    w.uses++;
    w.lastUsed = londonToday();
  }
  if (inp.id) {
    const cur = S.db.stays.find(s => s.id === inp.id);
    if (!cur) throw new ConflictError('This stay was cancelled by someone else.');
    if (cur.version !== inp.version)
      throw new ConflictError(
        `This stay was changed by ${S.db.users.find(u => u.id === cur.updatedBy)?.name ?? 'someone else'} while you were editing. Reload to see the latest before saving.`,
      );
    const changes: string[] = [];
    if (!cur.workerId && inp.workerId) changes.push(`named hold as ${who}`);
    else if (cur.workerId !== inp.workerId) changes.push(`changed guest to ${who}`);
    if (cur.roomId !== inp.roomId) changes.push(`moved to ${r.name}`);
    if (cur.arrival !== inp.arrival) changes.push(`arrival ${fmt(cur.arrival)} → ${fmt(inp.arrival)}`);
    if (cur.departure !== inp.departure || cur.depStatus !== inp.depStatus)
      changes.push(`departure ${depText(cur)} → ${depText({ ...cur, ...inp } as Stay)}`);
    if (JSON.stringify(cur.away ?? null) !== JSON.stringify(inp.away ?? null))
      changes.push(inp.away ? `away (room retained) ${fmt(inp.away.from)}–${fmt(inp.away.to)}` : 'cleared away dates');
    if ((cur.notes ?? '') !== (inp.notes ?? '')) changes.push('notes updated');
    Object.assign(cur, inp, { version: cur.version + 1, updatedBy: S.db.currentUser, updatedAt: iso() });
    const text = `${roomLabel(cur.roomId)} · ${stayLabel(cur)}: ${changes.join(', ') || 'no changes'}`;
    log(text, r.propertyId);
    handle(reconcile(S.db));
    if (changes.length) alertStayChange(`Stay updated · ${roomLabel(cur.roomId)}`, text);
    commit();
    return cur;
  }
  const s: Stay = { id: uid(), ...inp, version: 1, updatedBy: S.db.currentUser, updatedAt: iso() } as Stay;
  S.db.stays.push(s);
  const text = `${inp.workerId ? 'Booked' : 'Held'} ${roomLabel(s.roomId)} for ${who} from ${fmt(s.arrival)} → ${depText(s)}`;
  log(text, r.propertyId);
  handle(reconcile(S.db));
  alertStayChange(inp.workerId ? `New arrival · ${roomLabel(s.roomId)}` : `Room held · ${roomLabel(s.roomId)}`, text);
  commit();
  return s;
}
export function deleteStay(id: string) {
  const s = S.db.stays.find(x => x.id === id);
  if (!s) return;
  snap(`cancelled ${stayLabel(s)} · ${roomLabel(s.roomId)}`);
  S.db.stays = S.db.stays.filter(x => x.id !== id);
  log(`Cancelled ${stayLabel(s)} · ${roomLabel(s.roomId)} (${fmt(s.arrival)})`, roomOf(s.roomId).propertyId);
  handle(reconcile(S.db));
  alertStayChange(`Stay cancelled · ${roomLabel(s.roomId)}`, `${stayLabel(s)} from ${fmt(s.arrival)} cancelled`);
  commit();
}
export function confirmDeparture(id: string) {
  {
    const c = S.db.stays.find(x => x.id === id);
    if (c) snap(`departure confirmed · ${roomLabel(c.roomId)}`);
  }
  const s = S.db.stays.find(x => x.id === id)!;
  s.depStatus = 'confirmed';
  s.version++;
  s.updatedBy = S.db.currentUser;
  s.updatedAt = iso();
  const t = `Confirmed departure of ${stayLabel(s)} · ${roomLabel(s.roomId)} on ${fmt(s.departure!)}`;
  log(t, roomOf(s.roomId).propertyId);
  alertStayChange(`Departure confirmed · ${roomLabel(s.roomId)}`, t);
  commit();
}
