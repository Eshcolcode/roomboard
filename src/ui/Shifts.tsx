// Shift patterns (27 Oct 2026): set a pattern up once, choose it on any stay. The room stays theirs all stay; the
// pattern only marks the nights they are in and the nights they are away (room kept).
import { useState } from 'react';
import { data, useDB, me } from '../data';
import type { DayState, ShiftPattern, Stay } from '../data';
import { DOW, dayState, defaultCycleStart, flipDay, patternSummary } from '../data/shifts';
import { addDays, fmt, londonToday } from '../dates';
import { DateField } from './DateField';
import { useEscape } from './hooks';
import { confirmDialog, toast } from './overlays';

export type ShiftChoice = { patternId: string; cycleStart: string } | null;

/** The list of patterns: add, edit, delete. Eshcol and RJ McLeod; the Housekeeper never gets here. */
export function PatternsSheet({ onClose }: { onClose: () => void }) {
  const db = useDB();
  const list = db.shiftPatterns ?? [];
  const [edit, setEdit] = useState<(Omit<ShiftPattern, 'id'> & { id?: string }) | null>(null);
  const [err, setErr] = useState('');
  useEscape(onClose);
  const used = (id: string) => (db.stayShifts ?? []).filter(x => x.patternId === id).length;
  const save = async () => {
    if (!edit) return;
    try {
      await data.savePattern(edit);
      toast(edit.id ? 'Pattern saved · every stay using it follows the change' : 'Pattern added');
      setEdit(null);
      setErr('');
    } catch (e) {
      setErr((e as Error).message);
    }
  };
  const remove = async (p: ShiftPattern) => {
    const n = used(p.id);
    const ok = await confirmDialog({
      title: `Delete "${p.name}"?`,
      body: n
        ? `${n} stay${n === 1 ? ' uses' : 's use'} it. They go back to no pattern; their rooms stay theirs.`
        : 'No stay uses it.',
      ok: 'Delete pattern',
      danger: true,
    });
    if (!ok) return;
    await data.deletePattern(p.id);
    toast('Pattern deleted');
  };
  return (
    <div className="scrim center top shiftscrim" onClick={onClose}>
      <div
        className="dialog shiftdlg"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sp-t"
        onClick={e => e.stopPropagation()}
      >
        <div className="pt">
          <h2 id="sp-t">Shift patterns</h2>
          <button className="x" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>
        <p className="muted">
          Set a pattern up once, then choose it on anyone's stay. Their room stays theirs on away days.
        </p>
        <div className="splist">
          {list.map(p => (
            <div className="li" key={p.id} data-pattern={p.id}>
              <div>
                <b>{p.name}</b>
                <small>
                  {patternSummary(p)} · used by {used(p.id)} stay{used(p.id) === 1 ? '' : 's'}
                </small>
              </div>
              <div className="sp" />
              <button className="btn sm ghost" onClick={() => setEdit({ ...p })}>
                Edit
              </button>
              <button className="btn sm ghost danger" onClick={() => remove(p)}>
                Delete
              </button>
            </div>
          ))}
          {!list.length && <p className="empty-state">No patterns yet. Add the first one below.</p>}
        </div>
        {edit ? (
          <div className="spform" data-pattern-form>
            <div className="fs">
              <label htmlFor="sp-name">Name</label>
              <input
                id="sp-name"
                autoFocus
                value={edit.name}
                maxLength={60}
                placeholder="Give it a name, e.g. Crew A"
                onChange={e => setEdit({ ...edit, name: e.target.value })}
              />
            </div>
            <div className="three">
              <div className="fs">
                <label htmlFor="sp-on">Days in</label>
                <input
                  id="sp-on"
                  type="number"
                  min={1}
                  max={60}
                  value={edit.on}
                  onChange={e => setEdit({ ...edit, on: +e.target.value })}
                />
              </div>
              <div className="fs">
                <label htmlFor="sp-off">Days away</label>
                <input
                  id="sp-off"
                  type="number"
                  min={1}
                  max={60}
                  value={edit.off}
                  onChange={e => setEdit({ ...edit, off: +e.target.value })}
                />
              </div>
              <div className="fs">
                <label htmlFor="sp-dow">First day in</label>
                <select
                  id="sp-dow"
                  value={edit.startDow}
                  onChange={e => setEdit({ ...edit, startDow: +e.target.value })}
                >
                  {DOW.map((d, i) => (
                    <option key={d} value={i}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <small className="muted block">
              {edit.on >= 1 && edit.off >= 1
                ? patternSummary(edit) + ` · repeats every ${edit.on + edit.off} days`
                : ''}
            </small>
            {err && (
              <div className="err" role="alert">
                {err}
              </div>
            )}
            <div className="pa">
              <div className="sp" />
              <button className="btn ghost" onClick={() => (setEdit(null), setErr(''))}>
                Cancel
              </button>
              <button className="btn primary" onClick={save}>
                {edit.id ? 'Save pattern' : 'Add pattern'}
              </button>
            </div>
          </div>
        ) : (
          <div className="pa">
            <div className="sp" />
            <button className="btn" onClick={() => setEdit({ name: '', on: 10, off: 4, startDow: 1 })}>
              + New pattern
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/** "Shift pattern" on a stay: the dropdown (No pattern by default) and the date of their first day in. */
export function ShiftPicker({
  arrival,
  value,
  onChange,
}: {
  arrival: string;
  value: ShiftChoice;
  onChange: (v: ShiftChoice) => void;
}) {
  const db = useDB();
  const [manage, setManage] = useState(false);
  const list = db.shiftPatterns ?? [];
  const p = value ? list.find(x => x.id === value.patternId) : undefined;
  const canManage = me().role !== 'cleaner';
  const T = londonToday();
  const pick = (id: string) => {
    if (id === '__manage') return setManage(true);
    if (!id) return onChange(null);
    const np = list.find(x => x.id === id)!;
    // first day in: the pattern's weekday, from arrival (or from today for someone already in)
    const from = arrival > T ? arrival : T;
    onChange({ patternId: id, cycleStart: value?.cycleStart ?? defaultCycleStart(from, np.startDow) });
  };
  return (
    <div className="fs shiftpick" data-shift-picker>
      <label htmlFor="f-shift">Shift pattern</label>
      <select id="f-shift" value={value?.patternId ?? ''} onChange={e => pick(e.target.value)}>
        <option value="">No pattern (in every night)</option>
        {list.map(x => (
          <option key={x.id} value={x.id}>
            {x.name}
          </option>
        ))}
        {canManage && <option value="__manage">{list.length ? 'Add or edit patterns…' : 'Set up a pattern…'}</option>}
      </select>
      {value && p && (
        <>
          <div className="two">
            <div className="fs">
              <label htmlFor="f-cycle">First day in</label>
              <DateField
                id="f-cycle"
                value={value.cycleStart}
                onChange={v => v && onChange({ ...value, cycleStart: v })}
              />
            </div>
            <small className="muted cyclehint">
              {patternSummary(p)}
              {DOW[new Date(value.cycleStart + 'T12:00Z').getUTCDay()] !== DOW[p.startDow]
                ? ` · note: ${fmt(value.cycleStart)} is not a ${DOW[p.startDow]}`
                : ''}
            </small>
          </div>
          <small className="muted block">The room stays theirs on away days. Nobody can book it.</small>
        </>
      )}
      {manage && <PatternsSheet onClose={() => setManage(false)} />}
    </div>
  );
}

/** The next four weeks of a stay that follows a pattern; tap a night to flip it (back early, away an extra night). */
export function DayStrip({ stay, editable }: { stay: Stay; editable: boolean }) {
  const db = useDB();
  const sh = db.stayShifts?.find(x => x.stayId === stay.id);
  const p = sh ? db.shiftPatterns?.find(x => x.id === sh.patternId) : undefined;
  const T = londonToday();
  if (!sh || !p) return null;
  const from = stay.arrival > T ? stay.arrival : T;
  const nights = Array.from({ length: 28 }, (_, i) => addDays(from, i)).filter(
    d => !stay.departure || d < stay.departure,
  );
  if (!nights.length) return null;
  const flip = async (d: string) => {
    await data.setOverrides(stay.id, flipDay(stay, p, sh, d));
  };
  return (
    <div className="daystrip" data-daystrip>
      <small className="muted block">
        Next {nights.length} nights{editable ? ' · tap a night to change just that night' : ''}
      </small>
      <div className="dsgrid">
        {nights.map(d => {
          const st = dayState(stay, p, sh, d) as DayState;
          const one = !!sh.overrides[d];
          return (
            <button
              key={d}
              type="button"
              className={'dsd ds-' + st + (one ? ' one' : '') + (d === T ? ' today' : '')}
              disabled={!editable}
              title={`${fmt(d)}: ${st === 'in' ? 'in' : 'away, room kept'}${one ? ' (one-off)' : ''}`}
              aria-label={`${fmt(d)}: ${st === 'in' ? 'in' : 'away, room kept'}${one ? ', one-off' : ''}`}
              onClick={() => flip(d)}
            >
              <span>{fmt(d, { weekday: 'short' }).slice(0, 2)}</span>
              <b>{fmt(d, { day: 'numeric' })}</b>
            </button>
          );
        })}
      </div>
      <div className="dslegend">
        <span>
          <i className="dsd ds-in" /> In
        </span>
        <span>
          <i className="dsd ds-away" /> Away, room kept
        </span>
        <span>
          <i className="dsd ds-in one" /> One-off change
        </span>
      </div>
    </div>
  );
}

/** Quick card step: choose / change the pattern and save it straight away. */
export function ShiftStep({ stay, onDone }: { stay: Stay; onDone: (msg?: string) => void }) {
  const db = useDB();
  const cur = db.stayShifts?.find(x => x.stayId === stay.id);
  const [v, setV] = useState<ShiftChoice>(cur ? { patternId: cur.patternId, cycleStart: cur.cycleStart } : null);
  const [err, setErr] = useState('');
  const changed =
    JSON.stringify(v) !== JSON.stringify(cur ? { patternId: cur.patternId, cycleStart: cur.cycleStart } : null);
  return (
    <div>
      <ShiftPicker arrival={stay.arrival} value={v} onChange={setV} />
      {!changed && <DayStrip stay={stay} editable={me().role !== 'cleaner'} />}
      {err && <div className="err">{err}</div>}
      <button
        className="s-btn big"
        disabled={!changed}
        onClick={async () => {
          try {
            await data.setStayShift(stay.id, v);
            onDone(v ? 'Shift pattern saved' : 'Shift pattern removed');
          } catch (e) {
            setErr((e as Error).message);
          }
        }}
      >
        Save pattern
      </button>
    </div>
  );
}
