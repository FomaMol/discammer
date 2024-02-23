import { useEffect, useState, useRef } from 'react';
import { currentLang, pick, type Locale } from '../utils/i18n';

interface IncidentFeedProps {
  lang?: Locale;
}

interface Incident {
  id: number;
  time: string;
  body: string;
  region?: string;
}

const POOL_EN: Array<Omit<Incident, 'id' | 'time'>> = [
  { body: 'pig-butchering attempt logged', region: 'TG' },
  { body: 'fake bank SMS variant detected', region: 'RU' },
  { body: 'deepfake voice call · 38s', region: 'CN→UK' },
  { body: 'parcel-delivery phishing burst', region: 'EU' },
  { body: 'tech-support callback fraud', region: 'US' },
  { body: 'crypto recovery scam reported', region: 'NL' },
  { body: 'romance lure on dating app', region: 'TG' },
  { body: 'job-offer credential harvest', region: 'IN' },
  { body: 'fake invoice w/ wire instructions', region: 'DE' },
  { body: 'family-emergency text scam', region: 'CA' },
  { body: 'investment seminar pitch', region: 'AE' },
  { body: 'rental deposit fraud', region: 'UK' },
  { body: 'utility-bill late-notice phishing', region: 'AU' },
  { body: 'two-factor reset spoof attempt', region: 'BR' },
  { body: 'gift-card payment demand', region: 'US' },
];

const POOL_RU: Array<Omit<Incident, 'id' | 'time'>> = [
  { body: 'попытка «забоя свиньи» зафиксирована', region: 'TG' },
  { body: 'обнаружен новый шаблон банковской SMS', region: 'RU' },
  { body: 'дипфейк голосовой звонок · 38с', region: 'CN→UK' },
  { body: 'волна фишинга «доставка посылки»', region: 'EU' },
  { body: 'мошенничество техподдержки', region: 'US' },
  { body: 'возврат криптовалюты — обман', region: 'NL' },
  { body: 'романтическая ловушка на сайте знакомств', region: 'TG' },
  { body: 'сбор учётных данных под видом вакансии', region: 'IN' },
  { body: 'поддельный счёт с реквизитами', region: 'DE' },
  { body: 'звонок «срочно нужны деньги»', region: 'CA' },
  { body: 'инвестиционный вебинар', region: 'AE' },
  { body: 'депозит за аренду — обман', region: 'UK' },
  { body: 'фишинг «задолженность за свет»', region: 'AU' },
  { body: 'подмена сброса 2FA', region: 'BR' },
  { body: 'требование оплаты подарочной картой', region: 'US' },
];

type Bundle = { heading: string; monitor_label: string; paused: string };
const BUNDLES: Record<Locale, Bundle> = {
  en: {
    heading: 'LIVE INCIDENT FEED',
    monitor_label: 'MONITOR 01',
    paused: 'paused (reduced motion)',
  },
  ru: {
    heading: 'ЛЕНТА ИНЦИДЕНТОВ',
    monitor_label: 'МОНИТОР 01',
    paused: 'приостановлено (reduced motion)',
  },
};

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
  );
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

function formatTime(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

const MAX_VISIBLE = 5;

export default function IncidentFeed({ lang }: IncidentFeedProps) {
  const locale = currentLang(lang);
  const pool = pick(locale, { en: POOL_EN, ru: POOL_RU });
  const bundle = pick(locale, BUNDLES);
  const reduce = prefersReducedMotion();

  // Seed with 3 initial items so the panel isn't empty on mount
  const seedRef = useRef<Incident[]>([]);
  if (seedRef.current.length === 0) {
    const now = new Date();
    seedRef.current = [0, 1, 2].map((i) => {
      const item = pool[(i * 4) % pool.length];
      const t = new Date(now.getTime() - (3 - i) * 47_000);
      return { id: i, time: formatTime(t), body: item.body, region: item.region };
    });
  }
  const [items, setItems] = useState<Incident[]>(seedRef.current);
  const counterRef = useRef<number>(3);
  const poolIdxRef = useRef<number>(3);

  useEffect(() => {
    if (reduce) return;

    let timer: ReturnType<typeof setTimeout>;
    function schedule() {
      // 4-6 seconds, slightly randomized
      const delay = 4000 + Math.floor(Math.random() * 2000);
      timer = setTimeout(() => {
        const item = pool[poolIdxRef.current % pool.length];
        poolIdxRef.current += 1;
        counterRef.current += 1;
        const next: Incident = {
          id: counterRef.current,
          time: formatTime(new Date()),
          body: item.body,
          region: item.region,
        };
        setItems((prev) => [next, ...prev].slice(0, MAX_VISIBLE));
        schedule();
      }, delay);
    }
    schedule();
    return () => clearTimeout(timer);
  }, [pool, reduce]);

  return (
    <div className="bg-[#0a0d16]/85 border border-[#202a44] backdrop-blur-sm">
      {/* Header strip */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#121828]/80 border-b border-[#202a44]">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-[#7ce896] status-dot" aria-hidden="true"></span>
          <span
            className="text-[10px] uppercase tracking-[2.5px] text-[#aab2c4]"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}
          >
            {bundle.heading}
          </span>
        </div>
        <span
          className="text-[9px] uppercase tracking-[2px] text-[#475064] tabular-nums"
          style={{ fontFamily: '"JetBrains Mono", monospace' }}
        >
          {bundle.monitor_label}
        </span>
      </div>

      {/* Items */}
      <ul
        className="px-3 py-2 flex flex-col gap-1 min-h-[148px]"
        style={{ fontFamily: '"JetBrains Mono", monospace' }}
        aria-live="polite"
        aria-atomic="false"
      >
        {items.map((item, idx) => {
          // Newer items toward top of the list, older items lower.
          // Older items fade — gives the CRT-decay feel.
          const opacity = Math.max(0.32, 1 - idx * 0.16);
          return (
            <li
              key={item.id}
              className="text-[11px] sm:text-[12px] leading-tight flex items-baseline gap-2"
              style={{
                opacity,
                animation: reduce ? undefined : 'feedRowIn 360ms cubic-bezier(0.16, 1, 0.3, 1)',
              }}
            >
              <span className="text-[#475064] tabular-nums">{item.time}</span>
              <span className="text-[#65def0]" aria-hidden="true">&#9656;</span>
              <span className="text-[#aab2c4] truncate flex-1">{item.body}</span>
              {item.region && (
                <span className="text-[#6b7588] text-[10px] tabular-nums ml-auto">{item.region}</span>
              )}
            </li>
          );
        })}
      </ul>

      {/* Local keyframe for the entry animation. Bundles into the page-level CSS at build time. */}
      <style>{`
        @keyframes feedRowIn {
          from { opacity: 0; transform: translateY(-4px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @media (prefers-reduced-motion: reduce) {
          @keyframes feedRowIn { from {} to {} }
        }
      `}</style>
    </div>
  );
}
