// Today's movements and the next 10 days, for everyone (cleaners see first names only).
import { useState } from 'react';
import { useDB, getDB, me, propOf, roomOf, roomLabel, stayLabel, readinessFor, isAway } from '../data';
import type { Changeover, Stay } from '../data';
import { addDays, diffDays, fmt, londonToday } from '../dates';
import { BrushIcon, Icon } from './icons';
import { leaving } from './Rooms';
import type { PanelInit } from './StayPanel';

export function movements(d: string) {
  const db = getDB();
  const vis = db.stays.filter(s => propOf(roomOf(s.roomId).propertyId).contracted);
  return {
    dep: vis.filter(s => s.departure === d && s.depStatus !== 'tbc' && s.depStatus !== 'ufn'),
    arr: vis.filter(s => s.arrival === d),
    stay: vis.filter(s => s.arrival < d && (s.departure ?? '9') > d),
    cos: db.changeovers.filter(c => !c.cancelled && (c.scheduledFor === d || (c.afterDate === d && !c.scheduledFor))),
  };
}

export function TodayList({ onOpen }: { onOpen: (p: PanelInit) => void }) {
  useDB();
  const u = me();
  const T = londonToday();
  const [view, setView] = useState<'today' | 'upcoming'>('today');
  const nm = (s: Stay) => (u.role === 'cleaner' ? stayLabel(s).split(' ')[0] : stayLabel(s));
  const canEdit = u.role !== 'cleaner';
  const t = movements(T);

  const Item = ({ s, tag, sub }: { s: Stay; tag: string; sub: string }) => (
    <div
      className={'li' + (canEdit ? ' click' : '')}
      role={canEdit ? 'button' : undefined}
      tabIndex={canEdit ? 0 : undefined}
      onClick={() => canEdit && onOpen({ stay: s })}
      onKeyDown={e => canEdit && e.key === 'Enter' && onOpen({ stay: s })}
    >
      <span className={'tag t-' + tag.split(' ')[0].toLowerCase()}>{tag}</span>
      <div>
        <b>
          {roomLabel(s.roomId)} · {nm(s)}
        </b>
        <small>{sub}</small>
      </div>
    </div>
  );

  return (
    <div className="page narrow">
      <div className="ph">
        <div>
          <h1>{view === 'today' ? 'Today' : 'Next 10 days'}</h1>
          <p>{fmt(T, { weekday: 'long', day: 'numeric', month: 'long' })}</p>
        </div>
        <div className="sp" />
        <div className="seg">
          <button className={view === 'today' ? 'on' : ''} onClick={() => setView('today')}>
            Today
          </button>
          <button className={view === 'upcoming' ? 'on' : ''} onClick={() => setView('upcoming')}>
            Upcoming
          </button>
        </div>
        <button className="btn ghost" onClick={() => (location.hash = 'print-today')}>
          <Icon name="print" size={14} /> Print
        </button>
      </div>
      {view === 'today' ? (
        <>
          <div className="stats">
            <div>
              <b>{t.dep.length}</b>Leaving
            </div>
            <div>
              <b>{t.arr.length}</b>Arriving
            </div>
            <div>
              <b>{t.stay.length}</b>Staying on
            </div>
            <div>
              <b>{t.cos.length}</b>Cleans
            </div>
          </div>
          <section className="card">
            <h3>Leaving today</h3>
            {t.dep.length ? (
              t.dep.map(s => (
                <Item
                  key={s.id}
                  s={s}
                  tag={s.depStatus === 'confirmed' ? 'Leaves' : 'Planned'}
                  sub={
                    s.depStatus === 'confirmed'
                      ? 'Departure confirmed'
                      : 'Not confirmed yet – check before stripping the room'
                  }
                />
              ))
            ) : (
              <p className="empty-state">Nobody is leaving today.</p>
            )}
          </section>
          <section className="card">
            <h3>Cleans</h3>
            {t.cos.length ? (
              t.cos.map(c => <CoRow key={c.id} c={c} />)
            ) : (
              <p className="empty-state">No cleans today. Enjoy the quiet.</p>
            )}
          </section>
          <section className="card">
            <h3>Arriving today</h3>
            {t.arr.length ? (
              t.arr.map(s => <Item key={s.id} s={s} tag={s.workerId ? 'Arrives' : 'Hold'} sub={leaving(s)} />)
            ) : (
              <p className="empty-state">No arrivals today.</p>
            )}
          </section>
          <section className="card">
            <h3>Staying on</h3>
            {t.stay.length ? (
              t.stay.map(s => (
                <Item
                  key={s.id}
                  s={s}
                  tag={isAway(s, T) ? 'Away' : isAway(s, addDays(T, -1)) ? 'Back' : 'In'}
                  sub={`Night ${diffDays(s.arrival, T) + 1} · ${
                    isAway(s, T)
                      ? u.role === 'client'
                        ? 'away, room kept · '
                        : 'away, good day to clean · '
                      : isAway(s, addDays(T, -1))
                        ? 'back today · '
                        : ''
                  }${leaving(s)}`}
                />
              ))
            ) : (
              <p className="empty-state">Nobody else in house.</p>
            )}
          </section>
        </>
      ) : (
        <>
          {Array.from({ length: 10 }, (_, i) => addDays(T, i + 1)).map(d => {
            const x = movements(d);
            if (!x.dep.length && !x.arr.length && !x.cos.length) return null;
            return (
              <section className="card" key={d}>
                <h3>{fmt(d, { weekday: 'long', day: 'numeric', month: 'short' })}</h3>
                {x.dep.map(s => (
                  <Item
                    key={s.id}
                    s={s}
                    tag={s.depStatus === 'confirmed' ? 'Leaves' : 'Planned'}
                    sub={s.depStatus === 'confirmed' ? 'Departure confirmed' : 'Departure planned'}
                  />
                ))}
                {x.cos.map(c => (
                  <CoRow key={c.id} c={c} />
                ))}
                {x.arr.map(s => (
                  <Item
                    key={s.id}
                    s={s}
                    tag={s.workerId ? 'Arrives' : 'Hold'}
                    sub={(s.workerId ? '' : 'Name to follow · ') + leaving(s)}
                  />
                ))}
              </section>
            );
          })}
          <p className="empty-state small">Quiet days are hidden.</p>
        </>
      )}
    </div>
  );
}

export function CoRow({ c }: { c: Changeover }) {
  const client = me().role === 'client';
  const r = readinessFor(c);
  const status = client ? r.client : r.provider;
  return (
    <div className="li">
      <span className={'co co-' + c.status} style={{ position: 'static' }}>
        <BrushIcon />
      </span>
      <div>
        <b>
          {roomLabel(c.roomId)} clean
          {c.zeroDay && <span className="zchip">Same day</span>}
          {!client && c.exception && <span className="zchip exc">Outside usual window</span>}
          {!client && c.invalidated && <span className="zchip exc">Book again</span>}
        </b>
        <small>
          Guest leaves {fmt(c.afterDate)} · {c.readyBy ? 'next arrival ' + fmt(c.readyBy) : 'no arrival booked yet'}
          {status ? ' · ' + status : ''}
        </small>
      </div>
    </div>
  );
}
