// Simple mode: book a room one question at a time. Only room + dates are required.
import { useState } from 'react';
import { data, useDB, getDB, bathText, me } from '../data';
import type { DB, Room, StayInput } from '../data';
import { usualRoom, planCrew, planInputs } from '../data/crew';
import type { RotationEnd, OffMode } from '../data/rotation';
import { addDays, diffDays, fmt, londonToday } from '../dates';
import { Box, Calendar, Chip, Note } from './parts';
import { WhoPick } from './Who';
import type { WhoAnswer } from './Who';
import { freeIn, suggestBlock, roomText, roomNum } from './logic';
import { CONTRACT_LINE, estimate, estimateLine, gbp, priced, rate, PRICE_NOTE } from '../data/pricing';

type Step = 'who' | 'count' | 'arrive' | 'leave' | 'room' | 'done';
type Extra = null | 'phone' | 'email' | 'note' | 'rota' | 'rota-len' | 'rota-off';
export type Notify = (text: string, undoSteps?: number) => void;

const nextMonday = (t: string) => {
  const wd = (new Date(t + 'T00:00Z').getUTCDay() + 6) % 7;
  return addDays(t, 7 - wd);
};
const err = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * A typed new name becomes a saved worker (the workers list Sheena holds). `privateName`: Donald's own guest in
 * an extra property stays a name on that booking only, never added to the shared workers list.
 */
export async function resolveWho(
  w: WhoAnswer,
  privateName = false,
): Promise<{ workerId: string | null; holdLabel: string }> {
  if (w.kind === 'worker') return { workerId: w.id, holdLabel: '' };
  if (w.kind === 'name' && privateName) return { workerId: null, holdLabel: w.name };
  if (w.kind === 'name') {
    const nw = await data.upsertWorker({ name: w.name, company: 'RJ McLeod', phone: '' });
    return { workerId: nw.id, holdLabel: '' };
  }
  return { workerId: null, holdLabel: 'Name TBC' };
}
export const whoText = (db: DB, w: WhoAnswer | null) =>
  !w
    ? ''
    : w.kind === 'worker'
      ? (db.workers.find(x => x.id === w.id)?.name ?? '')
      : w.kind === 'name'
        ? w.name
        : w.kind === 'tbc'
          ? 'Name TBC'
          : `A crew of ${w.n}`;

export function RoomCard({ r, onClick, on, tag }: { r: Room; onClick: () => void; on?: boolean; tag?: string }) {
  return (
    <button className={'s-room' + (on ? ' on' : '')} onClick={onClick} aria-pressed={on} data-room={r.id}>
      {r.photo ? (
        <img src={r.photo} alt="" loading="lazy" />
      ) : (
        <span className="s-noimg" aria-hidden>
          {roomNum(r)}
        </span>
      )}
      <span className="s-roomtxt">
        <b>{r.name}</b>
        <small>
          {r.floor} · {bathText(r)}
        </small>
        {tag && <em>{tag}</em>}
      </span>
      {on && (
        <span className="s-tick" aria-hidden>
          ✓
        </span>
      )}
    </button>
  );
}

export function RoomGroups({ db, rooms, render }: { db: DB; rooms: Room[]; render: (r: Room) => JSX.Element }) {
  return (
    <>
      {db.properties
        .filter(p => p.contracted && rooms.some(r => r.propertyId === p.id))
        .map(p => (
          <div key={p.id} className="s-group">
            <span className="s-lbl">
              {p.name} · {rooms.filter(r => r.propertyId === p.id).length} free
            </span>
            <div className="s-rooms">{rooms.filter(r => r.propertyId === p.id).map(render)}</div>
          </div>
        ))}
    </>
  );
}

/** What the caller already knows (e.g. tapped an empty room on a day). Known answers skip their question. */
export interface BookInit {
  roomId?: string;
  date?: string;
  departure?: string | null;
  workerId?: string;
  hold?: boolean;
}
type Vals = { who: WhoAnswer | null; arrival: string | null; dep: string | null | undefined };

