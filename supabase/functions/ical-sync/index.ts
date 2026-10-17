// Supabase Edge Function: reads every calendar link in ical_feeds (Airbnb, Booking.com, freetobook …) and
// replaces that feed's blocked dates. Dates only: guest names, emails and notes in the feed are never stored.
// Called every 30 minutes by pg_cron (0008) and by "Read calendars now" in the app (manager only).
// Not deployed yet. Deploy: supabase functions deploy ical-sync
import { createClient } from 'npm:@supabase/supabase-js@2';
import { mergeRanges, parseICS } from '../_shared/ical.ts';

const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
};

async function allowed(req: Request) {
  const auth = req.headers.get('Authorization') ?? '';
  if (auth === `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`) return true; // cron
  const { data } = await sb.auth.getUser(auth.replace(/^Bearer /, ''));
  if (!data.user) return false;
  const { data: p } = await sb.from('profiles').select('role').eq('id', data.user.id).single();
  return p?.role === 'manager';
}

async function read(url: string) {
  const r = await fetch(url.replace(/^webcal:/i, 'https:'), {
    headers: { 'User-Agent': 'Roomboard calendar sync', Accept: 'text/calendar, text/plain' },
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) throw new Error(`The calendar site answered ${r.status}`);
  const text = await r.text();
  if (!/BEGIN:VCALENDAR/i.test(text)) throw new Error('That link did not return a calendar (.ics)');
  return text;
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (!(await allowed(req))) return new Response('Forbidden', { status: 403, headers: cors });
  const { data: feeds, error } = await sb.from('ical_feeds').select('id, url');
  if (error) return new Response(error.message, { status: 500, headers: cors });
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date());
  let conflicts = 0,
    ok = 0,
    failed = 0;
  for (const f of feeds ?? []) {
    try {
      const ranges = mergeRanges(parseICS(await read(f.url))).filter(r => r.to > today);
      const { data, error: e } = await sb.rpc('replace_ical_blocks', { p_feed: f.id, p_ranges: ranges });
      if (e) throw new Error(e.message);
      conflicts += (data as number) ?? 0;
      ok++;
    } catch (e) {
      failed++;
      // keep the previous blocks; show the error next to the link in the app
      await sb.rpc('replace_ical_blocks', { p_feed: f.id, p_ranges: null, p_error: String((e as Error).message ?? e) });
    }
  }
  return new Response(JSON.stringify({ ok, failed, conflicts }), {
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
});
