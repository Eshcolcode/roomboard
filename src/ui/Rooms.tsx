// Rooms view (v2 look): one card per room with status, nights, departure vs next arrival and the gap,
// the incoming guest, the cleaning strip and a Quick update button. Summary tiles filter the cards.
// The urgent banner is computed from real changeovers. Sheena's phone home; also a desktop view.
import { useState } from 'react';
import {
  data,
  useDB,
  me,
  occupancy,
  stayLabel,
  bathText,
  roomReadiness,
  isAway,
  inHouseOn,
  slotKey,
  roomLabel,
} from '../data';
import { nights } from '../data/rules';
import type { Changeover, Room, Stay } from '../data';
import { addDays, diffDays, fmt, londonToday } from '../dates';
import type { PanelInit } from './StayPanel';
import { confirmDialog, toast } from './overlays';
import { copySummary } from './summary';
import { Icon } from './icons';
import { dayState, nextFree, ownOn, segments, unitOf } from '../data/extras';
import { priceLine, PRICE_NOTE } from '../data/pricing';
import { ExtraSheet } from './ExtraSheet';

/** "Leaves Fri 23 Oct (planned)" / "Until further notice" / "Departure TBC" — never "departs Until further notice". */
export function leaving(s: Stay) {
  if (s.depStatus === 'ufn') return 'Until further notice';
  if (s.depStatus === 'tbc' || !s.departure) return 'Departure TBC';
  return `Leaves ${fmt(s.departure)}${s.depStatus === 'confirmed' ? ' (confirmed)' : ' (planned)'}`;
}

type Filter = 'all' | 'departing' | 'clean' | 'tbc' | 'long';
const FILTERS: { k: Filter; label: string }[] = [
  { k: 'all', label: 'All rooms' },
  { k: 'departing', label: 'Departing today' },
  { k: 'clean', label: 'Needs clean' },
  { k: 'tbc', label: 'Name TBC' },
  { k: 'long', label: 'Long stay' },
];
export const LONG_STAY = 28;

const continues = (a: Stay, b: Stay) =>
  b.arrival === a.departure &&
  ((!!b.workerId && b.workerId === a.workerId) || (!!slotKey(a) && slotKey(a) === slotKey(b)));

/** Everything a room card shows, derived from the store. Exported for tests and the banner. */
export function roomState(stays: Stay[], cos: Changeover[], r: Room, T: string) {
  const rs = stays.filter(s => s.roomId === r.id).sort((a, b) => a.arrival.localeCompare(b.arrival));
  const now = rs.find(s => inHouseOn(s, T));
  const leavingToday = rs.find(s => s.departure === T && s.depStatus !== 'tbc' && s.depStatus !== 'ufn');
  let until = now;
  const chain: Stay[] = [];
  while (until?.departure) {
    const c = rs.find(s => continues(until!, s));
    if (!c) break;
    chain.push(c);
    until = c;
  }
  const nx = rs.find(s => s.arrival > T && !chain.includes(s) && s !== now);
  const open = cos.filter(c => c.roomId === r.id && c.status !== 'ready' && !c.cancelled);
  const needsClean = open.some(c => c.afterDate <= addDays(T, 7));
  const hold = [now, nx].some(s => s && !s.workerId);
  const first = now ? (rs.filter(s => chain.includes(s) || s === now)[0] ?? now) : null;
  const nightsIn = now ? diffDays(now.arrival, T) + 1 : 0;
  const long =
    !!now &&
    (now.depStatus === 'ufn' ||
      nightsIn >= LONG_STAY ||
      (!!until?.departure && nights(first!.arrival, until.departure) >= LONG_STAY));
  return { now, until, chain, nx, leavingToday, needsClean, hold, long, nightsIn };
}

