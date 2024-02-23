import { useEffect, useRef } from 'react';
import { currentLang, pick, type Locale } from '../utils/i18n';

interface FraudMarqueeProps {
  lang?: Locale;
  /** Duration of one full loop in seconds. Default 80s (very slow). */
  durationSec?: number;
}

const TERMS_EN: string[] = [
  'pig-butchering',
  'deepfake voice call',
  'romance bait',
  'phishing kit',
  'tech-support spoof',
  'investment seminar',
  'fake bank SMS',
  'parcel-delivery lure',
  'job-offer harvest',
  'rental deposit fraud',
  'gift-card demand',
  'fake recovery service',
  'invoice spoof',
  'family-emergency text',
  'sim swap attempt',
  'crypto rug pull',
  'mule recruitment',
  'fake KYC form',
  'utility-bill phish',
  'authority impersonation',
];

const TERMS_RU: string[] = [
  'забой свиньи',
  'дипфейк звонок',
  'романтическая ловушка',
  'фишинг-кит',
  'фейковая техподдержка',
  'инвестиционный вебинар',
  'банковская SMS',
  'фальшивая доставка',
  'сбор данных вакансий',
  'мошенничество с арендой',
  'оплата подарочной картой',
  'возврат криптовалюты',
  'поддельный счёт',
  '«срочно нужны деньги»',
  'подмена сим-карты',
  'крипто rug-pull',
  'вербовка дропов',
  'фейковый KYC',
  'фишинг по ЖКХ',
  'имитация ведомства',
];

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
  );
}

/**
 * Vertical kinetic marquee. Hidden below `lg` — desktop-only visual gutter
 * between the hero's left column and the terminal. Slow, faint, decorative
 * — communicates "many threats" without screaming.
 */
export default function FraudMarquee({ lang, durationSec = 80 }: FraudMarqueeProps) {
  const locale = currentLang(lang);
  const terms = pick(locale, { en: TERMS_EN, ru: TERMS_RU });
  const reduce = prefersReducedMotion();
  const containerRef = useRef<HTMLDivElement>(null);

  // Duplicate the list so the loop wraps seamlessly.
  const doubled = [...terms, ...terms];

  useEffect(() => {
    if (reduce) return;
    // CSS handles the animation; effect is reserved for future tweaks.
  }, [reduce]);

  return (
    <div
      ref={containerRef}
      aria-hidden="true"
      className="hidden lg:block relative overflow-hidden h-full w-full pointer-events-none"
      style={{
        maskImage: 'linear-gradient(to bottom, transparent 0%, black 14%, black 86%, transparent 100%)',
        WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, black 14%, black 86%, transparent 100%)',
      }}
    >
      <ul
        className="flex flex-col gap-2"
        style={{
          fontFamily: '"JetBrains Mono", monospace',
          animation: reduce ? undefined : `marqueeDown ${durationSec}s linear infinite`,
        }}
      >
        {doubled.map((term, i) => (
          <li
            key={`${term}-${i}`}
            className="text-[11px] uppercase tracking-[1.5px] text-[#475064] leading-tight whitespace-nowrap"
            style={{ opacity: 0.55 }}
          >
            <span className="text-[#3a8b9a] mr-1.5" aria-hidden="true">&#9656;</span>
            {term}
          </li>
        ))}
      </ul>

      <style>{`
        @keyframes marqueeDown {
          from { transform: translateY(-50%); }
          to   { transform: translateY(0%); }
        }
        @media (prefers-reduced-motion: reduce) {
          @keyframes marqueeDown { from {} to {} }
        }
      `}</style>
    </div>
  );
}
