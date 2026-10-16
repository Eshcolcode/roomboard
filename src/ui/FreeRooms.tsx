// Find a room: pick dates, see what's free, grouped by property, tap to book.
import { useState } from 'react';
import { useDB, freeRooms, bathText } from '../data';
import type { Bath } from '../data';
import { addDays, diffDays, fmt, londonToday } from '../dates';
import { DateField } from './DateField';
import type { PanelInit } from './StayPanel';

export function FreeRooms({ onOpen }: { onOpen: (p: PanelInit) => void }) {
  const db = useDB();
  const T = londonToday();
  const [from, setFrom] = useState(T);
  const [to, setTo] = useState(addDays(T, 7));
  const [ufn, setUfn] = useState(false);
  const [bath, setBath] = useState<'any' | Bath>('any');
  const end = ufn ? null : to;
  const bad = !from || (!ufn && (!to || to <= from));
  const free = bad ? [] : freeRooms(from, end).filter(r => bath === 'any' || r.bath === bath);
  const n = end && !bad ? diffDays(from, end) : null;

  return (
    <div className="page narrow">
      <div className="ph">
        <div>
          <h1>Find a room</h1>
          <p>Pick dates to see every room that’s free for the whole stay.</p>
        </div>
      </div>
      <section className="card finder">
        <div className="frow">
          <div className="fs">
            <label htmlFor="fr-from">Arriving</label>
            <DateField
              id="fr-from"
              value={from}
              onChange={v => {
                setFrom(v);
                if (v && to <= v) setTo(addDays(v, 7));
              }}
            />
          </div>
          <div className="fs">
            <label htmlFor="fr-to">Leaving</label>
            <DateField id="fr-to" value={ufn ? '' : to} disabled={ufn} onChange={setTo} />
          </div>
          <div className="fs">
            <label htmlFor="fr-bath">Bathroom</label>
            <select id="fr-bath" value={bath} onChange={e => setBath(e.target.value as 'any' | Bath)}>
              <option value="any">Any</option>
              <option value="ensuite">Ensuite only</option>
              <option value="private">Private shower room</option>
              <option value="shared">Shared shower room</option>
            </select>
          </div>
        </div>
        <label className="cb">
          <input type="checkbox" checked={ufn} onChange={e => setUfn(e.target.checked)} /> Until further notice
        </label>
        <p className="summary" aria-live="polite">
          {bad
            ? 'Leaving must be after arriving.'
            : `${free.length} room${free.length === 1 ? '' : 's'} free · ${fmt(from)} → ${end ? `${fmt(end)} · ${n} night${n === 1 ? '' : 's'}` : 'until further notice'}`}
        </p>
      </section>
      {!bad &&
        db.properties
          .filter(p => p.contracted)
          .map(p => {
            const rooms = free.filter(r => r.propertyId === p.id);
            return (
              <section className="card" key={p.id} aria-label={`Free at ${p.name}`}>
                <h3>
                  {p.name}
                  <small>{rooms.length} free</small>
                </h3>
                {rooms.length ? (
                  <div className="freegrid">
                    {rooms.map(r => (
                      <button
                        key={r.id}
                        className="freeroom"
                        data-room={r.id}
                        onClick={() => onOpen({ roomId: r.id, date: from, departure: end })}
                      >
                        <b>{r.name}</b>
                        <small>
                          {r.floor} · {bathText(r)}
                        </small>
                        <span className="go">Book →</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="empty-state">Fully booked for these dates.</p>
                )}
              </section>
            );
          })}
      {!bad && !free.length && (
        <p className="empty-state">
          Nothing free for the whole stay. Try shorter dates, or{' '}
          <a href="#available">ask about rooms elsewhere on Lewis</a>.
        </p>
      )}
    </div>
  );
}
