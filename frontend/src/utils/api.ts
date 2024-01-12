import { currentLang, type Locale } from './i18n';

const API_BASE = '/api';

function withLang(url: string, lang?: Locale): string {
  const locale = lang ?? currentLang();
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}lang=${locale}`;
}

export async function fetchPosts(type?: string, limit?: number, lang?: Locale) {
  const params = new URLSearchParams();
  if (type) params.set('type', type);
  if (limit) params.set('limit', String(limit));
  const res = await fetch(withLang(`${API_BASE}/posts?${params}`, lang));
  return res.json();
}

export async function fetchGuides(lang?: Locale) {
  const res = await fetch(withLang(`${API_BASE}/guides`, lang));
  return res.json();
}

export async function fetchCourseModules(lang?: Locale) {
  const res = await fetch(withLang(`${API_BASE}/course/modules`, lang));
  return res.json();
}
