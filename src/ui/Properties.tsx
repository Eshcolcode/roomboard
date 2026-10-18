// Properties: every house with its real details, photos and indicative price. Contract houses list their rooms;
// extra properties show availability and are booked straight away, whole ("Extra · invoiced separately").
// Donald sets the one indicative rate here (Sheena sees the prices only).
// Unknown items are marked "details to come", never invented. #available, #available/<propertyId>.
import { useRef, useState } from 'react';
import { Lightbox } from './Lightbox';
import { data, useDB, me, bathText, thumb } from '../data';
import type { Photo, Property } from '../data';
import { fmt, londonToday } from '../dates';
import { nextFree, unitOf } from '../data/extras';
import { CONTRACT_LINE, gbp, priceLine, priced, rate, PRICE_NOTE } from '../data/pricing';
import { UnitAvailability } from './Availability';
import type { PanelInit } from './StayPanel';
import { toast } from './overlays';
import './props.css';

export function Properties({ sub, start }: { sub?: string; start?: string; onOpen?: (p: PanelInit) => void }) {
  const db = useDB();
  const p = sub ? db.properties.find(x => x.id === sub) : undefined;
  if (p) return <PropertyPage p={p} start={start && /^\d{4}-\d\d-\d\d$/.test(start) ? start : undefined} />;
  const T = londonToday();
  const contract = db.properties.filter(x => x.contracted);
  const extras = db.properties.filter(x => !x.contracted);
  return (
    <div className="page pp">
      <div className="pp-title">
        <h1>Properties</h1>
        <p>All in Breasclete, Isle of Lewis</p>
      </div>
      <h2 className="pp-h2">
        Contract houses <small>{CONTRACT_LINE} · fixed weekly rate however many rooms are used</small>
      </h2>
      <div className="pp-cards">
        {contract.map(x => (
          <PropCard
            key={x.id}
            p={x}
            line={`${db.rooms.filter(r => r.propertyId === x.id).length} bedrooms · booked per room`}
            price={priceLine(db, x) ?? CONTRACT_LINE}
          />
        ))}
      </div>
      <h2 className="pp-h2">
        Extra properties{' '}
        <small>Booked as a whole property · invoiced separately · outside the contract allocation</small>
      </h2>
      <p className="pp-price-note">
        <b>Indicative {'£' + rate(db).toLocaleString('en-GB')} per room per week</b> · {PRICE_NOTE}
      </p>
      {me().role === 'manager' && <RateSetting />}
      <div className="pp-cards">
        {extras.map(x => {
          const r = unitOf(db, x.id);
          const nf = r ? nextFree(db, r.id, T) : null;
          return (
            <PropCard
              key={x.id}
              p={x}
              extra
              line={[x.beds, x.sleeps && `Sleeps ${x.sleeps}`].filter(Boolean).join(' · ') || 'Details to come'}
              price={priceLine(db, x) ?? CONTRACT_LINE}
              status={nf ? (nf === T ? 'Free tonight' : `Free from ${fmt(nf)}`) : 'Fully booked for now'}
            />
          );
        })}
      </div>
      <p className="pp-foot">
        <a href="#availability">Open the availability page</a> · one page with every extra property for the next 3
        months.
      </p>
      {me().role === 'manager' && <Enquiries />}
    </div>
  );
}

