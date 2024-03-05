import { useEffect, useRef } from 'react';

interface Props {
  /** Pass-through HTML preserved from the SSR template. */
  dangerouslySetInnerHTML?: { __html: string };
}

const SESSION_KEY = 'discammer-wordmark-revealed';

/**
 * WordmarkReveal — wraps the home-page DISCAMMER wordmark and plays a single
 * opacity + translateY entry on mount. Gated by sessionStorage so the same
 * tab won't re-play it on every soft route change.
 *
 * Animation is delivered via a CSS class (`.wordmark-reveal` in globals.css),
 * which is automatically suppressed under prefers-reduced-motion. No JS
 * media query check needed; CSS handles the a11y branch.
 *
 * Usage in Jinja:
 *   <div data-component="WordmarkReveal">
 *     <h1>DISCAMMER</h1>
 *   </div>
 */
export default function WordmarkReveal({ dangerouslySetInnerHTML }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let alreadyShown = false;
    try {
      alreadyShown = window.sessionStorage.getItem(SESSION_KEY) === '1';
    } catch {
      // sessionStorage can throw in private mode on some browsers; treat as
      // "not shown yet" and let the animation run.
    }

    if (alreadyShown) return;

    // Apply the reveal class — CSS does the rest.
    el.classList.add('wordmark-reveal');

    try {
      window.sessionStorage.setItem(SESSION_KEY, '1');
    } catch {
      /* noop */
    }
  }, []);

  // No `display: contents` here — the animation needs a real box to apply to.
  // The wrapper sits transparently inside the hero column; the wordmark inside
  // it inherits the wrapper's animated opacity/transform.
  return (
    <div ref={ref} dangerouslySetInnerHTML={dangerouslySetInnerHTML} />
  );
}
