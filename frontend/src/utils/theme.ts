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
  window.addEventListener('discammer:theme', callback);
  return () => { window.removeEventListener('discammer:theme', callback); };
}
export function useTheme() { return useSyncExternalStore(subscribe, currentTheme, () => 'soft-red' as Theme); }
