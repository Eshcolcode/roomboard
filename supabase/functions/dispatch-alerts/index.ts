// Supabase Edge Function: sends queued alerts from alert_outbox with retry + exponential backoff.
// Secrets: RESEND_API_KEY, ALERT_FROM (e.g. "Roomboard <alerts@yourdomain>"), TWILIO_SID, TWILIO_TOKEN, TWILIO_FROM.
import { createClient } from 'npm:@supabase/supabase-js@2';
const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
async function email(to: string, subject: string, text: string) {
  const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${Deno.env.get('RESEND_API_KEY')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: Deno.env.get('ALERT_FROM'), to, subject, text }) });
  if (!r.ok) throw new Error(`resend ${r.status} ${await r.text()}`);
}
async function sms(to: string, text: string) {
  const sid = Deno.env.get('TWILIO_SID')!; const auth = btoa(`${sid}:${Deno.env.get('TWILIO_TOKEN')}`);
  const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, { method: 'POST', headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ To: to, From: Deno.env.get('TWILIO_FROM')!, Body: text.slice(0, 320) }) });
  if (!r.ok) throw new Error(`twilio ${r.status} ${await r.text()}`);
}
Deno.serve(async () => {
  const { data: rows } = await sb.from('alert_outbox').select('*').eq('status', 'queued').lte('next_attempt_at', new Date().toISOString()).limit(50);
  let sent = 0;
  for (const a of rows ?? []) {
    try {
      if (a.channel === 'email') await email(a.recipient, a.subject, a.body);
      else if (a.channel === 'sms') await sms(a.recipient, `${a.subject}: ${a.body}`);
      // 'push' rows are delivered live via Realtime in the app; mark sent.
      await sb.from('alert_outbox').update({ status: 'sent', attempts: a.attempts + 1 }).eq('id', a.id); sent++;
    } catch (e) {
      const attempts = a.attempts + 1; const backoffMin = Math.min(60, 2 ** attempts);
      await sb.from('alert_outbox').update({ attempts, last_error: String(e), status: attempts >= 6 ? 'failed' : 'queued', next_attempt_at: new Date(Date.now() + backoffMin * 60e3).toISOString() }).eq('id', a.id);
    }
  }
  return new Response(JSON.stringify({ sent, checked: rows?.length ?? 0 }), { headers: { 'Content-Type': 'application/json' } });
});
