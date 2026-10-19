// Extra properties: three-month availability per unit (free / taken only, never who), pick dates by tapping
// the first night and the check-out day, then "Book these dates". Used on the property page and on the
// stand-alone #availability page. A booking is confirmed straight away (whole property, indicative price shown);
// Eshcol is told, and invoicing happens separately.
import { useEffect, useMemo, useRef, useState } from 'react';
import { data, useDB, me, stayLabel, thumb, ROLE_LABEL } from '../data';
import type { Property } from '../data';
import { addDays, diffDays, fmt, londonToday } from '../dates';
import { dayState, openBlocker, ownOn, prefill, rangeFree, unitOf } from '../data/extras';
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
  meId,
  open = false,
}: {
  meId: string | null;
  open?: boolean;
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
          const own = meId && st === 'taken' ? ownOn(db, roomId, d, meId) : undefined;
          const past = d < T;
          const inSel = from && (d === from || (open ? d > from : to && d > from && d < to));
          const isOut = to && d === to;
          // a taken night can still be the check-out day of a stay that ends there
          const canOut = !open && !!from && !to && d > from && rangeFree(db, roomId, from, d);
          const usable = !past && (st === 'free' || canOut);
          return (
            <button
              key={d}
              data-d={d}
              className={
                'av-d s-' +
                (past ? 'past' : own ? 'mine' : st) +
                (inSel ? ' sel' : '') +
                (isOut ? ' out' : '') +
                (d === T ? ' today' : '')
              }
              disabled={!usable}
              aria-pressed={!!inSel || !!isOut}
              aria-label={`${fmt(d, { weekday: 'long', day: 'numeric', month: 'long' })}: ${past ? 'past' : own ? 'yours' : STATE_TEXT[st]}${isOut ? ', check-out' : ''}`}
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
export function UnitAvailability({
  p,
  months = 3,
  start,
  onBooked,
  onNext,
}: {
  p: Property;
  months?: number;
  start?: string;
  onBooked?: () => void;
  /** In the app: the dates go on to the normal booking flow (who is staying from the workers list or a new
   * name, or name to follow; then phone, notes, rota), the same one the contract rooms use. Without it (the
   * stand-alone availability page) the booking is made here with an optional name. */
  onNext?: (b: { roomId: string; date: string; departure: string | null }) => void;
}) {
  const db = useDB();
  const u = me();
  const T = londonToday();
  const room = unitOf(db, p.id);
  // a day tapped on the board or the Rooms card arrives here as `start`: prefill that night and up to a week
  const [init] = useState(() => (room && start && start >= T ? prefill(db, room.id, start) : null));
  const [from, setFrom] = useState<string | null>(init?.from ?? null);
  const [to, setTo] = useState<string | null>(init?.to ?? null);
  const [open, setOpen] = useState(false); // open-ended: until further notice, end date set later
  const barRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // bring the prefilled first night into view, clear of the sticky booking bar
    const bar = barRef.current;
    const day = bar?.parentElement?.querySelector('.av-d.sel');
    if (!init || !bar || !day) return;
    const box = bar.closest('.xs-body');
    const top = box ? box.getBoundingClientRect().top : 0;
    const bottom =
      (box ? box.getBoundingClientRect().bottom : innerHeight) - (parseFloat(getComputedStyle(bar).bottom) || 0);
    const r = day.getBoundingClientRect();
    // lowest the day may sit is just above the stuck bar; never push it above the top
    const delta = Math.min(r.bottom - (bottom - bar.offsetHeight - 16), r.top - top - 8);
    if (delta > 0) (box ?? document.scrollingElement)?.scrollBy({ top: delta, behavior: 'instant' });
  }, [init]);
  const [who, setWho] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const list = useMemo(() => {
    // show the month of a prefilled day even when it is further out
    const out = [
      init && init.from.slice(0, 7) > nextMonth(nextMonth(first(T))).slice(0, 7) ? first(init.from) : first(T),
    ];
    while (out.length < months) out.push(nextMonth(out[out.length - 1]));
    return out;
  }, [T, months, init]);
  if (!room) return null;
  const pick = (d: string) => {
    setMsg(null);
    if (!open && from && !to && d > from && rangeFree(db, room.id, from, d)) setTo(d);
    else {
      setFrom(d);
      setTo(null);
    }
  };
  const nights = from && to ? diffDays(from, to) : 0;
  const blocker = open && from ? openBlocker(db, room.id, from) : null;
  const canLonger = !!from && !!to && rangeFree(db, room.id, to, addDays(to, 1));
  const yours =
    u.role === 'client'
      ? db.stays
          .filter(s => s.roomId === room.id && s.bookedBy === u.id && (s.departure ?? '9') > T)
          .sort((a, b) => a.arrival.localeCompare(b.arrival))
      : [];
  const canAsk = u.role === 'client' || u.role === 'manager';
  const ready = !!from && (open ? !blocker : !!to);
  const send = async () => {
    if (!from || !ready) return;
    if (onNext) return onNext({ roomId: room.id, date: from, departure: open ? null : to });
    setBusy(true);
    try {
      await data.saveStay({
        roomId: room.id,
        workerId: null,
        holdLabel: who.trim() || 'Name to follow',
        arrival: from,
        departure: open ? null : to,
        depStatus: open ? 'ufn' : 'planned',
        away: null,
        notes: '',
      });
      setMsg({
        ok: true,
        text:
          `Booked and confirmed: ${p.name} (whole property), ${fmt(from)} → ${open ? 'until further notice' : fmt(to!)}. ` +
          `${estimateLine(db, p, open ? null : diffDays(from, to!))}. ` +
          (open ? 'Set the end date later from the booking. ' : '') +
          (u.role === 'client' ? 'Eshcol has been notified. ' : '') +
          'Invoiced separately; long-term deals possible.',
      });
      setFrom(null);
      setTo(null);
      setOpen(false);
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
        {u.role === 'client' && <span className="k mine">Yours</span>}
      </div>
      <div className="av-months">
        {list.map(m => (
          <Month
            key={m}
            roomId={room.id}
            month={m}
            from={from}
            to={open ? null : to}
            open={open}
            onPick={pick}
            T={T}
            meId={u.role === 'client' ? u.id : null}
          />
        ))}
      </div>
      {yours.length > 0 && (
        <div className="av-yours" aria-label={`Your bookings at ${p.name}`}>
          <b>Your bookings here</b>
          {yours.map(s => (
            <span key={s.id}>
              {fmt(s.arrival)} → {s.departure ? fmt(s.departure) : 'until further notice'} · {stayLabel(s)} ·{' '}
              {estimateLine(db, p, s.departure ? diffDays(s.arrival, s.departure) : null)}
            </span>
          ))}
        </div>
      )}
      <div className="av-bar" aria-live="polite" ref={barRef}>
        {!from ? (
          <p className="av-hint">Tap the first night, then the check-out day.</p>
        ) : (
          <>
            <div className="av-mode" role="group" aria-label="How long">
              <button
                className={!open ? 'on' : ''}
                aria-pressed={!open}
                onClick={() => {
                  setOpen(false);
                  setMsg(null);
                  if (!to) setTo(prefill(db, room.id, from)?.to ?? null);
                }}
              >
                Set dates
              </button>
              <button
                className={open ? 'on' : ''}
                aria-pressed={open}
                onClick={() => {
                  setOpen(true);
                  setMsg(null);
                }}
              >
                Open-ended
              </button>
            </div>
            {open ? (
              <p className="av-sum">
                <b>From {fmt(from)}</b> · until further notice
              </p>
            ) : !to ? (
              <p className="av-hint">
                Arriving <b>{fmt(from)}</b> · now tap the check-out day
              </p>
            ) : (
              <div className="av-range">
                <p className="av-sum">
                  <b>
                    {fmt(from)} → {fmt(to)}
                  </b>{' '}
                  · {nights} night{nights === 1 ? '' : 's'}
                </p>
                <div className="av-step" role="group" aria-label="Change the length">
                  <button aria-label="One night fewer" disabled={nights <= 1} onClick={() => setTo(addDays(to, -1))}>
                    −
                  </button>
                  <button aria-label="One night more" disabled={!canLonger} onClick={() => setTo(addDays(to, 1))}>
                    +
                  </button>
                </div>
              </div>
            )}
            {open && blocker && (
              <p className="av-msg bad" role="alert">
                Open-ended needs every night from {fmt(from)} free, but {p.name} is taken from {fmt(blocker)}. Pick a
                later first night, or set dates.
              </p>
            )}
            {canAsk && ready && (
              <>
                {!onNext && (
                  <label className="av-who">
                    Who is staying? <small>(optional)</small>
                    <input value={who} onChange={e => setWho(e.target.value)} placeholder="Name to follow" />
                  </label>
                )}
                <p className="av-est" data-est={p.id}>
                  <b>{estimateLine(db, p, open ? null : nights)}</b>
                  <small>
                    Whole property · {open ? 'charged weekly until an end date is set · ' : ''}
                    {PRICE_NOTE}
                  </small>
                </p>
                <button className="s-btn big av-go" disabled={busy} onClick={send}>
                  {open ? 'Book open-ended' : 'Book these dates'}
                </button>
                <p className="av-small">
                  {onNext
                    ? 'Next: who is staying (name can follow) · confirmed straight away · invoiced separately'
                    : 'Confirmed straight away · Eshcol is notified · invoiced separately'}
                </p>
              </>
            )}
          </>
        )}
        {msg && (
          <p className={'av-msg ' + (msg.ok ? 'ok' : 'bad')} role={msg.ok ? 'status' : 'alert'}>
            {msg.text}
          </p>
        )}
        {msg?.ok && onBooked && (
          <button className="s-btn big ghost av-done" onClick={onBooked}>
            Done
          </button>
        )}
      </div>
    </div>
  );
}

/** Stand-alone page: #availability (optionally #availability/<propertyId>). Dates only, no guest details. */
export function AvailabilityPage({ only }: { only?: string }) {
  const db = useDB();
  const extras = db.properties.filter(p => !p.contracted && (!only || p.id === only));
  const hk = me().role === 'cleaner'; // housekeeper: dates only, no prices or invoicing
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
            aria-label="Demo: switch login"
            value={me().id}
            onChange={e => data.setUser(e.target.value)}
          >
            {db.users.map(x => (
              <option key={x.id} value={x.id}>
                {ROLE_LABEL[x.role]}
              </option>
            ))}
          </select>
        )}
      </header>
      <main className="avp-main">
        <h1>Extra properties</h1>
        <p className="avp-lead">
          Breasclete, Isle of Lewis · next 3 months.
          {hk ? (
            ' Which dates are free or taken.'
          ) : (
            <>
              {' '}
              <b>Extra · invoiced separately</b>, outside the contract allocation. Each is booked as a whole property.{' '}
              {PRICE_NOTE}
            </>
          )}
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
                {!hk && <span className="xtag">Extra · invoiced separately</span>}
                {!hk && <span className="price-line">{priceLine(db, p)}</span>}
                {!hk && (
                  <a className="avp-more" href={'#available/' + p.id}>
                    Details and photos ›
                  </a>
                )}
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
