// Thin JSON client for the LexiTube API. All pages share this single backend.
async function request(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* empty body */
  }
  if (!res.ok) {
    const err = new Error(data?.error || `Request failed (${res.status})`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

const qs = (params = {}) => {
  const p = Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '');
  return p.length ? `?${new URLSearchParams(p)}` : '';
};

export const api = {
  config: () => request('GET', '/api/config'),
  updateMe: (patch) => request('PATCH', '/api/me', patch),
  stats: () => request('GET', '/api/stats'),
  progress: (days) => request('GET', `/api/progress${qs({ days })}`),
  analyze: (body) => request('POST', '/api/analyze', body),
  videos: () => request('GET', '/api/videos'),
  video: (id) => request('GET', `/api/videos/${id}`),
  saveItem: (vvId) => request('POST', `/api/items/${vvId}/save`),
  dismissItem: (vvId) => request('POST', `/api/items/${vvId}/dismiss`),
  resetItem: (vvId) => request('POST', `/api/items/${vvId}/reset`),
  words: (filters) => request('GET', `/api/words${qs(filters)}`),
  word: (id) => request('GET', `/api/words/${id}`),
  deleteWord: (id) => request('DELETE', `/api/words/${id}`),
  topics: () => request('GET', '/api/topics'),
  review: (uv_id, grade, source) => request('POST', '/api/review', { uv_id, grade, source }),
  today: () => request('GET', '/api/today'),
  extendToday: (count) => request('POST', '/api/today/extend', { count }),
  gamePool: (scope, campaign_id) => request('GET', `/api/games/pool${qs({ scope, campaign_id })}`),
  campaigns: () => request('GET', '/api/campaigns'),
  campaign: (id) => request('GET', `/api/campaigns/${id}`),
  createCampaign: (body) => request('POST', '/api/campaigns', body),
  deleteCampaign: (id) => request('DELETE', `/api/campaigns/${id}`),
  resetDemo: () => request('POST', '/api/admin/reset-demo'),
};
