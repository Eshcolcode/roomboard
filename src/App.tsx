import { useEffect, useState } from 'react';
import { data, useDB, me } from './data';
import type { Role, Stay } from './data';
import { addDays, londonToday } from './dates';
import { useWide } from './ui/hooks';
import { Icon } from './ui/icons';
import type { Tab } from './ui/icons';
import { Overlays, confirmDialog } from './ui/overlays';
import { Board } from './ui/Board';
import { StayPanel } from './ui/StayPanel';
import type { PanelInit } from './ui/StayPanel';
import { Rooms } from './ui/Rooms';
import { TodayList } from './ui/Today';
import { Changeovers } from './ui/Changeovers';
import { Workers } from './ui/Workers';
import { FreeRooms } from './ui/FreeRooms';
import { Available } from './ui/Available';
import { ActivityView } from './ui/Activity';
import { Search } from './ui/Search';
import { Welcome } from './ui/Welcome';
import { PrintView } from './ui/Print';
import { Login } from './ui/Login';

const LABEL: Record<Tab, string> = {
  board: 'Board',
  rooms: 'Rooms',
  free: 'Find a room',
  today: 'Today',
  changeovers: 'Cleaning',
  workers: 'Workers',
  available: 'More rooms',
  activity: 'Activity',
  more: 'More',
};
const DESKTOP: Record<Role, Tab[]> = {
  manager: ['board', 'free', 'today', 'changeovers', 'workers', 'available', 'activity'],
  client: ['board', 'rooms', 'free', 'today', 'workers', 'available', 'activity'],
  cleaner: ['today', 'changeovers'],
};
const PHONE: Record<Role, Tab[]> = {
  manager: ['rooms', 'today', 'changeovers', 'free', 'more'],
  client: ['rooms', 'free', 'today', 'workers', 'more'],
  cleaner: ['today', 'changeovers'],
};
const PHONE_MORE: Record<Role, Tab[]> = {
  manager: ['workers', 'available', 'activity'],
  client: ['available', 'activity'],
  cleaner: [],
};

export default function App() {
  const db = useDB();
  const wide = useWide();
  if (db.authRequired) return <Login />;
  if (!db.users.length) return <div className="loading">Loading…</div>;
  return <Shell wide={wide} />;
}

const readHash = () => location.hash.slice(1);

