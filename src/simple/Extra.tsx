// Quick card for a booking of an extra property (Harris, Uig, Monadh, Abhainn Cottage). Bookings are confirmed
// straight away: no request step. Shows the indicative price; Donald, or Sheena for her own booking, can cancel.
import { useState } from 'react';
import { data, useDB, me, stayLabel, thumb } from '../data';
import type { Stay } from '../data';
import { estimateLine, priceLine, PRICE_NOTE } from '../data/pricing';
import { diffDays, fmt } from '../dates';
import { Box, Note } from './parts';
import { DateField } from '../ui/DateField';
import { addDays } from '../dates';
import type { Notify } from './Book';

export function ExtraCard({ stay, onHome, notify }: { stay: Stay; onHome: () => void; notify: Notify }) {
  const db = useDB();
  const u = me();
  const [ask, setAsk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const room = db.rooms.find(r => r.id === stay.roomId)!;
  const p = db.properties.find(x => x.id === room.propertyId)!;
  const nights = stay.departure ? diffDays(stay.arrival, stay.departure) : null;
  const mine = u.role === 'manager' || stay.bookedBy === u.id;
  const [end, setEnd] = useState(stay.departure ?? '');
  const saveEnd = async (dep: string | null) => {
    setBusy(true);
    setProblem('');
    try {
      await data.saveStay({ ...stay, away: stay.away ?? null, departure: dep, depStatus: dep ? 'planned' : 'ufn' });
      notify(dep ? `End date set · ${p.name} · ${fmt(dep)}` : `${p.name} · open-ended again`, 1);
      onHome();
    } catch (e) {
      setProblem((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const cancel = async () => {
    setBusy(true);
    setProblem('');
    try {
      await data.deleteStay(stay.id);
      notify(`Cancelled · ${p.name}${u.role === 'client' ? ' · Donald is told' : ''}`, 1);
      onHome();
    } catch (e) {
      setProblem((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  if (ask)
    return (
      <Box
        step="x-cancel"
        title="Cancel this booking?"
        sub={`${p.name} · ${fmt(stay.arrival)} → ${stay.departure ? fmt(stay.departure) : 'open'}`}
        onBack={() => setAsk(false)}
        onClose={onHome}
      >
        <button className="s-btn big red" disabled={busy} onClick={cancel}>
          Cancel booking
        </button>
        {problem && <Note tone="bad">{problem}</Note>}
      </Box>
    );
  return (
    <Box
      step="x-card"
      title={p.name}
      sub={<span className="xtag">Extra · whole property · invoiced separately</span>}
      onClose={onHome}
    >
      <div className="x-sum">
        {p.photo && <img src={thumb(p.photo)} alt="" />}
        <div>
          <small>Booked · confirmed</small>
          <b>{p.name}</b>
          <span>
            {fmt(stay.arrival)} → {stay.departure ? fmt(stay.departure) : 'until further notice'}
            {nights ? ` · ${nights} night${nights === 1 ? '' : 's'}` : ''}
          </span>
          <span>{stayLabel(stay)}</span>
        </div>
      </div>
      <div className="price-box" data-price={p.id}>
        <b>{estimateLine(db, p, nights)}</b>
        <small>
          {priceLine(db, p)}. {PRICE_NOTE}
        </small>
      </div>
      {mine && (
        <div className="x-end" data-end={stay.id}>
          <label htmlFor={'end-' + stay.id}>
            <b>{stay.departure ? 'End date (check-out)' : 'Open-ended · set an end date when you know it'}</b>
          </label>
          <div className="x-endrow">
            <DateField
              id={'end-' + stay.id}
              value={end}
              min={addDays(stay.arrival, 1)}
              onChange={setEnd}
              label="End date"
            />
            <button
              className="s-btn"
              disabled={busy || !end || end <= stay.arrival || end === stay.departure}
              onClick={() => saveEnd(end)}
            >
              Save end date
            </button>
          </div>
          {stay.departure && (
            <button className="s-link" disabled={busy} onClick={() => saveEnd(null)}>
              Make it open-ended (until further notice)
            </button>
          )}
        </div>
      )}
      {mine ? (
        <button className="s-btn big ghost" onClick={() => setAsk(true)}>
          Cancel booking
        </button>
      ) : (
        <Note tone="ok">Booked by Donald. To change it, ask him.</Note>
      )}
      {problem && <Note tone="bad">{problem}</Note>}
      <a className="s-link" href={'#available/' + p.id} onClick={onHome}>
        Property details and availability
      </a>
    </Box>
  );
}
