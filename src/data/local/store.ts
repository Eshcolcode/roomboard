import { S, publish, uid, iso, reconcile, DEFAULT_SETTINGS } from '../core';
import type { DB, Stay, Changeover, Series, Activity, ActKind } from '../core';
import { seed } from './seed';
import { notifyStays } from './alerts';
import { PROPERTIES, UNITS, ROOMS } from '../properties';
import { demoFeeds } from './feeds';
import { londonToday } from '../../dates';

/** Older demo stores get the current property details, the extra units and the demo calendar links.
 * v1 → v2: real details + extras. v2 → v3 (18 Oct 2026): Lodge merged into Monadh, Harris/Uig, Loch Roag photos,
 * calendar links become secret server settings (only Monadh linked). */
export function upgrade(x: DB): DB {
  if ((x.v ?? 1) >= 6) return x;
  if ((x.v ?? 1) === 5) return toV6(x);
  if ((x.v ?? 1) === 4) return toV6(toV5(x));
  if ((x.v ?? 1) === 3) return toV6(toV5(toV4(x)));
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
  return toV6(toV5(toV4(x)));
}
/** v3 → v4 (18 Oct 2026): no more requests (extras are booked straight away), who booked each stay, Donald's
 * indicative rate, property order Eshcol, Loch Roag, Harris, Uig, Monadh, Abhainn Cottage, bedroom counts. */
function toV4(x: DB): DB {
  const old = new Map(x.properties.map(p => [p.id, p]));
  x.properties = structuredClone(PROPERTIES).map(p => ({
    ...p,
    checkout: old.get(p.id)?.checkout ?? p.checkout,
    checkin: old.get(p.id)?.checkin ?? p.checkin,
  }));
  x.units = structuredClone(UNITS);
  x.rooms = structuredClone(ROOMS);
  const manager = x.users.find(u => u.role === 'manager')?.id ?? null;
  const client = x.users.find(u => u.role === 'client')?.id ?? null;
  x.stays = x.stays.map(st => {
    const { request, ...rest } = st as Stay & { request?: string | null };
    // a waiting request was Sheena's; anything else already there counts as Donald's
    return { ...rest, bookedBy: rest.bookedBy ?? (request === 'pending' ? client : manager) };
  });
  x.settings = { ...DEFAULT_SETTINGS, ...(x.settings ?? {}) };
  x.v = 4;
  return x;
}
/** v4 → v5 (18 Oct 2026): Abhainn Cottage charged as 2 rooms (fresh property details), rate history. */
function toV5(x: DB): DB {
  const old = new Map(x.properties.map(p => [p.id, p]));
  x.properties = structuredClone(PROPERTIES).map(p => ({
    ...p,
    checkout: old.get(p.id)?.checkout ?? p.checkout,
    checkin: old.get(p.id)?.checkin ?? p.checkin,
  }));
  x.rateHistory = x.rateHistory ?? [];
  x.v = 5;
  return x;
}

/** v5 → v6 (19 Oct 2026): activity entries get a kind (what RJ McLeod may see), in-app alerts. Older entries are
 * sorted by their wording (anything about cleaning, rates or calendars is kept from RJ McLeod). */
export function toV6(x: DB): DB {
  x.activity = x.activity.map(a => (a.kind ? a : { ...a, kind: guessKind(a.text) }));
  x.notices = x.notices ?? [];
  x.v = 6;
  return x;
}
export function guessKind(t: string): ActKind {
  if (/rate|£/i.test(t)) return 'rate';
  if (/calendar|feed|booking site|ical|supercontrol/i.test(t)) return 'ical';
  if (/clean|changeover|guest has left|same worker continues/i.test(t)) return 'cleaning';
  if (/default times/i.test(t)) return 'settings';
  if (/^Enquiry/.test(t)) return 'enquiry';
  if (/worker/i.test(t)) return 'worker';
  if (/^Crew/.test(t)) return 'rota';
  return 'stay';
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
  const before = structuredClone(S.db.stays);
  const bump = new Map(S.db.stays.map(s => [s.id, s.version]));
  S.db.stays = u.stays.map(s => ({
    ...s,
    version: Math.max(s.version, bump.get(s.id) ?? 0) + 1,
    updatedBy: S.db.currentUser,
    updatedAt: iso(),
  }));
  S.db.changeovers = u.changeovers;
  S.db.series = u.series;
  const a = log(`Undid: ${u.label}`);
  notifyStays(before, a, 'Change undone');
  commit();
}
export function commit() {
  const n = { ...S.db };
  localStorage.setItem(KEY, JSON.stringify(n));
  publish(n);
}
export function log(text: string, propertyId?: string, managerOnly = false, kind: ActKind = 'stay'): Activity {
  const a: Activity = {
    id: uid(),
    ts: iso(),
    userId: S.db.currentUser,
    text,
    propertyId,
    kind,
    ...(managerOnly ? { managerOnly } : {}),
  };
  S.db.activity = [a, ...S.db.activity].slice(0, 300);
  return a;
}
