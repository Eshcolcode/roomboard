// "Who?" question: type a name, pick a saved worker, or Name TBC (and, when booking, "A crew").
import { useState } from 'react';
import { useDB } from '../data';
import type { Worker } from '../data';

export type WhoAnswer =
  { kind: 'worker'; id: string } | { kind: 'name'; name: string } | { kind: 'tbc' } | { kind: 'crew'; n: number };

export function WhoPick({ onPick, allowCrew }: { onPick: (w: WhoAnswer) => void; allowCrew?: boolean }) {
  const db = useDB();
  const [q, setQ] = useState('');
  const t = q.trim().toLowerCase();
  const recents = [...db.workers]
    .sort((a, b) => (b.lastUsed ?? '').localeCompare(a.lastUsed ?? '') || b.uses - a.uses)
    .slice(0, 4);
  const found: Worker[] = t ? db.workers.filter(w => w.name.toLowerCase().includes(t)).slice(0, 4) : recents;
  const exact = db.workers.find(w => w.name.toLowerCase() === t);
  const submit = () => {
    if (!t) return;
    onPick(exact ? { kind: 'worker', id: exact.id } : { kind: 'name', name: q.trim() });
  };
  return (
    <div className="s-stack">
      <form
        className="s-type"
        onSubmit={e => {
          e.preventDefault();
          submit();
        }}
      >
        <input
          className="s-input"
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Type a name"
          aria-label="Name"
          autoComplete="off"
          enterKeyHint="next"
        />
        {t && !exact && (
          <button className="s-btn" type="submit">
            Use “{q.trim()}” →
          </button>
        )}
      </form>
      <span className="s-lbl">{t ? 'Saved workers that match' : 'Recent workers'}</span>
      <div className="s-grid2">
        {found.map(w => (
          <button key={w.id} className="s-pick" onClick={() => onPick({ kind: 'worker', id: w.id })}>
            <b>{w.name}</b>
            <small>{w.company || 'Saved worker'}</small>
          </button>
        ))}
        {t && !found.length && <p className="s-muted">No saved worker by that name. Use the button above.</p>}
      </div>
      <div className="s-or">or</div>
      <div className="s-grid2">
        <button className="s-pick tbc" onClick={() => onPick({ kind: 'tbc' })}>
          <b>Name TBC</b>
          <small>Hold the room now, name later</small>
        </button>
        {allowCrew && (
          <button className="s-pick crew" onClick={() => onPick({ kind: 'crew', n: 0 })}>
            <b>A crew</b>
            <small>Several people, same dates</small>
          </button>
        )}
      </div>
    </div>
  );
}
