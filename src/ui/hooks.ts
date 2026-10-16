import { useEffect, useState } from 'react';

/** True when the screen is wide enough for the tape chart (desktop / tablet landscape). */
export function useWide() {
  const [w, setW] = useState(window.innerWidth);
  useEffect(() => {
    const f = () => setW(window.innerWidth);
    addEventListener('resize', f);
    return () => removeEventListener('resize', f);
  }, []);
  return w >= 820;
}

export function useEscape(fn: () => void) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && fn();
    addEventListener('keydown', k);
    return () => removeEventListener('keydown', k);
  }, [fn]);
}
