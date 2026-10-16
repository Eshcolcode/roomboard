import { useEffect, useMemo, useState } from 'react';
import { data, useDB, me, roomOf, propOf, workerOf, stayLabel, roomLabel, depText, digest, validate, ConflictError, getDB } from './data';
import type { Stay, StayInput, DepStatus, Changeover, CoStatus, Role } from './data';
import { addDays, diffDays, fmt, londonToday } from './dates';

type Tab = 'board' | 'today' | 'workers' | 'changeovers' | 'available' | 'activity';
const TABS: { id: Tab; label: string; roles: Role[] }[] = [
  { id: 'board', label: 'Board', roles: ['client', 'manager'] },
  { id: 'today', label: 'Today', roles: ['client', 'manager', 'cleaner'] },
  { id: 'workers', label: 'Workers', roles: ['client', 'manager'] },
  { id: 'changeovers', label: 'Changeovers', roles: ['client', 'manager', 'cleaner'] },
  { id: 'available', label: 'Available elsewhere', roles: ['client', 'manager'] },
  { id: 'activity', label: 'Activity', roles: ['client', 'manager'] },
];
const useWide = () => { const [w, setW] = useState(window.innerWidth); useEffect(() => { const f = () => setW(window.innerWidth); addEventListener('resize', f); return () => removeEventListener('resize', f); }, []); return w >= 820; };
const BrushIcon = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M14 4l6 6M4 20c3 0 5-1 6-3l7-7-4-4-7 7c-2 1-3 3-2 7z" /></svg>;

export default function App() {
  const db = useDB(); const wide = useWide();
  if (db.authRequired) return <Login />;
  if (!db.users.length) return <div className="loading">Loading…</div>;
  return <Shell wide={wide} />;
}
function Shell({ wide }: { wide: boolean }) {
  const db = useDB(); const u = me();
  const allowed = TABS.filter(t => t.roles.includes(u.role));
  const [tab, setTab] = useState<Tab>(() => (location.hash.slice(1) as Tab) || 'board');
  const cur = allowed.some(t => t.id === tab) ? tab : allowed[0].id;
  useEffect(() => { location.hash = cur; }, [cur]);
  const [panel, setPanel] = useState<null | { stay?: Stay; roomId?: string; date?: string; workerId?: string }>(null);
  useEffect(() => { const h = () => setTab(location.hash.slice(1) as Tab); addEventListener('hashchange', h); return () => removeEventListener('hashchange', h); }, []);
  const pendingAlerts = db.alerts.filter(a => a.status === 'queued').length;
  return (
    <div className={'app role-' + u.role}>
      <header className="top">
        <div className="brand"><span className="mark">LR</span><div><b>Roomboard</b><small>Loch Roag · Eshcol Worker Accommodation</small></div></div>
        {wide && <nav>{allowed.map(t => <a key={t.id} className={cur === t.id ? 'on' : ''} onClick={() => setTab(t.id)}>{t.label}{t.id === 'changeovers' && <em>{db.changeovers.filter(c => c.status !== 'ready').length}</em>}</a>)}</nav>}
        <div className="sp" />
        <span className="live" title="Alerts queued">● Live{pendingAlerts ? ` · ${pendingAlerts} sending` : ''}</span>
        {data.mode === 'demo' ? <select className="who" value={u.id} onChange={e => data.setUser(e.target.value)} title="Demo: switch role">
          {db.users.map(x => <option key={x.id} value={x.id}>{x.name} · {x.role === 'client' ? 'Client coordinator' : x.role === 'manager' ? 'Provider manager' : 'Cleaner'}</option>)}
        </select> : <span className="who">{u.name}</span>}
      </header>
      {data.mode === 'demo' && <div className="demo">Demo mode · data is stored in this browser only · <a onClick={() => { if (confirm('Reset all demo data?')) data.reset(); }}>Reset demo</a></div>}
      <main>
        {cur === 'board' && (wide ? <Board onOpen={setPanel} /> : <TodayList upcoming onOpen={setPanel} />)}
        {cur === 'today' && <TodayList onOpen={setPanel} />}
        {cur === 'workers' && <Workers onBook={w => setPanel({ date: londonToday(), workerId: w })} />}
        {cur === 'changeovers' && <Changeovers />}
        {cur === 'available' && <Available />}
        {cur === 'activity' && <ActivityView />}
      </main>
      {!wide && <nav className="bottom">{allowed.map(t => <a key={t.id} className={cur === t.id ? 'on' : ''} onClick={() => setTab(t.id)}>{t.label.split(' ')[0]}</a>)}</nav>}
      {panel && <StayPanel init={panel} onClose={() => setPanel(null)} />}
    </div>
  );
}

