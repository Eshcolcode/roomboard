// Store-level rules on a small hand-built snapshot (no browser needed).
import { beforeEach, describe, expect, it } from 'vitest';
import { addDays, londonToday } from '../dates';
import {
  S,
  publish,
  reconcile,
  validate,
  workerClash,
  freeRooms,
  suggestFor,
  occupancy,
  roomReadiness,
  readinessFor,
} from './core';
import type { DB, Stay } from './core';

const T = londonToday();
const d = (n: number) => addDays(T, n);
let n = 0;
const stay = (
  roomId: string,
  workerId: string | null,
  a: number,
  dep: number | null,
  extra: Partial<Stay> = {},
): Stay => ({
  id: 's' + ++n,
  roomId,
  workerId,
  holdLabel: workerId ? '' : 'Name to follow',
  arrival: d(a),
  departure: dep === null ? null : d(dep),
  depStatus: dep === null ? 'ufn' : 'planned',
  notes: '',
  version: 1,
  updatedBy: 'u1',
  updatedAt: '',
  ...extra,
});
function db(stays: Stay[]): DB {
  return {
    v: 1,
    currentUser: 'u1',
    users: [{ id: 'u1', name: 'Donald', role: 'manager', email: '', phone: '' }],
    properties: [
      {
        id: 'p',
        name: 'Loch Roag Guest House',
        short: 'Loch Roag',
        contracted: true,
        address: '',
        blurb: '',
        features: [],
      },
      { id: 'x', name: 'Pod 1', short: 'Pod 1', contracted: false, address: '', blurb: '', features: [] },
    ],
    units: [{ id: 'u', propertyId: 'p', name: 'All' }],
    rooms: [1, 2, 3].map(i => ({
      id: 'r' + i,
      propertyId: 'p',
      unitId: 'u',
      name: 'Room ' + i,
      bath: 'ensuite' as const,
    })),
    workers: [
      { id: 'w1', name: 'Iain Smith', company: '', phone: '', notes: '', uses: 0 },
      { id: 'w2', name: 'Neil Mackenzie', company: '', phone: '', notes: '', uses: 0 },
    ],
    stays,
    changeovers: [],
    activity: [],
    alerts: [],
    enquiries: [],
  };
}
const load = (stays: Stay[]) => {
  const x = db(stays);
  publish(x);
  return x;
};

describe('reconcile', () => {
  beforeEach(() => {
    n = 0;
  });
  it('creates one changeover per dated departure, none for open-ended', () => {
    const x = load([stay('r1', 'w1', -3, 2), stay('r2', 'w2', -3, null)]);
    reconcile(x);
    expect(x.changeovers.map(c => c.roomId)).toEqual(['r1']);
  });
  it('same worker back-to-back continues: no clean', () => {
    const x = load([stay('r1', 'w1', -3, 2), stay('r1', 'w1', 2, 9)]);
    reconcile(x);
    expect(x.changeovers.map(c => c.afterDate)).toEqual([d(9)]);
  });
  it('different worker same day is a zero-day changeover', () => {
    const x = load([stay('r1', 'w1', -3, 2), stay('r1', 'w2', 2, 9)]);
    reconcile(x);
    expect(x.changeovers.find(c => c.afterDate === d(2))?.zeroDay).toBe(true);
  });
  it('a booked clean is invalidated (same id) when dates change, never deleted', () => {
    const a = stay('r1', 'w1', -3, 2);
    const b = stay('r1', 'w2', 5, 9);
    const x = load([a, b]);
    reconcile(x);
    const co = x.changeovers.find(c => c.fromStayId === a.id)!;
    Object.assign(co, { status: 'scheduled', scheduledFor: d(3) });
    b.arrival = d(3);
    a.departure = d(3);
    reconcile(x);
    const after = x.changeovers.find(c => c.id === co.id)!;
    expect(after.status).toBe('needs');
    expect(after.invalidated).toMatch(/Dates changed/);
  });
  it('a booked clean whose departure becomes open-ended is flagged, not removed', () => {
    const a = stay('r1', 'w1', -3, 2);
    const x = load([a]);
    reconcile(x);
    Object.assign(x.changeovers[0], { status: 'scheduled', scheduledFor: d(2) });
    a.departure = null;
    a.depStatus = 'ufn';
    reconcile(x);
    expect(x.changeovers).toHaveLength(1);
    expect(x.changeovers[0].cancelled).toBeTruthy();
  });
});

