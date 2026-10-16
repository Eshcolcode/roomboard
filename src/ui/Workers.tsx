// Saved workers: book again with one tap.
import { useState } from 'react';
import { useDB, roomLabel, inHouseOn } from '../data';
import { fmt, londonToday } from '../dates';
import { NewWorker } from './StayPanel';
import type { PanelInit } from './StayPanel';

export function Workers({ onOpen }: { onOpen: (p: PanelInit) => void }) {
  const db = useDB();
  const T = londonToday();
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);
  const list = db.workers
    .filter(w => (w.name + w.company).toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name));
  const recents = [...db.workers].sort((a, b) => (b.lastUsed ?? '').localeCompare(a.lastUsed ?? '')).slice(0, 8);
  const where = (id: string) => db.stays.find(s => s.workerId === id && inHouseOn(s, T));
  const nextS = (id: string) =>
    db.stays.filter(s => s.workerId === id && s.arrival > T).sort((a, b) => a.arrival.localeCompare(b.arrival))[0];
  const book = (id: string) => onOpen({ workerId: id });

  return (
    <div className="page">
      <div className="ph">
        <div>
          <h1>Workers</h1>
          <p>Save a worker once, then book them again with one tap.</p>
        </div>
        <div className="sp" />
        <input
          className="search"
          aria-label="Search workers"
          placeholder="Search name or company…"
          value={q}
          onChange={e => setQ(e.target.value)}
        />
        <button className="btn" onClick={() => setAdding(true)}>
          + New worker
        </button>
      </div>
      {adding && (
        <div className="card">
          <NewWorker onDone={() => setAdding(false)} />
        </div>
      )}
      <div className="recents">
        <small>Recent · tap to book</small>
        {recents.map(w => (
          <button key={w.id} className="chip" onClick={() => book(w.id)}>
            {w.name}
          </button>
        ))}
      </div>
      <div className="table">
        <div className="tr th">
          <span>Name</span>
          <span>Company</span>
          <span>Mobile</span>
          <span>Now</span>
          <span>Next</span>
          <span />
        </div>
        {list.map(w => {
          const s = where(w.id);
          const n = nextS(w.id);
          return (
            <div className="tr" key={w.id}>
              <span>
                <b>{w.name}</b>
                {w.notes && <small>{w.notes}</small>}
              </span>
              <span>{w.company}</span>
              <span>{w.phone}</span>
              <span>
                {s ? (
                  <span className="pill in">{roomLabel(s.roomId)}</span>
                ) : (
                  <span className="muted">Not in house</span>
                )}
              </span>
              <span>{n ? `${roomLabel(n.roomId)} · ${fmt(n.arrival)}` : '—'}</span>
              <span>
                <button className="btn sm ghost" aria-label={`Book ${w.name}`} onClick={() => book(w.id)}>
                  Book
                </button>
              </span>
            </div>
          );
        })}
        {!list.length && (
          <p className="empty-state">
            No worker matches “{q}”.{' '}
            <button className="link" onClick={() => setAdding(true)}>
              Add them
            </button>
          </p>
        )}
      </div>
    </div>
  );
}
