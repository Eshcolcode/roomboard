// Simple mode (MOCKUP): calm, phone-first front door. #simple, #simple/book, #simple/arrivals,
// #simple/cleaning, #simple/stay/<id>. Uses the same data layer as the full app, so holds really save.
import { useEffect, useRef, useState } from 'react';
import { data, useDB, me, stayLabel, readinessFor, roomLabel } from '../data';
import type { Stay } from '../data';
import { addDays, fmt, londonToday } from '../dates';
import { Book } from './Book';
import { Change } from './Change';
import { Box, Chip } from './parts';
import { dayRows } from './logic';
import type { DayRow } from './logic';
import './simple.css';

type ToastT = { id: number; text: string; steps: number };

export function Simple({ path }: { path: string }) {
  const db = useDB();
  const u = me();
  const [toast, setToast] = useState<ToastT | null>(null);
  const tid = useRef(0);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(x => (x?.id === toast.id ? null : x)), 8000);
    return () => clearTimeout(t);
  }, [toast]);
  const notify = (text: string, steps = 0) => setToast({ id: ++tid.current, text, steps });
  const go = (p: string) => (location.hash = p ? 'simple/' + p : 'simple');
  const home = () => go('');
  const [view, arg] = path.split('/');

  return (
    <div className="s-app">
      <header className="s-top">
        <button className="s-brand" onClick={home} aria-label="Simple mode home">
          <span className="mark">LR</span>
          <b>Roomboard</b>
        </button>
        <span className="s-mock" title="This is a design mockup on a test link. Data stays in this browser.">
          Mockup
        </span>
        <div className="sp" />
        {data.mode === 'demo' && (
          <select
            className="s-who"
            aria-label="Demo: switch person"
            value={u.id}
            onChange={e => data.setUser(e.target.value)}
          >
            {db.users.map(x => (
              <option key={x.id} value={x.id}>
                {x.role === 'client' ? 'Sheena' : x.role === 'manager' ? x.name.split(' ')[0] : 'Cleaner'}
              </option>
            ))}
          </select>
        )}
      </header>
      <main className="s-main">
        {view === 'book' && u.role !== 'cleaner' ? (
          <Book key={u.id} onExit={home} notify={notify} />
        ) : view === 'stay' && arg ? (
          <Change key={arg + u.id} id={arg} onHome={home} notify={notify} />
        ) : view === 'arrivals' ? (
          <Arrivals onBack={home} />
        ) : view === 'cleaning' ? (
          <Cleaning onBack={home} />
        ) : (
          <Home go={go} />
        )}
      </main>
      <div className="s-toasts" role="status" aria-live="polite">
        {toast && (
          <div className="s-toast" key={toast.id}>
            <span>{toast.text}</span>
            {toast.steps > 0 && (
              <button
                onClick={async () => {
                  const n = toast.steps;
                  setToast(null);
                  for (let i = 0; i < n; i++) if (data.canUndo()) await data.undo();
                  notify('Undone');
                }}
              >
                Undo
              </button>
            )}
            <i className="s-timer" aria-hidden />
          </div>
        )}
      </div>
    </div>
  );
}

const open = (s: Stay) => (location.hash = 'simple/stay/' + s.id);

function Row({ r }: { r: DayRow }) {
  const s = r.stays[0];
  const many = r.stays.length > 1;
  return (
    <button className={'s-row ' + r.kind} onClick={() => open(s)}>
      <span className="s-badge">{r.kind === 'arrive' ? 'Arriving' : 'Leaving'}</span>
      <span className="s-rowtxt">
        <b>{many ? `Crew · ${r.stays.length} people` : stayLabel(s)}</b>
        <small>
          {many
            ? [...new Set(r.stays.map(x => roomLabel(x.roomId).split(' ')[0]))].join(' + ') +
              ` · ${r.stays.length} rooms`
            : roomLabel(s.roomId)}
        </small>
      </span>
      <i aria-hidden>›</i>
    </button>
  );
}

