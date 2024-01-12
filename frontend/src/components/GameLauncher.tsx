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
        className="inline-block px-8 py-4 font-['JetBrains_Mono'] uppercase text-lg tracking-wider bg-transparent border border-[#39FF6B] text-[#39FF6B] hover:shadow-[0_0_25px_rgba(57,255,107,0.25)] transition-all duration-300 cursor-pointer"
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
          <div className="flex items-center justify-between px-4 md:px-6 py-3 border-b border-[#1E2A42] bg-[#0B0E17]">
            <span className="font-['Press_Start_2P'] text-[#39FF6B] text-xs md:text-sm glow-green tracking-widest">
              ANTIFRAUD HERO
            </span>
            <button
              ref={closeRef}
              type="button"
              onClick={close}
              aria-label={resolvedCloseAria}
              className="font-['JetBrains_Mono'] uppercase text-xs md:text-sm tracking-[2px] text-[#8892A8] hover:text-[#FF4757] focus:text-[#FF4757] transition-colors px-3 py-1 border border-[#1E2A42] hover:border-[#FF4757] focus:border-[#FF4757] focus:outline-none cursor-pointer"
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
