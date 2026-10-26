// Who changed what, the tiers (important / minor), alert settings and the email outbox.
// Eshcol sees everything with who did it. RJ McLeod sees only their own rooms and bookings, with people shown by role,
// and never cleaning, rates, calendar sync or settings (visibleActivity in src/data/notify.ts).
import { useState } from 'react';
import { data, useDB, me, digest } from '../data';
import { actorName, visibleActivity } from '../data/notify';
import { AlertSettings } from './Alerts';
import { friendlyDates } from '../dates';

type Filter = 'all' | 'immediate' | 'minor';

export function ActivityView() {
  const db = useDB();
  const viewer = me();
  const [f, setF] = useState<Filter>('all');
  const owner = viewer.role === 'manager';
  const all = visibleActivity(db, viewer);
  const log = all.filter(a => f === 'all' || (f === 'immediate' ? a.tier === 'immediate' : a.tier !== 'immediate'));
  const alerts = owner ? db.alerts : db.alerts.filter(a => a.toUserId === viewer.id);
  const initials = (n: string) =>
    n
      .split(' ')
      .map(x => x[0])
      .join('')
      .slice(0, 2);

  return (
    <div className="page">
      <div className="ph">
        <div>
          <h1>Activity</h1>
          <p>{owner ? 'Every change, who made it and when.' : 'Changes to your rooms and bookings.'}</p>
        </div>
      </div>
      <div className="grid2">
        <section className="card act-card">
          <div className="act-head">
            <h3>Activity log</h3>
            <div className="seg sm" role="group" aria-label="Show">
              {(
                [
                  ['all', 'All'],
                  ['immediate', 'Important'],
                  ['minor', 'Minor'],
                ] as [Filter, string][]
              ).map(([k, l]) => (
                <button key={k} className={f === k ? 'on' : ''} aria-pressed={f === k} onClick={() => setF(k)}>
                  {l}
                </button>
              ))}
            </div>
          </div>
          {log.map(a => {
            const who = actorName(db, a.userId, viewer);
            return (
              <div className={'act' + (a.tier === 'immediate' ? ' imm' : '')} key={a.id} data-kind={a.kind}>
                <div className="avt sm">{initials(who)}</div>
                <div>
                  <b>{who}</b> {friendlyDates(a.text)}
                  <span className="act-meta">
                    {a.tier === 'immediate' && (
                      <span className="tier-chip imm" title="Alert and email">
                        Important{a.reasons?.length ? ' · ' + a.reasons.join(', ') : ''}
                      </span>
                    )}
                    <small>
                      {new Date(a.ts).toLocaleString('en-GB', {
                        timeZone: 'Europe/London',
                        weekday: 'short',
                        day: 'numeric',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </small>
                  </span>
                </div>
              </div>
            );
          })}
          {!log.length && <p className="empty-state">Nothing here yet.</p>}
        </section>
        <div>
          <AlertSettings />
          <section className="card">
            <h3>Morning email (07:00)</h3>
            <pre className="digest">{digest(viewer.role)}</pre>
          </section>
          <section className="card">
            <h3>{owner ? 'Email outbox' : 'Emails to you'}</h3>
            {data.mode === 'demo' && (
              <small className="muted">Demo: nothing is sent. Only important changes are queued.</small>
            )}
            {alerts.slice(0, 14).map(a => (
              <div className="al" key={a.id}>
                <span className={'tag t-' + a.status}>
                  {a.status === 'no_address' ? 'no address' : a.status === 'simulated' ? 'not sent (demo)' : a.status}
                  {a.attempts > 1 ? ` · try ${a.attempts}` : ''}
                </span>
                <span className="ch">{a.channel === 'sms' ? 'text' : a.channel === 'push' ? 'app' : 'email'}</span>
                <div>
                  <b>{a.subject}</b>
                  <small>{owner ? a.to : 'To you'}</small>
                </div>
              </div>
            ))}
            {!alerts.length && <p className="empty-state">No emails yet.</p>}
          </section>
        </div>
      </div>
    </div>
  );
}