export function Rooms({ onOpen }: { onOpen: (p: PanelInit) => void }) {
  const db = useDB();
  const u = me();
  const T = londonToday();
  const canEdit = u.role !== 'cleaner';
  const client = u.role === 'client';
  const [filter, setFilter] = useState<Filter>('all');
  const [copied, setCopied] = useState(false);
  const props = db.properties.filter(p => p.contracted);
  const rooms = db.rooms.filter(r => props.some(p => p.id === r.propertyId));
  const st = new Map(rooms.map(r => [r.id, roomState(db.stays, db.changeovers, r, T)]));
  const count = (f: Filter) =>
    rooms.filter(r => {
      const x = st.get(r.id)!;
      return f === 'departing'
        ? !!x.leavingToday
        : f === 'clean'
          ? x.needsClean
          : f === 'tbc'
            ? x.hold
            : f === 'long'
              ? x.long
              : true;
    }).length;
  const show = (r: Room) => {
    const x = st.get(r.id)!;
    return (
      filter === 'all' ||
      (filter === 'departing'
        ? !!x.leavingToday
        : filter === 'clean'
          ? x.needsClean
          : filter === 'tbc'
            ? x.hold
            : x.long)
    );
  };
  const extra = db.properties.filter(p => !p.contracted).length;
  const copy = async () => {
    const ok = await copySummary();
    setCopied(ok);
    toast(ok ? 'Summary copied · paste it into a message or email' : 'Could not copy. Try Print instead.');
    setTimeout(() => setCopied(false), 2500);
  };
  const tile = (f: Filter, label: string, sub: string, tone: string) => (
    <button
      key={f}
      className={'tile t-' + tone + (filter === f ? ' on' : '')}
      aria-pressed={filter === f}
      onClick={() => setFilter(filter === f ? 'all' : f)}
    >
      <small>{label}</small>
      <b>{count(f)}</b>
      <span>{sub}</span>
    </button>
  );

  return (
    <div className="page rooms-v2">
      <div className="ph">
        <div>
          <h1>Rooms</h1>
          <p>{fmt(T, { weekday: 'long', day: 'numeric', month: 'long' })}</p>
        </div>
        <div className="sp" />
        <button className="btn ghost" onClick={copy} aria-live="polite">
          <Icon name="copy" size={14} /> {copied ? 'Copied ✓' : 'Copy summary'}
        </button>
      </div>
      <Urgent onOpen={onOpen} />
      <div className="tiles" role="group" aria-label="Filter rooms">
        {tile('departing', 'Departing today', 'leaving today', 'amber')}
        {tile('clean', 'Needs clean', 'in the next 7 days', 'emerald')}
        {tile('tbc', 'Name TBC', 'holds to name', 'purple')}
        {tile('long', 'Long stay', `${LONG_STAY}+ nights or open`, 'sky')}
        {extra > 0 && (
          <a className="tile t-dark" href="#available">
            <small>Extra properties</small>
            <b>{extra}</b>
            <span>bookable · invoiced separately</span>
          </a>
        )}
      </div>
      <div className="fpills" role="group" aria-label="Show">
        {FILTERS.map(f => (
          <button
            key={f.k}
            className={filter === f.k ? 'on' : ''}
            aria-pressed={filter === f.k}
            onClick={() => setFilter(f.k)}
          >
            {f.label}
            {f.k !== 'all' && <em>{count(f.k)}</em>}
          </button>
        ))}
      </div>
      {props.map(p => {
        const list = rooms.filter(r => r.propertyId === p.id && show(r));
        if (!list.length) return null;
        return (
          <section key={p.id} aria-label={p.name} className="rooms rgroup">
            <h3>
              {p.name}
              <small>
                {occupancy(T, p.id).allocated} allocated · {occupancy(T, p.id).onSite} on site
              </small>
            </h3>
            <div className="rgrid">
              {list.map(r => (
                <RoomCard key={r.id} r={r} x={st.get(r.id)!} T={T} client={client} canEdit={canEdit} onOpen={onOpen} />
              ))}
            </div>
          </section>
        );
      })}
      {filter === 'all' && <ExtrasSection onOpen={onOpen} />}
      {filter !== 'all' && !rooms.some(show) && (
        <p className="empty-state">
          No rooms match.{' '}
          <button className="linkbtn" onClick={() => setFilter('all')}>
            Show all rooms
          </button>
        </p>
      )}
      {!props.length && <p className="empty-state">No properties yet.</p>}
    </div>
  );
}

