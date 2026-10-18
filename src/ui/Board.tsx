// Tape chart: rooms down the side, days across, one bar per stay. Contract houses first (per room), then the
// extra properties (one row each, booked whole): live from Roomboard bookings and their booking calendars.
import { useState } from 'react';
import { useDB, me, roomOf, propOf, stayLabel, depText, bathText, occupancy, readinessFor } from '../data';
import type { Changeover, Stay } from '../data';
import { addDays, diffDays, fmt, londonToday } from '../dates';
import { DateField } from './DateField';
import { BrushIcon, Icon } from './icons';
import type { PanelInit } from './StayPanel';
import { segments, unitOf } from '../data/extras';
import { gbp, priceLine, rate, PRICE_NOTE } from '../data/pricing';
import { useDrag, startDrag, wasDrag, problem, describe, candidate } from './drag';

const GAP = 13; // space kept free around a changeover marker so it never covers a bar

export function Board({ onOpen }: { onOpen: (p: PanelInit) => void }) {
  const db = useDB();
  const T = londonToday();
  const client = me().role === 'client';
  const [start, setStart] = useState(addDays(T, -3));
  const [days, setDays] = useState(21);
  const [filter, setFilter] = useState('all');
  const W = days > 21 ? 38 : 56;
  const end = addDays(start, days);
  const dates = Array.from({ length: days }, (_, i) => addDays(start, i));
  const props = db.properties.filter(p => p.contracted && (filter === 'all' || p.id === filter));
  const extras = db.properties.filter(
    p => !p.contracted && (filter === 'all' || filter === 'extras' || p.id === filter),
  );
  const shown = filter === 'extras' ? [] : props;
  const vis = db.stays.filter(s => propOf(roomOf(s.roomId).propertyId).contracted);
  const occ = occupancy(T);
  const totalRooms = db.rooms.filter(r => propOf(r.propertyId).contracted).length;
  const in7 = addDays(T, 7);
  const coOpen = db.changeovers.filter(c => c.status !== 'ready' && !c.cancelled && (c.readyBy ?? c.afterDate) <= in7);
  const x = (d: string) => Math.max(0, Math.min(days, diffDays(start, d))) * W;
  const departingToday = vis.filter(s => s.departure === T && s.depStatus !== 'tbc' && s.depStatus !== 'ufn');

  const kpi: [string, string | number, string][] = [
    ['Rooms allocated tonight', `${occ.allocated}/${totalRooms}`, 'includes away, room kept'],
    ['Expected on site', occ.onSite, `${occ.away} away tonight`],
    [
      'Departing today',
      departingToday.length,
      `${departingToday.filter(s => s.depStatus === 'planned').length} not confirmed yet`,
    ],
    ['Arriving in 7 days', vis.filter(s => s.arrival >= T && s.arrival < in7).length, 'includes holds'],
    ['Holds · name to follow', vis.filter(s => !s.workerId && (s.departure ?? '9') > T).length, 'name them when known'],
    client
      ? ['Rooms getting ready', coOpen.filter(c => c.readyBy).length, 'for arrivals in 7 days']
      : ['Cleans due in 7 days', coOpen.length, `${coOpen.filter(c => c.status === 'needs').length} still to book`],
  ];

  return (
    <div className="page">
      <div className="ph">
        <div>
          <h1>Occupancy board</h1>
          <p>
            {fmt(T, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}{' '}
            <span
              className="info"
              tabIndex={0}
              role="note"
              aria-label="How nights are counted"
              data-tip="Arrival day counts as a night, departure day does not. All times are UK time."
            >
              <Icon name="info" size={14} />
            </span>
          </p>
        </div>
        <div className="sp" />
        <select aria-label="Property filter" value={filter} onChange={e => setFilter(e.target.value)}>
          <option value="all">All properties</option>
          {db.properties
            .filter(p => p.contracted)
            .map(p => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          <optgroup label="Extra properties">
            <option value="extras">All extra properties</option>
            {db.properties
              .filter(p => !p.contracted)
              .map(p => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
          </optgroup>
        </select>
        <div className="seg">
          <button aria-label="Previous week" onClick={() => setStart(addDays(start, -7))}>
            ‹
          </button>
          <button onClick={() => setStart(addDays(T, -3))}>Today</button>
          <button aria-label="Next week" onClick={() => setStart(addDays(start, 7))}>
            ›
          </button>
        </div>
        <DateField className="jump" label="Jump to date" value={start} onChange={v => v && setStart(v)} />
        <div className="seg">
          <button className={days === 21 ? 'on' : ''} onClick={() => setDays(21)}>
            3 wks
          </button>
          <button className={days === 42 ? 'on' : ''} onClick={() => setDays(42)}>
            6 wks
          </button>
        </div>
        <button className="btn ghost findbtn" onClick={() => (location.hash = 'free')}>
          <Icon name="free" size={14} /> Find a room
        </button>
        <button className="btn ghost" onClick={() => onOpen({ date: T, hold: true })}>
          Hold room
        </button>
        <button className="btn" onClick={() => onOpen({ date: T })}>
          + Add stay
        </button>
      </div>

      <div className="kpis k6">
        {kpi.map(([a, b, c]) => (
          <div className="k" key={a}>
            <span>{a}</span>
            <b>{b}</b>
            <small>{c}</small>
          </div>
        ))}
      </div>

      <div className="board">
        <div className="scroll">
          <div style={{ width: 230 + days * W }}>
            <div className="bh">
              <div className="corner">Property / room</div>
              {dates.map(d => {
                const wd = new Date(d + 'T12:00Z').getUTCDay();
                const showMonth = d.endsWith('-01') || d === start;
                return (
                  <div
                    key={d}
                    className={'day' + (d === T ? ' today' : '') + (wd === 0 || wd === 6 ? ' we' : '')}
                    style={{ width: W }}
                  >
                    <span className={d.endsWith('-01') ? 'mo' : ''}>
                      {showMonth ? fmt(d, { month: 'short' }) : fmt(d, { weekday: 'short' }).slice(0, W < 50 ? 1 : 3)}
                    </span>
                    <b>{fmt(d, { day: 'numeric' })}</b>
                  </div>
                );
              })}
            </div>
            {shown.map(p => {
              const o = occupancy(T, p.id);
              const units = db.units.filter(un => un.propertyId === p.id);
              return (
                <div key={p.id}>
                  <div className="grp">
                    <div className="gl">
                      {p.photo && <img src={p.photo} alt="" />}
                      <div>
                        <b>{p.name}</b>
                        <span>
                          {o.allocated} allocated · {o.onSite} on site
                        </span>
                      </div>
                    </div>
                  </div>
                  {units.map(un => (
                    <div key={un.id}>
                      {units.length > 1 && <div className="unit">{un.name}</div>}
                      {db.rooms
                        .filter(r => r.unitId === un.id)
                        .map(r => (
                          <RoomRow
                            key={r.id}
                            roomId={r.id}
                            start={start}
                            end={end}
                            days={days}
                            W={W}
                            x={x}
                            onOpen={onOpen}
                          />
                        ))}
                    </div>
                  ))}
                </div>
              );
            })}
            {extras.length > 0 && (
              <div className="xgroup" data-extras>
                <div className="grp xgrp">
                  <div className="gl">
                    <div>
                      <b>Extra properties</b>
                      <span>Whole property · invoiced separately</span>
                    </div>
                  </div>
                  <div className="xgrp-note">
                    Indicative {gbp(rate(db))} per room per week · each is booked and priced as a whole property ·{' '}
                    {PRICE_NOTE}
                  </div>
                </div>
                {extras.map(p => (
                  <ExtraRow key={p.id} pid={p.id} start={start} end={end} days={days} W={W} x={x} onOpen={onOpen} />
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="legend">
          <span>
            <i className="lg occ" />
            In house
          </span>
          <span>
            <i className="lg dep" />
            Departing today
          </span>
          <span>
            <i className="lg hold" />
            Hold, name to follow
          </span>
          <span>
            <i className="lg open" />
            Until further notice / TBC
          </span>
          <span>
            <span className={'co mini ' + (client ? 'co-client' : 'co-scheduled')}>
              <BrushIcon />
            </span>
            Clean between stays
          </span>
          <span>
            <i className="lg away" />
            Away, room kept
          </span>
          <span>
            <span className={'co zero mini ' + (client ? 'co-client' : 'co-needs')}>
              <BrushIcon />
            </span>
            Same-day turnaround
          </span>
          <span>
            <i className="lg xtaken" />
            {client ? 'Extra property taken' : 'Booked on another site'}
          </span>
          <span className="lg-today">│ Today</span>
          <span className="hint">
            Click an empty day to add a stay · click a bar to edit · drag a bar to move it, or its right edge to change
            the departure (Esc cancels)
          </span>
        </div>
      </div>
    </div>
  );
}

function RoomRow({
  roomId,
  start,
  end,
  days,
  W,
  x,
  onOpen,
}: {
  roomId: string;
  start: string;
  end: string;
  days: number;
  W: number;
  x: (d: string) => number;
  onOpen: (p: PanelInit) => void;
}) {
  const db = useDB();
  const T = londonToday();
  const client = me().role === 'client';
  const r = roomOf(roomId);
  const rs = db.stays.filter(s => s.roomId === r.id && s.arrival < end && (s.departure ?? '9') > start);
  const cos = db.changeovers.filter(c => c.roomId === r.id && c.afterDate >= start && c.afterDate < end);
  const coFrom = (s: Stay) => db.changeovers.find(c => c.fromStayId === s.id && !c.cancelled);
  const coInto = (s: Stay) => db.changeovers.find(c => c.toStayId === s.id && c.zeroDay && !c.cancelled);
  const todayX = diffDays(start, T);
  const bathShort =
    r.bath === 'shared' && r.note ? r.note.replace('Shares a shower room', 'Shared shower') : bathText(r);

  return (
    <div className="row" data-room={r.id}>
      <div className="rl" title={r.note ?? bathText(r)}>
        <b>{r.name}</b>
        <span>{bathShort}</span>
      </div>
      <div
        className="track"
        style={{ width: days * W, backgroundSize: `${W}px 100%` }}
        onClick={e => {
          if (!(e.target as HTMLElement).classList.contains('track')) return;
          const i = Math.floor((e.clientX - (e.currentTarget as HTMLElement).getBoundingClientRect().left) / W);
          onOpen({ roomId: r.id, date: addDays(start, i) });
        }}
      >
        {todayX >= 0 && todayX < days && <div className="todayline" style={{ left: todayX * W + W / 2 }} />}
        {rs.map(s => {
          const out = coFrom(s);
          const inn = coInto(s);
          const l = x(s.arrival) + (s.arrival >= start ? W / 2 : 0) + (inn && s.arrival >= start ? GAP : 0);
          const rr = s.departure && s.departure < end ? x(s.departure) + W / 2 - (out ? GAP : 0) : days * W;
          return (
            <Bar
              key={s.id}
              s={s}
              left={l}
              width={Math.max(rr - l - 4, 14)}
              cutLeft={s.arrival < start}
              vacated={!!out?.vacated}
              W={W}
              x={x}
              onOpen={onOpen}
            />
          );
        })}
        <Ghost roomId={r.id} start={start} end={end} days={days} W={W} x={x} />
        {cos.map(c => (
          <Marker key={c.id} c={c} left={x(c.afterDate) + W / 2 - 10} client={client} />
        ))}
      </div>
    </div>
  );
}

/** One extra property, booked whole. Clicking a free day opens its availability calendar to book. */
function ExtraRow({
  pid,
  start,
  end,
  days,
  W,
  x,
  onOpen,
}: {
  pid: string;
  start: string;
  end: string;
  days: number;
  W: number;
  x: (d: string) => number;
  onOpen: (p: PanelInit) => void;
}) {
  const db = useDB();
  const u = me();
  const T = londonToday();
  const p = propOf(pid);
  const r = unitOf(db, pid);
  if (!r) return null;
  const segs = segments(db, r.id, start, end, u);
  const todayX = diffDays(start, T);
  const n = p.bedrooms ?? 1;
  return (
    <div className="row xrow" data-room={r.id} data-extra={pid}>
      <div className="rl" title={priceLine(db, p)}>
        <b>{p.name}</b>
        <span>
          Whole · {n} bedroom{n === 1 ? '' : 's'}
        </span>
      </div>
      <div
        className="track"
        style={{ width: days * W, backgroundSize: `${W}px 100%` }}
        title="Click a free day to book this property from that day"
        onClick={e => {
          if (!(e.target as HTMLElement).classList.contains('track')) return;
          const i = Math.floor((e.clientX - (e.currentTarget as HTMLElement).getBoundingClientRect().left) / W);
          const d = addDays(start, i);
          // a free day from today on starts a booking with that night (up to a week) already picked
          location.hash = 'available/' + pid + (d >= T ? '/' + d : '');
        }}
      >
        {todayX >= 0 && todayX < days && <div className="todayline" style={{ left: todayX * W + W / 2 }} />}
        {segs.map((g, i) => {
          const cut = g.from < start;
          const l = x(g.from) + (cut ? 0 : W / 2);
          const rr = g.to && g.to < end ? x(g.to) + W / 2 : days * W;
          const width = Math.max(rr - l - 4, 14);
          const dates = `${fmt(g.from)} → ${g.to ? fmt(g.to) : 'open'}`;
          if (g.stay) {
            const s = g.stay;
            const tip = `${p.name} · ${stayLabel(s)} · ${dates} · whole property, invoiced separately`;
            return (
              <div
                key={s.id}
                role="button"
                tabIndex={0}
                data-stay={s.id}
                className={'bar xbar' + (cut ? ' cutl' : '') + (width < 90 ? ' tiny' : '')}
                style={{ left: l + 2, width }}
                title={tip}
                aria-label={tip}
                onClick={() => onOpen({ stay: s })}
                onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onOpen({ stay: s }))}
              >
                <b>{stayLabel(s)}</b>
                {width >= 90 && <span>Extra · {dates}</span>}
              </div>
            );
          }
          const label = g.kind === 'elsewhere' ? 'Booked elsewhere' : 'Taken';
          return (
            <div
              key={'b' + i}
              className={'xblock' + (g.kind === 'elsewhere' ? ' elsewhere' : '')}
              style={{ left: l + 2, width }}
              title={`${p.name}: ${label.toLowerCase()} ${dates}`}
              aria-label={`${p.name}: ${label.toLowerCase()} ${dates}`}
              role="img"
            >
              {width >= 60 && <span>{label}</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Bar({
  s,
  left,
  width,
  cutLeft,
  vacated,
  W,
  x,
  onOpen,
}: {
  s: Stay;
  left: number;
  width: number;
  cutLeft: boolean;
  vacated: boolean;
  W: number;
  x: (d: string) => number;
  onOpen: (p: PanelInit) => void;
}) {
  const db = useDB();
  const T = londonToday();
  const open = !s.departure;
  const hold = !s.workerId;
  const dep = s.departure === T;
  const night = diffDays(s.arrival, T) + 1;
  const cont = db.stays.some(
    p => p.roomId === s.roomId && p.departure === s.arrival && p.workerId && p.workerId === s.workerId,
  );
  const name = stayLabel(s);
  const drag = useDrag();
  const dragging = drag?.stay.id === s.id;
  const canDrag = me().role !== 'cleaner' && !cutLeft;
  const tiny = width < 90;
  const short = width < 150 ? (hold ? 'Hold' : name.split(' ').slice(-1)[0]) : (hold ? 'Hold · ' : '') + name;
  const sub = vacated
    ? 'Left ✓'
    : cont
      ? 'Continues · no clean'
      : hold
        ? s.arrival > T
          ? 'from ' + fmt(s.arrival)
          : 'name to follow'
        : s.arrival > T
          ? 'Arrives ' + fmt(s.arrival)
          : dep
            ? s.depStatus === 'confirmed'
              ? 'Leaves today (confirmed)'
              : 'Leaves today (planned)'
            : `Night ${night}`;
  const subShort = vacated
    ? 'Left ✓'
    : !hold && s.arrival <= T && !dep && !cont
      ? `N${night}${open ? ' · ' + (s.depStatus === 'ufn' ? 'UFN' : 'TBC') : ''}`
      : sub;
  const tip = `${hold ? 'Hold · ' : ''}${name} · ${fmt(s.arrival)} → ${depText(s)} · ${sub}`;
  const cls = [
    'bar',
    hold && 'hold',
    dep && 'dep',
    open && 'open',
    cont && 'cont',
    cutLeft && 'cutl',
    tiny && 'tiny',
    vacated && 'left',
    canDrag && 'dragable',
    dragging && 'dragging',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      role="button"
      tabIndex={0}
      data-stay={s.id}
      aria-label={tip}
      title={tip}
      className={cls}
      style={{ left: left + 2, width }}
      onPointerDown={e => canDrag && startDrag(e, s, 'move', W)}
      onClick={() => !wasDrag() && onOpen({ stay: s })}
      onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onOpen({ stay: s }))}
    >
      {tiny ? (
        <b>
          {short}
          {vacated ? <i className="nc">✓</i> : !hold && s.arrival <= T && <i className="nc">{night}n</i>}
        </b>
      ) : (
        <>
          <b>{short}</b>
          <span>
            {width < 150
              ? subShort
              : sub +
                (open
                  ? ' · ' + depText(s)
                  : width >= 300 && s.departure && s.arrival <= T && !vacated && !dep
                    ? ' · leaves ' + fmt(s.departure)
                    : '')}
          </span>
        </>
      )}
      {s.away && (
        <i
          className="away"
          style={{ left: Math.max(0, x(s.away.from) - left + W / 2), width: diffDays(s.away.from, s.away.to) * W }}
        >
          Away · room kept
        </i>
      )}
      {canDrag && s.departure && (
        <span
          className="grip"
          aria-hidden="true"
          title="Drag to change the departure"
          onPointerDown={e => startDrag(e, s, 'resize', W)}
          onClick={e => e.stopPropagation()}
        />
      )}
    </div>
  );
}

/** Where the dragged stay would land, green if it fits, red with the reason if it clashes. */
function Ghost({
  roomId,
  start,
  end,
  days,
  W,
  x,
}: {
  roomId: string;
  start: string;
  end: string;
  days: number;
  W: number;
  x: (d: string) => number;
}) {
  const d = useDrag();
  if (!d || d.roomId !== roomId) return null;
  const c = candidate(d);
  if (c.arrival >= end || (c.departure ?? '9') <= start) return null;
  const err = problem(d);
  const l = x(c.arrival) + (c.arrival >= start ? W / 2 : 0);
  const rr = c.departure && c.departure < end ? x(c.departure) + W / 2 : days * W;
  return (
    <div
      className={'dghost' + (err ? ' bad' : ' ok')}
      style={{ left: l + 2, width: Math.max(rr - l - 4, 14) }}
      role="status"
    >
      {err ? `Clash: ${err}` : describe(d)}
    </div>
  );
}

function Marker({ c, left, client }: { c: Changeover; left: number; client: boolean }) {
  const r = readinessFor(c);
  const label = client ? (r.client ?? 'Clean between stays') : r.provider;
  const tip = `Clean · ${label}${c.readyBy ? ' · next arrival ' + fmt(c.readyBy) : ''}${c.zeroDay ? ' · same-day turnaround' : ''}${!client && c.exception ? ' · ⚠ ' + c.exception : ''}`;
  // the client sees one calm colour until the room is ready (no scheduling noise)
  const tone = client ? (c.status === 'ready' ? 'ready' : 'client') : c.status;
  const cls = ['co', 'co-' + tone, c.zeroDay && 'zero', c.cancelled && 'cancelled', !client && c.exception && 'exc']
    .filter(Boolean)
    .join(' ');
  return (
    <div className={cls} style={{ left }} title={tip} aria-label={tip} role="img">
      <BrushIcon />
    </div>
  );
}
