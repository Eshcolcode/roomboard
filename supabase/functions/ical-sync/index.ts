// Supabase Edge Function: reads each extra unit's booking calendar and replaces its blocked dates.
// - The calendar links are secrets. They are never stored in the database or the repo: each ical_feeds row names
//   an Edge Function secret (env_key, e.g. ICAL_MONADH), set with `supabase secrets set ICAL_MONADH=<link>`.
// - No secret set yet = "Calendar not linked yet": the feed blocks nothing and it is not an error.
// - Dates only: guest names, emails and notes in the feed are read past and never stored (see _shared/ical.ts).
// Runs every 3 hours (pg_cron, 0008) and on "Read calendars now" in the app (manager only). The work is in sync.ts.
// Not deployed yet. Deploy: supabase functions deploy ical-sync
import { createClient } from 'npm:@supabase/supabase-js@2';
import { syncAll, type Rpc } from './sync.ts';

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

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (!(await allowed(req))) return new Response('Forbidden', { status: 403, headers: cors });
  const { data: feeds, error } = await sb.from('ical_feeds').select('id, env_key');
  if (error) return new Response('Could not read the feed list', { status: 500, headers: cors });
  const result = await syncAll({
    feeds: feeds ?? [],
    env: k => Deno.env.get(k),
    rpc: (async (fn: string, args: Record<string, unknown>) => await sb.rpc(fn, args)) as unknown as Rpc,
    fetch,
    today: new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date()),
  });
  return new Response(JSON.stringify(result), { headers: { ...cors, 'Content-Type': 'application/json' } });
});
