// Quick mode for the full app: the one-question quick card / booking flow opens from the board, room cards,
// lists and search, as a bottom sheet (phone) or side panel (desktop). Classic mode keeps the old panel.
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { data } from '../data';
import type { Stay } from '../data';
import { useEscape } from '../ui/hooks';
import { Book } from './Book';
import type { BookInit, Notify } from './Book';
import { Change } from './Change';
import './simple.css';

export type UiMode = 'quick' | 'classic';
export const MODE_KEY = 'rb-ui-mode';
const read = (): UiMode => {
  try {
    return localStorage.getItem(MODE_KEY) === 'classic' ? 'classic' : 'quick';
  } catch {
    return 'quick';
  }
};
let mode: UiMode = read();
const subs = new Set<() => void>();
export function setUiMode(m: UiMode) {
  mode = m;
  try {
    localStorage.setItem(MODE_KEY, m);
  } catch {
    /* private mode: still switches for this visit */
  }
  subs.forEach(f => f());
}
export const getUiMode = () => mode;
export const useUiMode = () =>
  useSyncExternalStore(
    f => {
      subs.add(f);
      return () => {
        subs.delete(f);
      };
    },
    () => mode,
  );

/** Quick / Classic switch. Desktop: two-part control. Phone: one compact switch. */
export function ModeSwitch({ compact }: { compact?: boolean }) {
  const m = useUiMode();
  if (compact)
    return (
      <button
        className={'q-switch1 ' + m}
        role="switch"
        aria-checked={m === 'quick'}
        aria-label="Quick mode (off = Classic)"
        title={m === 'quick' ? 'Quick mode on. Tap for Classic' : 'Classic mode. Tap for Quick'}
        onClick={() => setUiMode(m === 'quick' ? 'classic' : 'quick')}
      >
        <i aria-hidden />
        {m === 'quick' ? 'Quick' : 'Classic'}
      </button>
    );
  return (
    <div className="q-switch" role="radiogroup" aria-label="Editing style">
      {(['quick', 'classic'] as UiMode[]).map(k => (
        <button
          key={k}
          role="radio"
          aria-checked={m === k}
          className={m === k ? 'on' : ''}
          onClick={() => setUiMode(k)}
        >
          {k === 'quick' ? 'Quick' : 'Classic'}
        </button>
      ))}
    </div>
  );
}

type ToastT = { id: number; text: string; steps: number };
/** Toast with a multi-step Undo (a whole-crew change is several saves). */
export function useQuickToast(): [Notify, JSX.Element] {
  const [toast, setToast] = useState<ToastT | null>(null);
  const tid = useRef(0);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(x => (x?.id === toast.id ? null : x)), 8000);
    return () => clearTimeout(t);
  }, [toast]);
  const notify: Notify = (text, steps = 0) => setToast({ id: ++tid.current, text, steps });
  const el = (
    <div className="s-toasts" role="status" aria-live="polite">
      {toast && (
        <div className="s-toast" key={toast.id}>
          <span>{toast.text}</span>
          {toast.steps > 0 && (
            <button
              onClick={async () => {
                const n = toast.steps;
                setToast(null);
                for (let i = 0; i < n; i++) if (data.canUndo()) await data.undo();
                notify('Undone');
              }}
            >
              Undo
            </button>
          )}
          <i className="s-timer" aria-hidden />
        </div>
      )}
    </div>
  );
  return [notify, el];
}

export interface QuickInit extends BookInit {
  stay?: Stay;
}

export function QuickSheet({
  init,
  wide,
  onClose,
  onSwitch,
  onDetails,
  notify,
}: {
  init: QuickInit;
  wide: boolean;
  onClose: () => void;
  onSwitch: (i: QuickInit) => void;
  onDetails: (s: Stay) => void;
  notify: Notify;
}) {
  useEscape(onClose);
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    return () => opener?.focus?.();
  }, []);
  const panel = (
    <div
      className={'q-panel s-scope ' + (wide ? 'side' : 'sheet')}
      role="dialog"
      aria-modal={!wide}
      aria-label={init.stay ? 'Booking' : 'Book a room'}
      onClick={e => e.stopPropagation()}
    >
      <div className="q-bar">
        {!wide && <span className="q-grab" aria-hidden />}
        <span className="q-title">{init.stay ? 'Booking' : 'Book a room'}</span>
        <button className="q-x" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </div>
      <div className="q-body">
        {init.stay ? (
          <Change id={init.stay.id} onHome={onClose} notify={notify} onDetails={onDetails} />
        ) : (
          <Book
            init={init}
            onExit={onClose}
            notify={notify}
            onOpenStay={id => onSwitch({ stay: { id } as Stay })}
            onRestart={() => onSwitch({ date: init.date })}
          />
        )}
      </div>
    </div>
  );
  return wide ? (
    panel
  ) : (
    <div className="q-scrim" onClick={onClose}>
      {panel}
    </div>
  );
}
