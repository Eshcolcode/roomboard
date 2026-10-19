import { fmt, londonToday } from '../../dates';
import { S, uid, iso, roomOf, roomLabel, isExtra, ROLE_LABEL } from '../core';
import type { CoEvent, Role, User, Alert, Changeover, Stay, Activity, Tier } from '../core';
import { classify, classifyAll, diffStays, touchesWindow } from '../notify';
import type { Change } from '../notify';
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
        to: `${ROLE_LABEL[u.role]} <${addr || 'no address yet'}>`,
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
/** In-app alert (red dot) for one person, plus an email in the outbox unless they turned that off. Never the actor. */
export function alertUser(u: User, subject: string, text: string, reasons: string[], propertyId?: string) {
  if (u.id === S.db.currentUser) return;
  S.db.notices = [
    { id: uid(), ts: iso(), forUserId: u.id, text, reasons, propertyId, read: false },
    ...(S.db.notices ?? []),
  ].slice(0, 200);
  if (u.emailImmediate !== false) queueFor(u, subject, text);
}
/**
 * After a stay command: tag the log entry with its tier and alert the right people (src/data/notify.ts).
 * Minor changes stay in the log only. Important ones: RJ McLeod's changes → Eshcol; Eshcol's → RJ McLeod (never
 * Eshcol's own extra-property guests); and the housekeeper when it touches Eshcol / Loch Roag in the next 7 days.
 */
export function notifyStays(before: Stay[], entry: Activity, subject: string): Tier {
  const changes = diffStays(before, S.db.stays);
  const ex = (ch: Change) => isExtra(roomOf((ch.after ?? ch.before)!.roomId).propertyId);
  const c = classifyAll(changes, roomId => isExtra(roomOf(roomId).propertyId));
  entry.tier = changes.length ? c.tier : 'minor';
  if (c.reasons.length) entry.reasons = c.reasons;
  if (entry.tier !== 'immediate') return entry.tier;
  const imm = changes.filter(ch => classify(ch, ex(ch)).tier === 'immediate');
  const priv = (ch: Change) => {
    const s = (ch.after ?? ch.before) as Stay;
    return ex(ch) && S.db.users.find(u => u.id === s.bookedBy)?.role !== 'client';
  };
  const actor = actorRole();
  const to =
    actor === 'client' ? usersOf('manager') : actor === 'manager' && imm.some(ch => !priv(ch)) ? usersOf('client') : [];
  for (const u of to) alertUser(u, subject, entry.text, c.reasons, entry.propertyId);
  if (S.db.settings?.housekeeperAlerts !== false) {
    const T = londonToday();
    if (imm.some(ch => !ex(ch) && touchesWindow(ch, T)))
      usersOf('cleaner').forEach(u =>
        alertUser(u, `Cleaning plan · ${subject}`, entry.text, ['in the next 7 days', ...c.reasons], entry.propertyId),
      );
  }
  return entry.tier;
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
      log(`⚠ ${rl}: dates changed, the clean needs booking again`, pid, false, 'cleaning');
      alertChangeover(e.co, `⚠ ${rl}: book the clean again`, e.text, true);
    }
    if (e.kind === 'cancelled' && e.co) {
      log(`⚠ ${rl}: departure removed after the clean was booked – check if still needed`, pid, false, 'cleaning');
      alertChangeover(e.co, `⚠ ${rl}: clean may not be needed`, e.text, true);
    }
    if (e.kind === 'moved' && e.co) {
      log(`${rl} clean: ${e.text}`, pid, false, 'cleaning');
      if (e.co.status !== 'needs') alertChangeover(e.co, `${rl}: needed-by date moved`, e.text);
    }
    if (e.kind === 'continues') log(`${rl}: same worker continues, no clean needed`, pid, false, 'cleaning');
    if (e.kind === 'created' && e.co?.zeroDay)
      log(`⚠ ${rl}: same-day changeover (departure and arrival ${fmt(e.co.afterDate)})`, pid, false, 'cleaning');
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
