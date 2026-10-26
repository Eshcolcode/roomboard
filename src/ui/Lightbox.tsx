import { createPortal } from 'react-dom';
// Full-screen photo viewer. Tap a photo to enlarge it; swipe, ← → or the buttons to move; Esc, ✕ or a tap outside
// to close. Zoom: pinch or double-tap on touch; mouse wheel, click or + / − on desktop. While zoomed, drag to pan
// (swiping only changes photo at normal size).
import { useEffect, useRef, useState } from 'react';
import type { Photo } from '../data';

const MAX = 4;
type Z = { s: number; x: number; y: number };
const ONE: Z = { s: 1, x: 0, y: 0 };
const clampZ = (z: Z): Z => (z.s <= 1.02 ? ONE : { ...z, s: Math.min(MAX, z.s) });

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
  const [z, setZ] = useState<Z>(ONE);
  const n = photos.length;
  const go = (d: number) => {
    setZ(ONE);
    setI(x => (x + d + n) % n);
  };
  const closeRef = useRef<HTMLButtonElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const done = useRef(onClose);
  done.current = onClose;
  // active pointers, and the gesture they started
  const pts = useRef(new Map<number, { x: number; y: number }>());
  const g = useRef<{ x: number; y: number; z: Z; dist?: number; cx?: number; cy?: number; moved: boolean } | null>(
    null,
  );
  const lastTap = useRef<{ t: number; x: number; y: number } | null>(null);
  const swiped = useRef(false);

  useEffect(() => {
    const back = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        done.current();
      } else if (e.key === 'ArrowRight') go(1);
      else if (e.key === 'ArrowLeft') go(-1);
      else if (e.key === '+' || e.key === '=') setZ(v => fit({ ...v, s: v.s * 1.5 }));
      else if (e.key === '-') setZ(v => fit({ ...v, s: v.s / 1.5 }));
    };
    addEventListener('keydown', key, true);
    return () => {
      removeEventListener('keydown', key, true);
      document.body.style.overflow = prev;
      back?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Clamp the zoom, and the pan so the photo's edge never comes in past the middle of the screen. */
  const fit = (v: Z): Z => {
    const c = clampZ(v);
    if (c.s === 1) return c;
    const mx = ((c.s - 1) * (imgRef.current?.offsetWidth ?? 0)) / 2;
    const my = ((c.s - 1) * (imgRef.current?.offsetHeight ?? 0)) / 2;
    return { ...c, x: Math.max(-mx, Math.min(mx, c.x)), y: Math.max(-my, Math.min(my, c.y)) };
  };
  /** Zoom by `k` keeping the screen point (px, py) still. */
  const zoomAt = (from: Z, k: number, px: number, py: number): Z => {
    // the photo sits centred in the stage, so the stage centre is the untransformed photo centre (no reading
    // of the transformed, possibly mid-transition, box)
    const r = imgRef.current?.parentElement?.getBoundingClientRect();
    if (!r) return from;
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const s = Math.min(MAX, Math.max(1, from.s * k));
    const f = s / from.s;
    return fit({ s, x: (px - cx) * (1 - f) + from.x * f, y: (py - cy) * (1 - f) + from.y * f });
  };

  const onDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const p = [...pts.current.values()];
    if (p.length === 2) {
      g.current = {
        x: 0,
        y: 0,
        z,
        dist: Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y),
        cx: (p[0].x + p[1].x) / 2,
        cy: (p[0].y + p[1].y) / 2,
        moved: true,
      };
    } else g.current = { x: e.clientX, y: e.clientY, z, moved: false };
  };
  const onMove = (e: React.PointerEvent) => {
    if (!pts.current.has(e.pointerId) || !g.current) return;
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const p = [...pts.current.values()];
    const s0 = g.current;
    if (p.length >= 2 && s0.dist) {
      const d = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
      setZ(zoomAt(s0.z, d / s0.dist, s0.cx!, s0.cy!));
    } else if (p.length === 1) {
      const dx = e.clientX - s0.x;
      const dy = e.clientY - s0.y;
      if (Math.abs(dx) > 6 || Math.abs(dy) > 6) s0.moved = true;
      if (s0.z.s > 1) setZ(fit({ ...s0.z, x: s0.z.x + dx, y: s0.z.y + dy })); // pan
    }
  };
  const onUp = (e: React.PointerEvent) => {
    const s0 = g.current;
    const wasPinch = pts.current.size >= 2;
    pts.current.delete(e.pointerId);
    swiped.current = false;
    if (!s0) return;
    if (wasPinch) {
      // keep the zoom; the remaining finger starts a fresh pan
      const rest = [...pts.current.values()][0];
      g.current = rest ? { x: rest.x, y: rest.y, z, moved: true } : null;
      return;
    }
    g.current = null;
    const dx = e.clientX - s0.x;
    const dy = e.clientY - s0.y;
    if (s0.z.s === 1 && Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) {
      swiped.current = true;
      go(dx < 0 ? 1 : -1);
      return;
    }
    if (s0.moved) {
      swiped.current = true;
      return;
    }
    // a tap: double-tap (touch) or click on the photo (mouse) toggles zoom at that point
    const onImg = e.target === imgRef.current;
    const now = Date.now();
    const lt = lastTap.current;
    if (e.pointerType === 'mouse') {
      if (onImg) {
        swiped.current = true;
        setZ(z.s > 1 ? ONE : zoomAt(z, 2.5, e.clientX, e.clientY));
      }
    } else if (lt && now - lt.t < 320 && Math.hypot(lt.x - e.clientX, lt.y - e.clientY) < 30) {
      lastTap.current = null;
      swiped.current = true;
      setZ(z.s > 1 ? ONE : zoomAt(z, 2.5, e.clientX, e.clientY));
    } else lastTap.current = { t: now, x: e.clientX, y: e.clientY };
  };

  const ph = photos[i];
  const zoomed = z.s > 1;
  return createPortal(
    <div
      className={'lb' + (zoomed ? ' zoomed' : '')}
      role="dialog"
      aria-modal="true"
      aria-label={`${title} photos`}
      onClick={e => e.target === e.currentTarget && !swiped.current && !zoomed && onClose()}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={e => {
        pts.current.delete(e.pointerId);
        g.current = null;
      }}
      onWheel={e => setZ(zoomAt(z, e.deltaY < 0 ? 1.2 : 1 / 1.2, e.clientX, e.clientY))}
    >
      <div className="lb-top">
        <span>
          <b>{title}</b> · {i + 1} of {n}
        </span>
        <span className="lb-zoom" role="group" aria-label="Zoom">
          <button aria-label="Zoom out" disabled={!zoomed} onClick={() => setZ(v => fit({ ...v, s: v.s / 1.5 }))}>
            −
          </button>
          <output aria-live="polite" className="lb-pct">
            {Math.round(z.s * 100)}%
          </output>
          <button aria-label="Zoom in" disabled={z.s >= MAX} onClick={() => setZ(v => fit({ ...v, s: v.s * 1.5 }))}>
            +
          </button>
        </span>
        <button ref={closeRef} className="lb-x" aria-label="Close photos" onClick={onClose}>
          ✕
        </button>
      </div>
      <div className="lb-stage">
        <img
          ref={imgRef}
          className="lb-img"
          src={ph.src}
          alt={ph.alt}
          draggable={false}
          style={{ transform: `translate(${z.x}px, ${z.y}px) scale(${z.s})` }}
        />
      </div>
      {ph.alt && <p className="lb-cap">{zoomed ? 'Drag to look around · double-tap or click to reset' : ph.alt}</p>}
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
    </div>,
    document.body,
  );
}
