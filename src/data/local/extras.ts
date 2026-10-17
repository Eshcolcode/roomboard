// Demo commands for extra properties: confirm / decline a client's request, and the calendar links.
import { fmt, londonToday } from '../../dates';
import { S, uid, iso, validate, roomOf, roomLabel, propOf, stayLabel } from '../core';
import type { StayInput } from '../core';
import { snap, commit, log } from './store';
import { queueFor, usersOf, actorRole } from './alerts';
import { blocksFrom, sampleIcs } from './feeds';
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

/** Demo sync: sample feeds are re-read through the real parser; real links can only be read by the live server. */
export function syncFeeds(): { conflicts: number } {
  const T = londonToday();
  const before = new Set(blockClashes(S.db).map(c => c.stay.id + c.block.from));
  for (const f of S.db.feeds ?? []) {
    S.db.blocks = (S.db.blocks ?? []).filter(b => b.feedId !== f.id);
    if (f.simulated) {
      S.db.blocks.push(...blocksFrom(f, sampleIcs(f.roomId, T)));
      f.lastSync = iso();
      f.error = null;
    } else f.error = 'Demo mode: real links are read by the live server (every 30 minutes).';
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
export function addFeed(f: { roomId: string; label: string; url: string }) {
  needManager();
  const url = f.url.trim();
  if (!/^(https?|webcal):\/\//i.test(url)) throw new Error('Paste the full calendar link (it starts with https://).');
  S.db.feeds = [
    ...(S.db.feeds ?? []),
    { id: uid(), roomId: f.roomId, label: f.label.trim() || 'Calendar', url, lastSync: null, error: null },
  ];
  log(`Added calendar link "${f.label || 'Calendar'}" for ${unitName(f.roomId)}`, roomOf(f.roomId).propertyId);
  commit();
}
export function removeFeed(id: string) {
  needManager();
  const f = (S.db.feeds ?? []).find(x => x.id === id);
  if (!f) return;
  S.db.feeds = (S.db.feeds ?? []).filter(x => x.id !== id);
  S.db.blocks = (S.db.blocks ?? []).filter(b => b.feedId !== id);
  log(`Removed calendar link "${f.label}" for ${unitName(f.roomId)}`, roomOf(f.roomId).propertyId);
  commit();
}
export const exportLink = (roomId: string) => ({ url: null, text: unitIcs(S.db, roomId) });
export { roomLabel };
