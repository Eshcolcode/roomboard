// Per-room list: who is in, what's next, and whether the room will be ready. Sheena's phone home.
import { useDB, me, stayLabel, bathText, occupancy, roomReadiness, isAway, inHouseOn } from '../data';
import type { Stay } from '../data';
import { addDays, diffDays, fmt, londonToday } from '../dates';
import type { PanelInit } from './StayPanel';

/** "Leaves Fri 23 Oct (planned)" / "Until further notice" / "Departure TBC" — never "departs Until further notice". */
export function leaving(s: Stay) {
  if (s.depStatus === 'ufn') return 'Until further notice';
  if (s.depStatus === 'tbc' || !s.departure) return 'Departure TBC';
  return `Leaves ${fmt(s.departure)}${s.depStatus === 'confirmed' ? ' (confirmed)' : ' (planned)'}`;
}

export function Rooms({ onOpen }: { onOpen: (p: PanelInit) => void }) {
  const db = useDB();
  const u = me();
  const T = londonToday();
  const canEdit = u.role !== 'cleaner';
  const client = u.role === 'client';

  return (
    <div className="page narrow">
      <div className="ph">
        <div>
          <h1>Rooms</h1>
          <p>{fmt(T, { weekday: 'long', day: 'numeric', month: 'long' })}</p>
        </div>
      </div>
      {db.properties
        .filter(p => p.contracted)
        .map(p => {
          const o = occupancy(T, p.id);
          return (
            <section className="card rooms" key={p.id} aria-label={p.name}>
              <h3>
                {p.name}
                <small>
                  {o.allocated} allocated · {o.onSite} on site
                </small>
              </h3>
              {db.rooms
                .filter(r => r.propertyId === p.id)
                .map(r => {
                  const rs = db.stays.filter(s => s.roomId === r.id).sort((a, b) => a.arrival.localeCompare(b.arrival));
                  const now = rs.find(s => inHouseOn(s, T));
                  // a back-to-back stay by the same worker is a continuation, not a new arrival
                  let until = now;
                  const chain: Stay[] = [];
                  while (until?.departure) {
                    const c = rs.find(
                      s => s.arrival === until!.departure && s.workerId && s.workerId === until!.workerId,
                    );
                    if (!c) break;
                    chain.push(c);
                    until = c;
                  }
                  const nx = rs.find(s => s.arrival > T && !chain.includes(s));
                  const rd = roomReadiness(r.id);
                  const rdText = rd ? (client ? rd.client : rd.provider) : null;
                  const awayNow = now && isAway(now, T);
                  const awaySoon = now?.away && now.away.from > T && now.away.from <= addDays(T, 7);
                  const target = now ?? nx;
                  return (
                    <div
                      key={r.id}
                      data-room={r.id}
                      className={'rr' + (canEdit ? ' click' : '') + (awayNow ? ' is-away' : '')}
                      role={canEdit ? 'button' : undefined}
                      tabIndex={canEdit ? 0 : undefined}
                      onClick={() => canEdit && (target ? onOpen({ stay: target }) : onOpen({ roomId: r.id, date: T }))}
                      onKeyDown={e =>
                        canEdit &&
                        e.key === 'Enter' &&
                        (target ? onOpen({ stay: target }) : onOpen({ roomId: r.id, date: T }))
                      }
                    >
                      <div className="rn">
                        <b>{r.name}</b>
                        <small>{bathText(r)}</small>
                      </div>
                      <div className="rw">
                        {now ? (
                          <>
                            <b>{stayLabel(now)}</b>
                            <small>
                              Night {diffDays(now.arrival, T) + 1} ·{' '}
                              {chain.length ? `staying on · ${leaving(until!)}` : leaving(now)}
                            </small>
                          </>
                        ) : (
                          <span className="vac">Free tonight</span>
                        )}
                        {awayNow && <small className="awaytag">Away · room kept · back {fmt(now!.away!.to)}</small>}
                        {awaySoon && (
                          <small className="awaytag soon">Away from {fmt(now!.away!.from)} · room kept</small>
                        )}
                        <small className="nx">
                          Next: {nx ? `${stayLabel(nx)} · arrives ${fmt(nx.arrival)}` : 'nothing booked'}
                        </small>
                        {rdText && <small className={'rdy rd-' + rd!.tone}>{rdText}</small>}
                      </div>
                    </div>
                  );
                })}
            </section>
          );
        })}
      {!db.properties.some(p => p.contracted) && <p className="empty-state">No properties yet.</p>}
    </div>
  );
}
