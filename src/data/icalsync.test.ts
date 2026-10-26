// The ical-sync edge function's work (supabase/functions/ical-sync/sync.ts) run with stand-ins for the database,
// the secrets and the network: linked feeds are read, unlinked ones are cleared quietly, errors never hold a link.
import { describe, expect, it } from 'vitest';
import MONADH from './local/monadh-sample.ics?raw';
import { syncAll } from '../../supabase/functions/ical-sync/sync.ts';

const LINK = 'https://calendar.example/secret-token-123/ical.ics';
const feeds = [
  { id: 'f-harris', env_key: 'ICAL_HARRIS' },
  { id: 'f-uig', env_key: 'ICAL_UIG' },
  { id: 'f-abhainn', env_key: 'ICAL_ABHAINN' },
  { id: 'f-monadh', env_key: 'ICAL_MONADH' },
];
function run(env: Record<string, string>, answer: (url: string) => Promise<Response>) {
  const calls: { p_feed: string; p_ranges: unknown; p_error?: string }[] = [];
  const fetched: string[] = [];
  return syncAll({
    feeds,
    env: k => env[k],
    rpc: async (_fn, args) => {
      calls.push(args);
      return { data: 0, error: null };
    },
    fetch: (async (u: string) => {
      fetched.push(u);
      return answer(u);
    }) as unknown as typeof fetch,
    today: '2026-10-18',
  }).then(res => ({ res, calls, fetched }));
}

describe('ical-sync', () => {
  it('only Monadh linked: reads it (dates only, from today), marks the others "not linked yet"', async () => {
    const { res, calls, fetched } = await run({ ICAL_MONADH: LINK }, async () => new Response(MONADH));
    expect(res).toEqual({ ok: 1, failed: 0, notLinked: 3, conflicts: 0 });
    expect(fetched).toEqual([LINK]);
    expect(calls.filter(c => c.p_ranges === null && !c.p_error).map(c => c.p_feed)).toEqual([
      'f-harris',
      'f-uig',
      'f-abhainn',
    ]);
    const mo = calls.find(c => c.p_feed === 'f-monadh')!;
    expect(mo.p_ranges).toEqual([
      { from: '2026-11-16', to: '2026-11-19' },
      { from: '2026-12-20', to: '2027-01-04' },
    ]);
    expect(JSON.stringify(calls)).not.toMatch(/Guest|Booking|01632|example\.invalid|secret-token/);
  });
  it('no feeds linked at all: nothing is fetched and nothing fails', async () => {
    const { res, fetched } = await run({}, async () => new Response(''));
    expect(res).toEqual({ ok: 0, failed: 0, notLinked: 4, conflicts: 0 });
    expect(fetched).toEqual([]);
  });
  it('a failed read keeps the old dates and records a reason that never contains the link', async () => {
    for (const answer of [
      async () => new Response('nope', { status: 404 }),
      async () => new Response('<html>login</html>'),
      async (u: string) => {
        throw new TypeError(`error sending request for url (${u})`);
      },
    ]) {
      const { res, calls } = await run({ ICAL_MONADH: LINK }, answer);
      expect(res.failed).toBe(1);
      const c = calls.find(x => x.p_feed === 'f-monadh')!;
      expect(c.p_ranges).toBeNull();
      expect(c.p_error).toBeTruthy();
      expect(c.p_error).not.toContain('secret-token');
    }
  });
});
