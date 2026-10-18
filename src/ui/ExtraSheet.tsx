import { createPortal } from 'react-dom';
// Book an extra property in place: a sheet over the board or Rooms view (side panel on desktop, bottom sheet on
// a phone) with the tapped night prefilled, adjustable range or open-ended, the estimate and "Book these dates".
import { useEffect, useRef } from 'react';
import { useDB, thumb } from '../data';
import { priceLine } from '../data/pricing';
import { UnitAvailability } from './Availability';
import type { PanelInit } from './StayPanel';

/** Pick the dates here; "Book these dates" hands them to the normal booking flow (Quick card or Classic form). */
export function ExtraSheet({
  pid,
  date,
  onClose,
  onOpen,
}: {
  pid: string;
  date?: string;
  onClose: () => void;
  onOpen?: (p: PanelInit) => void;
}) {
  const db = useDB();
  const p = db.properties.find(x => x.id === pid);
  const closeRef = useRef<HTMLButtonElement>(null);
  const done = useRef(onClose);
  done.current = onClose;
  useEffect(() => {
    const back = document.activeElement as HTMLElement | null;
    closeRef.current?.focus({ preventScroll: true });
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        done.current();
      }
    };
    addEventListener('keydown', key, true);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      removeEventListener('keydown', key, true);
      document.body.style.overflow = prev;
      back?.focus?.({ preventScroll: true });
    };
  }, []);
  if (!p) return null;
  return createPortal(
    <div className="xs-back" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="xs" role="dialog" aria-modal="true" aria-label={`Book ${p.name}`} data-sheet={pid}>
        <header className="xs-head">
          {p.photo && <img src={thumb(p.photo)} alt="" />}
          <div>
            <b>Book {p.name}</b>
            <small>{priceLine(db, p)}</small>
            <span className="xtag">Extra · whole property · invoiced separately</span>
          </div>
          <button ref={closeRef} className="xs-x" aria-label="Close" onClick={onClose}>
            ✕
          </button>
        </header>
        <div className="xs-body">
          <UnitAvailability
            p={p}
            months={2}
            start={date}
            onBooked={onClose}
            onNext={
              onOpen &&
              (b => {
                onClose();
                onOpen(b);
              })
            }
          />
        </div>
      </div>
    </div>,
    document.body,
  );
}
