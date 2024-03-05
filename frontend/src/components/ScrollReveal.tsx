import { useEffect, useRef } from 'react';

interface Props {
  /** Optional pass-through HTML preserved from the SSR template. */
  dangerouslySetInnerHTML?: { __html: string };
  /** Threshold ratio at which to consider element "in view". Default 0.3. */
  threshold?: number;
}

/**
 * ScrollReveal — wraps a server-rendered section and animates it in once
 * (and only once) when at least `threshold` of it crosses the viewport.
 *
 * Implementation notes:
 *   - Uses IntersectionObserver, falls back to "immediately visible" if the
 *     API is missing (very old browsers + SSR).
 *   - Respects prefers-reduced-motion via CSS in globals.css (.reveal under
 *     the reduced-motion @media block is forced visible). No JS check needed.
 *   - Disconnects the observer after first reveal so it never re-hides on
 *     scroll-back.
 *
 * Usage in Jinja:
 *   <div data-component="ScrollReveal">
 *     <section> ... </section>
 *   </div>
 *
 * The component preserves the children innerHTML via dangerouslySetInnerHTML
 * (the islands hydrator forwards this from the original element).
 */
export default function ScrollReveal({ dangerouslySetInnerHTML, threshold = 0.3 }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // If IntersectionObserver isn't available, just reveal immediately —
    // never leave content hidden waiting for an API that won't fire.
    if (typeof IntersectionObserver === 'undefined') {
      el.classList.add('reveal--visible');
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            el.classList.add('reveal--visible');
            io.disconnect();
            break;
          }
        }
      },
      { threshold },
    );

    io.observe(el);

    // If element is already in view at mount (e.g., above-the-fold reveals),
    // trigger the class on the next animation frame so the transition runs.
    requestAnimationFrame(() => {
      const rect = el.getBoundingClientRect();
      const vh = window.innerHeight || document.documentElement.clientHeight;
      const visibleAmount = Math.min(rect.bottom, vh) - Math.max(rect.top, 0);
      if (visibleAmount > 0 && rect.height > 0 && visibleAmount / rect.height >= threshold) {
        el.classList.add('reveal--visible');
        io.disconnect();
      }
    });

    return () => io.disconnect();
  }, [threshold]);

  // dangerouslySetInnerHTML is the standard way to keep server-rendered
  // markup inside a hydrated React island — see main.tsx hydrateIslands.
  return (
    <div
      ref={ref}
      className="reveal"
      dangerouslySetInnerHTML={dangerouslySetInnerHTML}
    />
  );
}
