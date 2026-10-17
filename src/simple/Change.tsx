// Simple mode (mockup): change a booking. One big card, big buttons, one question per change.
// Every change is checked in plain words BEFORE saving, with the nearest free room offered.
import { useState } from 'react';
import type { ReactNode } from 'react';
import { data, useDB, getDB, me, stayLabel } from '../data';
import type { Stay, StayInput } from '../data';
import { addDays, diffDays, fmt, londonToday } from '../dates';
import { Box, Chip, DateNudge, Note } from './parts';
import { WhoPick } from './Who';
import { RoomCard, RoomGroups, resolveWho } from './Book';
import type { Notify } from './Book';
import {
  checkBatch,
  crewOf,
  fixByMoving,
  freeIn,
  leaveOn,
  nearestFree,
  roomText,
  saveOrder,
  shift,
  splitPlan,
  suggestBlock,
  toInput,
} from './logic';

type Q =
  | null
  | 'early'
  | 'longer'
  | 'dates'
  | 'move'
  | 'swap'
  | 'cancel'
  | 'crew'
  | 'crew-early'
  | 'crew-longer'
  | 'crew-shift'
  | 'crew-move'
  | 'crew-cancel';

const err = (e: unknown) => (e instanceof Error ? e.message : String(e));
const depOf = (s: Stay) => (s.depStatus === 'tbc' || s.depStatus === 'ufn' ? null : s.departure);

/** Save a batch of stay changes in a safe order. If one fails, the ones already saved are undone. */
async function applyBatch(inputs: StayInput[], later: boolean): Promise<number> {
  let done = 0;
  try {
    for (const i of saveOrder(inputs, later)) {
      const cur = getDB().stays.find(s => s.id === i.id);
      await data.saveStay({ ...i, version: cur?.version ?? i.version });
      done++;
    }
  } catch (e) {
    for (let k = 0; k < done; k++) await data.undo();
    throw e;
  }
  return done;
}

