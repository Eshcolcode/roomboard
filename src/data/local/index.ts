import { S, publish, reconcile } from '../core';
import type { Repo } from '../repo';
import { seed } from './seed';
import { KEY, load, undo, undoStack, commit, log } from './store';
import { tick } from './alerts';
import { saveStay, deleteStay, confirmDeparture, saveBatch } from './stays';
import { updateChangeover, dismissChangeover } from './changeovers';
import { upsertWorker, addEnquiry } from './misc';
import { createSeries, updateSeries } from './series';

export const localRepo: Repo = {
  mode: 'demo',
  async init() {
    publish(load());
    setInterval(tick, 1000);
    // keep tabs in sync so stale edits are detected across tabs too
    addEventListener('storage', e => {
      if (e.key === KEY && e.newValue) {
        const cur = S.db.currentUser;
        publish({ ...JSON.parse(e.newValue), currentUser: cur });
      }
    });
  },
  async saveStay(i) {
    return saveStay(i);
  },
  async deleteStay(id) {
    deleteStay(id);
  },
  async saveBatch(inputs, removeIds, what) {
    saveBatch(inputs, removeIds, what);
  },
  async confirmDeparture(id) {
    confirmDeparture(id);
  },
  async updateChangeover(id, p) {
    updateChangeover(id, p);
  },
  async dismissChangeover(id) {
    dismissChangeover(id);
  },
  async updateProperty(id, p) {
    Object.assign(
      S.db.properties.find(x => x.id === id)!,
      p,
    );
    log(
      `Updated default times for ${S.db.properties.find(x => x.id === id)!.name}: checkout ${p.checkout ?? ''} check-in ${p.checkin ?? ''}`,
    );
    commit();
  },
  async setPrefs(id, p) {
    Object.assign(
      S.db.users.find(u => u.id === id)!,
      p,
    );
    commit();
  },
  async upsertWorker(w) {
    return upsertWorker(w);
  },
  async createSeries(base, inputs) {
    return createSeries(base, inputs);
  },
  async updateSeries(next, what) {
    updateSeries(next, what);
  },
  async undo() {
    undo();
  },
  canUndo: () => undoStack.length > 0,
  async addEnquiry(e) {
    addEnquiry(e);
  },
  async setUser(id) {
    S.db.currentUser = id;
    commit();
  },
  async reset() {
    undoStack.length = 0;
    localStorage.removeItem(KEY);
    const x = seed();
    reconcile(x);
    publish(x);
    commit();
  },
};
