import { fmt } from '../../dates';
import { S, uid, iso, propOf, workerOf } from '../core';
import type { Worker, Enquiry } from '../core';
import { commit, log } from './store';
import { queueFor, usersOf } from './alerts';

export function upsertWorker(w: Partial<Worker> & { name: string }) {
  if (w.id) Object.assign(workerOf(w.id)!, w);
  else {
    const nw: Worker = { id: uid(), company: '', phone: '', notes: '', uses: 0, ...w } as Worker;
    S.db.workers.push(nw);
    log(`Added worker ${nw.name}`);
    commit();
    return nw;
  }
  log(`Updated worker ${w.name}`);
  commit();
  return workerOf(w.id!)!;
}
export function addEnquiry(e: Omit<Enquiry, 'id' | 'ts' | 'status'>) {
  if (!e.from) throw new Error('Choose a start date.');
  if (!e.longTerm && (!e.to || e.to <= e.from))
    throw new Error('End date must be after the start date, or tick long-term.');
  if (!(e.people >= 1 && e.people <= 50)) throw new Error('People must be between 1 and 50.');
  S.db.enquiries = [{ ...e, id: uid(), ts: iso(), status: 'new' }, ...S.db.enquiries];
  const t = `Enquiry for ${propOf(e.propertyId).name}: ${e.people} people from ${fmt(e.from)}${e.longTerm ? ' (long-term)' : e.to ? ' to ' + fmt(e.to) : ''}`;
  log(t, e.propertyId);
  usersOf('manager').forEach(u => queueFor(u, 'New accommodation request', t + (e.note ? ` — "${e.note}"` : '')));
  commit();
}