export function Change({
  id,
  onHome,
  notify,
  onDetails,
}: {
  id: string;
  onHome: () => void;
  notify: Notify;
  onDetails?: (s: Stay) => void;
}) {
  const db = useDB();
  const stay = db.stays.find(s => s.id === id);
  const [q, setQ] = useState<Q>(null);
  const [dir, setDir] = useState<1 | -1>(1);
  const [arr, setArr] = useState('');
  const [dep, setDep] = useState<string | null>(null);
  const [days, setDays] = useState(1);
  const [prop, setProp] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const T = londonToday();
  const canEdit = me().role !== 'cleaner';

  if (!stay)
    return (
      <Box
        step="missing"
        title="This booking is no longer there"
        sub="It may have been cancelled or undone."
        onClose={onHome}
      >
        <button className="s-btn big" onClick={onHome}>
          Home
        </button>
      </Box>
    );

  const room = db.rooms.find(r => r.id === stay.roomId)!;
  const prop0 = db.properties.find(p => p.id === room.propertyId)!;
  const crew = crewOf(db, stay);
  const series = stay.seriesId ? db.series?.find(s => s.id === stay.seriesId) : undefined;
  const sDep = depOf(stay);
  const open = (k: Q, init?: () => void) => {
    init?.();
    setProblem('');
    setDir(1);
    setQ(k);
  };
  const back = (to: Q = null) => {
    setProblem('');
    setDir(-1);
    setQ(to);
  };
  const run = async (inputs: StayInput[], later: boolean, msg: string, after: Q = null) => {
    setBusy(true);
    setProblem('');
    try {
      const n = await applyBatch(inputs, later);
      notify(msg, n);
      back(after);
    } catch (e) {
      setProblem(err(e));
    } finally {
      setBusy(false);
    }
  };

  /** Plain-language check + Save, with a one-tap fix when a room is taken. */
  const saveBar = (inputs: StayInput[], later: boolean, msg: string, after: Q = null, first?: ReactNode) => {
    const ids = inputs.map(i => i.id!);
    const probs = checkBatch(db, inputs, ids);
    if (!probs.length)
      return (
        <>
          <Note tone="ok">
            {inputs.length > 1
              ? `All ${inputs.length} rooms are free for these dates.`
              : 'The room is free for these dates.'}
          </Note>
          <button className="s-btn big" disabled={busy} onClick={() => run(inputs, later, msg, after)}>
            Save
          </button>
          {problem && <Note tone="bad">{problem}</Note>}
        </>
      );
    const fixed = fixByMoving(db, inputs, probs, ids);
    const one = inputs.length === 1;
    const alt = one && fixed ? db.rooms.find(r => r.id === fixed[0].roomId) : null;
    return (
      <>
        <Note tone="bad">
          <b>Can’t save yet.</b>{' '}
          {probs.slice(0, 3).map(p => (
            <span key={p.index} className="s-line">
              {p.text}
            </span>
          ))}
          {probs.length > 3 && <span className="s-line">…and {probs.length - 3} more.</span>}
        </Note>
        {first}
        {fixed ? (
          <>
            <Note tone="warn">
              {one && alt
                ? `${roomText(db, alt.id)} is free for these dates.`
                : `Free rooms found for the ${probs.length} ${probs.length === 1 ? 'person' : 'people'} affected.`}
            </Note>
            <button
              className="s-btn big"
              disabled={busy}
              onClick={() =>
                run(fixed, later, msg + (one && alt ? ` · moved to ${alt.name}` : ' · some rooms moved'), after)
              }
            >
              {first ? 'Or: ' : ''}
              {one && alt
                ? `Move the whole stay to ${alt.name} and save`
                : `Move ${probs.length} to free rooms and save`}
            </button>
          </>
        ) : (
          <Note tone="warn">No free room for those dates. Try other dates, or ask about More rooms.</Note>
        )}
        {problem && <Note tone="bad">{problem}</Note>}
      </>
    );
  };

  const head = (
    <div className="s-mini">
      <b>{stayLabel(stay)}</b> · {room.name}, {prop0.short} · {fmt(stay.arrival)} → {sDep ? fmt(sDep) : 'TBC'}
    </div>
  );

  // ---------- one booking ----------
  if (q === 'early' || q === 'longer') {
    const input = leaveOn(stay, dep);
    const split = q === 'longer' && checkBatch(db, [input], [stay.id]).length ? splitPlan(db, stay, dep!) : null;
    const splitUI = split && (
      <>
        <Note tone="ok">
          <b>Best option:</b>{' '}
          {split.nightsKept > 0
            ? `stay in ${room.name} until ${fmt(split.cutoff)} (${split.nightsKept} more night${split.nightsKept === 1 ? '' : 's'}), then`
            : `stay in ${room.name} until ${fmt(split.cutoff)} as booked, then`}{' '}
          {roomText(db, split.room.id)} for the last {diffDays(split.cutoff, dep!)} night
          {diffDays(split.cutoff, dep!) === 1 ? '' : 's'}.
        </Note>
        <button
          className="s-btn big"
          disabled={busy}
          onClick={() =>
            run(
              [split.keep, split.extra],
              false,
              `Saved · ${room.name} until ${fmt(split.cutoff)}, then ${split.room.name}`,
            )
          }
        >
          Keep {room.name}, extra nights in {split.room.name}
        </button>
      </>
    );
    return (
      <Box
        step={q}
        dir={dir}
        onBack={() => back()}
        title={q === 'early' ? 'Leaving early: which day now?' : 'Staying longer: until when?'}
        sub={head}
      >
        <DateNudge label="Leaving" value={dep!} onChange={setDep} min={addDays(stay.arrival, 1)} from={stay.arrival} />
        <p className="s-muted">
          {diffDays(stay.arrival, dep!)} nights{sDep ? ` (was ${diffDays(stay.arrival, sDep)})` : ''}
        </p>
        {saveBar([input], false, `Saved · now leaving ${fmt(dep!)}`, null, splitUI)}
      </Box>
    );
  }
  if (q === 'dates') {
    const input: StayInput = {
      ...toInput(stay),
      arrival: arr,
      ...(dep
        ? { departure: dep, depStatus: stay.depStatus === 'tbc' ? 'planned' : stay.depStatus }
        : { departure: null, depStatus: 'tbc' }),
      away: null,
    };
    return (
      <Box step="dates" dir={dir} onBack={() => back()} title="New dates?" sub={head}>
        <DateNudge
          label="Arriving"
          value={arr}
          onChange={d => {
            if (dep) setDep(addDays(dep, diffDays(arr, d)));
            setArr(d);
          }}
        />
        {dep ? (
          <DateNudge label="Leaving" value={dep} onChange={setDep} min={addDays(arr, 1)} from={arr} />
        ) : (
          <button className="s-btn ghost big" onClick={() => setDep(addDays(arr, 7))}>
            Set a leaving date
          </button>
        )}
        <p className="s-muted">
          {dep ? `${diffDays(arr, dep)} nights · moving the arrival moves the whole stay` : 'Leaving date to follow'}
        </p>
        {saveBar([input], arr > stay.arrival, `Saved · ${fmt(arr)} → ${dep ? fmt(dep) : 'TBC'}`)}
      </Box>
    );
  }
  if (q === 'move') {
    const free = freeIn(db, stay.arrival, sDep, [stay.id]).filter(r => r.id !== stay.roomId);
    return (
      <Box
        step="move"
        dir={dir}
        onBack={() => back()}
        title="Move to which room?"
        sub={<>{head}Only rooms free for the whole stay are shown. Tap one to move.</>}
      >
        {!free.length && <Note tone="warn">No other room is free for the whole stay.</Note>}
        {problem && <Note tone="bad">{problem}</Note>}
        <RoomGroups
          db={db}
          rooms={free}
          render={r => (
            <RoomCard
              key={r.id}
              r={r}
              onClick={() =>
                !busy && run([{ ...toInput(stay), roomId: r.id }], false, `Moved to ${roomText(db, r.id)}`)
              }
            />
          )}
        />
      </Box>
    );
  }
  if (q === 'swap')
    return (
      <Box step="swap" dir={dir} onBack={() => back()} title="Who is staying instead?" sub={head}>
        {problem && <Note tone="bad">{problem}</Note>}
        <WhoPick
          onPick={async w => {
            setBusy(true);
            try {
              const p = await resolveWho(w);
              await run(
                [{ ...toInput(stay), ...p }],
                false,
                'Saved · ' + (p.workerId ? getDB().workers.find(x => x.id === p.workerId)!.name : 'Name TBC'),
              );
            } finally {
              setBusy(false);
            }
          }}
        />
      </Box>
    );
  if (q === 'cancel')
    return (
      <Box step="cancel" dir={dir} onBack={() => back()} title={`Cancel ${stayLabel(stay)}’s stay?`} sub={head}>
        <p className="s-muted">The room becomes free. You can undo straight after.</p>
        <button
          className="s-btn big red"
          disabled={busy}
          onClick={async () => {
            await data.deleteStay(stay.id);
            notify(`Cancelled · ${room.name} is free`, 1);
            onHome();
          }}
        >
          Yes, cancel it
        </button>
        <button className="s-btn ghost big" onClick={() => back()}>
          No, keep it
        </button>
      </Box>
    );

  // ---------- the whole crew (everyone arriving together in this crew booking) ----------
  const ids = crew.map(s => s.id);
  const crewHead = (
    <div className="s-mini">
      <b>{series?.label ?? 'Crew'}</b> · {crew.length} people · {fmt(stay.arrival)} → {sDep ? fmt(sDep) : 'TBC'}
    </div>
  );
  if (q === 'crew')
    return (
      <Box step="crew" dir={dir} onBack={() => back()} title="Change the whole crew" sub={crewHead}>
        <div className="s-pills">
          {crew.map(s => (
            <span className="s-pill" key={s.id}>
              {db.rooms.find(r => r.id === s.roomId)!.name} · {stayLabel(s).split(' ')[0]}
            </span>
          ))}
        </div>
        <div className="s-actions">
          <button
            className="s-act"
            onClick={() => open('crew-early', () => setDep(addDays(sDep ?? addDays(stay.arrival, 8), -1)))}
          >
            <b>All leaving early</b>
          </button>
          <button
            className="s-act"
            onClick={() => open('crew-longer', () => setDep(addDays(sDep ?? addDays(stay.arrival, 6), 1)))}
          >
            <b>All staying longer</b>
          </button>
          <button className="s-act" onClick={() => open('crew-shift', () => setDays(1))}>
            <b>Shift all dates</b>
          </button>
          <button className="s-act" onClick={() => open('crew-move', () => setProp(''))}>
            <b>Move all rooms</b>
          </button>
          <button className="s-act red" onClick={() => open('crew-cancel')}>
            <b>Cancel the crew</b>
          </button>
        </div>
      </Box>
    );
  if (q === 'crew-early' || q === 'crew-longer') {
    const inputs = crew.map(s => leaveOn(s, dep));
    return (
      <Box
        step={q}
        dir={dir}
        onBack={() => back('crew')}
        title={q === 'crew-early' ? 'Everyone leaving early: which day?' : 'Everyone staying longer: until when?'}
        sub={crewHead}
      >
        <DateNudge
          label="Everyone leaves"
          value={dep!}
          onChange={setDep}
          min={addDays(stay.arrival, 1)}
          from={stay.arrival}
        />
        {saveBar(inputs, false, `Saved · ${crew.length} people now leave ${fmt(dep!)}`)}
      </Box>
    );
  }
  if (q === 'crew-shift') {
    const inputs = crew.map(s => shift(s, days));
    return (
      <Box step="crew-shift" dir={dir} onBack={() => back('crew')} title="Move everyone’s dates by…" sub={crewHead}>
        <div className="s-count">
          <button
            className="s-round big"
            onClick={() => setDays(days - 1 === 0 ? -1 : days - 1)}
            aria-label="One day earlier"
          >
            −
          </button>
          <output aria-live="polite">
            {days > 0 ? '+' : ''}
            {days}
            <small>{Math.abs(days) === 1 ? 'day' : 'days'}</small>
          </output>
          <button
            className="s-round big"
            onClick={() => setDays(days + 1 === 0 ? 1 : days + 1)}
            aria-label="One day later"
          >
            +
          </button>
        </div>
        <p className="s-big">
          Arriving {fmt(inputs[0].arrival)} → {inputs[0].departure ? fmt(inputs[0].departure) : 'TBC'}
        </p>
        {saveBar(
          inputs,
          days > 0,
          `Saved · ${crew.length} people moved ${days > 0 ? 'later' : 'earlier'} by ${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'}`,
        )}
      </Box>
    );
  }
  if (q === 'crew-move') {
    const props = db.properties.filter(p => p.contracted);
    const sug = prop ? suggestBlock(db, crew.length, stay.arrival, sDep, ids, prop) : [];
    const inputs = sug.length === crew.length ? crew.map((s, i) => ({ ...toInput(s), roomId: sug[i].id })) : [];
    return (
      <Box step="crew-move" dir={dir} onBack={() => back('crew')} title="Move the crew to…" sub={crewHead}>
        <div className="s-chips two">
          {props.map(p => (
            <Chip
              key={p.id}
              on={prop === p.id}
              onClick={() => setProp(p.id)}
              small={`${freeIn(db, stay.arrival, sDep, ids).filter(r => r.propertyId === p.id).length} rooms free`}
            >
              {p.short}
            </Chip>
          ))}
        </div>
        {prop && !inputs.length && (
          <Note tone="warn">Not enough free rooms there for all {crew.length}. Try the other house.</Note>
        )}
        {inputs.length > 0 && (
          <>
            <div className="s-moves">
              {crew.map((s, i) => (
                <span key={s.id}>
                  {stayLabel(s)}: {db.rooms.find(r => r.id === s.roomId)!.name} → <b>{sug[i].name}</b>
                </span>
              ))}
            </div>
            {saveBar(inputs, false, `Saved · crew moved to ${db.properties.find(p => p.id === prop)!.short}`, 'crew')}
          </>
        )}
      </Box>
    );
  }
  if (q === 'crew-cancel')
    return (
      <Box
        step="crew-cancel"
        dir={dir}
        onBack={() => back('crew')}
        title={`Cancel all ${crew.length} rooms?`}
        sub={crewHead}
      >
        <p className="s-muted">
          Every room in this crew booking for these dates becomes free. You can undo straight after.
        </p>
        <button
          className="s-btn big red"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            for (const s of crew) await data.deleteStay(s.id);
            notify(`Cancelled · ${crew.length} rooms free`, crew.length);
            onHome();
          }}
        >
          Yes, cancel all {crew.length}
        </button>
        <button className="s-btn ghost big" onClick={() => back('crew')}>
          No, keep them
        </button>
      </Box>
    );

  // ---------- the card ----------
  const nights = sDep ? diffDays(stay.arrival, sDep) : null;
  const status =
    stay.arrival > T
      ? `Arrives in ${diffDays(T, stay.arrival)} day${diffDays(T, stay.arrival) === 1 ? '' : 's'}`
      : sDep && sDep <= T
        ? 'Has left'
        : sDep === T
          ? 'Leaves today'
          : 'In the room now';
  const nf = nearestFree(db, stay.roomId, stay.arrival, sDep, [stay.id]);
  return (
    <Box step="card" dir={dir} title={stayLabel(stay)} onClose={onHome}>
      <div className="s-card">
        <div className="s-cardrow">
          <span className="s-lbl">Room</span>
          <b>
            {room.name} · {prop0.short}
          </b>
        </div>
        <div className="s-cardrow two">
          <div>
            <span className="s-lbl">Arrives</span>
            <b>{fmt(stay.arrival)}</b>
          </div>
          <div>
            <span className="s-lbl">Leaves</span>
            <b>{sDep ? fmt(sDep) : 'To follow'}</b>
          </div>
        </div>
        <div className="s-tags">
          <span className="s-tag">{status}</span>
          {nights !== null && <span className="s-tag">{nights} nights</span>}
          {!stay.workerId && <span className="s-tag pu">Name TBC</span>}
          {series && <span className="s-tag sk">{series.label}</span>}
        </div>
        {stay.notes && <p className="s-muted pre">{stay.notes}</p>}
      </div>
      {canEdit ? (
        <>
          <div className="s-actions">
            <button
              className="s-act am"
              onClick={() => open('early', () => setDep(addDays(sDep ?? addDays(stay.arrival, 8), -1)))}
              disabled={!sDep || diffDays(stay.arrival, sDep) < 2}
            >
              <b>Leaving early</b>
            </button>
            <button
              className="s-act em"
              onClick={() => open('longer', () => setDep(addDays(sDep ?? addDays(stay.arrival, 6), 1)))}
            >
              <b>Staying longer</b>
            </button>
            <button className="s-act" onClick={() => open('dates', () => (setArr(stay.arrival), setDep(sDep)))}>
              <b>Change dates</b>
            </button>
            <button className="s-act" onClick={() => open('move')} disabled={!nf}>
              <b>Move room</b>
            </button>
            <button className="s-act" onClick={() => open('swap')}>
              <b>{stay.workerId ? 'Swap person' : 'Add the name'}</b>
            </button>
            <button className="s-act red" onClick={() => open('cancel')}>
              <b>Cancel</b>
            </button>
          </div>
          {crew.length > 1 && (
            <button className="s-btn big sk" onClick={() => open('crew')}>
              Change whole crew ({crew.length} people)
            </button>
          )}
        </>
      ) : (
        <p className="s-muted">Only the booker and the provider can change bookings.</p>
      )}
      {onDetails && canEdit && (
        <button className="s-link" onClick={() => onDetails(stay)}>
          All details (classic form)
        </button>
      )}
    </Box>
  );
}
