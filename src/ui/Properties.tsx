// Properties: every house with its real details and photos. Contract houses list their rooms (bathroom type,
// photos); extra properties show availability and take requests ("Extra · invoiced separately").
// Unknown items are marked "details to come", never invented. #available, #available/<propertyId>.
import { useState } from 'react';
import { data, useDB, me, bathText, stayLabel, thumb } from '../data';
import type { Photo, Property, Stay } from '../data';
import { fmt, londonToday } from '../dates';
import { nextFree, pendingRequests, unitOf } from '../data/extras';
import { UnitAvailability } from './Availability';
import type { PanelInit } from './StayPanel';
import { toast } from './overlays';
import './props.css';

export function Properties({ sub, onOpen }: { sub?: string; onOpen: (p: PanelInit) => void }) {
  const db = useDB();
  const p = sub ? db.properties.find(x => x.id === sub) : undefined;
  if (p) return <PropertyPage p={p} onOpen={onOpen} />;
  const T = londonToday();
  const contract = db.properties.filter(x => x.contracted);
  const extras = db.properties.filter(x => !x.contracted);
  return (
    <div className="page pp">
      <div className="pp-title">
        <h1>Properties</h1>
        <p>All in Breasclete, Isle of Lewis</p>
      </div>
      <Requests onOpen={onOpen} />
      <h2 className="pp-h2">Contract houses</h2>
      <div className="pp-cards">
        {contract.map(x => (
          <PropCard key={x.id} p={x} line={`${db.rooms.filter(r => r.propertyId === x.id).length} bedrooms`} />
        ))}
      </div>
      <h2 className="pp-h2">
        Extra properties <small>Extra · invoiced separately · outside the contract allocation</small>
      </h2>
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

function PropCard({ p, line, status, extra }: { p: Property; line: string; status?: string; extra?: boolean }) {
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
        {status && <em className={status.startsWith('Free') ? 'ok' : ''}>{status}</em>}
        {extra && <span className="xtag">Extra · invoiced separately</span>}
      </span>
    </a>
  );
}

/** Requests for extra properties: Donald answers them, Sheena sees they are waiting. */
export function Requests({ onOpen }: { onOpen: (p: PanelInit) => void }) {
  const db = useDB();
  const u = me();
  const list = pendingRequests(db);
  if (!list.length || u.role === 'cleaner') return null;
  const name = (s: Stay) => db.properties.find(p => p.id === db.rooms.find(r => r.id === s.roomId)!.propertyId)!.name;
  return (
    <section className="pp-req" aria-label="Requests for extra properties">
      <h3>
        {u.role === 'manager'
          ? `${list.length} request${list.length === 1 ? '' : 's'} to answer`
          : `Waiting for Donald (${list.length})`}
      </h3>
      {list.map(s => (
        <div className="pp-rq" key={s.id}>
          <span>
            <b>{name(s)}</b>
            <small>
              {fmt(s.arrival)} → {s.departure ? fmt(s.departure) : 'open'} · {stayLabel(s)}
            </small>
          </span>
          <button className="btn primary" onClick={() => onOpen({ stay: s })}>
            {u.role === 'manager' ? 'Answer' : 'View'}
          </button>
        </div>
      ))}
    </section>
  );
}

function Gallery({ photos, name }: { photos: Photo[]; name: string }) {
  const [i, setI] = useState(0);
  const cur = photos[Math.min(i, photos.length - 1)];
  return (
    <div className="pp-gal">
      <img className="pp-main" src={cur.src} alt={cur.alt} />
      {photos.length > 1 && (
        <div className="pp-thumbs" role="group" aria-label={`${name} photos`}>
          {photos.map((ph, k) => (
            <button key={ph.src} className={k === i ? 'on' : ''} aria-pressed={k === i} onClick={() => setI(k)}>
              <img src={thumb(ph.src)} alt={ph.alt} loading="lazy" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function PropertyPage({ p, onOpen }: { p: Property; onOpen: (x: PanelInit) => void }) {
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
                      {r.photos?.length ? (
                        r.photos.map(ph => <img key={ph.src} src={thumb(ph.src)} alt={ph.alt} loading="lazy" />)
                      ) : (
                        <span className="pp-nophoto sm">Photo to come</span>
                      )}
                    </div>
                    <div className="pp-rb">
                      <b>{r.name}</b>
                      <span className={'pp-bath b-' + r.bath}>{bathText(r)}</span>
                      {(r.desc || r.note) && <small>{r.desc ?? r.note}</small>}
                    </div>
                  </article>
                ))}
            </div>
          </section>
        ))
      ) : (
        <section className="pp-unit" aria-label="Availability">
          <h2 className="pp-h2">Availability</h2>
          <UnitAvailability p={p} />
        </section>
      )}
      {!p.contracted && u.role === 'manager' && <CalendarLinks p={p} />}
      {p.contracted && <Requests onOpen={onOpen} />}
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
