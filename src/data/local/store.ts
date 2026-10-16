import { S, publish, uid, iso, reconcile } from '../core';
import type { DB, Stay, Changeover, Series } from '../core';
import { seed } from './seed';
import { alertStayChange } from './alerts';

export const KEY = 'roomboard-demo-v2'; // bumped: changeover model changed
export function load(): DB {
  try {
    const s = localStorage.getItem(KEY);
    if (s) return JSON.parse(s);
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
