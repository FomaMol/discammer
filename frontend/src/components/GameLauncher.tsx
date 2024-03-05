import { useCallback, useEffect, useRef, useState } from 'react';
import { currentLang, pick, type Locale } from '../utils/i18n';

interface GameLauncherProps {
  src?: string;
  label?: string;
  closeLabel?: string;
  closeAria?: string;
  lang?: Locale;
}

export default function GameLauncher({
  src = '/play/',
  label,
  closeLabel,
  closeAria,
  lang,
}: GameLauncherProps) {
  const locale = currentLang(lang);
  // Solid-triangle prefix (no emoji) — primary cyan CTA in the mission-select
  // terminal frame. Label text comes from the caller; we prepend ▶ only when
  // the caller hasn't already provided one.
  const resolvedLabel = label ?? pick(locale, { en: '▶ START GAME', ru: '▶ ЗАПУСТИТЬ ИГРУ' });
  const resolvedCloseLabel = closeLabel ?? pick(locale, { en: '[ESC] CLOSE', ru: '[ESC] ЗАКРЫТЬ' });
  const resolvedCloseAria = closeAria ?? pick(locale, { en: 'Close game', ru: 'Закрыть игру' });

  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);

    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
      triggerRef.current?.focus();
    };
  }, [open, close]);

  // Once the iframe has loaded, attach an Escape listener inside the iframe's
  // window so Escape works even after the user clicks the game canvas (which
  // moves focus into the iframe and prevents the parent listener from firing).
  // Same-origin (/play/), so this is allowed.
  const onIframeLoad = useCallback(() => {
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    try {
      win.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.key === 'Escape') close();
      });
    } catch {
      // Cross-origin in some hardened setups; parent Escape + Close button still work.
    }
  }, [close]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center justify-center gap-2 px-7 py-3.5 font-mono uppercase text-[13px] tracking-[0.14em] font-bold bg-[#65def0] text-[#0b0f1a] rounded-[4px] hover:bg-[#9eecf6] hover:-translate-y-px active:translate-y-0 active:bg-[#3a8b9a] focus:outline-none focus-visible:shadow-[0_0_0_2px_#0b0f1a,0_0_0_4px_#65def0] transition-all duration-200 cursor-pointer"
      >
        {resolvedLabel}
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Antifraud Hero"
          className="fixed inset-0 z-[100] bg-black/95 flex flex-col"
        >
          <div className="flex items-center justify-between px-4 md:px-6 py-3 border-b border-[#202a44] bg-[#0b0f1a]">
            <span className="font-display-wordmark text-[#7ce896] text-xs md:text-sm glow-green tracking-widest">
              ANTIFRAUD HERO
            </span>
            <button
              ref={closeRef}
              type="button"
              onClick={close}
              aria-label={resolvedCloseAria}
              className="font-mono uppercase text-xs md:text-sm tracking-[2px] text-[#aab2c4] hover:text-[#e76670] focus:text-[#e76670] transition-colors px-3 py-1 border border-[#202a44] hover:border-[#e76670] focus:border-[#e76670] focus:outline-none cursor-pointer"
            >
              {resolvedCloseLabel}
            </button>
          </div>
          <div className="flex-1 relative bg-black">
            <iframe
              ref={iframeRef}
              src={src}
              title="Antifraud Hero"
              onLoad={onIframeLoad}
              className="absolute inset-0 w-full h-full border-0"
              allow="autoplay; fullscreen; gamepad; pointer-lock"
            />
          </div>
        </div>
      )}
    </>
  );
}