export function Book({
  onExit,
  notify,
  init = {},
  onOpenStay = id => (location.hash = 'simple/stay/' + id),
  onRestart = () => location.reload(),
}: {
  onExit: () => void;
  notify: Notify;
  init?: BookInit;
  onOpenStay?: (id: string) => void;
  onRestart?: () => void;
}) {
  const db = useDB();
  const T = londonToday();
  const presetWho = !!init.workerId || !!init.hold;
  const presetRoom = init.roomId && db.rooms.some(r => r.id === init.roomId) ? init.roomId : undefined;
  // an extra property (Harris, Uig, Monadh, Abhainn): the same flow, booked whole, never a crew or another room
  const extraP = presetRoom
    ? db.properties.find(p => p.id === db.rooms.find(r => r.id === presetRoom)!.propertyId && !p.contracted)
    : undefined;
  const [unlockArr, setUnlockArr] = useState(false);
  const lockArrival = !!init.date && (!!presetRoom || init.departure !== undefined || !!init.hold) && !unlockArr;
  const lockDeparture = init.departure !== undefined;
  const [roomNeeded, setRoomNeeded] = useState(false);
  const flowFor = (w: WhoAnswer | null, needRoom = roomNeeded): Step[] => {
    const f: Step[] = [];
    if (!presetWho) f.push('who');
    if (w?.kind === 'crew') f.push('count');
    if (!lockArrival) f.push('arrive');
    if (!lockDeparture) f.push('leave');
    if (!presetRoom || w?.kind === 'crew' || needRoom) f.push('room');
    return f;
  };
  const initWho: WhoAnswer | null = init.workerId
    ? { kind: 'worker', id: init.workerId }
    : init.hold
      ? { kind: 'tbc' }
      : null;
  const [step, setStep] = useState<Step>(() => flowFor(initWho, false)[0] ?? 'room');
  const [dir, setDir] = useState<1 | -1>(1);
  const [who, setWho] = useState<WhoAnswer | null>(initWho);
  const [n, setN] = useState(12);
  const [arrival, setArrival] = useState<string | null>(init.date ?? null);
  const [departure, setDeparture] = useState<string | null | undefined>(init.departure);
  const [picked, setPicked] = useState<string[] | null>(null);
  const [choose, setChoose] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const [created, setCreated] = useState<string[]>([]);
  const [since, setSince] = useState(0);
  const [extra, setExtra] = useState<Extra>(null);
  const [doneExtras, setDoneExtras] = useState<string[]>([]);
  const [text, setText] = useState('');
  const [rota, setRota] = useState<{ on: number; off: number; end?: RotationEnd }>({ on: 10, off: 4 });

  const crew = who?.kind === 'crew';
  const flow = flowFor(who);
  const go = (s: Step, d: 1 | -1 = 1) => {
    setDir(d);
    setProblem('');
    setStep(s);
  };
  /** Next question, or, when the room was given and is free, hold it straight away. */
  const advance = (from: Step, v: Vals) => {
    const f = flowFor(v.who);
    const nxt = f[f.indexOf(from) + 1];
    if (nxt) return go(nxt);
    // an extra is booked whole: try it straight away (a clash is explained on the question, no room list)
    if (extraP && v.arrival) return void hold([presetRoom!], v);
    if (presetRoom && v.arrival && v.who?.kind !== 'crew') {
      const free = freeIn(getDB(), v.arrival, v.dep ?? null).some(r => r.id === presetRoom);
      if (free) return void hold([presetRoom], v);
      setRoomNeeded(true);
      return go('room');
    }
    go('room');
  };
  const vals = (): Vals => ({ who, arrival, dep: departure });
  const back = () => {
    const i = flow.indexOf(step);
    if (i <= 0) onExit();
    else go(flow[i - 1], -1);
  };
  const dots = step === 'done' ? undefined : { n: flow.length, at: flow.indexOf(step) };
  const dep = departure ?? null;
  const nightsTxt = arrival && dep ? `${diffDays(arrival, dep)} nights` : 'leaving date to follow';
  const presetR = presetRoom ? db.rooms.find(r => r.id === presetRoom) : undefined;
  const summary = [
    presetR && !roomNeeded && !crew
      ? `${presetR.name}, ${db.properties.find(p => p.id === presetR.propertyId)!.short}`
      : '',
    whoText(db, who),
    arrival && fmt(arrival) + (departure === undefined ? '' : dep ? ' → ' + fmt(dep) : ' → leaving date to follow'),
  ]
    .filter(Boolean)
    .join(' · ');

  async function hold(roomIds: string[], v: Vals = vals()) {
    const { who, arrival } = v;
    const dep = v.dep ?? null;
    if (!arrival || !who) return;
    setBusy(true);
    setProblem('');
    try {
      const base = {
        arrival,
        departure: dep,
        depStatus: dep ? ('planned' as const) : extraP ? ('ufn' as const) : ('tbc' as const),
        away: null,
        notes: '',
      };
      if (who.kind === 'crew') {
        const rooms = roomIds.map(id => getDB().rooms.find(r => r.id === id)!);
        const inputs: StayInput[] = rooms.map((r, i) => ({
          ...base,
          roomId: r.id,
          workerId: null,
          holdLabel: `Name TBC ${i + 1}`,
          slot: i,
        }));
        const s = await data.createSeries(
          {
            label: `Crew of ${rooms.length}`,
            propertyId: rooms[0].propertyId,
            start: arrival,
            on: dep ? diffDays(arrival, dep) : 0,
            off: 0,
            offMode: 'release',
            end: { kind: 'cycles', n: 1 },
            slots: inputs.map(i => ({ slot: i.slot!, workerId: null, label: i.holdLabel })),
          },
          inputs,
        );
        setCreated(
          getDB()
            .stays.filter(x => x.seriesId === s.id)
            .map(x => x.id),
        );
        notify(`${rooms.length} rooms held`, 1);
      } else {
        const p = await resolveWho(who, !!extraP && me().role === 'manager');
        const s = await data.saveStay({ ...base, roomId: roomIds[0], ...p });
        setCreated([s.id]);
        notify(extraP ? `${extraP.name} booked` : `${roomText(getDB(), s.roomId)} held`, 1);
      }
      setSince(0);
      go('done');
    } catch (e) {
      setProblem(err(e));
      // an extra is booked whole: stay on the question and explain (no contract rooms offered instead)
      if (extraP) return setStep('who');
      if (presetRoom) setRoomNeeded(true);
      setStep('room');
    } finally {
      setBusy(false);
    }
  }

  const stays = created.map(id => db.stays.find(s => s.id === id)).filter(s => !!s);
  const bump = () => setSince(x => x + 1);
  const finishExtra = (k: string) => {
    setDoneExtras(x => [...x, k]);
    setText('');
    setDir(-1);
    setExtra(null);
  };

  async function saveExtra(k: 'phone' | 'email' | 'note') {
    const v = text.trim();
    if (!v) return finishExtra(k);
    setBusy(true);
    try {
      for (const s of stays) {
        if (k === 'phone' && s.workerId) {
          const w = getDB().workers.find(x => x.id === s.workerId)!;
          await data.upsertWorker({ id: w.id, name: w.name, phone: v });
          continue;
        }
        const add = k === 'phone' ? `Phone: ${v}` : k === 'email' ? `Email: ${v}` : v;
        const cur = getDB().stays.find(x => x.id === s.id)!;
        await data.saveStay({
          id: cur.id,
          version: cur.version,
          roomId: cur.roomId,
          workerId: cur.workerId,
          holdLabel: cur.holdLabel,
          arrival: cur.arrival,
          departure: cur.departure,
          depStatus: cur.depStatus,
          away: cur.away ?? null,
          notes: cur.notes ? cur.notes + '\n' + add : add,
          seriesId: cur.seriesId ?? null,
          slot: cur.slot ?? null,
        });
        bump();
      }
      finishExtra(k);
    } catch (e) {
      setProblem(err(e));
    } finally {
      setBusy(false);
    }
  }

  async function saveRota(offMode: OffMode) {
    if (!arrival || !rota.end || !stays.length) return;
    setBusy(true);
    setProblem('');
    const x = getDB();
    const ids = stays.map(s => s.id);
    const ordered = [...stays.filter(s => s.workerId), ...stays.filter(s => !s.workerId)];
    const override: Record<number, string> = {};
    ordered.forEach((s, i) => (override[i] = s.roomId));
    const plan = planCrew(
      { ...x, stays: x.stays.filter(s => !ids.includes(s.id)) },
      {
        propertyId: x.rooms.find(r => r.id === ordered[0].roomId)!.propertyId,
        roomIds: [],
        workerIds: ordered.filter(s => s.workerId).map(s => s.workerId!),
        holds: ordered.filter(s => !s.workerId).length,
        pattern: { start: arrival, on: rota.on, off: rota.off, end: rota.end, offMode },
        roomOverride: override,
      },
    );
    const bad = plan.slots.flatMap(s => s.occ.filter(o => o.problem).map(o => ({ s, o })))[0];
    if (bad) {
      setBusy(false);
      return setProblem(
        `That rota does not fit: ${roomText(x, bad.s.roomId!)} is not free from ${fmt(bad.o.arrival)} (${bad.o.problem}). Try a shorter rota, or use the full Crew screen to pick rooms.`,
      );
    }
    const label = crew ? `Crew of ${stays.length}` : whoText(x, who);
    const notes = ordered[0].notes;
    try {
      if (since === 0 && data.canUndo()) await data.undo();
      else for (const id of ids) await data.deleteStay(id);
      const s = await data.createSeries(
        {
          label,
          propertyId: x.rooms.find(r => r.id === ordered[0].roomId)!.propertyId,
          start: arrival,
          on: rota.on,
          off: rota.off,
          offMode,
          end: rota.end,
          slots: plan.slots.map(p => ({ slot: p.slot, workerId: p.workerId, label: p.label })),
        },
        planInputs(plan, '', notes),
      );
      const all = getDB().stays.filter(y => y.seriesId === s.id);
      setCreated(all.filter(y => y.arrival === arrival).map(y => y.id));
      notify(`Rota saved · ${all.length} stays`, 1);
      setSince(0);
      finishExtra('rota');
    } catch (e) {
      setProblem('Could not save the rota: ' + err(e) + ' The original hold may need booking again.');
    } finally {
      setBusy(false);
    }
  }

  // ---------- the questions ----------
  if (step === 'who')
    return (
      <Box
        step="who"
        dir={dir}
        dots={dots}
        onBack={back}
        onClose={onExit}
        title="Who is staying?"
        sub={
          presetR || arrival
            ? `${summary} · name can come later`
            : 'Only the room and dates are needed. Names can come later.'
        }
      >
        <WhoPick
          allowCrew={!extraP}
          onPick={w => {
            setWho(w);
            setPicked(null);
            advance('who', { ...vals(), who: w });
          }}
        />
        {extraP && problem && <Note tone="bad">{problem}</Note>}
      </Box>
    );

  if (step === 'count')
    return (
      <Box
        step="count"
        dir={dir}
        dots={dots}
        onBack={back}
        onClose={onExit}
        title="How many people?"
        sub="Everyone gets the same dates. Names can be added later."
      >
        <div className="s-count">
          <button className="s-round big" onClick={() => setN(Math.max(2, n - 1))} aria-label="One fewer">
            −
          </button>
          <output aria-live="polite">{n}</output>
          <button className="s-round big" onClick={() => setN(Math.min(19, n + 1))} aria-label="One more">
            +
          </button>
        </div>
        <div className="s-chips">
          {[2, 4, 6, 8, 10, 12].map(k => (
            <Chip key={k} on={n === k} onClick={() => setN(k)}>
              {k}
            </Chip>
          ))}
        </div>
        <button
          className="s-btn big"
          onClick={() => {
            setWho({ kind: 'crew', n });
            advance('count', { ...vals(), who: { kind: 'crew', n } });
          }}
        >
          Next →
        </button>
      </Box>
    );

  if (step === 'arrive') {
    const tom = addDays(T, 1);
    const mon = nextMonday(T);
    const pick = (d: string) => {
      setArrival(d);
      const dd = departure && departure <= d ? undefined : departure;
      if (dd !== departure) setDeparture(undefined);
      setTimeout(() => advance('arrive', { who, arrival: d, dep: dd }), 160);
    };
    return (
      <Box
        step="arrive"
        dir={dir}
        dots={dots}
        onBack={back}
        onClose={onExit}
        title="When are they arriving?"
        sub={summary}
      >
        <div className="s-chips three">
          <Chip on={arrival === T} onClick={() => pick(T)} small={fmt(T, { day: 'numeric', month: 'short' })}>
            Today
          </Chip>
          <Chip on={arrival === tom} onClick={() => pick(tom)} small={fmt(tom, { day: 'numeric', month: 'short' })}>
            Tomorrow
          </Chip>
          <Chip on={arrival === mon} onClick={() => pick(mon)} small={fmt(mon, { day: 'numeric', month: 'short' })}>
            Monday
          </Chip>
        </div>
        <Calendar label="Arrival date" value={arrival} min={T} onPick={pick} />
      </Box>
    );
  }

  if (step === 'leave' && arrival) {
    const pick = (d: string | null) => {
      setDeparture(d);
      setTimeout(() => advance('leave', { who, arrival, dep: d }), 160);
    };
    return (
      <Box
        step="leave"
        dir={dir}
        dots={dots}
        onBack={back}
        onClose={onExit}
        title="When are they leaving?"
        sub={
          <>
            {summary}
            {lockArrival && (
              <button
                className="s-link inline"
                onClick={() => {
                  setUnlockArr(true);
                  go('arrive', -1);
                }}
              >
                Change arrival
              </button>
            )}
          </>
        }
      >
        <div className="s-chips four">
          {[3, 7, 10, 14].map(k => (
            <Chip
              key={k}
              on={dep === addDays(arrival, k)}
              onClick={() => pick(addDays(arrival, k))}
              small={fmt(addDays(arrival, k), { day: 'numeric', month: 'short' })}
            >
              {k} nights
            </Chip>
          ))}
        </div>
        <button className={'s-btn ghost big' + (departure === null ? ' on' : '')} onClick={() => pick(null)}>
          Not sure yet · hold it open
        </button>
        <Calendar label="Leaving date" value={dep} from={arrival} min={addDays(arrival, 1)} onPick={pick} />
      </Box>
    );
  }

  if (step === 'room' && arrival && who) {
    const free = freeIn(db, arrival, dep);
    if (crew) {
      const want = who.kind === 'crew' ? who.n : 1;
      const sug = suggestBlock(db, want, arrival, dep);
      const sel = picked ?? sug.map(r => r.id);
      const selRooms = free.filter(r => sel.includes(r.id));
      return (
        <Box
          step="room"
          dir={dir}
          dots={dots}
          onBack={back}
          onClose={onExit}
          title={choose ? 'Tap the rooms to use' : 'These rooms are free together'}
          sub={`${summary} · ${nightsTxt}`}
        >
          {free.length < want && (
            <Note tone="warn">
              Only {free.length} rooms are free for these dates. You can hold {free.length} now and ask about the rest
              on Properties (extra properties).
            </Note>
          )}
          {!choose ? (
            <>
              <div className="s-block">
                {db.properties
                  .filter(p => selRooms.some(r => r.propertyId === p.id))
                  .map(p => (
                    <div key={p.id}>
                      <span className="s-lbl">{p.name}</span>
                      <div className="s-pills">
                        {selRooms
                          .filter(r => r.propertyId === p.id)
                          .map(r => (
                            <span key={r.id} className="s-pill">
                              {r.name}
                            </span>
                          ))}
                      </div>
                    </div>
                  ))}
              </div>
              <button
                className="s-btn big"
                disabled={busy || !selRooms.length}
                onClick={() => hold(selRooms.map(r => r.id))}
              >
                Hold these {selRooms.length} rooms
              </button>
              <button className="s-btn ghost big" onClick={() => setChoose(true)}>
                Choose rooms myself
              </button>
            </>
          ) : (
            <>
              <RoomGroups
                db={db}
                rooms={free}
                render={r => (
                  <RoomCard
                    key={r.id}
                    r={r}
                    on={sel.includes(r.id)}
                    onClick={() => setPicked(sel.includes(r.id) ? sel.filter(x => x !== r.id) : [...sel, r.id])}
                  />
                )}
              />
              <div className="s-sticky">
                <button
                  className="s-btn big"
                  disabled={busy || !selRooms.length}
                  onClick={() => hold(selRooms.map(r => r.id))}
                >
                  Hold {selRooms.length} of {want} rooms
                </button>
              </div>
            </>
          )}
          {problem && <Note tone="bad">{problem}</Note>}
        </Box>
      );
    }
    const usual = who.kind === 'worker' ? usualRoom(db, who.id) : undefined;
    const usualFree = free.find(r => r.id === usual);
    return (
      <Box
        step="room"
        dir={dir}
        dots={dots}
        onBack={back}
        onClose={onExit}
        title="Which room?"
        sub={`${summary} · ${nightsTxt} · tap a room to hold it`}
      >
        {problem && <Note tone="bad">{problem}</Note>}
        {roomNeeded && presetR && !problem && (
          <Note tone="warn">
            {presetR.name} is booked on some of those nights. Pick another room below, or go back and change the dates.
          </Note>
        )}
        {!free.length && (
          <Note tone="warn">
            No rooms are free for those dates. Go back and try other dates, or ask on Properties (extra properties).
          </Note>
        )}
        {usualFree && (
          <div className="s-group">
            <span className="s-lbl">Their usual room</span>
            <div className="s-rooms">
              <RoomCard
                r={usualFree}
                tag={db.properties.find(p => p.id === usualFree.propertyId)!.short}
                onClick={() => hold([usualFree.id])}
              />
            </div>
          </div>
        )}
        <RoomGroups
          db={db}
          rooms={free.filter(r => r !== usualFree)}
          render={r => <RoomCard key={r.id} r={r} onClick={() => !busy && hold([r.id])} />}
        />
      </Box>
    );
  }

  // ---------- done + optional extras ----------
  if (!stays.length)
    return (
      <Box step="gone" title="Nothing is held" sub="The hold was undone.">
        <button className="s-btn big" onClick={onRestart}>
          Book a room
        </button>
        <button className="s-btn ghost big" onClick={onExit}>
          Home
        </button>
      </Box>
    );
  const first = stays[0];
  const single = stays.length === 1;
  const hasWorker = single && !!first.workerId;
  if (extra === 'phone' || extra === 'email' || extra === 'note')
    return (
      <Box
        step={extra}
        dir={1}
        onBack={() => finishExtra('')}
        title={
          extra === 'phone'
            ? 'Phone number?'
            : extra === 'email'
              ? 'Email address?'
              : crew
                ? 'A note for the whole crew?'
                : 'Any notes?'
        }
        sub={
          extra === 'phone' && hasWorker
            ? 'Saved on their worker record for next time.'
            : 'Optional. You can add this later.'
        }
      >
        <form
          className="s-stack"
          onSubmit={e => {
            e.preventDefault();
            saveExtra(extra);
          }}
        >
          {extra === 'note' ? (
            <textarea
              className="s-input"
              rows={3}
              value={text}
              onChange={e => setText(e.target.value)}
              aria-label="Notes"
              placeholder="e.g. Late arrival, van parking"
              autoFocus
            />
          ) : (
            <input
              className="s-input"
              type={extra === 'phone' ? 'tel' : 'email'}
              inputMode={extra === 'phone' ? 'tel' : 'email'}
              value={text}
              onChange={e => setText(e.target.value)}
              aria-label={extra === 'phone' ? 'Phone number' : 'Email address'}
              placeholder={extra === 'phone' ? '07…' : 'name@example.com'}
              autoFocus
            />
          )}
          <button className="s-btn big" type="submit" disabled={busy}>
            Save
          </button>
          <button className="s-btn ghost big" type="button" onClick={() => finishExtra('')}>
            Skip
          </button>
        </form>
        {problem && <Note tone="bad">{problem}</Note>}
      </Box>
    );
  if (extra === 'rota')
    return (
      <Box
        step="rota"
        dir={1}
        onBack={() => finishExtra('')}
        title="How does the rota go?"
        sub="Days on site, then days off. Repeats from the arrival date."
      >
        <div className="s-chips two">
          {[
            [10, 4],
            [14, 7],
            [14, 14],
            [21, 7],
            [7, 7],
            [28, 28],
          ].map(([on, off]) => (
            <Chip
              key={on + '-' + off}
              on={rota.on === on && rota.off === off}
              onClick={() => {
                setRota({ on, off });
                setDir(1);
                setExtra('rota-len');
              }}
            >
              {on} on · {off} off
            </Chip>
          ))}
        </div>
        <button className="s-btn ghost big" onClick={() => finishExtra('')}>
          Skip
        </button>
      </Box>
    );
  if (extra === 'rota-len' && arrival)
    return (
      <Box
        step="rota-len"
        dir={dir}
        onBack={() => setExtra('rota')}
        title="For how long?"
        sub={`${rota.on} on · ${rota.off} off from ${fmt(arrival)}`}
      >
        <div className="s-chips two">
          {(
            [
              ['4 weeks', { kind: 'date', date: addDays(arrival, 28) }],
              ['8 weeks', { kind: 'date', date: addDays(arrival, 56) }],
              ['3 months', { kind: 'date', date: addDays(arrival, 91) }],
              ['6 months', { kind: 'date', date: addDays(arrival, 182) }],
            ] as [string, RotationEnd][]
          ).map(([l, end]) => (
            <Chip
              key={l}
              onClick={() => {
                setRota({ ...rota, end });
                setExtra('rota-off');
              }}
            >
              {l}
            </Chip>
          ))}
          <Chip
            onClick={() => {
              setRota({ ...rota, end: { kind: 'ufn' } });
              setExtra('rota-off');
            }}
            small="12 weeks booked, extend later"
          >
            Until further notice
          </Chip>
        </div>
      </Box>
    );
  if (extra === 'rota-off')
    return (
      <Box
        step="rota-off"
        dir={1}
        onBack={() => setExtra('rota-len')}
        title="On their days off?"
        sub={`${rota.on} on · ${rota.off} off`}
      >
        <div className="s-stack">
          <button className="s-pick" disabled={busy} onClick={() => saveRota('keep')}>
            <b>Keep the room</b>
            <small>Same room every time. No clean between rotations.</small>
          </button>
          <button className="s-pick" disabled={busy} onClick={() => saveRota('release')}>
            <b>Free the room</b>
            <small>Room can be used by others while they are away.</small>
          </button>
        </div>
        {problem && <Note tone="bad">{problem}</Note>}
      </Box>
    );

  const ex = (k: Exclude<Extra, null | 'rota-len' | 'rota-off'>, label: string, sub: string) => (
    <button
      key={k}
      className={'s-extra' + (doneExtras.includes(k) ? ' done' : '')}
      onClick={() => {
        setText('');
        setProblem('');
        setDir(1);
        setExtra(k);
      }}
    >
      <span>
        <b>{label}</b>
        <small>{doneExtras.includes(k) ? 'Added ✓' : sub}</small>
      </span>
      <i aria-hidden>›</i>
    </button>
  );
  const r0 = db.rooms.find(r => r.id === first.roomId)!;
  return (
    <Box
      step="done"
      dir={1}
      title={extraP ? `${extraP.name} booked!` : single ? 'Room held!' : `${stays.length} rooms held!`}
      onClose={onExit}
    >
      <div className="s-held">
        <span className="s-bigtick" aria-hidden>
          ✓
        </span>
        <div>
          <b>
            {single
              ? `${r0.name} · ${db.properties.find(p => p.id === r0.propertyId)!.short}`
              : `${stays.length} rooms · ${[...new Set(stays.map(s => db.properties.find(p => p.id === db.rooms.find(r => r.id === s.roomId)!.propertyId)!.short))].join(' + ')}`}
          </b>
          <span>
            {fmt(first.arrival)} →{' '}
            {first.departure ? fmt(first.departure) : extraP ? 'open-ended' : 'leaving date to follow'}
            {first.departure ? ` · ${diffDays(first.arrival, first.departure)} nights` : ''}
          </span>
          <span>
            {single
              ? (db.workers.find(w => w.id === first.workerId)?.name ?? (first.holdLabel || 'Name TBC'))
              : 'Names to follow'}
          </span>
          {first.seriesId && doneExtras.includes('rota') && <span className="s-tag">Repeats as a rota</span>}
        </div>
      </div>
      {stays.some(s => priced(db.properties.find(p => p.id === db.rooms.find(r => r.id === s.roomId)!.propertyId)!)) ? (
        <div className="price-box" data-price="booking">
          <b>
            {single || !first.departure
              ? estimateLine(
                  db,
                  db.properties.find(p => p.id === r0.propertyId)!,
                  first.departure ? diffDays(first.arrival, first.departure) : null,
                ) + (single ? '' : ` × ${stays.length} rooms`)
              : `Indicative ${gbp(
                  stays.reduce(
                    (t, s) =>
                      t +
                      estimate(
                        db,
                        db.properties.find(p => p.id === db.rooms.find(r => r.id === s.roomId)!.propertyId)!,
                        s.departure ? diffDays(s.arrival, s.departure) : 0,
                      ),
                    0,
                  ),
                )} for ${stays.length} rooms (${gbp(rate(db))} per room per week ÷ 7 per night)`}
          </b>
          <small>{PRICE_NOTE}</small>
        </div>
      ) : (
        // block contract (Eshcol, Loch Roag): no price or estimate, ever
        <div className="price-box contract" data-price="contract">
          <b>{CONTRACT_LINE}</b>
        </div>
      )}
      {extraP && (
        <p className="s-muted" data-x-confirm>
          Booked and confirmed straight away · whole property
          {me().role === 'client' ? ' · Donald has been notified' : ''} · invoiced separately
        </p>
      )}
      <span className="s-lbl">Add more now? All optional</span>
      <div className="s-stack">
        {single && ex('phone', 'Phone number', 'For arrival-day texts')}
        {single && !hasWorker && ex('email', 'Email', 'Optional')}
        {ex('note', crew ? 'Note for the crew' : 'Notes', 'e.g. late arrival, parking')}
        {!doneExtras.includes('rota') && ex('rota', 'Repeat as a rota', 'e.g. 10 days on, 4 days off')}
      </div>
      {problem && <Note tone="bad">{problem}</Note>}
      <div className="s-grid2">
        <button className="s-btn big" onClick={onExit}>
          Done
        </button>
        <button className="s-btn ghost big" onClick={() => onOpenStay(first.id)}>
          Open booking
        </button>
      </div>
    </Box>
  );
}

export type { Room };
