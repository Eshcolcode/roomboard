// Drag to move or resize a stay bar on the desktop board. Live clash feedback comes from the same
// validate() every save uses; dropping asks for confirmation and the save can be undone.
// Keyboard / button alternative: open the stay (Enter) and change dates or room in the panel.
import { useSyncExternalStore } from 'react';
import { data, validate, roomLabel, stayLabel, depText } from '../data';
import type { Stay, StayInput } from '../data';
import { addDays, fmt } from '../dates';
import { confirmDialog, toast } from './overlays';

export interface Drag {
  stay: Stay;
  mode: 'move' | 'resize';
  days: number;
  roomId: string;
  moved: boolean;
}
let cur: Drag | null = null;
const subs = new Set<() => void>();
const set = (d: Drag | null) => {
  cur = d;
  subs.forEach(f => f());
};
export const useDrag = () =>
  useSyncExternalStore(
    f => {
      subs.add(f);
      return () => subs.delete(f);
    },
    () => cur,
  );
let justDragged = 0;
/** True right after a drag ended, so the bar's click handler does not also open the panel. */
export const wasDrag = () => Date.now() - justDragged < 300;

export function candidate(d: Drag): StayInput {
  const s = d.stay;
  const shift = (v: string) => addDays(v, d.days);
  if (d.mode === 'resize')
    return { ...s, away: s.away ?? null, departure: s.departure && addDays(s.departure, d.days) };
  return {
    ...s,
    roomId: d.roomId,
    arrival: shift(s.arrival),
    departure: s.departure && shift(s.departure),
    away: s.away ? { from: shift(s.away.from), to: shift(s.away.to) } : null,
  };
}
export const problem = (d: Drag) => validate(candidate(d));

export function startDrag(e: React.PointerEvent, s: Stay, mode: 'move' | 'resize', W: number) {
  if (e.button !== 0) return;
  e.stopPropagation();
  // no text selection / native drag-and-drop while dragging a bar
  e.preventDefault();
  getSelection()?.removeAllRanges();
  const x0 = e.clientX;
  const y0 = e.clientY;
  let d: Drag = { stay: s, mode, days: 0, roomId: s.roomId, moved: false };
  const move = (ev: PointerEvent) => {
    const days = Math.round((ev.clientX - x0) / W);
    const far = Math.abs(ev.clientX - x0) > 5 || Math.abs(ev.clientY - y0) > 5;
    if (!far && !d.moved) return;
    let roomId = d.roomId;
    if (mode === 'move') {
      const row = document.elementFromPoint(ev.clientX, ev.clientY)?.closest<HTMLElement>('.row[data-room]');
      if (row?.dataset.room) roomId = row.dataset.room;
    }
    if (mode === 'resize' && s.departure && addDays(s.departure, days) <= s.arrival) return;
    d = { ...d, days, roomId, moved: true };
    set(d);
  };
  const up = async () => {
    removeEventListener('pointermove', move);
    removeEventListener('pointerup', up);
    removeEventListener('keydown', esc);
    if (!d.moved) return set(null);
    justDragged = Date.now();
    if (d.days === 0 && d.roomId === s.roomId) return set(null);
    await drop(d);
    set(null);
  };
  const esc = (ev: KeyboardEvent) => {
    if (ev.key !== 'Escape') return;
    removeEventListener('pointermove', move);
    removeEventListener('pointerup', up);
    removeEventListener('keydown', esc);
    justDragged = Date.now();
    set(null);
  };
  addEventListener('pointermove', move);
  addEventListener('pointerup', up);
  addEventListener('keydown', esc);
}

export function describe(d: Drag) {
  const c = candidate(d);
  return `${roomLabel(c.roomId)} · ${fmt(c.arrival)} → ${c.departure ? fmt(c.departure) : depText(c as Stay)}`;
}

async function drop(d: Drag) {
  const err = problem(d);
  if (err) {
    toast(`Not moved: ${err}`);
    return;
  }
  const c = candidate(d);
  const s = d.stay;
  const title =
    d.mode === 'resize'
      ? `Change ${stayLabel(s)}'s departure to ${fmt(c.departure!)}?`
      : `Move ${stayLabel(s)} to ${describe(d)}?`;
  const ok = await confirmDialog({
    title,
    body: `Was ${roomLabel(s.roomId)} · ${fmt(s.arrival)} → ${depText(s)}. Cleans and alerts update as for any change.`,
    ok: d.mode === 'resize' ? 'Change departure' : 'Move stay',
  });
  if (!ok) return;
  try {
    await data.saveStay(c);
    toast(d.mode === 'resize' ? 'Departure changed' : 'Stay moved', { undo: true });
  } catch (e) {
    toast((e as Error).message);
  }
}
