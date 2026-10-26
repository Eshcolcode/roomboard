// Toasts (with Undo) and a promise-based confirm dialog, rendered once by the Shell.
import { useSyncExternalStore } from 'react';
import { data } from '../data';
import { friendlyDates } from '../dates';

type Toast = { id: number; text: string; undo?: boolean };
type Ask = { title: string; body?: string; ok: string; danger?: boolean; resolve: (v: boolean) => void };
let toasts: Toast[] = [];
let ask: Ask | null = null;
const subs = new Set<() => void>();
const emit = () => subs.forEach(f => f());
let n = 0;
let version = 0;
const sub = (f: () => void) => {
  subs.add(f);
  return () => {
    subs.delete(f);
  };
};

export function toast(text: string, opts: { undo?: boolean } = {}) {
  const t = { id: ++n, text, undo: opts.undo };
  toasts = [t];
  version++;
  emit();
  setTimeout(
    () => {
      toasts = toasts.filter(x => x.id !== t.id);
      version++;
      emit();
    },
    opts.undo ? 8000 : 3500,
  );
}

export function confirmDialog(o: Omit<Ask, 'resolve'>): Promise<boolean> {
  return new Promise(resolve => {
    ask = { ...o, resolve };
    version++;
    emit();
  });
}

function close(v: boolean) {
  ask?.resolve(v);
  ask = null;
  version++;
  emit();
}

export function Overlays() {
  useSyncExternalStore(sub, () => version);
  return (
    <>
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map(t => (
          <div className="toast" key={t.id}>
            <span>{friendlyDates(t.text)}</span>
            {t.undo && (
              <button
                className="link light"
                onClick={() => {
                  toasts = [];
                  version++;
                  emit();
                  data.undo().then(() => toast('Undone'));
                }}
              >
                Undo
              </button>
            )}
          </div>
        ))}
      </div>
      {ask && (
        <div className="scrim center" onClick={() => close(false)}>
          <div
            className="dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="dlg-t"
            onClick={e => e.stopPropagation()}
          >
            <h2 id="dlg-t">{ask.title}</h2>
            {ask.body && <p>{ask.body}</p>}
            <div className="pa">
              <div className="sp" />
              <button className="btn ghost" onClick={() => close(false)}>
                Go back
              </button>
              <button className={'btn' + (ask.danger ? ' red' : '')} autoFocus onClick={() => close(true)}>
                {ask.ok}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
