import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { currentLang, makeTranslator, type Locale } from '../utils/i18n';

interface MobileMenuProps {
  links: Array<{ label: string; href: string }>;
  switchHref?: string;
  /** Legacy combined label like "EN / RU" — kept for backwards compatibility but no longer rendered. */
  switchLabel?: string;
  /** Current locale short label, e.g. "EN" or "RU" — rendered as the bordered cyan chip. */
  currentLangShort?: string;
  /** Other locale short label, e.g. "RU" or "EN" — rendered after the arrow. */
  otherLangShort?: string;
  /** Aria-label for the language switch row, sourced from `lang.switch_to`. */
  switchAriaLabel?: string;
  lang?: Locale;
}

const BUNDLES = {
  en: {
    open_menu: 'Open menu',
    close_menu: 'Close menu',
    nav_header: '// Navigation',
    footer_note: '> DiSCAMMER v1.0 // ANTI-SCAM TERMINAL',
    nav_aria: 'Site navigation',
  },
  ru: {
    open_menu: 'Открыть меню',
    close_menu: 'Закрыть меню',
    nav_header: '// Навигация',
    footer_note: '> DiSCAMMER v1.0 // АНТИ-МОШЕННИЧЕСКИЙ ТЕРМИНАЛ',
    nav_aria: 'Навигация сайта',
  },
} as const;

