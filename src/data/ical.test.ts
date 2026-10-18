// iCal import/export: all-day DTEND is exclusive, time zones resolve to London days, folding, merging, privacy.
import { describe, expect, it } from 'vitest';
import srcCopy from './ical.ts?raw';
import fnCopy from '../../supabase/functions/_shared/ical.ts?raw';
import MONADH from './local/monadh-sample.ics?raw';
import { exportICS, feedLink, mergeRanges, parseICS } from './ical';

const cal = (...ev: string[]) => ['BEGIN:VCALENDAR', 'VERSION:2.0', ...ev, 'END:VCALENDAR'].join('\r\n');
const ev = (...l: string[]) => ['BEGIN:VEVENT', ...l, 'END:VEVENT'].join('\r\n');

describe('parseICS', () => {
  it('all-day: DTEND is the check-out day (exclusive), not another night', () => {
    const r = parseICS(
      cal(ev('UID:a', 'DTSTART;VALUE=DATE:20261103', 'DTEND;VALUE=DATE:20261107', 'SUMMARY:Reserved')),
    );
    expect(r).toEqual([{ uid: 'a', from: '2026-11-03', to: '2026-11-07' }]);
  });
  it('all-day without DTEND blocks exactly one night; bare yyyymmdd counts as all-day', () => {
    expect(parseICS(cal(ev('UID:b', 'DTSTART;VALUE=DATE:20261224')))).toEqual([
      { uid: 'b', from: '2026-12-24', to: '2026-12-25' },
    ]);
    expect(parseICS(cal(ev('UID:c', 'DTSTART:20261224', 'DTEND:20261226')))[0]).toMatchObject({
      from: '2026-12-24',
      to: '2026-12-26',
    });
  });
  it('UTC times become London days, including late-evening UTC in summer time (BST)', () => {
    // 23:30Z on 1 Jul is 00:30 on 2 Jul in London
    const r = parseICS(cal(ev('UID:d', 'DTSTART:20260701T233000Z', 'DTEND:20260705T090000Z')));
    expect(r[0]).toMatchObject({ from: '2026-07-02', to: '2026-07-05' });
  });
  it('TZID times are read in their own zone and across the October clock change', () => {
    const r = parseICS(
      cal(
        ev('UID:e', 'DTSTART;TZID=Europe/London:20261023T160000', 'DTEND;TZID=Europe/London:20261027T100000'),
        // 01:00 in New York on 3 Nov = 06:00 London: still 3 Nov
        ev('UID:f', 'DTSTART;TZID="America/New_York":20261103T010000', 'DTEND;TZID=America/New_York:20261105T010000'),
        // 23:00 on 2 Nov in Los Angeles = 07:00 on 3 Nov in London
        ev(
          'UID:g',
          'DTSTART;TZID=America/Los_Angeles:20261102T230000',
          'DTEND;TZID=America/Los_Angeles:20261104T230000',
        ),
      ),
    );
    expect(r.map(x => [x.from, x.to])).toEqual([
      ['2026-10-23', '2026-10-27'],
      ['2026-11-03', '2026-11-05'],
      ['2026-11-03', '2026-11-05'],
    ]);
  });
  it('floating times and unknown zones are taken as London; DURATION works when DTEND is missing', () => {
    const r = parseICS(
      cal(
        ev('UID:h', 'DTSTART:20261110T150000', 'DURATION:P3D'),
        ev('UID:i', 'DTSTART;TZID=Not/AZone:20261120T150000', 'DTEND;TZID=Not/AZone:20261122T100000'),
        ev('UID:j', 'DTSTART;VALUE=DATE:20261201', 'DURATION:P1W'),
      ),
    );
    expect(r.map(x => [x.from, x.to])).toEqual([
      ['2026-11-10', '2026-11-13'],
      ['2026-11-20', '2026-11-22'],
      ['2026-12-01', '2026-12-08'],
    ]);
  });
  it('unfolds lines, skips cancelled/free events and alarms, and keeps no guest details', () => {
    const r = parseICS(
      cal(
        ev(
          'UID:k',
          'SUMMARY:Jane Doe (HMABCDE)',
          'DESCRIPTION:Phone +44 7700 900123\\nEmail jane@example.com',
          ' continued',
          'DTSTART;VALUE=DATE:2026',
          ' 1205',
          'DTEND;VALUE=DATE:20261208',
          'BEGIN:VALARM',
          'TRIGGER:-PT15M',
          'DTSTART:20200101T000000Z',
          'END:VALARM',
        ),
        ev('UID:l', 'STATUS:CANCELLED', 'DTSTART;VALUE=DATE:20261210', 'DTEND;VALUE=DATE:20261212'),
        ev('UID:m', 'TRANSP:TRANSPARENT', 'DTSTART;VALUE=DATE:20261214', 'DTEND;VALUE=DATE:20261215'),
      ).replace(/\r\n/g, '\n'),
    );
    expect(r).toEqual([{ uid: 'k', from: '2026-12-05', to: '2026-12-08' }]);
    expect(JSON.stringify(r)).not.toMatch(/Jane|7700|example/);
  });
  it('a zero-length or same-day event still blocks its night', () => {
    expect(parseICS(cal(ev('UID:n', 'DTSTART:20261201T120000Z', 'DTEND:20261201T130000Z')))[0]).toMatchObject({
      from: '2026-12-01',
      to: '2026-12-02',
    });
  });
});

