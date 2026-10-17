// Quick card for a booking of an extra property. A request shows Donald one-tap Confirm / Decline;
// Sheena sees that it is waiting and can withdraw it. Confirmed extras are changed by Donald only.
import { useState } from 'react';
import { data, useDB, me, stayLabel, thumb } from '../data';
import type { Stay } from '../data';
import { diffDays, fmt } from '../dates';
import { Box, Note } from './parts';
import type { Notify } from './Book';

export function ExtraCard({ stay, onHome, notify }: { stay: Stay; onHome: () => void; notify: Notify }) {
  const db = useDB();
  const u = me();
  const [q, setQ] = useState<null | 'decline' | 'cancel'>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const room = db.rooms.find(r => r.id === stay.roomId)!;
  const p = db.properties.find(x => x.id === room.propertyId)!;
  const pending = stay.request === 'pending';
  const nights = stay.departure ? diffDays(stay.arrival, stay.departure) : null;
  const act = async (f: () => Promise<void>, msg: string, undo = 1) => {
    setBusy(true);
    setProblem('');
    try {
      await f();
      notify(msg, undo);
      onHome();
    } catch (e) {
      setProblem((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  if (q === 'decline' || q === 'cancel')
    return (
      <Box
        step={'x-' + q}
        title={
          q === 'decline'
            ? 'Decline this request?'
            : u.role === 'client'
              ? 'Withdraw this request?'
              : 'Cancel this booking?'
        }
        sub={`${p.name} · ${fmt(stay.arrival)} → ${stay.departure ? fmt(stay.departure) : 'open'}`}
        onBack={() => setQ(null)}
        onClose={onHome}
      >
        {q === 'decline' && (
          <label className="x-field">
            <span>Reason for Sheena (optional)</span>
            <input
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="e.g. Not available those dates"
            />
          </label>
        )}
        <button
          className="s-btn big red"
          disabled={busy}
          onClick={() =>
            q === 'decline'
              ? act(() => data.declineRequest(stay.id, reason.trim()), `Declined · ${p.name}`)
              : act(() => data.deleteStay(stay.id), u.role === 'client' ? 'Request withdrawn' : `Cancelled · ${p.name}`)
          }
        >
          {q === 'decline' ? 'Decline request' : u.role === 'client' ? 'Withdraw request' : 'Cancel booking'}
        </button>
        {problem && <Note tone="bad">{problem}</Note>}
      </Box>
    );
  return (
    <Box
      step="x-card"
      title={pending ? 'Request for an extra property' : p.name}
      sub={<span className="xtag">Extra · invoiced separately</span>}
      onClose={onHome}
    >
      <div className="x-sum">
        {p.photo && <img src={thumb(p.photo)} alt="" />}
        <div>
          <small>{pending ? 'Asked for' : 'Booked'}</small>
          <b>{p.name}</b>
          <span>
            {fmt(stay.arrival)} → {stay.departure ? fmt(stay.departure) : 'open'}
            {nights ? ` · ${nights} night${nights === 1 ? '' : 's'}` : ''}
          </span>
          <span>{stayLabel(stay)}</span>
        </div>
      </div>
      {pending && u.role === 'manager' && (
        <>
          <div className="x-two">
            <button
              className="s-btn big x-ok"
              disabled={busy}
              onClick={() => act(() => data.confirmRequest(stay.id), `Confirmed · ${p.name} · Sheena is told`)}
            >
              Confirm
            </button>
            <button className="s-btn big ghost x-no" disabled={busy} onClick={() => setQ('decline')}>
              Decline
            </button>
          </div>
          <p className="x-small">Confirming blocks these dates. Sheena gets a message either way.</p>
        </>
      )}
      {pending && u.role === 'client' && (
        <>
          <Note tone="warn">Waiting for Donald to confirm. You’ll get a message.</Note>
          <button className="s-btn big ghost" onClick={() => setQ('cancel')}>
            Withdraw request
          </button>
        </>
      )}
      {!pending && u.role === 'client' && <Note tone="ok">Confirmed. To change it, ask Donald.</Note>}
      {!pending && u.role === 'manager' && (
        <button className="s-btn big ghost" onClick={() => setQ('cancel')}>
          Cancel booking
        </button>
      )}
      {problem && <Note tone="bad">{problem}</Note>}
      <a className="s-link" href={'#available/' + p.id} onClick={onHome}>
        Property details and availability
      </a>
    </Box>
  );
}
