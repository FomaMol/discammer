import { useEffect, useState } from 'react';

type GlitchSize = 'sm' | 'md' | 'lg' | 'xl';

interface GlitchTextProps {
  text: string;
  size?: GlitchSize;
}

const SIZE_CLASSES: Record<GlitchSize, string> = {
  sm: 'text-base md:text-lg',
  md: 'text-xl md:text-2xl',
  lg: 'text-2xl md:text-3xl',
  xl: 'text-4xl md:text-6xl lg:text-7xl',
};

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
  );
}

export default function GlitchText({ text, size = 'xl' }: GlitchTextProps) {
  const [isGlitching, setIsGlitching] = useState(() => !prefersReducedMotion());

  useEffect(() => {
    if (!isGlitching) return;
    const timer = setTimeout(() => setIsGlitching(false), 1200);
    return () => clearTimeout(timer);
  }, [isGlitching]);

  const sizeClass = SIZE_CLASSES[size];

  return (
    <span
      className={`relative inline-block text-accent-cyan glow-cyan ${sizeClass}`}
      style={{ fontFamily: '"JetBrains Mono", monospace', lineHeight: 1.1 }}
    >
      <span className="relative z-[1]">{text}</span>
      {isGlitching && (
        <>
          <span
            aria-hidden="true"
            className={`absolute top-0 left-0 text-accent-red opacity-70 ${sizeClass}`}
            style={{
              clipPath: 'polygon(0 0, 100% 0, 100% 45%, 0 45%)',
              animation: 'glitch 0.3s linear 4',
              fontFamily: '"JetBrains Mono", monospace',
              lineHeight: 1.1,
            }}
          >
            {text}
          </span>
          <span
            aria-hidden="true"
            className={`absolute top-0 left-0 text-accent-green opacity-70 ${sizeClass}`}
            style={{
              clipPath: 'polygon(0 55%, 100% 55%, 100% 100%, 0 100%)',
              animation: 'glitch 0.3s linear 4 reverse',
              fontFamily: '"JetBrains Mono", monospace',
              lineHeight: 1.1,
            }}
          >
            {text}
          </span>
        </>
      )}
    </span>
  );
}