describe('SuperControl (Monadh) feed: sanitised copy of the real feed structure', () => {
  const r = parseICS(MONADH);
  it('reads all 14 events; local-midnight TZID all-day dates are kept as dates, DTEND exclusive', () => {
    expect(r).toHaveLength(14);
    // 21 Oct 2025 (BST) to 25 Oct: 4 nights, checkout day free
    expect(r[0]).toMatchObject({ from: '2025-10-21', to: '2025-10-25' });
    // after the clock change (26 Oct 2025, GMT): no day shift
    expect(r[1]).toMatchObject({ from: '2025-10-27', to: '2025-10-30' });
    expect(mergeRanges(r).filter(x => x.to > '2026-10-18')).toEqual([
      { from: '2026-11-16', to: '2026-11-19' },
      { from: '2026-12-20', to: '2027-01-04' },
    ]);
  });
  it('"Closed" periods are unavailable too', () => {
    expect(r.some(x => x.from === '2026-06-13' && x.to === '2026-06-27')).toBe(true);
    expect(r.some(x => x.from === '2026-12-20' && x.to === '2027-01-04')).toBe(true);
  });
  it('keeps dates only: no guest names, phone numbers, emails or booking refs', () => {
    expect(MONADH).toMatch(/Guestname/); // the sample does carry fake guest details…
    expect(JSON.stringify(r)).not.toMatch(/Guest|Booking|01632|example|Closed|Monadh/); // …and none come out
    expect(r.every(x => Object.keys(x).sort().join() === 'from,to,uid')).toBe(true);
  });
});

describe('parseICS: all-day across the 25 Oct 2026 clock change, Closed, duplicates', () => {
  it('TZID midnights over 25 Oct 2026 (BST → GMT) give the right nights, with or without the all-day flag', () => {
    const r = parseICS(
      cal(
        ev(
          'UID:p',
          'X-MICROSOFT-CDO-ALLDAYEVENT:TRUE',
          'DTSTART;TZID=Europe/London:20261024T000000',
          'DTEND;TZID=Europe/London:20261027T000000',
        ),
        ev('UID:q', 'DTSTART;TZID=Europe/London:20261025T000000', 'DTEND;TZID=Europe/London:20261026T000000'),
        ev('UID:r', 'DTSTART;VALUE=DATE:20261025', 'DTEND;VALUE=DATE:20261026'),
      ),
    );
    expect(r.map(x => [x.from, x.to])).toEqual([
      ['2026-10-24', '2026-10-27'],
      ['2026-10-25', '2026-10-26'],
      ['2026-10-25', '2026-10-26'],
    ]);
  });
  it('a "Closed" event blocks even if marked free; a plain free event does not', () => {
    const r = parseICS(
      cal(
        ev('UID:s', 'SUMMARY:Closed', 'TRANSP:TRANSPARENT', 'DTSTART;VALUE=DATE:20261220', 'DTEND;VALUE=DATE:20270104'),
        ev(
          'UID:t',
          'SUMMARY:Owner note',
          'TRANSP:TRANSPARENT',
          'DTSTART;VALUE=DATE:20261110',
          'DTEND;VALUE=DATE:20261111',
        ),
      ),
    );
    expect(r).toEqual([{ uid: 's', from: '2026-12-20', to: '2027-01-04' }]);
  });
  it('the same UID twice counts once: highest SEQUENCE wins, else the later one', () => {
    const r = parseICS(
      cal(
        ev('UID:u', 'SEQUENCE:2', 'DTSTART;VALUE=DATE:20261201', 'DTEND;VALUE=DATE:20261205'),
        ev('UID:u', 'SEQUENCE:1', 'DTSTART;VALUE=DATE:20261101', 'DTEND;VALUE=DATE:20261103'),
        ev('UID:v', 'DTSTART;VALUE=DATE:20261110', 'DTEND;VALUE=DATE:20261112'),
        ev('UID:v', 'DTSTART;VALUE=DATE:20261111', 'DTEND;VALUE=DATE:20261114'),
      ),
    );
    expect(r).toEqual([
      { uid: 'u', from: '2026-12-01', to: '2026-12-05' },
      { uid: 'v', from: '2026-11-11', to: '2026-11-14' },
    ]);
  });
});

