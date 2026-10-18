// Demo commands for extra properties: confirm / decline a client's request, and the calendar links.
import { fmt, londonToday } from '../../dates';
import { S, iso, validate, roomOf, roomLabel, propOf, stayLabel } from '../core';
import type { StayInput } from '../core';
import { snap, commit, log } from './store';
import { queueFor, usersOf, actorRole } from './alerts';
import { SAMPLE_ICS, blocksFrom } from './feeds';
import { blockClashes, unitIcs } from '../extras';

const unitName = (roomId: string) => propOf(roomOf(roomId).propertyId).name;
const dates = (a: string, b: string | null) => `${fmt(a)} → ${b ? fmt(b) : 'open-ended'}`;
function needManager() {
  if (actorRole() !== 'manager') throw new Error('Only Donald can do that.');
}

export function confirmRequest(id: string) {
  needManager();
  const s = S.db.stays.find(x => x.id === id);
  if (!s || s.request !== 'pending') throw new Error('This request was already answered.');
  const err = validate({ ...(s as StayInput), request: null });
  if (err) throw new Error(err);
  snap(`confirmed request · ${unitName(s.roomId)}`);
  Object.assign(s, { request: null, version: s.version + 1, updatedBy: S.db.currentUser, updatedAt: iso() });
  const t = `Confirmed ${unitName(s.roomId)} for ${stayLabel(s)}, ${dates(s.arrival, s.departure)} · invoiced separately`;
  log(t, roomOf(s.roomId).propertyId);
  usersOf('client').forEach(u => queueFor(u, `Request confirmed · ${unitName(s.roomId)}`, t));
  commit();
}
export function declineRequest(id: string, reason: string) {
  needManager();
  const s = S.db.stays.find(x => x.id === id);
  if (!s || s.request !== 'pending') throw new Error('This request was already answered.');
  snap(`declined request · ${unitName(s.roomId)}`);
  S.db.stays = S.db.stays.filter(x => x.id !== id);
  const t = `Declined ${unitName(s.roomId)} for ${dates(s.arrival, s.departure)}${reason ? ` — ${reason}` : ''}`;
  log(t, roomOf(s.roomId).propertyId);
  usersOf('client').forEach(u => queueFor(u, `Request declined · ${unitName(s.roomId)}`, t));
  commit();
}

/** Demo sync: linked sample calendars are re-read through the real parser; unlinked ones block nothing. */
export function syncFeeds(): { conflicts: number } {
  const T = londonToday();
  const before = new Set(blockClashes(S.db).map(c => c.stay.id + c.block.from));
  for (const f of S.db.feeds ?? []) {
    S.db.blocks = (S.db.blocks ?? []).filter(b => b.feedId !== f.id);
    const text = SAMPLE_ICS[f.roomId];
    f.linked = !!text;
    f.error = null;
    if (text) {
      S.db.blocks.push(...blocksFrom(f, text, T));
      f.lastSync = iso();
    } else f.lastSync = null;
  }
  const fresh = blockClashes(S.db).filter(c => !before.has(c.stay.id + c.block.from));
  for (const c of fresh) {
    const t = `${unitName(c.stay.roomId)} is now booked elsewhere ${dates(c.block.from, c.block.to)}, overlapping ${stayLabel(c.stay)} (${dates(c.stay.arrival, c.stay.departure)}). Check for a double booking.`;
    log('⚠ ' + t, roomOf(c.stay.roomId).propertyId);
    usersOf('manager').forEach(u => queueFor(u, `⚠ Possible double booking · ${unitName(c.stay.roomId)}`, t));
  }
  commit();
  return { conflicts: blockClashes(S.db).length };
}
export const exportLink = (roomId: string) => ({ url: null, text: unitIcs(S.db, roomId) });
export { roomLabel };