function Shell({ wide }: { wide: boolean }) {
  const db = useDB();
  const u = me();
  const nav = (wide ? DESKTOP : PHONE)[u.role];
  const allowed: Tab[] = [...nav, ...(wide ? [] : PHONE_MORE[u.role])].filter(t => t !== 'more');
  const home: Tab = wide ? nav[0] : u.role === 'cleaner' ? 'today' : 'rooms';
  const [hash, setHash] = useState(readHash);
  const [panel, setPanel] = useState<PanelInit | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [demoOpen, setDemoOpen] = useState(false);

  useEffect(() => {
    const h = () => setHash(readHash());
    addEventListener('hashchange', h);
    return () => removeEventListener('hashchange', h);
  }, []);
  // A role switch closes anything that belonged to the previous person.
  useEffect(() => {
    setPanel(null);
    setMoreOpen(false);
    setDemoOpen(false);
  }, [u.id]);

  const print = hash.startsWith('print-') ? (hash.slice(6) as 'today' | 'cleaning') : null;
  const asked = (hash === 'board' && !wide ? 'rooms' : hash) as Tab;
  const cur: Tab = allowed.includes(asked) ? asked : home;
  const go = (t: Tab) => {
    setMoreOpen(false);
    location.hash = t;
    setHash(t);
  };
  useEffect(() => {
    if (!print && readHash() !== cur) history.replaceState(null, '', '#' + cur);
  }, [cur, print]);

  if (print)
    return (
      <>
        <PrintView kind={print} onBack={() => history.back()} />
        <Overlays />
      </>
    );

  const open = (p: PanelInit) => setPanel(p);
  const coCount = db.changeovers.filter(
    c => c.status !== 'ready' && !c.cancelled && (c.readyBy ?? c.afterDate) <= addDays(londonToday(), 7),
  ).length;
  const canEdit = u.role !== 'cleaner';

  return (
    <div className={'app role-' + u.role}>
      <header className="top">
        <div className="brand">
          <span className="mark">LR</span>
          <div>
            <b>Roomboard</b>
            <small>Loch Roag · Eshcol</small>
          </div>
        </div>
        {wide && (
          <nav aria-label="Main">
            {nav.map(t => (
              <button
                key={t}
                className={'tab' + (cur === t ? ' on' : '')}
                aria-current={cur === t ? 'page' : undefined}
                title={LABEL[t]}
                onClick={() => go(t)}
              >
                <Icon name={t} />
                <span className="tlbl">{LABEL[t]}</span>
                {t === 'changeovers' && u.role !== 'client' && coCount > 0 && (
                  <em aria-label={`${coCount} due in 7 days`}>{coCount}</em>
                )}
              </button>
            ))}
          </nav>
        )}
        <div className="sp" />
        {canEdit && <Search onOpen={open} />}
        {data.mode === 'demo' ? (
          <div className="demo-wrap">
            <button className="live demo-pill" aria-expanded={demoOpen} onClick={() => setDemoOpen(!demoOpen)}>
              ● Demo
            </button>
            {demoOpen && (
              <div className="pop" role="dialog" aria-label="About demo mode">
                <p>Demo mode. Data is kept in this browser only and no messages are really sent.</p>
                {u.role === 'manager' && (
                  <button
                    className="btn sm reset"
                    onClick={async () => {
                      setDemoOpen(false);
                      if (
                        await confirmDialog({
                          title: 'Reset demo data?',
                          body: 'Everything goes back to the starting example. This cannot be undone.',
                          ok: 'Reset',
                          danger: true,
                        })
                      )
                        data.reset();
                    }}
                  >
                    Reset demo data
                  </button>
                )}
              </div>
            )}
          </div>
        ) : (
          <span className="live" title="Connected">
            ● Live
          </span>
        )}
        {data.mode === 'demo' ? (
          <select
            className="who"
            aria-label="Demo: switch person"
            value={u.id}
            onChange={e => data.setUser(e.target.value)}
          >
            {db.users.map(x => (
              <option key={x.id} value={x.id}>
                {x.role === 'cleaner' && u.role === 'client'
                  ? 'Housekeeping view'
                  : `${x.name.split(' ')[0]} · ${x.role === 'client' ? 'RJ McLeod' : x.role === 'manager' ? 'Provider' : 'Cleaner'}`}
              </option>
            ))}
          </select>
        ) : (
          <span className="who">{u.name}</span>
        )}
      </header>

      <main>
        {cur === 'board' && <Board onOpen={open} />}
        {cur === 'rooms' && <Rooms onOpen={open} />}
        {cur === 'free' && <FreeRooms onOpen={open} />}
        {cur === 'today' && <TodayList onOpen={open} />}
        {cur === 'changeovers' && <Changeovers />}
        {cur === 'workers' && <Workers onOpen={open} />}
        {cur === 'available' && <Available />}
        {cur === 'activity' && <ActivityView />}
      </main>

      {!wide && canEdit && (cur === 'rooms' || cur === 'today') && (
        <div className="fab">
          <button className="btn ghost" onClick={() => open({ date: londonToday(), hold: true })}>
            Hold
          </button>
          <button className="btn" onClick={() => open({ date: londonToday() })}>
            + Add stay
          </button>
        </div>
      )}

      {!wide && (
        <nav className="bottom" aria-label="Main">
          {nav.map(t => (
            <button
              key={t}
              className={(t === 'more' ? PHONE_MORE[u.role].includes(cur) : cur === t) ? 'on' : ''}
              aria-current={cur === t ? 'page' : undefined}
              onClick={() => (t === 'more' ? setMoreOpen(!moreOpen) : go(t))}
            >
              <Icon name={t} />
              <span>{LABEL[t]}</span>
            </button>
          ))}
        </nav>
      )}
      {moreOpen && (
        <div className="scrim" onClick={() => setMoreOpen(false)}>
          <div className="sheet" role="dialog" aria-label="More" onClick={e => e.stopPropagation()}>
            {PHONE_MORE[u.role].map(t => (
              <button key={t} className="li click" onClick={() => go(t)}>
                <Icon name={t} />
                <b>{LABEL[t]}</b>
              </button>
            ))}
          </div>
        </div>
      )}

      {panel && (
        <StayPanel
          key={JSON.stringify(panel).slice(0, 80) + (panel.stay?.id ?? '')}
          init={panel}
          onClose={() => setPanel(null)}
        />
      )}
      <Welcome />
      <Overlays />
    </div>
  );
}

export type { Stay };
