import { londonToday, fmt, diffDays } from '../../dates';
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
  isExtra,
  propOf,
  blocksIn,
  normDep,
} from '../core';
import type { Stay, StayInput } from '../core';
import { snap, commit, log, undoStack } from './store';
import { stayError } from '../rules';
import { notifyStays, handle } from './alerts';
import { estimateLine } from '../pricing';

/** An extra-property booking Sheena made (she may see and change it); Donald's own ones stay private. */
const clientOwned = (s: Stay) => S.db.users.find(u => u.id === s.bookedBy)?.role === 'client';

export function saveStay(inp: StayInput): Stay {
  inp = normDep(inp);
  // Extra properties are booked whole and confirmed straight away (Donald is told; invoiced separately).
  // Sheena can change or cancel only her own extra bookings; she never sees who else has one.
  const extra = isExtra(roomOf(inp.roomId).propertyId);
  const actor = S.db.users.find(u => u.id === S.db.currentUser)?.role;
  if (actor === 'client' && inp.id) {
    const cur = S.db.stays.find(s => s.id === inp.id);
    if (cur && (extra || isExtra(roomOf(cur.roomId).propertyId)) && cur.bookedBy !== S.db.currentUser)
      throw new Error('This booking was made by Eshcol. Ask Eshcol to change it.');
  }
  const err = validate(inp);
  if (err) throw new Error(err);
  const before = structuredClone(S.db.stays);
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
    const priv = extra && !clientOwned(cur);
    const a = log(text, r.propertyId, priv);
    handle(reconcile(S.db));
    notifyStays(before, a, `Stay updated · ${roomLabel(cur.roomId)}`);
    commit();
    return cur;
  }
  const s: Stay = {
    id: uid(),
    ...inp,
    bookedBy: S.db.currentUser,
    version: 1,
    updatedBy: S.db.currentUser,
    updatedAt: iso(),
  } as Stay;
  S.db.stays.push(s);
  if (extra) {
    const p = propOf(r.propertyId);
    const nights = s.departure ? diffDays(s.arrival, s.departure) : null;
    const t = `Booked ${p.name} (whole property) for ${who}, ${fmt(s.arrival)} → ${depText(s)} · ${estimateLine(S.db, p, nights)} · extra, invoiced separately`;
    const a = log(t, r.propertyId, actor !== 'client');
    // Eshcol is told when RJ McLeod books; Eshcol's own bookings of extras are never sent to RJ McLeod
    notifyStays(before, a, `New booking · ${p.name}`);
    commit();
    return s;
  }
  const text = `${inp.workerId ? 'Booked' : 'Held'} ${roomLabel(s.roomId)} for ${who} from ${fmt(s.arrival)} → ${depText(s)}`;
  const a = log(text, r.propertyId);
  handle(reconcile(S.db));
  notifyStays(before, a, inp.workerId ? `New arrival · ${roomLabel(s.roomId)}` : `Room held · ${roomLabel(s.roomId)}`);
  commit();
  return s;
}
export function deleteStay(id: string) {
  const s = S.db.stays.find(x => x.id === id);
  if (!s) return;
  const role = S.db.users.find(u => u.id === S.db.currentUser)?.role;
  const extra = isExtra(roomOf(s.roomId).propertyId);
  if (role === 'client' && extra && s.bookedBy !== S.db.currentUser)
    throw new Error('This booking was made by Eshcol. Ask Eshcol to cancel it.');
  const before = structuredClone(S.db.stays);
  snap(`cancelled ${stayLabel(s)} · ${roomLabel(s.roomId)}`);
  S.db.stays = S.db.stays.filter(x => x.id !== id);
  const text = `Cancelled ${stayLabel(s)} · ${roomLabel(s.roomId)} (${fmt(s.arrival)})`;
  const priv = extra && !clientOwned(s);
  const a = log(text, roomOf(s.roomId).propertyId, priv);
  handle(reconcile(S.db));
  notifyStays(before, a, `Stay cancelled · ${roomLabel(s.roomId)}`);
  commit();
}
export function confirmDeparture(id: string) {
  {
    const c = S.db.stays.find(x => x.id === id);
    if (c) snap(`departure confirmed · ${roomLabel(c.roomId)}`);
  }
  const before = structuredClone(S.db.stays);
  const s = S.db.stays.find(x => x.id === id)!;
  s.depStatus = 'confirmed';
  s.version++;
  s.updatedBy = S.db.currentUser;
  s.updatedAt = iso();
  const t = `Confirmed departure of ${stayLabel(s)} · ${roomLabel(s.roomId)} on ${fmt(s.departure!)}`;
  const a = log(t, roomOf(s.roomId).propertyId);
  notifyStays(before, a, `Departure confirmed · ${roomLabel(s.roomId)}`); // same date: minor, log only
  commit();
}

/** All-or-nothing batch: every result is checked against the final state, then one log line, one alert. */
export function saveBatch(inputs: StayInput[], removeIds: string[], what: string) {
  const before = structuredClone(S.db.stays);
  snap(what);
  try {
    for (const i of inputs)
      if (i.id) {
        const cur = S.db.stays.find(s => s.id === i.id);
        if (!cur || removeIds.includes(i.id))
          throw new ConflictError('One of these stays was changed or cancelled by someone else. Reload and try again.');
        if (i.version !== undefined && cur.version !== i.version)
          throw new ConflictError(
            'One of these stays was changed by someone else while you were editing. Reload to see the latest.',
          );
      }
    S.db.stays = S.db.stays.filter(s => !removeIds.includes(s.id));
    const touched: Stay[] = [];
    for (const raw of inputs) {
      const i = normDep(raw);
      if (i.id) {
        const cur = S.db.stays.find(s => s.id === i.id)!;
        Object.assign(cur, i, { version: cur.version + 1, updatedBy: S.db.currentUser, updatedAt: iso() });
        touched.push(cur);
      } else {
        const s = { id: uid(), ...i, version: 1, updatedBy: S.db.currentUser, updatedAt: iso() } as Stay;
        S.db.stays.push(s);
        touched.push(s);
      }
    }
    for (const t of touched) {
      const e = stayError(t, [
        ...S.db.stays.filter(s => s.id !== t.id && s.roomId === t.roomId),
        ...blocksIn(t.roomId),
      ]);
      if (e === 'clash') throw new Error(`${roomLabel(t.roomId)} is already taken for some of those nights.`);
      if (e) throw new Error('Those dates do not work. Please check them again.');
    }
  } catch (e) {
    S.db.stays = before;
    undoStack.pop();
    throw e;
  }
  const props = new Set([...inputs.map(i => roomOf(i.roomId).propertyId)]);
  const a = log(what, props.size === 1 ? [...props][0] : undefined);
  handle(reconcile(S.db));
  notifyStays(before, a, what.split(':')[0]);
  commit();
}