export default function MobileMenu({
  links,
  switchHref,
  switchLabel,
  currentLangShort,
  otherLangShort,
  switchAriaLabel,
  lang,
}: MobileMenuProps) {
  const locale = currentLang(lang);
  const tr = makeTranslator(locale, BUNDLES);
  const openLabel = tr('open_menu');
  const closeLabel = tr('close_menu');
  const navHeader = tr('nav_header');
  const footerNote = tr('footer_note');
  const navAria = tr('nav_aria');

  // Resolve current/other short labels — fall back to splitting the legacy
  // "EN / RU" switchLabel string so older mounts keep rendering something.
  const legacyParts = (switchLabel || '').split('/').map((s) => s.trim());
  const chipCurrent = currentLangShort || legacyParts[0] || locale.toUpperCase();
  const chipOther =
    otherLangShort || legacyParts[1] || (locale === 'ru' ? 'EN' : 'RU');

  const path = typeof window !== 'undefined' ? window.location.pathname : '';

  const [isOpen, setIsOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const firstLink = panelRef.current?.querySelector<HTMLElement>('a, button');
    firstLink?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setIsOpen(false);
        buttonRef.current?.focus();
        return;
      }
      if (e.key !== 'Tab' || !panelRef.current) return;

      const focusables = panelRef.current.querySelectorAll<HTMLElement>(
        'a, button, [tabindex]:not([tabindex="-1"])'
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement | null;

      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isOpen]);

  return (
    <>
      {/* Hamburger button */}
      <button
        ref={buttonRef}
        onClick={() => setIsOpen(!isOpen)}
        className="relative z-50 w-10 h-10 flex flex-col items-center justify-center gap-1.5 md:hidden"
        aria-label={isOpen ? closeLabel : openLabel}
        aria-expanded={isOpen}
        aria-controls={panelId}
      >
        <span
          className={`block w-6 h-0.5 bg-accent-cyan transition-all duration-300 motion-reduce:transition-none ${
            isOpen ? 'rotate-45 translate-y-2' : ''
          }`}
        />
        <span
          className={`block w-6 h-0.5 bg-accent-cyan transition-all duration-300 motion-reduce:transition-none ${
            isOpen ? 'opacity-0' : ''
          }`}
        />
        <span
          className={`block w-6 h-0.5 bg-accent-cyan transition-all duration-300 motion-reduce:transition-none ${
            isOpen ? '-rotate-45 -translate-y-2' : ''
          }`}
        />
      </button>

      {/* Overlay menu — portaled to body so it escapes the navbar's
          backdrop-filter containing block. */}
      {typeof document !== 'undefined' &&
        createPortal(
          <div
            id={panelId}
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label={navAria}
            aria-hidden={!isOpen}
            className={`fixed inset-0 z-40 bg-bg-primary/98 transition-transform duration-300 ease-out motion-reduce:transition-none md:hidden ${
              isOpen ? 'translate-y-0' : '-translate-y-full pointer-events-none'
            }`}
          >
            {/* Scanlines */}
            <div className="scanline-overlay" />

            {/* Menu content */}
            <nav className="relative z-10 flex flex-col items-start justify-center h-full px-6 sm:px-8 pt-28 sm:pt-32 pb-16 sm:pb-20 overflow-y-auto">
              <div
                className="text-xs text-text-muted mb-8 uppercase tracking-[0.3em]"
                style={{ fontFamily: '"JetBrains Mono", monospace' }}
              >
                {navHeader}
              </div>

              {links.map((link, i) => {
                const isActive =
                  path === link.href || path.startsWith(link.href + '/');
                return (
                  <a
                    key={link.href}
                    href={link.href}
                    tabIndex={isOpen ? 0 : -1}
                    aria-current={isActive ? 'page' : undefined}
                    onClick={() => setIsOpen(false)}
                    className="group flex items-center gap-4 py-3 w-full"
                    style={{
                      animation: isOpen
                        ? `glitch 0.1s linear ${i * 0.05}s 1`
                        : undefined,
                    }}
                  >
                    <span
                      className="text-text-muted text-xs"
                      style={{ fontFamily: '"JetBrains Mono", monospace' }}
                    >
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <span
                      className={`${
                        isActive ? 'text-accent-cyan' : 'text-text-primary'
                      } text-xl group-hover:text-accent-cyan group-hover:glow-cyan transition-colors duration-200`}
                      style={{ fontFamily: '"JetBrains Mono", monospace' }}
                    >
                      &gt; {link.label}
                    </span>
                    <span className="text-accent-cyan text-xs opacity-0 group-hover:opacity-100 transition-opacity ml-auto">
                      [ENTER]
                    </span>
                  </a>
                );
              })}

              {/* Language switch — chip-arrow-target treatment to match desktop nav.
                  Current locale is the bordered cyan chip; arrow → muted target. */}
              {switchHref && (
                <a
                  href={switchHref}
                  tabIndex={isOpen ? 0 : -1}
                  aria-label={switchAriaLabel || `${chipCurrent} → ${chipOther}`}
                  rel="alternate"
                  className="group flex items-center gap-4 py-3 w-full mt-4 border-t border-border-default pt-6"
                >
                  <span
                    className="text-text-muted text-xs"
                    style={{ fontFamily: '"JetBrains Mono", monospace' }}
                  >
                    {String(links.length + 1).padStart(2, '0')}
                  </span>
                  <span className="inline-flex items-center gap-2">
                    <span
                      className="inline-flex items-center justify-center h-7 px-2 text-accent-cyan font-mono text-xs font-bold tracking-[0.14em] rounded-sm tabular-nums border"
                      style={{
                        backgroundColor: 'rgba(101,222,240,0.08)',
                        borderColor: '#3a8b9a',
                        minWidth: '1.875rem',
                        fontFamily: '"JetBrains Mono", monospace',
                      }}
                    >
                      {chipCurrent}
                    </span>
                    <span
                      className="font-mono text-text-faint text-sm"
                      aria-hidden="true"
                      style={{ fontFamily: '"JetBrains Mono", monospace' }}
                    >
                      &rarr;
                    </span>
                    <span
                      className="font-mono text-text-muted text-xs font-semibold tracking-[0.14em] group-hover:text-accent-cyan transition-colors"
                      style={{ fontFamily: '"JetBrains Mono", monospace' }}
                    >
                      {chipOther}
                    </span>
                  </span>
                  <span className="text-accent-cyan text-xs opacity-0 group-hover:opacity-100 transition-opacity ml-auto">
                    [ENTER]
                  </span>
                </a>
              )}

              {/* Decorative footer */}
              <div className="mt-auto pt-8 border-t border-border-default w-full">
                <p
                  className="text-text-muted text-[10px] tracking-wider"
                  style={{ fontFamily: '"JetBrains Mono", monospace' }}
                >
                  {footerNote}
                </p>
              </div>
            </nav>
          </div>,
          document.body,
        )}
    </>
  );
}
