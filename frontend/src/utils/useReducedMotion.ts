import { useEffect, useState } from 'react';

/**
 * Returns true if the user has set `prefers-reduced-motion: reduce`.
 *
 * Initial render returns false (assume motion OK) to keep SSR-friendly,
 * then updates after mount once we can read the media query. Listens for
 * runtime changes so flipping the OS toggle takes effect without reload.
 */
export function useReducedMotion(): boolean {
  const [reduce, setReduce] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduce(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReduce(e.matches);
    // addEventListener is the modern API; addListener is the deprecated fallback.
    if (typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', onChange);
      return () => mq.removeEventListener('change', onChange);
    } else {
      mq.addListener(onChange);
      return () => mq.removeListener(onChange);
    }
  }, []);

  return reduce;
}

/** Synchronous one-shot check — useful inside non-hook code paths. */
export function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
  );
}
