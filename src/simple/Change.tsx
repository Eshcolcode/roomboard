// Quick change: one big card, big buttons, one question per change. Every change is checked in plain words
// BEFORE saving; when a room is taken the best fix is offered first (join / keep room + move extra nights /
// move the whole stay). Each change is saved as ONE command: one Undo, one alert.
import { useState } from 'react';
import { data, useDB, getDB, me, stayLabel } from '../data';
import type { DB, Stay, StayInput } from '../data';
import { addDays, diffDays, fmt, londonToday } from '../dates';
import { Box, Chip, DateNudge, Note } from './parts';
import { WhoPick } from './Who';
import { RoomCard, RoomGroups, resolveWho } from './Book';
import type { Notify } from './Book';
import {
  assignRooms,
  checkBatch,
  crewOf,
  crewSplitPlan,
  fixByMoving,
  freeIn,
  futureOf,
  joinPlan,
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
const plural = (n: number, w: string) => `${n} ${n === 1 ? w : w === 'person' ? 'people' : w + 's'}`;

interface Fix {
  key: string;
  text: string;
  button: string;
  inputs: StayInput[];
  remove?: string[];
  msg: string;
}

/** Crew staying longer: everyone keeps their room while it is free; anyone whose room is taken moves for the rest. */
function crewSplit(db: DB, crew: Stay[], newDep: string): Fix | null {
  const p = crewSplitPlan(db, crew, newDep);
  if (!p) return null;
  const moved = p.moved.map(m => `${m.name.split(' ')[0]} → ${m.room} from ${fmt(m.cutoff)}`);
  return {
    key: 'split',
    text: `Everyone keeps their room while it is free. ${plural(moved.length, 'person')} move${moved.length === 1 ? 's' : ''} for the last nights: ${moved.join('; ')}. Their old rooms are cleaned on the move day.`,
    button: `Keep rooms, move ${moved.length} for the extra nights`,
    inputs: p.inputs,
    msg: `Saved · ${plural(crew.length, 'person')} now leave ${fmt(newDep)} · ${moved.length} change room`,
  };
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
  const [scope, setScope] = useState<'this' | 'future'>('this');
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
          Close
        </button>
      </Box>
    );

  const room = db.rooms.find(r => r.id === stay.roomId)!;
  const prop0 = db.properties.find(p => p.id === room.propertyId)!;
  const crew = crewOf(db, stay);
  const future = futureOf(db, stay);
  const rotations = Math.max(...future.map(g => g.length));
  const series = stay.seriesId ? db.series?.find(s => s.id === stay.seriesId) : undefined;
  const sDep = depOf(stay);
  const label = stayLabel(stay);
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
  /** One command: all or nothing, one undo, one alert. */
  const run = async (inputs: StayInput[], remove: string[], msg: string, later = false, after: Q = null) => {
    setBusy(true);
    setProblem('');
    try {
      const fresh = inputs.map(i => (i.id ? { ...i, version: getDB().stays.find(s => s.id === i.id)?.version } : i));
      await data.saveBatch(saveOrder(fresh, later), remove, `${msg.replace(/^Saved · /, '')} (${label})`);
      notify(msg, 1);
      back(after);
    } catch (e) {
      setProblem(err(e));
    } finally {
      setBusy(false);
    }
  };

  /** Plain-language check; if a room is taken, offer the fixes (best first), else Save. */
  const saveBar = (
    inputs: StayInput[],
    msg: string,
    o: { later?: boolean; after?: Q; fixes?: (Fix | null)[] } = {},
  ) => {
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
          <button className="s-btn big" disabled={busy} onClick={() => run(inputs, [], msg, o.later, o.after)}>
            Save
          </button>
          {problem && <Note tone="bad">{problem}</Note>}
        </>
      );
    const fixes = (o.fixes ?? []).filter((f): f is Fix => !!f);
    const moved = fixByMoving(db, inputs, probs, ids);
    if (moved) {
      const one = inputs.length === 1;
      const alt = one ? db.rooms.find(r => r.id === moved[0].roomId) : null;
      fixes.push({
        key: 'move',
        text:
          one && alt
            ? `${roomText(db, alt.id)} is free for the whole stay.`
            : `Free rooms found for the ${plural(probs.length, 'person')} affected.`,
        button:
          one && alt ? `Move the whole stay to ${alt.name}` : `Move ${plural(probs.length, 'person')} to free rooms`,
        inputs: moved,
        msg: msg + (one && alt ? ` · moved to ${alt.name}` : ' · some rooms moved'),
      });
    }
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
        {fixes.map((f, i) => (
          <div key={f.key} className={'s-fix' + (i === 0 ? ' best' : '')} data-fix={f.key}>
            <p>
              {i === 0 && fixes.length > 1 && <b>Best option: </b>}
              {f.text}
            </p>
            <button
              className={'s-btn big' + (i === 0 ? '' : ' ghost')}
              disabled={busy}
              onClick={() => run(f.inputs, f.remove ?? [], f.msg, o.later, o.after)}
            >
              {f.button}
            </button>
          </div>
        ))}
        {!fixes.length && (
          <Note tone="warn">No free room for those dates. Try other dates, or ask about More rooms.</Note>
        )}
        {problem && <Note tone="bad">{problem}</Note>}
      </>
    );
  };

  const splitFix = (newDep: string, arrival?: string): Fix | null => {
    const sp = splitPlan(db, stay, newDep, { arrival });
    if (!sp) return null;
    const lastN = diffDays(sp.cutoff, newDep);
    return {
      key: 'split',
      text: `Stay in ${room.name} until ${fmt(sp.cutoff)}${sp.nightsKept ? ` (${plural(sp.nightsKept, 'more night')})` : ''}, then ${roomText(db, sp.room.id)} for the last ${plural(lastN, 'night')}${sp.otherHouse ? ` (nothing free in ${prop0.short})` : ''}. ${room.name} is cleaned on ${fmt(sp.cutoff)} when they move.`,
      button: `Keep ${room.name}, then ${sp.room.name} from ${fmt(sp.cutoff, { day: 'numeric', month: 'short' })}`,
      inputs: [sp.keep, sp.extra],
      msg: `Saved · ${room.name} until ${fmt(sp.cutoff)}, then ${sp.room.name}`,
    };
  };
  const joinFix = (newDep: string): Fix | null => {
    const j = joinPlan(db, stay, newDep);
    if (!j || checkBatch(db, [j.input], [stay.id, j.removeId]).length) return null;
    return {
      key: 'join',
      text: `${label} already has the next stay in ${room.name} from ${fmt(j.next.arrival)}. Join them into one stay until ${j.until ? fmt(j.until) : 'further notice'}, with no clean in between.`,
      button: 'Join into one stay',
      inputs: [j.input],
      remove: [j.removeId],
      msg: `Saved · one stay until ${j.until ? fmt(j.until) : 'TBC'}`,
    };
  };

  const head = (
    <div className="s-mini">
      <b>{label}</b> · {room.name}, {prop0.short} · {fmt(stay.arrival)} → {sDep ? fmt(sDep) : 'TBC'}
    </div>
  );

  // ---------- one booking ----------
  if (q === 'early' || q === 'longer') {
    const input = leaveOn(stay, dep);
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
          {plural(diffDays(stay.arrival, dep!), 'night')}
          {sDep ? ` (was ${diffDays(stay.arrival, sDep)})` : ''}
        </p>
        {saveBar([input], `Saved · now leaving ${fmt(dep!)}`, {
          fixes: q === 'longer' ? [joinFix(dep!), splitFix(dep!)] : [],
        })}
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
          {dep
            ? `${plural(diffDays(arr, dep), 'night')} · moving the arrival moves the whole stay`
            : 'Leaving date to follow'}
        </p>
        {saveBar([input], `Saved · ${fmt(arr)} → ${dep ? fmt(dep) : 'TBC'}`, {
          later: arr > stay.arrival,
          fixes: dep ? [arr === stay.arrival ? joinFix(dep) : null, splitFix(dep, arr)] : [],
        })}
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
              onClick={() => !busy && run([{ ...toInput(stay), roomId: r.id }], [], `Moved to ${roomText(db, r.id)}`)}
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
                [],
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
      <Box step="cancel" dir={dir} onBack={() => back()} title={`Cancel ${label}’s stay?`} sub={head}>
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

  // ---------- the whole crew ----------
  const all = scope === 'future' && rotations > 1;
  const group = all ? future.flat() : crew;
  const crewHead = (
    <div className="s-mini">
      <b>{series?.label ?? 'Crew'}</b> · {plural(crew.length, 'person')} ·{' '}
      {all
        ? `${plural(rotations, 'rotation')} from ${fmt(stay.arrival)}`
        : `${fmt(stay.arrival)} → ${sDep ? fmt(sDep) : 'TBC'}`}
    </div>
  );
  if (q === 'crew')
    return (
      <Box
        step="crew"
        dir={dir}
        onBack={() => back()}
        title={crew.length > 1 ? 'Change the whole crew' : 'Change the rota'}
        sub={crewHead}
      >
        {rotations > 1 && (
          <div className="s-chips two" role="radiogroup" aria-label="Which rotations">
            <Chip
              on={scope === 'this'}
              onClick={() => setScope('this')}
              small={fmt(stay.arrival, { day: 'numeric', month: 'short' })}
            >
              This rotation
            </Chip>
            <Chip on={scope === 'future'} onClick={() => setScope('future')} small={`${rotations} rotations`}>
              All from here
            </Chip>
          </div>
        )}
        <div className="s-pills">
          {crew.map(s => (
            <span className="s-pill" key={s.id}>
              {db.rooms.find(r => r.id === s.roomId)!.name} · {s.workerId ? stayLabel(s).split(' ')[0] : 'name TBC'}
            </span>
          ))}
        </div>
        <div className="s-actions">
          {!all && (
            <button
              className="s-act am"
              onClick={() => open('crew-early', () => setDep(addDays(sDep ?? addDays(stay.arrival, 8), -1)))}
              disabled={!sDep || diffDays(stay.arrival, sDep) < 2}
            >
              <b>All leaving early</b>
            </button>
          )}
          {!all && (
            <button
              className="s-act em"
              onClick={() => open('crew-longer', () => setDep(addDays(sDep ?? addDays(stay.arrival, 6), 1)))}
            >
              <b>All staying longer</b>
            </button>
          )}
          <button className="s-act" onClick={() => open('crew-shift', () => setDays(1))}>
            <b>
              Shift {all ? 'every' : 'all'} date{all ? '' : 's'}
            </b>
          </button>
          <button className="s-act" onClick={() => open('crew-move', () => setProp(''))}>
            <b>Move all rooms</b>
          </button>
          <button className="s-act red" onClick={() => open('crew-cancel')}>
            <b>{all ? 'Cancel from here' : 'Cancel this rotation'}</b>
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
        {saveBar(inputs, `Saved · ${plural(crew.length, 'person')} now leave ${fmt(dep!)}`, {
          after: 'crew',
          fixes: q === 'crew-longer' ? [crewSplit(db, crew, dep!)] : [],
        })}
      </Box>
    );
  }
  if (q === 'crew-shift') {
    const inputs = group.map(s => shift(s, days));
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
          {all ? 'Next rotation: ' : 'Arriving '}
          {fmt(addDays(stay.arrival, days))} → {sDep ? fmt(addDays(sDep, days)) : 'TBC'}
          {all && <small className="s-line">and every rotation after it</small>}
        </p>
        {saveBar(
          inputs,
          `Saved · ${plural(crew.length, 'person')}${all ? `, ${plural(rotations, 'rotation')},` : ''} moved ${days > 0 ? 'later' : 'earlier'} by ${plural(Math.abs(days), 'day')}`,
          { later: days > 0, after: 'crew' },
        )}
      </Box>
    );
  }
  if (q === 'crew-move') {
    const props = db.properties.filter(p => p.contracted);
    const ids = group.map(s => s.id);
    const target = prop
      ? all
        ? assignRooms(db, future, prop)
        : (() => {
            const sug = suggestBlock(db, crew.length, stay.arrival, sDep, ids, prop);
            return sug.length === crew.length ? sug.map(r => r.id) : null;
          })()
      : null;
    const groups = all ? future : crew.map(s => [s]);
    const inputs = target ? groups.flatMap((g, i) => g.map(s => ({ ...toInput(s), roomId: target[i] }))) : [];
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
          <Note tone="warn">
            Not enough rooms free there for all {crew.length}
            {all ? ' for every rotation' : ''}. Try the other house.
          </Note>
        )}
        {inputs.length > 0 && (
          <>
            <div className="s-moves">
              {groups.map((g, i) => (
                <span key={g[0].id}>
                  {stayLabel(g[0])}: {db.rooms.find(r => r.id === g[0].roomId)!.name} →{' '}
                  <b>{db.rooms.find(r => r.id === target![i])!.name}</b>
                </span>
              ))}
            </div>
            {saveBar(inputs, `Saved · crew moved to ${db.properties.find(p => p.id === prop)!.short}`, {
              after: 'crew',
            })}
          </>
        )}
      </Box>
    );
  }
  if (q === 'crew-cancel') {
    const from = stay.arrival < T ? T : stay.arrival;
    return (
      <Box
        step="crew-cancel"
        dir={dir}
        onBack={() => back('crew')}
        title={all ? `Cancel the crew from ${fmt(from)}?` : `Cancel all ${crew.length} rooms?`}
        sub={crewHead}
      >
        <p className="s-muted">
          {all
            ? `Every rotation from ${fmt(from)} on is removed for all ${crew.length}. Anyone already in their room stays booked until ${fmt(from)}.`
            : 'Every room in this rotation becomes free.'}{' '}
          You can undo straight after.
        </p>
        <button
          className="s-btn big red"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              if (all && series)
                await data.updateSeries(
                  { ...series, end: { kind: 'date', date: from }, cancelledFrom: from },
                  `cancelled from ${fmt(from)}`,
                );
              else
                await data.saveBatch(
                  [],
                  crew.map(s => s.id),
                  `Crew rotation cancelled · ${crew.length} rooms (${fmt(stay.arrival)})`,
                );
              notify(all ? `Cancelled from ${fmt(from)}` : `Cancelled · ${crew.length} rooms free`, 1);
              onHome();
            } catch (e) {
              setProblem(err(e));
              setBusy(false);
            }
          }}
        >
          {all ? 'Yes, cancel from here' : `Yes, cancel all ${crew.length}`}
        </button>
        <button className="s-btn ghost big" onClick={() => back('crew')}>
          No, keep them
        </button>
        {problem && <Note tone="bad">{problem}</Note>}
      </Box>
    );
  }

  // ---------- the card ----------
  const nights = sDep ? diffDays(stay.arrival, sDep) : null;
  const status =
    stay.arrival > T
      ? `Arrives in ${plural(diffDays(T, stay.arrival), 'day')}`
      : sDep && sDep <= T
        ? 'Has left'
        : sDep === T
          ? 'Leaves today'
          : 'In the room now';
  const nf = nearestFree(db, stay.roomId, stay.arrival, sDep, [stay.id]);
  return (
    <Box step="card" dir={dir} title={label} onClose={onHome}>
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
          {nights !== null && <span className="s-tag">{plural(nights, 'night')}</span>}
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
          {(crew.length > 1 || rotations > 1) && (
            <button className="s-btn big sk" onClick={() => open('crew', () => setScope('this'))}>
              {crew.length > 1
                ? `Change whole crew (${plural(crew.length, 'person')})`
                : `Change the rota (${plural(rotations, 'rotation')})`}
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
