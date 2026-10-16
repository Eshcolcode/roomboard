// UK date field: always shows and accepts dd/mm/yyyy regardless of browser language,
// with the native calendar available from the button.
import { useEffect, useRef, useState } from 'react';
import { fmt, fmtUK, parseUK } from '../dates';
import { Icon } from './icons';

interface Props {
  id?: string;
  value: string; // ISO yyyy-mm-dd or ''
  onChange: (iso: string) => void;
  label?: string; // aria-label when there is no <label for>
  min?: string;
  max?: string;
  disabled?: boolean;
  className?: string;
}

export function DateField({ id, value, onChange, label, min, max, disabled, className }: Props) {
  const [text, setText] = useState(fmtUK(value));
  const [bad, setBad] = useState(false);
  const pick = useRef<HTMLInputElement>(null);
  useEffect(() => {
    setText(fmtUK(value));
    setBad(false);
  }, [value]);

  const commit = (t: string) => {
    setText(t);
    if (!t.trim()) {
      setBad(false);
      onChange('');
      return;
    }
    const iso = parseUK(t);
    setBad(!iso);
    if (iso && iso !== value) onChange(iso);
  };

  return (
    <div className={'datef' + (bad ? ' bad' : '') + (className ? ' ' + className : '')}>
      <input
        id={id}
        aria-label={label}
        inputMode="numeric"
        placeholder="dd/mm/yyyy"
        value={text}
        disabled={disabled}
        aria-invalid={bad || undefined}
        data-iso={value}
        onChange={e => commit(e.target.value)}
        onBlur={() => !bad && setText(fmtUK(value))}
      />
      <span className="dow" aria-hidden="true">
        {value && !bad ? fmt(value, { weekday: 'short' }) : ''}
      </span>
      <button
        type="button"
        className="cal"
        disabled={disabled}
        aria-label={`Open calendar${label ? ' for ' + label : ''}`}
        onClick={() => {
          const p = pick.current;
          if (p) {
            try {
              p.showPicker();
            } catch {
              p.focus();
            }
          }
        }}
      >
        <Icon name="today" size={14} />
      </button>
      <input
        ref={pick}
        type="date"
        tabIndex={-1}
        aria-hidden="true"
        className="native"
        value={value}
        min={min}
        max={max}
        onChange={e => e.target.value && onChange(e.target.value)}
      />
    </div>
  );
}
