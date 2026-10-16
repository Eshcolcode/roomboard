// Cleaning board for the provider and cleaners: book a clean between a departure and the next arrival.
import { useState } from 'react';
import { data, useDB, me, propOf, roomOf, roomLabel, stayLabel, coBucket, CO_LABEL } from '../data';
import type { Changeover, CoStatus } from '../data';
import { addDays, diffDays, fmt, londonToday } from '../dates';
import { DateField } from './DateField';
import { BrushIcon, Icon } from './icons';
import { confirmDialog, toast } from './overlays';

const COLS: (CoStatus | 'later')[] = ['needs', 'scheduled', 'in_progress', 'ready', 'later'];
const TITLE: Record<CoStatus | 'later', string> = { ...CO_LABEL, later: 'Later' };
const HINT: Record<CoStatus | 'later', string> = {
  needs: 'Due within 7 days or before a booked arrival',
  scheduled: 'Booked with a cleaner',
  in_progress: '',
  ready: 'Ready for the next guest',
  later: 'No arrival booked and more than a week away',
};
const TIMES = Array.from(
  { length: 30 },
  (_, i) => `${String(7 + Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`,
);

export function Changeovers() {
  const db = useDB();
  const u = me();
  const T = londonToday();
  const recent = db.changeovers.filter(c => !(c.status === 'ready' && (c.readyBy ?? c.afterDate) < addDays(T, -2)));

  return (
    <div className="page">
      <div className="ph">
        <div>
          <h1>Cleaning</h1>
          <p>Each room gets a clean between the guest leaving and the next arrival.</p>
        </div>
        <div className="sp" />
        {u.role === 'manager' &&
          db.properties
            .filter(p => p.contracted)
            .map(p => (
              <div className="times" key={p.id}>
                <b>{p.short}</b>
                <label>
                  Checkout
                  <select
                    value={p.checkout ?? '10:00'}
                    onChange={e =>
                      data.updateProperty(p.id, { checkout: e.target.value, checkin: p.checkin ?? '15:00' })
                    }
                  >
                    {TIMES.map(t => (
                      <option key={t}>{t}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Check-in
                  <select
                    value={p.checkin ?? '15:00'}
                    onChange={e =>
                      data.updateProperty(p.id, { checkout: p.checkout ?? '10:00', checkin: e.target.value })
                    }
                  >
                    {TIMES.map(t => (
                      <option key={t}>{t}</option>
                    ))}
                  </select>
                </label>
              </div>
            ))}
        <button className="btn ghost" onClick={() => (location.hash = 'print-cleaning')}>
          <Icon name="print" size={14} /> Print cleaning list
        </button>
      </div>
      <div className="kanban k5">
        {COLS.map(k => {
          const list = recent
            .filter(c => {
              const b = coBucket(c, T);
              return b === k || (b === 'cancelled' && k === 'needs');
            })
            .sort((a, b) => (a.readyBy ?? a.afterDate).localeCompare(b.readyBy ?? b.afterDate));
          return (
            <section className={'col col-' + k} key={k} aria-label={TITLE[k]}>
              <h3>
                <span className={'co co-' + k} style={{ position: 'static' }}>
                  <BrushIcon />
                </span>
                {TITLE[k]}
                <em>{list.length}</em>
              </h3>
              {HINT[k] && <small className="colhint">{HINT[k]}</small>}
              {list.map(c => (
                <CoCard key={c.id} c={c} />
              ))}
              {!list.length && <p className="muted empty">{k === 'needs' ? 'All booked. Nice.' : 'Nothing here'}</p>}
            </section>
          );
        })}
      </div>
    </div>
  );
}

function CoCard({ c }: { c: Changeover }) {
  const db = useDB();
  const u = me();
  const T = londonToday();
  const k = c.status;
  const cleaners = db.users.filter(x => x.role === 'cleaner');
  const [date, setDate] = useState(c.afterDate < T ? T : c.afterDate);
  const [cl, setCl] = useState(c.cleanerId ?? cleaners[0]?.id ?? '');
  const [err, setErr] = useState('');
  const run = (p: Partial<Changeover>, msg?: string) =>
    data.updateChangeover(c.id, p).then(
      () => {
        setErr('');
        if (msg) toast(msg);
      },
      e => setErr((e as Error).message),
    );
  const slack = c.readyBy ? diffDays(T, c.readyBy) : null;
  const next = db.stays.find(x => x.id === c.toStayId);
  const from = db.stays.find(x => x.id === c.fromStayId);
  const canWork = u.role === 'manager' || (u.role === 'cleaner' && (!c.cleanerId || c.cleanerId === u.id));
  const p = propOf(roomOf(c.roomId).propertyId);
  const rl = roomLabel(c.roomId);

  const book = async () => {
    const outside = date < c.afterDate || (!!c.readyBy && date > c.readyBy);
    if (!outside)
      return run({ status: 'scheduled', scheduledFor: date, cleanerId: cl }, `Clean booked · ${rl} · ${fmt(date)}`);
    const ok = await confirmDialog({
      title: 'Book outside the usual window?',
      body: `${fmt(date)} is ${date < c.afterDate ? 'before the guest leaves' : 'after the next guest arrives'} (leaves ${fmt(c.afterDate)}${c.readyBy ? ', next arrival ' + fmt(c.readyBy) : ''}). It will stay flagged as an exception until the clean is done.`,
      ok: 'Book as exception',
    });
    if (ok)
      run(
        {
          status: 'scheduled',
          scheduledFor: date,
          cleanerId: cl,
          exception: `Clean on ${fmt(date)}, outside ${fmt(c.afterDate)} → ${c.readyBy ? fmt(c.readyBy) : 'no arrival'}`,
        },
        'Booked as an exception',
      );
  };

  return (
    <div
      className={
        'cc' + (slack !== null && slack <= 1 && k !== 'ready' ? ' urgent' : '') + (c.cancelled ? ' flagged' : '')
      }
      data-room={c.roomId}
    >
      <b>
        {rl}
        {c.zeroDay && (
          <span className="zchip" title="Next guest arrives the same day">
            Same-day turnaround
          </span>
        )}
      </b>
      <small>
        Guest leaves {fmt(c.afterDate)}
        {from?.depStatus === 'confirmed' ? ' (confirmed)' : ' (planned)'} ·{' '}
        {c.readyBy ? (
          <>
            needed by <strong>{fmt(c.readyBy)}</strong>
          </>
        ) : (
          'no arrival booked'
        )}
      </small>
      {next && (
        <small>Next: {u.role === 'cleaner' ? (next.workerId ? 'named guest' : 'room held') : stayLabel(next)}</small>
      )}
      {c.invalidated && <div className="inv">⚠ {c.invalidated}</div>}
      {c.cancelled && <div className="inv">⚠ {c.cancelled}</div>}
      {c.exception && <div className="inv exc">⚠ Outside usual window: {c.exception}</div>}
      {c.zeroDay && (
        <small className="zwin">
          Checkout {p.checkout ?? '10:00'} → check-in {p.checkin ?? '15:00'}
        </small>
      )}
      {c.note && <small className="note">{c.note}</small>}
      <div className="ca">
        {canWork &&
          k !== 'needs' &&
          !c.cancelled &&
          (T >= c.afterDate ? (
            <label className="vac">
              <input type="checkbox" checked={!!c.vacated} onChange={e => run({ vacated: e.target.checked })} /> Guest
              has left
            </label>
          ) : (
            <small className="muted">“Guest has left” can be ticked from {fmt(c.afterDate)}</small>
          ))}
        {c.cancelled && u.role === 'manager' ? (
          <button
            className="btn sm ghost"
            onClick={() => data.dismissChangeover(c.id).then(() => toast('Clean removed'))}
          >
            Not needed – remove
          </button>
        ) : k === 'needs' ? (
          u.role === 'manager' && (
            <>
              <DateField label="Clean date" value={date} onChange={v => v && setDate(v)} />
              <select aria-label="Cleaner" value={cl} onChange={e => setCl(e.target.value)}>
                {cleaners.map(x => (
                  <option key={x.id} value={x.id}>
                    {x.name.split(' ')[0]}
                  </option>
                ))}
              </select>
              <button className="btn sm" onClick={book}>
                Book clean
              </button>
            </>
          )
        ) : k === 'scheduled' ? (
          canWork && (
            <button
              className="btn sm"
              disabled={!c.vacated}
              title={c.vacated ? '' : 'Tick “Guest has left” first'}
              onClick={() => run({ status: 'in_progress' })}
            >
              Start clean
            </button>
          )
        ) : k === 'in_progress' ? (
          canWork && (
            <button className="btn sm" disabled={!c.vacated} onClick={() => run({ status: 'ready' }, `${rl} is ready`)}>
              Mark ready ✓
            </button>
          )
        ) : null}
        {c.cleanerId && u.role === 'manager' && k !== 'needs' && (
          <small className="muted">
            {db.users.find(x => x.id === c.cleanerId)?.name}
            {c.scheduledFor ? ' · ' + fmt(c.scheduledFor) : ''}
          </small>
        )}
      </div>
      {err && (
        <div className="err" role="alert">
          {err}
        </div>
      )}
    </div>
  );
}
