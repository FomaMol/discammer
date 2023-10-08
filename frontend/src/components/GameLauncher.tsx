import { useCallback, useEffect, useState } from 'react';

interface GameLauncherProps {
  src?: string;
  label?: string;
}

export default function GameLauncher({
  src = '/play/',
  label = '\u25B6 START GAME',
}: GameLauncherProps) {
  const [open, setOpen] = useState(false);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);

    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, close]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-block px-8 py-4 font-['JetBrains_Mono'] uppercase text-lg tracking-wider bg-transparent border border-[#39FF6B] text-[#39FF6B] hover:shadow-[0_0_25px_rgba(57,255,107,0.25)] transition-all duration-300 cursor-pointer"
      >
        {label}
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Cyber Watch"
          className="fixed inset-0 z-[100] bg-black/95 flex flex-col"
        >
          <div className="flex items-center justify-between px-4 md:px-6 py-3 border-b border-[#1E2A42] bg-[#0B0E17]">
            <span className="font-['Press_Start_2P'] text-[#39FF6B] text-xs md:text-sm glow-green tracking-widest">
              CYBER WATCH
            </span>
            <button
              type="button"
              onClick={close}
              aria-label="Close game"
              className="font-['JetBrains_Mono'] uppercase text-xs md:text-sm tracking-[2px] text-[#8892A8] hover:text-[#FF4757] transition-colors px-3 py-1 border border-[#1E2A42] hover:border-[#FF4757] cursor-pointer"
            >
              [ESC] CLOSE
            </button>
          </div>
          <div className="flex-1 relative bg-black">
            <iframe
              src={src}
              title="Cyber Watch"
              className="absolute inset-0 w-full h-full border-0"
              allow="autoplay; fullscreen; gamepad; pointer-lock"
            />
          </div>
        </div>
      )}
    </>
  );
}
