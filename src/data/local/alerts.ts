import { fmt } from '../../dates';
import { S, uid, iso, roomOf, roomLabel } from '../core';
import type { CoEvent, Role, User, Alert, Changeover } from '../core';
import { commit, log } from './store';

// ---- alert routing (mirrors enqueue_for() in 0002_rules.sql) ----
// One channel per user by default (email). SMS only if the user opted in; push only if enabled. Never alert the actor.
export function queueFor(u: User, subject: string, body: string) {
  if (u.id === S.db.currentUser) return;
  const chans: Alert['channel'][] = ['email'];
  if (u.smsOptIn) chans.push('sms');
  if (u.pushEnabled) chans.push('push');
  for (const ch of chans) {
    const addr = ch === 'sms' ? u.phone : ch === 'email' ? u.email : 'app';
    S.db.alerts = [
      {
        id: uid(),
        ts: iso(),
        channel: ch,
        toUserId: u.id,
        to: `${u.name} <${addr || 'no address yet'}>`,
        subject,
        body,
        status: addr ? ('queued' as const) : ('no_address' as const),
        attempts: 0,
        nextAttemptAt: Date.now() + 1500,
      },
      ...S.db.alerts,
    ].slice(0, 200);
  }
}
export const usersOf = (r: Role) => S.db.users.filter(u => u.role === r);
export const actorRole = () => S.db.users.find(u => u.id === S.db.currentUser)?.role;
/** stay changes: provider edits → client; client edits → provider */
export function alertStayChange(subject: string, body: string) {
  const a = actorRole();
  const to = a === 'client' ? usersOf('manager') : a === 'manager' ? usersOf('client') : [];
  to.forEach(u => queueFor(u, subject, body));
}
/** changeover events → cleaners (assigned one if set); invalidations/cancellations also → provider */
export function alertChangeover(c: Changeover, subject: string, body: string, alsoProvider = false) {
  const cl = c.cleanerId ? S.db.users.filter(u => u.id === c.cleanerId) : usersOf('cleaner');
  cl.forEach(u => queueFor(u, subject, body));
  if (alsoProvider) usersOf('manager').forEach(u => queueFor(u, subject, body));
}
export function handle(ev: CoEvent[]) {
  for (const e of ev) {
    const rl = roomLabel(e.roomId);
    const pid = roomOf(e.roomId).propertyId;
    if (e.kind === 'invalidated' && e.co) {
      log(`⚠ ${rl}: dates changed, the clean needs booking again`, pid);
      alertChangeover(e.co, `⚠ ${rl}: book the clean again`, e.text, true);
    }
    if (e.kind === 'cancelled' && e.co) {
      log(`⚠ ${rl}: departure removed after the clean was booked – check if still needed`, pid);
      alertChangeover(e.co, `⚠ ${rl}: clean may not be needed`, e.text, true);
    }
    if (e.kind === 'moved' && e.co) {
      log(`${rl} clean: ${e.text}`, pid);
      if (e.co.status !== 'needs') alertChangeover(e.co, `${rl}: needed-by date moved`, e.text);
    }
    if (e.kind === 'continues') log(`${rl}: same worker continues, no clean needed`, pid);
    if (e.kind === 'created' && e.co?.zeroDay)
      log(`⚠ ${rl}: same-day changeover (departure and arrival ${fmt(e.co.afterDate)})`, pid);
  }
}

// Simulated alert outbox with retry/backoff — mirrors the Supabase dispatcher.
export function tick() {
  let changed = false;
  const now = Date.now();
  for (const a of S.db.alerts)
    if (a.status === 'queued' && a.nextAttemptAt <= now) {
      a.attempts++;
      changed = true;
      const fail = a.channel === 'sms' && a.attempts === 1 && Math.random() < 0.35; // demo a transient SMS failure
      if (fail) {
        a.nextAttemptAt = now + 4000 * a.attempts;
      } else a.status = 'simulated'; // demo: nothing is actually sent
      if (a.attempts >= 5 && a.status === 'queued') a.status = 'failed';
    }
  if (changed) commit();
}