function Home({ go }: { go: (p: string) => void }) {
  const db = useDB();
  const u = me();
  const T = londonToday();
  const [q, setQ] = useState('');
  const arrivingToday = dayRows(db, T)
    .filter(r => r.kind === 'arrive')
    .reduce((n, r) => n + r.stays.length, 0);
  const toClean = db.changeovers.filter(
    c => c.status !== 'ready' && !c.cancelled && (c.readyBy ?? c.afterDate) <= addDays(T, 7),
  ).length;
  const hour = Number(new Date().toLocaleTimeString('en-GB', { timeZone: 'Europe/London', hour: '2-digit' }));
  const hello = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const t = q.trim().toLowerCase();
  const contracted = new Set(db.properties.filter(p => p.contracted).map(p => p.id));
  const found = t
    ? db.stays
        .filter(s => contracted.has(db.rooms.find(r => r.id === s.roomId)!.propertyId))
        .filter(s => (s.departure ?? '9') >= T)
        .filter(s => (stayLabel(s) + ' ' + roomLabel(s.roomId)).toLowerCase().includes(t))
        .sort((a, b) => a.arrival.localeCompare(b.arrival))
        .slice(0, 6)
    : [];
  const days = Array.from({ length: 8 }, (_, i) => addDays(T, i));
  const cleaner = u.role === 'cleaner';
  return (
    <div className="s-home">
      <div className="s-hello">
        <h1>
          {hello}, {u.name.split(' ')[0]}
        </h1>
        <p>{fmt(T, { weekday: 'long', day: 'numeric', month: 'long' })}</p>
      </div>
      <div className="s-big3">
        {!cleaner && (
          <button className="s-huge mint" onClick={() => go('book')}>
            <span className="s-ico" aria-hidden>
              +
            </span>
            <b>Book a room</b>
            <small>About 4 taps</small>
          </button>
        )}
        {!cleaner && (
          <button className="s-huge" onClick={() => go('arrivals')}>
            <span className="s-ico" aria-hidden>
              →
            </span>
            <b>Who’s arriving today</b>
            <small>{arrivingToday ? `${arrivingToday} arriving` : 'Nobody today'}</small>
          </button>
        )}
        <button className="s-huge" onClick={() => go('cleaning')}>
          <span className="s-ico" aria-hidden>
            ✦
          </span>
          <b>What needs cleaning</b>
          <small>{toClean ? `${toClean} in the next 7 days` : 'All clear'}</small>
        </button>
      </div>
      {!cleaner && (
        <div className="s-find">
          <input
            className="s-input"
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Find a booking: name or room"
            aria-label="Find a booking"
          />
          {found.map(s => (
            <button key={s.id} className="s-row" onClick={() => open(s)}>
              <span className="s-rowtxt">
                <b>{stayLabel(s)}</b>
                <small>
                  {roomLabel(s.roomId)} · {fmt(s.arrival)} → {s.departure ? fmt(s.departure) : 'TBC'}
                </small>
              </span>
              <i aria-hidden>›</i>
            </button>
          ))}
          {t && !found.length && <p className="s-muted light">No current booking matches “{q}”.</p>}
        </div>
      )}
      {!cleaner && (
        <section className="s-week" aria-label="Today and the next 7 days">
          <h2>Today and the next 7 days</h2>
          {days.map(d => {
            const rows = dayRows(db, d);
            return (
              <div key={d} className="s-day">
                <h3>
                  {d === T ? 'Today' : d === addDays(T, 1) ? 'Tomorrow' : fmt(d, { weekday: 'long' })}
                  <small>{fmt(d, { day: 'numeric', month: 'short' })}</small>
                </h3>
                {rows.length ? (
                  rows.map(r => <Row key={r.key} r={r} />)
                ) : (
                  <p className="s-quiet">Nothing arriving or leaving</p>
                )}
              </div>
            );
          })}
        </section>
      )}
      <a className="s-btn ghost big light" href={cleaner ? '#changeovers' : '#board'}>
        Open the full board
      </a>
    </div>
  );
}

function Arrivals({ onBack }: { onBack: () => void }) {
  const db = useDB();
  const T = londonToday();
  const [d, setD] = useState(T);
  const rows = dayRows(db, d);
  const arr = rows.filter(r => r.kind === 'arrive');
  const lv = rows.filter(r => r.kind === 'leave');
  return (
    <Box
      step={'arr' + d}
      title={d === T ? 'Arriving today' : 'Arriving tomorrow'}
      sub={fmt(d, { weekday: 'long', day: 'numeric', month: 'long' })}
      onBack={onBack}
    >
      <div className="s-chips two">
        <Chip on={d === T} onClick={() => setD(T)}>
          Today
        </Chip>
        <Chip on={d !== T} onClick={() => setD(addDays(T, 1))}>
          Tomorrow
        </Chip>
      </div>
      {arr.length ? arr.map(r => <Row key={r.key} r={r} />) : <p className="s-quiet dark">Nobody arriving.</p>}
      <span className="s-lbl">Leaving</span>
      {lv.length ? lv.map(r => <Row key={r.key} r={r} />) : <p className="s-quiet dark">Nobody leaving.</p>}
    </Box>
  );
}

function Cleaning({ onBack }: { onBack: () => void }) {
  const db = useDB();
  const u = me();
  const T = londonToday();
  // Room, dates and status only: cleaner names are never shown here (the client must not see them).
  const list = db.changeovers
    .filter(c => c.status !== 'ready' && !c.cancelled && (c.readyBy ?? c.afterDate) <= addDays(T, 7))
    .sort((a, b) => (a.readyBy ?? a.afterDate).localeCompare(b.readyBy ?? b.afterDate));
  return (
    <Box step="clean" title="What needs cleaning" sub="Rooms to turn round in the next 7 days" onBack={onBack}>
      {!list.length && <p className="s-quiet dark">Nothing to clean. All rooms are ready.</p>}
      {list.map(c => {
        const r = readinessFor(c);
        const txt = u.role === 'client' ? (r.client ?? 'Clean to arrange') : r.provider;
        return (
          <div key={c.id} className={'s-row static ' + r.tone}>
            <span className="s-rowtxt">
              <b>{roomLabel(c.roomId)}</b>
              <small>
                Empty from {fmt(c.afterDate)}
                {c.readyBy
                  ? ` · next guest ${c.readyBy === c.afterDate ? 'same day' : fmt(c.readyBy)}`
                  : ' · no one booked next'}
              </small>
            </span>
            <span className={'s-status ' + r.tone}>{txt}</span>
          </div>
        );
      })}
      {u.role !== 'client' && (
        <a className="s-btn ghost big" href="#changeovers">
          Book cleans on the full cleaning board
        </a>
      )}
    </Box>
  );
}
