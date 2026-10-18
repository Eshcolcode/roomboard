// Add / edit a stay. Side panel on desktop, full-screen sheet on phone.
import { useCallback, useEffect, useState } from 'react';
import {
  data,
  useDB,
  roomOf,
  propOf,
  workerOf,
  roomLabel,
  stayLabel,
  validate,
  workerClash,
  freeRooms,
  suggestFor,
  ConflictError,
  bathText,
} from '../data';
import type { DepStatus, Stay, StayInput } from '../data';
import { addDays, diffDays, fmt, londonToday } from '../dates';
import { DateField } from './DateField';
import { useEscape } from './hooks';
import { confirmDialog, toast } from './overlays';

export interface PanelInit {
  stay?: Stay;
  hold?: boolean;
  roomId?: string;
  date?: string;
  departure?: string | null;
  workerId?: string;
}

const OPEN: DepStatus[] = ['tbc', 'ufn'];
/** First leaving date offered when an open-ended stay gets one: a week after arrival, never in the past. */
const firstDep = (arrival: string) => {
  const a = addDays(arrival, 7);
  const t = addDays(londonToday(), 7);
  return a > t ? a : t;
};
const isOpen = (d: DepStatus) => OPEN.includes(d);

function initialForm(init: PanelInit): StayInput {
  const T = londonToday();
  const s = init.stay;
  if (s) {
    return {
      id: s.id,
      version: s.version,
      roomId: s.roomId,
      workerId: s.workerId,
      holdLabel: s.holdLabel,
      arrival: s.arrival,
      departure: s.departure,
      depStatus: s.depStatus,
      away: s.away ?? null,
      notes: s.notes,
    };
  }
  let arrival = init.date ?? T;
  let roomId = init.roomId ?? '';
  if (init.workerId && !init.date) {
    const sug = suggestFor(init.workerId);
    arrival = sug.arrival;
    roomId = roomId || sug.roomId || '';
  }
  const departure = init.departure === undefined ? addDays(arrival, 7) : init.departure;
  return {
    roomId,
    workerId: init.workerId ?? null,
    holdLabel: init.hold ? 'Name to follow' : '',
    arrival,
    departure,
    depStatus: departure === null ? 'ufn' : 'planned',
    away: null,
    notes: '',
  };
}

