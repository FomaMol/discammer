import { currentLang, type Locale } from './i18n';

const API_BASE = '/api';

function withLang(url: string, lang?: Locale): string {
  const locale = lang ?? currentLang();
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}lang=${locale}`;
}

/**
 * Wrap fetch so non-2xx responses throw before we ever call `.json()`.
 * Callers can distinguish "request failed" from "response body wasn't JSON"
 * by inspecting the thrown Error message (`HTTP <status>` vs the SyntaxError
 * a stray HTML body would produce inside `.json()`).
 *
 * Returns `any` because the existing callers shape the payload at the call
 * site (e.g. `Array.isArray(data) ? data : data?.modules ?? []`). Tightening
 * this to `unknown` would require touching every consumer, which is out of
 * scope for this fix.
 */
async function fetchJson(url: string): Promise<any> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  return res.json();
}

export async function fetchPosts(type?: string, limit?: number, lang?: Locale) {
  const params = new URLSearchParams();
  if (type) params.set('type', type);
  if (limit) params.set('limit', String(limit));
  return fetchJson(withLang(`${API_BASE}/posts?${params}`, lang));
}

export async function fetchGuides(lang?: Locale) {
  return fetchJson(withLang(`${API_BASE}/guides`, lang));
}

export async function fetchCourseModules(lang?: Locale) {
  return fetchJson(withLang(`${API_BASE}/course/modules`, lang));
}
