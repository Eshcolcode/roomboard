// Supabase Edge Function: one secret .ics link per extra unit, for Airbnb / Booking.com to import, so dates
// booked in Roomboard are blocked there. Confirmed bookings only (not pending requests), as all-day "Booked"
// events with no guest details. GET /functions/v1/ical-export?t=<token from ical_exports>
// Not deployed yet. Deploy with: supabase functions deploy ical-export --no-verify-jwt (the token is the secret)
import { createClient } from 'npm:@supabase/supabase-js@2';
import { exportICS, mergeRanges } from '../_shared/ical.ts';

const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const addDays = (d: string, n: number) => new Date(Date.parse(d + 'T00:00Z') + n * 864e5).toISOString().slice(0, 10);

Deno.serve(async req => {
  const t = new URL(req.url).searchParams.get('t') ?? '';
  if (!/^[0-9a-f]{32,64}$/.test(t)) return new Response('Not found', { status: 404 });
  const { data: ex } = await sb.from('ical_exports').select('room_id').eq('token', t).maybeSingle();
  if (!ex) return new Response('Not found', { status: 404 });
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date());
  const [{ data: room }, { data: stays }] = await Promise.all([
    sb.from('rooms').select('property_id, properties(name)').eq('id', ex.room_id).single(),
    sb
      .from('stays')
      .select('arrival, departure')
      .eq('room_id', ex.room_id)
      .is('request', null)
      .or(`departure.is.null,departure.gt.${addDays(today, -30)}`),
  ]);
  // same rule as the app (src/data/extras.ts unitIcs): open-ended stays block a year
  const ranges = mergeRanges(
    (stays ?? []).map(s => ({ from: s.arrival, to: s.departure ?? addDays(s.arrival, 365) })),
  ).map(r => ({ ...r, id: `${ex.room_id}-${r.from}` }));
  const name = (room as { properties?: { name?: string } } | null)?.properties?.name ?? 'Roomboard';
  const body = exportICS({ name: `${name} · Roomboard`, host: 'roomboard.pages.dev', ranges, now: new Date() });
  return new Response(body, {
    headers: { 'Content-Type': 'text/calendar; charset=utf-8', 'Cache-Control': 'no-store' },
  });
});
