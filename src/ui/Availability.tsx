// Extra properties: three-month availability per unit (free / taken only, never who), pick dates by tapping
// the first night and the check-out day, then "Book these dates". Used on the property page and on the
// stand-alone #availability page. A booking is confirmed straight away (whole property, indicative price shown);
// Donald is told, and invoicing happens separately.
import { useMemo, useState } from 'react';
import { data, useDB, me, thumb } from '../data';
import type { Property } from '../data';
import { addDays, diffDays, fmt, londonToday } from '../dates';
import { dayState, rangeFree, unitOf } from '../data/extras';
import { estimateLine, priceLine, PRICE_NOTE } from '../data/pricing';
import type { DayState } from '../data/extras';
import './props.css';

const WD = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const first = (d: string) => d.slice(0, 8) + '01';
const nextMonth = (m: string) => {
  const [y, mm] = m.split('-').map(Number);
  return mm === 12 ? `${y + 1}-01-01` : `${y}-${String(mm + 1).padStart(2, '0')}-01`;
};
const STATE_TEXT: Record<DayState, string> = {
  free: 'free',
  taken: 'taken',
  elsewhere: 'taken',
};

function Month({
  roomId,
  month,
  from,
  to,
  onPick,
  T,
}: {
  roomId: string;
  month: string;
  from: string | null;
  to: string | null;
  onPick: (d: string) => void;
  T: string;
}) {
  const db = useDB();
  const lead = (new Date(month + 'T00:00Z').getUTCDay() + 6) % 7;
  const days: string[] = [];
  for (let d = month; d.slice(0, 7) === month.slice(0, 7); d = addDays(d, 1)) days.push(d);
  return (
    <div className="av-month">
      <h4>{fmt(month, { month: 'long', year: 'numeric' })}</h4>
      <div className="av-grid" role="grid" aria-label={fmt(month, { month: 'long', year: 'numeric' })}>
        {WD.map(w => (
          <span key={w} className="av-wd" aria-hidden>
            {w.slice(0, 2)}
          </span>
        ))}
        {Array.from({ length: lead }, (_, i) => (
          <span key={'x' + i} />
        ))}
        {days.map(d => {
          const st = dayState(db, roomId, d);
          const past = d < T;
          const inSel = from && (d === from || (to && d > from && d < to));
          const isOut = to && d === to;
          // a taken night can still be the check-out day of a stay that ends there
          const canOut = !!from && !to && d > from && rangeFree(db, roomId, from, d);
          const usable = !past && (st === 'free' || canOut);
          return (
            <button
              key={d}
              className={
                'av-d s-' +
                (past ? 'past' : st) +
                (inSel ? ' sel' : '') +
                (isOut ? ' out' : '') +
                (d === T ? ' today' : '')
              }
              disabled={!usable}
              aria-pressed={!!inSel || !!isOut}
              aria-label={`${fmt(d, { weekday: 'long', day: 'numeric', month: 'long' })}: ${past ? 'past' : STATE_TEXT[st]}${isOut ? ', check-out' : ''}`}
              onClick={() => onPick(d)}
            >
              {+d.slice(8)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Three months for one extra unit, with date picking and the booking button. */
export function UnitAvailability({ p, months = 3 }: { p: Property; months?: number }) {
  const db = useDB();
  const u = me();
  const T = londonToday();
  const room = unitOf(db, p.id);
  const [from, setFrom] = useState<string | null>(null);
  const [to, setTo] = useState<string | null>(null);
  const [who, setWho] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const list = useMemo(() => {
    const out = [first(T)];
    while (out.length < months) out.push(nextMonth(out[out.length - 1]));
    return out;
  }, [T, months]);
  if (!room) return null;
  const pick = (d: string) => {
    setMsg(null);
    if (from && !to && d > from && rangeFree(db, room.id, from, d)) setTo(d);
    else {
      setFrom(d);
      setTo(null);
    }
  };
  const nights = from && to ? diffDays(from, to) : 0;
  const canAsk = u.role === 'client' || u.role === 'manager';
  const send = async () => {
    if (!from || !to) return;
    setBusy(true);
    try {
      await data.saveStay({
        roomId: room.id,
        workerId: null,
        holdLabel: who.trim() || 'Name to follow',
        arrival: from,
        departure: to,
        depStatus: 'planned',
        away: null,
        notes: '',
      });
      setMsg({
        ok: true,
        text:
          `Booked and confirmed: ${p.name} (whole property), ${fmt(from)} → ${fmt(to)}. ` +
          `${estimateLine(db, p, diffDays(from, to))}. ` +
          (u.role === 'client' ? 'Donald has been notified. ' : '') +
          'Invoiced separately; long-term deals possible.',
      });
      setFrom(null);
      setTo(null);
      setWho('');
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="av" data-unit={room.id}>
      <div className="av-key" aria-hidden>
        <span className="k free">Free</span>
        <span className="k taken">Taken</span>
      </div>
      <div className="av-months">
        {list.map(m => (
          <Month key={m} roomId={room.id} month={m} from={from} to={to} onPick={pick} T={T} />
        ))}
      </div>
      <div className="av-bar" aria-live="polite">
        {!from ? (
          <p className="av-hint">Tap the first night, then the check-out day.</p>
        ) : !to ? (
          <p className="av-hint">
            Arriving <b>{fmt(from)}</b> · now tap the check-out day
          </p>
        ) : (
          <>
            <p className="av-sum">
              <b>
                {fmt(from)} → {fmt(to)}
              </b>{' '}
              · {nights} night{nights === 1 ? '' : 's'}
            </p>
            {canAsk && (
              <>
                <label className="av-who">
                  Who is staying? <small>(optional)</small>
                  <input value={who} onChange={e => setWho(e.target.value)} placeholder="Name to follow" />
                </label>
                <p className="av-est" data-est={p.id}>
                  <b>{estimateLine(db, p, nights)}</b>
                  <small>Whole property · {PRICE_NOTE}</small>
                </p>
                <button className="s-btn big av-go" disabled={busy} onClick={send}>
                  Book these dates
                </button>
                <p className="av-small">Confirmed straight away · Donald is notified · invoiced separately</p>
              </>
            )}
          </>
        )}
        {msg && (
          <p className={'av-msg ' + (msg.ok ? 'ok' : 'bad')} role={msg.ok ? 'status' : 'alert'}>
            {msg.text}
          </p>
        )}
      </div>
    </div>
  );
}

/** Stand-alone page: #availability (optionally #availability/<propertyId>). Dates only, no guest details. */
export function AvailabilityPage({ only }: { only?: string }) {
  const db = useDB();
  const extras = db.properties.filter(p => !p.contracted && (!only || p.id === only));
  return (
    <div className="avp">
      <header className="avp-top">
        <a className="avp-brand" href="#">
          <span className="mark">LR</span>
          <b>Roomboard</b>
        </a>
        <div className="sp" />
        {data.mode === 'demo' && (
          <span className="avp-sim" title="Demo: calendars come from sample feeds, not real bookings">
            Simulated
          </span>
        )}
        {data.mode === 'demo' && (
          <select
            className="s-who"
            aria-label="Demo: switch person"
            value={me().id}
            onChange={e => data.setUser(e.target.value)}
          >
            {db.users.map(x => (
              <option key={x.id} value={x.id}>
                {x.role === 'client' ? 'Sheena' : x.role === 'manager' ? 'Donald' : 'Cleaner'}
              </option>
            ))}
          </select>
        )}
      </header>
      <main className="avp-main">
        <h1>Extra properties</h1>
        <p className="avp-lead">
          Breasclete, Isle of Lewis · next 3 months. <b>Extra · invoiced separately</b>, outside the contract
          allocation. Each is booked as a whole property. {PRICE_NOTE}
        </p>
        {only && (
          <p>
            <a href="#availability">All extra properties</a>
          </p>
        )}
        {extras.map(p => (
          <section className="avp-card" key={p.id} id={'av-' + p.id} aria-label={p.name}>
            <div className="avp-head">
              {p.photo ? (
                <img src={thumb(p.photo)} alt="" loading="lazy" />
              ) : (
                <div className="avp-nophoto">Photos to come</div>
              )}
              <div>
                <h2>{p.name}</h2>
                <p>{[p.beds, p.sleeps && `Sleeps ${p.sleeps}`].filter(Boolean).join(' · ') || 'Details to come'}</p>
                <span className="xtag">Extra · invoiced separately</span>
                <span className="price-line">{priceLine(db, p)}</span>
                <a className="avp-more" href={'#available/' + p.id}>
                  Details and photos ›
                </a>
              </div>
            </div>
            <UnitAvailability p={p} />
          </section>
        ))}
        <p className="avp-foot">
          {data.mode === 'demo'
            ? 'Simulated: “taken” dates come from a sample booking calendar in this demo.'
            : 'Taken dates include bookings made on other websites (checked every 3 hours).'}
        </p>
      </main>
    </div>
  );
}
