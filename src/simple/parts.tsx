// Simple mode (mockup): the shared building blocks. One big box, one question at a time.
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { addDays, fmt, londonToday } from '../dates';

/** The single box every question appears in. Changing `step` slides the new question in. */
export function Box({
  step,
  title,
  sub,
  dots,
  onBack,
  onClose,
  children,
  dir = 1,
}: {
  step: string;
  title: ReactNode;
  sub?: ReactNode;
  dots?: { n: number; at: number };
  onBack?: () => void;
  onClose?: () => void;
  children: ReactNode;
  dir?: 1 | -1;
}) {
  const h = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    h.current?.focus({ preventScroll: true });
    const sheet = h.current?.closest('.q-body');
    if (sheet) sheet.scrollTo({ top: 0 });
    else window.scrollTo({ top: 0 });
  }, [step]);
  return (
    <section className="s-box" aria-live="polite">
      <div className="s-boxtop">
        {onBack ? (
          <button className="s-round" onClick={onBack} aria-label="Back">
            <span aria-hidden>←</span>
          </button>
        ) : (
          <span className="s-round ghost" aria-hidden />
        )}
        {dots ? (
          <div className="s-dots" aria-label={`Step ${dots.at + 1} of ${dots.n}`} role="img">
            {Array.from({ length: dots.n }, (_, i) => (
              <i key={i} className={i < dots.at ? 'done' : i === dots.at ? 'on' : ''} />
            ))}
          </div>
        ) : (
          <div className="sp" />
        )}
        {onClose ? (
          <button className="s-round s-close" onClick={onClose} aria-label="Close">
            <span aria-hidden>✕</span>
          </button>
        ) : (
          <span className="s-round ghost" aria-hidden />
        )}
      </div>
      <div className={'s-q ' + (dir > 0 ? 'in-r' : 'in-l')} key={step}>
        <h2 tabIndex={-1} ref={h}>
          {title}
        </h2>
        {sub && <p className="s-sub">{sub}</p>}
        {children}
      </div>
    </section>
  );
}

export function Chip({
  on,
  onClick,
  children,
  small,
  disabled,
}: {
  on?: boolean;
  onClick: () => void;
  children: ReactNode;
  small?: ReactNode;
  disabled?: boolean;
}) {
  return (
    <button className={'s-chip' + (on ? ' on' : '')} onClick={onClick} aria-pressed={on} disabled={disabled}>
      <b>{children}</b>
      {small && <small>{small}</small>}
    </button>
  );
}

const WD = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const monthStart = (d: string) => d.slice(0, 8) + '01';
const nextMonth = (m: string) => {
  const [y, mm] = m.split('-').map(Number);
  return mm === 12 ? `${y + 1}-01-01` : `${y}-${String(mm + 1).padStart(2, '0')}-01`;
};
const prevMonth = (m: string) => {
  const [y, mm] = m.split('-').map(Number);
  return mm === 1 ? `${y - 1}-12-01` : `${y}-${String(mm - 1).padStart(2, '0')}-01`;
};

/** Big month calendar. Monday first. Days before `min` cannot be picked. */
export function Calendar({
  value,
  onPick,
  min,
  from,
  label,
}: {
  value: string | null;
  onPick: (d: string) => void;
  min?: string;
  from?: string | null;
  label: string;
}) {
  const [month, setMonth] = useState(monthStart(value ?? min ?? londonToday()));
  const first = month;
  const lead = (new Date(first + 'T00:00Z').getUTCDay() + 6) % 7;
  const days: (string | null)[] = Array.from({ length: lead }, () => null);
  for (let d = first; d.slice(0, 7) === first.slice(0, 7); d = addDays(d, 1)) days.push(d);
  const T = londonToday();
  return (
    <div className="s-cal" role="group" aria-label={label}>
      <div className="s-calhead">
        <button className="s-round sm" onClick={() => setMonth(prevMonth(month))} aria-label="Previous month">
          ‹
        </button>
        <b>{fmt(first, { month: 'long', year: 'numeric' })}</b>
        <button className="s-round sm" onClick={() => setMonth(nextMonth(month))} aria-label="Next month">
          ›
        </button>
      </div>
      <div className="s-calgrid">
        {WD.map(w => (
          <span key={w} className="wd" aria-hidden>
            {w.slice(0, 2)}
          </span>
        ))}
        {days.map((d, i) =>
          d ? (
            <button
              key={d}
              className={
                'd' +
                (d === value ? ' on' : '') +
                (from && value && d > from && d < value ? ' in' : '') +
                (d === from ? ' from' : '') +
                (d === T ? ' today' : '')
              }
              disabled={!!min && d < min}
              onClick={() => onPick(d)}
              aria-label={fmt(d, { weekday: 'long', day: 'numeric', month: 'long' })}
              aria-pressed={d === value}
            >
              {Number(d.slice(8))}
            </button>
          ) : (
            <span key={'e' + i} />
          ),
        )}
      </div>
    </div>
  );
}

/** One date with big −1 / +1 day buttons, and a calendar a tap away. */
export function DateNudge({
  label,
  value,
  onChange,
  min,
  from,
}: {
  label: string;
  value: string;
  onChange: (d: string) => void;
  min?: string;
  from?: string | null;
}) {
  const [cal, setCal] = useState(false);
  return (
    <div className="s-nudge">
      <span className="s-lbl">{label}</span>
      <div className="s-nudgerow">
        <button
          className="s-round big"
          onClick={() => onChange(addDays(value, -1))}
          disabled={!!min && addDays(value, -1) < min}
          aria-label={`${label}: one day earlier`}
        >
          −1
        </button>
        <button
          className="s-date"
          onClick={() => setCal(!cal)}
          aria-expanded={cal}
          aria-label={`${label}: ${fmt(value, { weekday: 'long', day: 'numeric', month: 'long' })}. Tap for calendar`}
        >
          <b>{fmt(value, { weekday: 'short', day: 'numeric', month: 'short' })}</b>
          <small>{cal ? 'Hide calendar' : 'Tap for calendar'}</small>
        </button>
        <button
          className="s-round big"
          onClick={() => onChange(addDays(value, 1))}
          aria-label={`${label}: one day later`}
        >
          +1
        </button>
      </div>
      {cal && (
        <Calendar
          label={label}
          value={value}
          min={min}
          from={from}
          onPick={d => {
            onChange(d);
            setCal(false);
          }}
        />
      )}
    </div>
  );
}

export function Note({ tone, children }: { tone: 'ok' | 'warn' | 'bad'; children: ReactNode }) {
  return (
    <div className={'s-note ' + tone} role={tone === 'ok' ? 'status' : 'alert'}>
      <span aria-hidden>{tone === 'ok' ? '✓' : '!'}</span>
      <div>{children}</div>
    </div>
  );
}
