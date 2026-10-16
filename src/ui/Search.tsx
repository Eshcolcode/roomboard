// Global search: type a worker or a room, jump straight to their stay.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useDB, propOf, roomOf, roomLabel, stayLabel, inHouseOn } from '../data';
import { fmt, londonToday } from '../dates';
import { Icon } from './icons';
import type { PanelInit } from './StayPanel';

export function Search({ onOpen }: { onOpen: (p: PanelInit) => void }) {
  const db = useDB();
  const T = londonToday();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const box = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement)?.matches?.('input,textarea,select');
      if ((e.key === '/' && !typing) || (e.key === 'k' && (e.metaKey || e.ctrlKey))) {
        e.preventDefault();
        setOpen(true);
      }
      if (e.key === 'Escape') setOpen(false);
    };
    addEventListener('keydown', k);
    return () => removeEventListener('keydown', k);
  }, []);
  useEffect(() => {
    if (open) {
      setQ('');
      setSel(0);
      setTimeout(() => box.current?.focus(), 0);
    }
  }, [open]);

  const results = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return [];
    const stayOf = (pred: (s: (typeof db.stays)[number]) => boolean) => {
      const mine = db.stays.filter(pred).sort((a, b) => a.arrival.localeCompare(b.arrival));
      return mine.find(s => inHouseOn(s, T)) ?? mine.find(s => s.arrival > T);
    };
    const workers = db.workers
      .filter(w => w.name.toLowerCase().includes(t))
      .slice(0, 6)
      .map(w => {
        const s = stayOf(x => x.workerId === w.id);
        return {
          key: w.id,
          title: w.name,
          sub: s
            ? `${roomLabel(s.roomId)} · ${inHouseOn(s, T) ? 'in now' : 'arrives ' + fmt(s.arrival)}`
            : 'Not booked · tap to book',
          go: () => onOpen(s ? { stay: s } : { workerId: w.id }),
        };
      });
    const rooms = db.rooms
      .filter(
        r =>
          propOf(r.propertyId).contracted &&
          `${propOf(r.propertyId).name} ${propOf(r.propertyId).short} ${r.name}`.toLowerCase().includes(t),
      )
      .slice(0, 8)
      .map(r => {
        const s = stayOf(x => x.roomId === r.id);
        return {
          key: r.id,
          title: roomLabel(r.id),
          sub: s
            ? `${stayLabel(s)} · ${inHouseOn(s, T) ? 'in now' : 'arrives ' + fmt(s.arrival)}`
            : 'Free · tap to book',
          go: () => onOpen(s && inHouseOn(s, T) ? { stay: s } : { roomId: r.id, date: T }),
        };
      });
    return [...workers, ...rooms];
  }, [q, db, T, onOpen]);

  const pick = (i: number) => {
    const r = results[i];
    if (r) {
      setOpen(false);
      r.go();
    }
  };

  return (
    <>
      <button
        className="searchbtn"
        aria-label="Search workers or rooms"
        title="Search (/)"
        onClick={() => setOpen(true)}
      >
        <Icon name="search" />
        <span className="tlbl">Search</span>
      </button>
      {open && (
        <div className="scrim center top" onClick={() => setOpen(false)}>
          <div className="palette" role="dialog" aria-label="Search" onClick={e => e.stopPropagation()}>
            <input
              ref={box}
              aria-label="Search workers or rooms"
              placeholder="Worker or room, e.g. “Iain” or “Room 8”"
              value={q}
              onChange={e => {
                setQ(e.target.value);
                setSel(0);
              }}
              onKeyDown={e => {
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  setSel(Math.min(sel + 1, results.length - 1));
                }
                if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  setSel(Math.max(sel - 1, 0));
                }
                if (e.key === 'Enter') pick(sel);
              }}
            />
            <div className="results" role="listbox">
              {results.map((r, i) => (
                <button
                  key={r.key}
                  role="option"
                  aria-selected={i === sel}
                  className={'res' + (i === sel ? ' on' : '')}
                  onClick={() => pick(i)}
                >
                  <b>{r.title}</b>
                  <small>{r.sub}</small>
                </button>
              ))}
              {q && !results.length && <p className="empty-state">No worker or room matches “{q}”.</p>}
              {!q && <p className="muted pad">Tip: press / anywhere to search.</p>}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
