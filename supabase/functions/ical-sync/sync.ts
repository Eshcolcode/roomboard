// The ical-sync work, kept free of Deno and Supabase imports so the unit tests can run it with stand-ins
// (src/data/icalsync.test.ts). index.ts wires in the real database client, secrets and fetch.
import { feedLink, mergeRanges, parseICS } from '../_shared/ical.ts';

export interface FeedRow {
  id: string;
  env_key: string;
}
/** The one database call the sync makes (replace_ical_blocks in 0008). */
export type Rpc = (
  fn: 'replace_ical_blocks',
  args: { p_feed: string; p_ranges: { from: string; to: string }[] | null; p_error?: string },
) => Promise<{ data: unknown; error: { message: string } | null }>;
export interface SyncResult {
  ok: number;
  failed: number;
  notLinked: number;
  conflicts: number;
}

async function read(url: string, get: typeof fetch) {
  let r: Response;
  try {
    r = await get(url, {
      headers: { 'User-Agent': 'Roomboard calendar sync', Accept: 'text/calendar, text/plain' },
      signal: AbortSignal.timeout(20000),
    });
  } catch {
    throw new Error('Could not reach the calendar site'); // some fetch errors quote the URL: never pass them on
  }
  if (!r.ok) throw new Error(`The calendar site answered ${r.status}`);
  const text = await r.text();
  if (!/BEGIN:VCALENDAR/i.test(text)) throw new Error('The link did not return a calendar (.ics)');
  return text;
}

/** Read every feed whose secret is set; clear the ones that are not linked; never store or report a link. */
export async function syncAll(o: {
  feeds: FeedRow[];
  env: (k: string) => string | undefined;
  rpc: Rpc;
  fetch: typeof fetch;
  today: string; // London date
}): Promise<SyncResult> {
  const res: SyncResult = { ok: 0, failed: 0, notLinked: 0, conflicts: 0 };
  for (const f of o.feeds) {
    const url = feedLink(f.env_key, o.env);
    if (!url) {
      await o.rpc('replace_ical_blocks', { p_feed: f.id, p_ranges: null }); // "Calendar not linked yet"
      res.notLinked++;
      continue;
    }
    try {
      const ranges = mergeRanges(parseICS(await read(url, o.fetch))).filter(r => r.to > o.today);
      const { data, error } = await o.rpc('replace_ical_blocks', { p_feed: f.id, p_ranges: ranges });
      if (error) throw new Error('Could not save the dates');
      res.conflicts += (data as number) ?? 0;
      res.ok++;
    } catch (e) {
      res.failed++;
      // keep the previous blocks; record the reason (never the link)
      const msg = String((e as Error).message ?? e)
        .split(url)
        .join('[link]');
      await o.rpc('replace_ical_blocks', { p_feed: f.id, p_ranges: null, p_error: msg });
    }
  }
  return res;
}
