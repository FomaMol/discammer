import { useEffect, useId, useRef, useState } from 'react';
import { makeTranslator } from '../utils/i18n';
import { setTheme, useTheme, type Theme } from '../utils/theme';
export default function ThemeSwitcher({ inline = false, initialOpen = false, focusTrigger = false }: { inline?: boolean; initialOpen?: boolean; focusTrigger?: boolean }) {
  const theme = useTheme();
  const tr = makeTranslator('theme');
  const [open, setOpen] = useState(initialOpen);
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (focusTrigger && !initialOpen) trigger.current?.focus(); }, []);
  useEffect(() => {
    if (!open) return;
    if (!inline) root.current?.querySelector<HTMLInputElement>('input:checked')?.focus();
    const outside = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open, inline]);
  return <div ref={root} className={`theme-switcher ${inline ? 'theme-inline' : ''}`} onKeyDown={e => {
    if (e.key === 'Escape' && open) { e.preventDefault(); e.stopPropagation(); setOpen(false); trigger.current?.focus(); }
  }} onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false); }}>
    <button ref={trigger} type="button" aria-label={tr('label')} title={tr('label')} aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)} className="theme-trigger">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M12 4v16M12 4a8 8 0 0 1 0 16" fill="currentColor"/></svg>
      {inline ? tr('label') : <span className="theme-tooltip">{tr('label')}</span>}
    </button>
    {open && <fieldset id={id} className="theme-options"><legend className="sr-only">{tr('label')}</legend>
      {(['soft-red', 'graphite-silver'] as Theme[]).map(value => <label key={value} className="theme-option">
        <input type="radio" name={id} value={value} checked={theme === value} onChange={() => setTheme(value)}/>
        <span>{value === 'soft-red' ? tr('soft_red') : tr('graphite_silver')}</span>
      </label>)}
    </fieldset>}
  </div>;
}