describe('validate / warnings / finder', () => {
  beforeEach(() => {
    n = 0;
  });
  const inp = (roomId: string, workerId: string | null, a: number, dep: number | null) => ({
    roomId,
    workerId,
    holdLabel: '',
    arrival: d(a),
    departure: dep === null ? null : d(dep),
    depStatus: dep === null ? ('ufn' as const) : ('planned' as const),
    away: null,
    notes: '',
  });
  it('clash names the guest and the room', () => {
    load([stay('r1', 'w1', -3, 4)]);
    expect(validate(inp('r1', 'w2', 2, 6))).toMatch(/Loch Roag Room 1 is taken by Iain Smith/);
  });
  it('same worker in two rooms is a warning, not an error', () => {
    load([stay('r1', 'w1', -3, 4)]);
    expect(validate(inp('r2', 'w1', 2, 6))).toBeNull();
    expect(workerClash(inp('r2', 'w1', 2, 6))?.roomId).toBe('r1');
    expect(workerClash(inp('r2', 'w1', 4, 6))).toBeUndefined();
  });
  it('free rooms excludes taken and non-contracted rooms', () => {
    load([stay('r1', 'w1', -3, 4), stay('r2', 'w2', 6, null)]);
    expect(freeRooms(d(0), d(3)).map(r => r.id)).toEqual(['r2', 'r3']);
    expect(freeRooms(d(5), d(8)).map(r => r.id)).toEqual(['r1', 'r3']);
    expect(freeRooms(d(4), null).map(r => r.id)).toEqual(['r1', 'r3']);
  });
  it('booking a worker defaults to after their current stay, same room if free', () => {
    load([stay('r1', 'w1', -3, 4)]);
    expect(suggestFor('w1')).toEqual({ arrival: d(4), roomId: 'r1' });
    expect(suggestFor('w2')).toEqual({ arrival: T });
  });
  it('occupancy counts away guests as allocated but not on site', () => {
    load([stay('r1', 'w1', -3, 9, { away: { from: d(-1), to: d(2) } }), stay('r2', 'w2', -1, 3)]);
    expect(occupancy(T)).toEqual({ allocated: 2, onSite: 1, away: 1 });
  });
});

describe('readiness (single status source)', () => {
  it('client sees "Ready by" only; provider sees the cleaning state', () => {
    const x = load([stay('r1', 'w1', -3, 2), stay('r1', 'w2', 5, 9)]);
    reconcile(x);
    const r = roomReadiness('r1')!;
    expect(r.client).toBe(
      `Ready by ${new Date(d(5) + 'T12:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })}`,
    );
    expect(r.provider).toMatch(/^Clean to book/);
  });
  it('no next arrival: nothing shown to the client', () => {
    const x = load([stay('r1', 'w1', -3, 2)]);
    reconcile(x);
    expect(readinessFor(x.changeovers[0]).client).toBeNull();
  });
  it('exception keeps a warning tone until ready', () => {
    const x = load([stay('r1', 'w1', -3, 2), stay('r1', 'w2', 5, 9)]);
    reconcile(x);
    Object.assign(x.changeovers[0], { status: 'scheduled', scheduledFor: d(6), exception: 'late' });
    expect(readinessFor(x.changeovers[0]).tone).toBe('warn');
    Object.assign(x.changeovers[0], { status: 'ready', exception: undefined });
    expect(readinessFor(x.changeovers[0]).tone).toBe('ready');
  });
});
void S;
