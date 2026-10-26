// Demo calendar links. Only Monadh's calendar is linked so far (SuperControl); Harris, Uig and Abhainn Cottage
// show "Calendar not linked yet" until Eshcol sends their links. Monadh's demo feed is a sanitised copy of the real
// feed's structure and dates (monadh-sample.ics: same VTIMEZONE, local-midnight all-day events, "Closed" periods;
// guest names, booking refs and UIDs replaced). It goes through the real parser, like a live sync.
// If the sample's dates have all passed, they move forward by whole 52-week steps (same weekdays) so the demo
// always has something to show.
import { addDays } from '../../dates';
import { uid } from '../core';
import type { Block, Feed } from '../core';
import { mergeRanges, parseICS } from '../ical';
import MONADH from './monadh-sample.ics?raw';

export const EXTRA_UNITS = ['x-pod1', 'x-pod2', 'x-monadh', 'x-cottage'];
const LABEL: Record<string, string> = {
  'x-pod1': 'Harris calendar',
  'x-pod2': 'Uig calendar',
  'x-cottage': 'Abhainn Cottage calendar',
  'x-monadh': 'SuperControl',
};
/** The demo's linked calendars (unit → .ics text). The others are not linked yet. */
export const SAMPLE_ICS: Record<string, string> = { 'x-monadh': MONADH };

/** Turn one feed's text into blocks (merged ranges, dates only), kept from today onwards. */
export function blocksFrom(feed: Feed, text: string, T: string): Block[] {
  let rs = mergeRanges(parseICS(text));
  const last = rs.reduce((m, r) => (r.to > m ? r.to : m), '');
  let k = 0;
  while (last && addDays(last, 364 * k) <= addDays(T, 60)) k++;
  if (k) rs = rs.map(r => ({ from: addDays(r.from, 364 * k), to: addDays(r.to, 364 * k) }));
  return rs.filter(r => r.to > T).map(r => ({ id: uid(), roomId: feed.roomId, feedId: feed.id, ...r }));
}

export function demoFeeds(T: string): { feeds: Feed[]; blocks: Block[] } {
  const feeds: Feed[] = EXTRA_UNITS.map(roomId => ({
    id: 'f-' + roomId,
    roomId,
    label: LABEL[roomId],
    linked: !!SAMPLE_ICS[roomId],
    simulated: true,
    lastSync: SAMPLE_ICS[roomId] ? new Date().toISOString() : null,
    error: null,
  }));
  return { feeds, blocks: feeds.flatMap(f => (SAMPLE_ICS[f.roomId] ? blocksFrom(f, SAMPLE_ICS[f.roomId], T) : [])) };
}