// ---------------- Board (tape chart) ----------------
function Board({ onOpen }: { onOpen: (p: { stay?: Stay; roomId?: string; date?: string }) => void }) {
  const db = useDB(); const T = londonToday();
  const [start, setStart] = useState(addDays(T, -3)); const [days, setDays] = useState(21); const [filter, setFilter] = useState('all');
  const W = days > 21 ? 38 : 56; const end = addDays(start, days);
  const dates = Array.from({ length: days }, (_, i) => addDays(start, i));
  const props = db.properties.filter(p => p.contracted && (filter === 'all' || p.id === filter));
  const vis = db.stays.filter(s => propOf(roomOf(s.roomId).propertyId).contracted);
  const inHouse = vis.filter(s => s.arrival <= T && (s.departure ?? '9') > T).length;
  const totalRooms = db.rooms.filter(r => propOf(r.propertyId).contracted).length;
  const x = (d: string) => Math.max(0, Math.min(days, diffDays(start, d))) * W;
  const kpi = [
    ['In house tonight', `${inHouse}/${totalRooms}`, 'across contracted rooms'],
    ['Departing today', vis.filter(s => s.departure === T && s.depStatus !== 'tbc').length, vis.filter(s => s.departure === T && s.depStatus === 'planned').length + ' planned, not confirmed'],
    ['Arriving (7 days)', vis.filter(s => s.arrival >= T && s.arrival < addDays(T, 7)).length, 'incl. holds'],
    ['Holds · name to follow', vis.filter(s => !s.workerId && (s.departure ?? '9') > T).length, 'name them when known'],
    ['Changeovers open', db.changeovers.filter(c => c.status !== 'ready').length, db.changeovers.filter(c => c.status === 'needs').length + ' need scheduling'],
  ];
  return (<div className="page">
    <div className="ph"><div><h1>Occupancy board</h1><p>{fmt(T, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} · Europe/London · arrival day counts as a night, departure day does not</p></div><div className="sp" />
      <select value={filter} onChange={e => setFilter(e.target.value)}><option value="all">All contracted properties</option>{db.properties.filter(p => p.contracted).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
      <div className="seg"><button onClick={() => setStart(addDays(start, -7))}>‹</button><button onClick={() => setStart(addDays(T, -3))}>Today</button><button onClick={() => setStart(addDays(start, 7))}>›</button></div>
      <div className="seg"><button className={days === 21 ? 'on' : ''} onClick={() => setDays(21)}>3 wks</button><button className={days === 42 ? 'on' : ''} onClick={() => setDays(42)}>6 wks</button></div>
      <button className="btn ghost" onClick={() => onOpen({ date: T, stay: { holdLabel: 'Name to follow' } as Stay })}>Hold room</button>
      <button className="btn" onClick={() => onOpen({ date: T })}>+ Add stay</button></div>
    <div className="kpis">{kpi.map(([a, b, c]) => <div className="k" key={a as string}><span>{a}</span><b>{b}</b><small>{c}</small></div>)}</div>
    <div className="board"><div className="scroll"><div style={{ width: 230 + days * W }}>
      <div className="bh"><div className="corner">Property / room</div>{dates.map(d => { const wd = new Date(d + 'T12:00Z').getUTCDay(); return <div key={d} className={'day' + (d === T ? ' today' : '') + (wd === 0 || wd === 6 ? ' we' : '')} style={{ width: W }}><span>{fmt(d, { weekday: 'short' }).slice(0, W < 50 ? 1 : 3)}</span><b>{fmt(d, { day: 'numeric' })}</b>{fmt(d, { day: 'numeric' }) === '1' && <i>{fmt(d, { month: 'short' })}</i>}</div>; })}</div>
      {props.map(p => (<div key={p.id}>
        <div className="grp"><div className="gl">{p.photo && <img src={p.photo} alt="" />}<div><b>{p.name}</b><span>{db.rooms.filter(r => r.propertyId === p.id).length} rooms · {vis.filter(s => roomOf(s.roomId).propertyId === p.id && s.arrival <= T && (s.departure ?? '9') > T).length} in house</span></div></div></div>
        {db.units.filter(un => un.propertyId === p.id).map(un => (<div key={un.id}>
          {db.units.filter(z => z.propertyId === p.id).length > 1 && <div className="unit">{un.name}</div>}
          {db.rooms.filter(r => r.unitId === un.id).map(r => {
            const rs = db.stays.filter(s => s.roomId === r.id && s.arrival < end && (s.departure ?? '9') > start);
            const cos = db.changeovers.filter(c => c.roomId === r.id && c.afterDate >= start && c.afterDate < end);
            return (<div className="row" key={r.id}>
              <div className="rl"><b>{r.name}</b><span>{r.bath === 'ensuite' ? 'Ensuite' : r.bath === 'shared' ? 'Shared shower' : 'Private shower'}</span></div>
              <div className="track" style={{ width: days * W, backgroundSize: `${W}px 100%` }} onClick={e => { const i = Math.floor((e.clientX - (e.currentTarget as HTMLElement).getBoundingClientRect().left) / W); if ((e.target as HTMLElement).classList.contains('track')) onOpen({ roomId: r.id, date: addDays(start, i) }); }}>
                {diffDays(start, T) >= 0 && diffDays(start, T) < days && <div className="todayline" style={{ left: diffDays(start, T) * W + W / 2 }} />}
                {rs.map(s => {
                  const l = x(s.arrival) + (s.arrival >= start ? W / 2 : 0); const rr = s.departure && s.departure < end ? x(s.departure) + W / 2 : days * W;
                  const open = !s.departure; const hold = !s.workerId; const dep = s.departure === T;
                  const nights = diffDays(s.arrival, T < s.arrival ? s.arrival : T);
                  return <div key={s.id} className={'bar' + (hold ? ' hold' : '') + (dep ? ' dep' : '') + (open ? ' open' : '') + (s.arrival < start ? ' cutl' : '')} style={{ left: l + 2, width: Math.max(rr - l - 4, 14) }} onClick={() => onOpen({ stay: s })} title={`${stayLabel(s)} · ${fmt(s.arrival)} → ${depText(s)}`}>
                    <b>{hold ? 'Hold · ' : ''}{stayLabel(s)}</b>
                    <span>{hold ? (s.arrival > T ? 'from ' + fmt(s.arrival) : '') : s.arrival > T ? 'Arrives ' + fmt(s.arrival) : dep ? (s.depStatus === 'confirmed' ? 'Departs today ✓' : 'Planned departure today') : `Night ${nights + 1}`}{open ? ' · ' + depText(s) : ''}</span>
                    {s.away && <i className="away" style={{ left: Math.max(0, x(s.away.from) - l + W / 2), width: (diffDays(s.away.from, s.away.to)) * W }}>Away · room kept</i>}
                  </div>;
                })}
                {cos.map(c => <div key={c.id} className={'co co-' + c.status} style={{ left: x(c.afterDate) + W / 2 - 11 }} title={`Changeover · ${c.status}${c.readyBy ? ' · ready by ' + fmt(c.readyBy) : ''}`}><BrushIcon /></div>)}
              </div></div>);
          })}</div>))}
      </div>))}
    </div></div>
      <div className="legend"><span><i className="lg occ" />In house</span><span><i className="lg dep" />Departing today</span><span><i className="lg hold" />Hold, name to follow</span><span><i className="lg open" />Until further notice / TBC</span><span><span className="co co-scheduled mini"><BrushIcon /></span>Changeover</span><span><i className="lg away" />Away, room retained (no clean)</span><span className="tl">│ Today</span><span className="hint">Click an empty day to add a stay · click a bar to edit</span></div>
    </div>
  </div>);
}

// ---------------- Stay side panel ----------------
function StayPanel({ init, onClose }: { init: { stay?: Stay; roomId?: string; date?: string; workerId?: string }; onClose: () => void }) {
  const db = useDB(); const T = londonToday(); const existing = init.stay?.id ? init.stay : undefined;
  const wantsHold = !!init.stay && !init.stay.id;
  const [f, setF] = useState<StayInput>(() => existing ? { id: existing.id, version: existing.version, roomId: existing.roomId, workerId: existing.workerId, holdLabel: existing.holdLabel, arrival: existing.arrival, departure: existing.departure, depStatus: existing.depStatus, away: existing.away ?? null, notes: existing.notes }
    : { roomId: init.roomId ?? '', workerId: init.workerId ?? null, holdLabel: wantsHold ? 'Name to follow' : '', arrival: init.date ?? T, departure: addDays(init.date ?? T, 7), depStatus: 'planned', away: null, notes: '' });
  const [mode, setMode] = useState<'worker' | 'hold'>(existing ? (existing.workerId ? 'worker' : 'hold') : wantsHold ? 'hold' : 'worker');
  const [q, setQ] = useState(''); const [err, setErr] = useState(''); const [conflict, setConflict] = useState(''); const [newW, setNewW] = useState(false);
  const recents = [...db.workers].sort((a, b) => (b.lastUsed ?? '').localeCompare(a.lastUsed ?? '') || b.uses - a.uses).slice(0, 6);
  const found = q ? db.workers.filter(w => (w.name + ' ' + w.company).toLowerCase().includes(q.toLowerCase())).slice(0, 8) : [];
  const set = (p: Partial<StayInput>) => { setF({ ...f, ...p }); setErr(''); };
  const room = f.roomId ? roomOf(f.roomId) : null;
  const live = f.roomId ? validate({ ...f, departure: f.depStatus === 'tbc' || f.depStatus === 'ufn' ? null : f.departure, workerId: mode === 'hold' ? null : f.workerId }) : null;
  const nights = f.departure && f.depStatus !== 'tbc' && f.depStatus !== 'ufn' ? diffDays(f.arrival, f.departure) : null;
  const freeRooms = db.rooms.filter(r => propOf(r.propertyId).contracted && !validate({ ...f, roomId: r.id, departure: f.depStatus === 'tbc' || f.depStatus === 'ufn' ? null : f.departure }));
  const save = async () => {
    if (!f.roomId) return setErr('Choose a room.');
    if (mode === 'worker' && !f.workerId) return setErr('Pick a worker, or switch to "Hold – name to follow".');
    try { await data.saveStay({ ...f, workerId: mode === 'hold' ? null : f.workerId, holdLabel: mode === 'hold' ? (f.holdLabel || 'Name to follow') : '' }); onClose(); }
    catch (e) { if (e instanceof ConflictError) setConflict(e.message); else setErr((e as Error).message); }
  };
  const W = workerOf(f.workerId);
  return (<div className="scrim" onClick={onClose}><aside className="panel" onClick={e => e.stopPropagation()}>
    <div className="pt"><div><small>{existing ? (existing.workerId ? 'Edit stay' : 'Hold · name to follow') : 'Add stay'}</small><h2>{room ? roomLabel(room.id) : 'Choose a room'}</h2></div><button className="x" onClick={onClose}>×</button></div>
    {room?.photo && <img className="rp" src={room.photo} alt={room.name} />}
    {conflict && <div className="warn"><b>Someone else changed this stay.</b> {conflict}<div><button className="btn sm" onClick={onClose}>Close and reload</button></div></div>}
    <div className="seg full"><button className={mode === 'worker' ? 'on' : ''} onClick={() => setMode('worker')}>Named worker</button><button className={mode === 'hold' ? 'on' : ''} onClick={() => setMode('hold')}>Hold · name to follow</button></div>
    {mode === 'worker' ? (<div className="fs">
      <label>Worker</label>
      {W ? <div className="chosen"><div className="avt">{W.name.split(' ').map(x => x[0]).join('')}</div><div><b>{W.name}</b><small>{W.company} · {W.phone}</small>{W.notes && <small className="note">{W.notes}</small>}</div><button className="link" onClick={() => set({ workerId: null })}>Change</button></div> : <>
        <input autoFocus placeholder="Search saved workers…" value={q} onChange={e => setQ(e.target.value)} />
        <div className="chips">{(q ? found : recents).map(w => <button key={w.id} className="chip" onClick={() => { set({ workerId: w.id }); setQ(''); }}>{w.name}<small>{w.company.split(' ')[0]}</small></button>)}</div>
        {!q && <small className="muted">Recent workers · one tap to pick</small>}
        {newW ? <NewWorker onDone={id => { setNewW(false); if (id) set({ workerId: id }); }} /> : <button className="link" onClick={() => setNewW(true)}>+ New worker</button>}
      </>}
      {existing && !existing.workerId && <small className="muted">Naming this hold keeps the same booking. No new record is made.</small>}
    </div>) : (<div className="fs"><label>Hold label</label><input value={f.holdLabel} onChange={e => set({ holdLabel: e.target.value })} placeholder="Name to follow · e.g. electrician" /></div>)}
    <div className="fs"><label>Room</label><select value={f.roomId} onChange={e => set({ roomId: e.target.value })}><option value="">Select…</option>
      {db.properties.filter(p => p.contracted).map(p => <optgroup key={p.id} label={p.name}>{db.rooms.filter(r => r.propertyId === p.id).map(r => <option key={r.id} value={r.id}>{r.name} · {r.bath}{freeRooms.includes(r) ? '' : ' (busy)'}</option>)}</optgroup>)}</select>
      {!f.roomId && <small className="muted">{freeRooms.length} rooms free for these dates</small>}</div>
    <div className="two"><div className="fs"><label>Arrival (first night)</label><input type="date" value={f.arrival} onChange={e => set({ arrival: e.target.value })} /></div>
      <div className="fs"><label>Departure (leaves that day)</label><input type="date" disabled={f.depStatus === 'tbc' || f.depStatus === 'ufn'} value={f.departure ?? ''} onChange={e => set({ departure: e.target.value || null })} /></div></div>
    <div className="seg full sm">{([['planned', 'Planned'], ['confirmed', 'Confirmed'], ['tbc', 'Departure TBC'], ['ufn', 'Until further notice']] as [DepStatus, string][]).map(([k, l]) => <button key={k} className={f.depStatus === k ? 'on' : ''} onClick={() => set({ depStatus: k, departure: (k === 'tbc' || k === 'ufn') ? null : (f.departure ?? addDays(f.arrival, 7)) })}>{l}</button>)}</div>
    <small className="muted">{nights !== null ? `${nights} night${nights === 1 ? '' : 's'} · ${fmt(f.arrival)} → ${fmt(f.departure!)}` : 'Open-ended. The room stays allocated and no clean is scheduled.'}{f.depStatus === 'planned' && nights !== null ? ' · A planned departure is not yet confirmed.' : ''}</small>
    {mode === 'worker' && existing && <details className="fs" open={!!f.away}><summary>Away, room retained</summary>
      <div className="two"><input type="date" value={f.away?.from ?? ''} onChange={e => set({ away: { from: e.target.value, to: f.away?.to ?? addDays(e.target.value, 3) } })} /><input type="date" value={f.away?.to ?? ''} onChange={e => set({ away: f.away ? { ...f.away, to: e.target.value } : null })} /></div>
      <small className="muted">The room is kept and their things stay. No changeover is triggered. {f.away && <button className="link" onClick={() => set({ away: null })}>Clear</button>}</small></details>}
    <div className="fs"><label>Notes for the team</label><textarea rows={2} value={f.notes} onChange={e => set({ notes: e.target.value })} placeholder="e.g. late arrival after 10pm ferry" /></div>
    {(err || (live && f.roomId)) && <div className="err">{err || live}</div>}
    <div className="pa">
      {existing && <button className="btn danger ghost" onClick={() => { if (confirm('Cancel this stay?')) { data.deleteStay(existing.id).then(onClose); } }}>Cancel stay</button>}
      {existing && existing.departure && existing.depStatus === 'planned' && <button className="btn ghost" onClick={() => { data.confirmDeparture(existing.id).then(onClose); }}>Confirm departure</button>}
      <div className="sp" /><button className="btn ghost" onClick={onClose}>Close</button><button className="btn" disabled={!!live} onClick={save}>{existing ? 'Save changes' : mode === 'hold' ? 'Hold room' : 'Add stay'}</button>
    </div>
    {existing && <small className="muted foot">v{existing.version} · last changed by {getDB().users.find(x => x.id === existing.updatedBy)?.name} {new Date(existing.updatedAt).toLocaleString('en-GB', { timeZone: 'Europe/London', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</small>}
  </aside></div>);
}
function NewWorker({ onDone }: { onDone: (id?: string) => void }) {
  const [n, setN] = useState(''); const [c, setC] = useState(''); const [p, setP] = useState('');
  return <div className="nw"><input placeholder="Full name" value={n} onChange={e => setN(e.target.value)} /><input placeholder="Company / crew" value={c} onChange={e => setC(e.target.value)} /><input placeholder="Mobile" value={p} onChange={e => setP(e.target.value)} />
    <div><button className="btn sm" disabled={!n} onClick={async () => onDone((await data.upsertWorker({ name: n, company: c, phone: p })).id)}>Save worker</button> <button className="link" onClick={() => onDone()}>Cancel</button></div></div>;
}

// ---------------- Today / Upcoming ----------------
function TodayList({ onOpen, upcoming }: { onOpen: (p: { stay?: Stay }) => void; upcoming?: boolean }) {
  const db = useDB(); const u = me(); const T = londonToday(); const [view, setView] = useState<'today' | 'upcoming'>(upcoming ? 'upcoming' : 'today');
  const vis = db.stays.filter(s => propOf(roomOf(s.roomId).propertyId).contracted);
  const nm = (s: Stay) => u.role === 'cleaner' ? stayLabel(s).split(' ')[0] : stayLabel(s);
  const canEdit = u.role !== 'cleaner';
  const Item = ({ s, tag, sub }: { s: Stay; tag: string; sub: string }) => <div className={'li' + (canEdit ? ' click' : '')} onClick={() => canEdit && onOpen({ stay: s })}><span className={'tag t-' + tag.split(' ')[0].toLowerCase()}>{tag}</span><div><b>{roomLabel(s.roomId)} · {nm(s)}</b><small>{sub}</small></div></div>;
  const day = (d: string) => {
    const dep = vis.filter(s => s.departure === d && s.depStatus !== 'tbc' && s.depStatus !== 'ufn');
    const arr = vis.filter(s => s.arrival === d);
    const stay = vis.filter(s => s.arrival < d && (s.departure ?? '9') > d);
    const cos = db.changeovers.filter(c => c.scheduledFor === d || (c.afterDate === d && !c.scheduledFor));
    return { dep, arr, stay, cos };
  };
  const t = day(T);
  return (<div className="page narrow">
    <div className="ph"><div><h1>{view === 'today' ? 'Today' : 'Upcoming'}</h1><p>{fmt(T, { weekday: 'long', day: 'numeric', month: 'long' })}</p></div><div className="sp" /><div className="seg"><button className={view === 'today' ? 'on' : ''} onClick={() => setView('today')}>Today</button><button className={view === 'upcoming' ? 'on' : ''} onClick={() => setView('upcoming')}>Upcoming</button></div></div>
    {view === 'today' ? <>
      <div className="stats"><div><b>{t.dep.length}</b>Departures</div><div><b>{t.arr.length}</b>Arrivals</div><div><b>{t.stay.length}</b>Stayovers</div><div><b>{t.cos.length}</b>Changeovers</div></div>
      <section className="card"><h3>Departures</h3>{t.dep.length ? t.dep.map(s => <Item key={s.id} s={s} tag={s.depStatus === 'confirmed' ? 'Departs' : 'Planned'} sub={s.depStatus === 'confirmed' ? 'Departure confirmed' : 'Planned only. Confirm with the client before stripping the room.'} />) : <p className="muted">No departures today</p>}</section>
      <section className="card"><h3>Changeovers</h3>{t.cos.length ? t.cos.map(c => <CoRow key={c.id} c={c} />) : <p className="muted">No changeovers today</p>}</section>
      <section className="card"><h3>Arrivals</h3>{t.arr.length ? t.arr.map(s => <Item key={s.id} s={s} tag={s.workerId ? 'Arrives' : 'Hold'} sub={depText(s)} />) : <p className="muted">No arrivals today</p>}</section>
      <section className="card"><h3>Stayovers</h3>{t.stay.map(s => <Item key={s.id} s={s} tag={s.away && s.away.from <= T && s.away.to > T ? 'Away' : 'In'} sub={`Night ${diffDays(s.arrival, T) + 1} · ${depText(s)}`} />)}</section>
    </> : Array.from({ length: 10 }, (_, i) => addDays(T, i + 1)).map(d => { const x = day(d); if (!x.dep.length && !x.arr.length && !x.cos.length) return null; return <section className="card" key={d}><h3>{fmt(d, { weekday: 'long', day: 'numeric', month: 'short' })}</h3>
      {x.dep.map(s => <Item key={s.id} s={s} tag={s.depStatus === 'confirmed' ? 'Departs' : 'Planned'} sub="Departure" />)}
      {x.cos.map(c => <CoRow key={c.id} c={c} />)}
      {x.arr.map(s => <Item key={s.id} s={s} tag={s.workerId ? 'Arrives' : 'Hold'} sub={s.workerId ? depText(s) : 'Name to follow'} />)}</section>; })}
  </div>);
}

// ---------------- Changeovers ----------------
const CO_COLS: [CoStatus, string][] = [['needs', 'Needs scheduling'], ['scheduled', 'Scheduled'], ['in_progress', 'In progress'], ['ready', 'Ready']];
function CoRow({ c }: { c: Changeover }) {
  return <div className="li"><span className={'co co-' + c.status} style={{ position: 'static' }}><BrushIcon /></span><div><b>{roomLabel(c.roomId)} changeover</b><small>{c.scheduledFor ? 'Scheduled ' + fmt(c.scheduledFor) : 'After departure ' + fmt(c.afterDate)} · {c.readyBy ? 'ready by ' + fmt(c.readyBy) : 'no arrival booked'}</small></div></div>;
}
function Changeovers() {
  const db = useDB(); const u = me(); const T = londonToday();
  const cleaners = db.users.filter(x => x.role === 'cleaner');
  const next: Record<CoStatus, CoStatus | null> = { needs: 'scheduled', scheduled: 'in_progress', in_progress: 'ready', ready: null };
  return (<div className="page"><div className="ph"><div><h1>Changeovers</h1><p>Room readiness is tracked separately from stays. The client can see every status. Extending a stay or bringing an arrival forward resets Ready.</p></div></div>
    <div className="kanban">{CO_COLS.map(([k, l]) => { const list = db.changeovers.filter(c => c.status === k).sort((a, b) => (a.readyBy ?? '9').localeCompare(b.readyBy ?? '9'));
      return <div className="col" key={k}><h3><span className={'co co-' + k} style={{ position: 'static' }}><BrushIcon /></span>{l}<em>{list.length}</em></h3>
        {list.map(c => { const slack = c.readyBy ? diffDays(T, c.readyBy) : null; return <div className={'cc' + (slack !== null && slack <= 1 && k !== 'ready' ? ' urgent' : '')} key={c.id}>
          <b>{roomLabel(c.roomId)}</b>
          <small>Vacated {fmt(c.afterDate)} · {c.readyBy ? <>Ready by <strong>{fmt(c.readyBy)}</strong></> : 'No next arrival'}</small>
          {c.toStayId && <small>Next: {(() => { const s = db.stays.find(x => x.id === c.toStayId); return s ? (u.role === 'cleaner' ? (s.workerId ? 'named guest' : 'hold') : stayLabel(s)) : ''; })()}</small>}
          {c.invalidated && <div className="inv">⚠ {c.invalidated}</div>}
          {c.note && <small className="note">{c.note}</small>}
          {u.role !== 'client' && <div className="ca">
            {k === 'needs' && u.role === 'manager' ? <><input type="date" defaultValue={addDays(c.afterDate, 0)} id={'d' + c.id} /><select id={'c' + c.id}>{cleaners.map(x => <option key={x.id} value={x.id}>{x.name.split(' ')[0]}</option>)}</select>
              <button className="btn sm" onClick={() => data.updateChangeover(c.id, { status: 'scheduled', scheduledFor: (document.getElementById('d' + c.id) as HTMLInputElement).value, cleanerId: (document.getElementById('c' + c.id) as HTMLSelectElement).value })}>Schedule</button></>
              : next[k] && k !== 'needs' && <button className="btn sm" onClick={() => data.updateChangeover(c.id, { status: next[k]! })}>{k === 'scheduled' ? 'Start clean' : 'Mark Ready ✓'}</button>}
            {c.cleanerId && <small className="muted">{db.users.find(x => x.id === c.cleanerId)?.name}</small>}
          </div>}
        </div>; })}
        {!list.length && <p className="muted empty">Nothing here</p>}</div>; })}</div></div>);
}

// ---------------- Workers ----------------
function Workers({ onBook }: { onBook: (id: string) => void }) {
  const db = useDB(); const T = londonToday(); const [q, setQ] = useState(''); const [adding, setAdding] = useState(false);
  const list = db.workers.filter(w => (w.name + w.company).toLowerCase().includes(q.toLowerCase())).sort((a, b) => a.name.localeCompare(b.name));
  const recents = [...db.workers].sort((a, b) => (b.lastUsed ?? '').localeCompare(a.lastUsed ?? '')).slice(0, 8);
  const where = (id: string) => db.stays.find(s => s.workerId === id && s.arrival <= T && (s.departure ?? '9') > T);
  const nextS = (id: string) => db.stays.filter(s => s.workerId === id && s.arrival > T).sort((a, b) => a.arrival.localeCompare(b.arrival))[0];
  return (<div className="page"><div className="ph"><div><h1>Workers</h1><p>Save a worker once, then book them again with one tap.</p></div><div className="sp" /><input className="search" placeholder="Search name or company…" value={q} onChange={e => setQ(e.target.value)} /><button className="btn" onClick={() => setAdding(true)}>+ New worker</button></div>
    {adding && <div className="card"><NewWorker onDone={() => setAdding(false)} /></div>}
    <div className="recents"><small>Recent · tap to book</small>{recents.map(w => <button key={w.id} className="chip" onClick={() => onBook(w.id)}>{w.name}</button>)}</div>
    <div className="table"><div className="tr th"><span>Name</span><span>Company</span><span>Mobile</span><span>Now</span><span>Next</span><span /></div>
      {list.map(w => { const s = where(w.id); const n = nextS(w.id); return <div className="tr" key={w.id}><span><b>{w.name}</b>{w.notes && <small>{w.notes}</small>}</span><span>{w.company}</span><span>{w.phone}</span><span>{s ? <span className="pill in">{roomLabel(s.roomId)}</span> : <span className="muted">Not in house</span>}</span><span>{n ? `${roomLabel(n.roomId)} · ${fmt(n.arrival)}` : '—'}</span><span><button className="btn sm ghost" onClick={() => onBook(w.id)}>Book</button></span></div>; })}</div></div>);
}

// ---------------- Available elsewhere ----------------
function Available() {
  const db = useDB(); const T = londonToday(); const [req, setReq] = useState<string | null>(null);
  const [form, setForm] = useState({ from: addDays(T, 3), to: addDays(T, 17), longTerm: false, people: 1, note: '' }); const [sent, setSent] = useState<string | null>(null);
  const others = db.properties.filter(p => !p.contracted);
  const art: Record<string, string> = { 'p-pod1': 'pod', 'p-pod2': 'pod', 'p-lodge': 'lodge', 'p-cottage': 'cottage' };
  return (<div className="page"><div className="hero" style={{ backgroundImage: 'linear-gradient(90deg,rgba(7,24,47,.92),rgba(7,24,47,.55)),url(img/eshcol-exterior.jpg)' }}><small>Need more rooms?</small><h1>Available elsewhere on Lewis</h1><p>Self-contained pods, a lodge and a cottage from the same team. Same standards, one coordinator. Short stays or long-term.</p></div>
    {sent && <div className="ok">✓ Request sent to Donald for {sent}. You'll get a reply by email, usually the same day.</div>}
    <div className="cards">{others.map(p => <div className="ucard" key={p.id}>
      <div className={'art art-' + art[p.id]}><span>{p.beds}</span><em>Photos to follow</em></div>
      <div className="ub"><h3>{p.name}</h3><p>{p.blurb}</p><div className="feat">{p.features.map(f => <span key={f}>{f}</span>)}</div>
        <div className="avl"><span className="dot" />Available now</div>
        {req === p.id ? <div className="rq"><div className="two"><label>From<input type="date" value={form.from} onChange={e => setForm({ ...form, from: e.target.value })} /></label><label>To<input type="date" disabled={form.longTerm} value={form.to} onChange={e => setForm({ ...form, to: e.target.value })} /></label></div>
          <label className="cb"><input type="checkbox" checked={form.longTerm} onChange={e => setForm({ ...form, longTerm: e.target.checked })} /> Long-term / until further notice</label>
          <label>People<input type="number" min={1} value={form.people} onChange={e => setForm({ ...form, people: +e.target.value })} /></label>
          <textarea rows={2} placeholder="Anything we should know?" value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} />
          <div className="pa"><button className="link" onClick={() => setReq(null)}>Cancel</button><div className="sp" /><button className="btn" onClick={() => { data.addEnquiry({ propertyId: p.id, from: form.from, to: form.longTerm ? null : form.to, longTerm: form.longTerm, people: form.people, note: form.note }); setSent(p.name); setReq(null); }}>Send request</button></div></div>
          : <button className="btn full" onClick={() => setReq(p.id)}>Request</button>}
      </div></div>)}</div>
    {me().role === 'manager' && db.enquiries.length > 0 && <section className="card"><h3>Requests received</h3>{db.enquiries.map(e => <div className="li" key={e.id}><span className="tag t-new">New</span><div><b>{propOf(e.propertyId).name} · {e.people} people</b><small>From {fmt(e.from)} {e.longTerm ? '· long-term' : e.to ? '→ ' + fmt(e.to) : ''} {e.note && '· ' + e.note}</small></div></div>)}</section>}
  </div>);
}

// ---------------- Activity, digest, outbox ----------------
function ActivityView() {
  const db = useDB(); const [role, setRole] = useState<Role>('manager');
  const name = (id: string) => db.users.find(u => u.id === id)?.name ?? id;
  const grouped = useMemo(() => db.activity, [db.activity]);
  return (<div className="page"><div className="ph"><div><h1>Activity</h1><p>A full log of who changed what and when, plus the alerts that went out.</p></div></div>
    <div className="grid2"><section className="card"><h3>Activity log</h3>{grouped.map(a => <div className="act" key={a.id}><div className="avt sm">{name(a.userId).split(' ').map(x => x[0]).join('')}</div><div><b>{name(a.userId)}</b> {a.text}<small>{new Date(a.ts).toLocaleString('en-GB', { timeZone: 'Europe/London', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</small></div></div>)}</section>
      <div><section className="card"><h3>7:00 morning digest <div className="seg sm" style={{ float: 'right' }}>{(['client', 'manager', 'cleaner'] as Role[]).map(r => <button key={r} className={role === r ? 'on' : ''} onClick={() => setRole(r)}>{r}</button>)}</div></h3><pre className="digest">{digest(role)}</pre><small className="muted">Sent by email every day at 07:00 Europe/London (scheduled job in production)</small></section>
        <section className="card"><h3>Alert outbox</h3><small className="muted">Queued with automatic retry. In production, push, email (Resend) and SMS (Twilio) are sent by the dispatcher.</small>
          {db.alerts.slice(0, 14).map(a => <div className="al" key={a.id}><span className={'tag t-' + a.status}>{a.status}{a.attempts > 1 ? ` ·${a.attempts}` : ''}</span><span className="ch">{a.channel}</span><div><b>{a.subject}</b><small>{a.to}</small></div></div>)}
          {!db.alerts.length && <p className="muted">No alerts yet. Make a change on the board.</p>}</section></div></div></div>);
}

function Login() {
  const [email, setEmail] = useState(''); const [sent, setSent] = useState(false); const [err, setErr] = useState('');
  return <div className="login" style={{ backgroundImage: 'linear-gradient(rgba(7,24,47,.82),rgba(7,24,47,.92)),url(img/eshcol-exterior.jpg)' }}><div className="lc">
    <span className="mark">LR</span><h1>Roomboard</h1><p>Loch Roag · Eshcol Worker Accommodation</p>
    {sent ? <div className="ok">Check your email for a sign-in link.</div> : <>
      <input type="email" placeholder="you@company.co.uk" value={email} onChange={e => setEmail(e.target.value)} />
      <button className="btn full" onClick={() => data.signIn!(email).then(() => setSent(true), e => setErr(e.message))}>Email me a sign-in link</button>{err && <div className="err">{err}</div>}</>}
  </div></div>;
}
