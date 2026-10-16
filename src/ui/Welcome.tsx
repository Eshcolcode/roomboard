// First-login welcome with three hints per role. Dismissed once, remembered per person on this device.
import { useState } from 'react';
import { me } from '../data';
import type { Role } from '../data';

const HINTS: Record<Role, [string, string][]> = {
  client: [
    ['Rooms', 'See who is in each room tonight, who is next, and when the room will be ready.'],
    ['Find a room', 'Pick dates to see every free room, then tap one to book it.'],
    ['Undo', 'Every save or cancel can be undone from the message at the bottom of the screen.'],
  ],
  manager: [
    ['Board', 'Click an empty day to add a stay; click a bar to change or cancel it.'],
    ['Cleaning', 'Book cleans between departures and arrivals; “Guest has left” must be ticked before Ready.'],
    ['Search', 'Press / to jump to any worker or room.'],
  ],
  cleaner: [
    ['Today', 'Who is leaving and arriving, and which rooms to clean.'],
    ['Cleaning', 'Tick “Guest has left”, then Start clean and Mark ready.'],
    ['Print', 'Print the cleaning list for the day from the Cleaning page.'],
  ],
};
const key = (id: string) => 'rb-welcome:' + id;

export function Welcome() {
  const u = me();
  const [, force] = useState(0);
  let seen = true;
  try {
    seen = localStorage.getItem(key(u.id)) === '1';
  } catch {
    /* private mode: show once per load */
  }
  if (seen) return null;
  const done = () => {
    try {
      localStorage.setItem(key(u.id), '1');
    } catch {
      /* ignore */
    }
    force(x => x + 1);
  };
  return (
    <div className="scrim center" onClick={done}>
      <div
        className="dialog welcome"
        role="dialog"
        aria-modal="true"
        aria-labelledby="wl-t"
        onClick={e => e.stopPropagation()}
      >
        <h2 id="wl-t">Welcome{u.role === 'cleaner' ? '' : ', ' + u.name.split(' ')[0]}</h2>
        <p>Three things worth knowing:</p>
        <ol className="hints">
          {HINTS[u.role].map(([t, d]) => (
            <li key={t}>
              <b>{t}</b>
              <span>{d}</span>
            </li>
          ))}
        </ol>
        <div className="pa">
          <div className="sp" />
          <button className="btn" autoFocus onClick={done}>
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
