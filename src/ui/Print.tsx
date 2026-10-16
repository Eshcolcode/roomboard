// Printable sheets: today's movements, and the cleaning list. Screen preview + print CSS.
import { useDB, me, roomLabel, stayLabel, readinessFor, propOf, roomOf } from '../data';
import { addDays, fmt, londonToday } from '../dates';
import { movements } from './Today';
import { leaving } from './Rooms';

export function PrintView({ kind, onBack }: { kind: 'today' | 'cleaning'; onBack: () => void }) {
  const db = useDB();
  const u = me();
  const T = londonToday();
  const nm = (id: string | null) => {
    const s = db.stays.find(x => x.id === id);
    return s ? (u.role === 'cleaner' ? stayLabel(s).split(' ')[0] : stayLabel(s)) : '';
  };
  const m = movements(T);
  const cleans = db.changeovers
    .filter(c => !c.cancelled && c.status !== 'ready' && (c.scheduledFor ?? c.readyBy ?? c.afterDate) <= addDays(T, 7))
    .sort((a, b) => (a.scheduledFor ?? a.afterDate).localeCompare(b.scheduledFor ?? b.afterDate));
  const cleanerName = (id: string | null) =>
    u.role === 'client' ? '' : (db.users.find(x => x.id === id)?.name.split(' ')[0] ?? '');

  return (
    <div className="print-sheet">
      <div className="print-bar">
        <button className="btn ghost" onClick={onBack}>
          ← Back
        </button>
        <div className="sp" />
        <button className="btn" onClick={() => window.print()}>
          Print / save as PDF
        </button>
      </div>
      <article className="sheet-page">
        <header>
          <h1>
            {kind === 'today' ? 'Movements' : 'Cleaning list'} ·{' '}
            {fmt(T, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </h1>
          <p>
            Loch Roag Guest House · Eshcol Worker Accommodation · printed{' '}
            {new Date().toLocaleString('en-GB', {
              timeZone: 'Europe/London',
              day: '2-digit',
              month: '2-digit',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </p>
        </header>
        {kind === 'today' ? (
          <>
            <h2>Leaving today ({m.dep.length})</h2>
            <table>
              <thead>
                <tr>
                  <th>Room</th>
                  <th>Guest</th>
                  <th>Status</th>
                  <th className="tick">Left</th>
                </tr>
              </thead>
              <tbody>
                {m.dep.map(s => (
                  <tr key={s.id}>
                    <td>{roomLabel(s.roomId)}</td>
                    <td>{nm(s.id)}</td>
                    <td>{s.depStatus === 'confirmed' ? 'Confirmed' : 'Planned – check'}</td>
                    <td className="tick">☐</td>
                  </tr>
                ))}
                {!m.dep.length && (
                  <tr>
                    <td colSpan={4}>Nobody leaving</td>
                  </tr>
                )}
              </tbody>
            </table>
            <h2>Arriving today ({m.arr.length})</h2>
            <table>
              <thead>
                <tr>
                  <th>Room</th>
                  <th>Guest</th>
                  <th>Until</th>
                  <th className="tick">In</th>
                </tr>
              </thead>
              <tbody>
                {m.arr.map(s => (
                  <tr key={s.id}>
                    <td>{roomLabel(s.roomId)}</td>
                    <td>{nm(s.id)}</td>
                    <td>{leaving(s)}</td>
                    <td className="tick">☐</td>
                  </tr>
                ))}
                {!m.arr.length && (
                  <tr>
                    <td colSpan={4}>No arrivals</td>
                  </tr>
                )}
              </tbody>
            </table>
            <h2>Cleans today ({m.cos.length})</h2>
            <table>
              <thead>
                <tr>
                  <th>Room</th>
                  <th>Next arrival</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {m.cos.map(c => (
                  <tr key={c.id}>
                    <td>{roomLabel(c.roomId)}</td>
                    <td>{c.readyBy ? fmt(c.readyBy) : '—'}</td>
                    <td>{u.role === 'client' ? (readinessFor(c).client ?? '') : readinessFor(c).provider}</td>
                  </tr>
                ))}
                {!m.cos.length && (
                  <tr>
                    <td colSpan={3}>No cleans</td>
                  </tr>
                )}
              </tbody>
            </table>
            <h2>Staying on ({m.stay.length})</h2>
            <table>
              <thead>
                <tr>
                  <th>Room</th>
                  <th>Guest</th>
                  <th>Until</th>
                </tr>
              </thead>
              <tbody>
                {m.stay.map(s => (
                  <tr key={s.id}>
                    <td>{roomLabel(s.roomId)}</td>
                    <td>{nm(s.id)}</td>
                    <td>{leaving(s)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        ) : (
          <>
            <h2>Cleans for the next 7 days ({cleans.length})</h2>
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Room</th>
                  <th>Guest leaves</th>
                  <th>Needed by</th>
                  <th>Notes</th>
                  {u.role !== 'client' && <th>Cleaner</th>}
                  <th className="tick">Left</th>
                  <th className="tick">Done</th>
                </tr>
              </thead>
              <tbody>
                {cleans.map(c => {
                  const p = propOf(roomOf(c.roomId).propertyId);
                  return (
                    <tr key={c.id}>
                      <td>{c.scheduledFor ? fmt(c.scheduledFor) : 'To book'}</td>
                      <td>
                        {roomLabel(c.roomId)}
                        {c.zeroDay ? ` · same day (${p.checkout ?? '10:00'}–${p.checkin ?? '15:00'})` : ''}
                      </td>
                      <td>{fmt(c.afterDate)}</td>
                      <td>{c.readyBy ? fmt(c.readyBy) : '—'}</td>
                      <td>
                        {[c.note, c.exception && '⚠ outside usual window', nm(c.toStayId) && 'next: ' + nm(c.toStayId)]
                          .filter(Boolean)
                          .join(' · ')}
                      </td>
                      {u.role !== 'client' && <td>{cleanerName(c.cleanerId)}</td>}
                      <td className="tick">{c.vacated ? '☑' : '☐'}</td>
                      <td className="tick">☐</td>
                    </tr>
                  );
                })}
                {!cleans.length && (
                  <tr>
                    <td colSpan={8}>No cleans due</td>
                  </tr>
                )}
              </tbody>
            </table>
          </>
        )}
      </article>
    </div>
  );
}
