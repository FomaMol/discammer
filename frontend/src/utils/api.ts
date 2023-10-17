const API_BASE = '/api';

export async function fetchPosts(type?: string, limit?: number) {
  const params = new URLSearchParams();
  if (type) params.set('type', type);
  if (limit) params.set('limit', String(limit));
  const res = await fetch(`${API_BASE}/posts?${params}`);
  return res.json();
}

export async function fetchGuides() {
  const res = await fetch(`${API_BASE}/guides`);
  return res.json();
}

export async function fetchCourseModules() {
  const res = await fetch(`${API_BASE}/course/modules`);
  return res.json();
}