export function StayPanel({ init, onClose }: { init: PanelInit; onClose: () => void }) {
  const db = useDB();
  const existing = init.stay;
  const [f, setF] = useState<StayInput>(() => initialForm(init));
  const [mode, setMode] = useState<'worker' | 'hold'>(
    existing ? (existing.workerId ? 'worker' : 'hold') : init.hold ? 'hold' : 'worker',
  );
  const [q, setQ] = useState('');
  const [err, setErr] = useState('');
  const [conflict, setConflict] = useState('');
  const [newW, setNewW] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const close = useCallback(() => onClose(), [onClose]);
  useEscape(close);
  // return focus to whatever opened the panel
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    return () => opener?.focus?.();
  }, []);

  const set = (p: Partial<StayInput>) => {
    setF(x => ({ ...x, ...p }));
    setErr('');
  };
  const dep = isOpen(f.depStatus) ? null : f.departure;
  const input: StayInput = { ...f, departure: dep, workerId: mode === 'hold' ? null : f.workerId };
  const room = f.roomId ? roomOf(f.roomId) : null;
  const problem = f.roomId ? validate(input) : null;
  const twoRooms = mode === 'worker' && f.roomId ? workerClash(input) : undefined;
  const nights = dep ? diffDays(f.arrival, dep) : null;
  const free = f.arrival ? freeRooms(f.arrival, dep, existing?.id) : [];
  const roomChoices = db.rooms.filter(
    r => propOf(r.propertyId).contracted && (showAll || free.includes(r) || r.id === f.roomId),
  );

  const recents = [...db.workers]
    .sort((a, b) => (b.lastUsed ?? '').localeCompare(a.lastUsed ?? '') || b.uses - a.uses)
    .slice(0, 6);
  const found = q
    ? db.workers.filter(w => (w.name + ' ' + w.company).toLowerCase().includes(q.toLowerCase())).slice(0, 8)
    : [];
  const W = workerOf(f.workerId);

  const pickWorker = (id: string) => {
    setQ('');
    if (existing) return set({ workerId: id });
    const sug = suggestFor(id);
    const T = londonToday();
    // keep dates the user already chose; otherwise start after the worker's current stay
    const datesChosen = init.departure !== undefined || !!init.roomId || f.arrival !== (init.date ?? T);
    if (!datesChosen && sug.arrival !== f.arrival) {
      const len = dep ? diffDays(f.arrival, dep) : 7;
      set({
        workerId: id,
        arrival: sug.arrival,
        departure: isOpen(f.depStatus) ? null : addDays(sug.arrival, len),
        roomId: f.roomId || sug.roomId || '',
      });
      toast(`Dates set to start ${fmt(sug.arrival)}, after ${workerOf(id)!.name.split(' ')[0]}'s current stay`);
    } else set({ workerId: id });
  };

  const save = async () => {
    if (!f.roomId) return setErr('Choose a room.');
    if (mode === 'worker' && !f.workerId) return setErr('Pick a worker, or switch to "Hold · name to follow".');
    try {
      await data.saveStay({ ...input, holdLabel: mode === 'hold' ? f.holdLabel || 'Name to follow' : '' });
      onClose();
      toast(
        existing
          ? 'Changes saved'
          : mode === 'hold'
            ? `${roomLabel(f.roomId)} held`
            : `Stay added · ${roomLabel(f.roomId)}`,
        { undo: true },
      );
    } catch (e) {
      if (e instanceof ConflictError) setConflict(e.message);
      else setErr((e as Error).message);
    }
  };

  const cancelStay = async () => {
    if (!existing) return;
    const ok = await confirmDialog({
      title: `Cancel ${stayLabel(existing)}'s stay?`,
      body: `${roomLabel(existing.roomId)} from ${fmt(existing.arrival)}. Everyone involved is told. You can undo straight after.`,
      ok: 'Cancel stay',
      danger: true,
    });
    if (!ok) return;
    await data.deleteStay(existing.id);
    onClose();
    toast('Stay cancelled', { undo: true });
  };

  const changedBy = existing && db.users.find(x => x.id === existing.updatedBy);

  return (
    <div className="scrim" onClick={onClose}>
      <aside
        className="panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ptitle"
        onClick={e => e.stopPropagation()}
      >
        <div className="pt">
          <div>
            <small>
              {existing
                ? existing.workerId
                  ? 'Edit stay'
                  : 'Hold · name to follow'
                : mode === 'hold'
                  ? 'Hold a room'
                  : 'Add stay'}
            </small>
            <h2 id="ptitle">{room ? roomLabel(room.id) : 'Choose a room'}</h2>
          </div>
          <button className="x" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="pbody">
          {room && (
            <div className="rinfo">
              {room.photo ? <img className="rthumb" src={room.photo} alt="" /> : null}
              <span>{room.floor}</span>
              <span className={'bt bt-' + room.bath}>{bathText(room)}</span>
              {room.note && room.note !== 'Ensuite' && <span>{room.note}</span>}
            </div>
          )}
          {conflict && (
            <div className="warn">
              <b>Someone else changed this stay.</b> {conflict}
              <div>
                <button className="btn sm" onClick={onClose}>
                  Close and reload
                </button>
              </div>
            </div>
          )}

          <div className="seg full" role="group" aria-label="Who">
            <button className={mode === 'worker' ? 'on' : ''} onClick={() => setMode('worker')}>
              Named worker
            </button>
            <button className={mode === 'hold' ? 'on' : ''} onClick={() => setMode('hold')}>
              Hold · name to follow
            </button>
          </div>

          {mode === 'worker' ? (
            <div className="fs">
              <label htmlFor="f-wq">Worker</label>
              {W ? (
                <div className="chosen">
                  <div className="avt">
                    {W.name
                      .split(' ')
                      .map(x => x[0])
                      .join('')}
                  </div>
                  <div>
                    <b>{W.name}</b>
                    <small>
                      {W.company} · {W.phone}
                    </small>
                    {W.notes && <small className="note">{W.notes}</small>}
                  </div>
                  <button className="link" onClick={() => set({ workerId: null })}>
                    Change
                  </button>
                </div>
              ) : (
                <>
                  <input
                    id="f-wq"
                    autoFocus
                    placeholder="Search saved workers…"
                    value={q}
                    onChange={e => setQ(e.target.value)}
                  />
                  <div className="chips">
                    {(q ? found : recents).map(w => (
                      <button key={w.id} className="chip" onClick={() => pickWorker(w.id)}>
                        {w.name}
                      </button>
                    ))}
                    {q && !found.length && <small className="muted">No saved worker called “{q}”.</small>}
                  </div>
                  {!q && <small className="muted block">Recent workers · tap to pick</small>}
                  {newW ? (
                    <NewWorker
                      initial={q}
                      onDone={id => {
                        setNewW(false);
                        if (id) set({ workerId: id });
                      }}
                    />
                  ) : (
                    <button className="link" onClick={() => setNewW(true)}>
                      + New worker
                    </button>
                  )}
                </>
              )}
              {existing && !existing.workerId && (
                <small className="muted">Naming this hold keeps the same booking.</small>
              )}
            </div>
          ) : (
            <div className="fs">
              <label htmlFor="f-hold">Hold label</label>
              <input
                id="f-hold"
                value={f.holdLabel}
                onChange={e => set({ holdLabel: e.target.value })}
                placeholder="Name to follow · e.g. electrician"
              />
            </div>
          )}

          <div className="two">
            <div className="fs">
              <label htmlFor="f-arr">Arrives</label>
              <DateField id="f-arr" value={f.arrival} onChange={v => set({ arrival: v })} />
            </div>
            <div className="fs">
              <label htmlFor="f-dep">Leaves</label>
              <DateField
                id="f-dep"
                key={isOpen(f.depStatus) ? 'open' : 'dated'} // a fresh box (no half-typed date) when it goes open-ended
                value={dep ?? ''}
                // typing or picking a date on an open-ended stay sets its end date (it becomes planned)
                onChange={v =>
                  set(
                    v
                      ? { departure: v, depStatus: isOpen(f.depStatus) ? 'planned' : f.depStatus }
                      : { departure: null },
                  )
                }
              />
            </div>
          </div>
          <div className="seg full sm" role="group" aria-label="Departure status">
            {(
              [
                ['planned', 'Planned'],
                ['confirmed', 'Confirmed'],
                ['tbc', 'Departure TBC'],
                ['ufn', 'Until further notice'],
              ] as [DepStatus, string][]
            ).map(([k, l]) => (
              <button
                key={k}
                className={f.depStatus === k ? 'on' : ''}
                aria-pressed={f.depStatus === k}
                onClick={() =>
                  set({ depStatus: k, departure: isOpen(k) ? null : (f.departure ?? firstDep(f.arrival)) })
                }
              >
                {l}
              </button>
            ))}
          </div>
          <small className="muted">
            {nights !== null && nights > 0
              ? `${nights} night${nights === 1 ? '' : 's'} · ${fmt(f.arrival)} → ${fmt(dep!)}${f.depStatus === 'planned' ? ' · departure not confirmed yet' : ''}`
              : isOpen(f.depStatus)
                ? 'Open-ended: the room stays allocated until a departure date is set.'
                : ''}
          </small>

          <div className="fs">
            <label htmlFor="f-room">Room</label>
            <select id="f-room" value={f.roomId} onChange={e => set({ roomId: e.target.value })}>
              <option value="">
                {roomChoices.length
                  ? `Choose a room (${free.length} free for these dates)`
                  : 'No rooms free for these dates'}
              </option>
              {roomChoices.map(r => (
                <option key={r.id} value={r.id}>
                  {propOf(r.propertyId).short} · {r.name} · {bathText(r)}
                  {free.includes(r) ? '' : ' · taken'}
                </option>
              ))}
            </select>
            <label className="cb sm">
              <input type="checkbox" checked={showAll} onChange={e => setShowAll(e.target.checked)} /> Show taken rooms
              too
            </label>
          </div>

          {mode === 'worker' && existing && (
            <details className="fs" open={!!f.away}>
              <summary>Away, room kept</summary>
              <div className="two">
                <DateField
                  label="Away from"
                  value={f.away?.from ?? ''}
                  onChange={v => set({ away: v ? { from: v, to: f.away?.to ?? addDays(v, 3) } : null })}
                />
                <DateField
                  label="Back on"
                  value={f.away?.to ?? ''}
                  onChange={v => set({ away: f.away ? { ...f.away, to: v } : null })}
                />
              </div>
              <small className="muted">
                Their room and things stay put, and no clean is booked.{' '}
                {f.away && (
                  <button className="link" onClick={() => set({ away: null })}>
                    Clear
                  </button>
                )}
              </small>
            </details>
          )}

          <div className="fs">
            <label htmlFor="f-notes">Notes for the team</label>
            <textarea
              id="f-notes"
              rows={2}
              value={f.notes}
              onChange={e => set({ notes: e.target.value })}
              placeholder="e.g. late arrival after the 10pm ferry"
            />
          </div>

          {twoRooms && (
            <div className="soft" role="note">
              Heads up: {workerOf(f.workerId)!.name} is also in {roomLabel(twoRooms.roomId)} ({fmt(twoRooms.arrival)} →{' '}
              {twoRooms.departure ? fmt(twoRooms.departure) : 'open-ended'}). You can still save if that’s intended.
            </div>
          )}
          {(err || problem) && (
            <div className="err" role="alert">
              {err || problem}
            </div>
          )}
          {existing && changedBy && (
            <small className="muted foot">
              Last changed by {changedBy.role === 'cleaner' ? 'Housekeeping' : changedBy.name},{' '}
              {new Date(existing.updatedAt).toLocaleString('en-GB', {
                timeZone: 'Europe/London',
                weekday: 'short',
                day: 'numeric',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </small>
          )}
        </div>
        <div className="pa">
          {existing && (
            <button className="btn danger ghost" onClick={cancelStay}>
              Cancel stay
            </button>
          )}
          {existing && existing.departure && existing.depStatus === 'planned' && (
            <button
              className="btn ghost"
              onClick={() =>
                data.confirmDeparture(existing.id).then(() => {
                  onClose();
                  toast('Departure confirmed', { undo: true });
                })
              }
            >
              Confirm departure
            </button>
          )}
          <div className="sp" />
          {!existing && (
            <button className="btn ghost" onClick={onClose}>
              Close
            </button>
          )}
          <button className="btn primary" disabled={!!problem} onClick={save}>
            {existing ? 'Save changes' : mode === 'hold' ? 'Hold room' : 'Add stay'}
          </button>
        </div>
      </aside>
    </div>
  );
}

export function NewWorker({ initial = '', onDone }: { initial?: string; onDone: (id?: string) => void }) {
  const [n, setN] = useState(initial);
  const [c, setC] = useState('RJ McLeod');
  const [p, setP] = useState('');
  return (
    <div className="nw">
      <input aria-label="Full name" placeholder="Full name" value={n} onChange={e => setN(e.target.value)} />
      <input aria-label="Company or crew" placeholder="Company / crew" value={c} onChange={e => setC(e.target.value)} />
      <input aria-label="Mobile" placeholder="Mobile" value={p} onChange={e => setP(e.target.value)} />
      <div>
        <button
          className="btn sm"
          disabled={!n.trim()}
          onClick={async () => {
            const w = await data.upsertWorker({ name: n.trim(), company: c, phone: p });
            toast(`${w.name} saved`);
            onDone(w.id);
          }}
        >
          Save worker
        </button>{' '}
        <button className="link" onClick={() => onDone()}>
          Cancel
        </button>
      </div>
    </div>
  );
}
