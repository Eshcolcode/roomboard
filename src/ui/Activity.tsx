// Who changed what, the morning digest, alert preferences and the outbox.
import { useState } from 'react';
import { data, useDB, me, digest } from '../data';
import type { Role } from '../data';

const ROLE_NAME: Record<Role, string> = { client: 'Client', manager: 'Provider', cleaner: 'Cleaner' };

export function ActivityView() {
  const db = useDB();
  const viewer = me();
  const [role, setRole] = useState<Role>(viewer.role);
  const name = (id: string) => {
    const x = db.users.find(u => u.id === id);
    return x?.role === 'cleaner' && viewer.role === 'client' ? 'Housekeeping' : (x?.name ?? 'Someone');
  };
  const roles: Role[] = viewer.role === 'manager' ? ['client', 'manager', 'cleaner'] : [viewer.role];
  const alerts = viewer.role === 'manager' ? db.alerts : db.alerts.filter(a => a.toUserId === viewer.id);

  return (
    <div className="page">
      <div className="ph">
        <div>
          <h1>Activity</h1>
          <p>Every change, who made it and when.</p>
        </div>
      </div>
      <div className="grid2">
        <section className="card">
          <h3>Activity log</h3>
          {db.activity.map(a => (
            <div className="act" key={a.id}>
              <div className="avt sm">
                {name(a.userId)
                  .split(' ')
                  .map(x => x[0])
                  .join('')}
              </div>
              <div>
                <b>{name(a.userId)}</b> {a.text}
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
              </div>
            </div>
          ))}
          {!db.activity.length && <p className="empty-state">Nothing has changed yet.</p>}
        </section>
        <div>
          <section className="card">
            <h3>
              Morning email (07:00)
              {roles.length > 1 && (
                <div className="seg sm" style={{ float: 'right' }}>
                  {roles.map(r => (
                    <button key={r} className={role === r ? 'on' : ''} onClick={() => setRole(r)}>
                      {ROLE_NAME[r]}
                    </button>
                  ))}
                </div>
              )}
            </h3>
            <pre className="digest">{digest(role)}</pre>
          </section>
          <section className="card">
            <h3>My alerts</h3>
            <small className="muted">Email is on by default. You’re never alerted about your own changes.</small>
            <label className="cb">
              <input type="checkbox" checked disabled /> Email{' '}
              {viewer.email ? `(${viewer.email})` : '(address to follow)'}
            </label>
            <label className="cb">
              <input
                type="checkbox"
                checked={!!viewer.smsOptIn}
                onChange={e => data.setPrefs(viewer.id, { smsOptIn: e.target.checked })}
              />{' '}
              Text message {viewer.phone ? `(${viewer.phone})` : '(number to follow)'}
            </label>
            <label className="cb">
              <input
                type="checkbox"
                checked={!!viewer.pushEnabled}
                onChange={e => data.setPrefs(viewer.id, { pushEnabled: e.target.checked })}
              />{' '}
              In-app notifications
            </label>
          </section>
          <section className="card">
            <h3>Alerts {viewer.role === 'manager' ? 'outbox' : 'to you'}</h3>
            {data.mode === 'demo' && <small className="muted">Demo: alerts are simulated, nothing is sent.</small>}
            {alerts.slice(0, 14).map(a => (
              <div className="al" key={a.id}>
                <span className={'tag t-' + a.status}>
                  {a.status === 'no_address' ? 'no address' : a.status}
                  {a.attempts > 1 ? ` · try ${a.attempts}` : ''}
                </span>
                <span className="ch">{a.channel === 'sms' ? 'text' : a.channel === 'push' ? 'app' : 'email'}</span>
                <div>
                  <b>{a.subject}</b>
                  <small>{viewer.role === 'manager' ? a.to : 'To you'}</small>
                </div>
              </div>
            ))}
            {!alerts.length && <p className="empty-state">No alerts yet.</p>}
          </section>
        </div>
      </div>
    </div>
  );
}
