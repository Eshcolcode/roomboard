// The red dot: in-app alerts for important changes only (src/data/notify.ts), and the alert settings.
import { useEffect, useRef, useState } from 'react';
import { data, useDB, me } from '../data';
import { Icon } from './icons';

const when = (ts: string) =>
  new Date(ts).toLocaleString('en-GB', {
    timeZone: 'Europe/London',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

export function useMyNotices() {
  const db = useDB();
  const u = me();
  return (db.notices ?? []).filter(n => n.forUserId === u.id);
}

/** Header bell. Red badge = unread important changes. */
export function Bell() {
  const u = me();
  const mine = useMyNotices();
  const unread = mine.filter(n => !n.read);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const f = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    addEventListener('mousedown', f);
    return () => removeEventListener('mousedown', f);
  }, [open]);
  useEffect(() => setOpen(false), [u.id]);
  return (
    <div className="bell-wrap" ref={ref}>
      <button
        className={'bell' + (unread.length ? ' has' : '')}
        aria-label={unread.length ? `Alerts: ${unread.length} unread` : 'Alerts: none unread'}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <Icon name="bell" size={17} />
        {unread.length > 0 && (
          <em className="dot" data-testid="red-dot">
            {unread.length > 9 ? '9+' : unread.length}
          </em>
        )}
      </button>
      {open && (
        <div className="pop bell-pop" role="dialog" aria-label="Alerts">
          <div className="bp-head">
            <b>Alerts</b>
            {unread.length > 0 && (
              <button className="lnk" onClick={() => data.markRead(unread.map(n => n.id))}>
                Mark all read
              </button>
            )}
          </div>
          <small className="muted">
            {u.role === 'cleaner'
              ? 'Arrivals and departures that change your plan for the next 7 days.'
              : 'New bookings, cancellations and date changes. Smaller edits are in Activity.'}
          </small>
          <div className="bp-list">
            {mine.slice(0, 8).map(n => (
              <button
                key={n.id}
                className={'bp-item' + (n.read ? '' : ' unread')}
                onClick={() => !n.read && data.markRead([n.id])}
              >
                <span className="bp-txt">{n.text}</span>
                <span className="bp-meta">
                  {n.reasons.slice(0, 3).map(r => (
                    <span key={r} className="tier-chip imm">
                      {r}
                    </span>
                  ))}
                  <small>{when(n.ts)}</small>
                </span>
              </button>
            ))}
            {!mine.length && <p className="empty-state">Nothing important has changed.</p>}
          </div>
          {u.role !== 'cleaner' && (
            <a
              className="btn sm ghost"
              href="#activity"
              onClick={() => {
                setOpen(false);
              }}
            >
              All activity ›
            </a>
          )}
        </div>
      )}
    </div>
  );
}

/** Alert settings (Activity page). Eshcol also chooses whether the housekeeper is alerted. */
export function AlertSettings() {
  const db = useDB();
  const u = me();
  const hk = db.settings?.housekeeperAlerts !== false;
  return (
    <section className="card alert-set">
      <h3>Alerts</h3>
      <div className="tiers">
        <div className="tier imm">
          <b>Important · alert + email</b>
          <small>New bookings, cancellations, arrival or leaving date changes, an end date set</small>
        </div>
        <div className="tier min">
          <b>Minor · activity log only</b>
          <small>Names, phone numbers, notes, rota tweaks, swapping who stays on the same dates</small>
        </div>
      </div>
      <label className="cb">
        <input
          type="checkbox"
          checked={u.emailImmediate !== false}
          onChange={e => data.setPrefs(u.id, { emailImmediate: e.target.checked })}
        />{' '}
        Email me straight away about important changes {u.email ? `(${u.email})` : '(address to follow)'}
      </label>
      {u.role === 'manager' && (
        <label className="cb">
          <input
            type="checkbox"
            checked={!!u.minorDigest}
            onChange={e => data.setPrefs(u.id, { minorDigest: e.target.checked })}
          />{' '}
          A 6pm summary of minor changes, if there were any
        </label>
      )}
      {u.role === 'manager' && (
        <label className="cb">
          <input
            type="checkbox"
            checked={hk}
            onChange={e => data.setSettings({ housekeeperAlerts: e.target.checked })}
          />{' '}
          Alert the housekeeper when an arrival or departure in the next 7 days changes
        </label>
      )}
      <label className="cb">
        <input
          type="checkbox"
          checked={!!u.smsOptIn}
          onChange={e => data.setPrefs(u.id, { smsOptIn: e.target.checked })}
        />{' '}
        Also by text message {u.phone ? `(${u.phone})` : '(number to follow)'}
      </label>
      <small className="muted">
        {data.mode === 'demo'
          ? 'Demo: nothing is ever sent. Emails switch on with the live database.'
          : 'You are never alerted about your own changes.'}
      </small>
    </section>
  );
}
