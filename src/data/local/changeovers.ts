import { londonToday, fmt } from '../../dates';
import { cleanWindow, statusGate } from '../rules';
import { S, CO_LABEL, roomOf, roomLabel } from '../core';
import type { Changeover } from '../core';
import { commit, log } from './store';
import { queueFor, usersOf, actorRole, alertChangeover } from './alerts';

export function updateChangeover(id: string, patch: Partial<Changeover>) {
  const c = S.db.changeovers.find(x => x.id === id);
  if (!c) throw new Error('This changeover no longer exists.');
  const next = { ...c, ...patch };
  const T = londonToday();
  // Sequence: departure → clean → ready, all before the next arrival. Out-of-window only as an explicit provider exception.
  if (patch.scheduledFor !== undefined && next.scheduledFor) {
    const w = cleanWindow(c.afterDate, c.readyBy, next.scheduledFor);
    const bad =
      w === 'before_departure'
        ? `A clean can't be before the guest leaves (${fmt(c.afterDate)}).`
        : w === 'after_next_arrival'
          ? `The clean must be on or before the next arrival (${fmt(c.readyBy!)}).`
          : '';
    if (bad && !(patch.exception && actorRole() === 'manager')) throw new Error(bad);
    if (!bad) c.exception = undefined;
  }
  const gate = (t: 'vacated' | 'in_progress' | 'ready') => statusGate(t, !!next.vacated, T, c.afterDate);
  if (patch.vacated && gate('vacated'))
    throw new Error(`"Left" can be ticked from the departure day (${fmt(c.afterDate)}).`);
  if (patch.status === 'in_progress' && gate('in_progress'))
    throw new Error('Tick "Guest has left" before starting the clean.');
  if (patch.status === 'ready' && gate('ready')) throw new Error('Ready needs "Guest has left" ticked first.');
  if (next.status === 'ready' && c.exception) c.exception = undefined;
  const was = c.status;
  Object.assign(c, patch);
  if (patch.exception)
    log(
      `⚠ ${roomLabel(c.roomId)}: clean booked outside the usual window – ${patch.exception}`,
      roomOf(c.roomId).propertyId,
    );
  if (patch.status) c.invalidated = undefined;
  const rl = roomLabel(c.roomId);
  const pid = roomOf(c.roomId).propertyId;
  if (patch.vacated !== undefined && patch.status === undefined) {
    log(`${rl}: ${c.vacated ? 'guest has left ✓' : '"guest has left" untick'}`, pid);
    commit();
    return;
  }
  const t = `${rl} clean → ${CO_LABEL[c.status]}${c.scheduledFor && c.status !== 'ready' ? ' · ' + fmt(c.scheduledFor) : ''}`;
  log(t, pid);
  if (c.status === 'ready')
    usersOf('client').forEach(u => queueFor(u, `${rl} is ready`, `${rl} is ready for the next arrival`));
  else if (c.status === 'scheduled')
    alertChangeover(c, was === 'needs' && c.scheduledFor ? `Clean scheduled · ${rl}` : `Clean rescheduled · ${rl}`, t);
  commit();
}
export function dismissChangeover(id: string) {
  const c = S.db.changeovers.find(x => x.id === id);
  if (!c) return;
  S.db.changeovers = S.db.changeovers.filter(x => x.id !== id);
  log(`Dismissed flagged changeover ${roomLabel(c.roomId)}`, roomOf(c.roomId).propertyId);
  alertChangeover(c, `Clean cancelled · ${roomLabel(c.roomId)}`, 'No longer needed');
  commit();
}
