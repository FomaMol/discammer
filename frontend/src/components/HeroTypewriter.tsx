import { useEffect, useState, useRef } from 'react';
import { makeTranslator, type Locale } from '../utils/i18n';
import { useReducedMotion } from '../utils/useReducedMotion';

interface HeroTypewriterProps {
  phrases: string[];
  prefix?: string;
  lang?: Locale;
}

export default function HeroTypewriter({ phrases, prefix }: HeroTypewriterProps) {
  const tr = makeTranslator('heroTypewriter');
  const reduce = useReducedMotion();
  // Under reduced motion: render the first phrase fully and stop cycling.
  // Per DESIGN.md motion notes, typewriter cycling is suppressed entirely.
  const initialPhrase = phrases?.[0] ?? '';
  const [displayed, setDisplayed] = useState(reduce ? initialPhrase : '');
  const [phraseIndex, setPhraseIndex] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (!phrases || phrases.length === 0) return;
    if (reduce) {
      setDisplayed(phrases[0]);
      return;
    }

    const currentPhrase = phrases[phraseIndex];

    if (!isDeleting) {
      if (displayed.length < currentPhrase.length) {
        timeoutRef.current = setTimeout(() => {
          setDisplayed(currentPhrase.slice(0, displayed.length + 1));
        }, 80);
      } else {
        timeoutRef.current = setTimeout(() => setIsDeleting(true), 2000);
      }
    } else {
      if (displayed.length > 0) {
        timeoutRef.current = setTimeout(() => {
          setDisplayed(displayed.slice(0, -1));
        }, 40);
      } else {
        setIsDeleting(false);
        setPhraseIndex((prev) => (prev + 1) % phrases.length);
      }
    }

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [displayed, isDeleting, phraseIndex, phrases, reduce]);

  const resolvedPrefix = prefix ?? tr('prefix');

  return (
    <p
      className="text-sm sm:text-lg md:text-xl text-text-secondary break-words"
      style={{ fontFamily: '"JetBrains Mono", monospace' }}
    >
      {/* Static copy for AT — the animated spans below mutate every 80ms */}
      <span className="sr-only">{resolvedPrefix + phrases.join(' / ')}</span>
      <span className="text-text-muted" aria-hidden="true">
        {resolvedPrefix}
      </span>
      <span className="text-accent-amber glow-amber" aria-hidden="true">
        {displayed}
      </span>
      <span
        className="text-accent-cyan ml-0.5 inline-block"
        style={{ animation: reduce ? undefined : 'blink 1s step-end infinite' }}
        aria-hidden="true"
      >
        &#x25AE;
      </span>
    </p>
  );
}