/** Extra properties (booked whole): live status from Roomboard bookings and their booking calendars. */
function ExtrasSection({ onOpen }: { onOpen: (p: PanelInit) => void }) {
  const db = useDB();
  const u = me();
  const T = londonToday();
  const extras = db.properties.filter(p => !p.contracted);
  const [sheet, setSheet] = useState<{ pid: string; date?: string } | null>(null);
  if (!extras.length || u.role === 'cleaner') return null;
  const next14 = Array.from({ length: 14 }, (_, i) => addDays(T, i));
  return (
    <section aria-label="Extra properties" className="rooms rgroup xsec">
      <h3>
        Extra properties
        <small>Whole property · invoiced separately · {PRICE_NOTE}</small>
      </h3>
      <div className="rgrid">
        {extras.map(p => {
          const r = unitOf(db, p.id);
          if (!r) return null;
          const tonight = segments(db, r.id, T, addDays(T, 1), u)[0];
          const nf = nextFree(db, r.id, T);
          const mineNext = segments(db, r.id, T, addDays(T, 365), u).find(g => g.stay);
          const n = p.bedrooms ?? 1;
          const [tone, label] = !tonight ? ['emerald', 'Free tonight'] : ['slate', tonight.stay ? 'Booked' : 'Taken'];
          return (
            <article
              className={'rr rcard xcard tone-' + tone}
              key={p.id}
              data-extra={p.id}
              aria-label={`${p.name}: ${label}`}
            >
              <header>
                <div>
                  <b>{p.name}</b>
                  <small>
                    Whole property · {n} bedroom{n === 1 ? '' : 's'}
                  </small>
                </div>
                <span className={'spill sp-' + tone}>{label}</span>
              </header>
              <div className="occ">
                <div>
                  <small>Tonight</small>
                  <b>{!tonight ? 'Free' : tonight.stay ? stayLabel(tonight.stay) : 'Taken'}</b>
                </div>
              </div>
              <div className="x14" role="group" aria-label={`${p.name}: next 14 nights, tap a free night to book`}>
                {next14.map(d => {
                  const free = dayState(db, r.id, d) === 'free';
                  const own = !free && u.role === 'client' && !!ownOn(db, r.id, d, u.id);
                  const label = `${fmt(d, { weekday: 'long', day: 'numeric', month: 'long' })}: ${free ? 'free, book from this night' : own ? 'yours' : 'taken'}`;
                  const inner = (
                    <>
                      <small>{fmt(d, { weekday: 'short' }).slice(0, 2)}</small>
                      {+d.slice(8)}
                    </>
                  );
                  return free ? (
                    <button
                      key={d}
                      className="xd f"
                      aria-label={label}
                      title={label}
                      onClick={() => setSheet({ pid: p.id, date: d })}
                    >
                      {inner}
                    </button>
                  ) : (
                    <span key={d} className={'xd ' + (own ? 'm' : 't')} aria-label={label} title={label}>
                      {inner}
                    </span>
                  );
                })}
              </div>
              <p className="xline">
                {nf === T ? '' : nf ? `Next free ${fmt(nf)} · ` : 'Fully booked for now · '}
                {priceLine(db, p)}
              </p>
              <div className="xbtns">
                <button className="btn primary" onClick={() => setSheet({ pid: p.id, date: nf ?? undefined })}>
                  {nf && nf !== T ? `Book from ${fmt(nf)}` : 'Book'}
                </button>
                {mineNext?.stay && (
                  <button className="btn ghost" onClick={() => onOpen({ stay: mineNext.stay! })}>
                    {mineNext.stay.arrival <= T ? 'Current booking' : `Booking ${fmt(mineNext.stay.arrival)}`}
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>
      {sheet && <ExtraSheet pid={sheet.pid} date={sheet.date} onClose={() => setSheet(null)} />}
    </section>
  );
}

function RoomCard({
  r,
  x,
  T,
  client,
  canEdit,
  onOpen,
}: {
  r: Room;
  x: ReturnType<typeof roomState>;
  T: string;
  client: boolean;
  canEdit: boolean;
  onOpen: (p: PanelInit) => void;
}) {
  const { now, until, chain, nx, leavingToday } = x;
  const rd = roomReadiness(r.id);
  const rdText = rd ? (client ? rd.client : rd.provider) : null;
  const awayNow = now && isAway(now, T);
  const awaySoon = now?.away && now.away.from > T && now.away.from <= addDays(T, 7);
  const [tone, label] = leavingToday
    ? ['amber', 'Departing today']
    : now && !now.workerId
      ? ['purple', 'Name TBC']
      : awayNow
        ? ['sky', 'Away · room kept']
        : now
          ? ['emerald', 'Occupied']
          : nx?.arrival === T
            ? ['sky', 'Arriving today']
            : ['slate', 'Free tonight'];
  const target = now ?? leavingToday ?? nx;
  const end = until ?? now;
  const gap = end?.departure && nx ? diffDays(end.departure, nx.arrival) : null;
  const total = now && end?.departure ? nights(now.arrival, end.departure) : null;
  const open = () => (target ? onOpen({ stay: target }) : onOpen({ roomId: r.id, date: T }));
  return (
    <article className={'rr rcard tone-' + tone} data-room={r.id} aria-label={`${roomLabel(r.id)}: ${label}`}>
      <header>
        <div>
          <b>{r.name}</b>
          <small>{bathText(r)}</small>
        </div>
        <span className={'spill sp-' + tone}>{label}</span>
      </header>
      <div className="occ">
        <div>
          <small>{now ? 'In the room' : leavingToday ? 'Leaving today' : 'Tonight'}</small>
          <b>{now ? stayLabel(now) : leavingToday ? stayLabel(leavingToday) : 'Free tonight'}</b>
        </div>
        {now && (
          <span className="nb" title={total ? `${total} nights booked` : undefined}>
            {total ? `${total} nights` : `Night ${x.nightsIn}`}
          </span>
        )}
      </div>
      {awayNow && <p className="awaytag">Away · room kept · back {fmt(now!.away!.to)}</p>}
      {awaySoon && <p className="awaytag soon">Away from {fmt(now!.away!.from)} · room kept</p>}
      <div className="dates2">
        <div>
          <small>Departure</small>
          <b>
            {now
              ? (chain.length ? leaving(until!) : leaving(now)).replace(/^Leaves /, '')
              : leavingToday
                ? 'Today'
                : '—'}
          </b>
          {chain.length > 0 && <span>staying on</span>}
        </div>
        <div className="nx">
          <small>
            Next arrival{gap !== null ? ` · ${gap === 0 ? 'same day' : `${gap} day${gap === 1 ? '' : 's'} gap`}` : ''}
          </small>
          <b>{nx ? fmt(nx.arrival) : 'Nothing booked'}</b>
        </div>
      </div>
      {nx && (
        <div className={'incoming' + (nx.workerId ? '' : ' hold')}>
          <small>Incoming guest</small>
          <b>
            {nx.workerId || /name to follow/i.test(stayLabel(nx)) ? stayLabel(nx) : `${stayLabel(nx)} · name to follow`}
          </b>
        </div>
      )}
      <div className={'cstrip rd-' + (rd?.tone ?? 'none')}>
        <Icon name="changeovers" size={14} />
        <span>{rdText ?? (now || nx ? 'No clean due yet' : 'Ready for the next guest')}</span>
      </div>
      {canEdit && (
        <button className="btn primary qup" onClick={open}>
          Quick update <span aria-hidden>›</span>
          <span className="sr">for {roomLabel(r.id)}</span>
        </button>
      )}
    </article>
  );
}

/** The single most urgent changeover, with one-tap actions. Nothing is shown when nothing is urgent. */
function Urgent({ onOpen }: { onOpen: (p: PanelInit) => void }) {
  const db = useDB();
  const u = me();
  const T = londonToday();
  const soon = addDays(T, 3);
  const list = db.changeovers
    .filter(
      c =>
        !c.cancelled &&
        c.status !== 'ready' &&
        c.afterDate <= soon &&
        (c.readyBy ? c.readyBy <= soon : c.afterDate <= T),
    )
    .sort((a, b) => (a.readyBy ?? a.afterDate).localeCompare(b.readyBy ?? b.afterDate));
  const c = list[0];
  if (!c || u.role === 'cleaner') return null;
  const from = db.stays.find(s => s.id === c.fromStayId);
  const to = db.stays.find(s => s.id === c.toStayId);
  const rd = roomReadiness(c.roomId);
  const status =
    u.role === 'client' ? (rd?.co.id === c.id ? rd.client : null) : rd?.co.id === c.id ? rd.provider : null;
  const date = c.afterDate < T ? T : c.afterDate;
  const cleaner = db.users.find(x => x.role === 'cleaner');
  const canBook = u.role === 'manager' && c.status === 'needs' && !c.invalidated && (!c.readyBy || date <= c.readyBy);
  const book = async () => {
    const ok = await confirmDialog({
      title: `Book the clean for ${fmt(date)}?`,
      body: `${roomLabel(c.roomId)}${cleaner ? ` · ${cleaner.name}` : ''}. ${c.readyBy ? `Next guest arrives ${fmt(c.readyBy)}.` : ''}`,
      ok: 'Book clean',
    });
    if (!ok) return;
    data.updateChangeover(c.id, { status: 'scheduled', scheduledFor: date, cleanerId: cleaner?.id ?? null }).then(
      () => toast(`Clean booked · ${roomLabel(c.roomId)} · ${fmt(date)}`),
      e => toast((e as Error).message),
    );
  };
  return (
    <section className="urgent" aria-label="Needs attention">
      <span className="urg-i" aria-hidden>
        !
      </span>
      <div className="urg-b">
        <b>
          {roomLabel(c.roomId)} · {c.afterDate <= T ? 'turnaround today' : `turnaround ${fmt(c.afterDate)}`}
          {c.zeroDay ? ' · same-day' : ''}
        </b>
        <p>
          {from ? `${stayLabel(from)} leaves ${fmt(c.afterDate)}` : `Free from ${fmt(c.afterDate)}`}
          {to ? ` → ${stayLabel(to)} arrives ${fmt(to.arrival)}` : ''}
          {status ? ` · ${status}` : ''}
        </p>
        {list.length > 1 && <small>+{list.length - 1} more in the next 3 days</small>}
      </div>
      <div className="urg-a">
        {canBook && (
          <button className="btn primary" onClick={book}>
            Book clean {fmt(date)}
          </button>
        )}
        {u.role === 'manager' && (
          <a className="btn ghost" href="#changeovers">
            Cleaning
          </a>
        )}
        {from && (
          <button className="btn ghost" onClick={() => onOpen({ stay: from })}>
            Open room
          </button>
        )}
      </div>
    </section>
  );
}