describe('feedLink: feed links come from server secrets', () => {
  const env: Record<string, string> = {
    ICAL_MONADH: ' https://calendar.example/feed.ics ',
    ICAL_UIG: 'webcal://calendar.example/uig.ics',
    ICAL_HARRIS: '',
    ICAL_BAD: 'not a link',
    SUPABASE_SERVICE_ROLE_KEY: 'https://looks-like-a-link',
  };
  const get = (k: string) => env[k];
  it('reads the secret, trims it, and turns webcal: into https:', () => {
    expect(feedLink('ICAL_MONADH', get)).toBe('https://calendar.example/feed.ics');
    expect(feedLink('ICAL_UIG', get)).toBe('https://calendar.example/uig.ics');
  });
  it('missing, blank or not-a-link = not linked yet (null), never an error', () => {
    expect(feedLink('ICAL_ABHAINN', get)).toBeNull();
    expect(feedLink('ICAL_HARRIS', get)).toBeNull();
    expect(feedLink('ICAL_BAD', get)).toBeNull();
  });
  it('only ICAL_* names can be read', () => {
    expect(feedLink('SUPABASE_SERVICE_ROLE_KEY', get)).toBeNull();
    expect(feedLink('ical_monadh', get)).toBeNull();
  });
});

describe('mergeRanges', () => {
  it('joins one-event-per-night feeds and overlaps into stays', () => {
    expect(
      mergeRanges([
        { from: '2026-11-02', to: '2026-11-03' },
        { from: '2026-11-01', to: '2026-11-02' },
        { from: '2026-11-03', to: '2026-11-04' },
        { from: '2026-11-10', to: '2026-11-15' },
        { from: '2026-11-12', to: '2026-11-13' },
      ]),
    ).toEqual([
      { from: '2026-11-01', to: '2026-11-04' },
      { from: '2026-11-10', to: '2026-11-15' },
    ]);
  });
});

describe('exportICS', () => {
  const text = exportICS({
    name: 'Harris · Roomboard',
    host: 'roomboard.pages.dev',
    ranges: [{ id: 'x-pod1-2026-11-03', from: '2026-11-03', to: '2026-11-07' }],
    now: new Date('2026-10-17T12:00:00Z'),
  });
  it('writes all-day events with an exclusive DTEND, CRLF line ends and only "Booked"', () => {
    expect(text).toContain('DTSTART;VALUE=DATE:20261103\r\nDTEND;VALUE=DATE:20261107\r\n');
    expect(text).toContain('SUMMARY:Booked');
    expect(text.split('\r\n').every(l => new TextEncoder().encode(l).length <= 75)).toBe(true);
    expect(text.endsWith('END:VCALENDAR\r\n')).toBe(true);
  });
  it('round-trips through the parser', () => {
    expect(parseICS(text)).toEqual([
      { uid: 'x-pod1-2026-11-03@roomboard.pages.dev', from: '2026-11-03', to: '2026-11-07' },
    ]);
  });
  it('folds long lines to 75 octets', () => {
    const t = exportICS({ name: 'A very long calendar name '.repeat(6), host: 'h', ranges: [] });
    expect(t).toMatch(/\r\n /);
    expect(t.split('\r\n').every(l => new TextEncoder().encode(l).length <= 75)).toBe(true);
    expect(t.replace(/\r\n /g, '')).toContain('A very long calendar name A very long');
  });
});

describe('edge function copy', () => {
  it('supabase/functions/_shared/ical.ts is the same file as src/data/ical.ts', () => {
    expect(fnCopy).toBe(srcCopy);
  });
});
