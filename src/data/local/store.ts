import { S, publish, uid, iso, reconcile } from '../core';
import type { DB, Stay, Changeover, Series } from '../core';
import { seed } from './seed';
import { alertStayChange } from './alerts';
import { PROPERTIES, UNITS, ROOMS } from '../properties';
import { demoFeeds } from './feeds';
import { londonToday } from '../../dates';

/** Older demo stores get the current property details, the extra units and the demo calendar links.
 * v1 → v2: real details + extras. v2 → v3 (18 Oct 2026): Lodge merged into Monadh, Harris/Uig, Loch Roag photos,
 * calendar links become secret server settings (only Monadh linked). */
export function upgrade(x: DB): DB {
  if ((x.v ?? 1) >= 3) return x;
  const old = new Map(x.properties.map(p => [p.id, p]));
  x.properties = structuredClone(PROPERTIES).map(p => ({
    ...p,
    checkout: old.get(p.id)?.checkout ?? p.checkout,
    checkin: old.get(p.id)?.checkin ?? p.checkin,
  }));
  x.units = structuredClone(UNITS);
  x.rooms = structuredClone(ROOMS);
  const ids = new Set(x.rooms.map(r => r.id));
  x.stays = x.stays.filter(st => ids.has(st.roomId)); // e.g. requests on the old separate Lodge
  Object.assign(x, demoFeeds(londonToday()));
  x.v = 3;
  return x;
}

export const KEY = 'roomboard-demo-v2'; // bumped: changeover model changed
export function load(): DB {
  try {
    const s = localStorage.getItem(KEY);
    if (s) return upgrade(JSON.parse(s));
  } catch {
    /* ignore */
  }
  const x = seed();
  reconcile(x);
  // persist straight away so a second tab opened now shares the same records (and ids)
  try {
    localStorage.setItem(KEY, JSON.stringify(x));
  } catch {
    /* storage full or blocked: demo still works in this tab */
  }
  return x;
}
// Undo: snapshot of stays + changeovers before each stay command. Activity/alerts are kept (they happened).
export interface Snap {
  label: string;
  stays: Stay[];
  changeovers: Changeover[];
  series: Series[];
}
export const undoStack: Snap[] = [];
export function snap(label: string) {
  undoStack.push({
    label,
    stays: structuredClone(S.db.stays),
    changeovers: structuredClone(S.db.changeovers),
    series: structuredClone(S.db.series ?? []),
  });
  if (undoStack.length > 20) undoStack.shift();
}
export function undo() {
  const u = undoStack.pop();
  if (!u) return;
  const bump = new Map(S.db.stays.map(s => [s.id, s.version]));
  S.db.stays = u.stays.map(s => ({
    ...s,
    version: Math.max(s.version, bump.get(s.id) ?? 0) + 1,
    updatedBy: S.db.currentUser,
    updatedAt: iso(),
  }));
  S.db.changeovers = u.changeovers;
  S.db.series = u.series;
  log(`Undid: ${u.label}`);
  alertStayChange('Change undone', `Undid: ${u.label}`);
  commit();
}
export function commit() {
  const n = { ...S.db };
  localStorage.setItem(KEY, JSON.stringify(n));
  publish(n);
}
export function log(text: string, propertyId?: string) {
  S.db.activity = [{ id: uid(), ts: iso(), userId: S.db.currentUser, text, propertyId }, ...S.db.activity].slice(
    0,
    300,
  );
}
