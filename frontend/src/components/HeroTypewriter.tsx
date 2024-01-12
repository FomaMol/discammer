import { useEffect, useState, useRef } from 'react';
import { currentLang, pick, type Locale } from '../utils/i18n';

interface HeroTypewriterProps {
  phrases: string[];
  prefix?: string;
  lang?: Locale;
}

export default function HeroTypewriter({ phrases, prefix, lang }: HeroTypewriterProps) {
  const locale = currentLang(lang);
  const [displayed, setDisplayed] = useState('');
  const [phraseIndex, setPhraseIndex] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (!phrases || phrases.length === 0) return;

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
  }, [displayed, isDeleting, phraseIndex, phrases]);

  const resolvedPrefix =
    prefix ?? pick(locale, { en: '> WHERE THE SCAM IS FOUND: ', ru: '> ГДЕ ВОДЯТСЯ МОШЕННИКИ: ' });

  return (
    <p
      className="text-sm sm:text-lg md:text-xl text-text-secondary break-words"
      style={{ fontFamily: '"JetBrains Mono", monospace' }}
    >
      <span className="text-text-muted">{resolvedPrefix}</span>
      <span
        className="text-accent-amber glow-amber"
        aria-live="polite"
        aria-atomic="false"
      >
        {displayed}
      </span>
      <span
        className="text-accent-cyan ml-0.5 inline-block"
        style={{ animation: 'blink 1s step-end infinite' }}
        aria-hidden="true"
      >
        &#x25AE;
      </span>
    </p>
  );
}
