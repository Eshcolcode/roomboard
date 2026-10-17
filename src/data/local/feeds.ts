// Demo calendar links: one simulated feed per extra unit, written in the styles real channels use
// (Airbnb and Booking.com all-day events, a timed TZID feed, freetobook's one-event-per-night, UTC times).
// They go through the real parser, so the demo exercises the same code a live sync would.
import { addDays } from '../../dates';
import { uid } from '../core';
import type { Block, Feed } from '../core';
import { mergeRanges, parseICS } from '../ical';

const D = (d: string) => d.replace(/-/g, '');
const wrap = (prodid: string, events: string[]) =>
  ['BEGIN:VCALENDAR', 'VERSION:2.0', `PRODID:${prodid}`, ...events, 'END:VCALENDAR'].join('\r\n');
const allDay = (u: string, a: string, b: string, summary: string) =>
  [
    'BEGIN:VEVENT',
    `UID:${u}`,
    `DTSTART;VALUE=DATE:${D(a)}`,
    `DTEND;VALUE=DATE:${D(b)}`,
    `SUMMARY:${summary}`,
    'END:VEVENT',
  ].join('\r\n');

/** Sample feed text for a unit, with dates relative to today so the demo always has something to show. */
export function sampleIcs(roomId: string, T: string): string {
  const d = (n: number) => addDays(T, n);
  switch (roomId) {
    case 'x-pod1': // Airbnb style
      return wrap('-//Airbnb Inc//Hosting Calendar 1.0//EN', [
        allDay('a1@airbnb.com', d(3), d(7), 'Reserved'),
        allDay('a2@airbnb.com', d(20), d(27), 'Reserved'),
        allDay('a3@airbnb.com', d(44), d(48), 'Airbnb (Not available)'),
      ]);
    case 'x-pod2': // Booking.com style
      return wrap('-//admin.booking.com//EN', [
        allDay('b1@booking.com', d(1), d(9), 'CLOSED - Not available'),
        allDay('b2@booking.com', d(30), d(37), 'CLOSED - Not available'),
      ]);
    case 'x-lodge': // timed events in London time, across the late-October clock change
      return wrap('-//Sample//EN', [
        [
          'BEGIN:VEVENT',
          'UID:l1@sample',
          `DTSTART;TZID=Europe/London:${D(d(12))}T160000`,
          `DTEND;TZID=Europe/London:${D(d(19))}T100000`,
          'SUMMARY:Booked',
          'END:VEVENT',
        ].join('\r\n'),
      ]);
    case 'x-cottage': // freetobook: one event per night
      return wrap(
        '-//freetobook//EN',
        [5, 6, 7, 8, 25, 26, 27, 28, 29, 30, 31].map(n =>
          allDay(`CO-${n}@freetobook.com`, d(n), d(n + 1), 'NOT AVAILABLE'),
        ),
      );
    default: // Monadh: UTC times
      return wrap('-//Sample//EN', [
        [
          'BEGIN:VEVENT',
          'UID:m1@sample',
          `DTSTART:${D(d(15))}T150000Z`,
          `DTEND:${D(d(18))}T090000Z`,
          'SUMMARY:Booked',
          'END:VEVENT',
        ].join('\r\n'),
        allDay('m2@sample', d(60), d(67), 'Booked'),
      ]);
  }
}

export const EXTRA_UNITS = ['x-pod1', 'x-pod2', 'x-lodge', 'x-cottage', 'x-monadh'];
const LABEL: Record<string, string> = {
  'x-pod1': 'Airbnb',
  'x-pod2': 'Booking.com',
  'x-lodge': 'Other website',
  'x-cottage': 'freetobook',
  'x-monadh': 'SuperControl',
};

/** Turn one feed's text into blocks (merged ranges, dates only). */
export function blocksFrom(feed: Feed, text: string): Block[] {
  return mergeRanges(parseICS(text)).map(r => ({ id: uid(), roomId: feed.roomId, feedId: feed.id, ...r }));
}

export function demoFeeds(T: string): { feeds: Feed[]; blocks: Block[] } {
  const feeds: Feed[] = EXTRA_UNITS.map(roomId => ({
    id: 'f-' + roomId,
    roomId,
    label: `${LABEL[roomId]} (sample)`,
    url: '',
    simulated: true,
    lastSync: new Date().toISOString(),
    error: null,
  }));
  return { feeds, blocks: feeds.flatMap(f => blocksFrom(f, sampleIcs(f.roomId, T))) };
}
