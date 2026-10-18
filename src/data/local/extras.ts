// Demo commands for extra properties: the calendar links, the export, and Donald's indicative rate.
import { fmt, londonToday } from '../../dates';
import { S, iso, roomOf, roomLabel, propOf, stayLabel, DEFAULT_SETTINGS } from '../core';
import type { Settings } from '../core';
import { commit, log } from './store';
import { queueFor, usersOf, actorRole } from './alerts';
import { SAMPLE_ICS, blocksFrom } from './feeds';
import { blockClashes, unitIcs } from '../extras';

const unitName = (roomId: string) => propOf(roomOf(roomId).propertyId).name;
const dates = (a: string, b: string | null) => `${fmt(a)} → ${b ? fmt(b) : 'open-ended'}`;
function needManager() {
  if (actorRole() !== 'manager') throw new Error('Only Donald can do that.');
}

/** Donald's indicative rate (£ per room per week). Sheena cannot change it. */
export function setSettings(next: Partial<Settings>) {
  needManager();
  const cur = { ...DEFAULT_SETTINGS, ...(S.db.settings ?? {}) };
  const r = next.ratePerRoomWeek;
  if (r !== undefined && (!Number.isFinite(r) || r <= 0 || r > 100000))
    throw new Error('Enter a weekly price in pounds, for example 350.');
  S.db.settings = { ...cur, ...next, ...(r !== undefined ? { ratePerRoomWeek: Math.round(r) } : {}) };
  log(`Indicative rate set to £${S.db.settings.ratePerRoomWeek} per room per week`, undefined, true);
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
    log('⚠ ' + t, roomOf(c.stay.roomId).propertyId, true); // Donald only
    usersOf('manager').forEach(u => queueFor(u, `⚠ Possible double booking · ${unitName(c.stay.roomId)}`, t));
  }
  commit();
  return { conflicts: blockClashes(S.db).length };
}
export const exportLink = (roomId: string) => ({ url: null, text: unitIcs(S.db, roomId) });
export { roomLabel };
