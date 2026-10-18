// Full-screen photo viewer: tap a photo to enlarge, swipe (or ← →) to move, Esc / ✕ / tap outside to close.
// Used for the property galleries and the room photos. Desktop and phone alike.
import { useEffect, useRef, useState } from 'react';
import type { Photo } from '../data';

export function Lightbox({
  photos,
  start = 0,
  title,
  onClose,
}: {
  photos: Photo[];
  start?: number;
  title: string;
  onClose: () => void;
}) {
  const [i, setI] = useState(start);
  const n = photos.length;
  const go = (d: number) => setI(x => (x + d + n) % n);
  const closeRef = useRef<HTMLButtonElement>(null);
  const down = useRef<{ x: number; y: number } | null>(null);
  const swiped = useRef(false);
  useEffect(() => {
    const back = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      } else if (e.key === 'ArrowRight') go(1);
      else if (e.key === 'ArrowLeft') go(-1);
    };
    addEventListener('keydown', key, true);
    return () => {
      removeEventListener('keydown', key, true);
      document.body.style.overflow = prev;
      back?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const ph = photos[i];
  return (
    <div
      className="lb"
      role="dialog"
      aria-modal="true"
      aria-label={`${title} photos`}
      onClick={e => e.target === e.currentTarget && !swiped.current && onClose()}
      onPointerDown={e => (down.current = { x: e.clientX, y: e.clientY })}
      onPointerUp={e => {
        const d = down.current;
        down.current = null;
        if (!d) return;
        const dx = e.clientX - d.x;
        swiped.current = Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(e.clientY - d.y);
        if (swiped.current) go(dx < 0 ? 1 : -1);
      }}
    >
      <div className="lb-top">
        <span>
          <b>{title}</b> · {i + 1} of {n}
        </span>
        <button ref={closeRef} className="lb-x" aria-label="Close photos" onClick={onClose}>
          ✕
        </button>
      </div>
      <img className="lb-img" src={ph.src} alt={ph.alt} draggable={false} />
      {ph.alt && <p className="lb-cap">{ph.alt}</p>}
      {n > 1 && (
        <>
          <button className="lb-nav prev" aria-label="Previous photo" onClick={() => go(-1)}>
            ‹
          </button>
          <button className="lb-nav next" aria-label="Next photo" onClick={() => go(1)}>
            ›
          </button>
          <div className="lb-dots" aria-hidden>
            {photos.map((p, k) => (
              <i key={p.src + k} className={k === i ? 'on' : ''} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
