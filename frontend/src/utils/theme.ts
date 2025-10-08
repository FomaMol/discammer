import { useSyncExternalStore } from 'react';
export type Theme = 'soft-red' | 'graphite-silver';
export const THEME_KEY = 'discammer.theme.v1';
export const normalizeTheme = (value: unknown): Theme => value === 'graphite-silver' ? value : 'soft-red';
export function currentTheme(): Theme { return normalizeTheme(document.documentElement.dataset.theme); }
export function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'soft-red' ? '#151314' : '#101314');
  window.dispatchEvent(new Event('discammer:theme'));
}
export function setTheme(theme: Theme) {
  applyTheme(theme);
  try { localStorage.setItem(THEME_KEY, theme); } catch { /* Keep the in-page choice. */ }
}
function subscribe(callback: () => void) {
  const storage = (event: StorageEvent) => {
    if (event.key === THEME_KEY || event.key === null) applyTheme(normalizeTheme(event.newValue));
  };
  window.addEventListener('discammer:theme', callback);
  window.addEventListener('storage', storage);
  return () => { window.removeEventListener('discammer:theme', callback); window.removeEventListener('storage', storage); };
}
export function useTheme() { return useSyncExternalStore(subscribe, currentTheme, () => 'soft-red' as Theme); }
/** Canvas exports need resolved colors, CSS variable strings are not canvas colors. */
export function themeColor(role: string) { return getComputedStyle(document.documentElement).getPropertyValue(`--${role}`).trim(); }
