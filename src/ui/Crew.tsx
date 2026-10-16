// Crew booking with rotations. Pick people (named workers and/or "Name TBC" places), a property or rooms,
// a start date and a pattern such as 10 on / 4 off. Every generated stay is previewed with clashes before
// anything is saved; confirming creates them all in one step (one undo). Existing series can be extended,
// shortened or cancelled together; a single occurrence is edited like any stay.
import { useState } from 'react';
import { data, useDB, roomLabel, workerOf } from '../data';
import type { Series } from '../data';
import { planCrew, planInputs, usualRoom } from '../data/crew';
import { occurrences, patternText, UFN_WEEKS, type OffMode, type Pattern, type RotationEnd } from '../data/rotation';
import { addDays, fmt, londonToday } from '../dates';
import { DateField } from './DateField';
import { confirmDialog, toast } from './overlays';
import { Icon } from './icons';

const short = (d: string) => fmt(d, { day: 'numeric', month: 'short' });

export function Crew() {
  const db = useDB();
  const T = londonToday();
  const props = db.properties.filter(p => p.contracted);
  const [label, setLabel] = useState('');
  const [workerIds, setWorkerIds] = useState<string[]>([]);
  const [holds, setHolds] = useState(0);
  const [q, setQ] = useState('');
  const [propertyId, setPropertyId] = useState(props[0]?.id ?? '');
  const [roomIds, setRoomIds] = useState<string[]>([]);
  const [start, setStart] = useState(addDays(T, 7));
  const [on, setOn] = useState(10);
  const [off, setOff] = useState(4);
  const [endKind, setEndKind] = useState<RotationEnd['kind']>('cycles');
  const [endDate, setEndDate] = useState(addDays(T, 63));
  const [cycles, setCycles] = useState(3);
  const [offMode, setOffMode] = useState<OffMode>('keep');
  const [override, setOverride] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState(false);

  const end: RotationEnd =
    endKind === 'date'
      ? { kind: 'date', date: endDate }
      : endKind === 'ufn'
        ? { kind: 'ufn' }
        : { kind: 'cycles', n: cycles };
  const pattern: Pattern = { start, on, off, end, offMode };
  const plan = planCrew(db, { propertyId, roomIds, workerIds, holds, pattern, roomOverride: override }); // cheap: recomputed on every change so the preview is always live
  const people = workerIds.length + holds;
  const total = plan.slots.length * plan.occurrences.length;
  const name = label.trim() || `Crew ${(db.series?.length ?? 0) + 1}`;
  const propRooms = db.rooms.filter(r => r.propertyId === propertyId);
  const ws = db.workers
    .filter(w => !q || `${w.name} ${w.company}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => Number(workerIds.includes(b.id)) - Number(workerIds.includes(a.id)) || b.uses - a.uses);
  const why = !people
    ? 'Pick at least one worker or add Name TBC places.'
    : !plan.occurrences.length
      ? 'The pattern gives no stays. Check the start, on/off days and end.'
      : plan.problems
        ? `${plan.problems} clash${plan.problems === 1 ? '' : 'es'} to sort first: pick another room for the red rows, choose more rooms, or change the dates.`
        : null;

  const confirm = async () => {
    if (why) return;
    const ok = await confirmDialog({
      title: `Book ${name}?`,
      body: `${people} ${people === 1 ? 'person' : 'people'} · ${patternText(pattern)} · ${total} stays from ${fmt(start)}${
        end.kind === 'ufn' ? ` (until further notice, first ${UFN_WEEKS} weeks)` : ''
      }. Off days: ${offMode === 'keep' ? 'away, room kept (no clean between blocks)' : 'room released (clean after every block)'}.`,
      ok: `Book ${total} stays`,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await data.createSeries(
        {
          label: name,
          propertyId,
          start,
          on,
          off,
          offMode,
          end,
          horizon: end.kind === 'ufn' ? addDays(start, UFN_WEEKS * 7) : null,
          slots: plan.slots.map(s => ({ slot: s.slot, workerId: s.workerId, label: s.label })),
        },
        planInputs(plan, '', `Crew ${name} · ${patternText(pattern)}`),
      );
      toast(`${name} booked · ${total} stays`, { undo: true });
      setWorkerIds([]);
      setHolds(0);
      setOverride({});
      setLabel('');
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page crew">
      <div className="ph">
        <div>
          <h1>Crew booking</h1>
          <p>Book a whole crew on a rotation in one go. Nothing is saved until you confirm the preview.</p>
        </div>
      </div>
      <div className="crew-grid">
        <section className="card cform" aria-label="Crew details">
          <div className="fl">
            <label htmlFor="c-label">Crew name</label>
            <input id="c-label" value={label} placeholder={name} onChange={e => setLabel(e.target.value)} />
          </div>
          <fieldset>
            <legend>Who</legend>
            <input
              aria-label="Find workers"
              placeholder="Find workers…"
              value={q}
              onChange={e => setQ(e.target.value)}
            />
            <div className="wpick" role="group" aria-label="Workers">
              {ws.slice(0, 40).map(w => {
                const u = usualRoom(db, w.id);
                return (
                  <label key={w.id} className="cb">
                    <input
                      type="checkbox"
                      checked={workerIds.includes(w.id)}
                      onChange={e =>
                        setWorkerIds(e.target.checked ? [...workerIds, w.id] : workerIds.filter(x => x !== w.id))
                      }
                    />
                    <span>
                      {w.name}
                      <small>
                        {w.company}
                        {u ? ` · usually ${roomLabel(u)}` : ''}
                      </small>
                    </span>
                  </label>
                );
              })}
            </div>
            <div className="fl inline">
              <label htmlFor="c-holds">Name TBC places</label>
              <input
                id="c-holds"
                type="number"
                min={0}
                max={40}
                value={holds}
                onChange={e => setHolds(Math.max(0, Math.min(40, +e.target.value || 0)))}
              />
            </div>
            <p className="hint">
              {workerIds.length} named + {holds} Name TBC = <b>{people}</b> {people === 1 ? 'place' : 'places'}
            </p>
          </fieldset>
          <fieldset>
            <legend>Where</legend>
            <div className="fl">
              <label htmlFor="c-prop">Property</label>
              <select
                id="c-prop"
                value={propertyId}
                onChange={e => {
                  setPropertyId(e.target.value);
                  setRoomIds([]);
                  setOverride({});
                }}
              >
                {props.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="chips" role="group" aria-label="Rooms to use">
              <button
                className={!roomIds.length ? 'on' : ''}
                aria-pressed={!roomIds.length}
                onClick={() => setRoomIds([])}
              >
                Any room
              </button>
              {propRooms.map(r => (
                <button
                  key={r.id}
                  className={roomIds.includes(r.id) ? 'on' : ''}
                  aria-pressed={roomIds.includes(r.id)}
                  onClick={() =>
                    setRoomIds(roomIds.includes(r.id) ? roomIds.filter(x => x !== r.id) : [...roomIds, r.id])
                  }
                >
                  {r.name}
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend>When</legend>
            <div className="row3">
              <div className="fl">
                <label htmlFor="c-start">First arrival</label>
                <DateField id="c-start" value={start} onChange={setStart} />
              </div>
              <div className="fl">
                <label htmlFor="c-on">Days on</label>
                <input
                  id="c-on"
                  type="number"
                  min={1}
                  max={90}
                  value={on}
                  onChange={e => setOn(Math.max(1, +e.target.value || 1))}
                />
              </div>
              <div className="fl">
                <label htmlFor="c-off">Days off</label>
                <input
                  id="c-off"
                  type="number"
                  min={0}
                  max={90}
                  value={off}
                  onChange={e => setOff(Math.max(0, +e.target.value || 0))}
                />
              </div>
            </div>
            <div className="radios" role="radiogroup" aria-label="Repeat">
              <label className="cb">
                <input type="radio" name="c-end" checked={endKind === 'cycles'} onChange={() => setEndKind('cycles')} />
                <span>
                  For
                  <input
                    aria-label="Number of rotations"
                    className="n"
                    type="number"
                    min={1}
                    max={60}
                    value={cycles}
                    onChange={e => {
                      setCycles(Math.max(1, Math.min(60, +e.target.value || 1)));
                      setEndKind('cycles');
                    }}
                  />
                  rotations
                </span>
              </label>
              <label className="cb">
                <input type="radio" name="c-end" checked={endKind === 'date'} onChange={() => setEndKind('date')} />
                <span>Until a date</span>
              </label>
              {endKind === 'date' && <DateField value={endDate} onChange={setEndDate} label="End date" min={start} />}
              <label className="cb">
                <input type="radio" name="c-end" checked={endKind === 'ufn'} onChange={() => setEndKind('ufn')} />
                <span>
                  Until further notice <small>(books the first {UFN_WEEKS} weeks; extend any time)</small>
                </span>
              </label>
            </div>
          </fieldset>
          <fieldset>
            <legend>On off days</legend>
            <div className="radios" role="radiogroup" aria-label="On off days">
              <label className="cb">
                <input type="radio" name="c-off" checked={offMode === 'keep'} onChange={() => setOffMode('keep')} />
                <span>
                  Away, room kept <small>(recommended) · same room each rotation, no clean between blocks</small>
                </span>
              </label>
              <label className="cb">
                <input
                  type="radio"
                  name="c-off"
                  checked={offMode === 'release'}
                  onChange={() => setOffMode('release')}
                />
                <span>
                  Release the room <small>· room is free on off days; a clean is booked after every block</small>
                </span>
              </label>
            </div>
          </fieldset>
        </section>

        <section className="card cprev" aria-label="Preview">
          <h3>
            Preview
            <small>
              {plan.slots.length} × {plan.occurrences.length} = {total} stays · {patternText(pattern)}
            </small>
          </h3>
          {plan.slots.length > 0 && plan.occurrences.length > 0 ? (
            <div className="pgrid-wrap">
              <table className="pgrid">
                <thead>
                  <tr>
                    <th scope="col">Place</th>
                    <th scope="col">Room</th>
                    {plan.occurrences.map(o => (
                      <th scope="col" key={o.arrival}>
                        {short(o.arrival)}
                        <small>→ {short(o.away?.from ?? o.departure)}</small>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {plan.slots.map(s => (
                    <tr key={s.slot} className={s.occ.some(o => o.problem) ? 'bad' : ''}>
                      <th scope="row">
                        {s.label}
                        {s.usual && <span className="usual">usual room</span>}
                      </th>
                      <td>
                        <select
                          aria-label={`Room for ${s.label}`}
                          value={s.roomId ?? ''}
                          onChange={e => setOverride({ ...override, [s.slot]: e.target.value })}
                        >
                          {!s.roomId && <option value="">No room</option>}
                          {propRooms.map(r => (
                            <option key={r.id} value={r.id}>
                              {r.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      {s.occ.map(o => (
                        <td
                          key={o.arrival}
                          className={o.problem ? 'clash' : o.warn ? 'warn' : 'ok'}
                          title={o.problem ?? o.warn ?? ''}
                        >
                          {o.problem ?? o.warn ?? (o.away ? 'Kept' : '✓')}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="muted">Pick people and a pattern to see every stay here.</p>
          )}
          {why ? (
            <p className="perr" role="status">
              {why}
            </p>
          ) : (
            <p className="pok" role="status">
              No clashes.{' '}
              {plan.warnings ? `${plan.warnings} warning(s): worker already booked elsewhere on those dates.` : ''}
            </p>
          )}
          <div className="pa">
            <div className="sp" />
            <button className="btn primary" disabled={!!why || busy} onClick={confirm}>
              Confirm {total || ''} stays
            </button>
          </div>
        </section>
      </div>
      <SeriesList />
    </div>
  );
}

function SeriesList() {
  const db = useDB();
  const T = londonToday();
  const list = (db.series ?? []).filter(s => db.stays.some(x => x.seriesId === s.id));
  const [editing, setEditing] = useState<string | null>(null);
  const [endDate, setEndDate] = useState(T);
  if (!list.length) return null;
  const run = async (next: Series, what: string, title: string, body: string) => {
    if (!(await confirmDialog({ title, body, ok: title.replace(/\?$/, ''), danger: what === 'cancelled' }))) return;
    try {
      await data.updateSeries(next, what);
      toast(`${next.label}: ${what}`, { undo: true });
      setEditing(null);
    } catch (e) {
      toast((e as Error).message);
    }
  };
  return (
    <section className="card series" aria-label="Crew bookings">
      <h3>Crew bookings</h3>
      {list.map(s => {
        const stays = db.stays.filter(x => x.seriesId === s.id).sort((a, b) => a.arrival.localeCompare(b.arrival));
        const last = stays[stays.length - 1];
        const rooms = [...new Set(stays.map(x => roomLabel(x.roomId)))];
        const cycle = s.on + s.off;
        const extend: Series =
          s.end.kind === 'cycles'
            ? { ...s, end: { kind: 'cycles', n: s.end.n + 1 } }
            : s.end.kind === 'date'
              ? { ...s, end: { kind: 'date', date: addDays(s.end.date, cycle) } }
              : { ...s, horizon: addDays(s.horizon ?? addDays(s.start, UFN_WEEKS * 7), UFN_WEEKS * 7) };
        const more = occurrences({ ...extend, horizon: extend.horizon }).length - occurrences(s).length;
        const named = s.slots.filter(x => x.workerId).map(x => workerOf(x.workerId)?.name.split(' ')[0]);
        return (
          <div key={s.id} className="srow" data-series={s.id}>
            <div className="sinfo">
              <b>
                <Icon name="repeat" size={14} /> {s.label}
              </b>
              <small>
                {s.slots.length} people
                {named.length ? ` (${named.slice(0, 3).join(', ')}${named.length > 3 ? '…' : ''})` : ''} ·{' '}
                {patternText(s)} · {s.offMode === 'keep' ? 'room kept on off days' : 'room released on off days'}
              </small>
              <small>
                {stays.length} stays · {fmt(stays[0].arrival)} → {last.departure ? fmt(last.departure) : 'open'}
                {s.end.kind === 'ufn' ? ' · until further notice' : ''} · {rooms.slice(0, 5).join(', ')}
                {rooms.length > 5 ? '…' : ''}
              </small>
            </div>
            <div className="sact">
              <button
                className="btn ghost"
                onClick={() =>
                  run(
                    extend,
                    'extended',
                    'Extend this crew booking?',
                    `Adds ${more > 0 ? more : 'more'} rotation${more === 1 ? '' : 's'} for each of the ${s.slots.length} people, in the same rooms.`,
                  )
                }
              >
                Extend
              </button>
              <button
                className="btn ghost"
                onClick={() => {
                  setEditing(editing === s.id ? null : s.id);
                  setEndDate(last.departure ?? T);
                }}
              >
                Change end
              </button>
              <button
                className="btn ghost red"
                onClick={() =>
                  run(
                    { ...s, end: { kind: 'date', date: T }, cancelledFrom: T },
                    'cancelled',
                    'Cancel the rest of this crew booking?',
                    `Removes every stay from today on. Anyone already in their room stays booked until today. You can undo this straight away.`,
                  )
                }
              >
                Cancel rest
              </button>
            </div>
            {editing === s.id && (
              <div className="sedit">
                <label htmlFor={'se-' + s.id}>New end date</label>
                <DateField id={'se-' + s.id} value={endDate} onChange={setEndDate} min={T} />
                <button
                  className="btn primary"
                  onClick={() =>
                    run(
                      { ...s, end: { kind: 'date', date: endDate } },
                      endDate < (last.departure ?? '9') ? 'shortened' : 'extended',
                      `End this crew booking on ${fmt(endDate)}?`,
                      'Stays after the new end are removed; the last block is cut to the new end. Stays you changed by hand are kept if they still fit.',
                    )
                  }
                >
                  Apply
                </button>
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}