// enquiries sent from the old "More rooms" page (and any still arriving) stay visible to Donald
function Enquiries() {
  const db = useDB();
  return (
    <details className="pp-cal" open={db.enquiries.length > 0 || undefined}>
      <summary>Earlier enquiries ({db.enquiries.length})</summary>
      {db.enquiries.length ? (
        <ul>
          {db.enquiries.map(e => (
            <li key={e.id}>
              <span>
                <b>
                  {db.properties.find(x => x.id === e.propertyId)?.name ?? 'Property'} · {e.people}{' '}
                  {e.people === 1 ? 'person' : 'people'}
                </b>
                <small>
                  From {fmt(e.from)} {e.longTerm ? '· long-term' : e.to ? '→ ' + fmt(e.to) : ''}{' '}
                  {e.note && '· ' + e.note}
                </small>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="empty-state">No enquiries yet.</p>
      )}
    </details>
  );
}

function PropCard({
  p,
  line,
  price,
  status,
  extra,
}: {
  p: Property;
  line: string;
  price: string;
  status?: string;
  extra?: boolean;
}) {
  return (
    <a className="pp-card" href={'#available/' + p.id} data-prop={p.id}>
      {p.photo ? (
        <img src={thumb(p.photo)} alt="" loading="lazy" />
      ) : (
        <span className="pp-nophoto">Photos to come</span>
      )}
      <span className="pp-cb">
        <b>{p.name}</b>
        <small>{line}</small>
        <small className="pp-price">{price}</small>
        {status && <em className={status.startsWith('Free') ? 'ok' : ''}>{status}</em>}
        {extra && <span className="xtag">Extra · invoiced separately</span>}
      </span>
    </a>
  );
}

const chargeText = (p: Property) =>
  p.charged && p.bedrooms && p.charged < p.bedrooms
    ? `Booked as a whole property: ${p.charged} of its ${p.bedrooms} rooms are charged (the sofa-bed/desk room is not), even if only one is used.`
    : 'Booked as a whole property: every bedroom is charged, even if only one is used.';

/** Donald only: the one indicative rate used for every price in the app. Sheena sees the prices, not this. */
function RateSetting() {
  const db = useDB();
  const [v, setV] = useState(String(rate(db)));
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      await data.setSettings({ ratePerRoomWeek: Number(v) });
      toast(`Indicative rate set to £${Math.round(Number(v))} per room per week`);
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="pp-rate" aria-label="Indicative rate">
      <label>
        <span>
          <b>Indicative rate</b>
          <small>
            Per room per week, for the extra properties (contract houses never show a price). Only you can change it.
          </small>
        </span>
        <span className="pp-rate-in">
          £
          <input
            inputMode="numeric"
            value={v}
            onChange={e => setV(e.target.value.replace(/[^\d]/g, ''))}
            aria-label="Indicative rate in pounds per room per week"
          />
        </span>
      </label>
      <button className="btn primary" disabled={busy || !v || Number(v) === rate(db)} onClick={save}>
        Save
      </button>
      <RateHistory />
    </section>
  );
}

/** Donald only: every change of the rate, newest first: who, when, old → new. */
function RateHistory() {
  const db = useDB();
  const list = db.rateHistory ?? [];
  const who = (id: string | null) => db.users.find(u => u.id === id)?.name ?? 'Someone';
  const when = (t: string) =>
    new Date(t).toLocaleString('en-GB', {
      timeZone: 'Europe/London',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  return (
    <details className="pp-hist">
      <summary>Rate history ({list.length})</summary>
      {list.length ? (
        <table>
          <thead>
            <tr>
              <th>When (UK time)</th>
              <th>Who</th>
              <th>Change</th>
            </tr>
          </thead>
          <tbody>
            {list.map(h => (
              <tr key={h.ts + h.to}>
                <td>{when(h.ts)}</td>
                <td>{who(h.userId)}</td>
                <td>
                  {h.from == null ? '—' : gbp(h.from)} → <b>{gbp(h.to)}</b>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="empty-state">Not changed yet: £350 per room per week since the start.</p>
      )}
    </details>
  );
}

function Gallery({ photos, name }: { photos: Photo[]; name: string }) {
  const [i, setI] = useState(0);
  const [big, setBig] = useState(false);
  const k = Math.min(i, photos.length - 1);
  const cur = photos[k];
  const down = useRef<number | null>(null);
  const swiped = useRef(false);
  const go = (d: number) => setI((k + d + photos.length) % photos.length);
  return (
    <div className="pp-gal">
      <div
        className="pp-stage"
        onPointerDown={e => (down.current = e.clientX)}
        onPointerUp={e => {
          const dx = down.current == null ? 0 : e.clientX - down.current;
          down.current = null;
          swiped.current = Math.abs(dx) > 40;
          if (swiped.current && photos.length > 1) go(dx < 0 ? 1 : -1);
        }}
      >
        <button
          className="pp-mainbtn"
          aria-label={`Enlarge photo ${k + 1} of ${photos.length}: ${cur.alt}`}
          onClick={() => !swiped.current && setBig(true)}
        >
          <img className="pp-main" src={cur.src} alt={cur.alt} draggable={false} />
          <span className="pp-count">
            {k + 1} / {photos.length} · tap to enlarge
          </span>
        </button>
        {photos.length > 1 && (
          <>
            <button className="pp-arrow prev" aria-label="Previous photo" onClick={() => go(-1)}>
              ‹
            </button>
            <button className="pp-arrow next" aria-label="Next photo" onClick={() => go(1)}>
              ›
            </button>
          </>
        )}
      </div>
      {photos.length > 1 && (
        <div className="pp-thumbs" role="group" aria-label={`${name} photos`}>
          {photos.map((ph, n) => (
            <button key={ph.src + n} className={n === k ? 'on' : ''} aria-pressed={n === k} onClick={() => setI(n)}>
              <img src={thumb(ph.src)} alt={ph.alt} loading="lazy" />
            </button>
          ))}
        </div>
      )}
      {big && <Lightbox photos={photos} start={k} title={name} onClose={() => setBig(false)} />}
    </div>
  );
}

/** A room card's photos: one cover (same size on every card), tap to open all of them full screen. */
function RoomPhotos({ photos, name }: { photos?: Photo[]; name: string }) {
  const [big, setBig] = useState(false);
  if (!photos?.length) return <span className="pp-nophoto pp-cover">Photo to come</span>;
  return (
    <>
      <button
        className="pp-coverbtn"
        onClick={() => setBig(true)}
        aria-label={`${name}: view ${photos.length} photo${photos.length === 1 ? '' : 's'}`}
      >
        <img className="pp-cover" src={thumb(photos[0].src)} alt={photos[0].alt} loading="lazy" />
        {photos.length > 1 && <span className="pp-more">+{photos.length - 1}</span>}
      </button>
      {big && <Lightbox photos={photos} title={name} onClose={() => setBig(false)} />}
    </>
  );
}

function PropertyPage({ p, start }: { p: Property; start?: string }) {
  const db = useDB();
  const u = me();
  const units = db.units.filter(x => x.propertyId === p.id);
  const facts = [
    !p.contracted && p.beds && ['Bedrooms', p.beds],
    p.sleeps && ['Sleeps', p.sleeps],
    p.checkin && ['Check-in', `from ${p.checkin}`],
    p.checkout && ['Check-out', `by ${p.checkout}`],
  ].filter(Boolean) as [string, string][];
  return (
    <div className="page pp pp-detail">
      <a className="pp-back" href="#available">
        ‹ All properties
      </a>
      {p.photos?.length ? <Gallery photos={p.photos} name={p.name} /> : <div className="pp-nohero">Photos to come</div>}
      <div className="pp-head">
        <h1>{p.name}</h1>
        {!p.contracted && <span className="xtag big">Extra · invoiced separately</span>}
        <p className="pp-addr">
          {p.address || p.area || 'Address to come'}
          {p.mapUrl && (
            <>
              {' · '}
              <a href={p.mapUrl} target="_blank" rel="noreferrer">
                Map
              </a>
            </>
          )}
        </p>
      </div>
      <p className="pp-blurb">{p.blurb}</p>
      {priced(p) ? (
        <div className="price-box" data-price={p.id}>
          <b>{priceLine(db, p)}</b>
          <small>
            {chargeText(p)} Pro rata: the weekly price ÷ 7 per night. {PRICE_NOTE}
          </small>
        </div>
      ) : (
        // on the block contract: no price, ever
        <div className="price-box contract" data-price="contract">
          <b>{CONTRACT_LINE}</b>
          <small>On the block contract: a fixed weekly rate, however many rooms are used.</small>
        </div>
      )}
      {facts.length > 0 && (
        <dl className="pp-facts">
          {facts.map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      )}
      {p.features.length > 0 && (
        <ul className="pp-feat" aria-label="Facilities">
          {p.features.map(f => (
            <li key={f}>{f}</li>
          ))}
        </ul>
      )}
      {p.bookingUrl && (
        <a className="btn ghost pp-book" href={p.bookingUrl} target="_blank" rel="noreferrer">
          Check availability ↗<small>Opens the public booking page in a new tab</small>
        </a>
      )}
      {p.contracted ? (
        units.map(un => (
          <section key={un.id} className="pp-unit" aria-label={un.name}>
            <h2 className="pp-h2">{un.name}</h2>
            <div className="pp-rooms">
              {db.rooms
                .filter(r => r.unitId === un.id)
                .map(r => (
                  <article className="pp-room" key={r.id} id={'room-' + r.id}>
                    <div className="pp-rph">
                      <RoomPhotos photos={r.photos} name={`${p.short} ${r.name}`} />
                    </div>
                    <div className="pp-rb">
                      <b>{r.name}</b>
                      <span className={'pp-bath b-' + r.bath}>{bathText(r)}</span>
                      {(r.desc || r.note) && (r.desc ?? r.note) !== bathText(r) && <small>{r.desc ?? r.note}</small>}
                    </div>
                  </article>
                ))}
            </div>
          </section>
        ))
      ) : (
        <section className="pp-unit" aria-label="Availability">
          <h2 className="pp-h2">Availability</h2>
          <UnitAvailability p={p} start={start} />
        </section>
      )}
      {!p.contracted && u.role === 'manager' && <CalendarLinks p={p} />}
      {p.todo?.length ? (
        <p className="pp-todo">
          <span>Details to come:</span> {p.todo.join(' · ')}
        </p>
      ) : null}
      <p className="pp-credit">
        {p.credit}
        {p.website && (
          <>
            {p.credit ? ' · ' : ''}
            <a href={p.website} target="_blank" rel="noreferrer">
              Website
            </a>
          </>
        )}
      </p>
    </div>
  );
}

/** Donald only: is this unit's booking calendar linked, when was it last read, and the export link. The calendar
 * link itself is a server secret (see docs/PROPERTY-DATA.md): it is never shown or typed in here. */
function CalendarLinks({ p }: { p: Property }) {
  const db = useDB();
  const room = unitOf(db, p.id)!;
  const feed = (db.feeds ?? []).find(f => f.roomId === room.id);
  const [busy, setBusy] = useState(false);
  const run = async (f: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try {
      await f();
      toast(ok);
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const when = (t: string) =>
    new Date(t).toLocaleString('en-GB', {
      timeZone: 'Europe/London',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  const exportIt = async () => {
    const r = await data.exportLink(room.id);
    if (r.url) {
      await navigator.clipboard?.writeText(r.url).catch(() => undefined);
      toast('Export link copied · paste it into Airbnb or Booking.com');
      return;
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([r.text], { type: 'text/calendar' }));
    a.download = `${p.short.toLowerCase().replace(/\W+/g, '-')}-roomboard.ics`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast('Calendar file downloaded (demo: the live app gives a link instead)');
  };
  return (
    <details className="pp-cal">
      <summary>Booking calendar (iCal)</summary>
      <p className="pp-calp">
        Dates booked or closed on this calendar show as taken here, with no guest details.
        {data.mode === 'demo' && <b> Simulated in this demo.</b>}
      </p>
      <div className={'pp-feed' + (feed?.linked ? ' on' : '')}>
        <b>{feed?.linked ? `Calendar linked · ${feed.label}` : 'Calendar not linked yet'}</b>
        {/* the link itself is never in the app: only its status */}
        <small>
          {!feed?.linked
            ? 'Send the calendar (.ics) link to Grok Bot. It is kept as a secret setting, never shown here.'
            : feed.error
              ? `Last read failed: ${feed.error}. The dates from the last good read are kept.`
              : feed.lastSync
                ? `Read ${when(feed.lastSync)} · read again every 3 hours`
                : 'Not read yet'}
        </small>
      </div>
      <div className="pp-calbtns">
        <button
          className="btn ghost"
          disabled={busy}
          onClick={() =>
            run(async () => {
              const r = await data.syncFeeds();
              if (r.conflicts)
                throw new Error(
                  `⚠ ${r.conflicts} booking${r.conflicts === 1 ? '' : 's'} overlap dates booked elsewhere`,
                );
            }, 'Calendars read')
          }
        >
          Read calendars now
        </button>
        <button className="btn ghost" onClick={exportIt}>
          {data.mode === 'demo' ? 'Download export (.ics)' : 'Copy export link'}
        </button>
      </div>
      <p className="pp-calp small">
        Export: paste Roomboard’s link into Airbnb or Booking.com so dates booked here are blocked there.
        {data.mode === 'demo' && ' Needs the live backend to give a link.'}
      </p>
    </details>
  );
}
