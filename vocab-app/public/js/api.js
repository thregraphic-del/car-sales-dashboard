// Thin JSON client for the LexiTube API.
async function request(method, url, body) {
  let res;
  try {
    res = await fetch(url, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw Object.assign(new Error('تعذّر الاتصال بالخادم. تأكد أن التطبيق يعمل ثم حاول مرة أخرى.'), { status: 0 });
  }
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* empty body */
  }
  if (!res.ok) {
    const err = new Error(data?.error || 'حدث خطأ. حاول مرة أخرى.');
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export const qs = (params = {}) => {
  const p = Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '' && v !== false);
  return p.length ? `?${new URLSearchParams(p)}` : '';
};

export const api = {
  config: () => request('GET', '/api/config'),
  updateMe: (patch) => request('PATCH', '/api/me', patch),
  today: () => request('GET', '/api/today'),
  extendToday: (count) => request('POST', '/api/today/extend', { count }),
  stats: () => request('GET', '/api/stats'),

  analyzeYoutube: (body) => request('POST', '/api/sources/youtube', body),
  analyzeText: (text, title) => request('POST', '/api/sources/text', { text, title }),
  sources: () => request('GET', '/api/sources'),
  source: (id) => request('GET', `/api/sources/${id}`),
  deleteSource: (id) => request('DELETE', `/api/sources/${id}`),
  translation: (id) => request('GET', `/api/sources/${id}/translation`),
  startTranslation: (id) => request('POST', `/api/sources/${id}/translation`),

  lookup: (params) => request('GET', `/api/lookup${qs(params)}`),
  saveWord: (vocabulary_id, occurrence_id, group_ids) => request('POST', '/api/words', { vocabulary_id, occurrence_id, group_ids }),
  dismissWord: (vocabulary_id) => request('POST', '/api/words/dismiss', { vocabulary_id }),
  resetWord: (vocabulary_id) => request('POST', '/api/words/reset', { vocabulary_id }),
  words: (filters) => request('GET', `/api/words${qs(filters)}`),
  word: (id) => request('GET', `/api/words/${id}`),
  updateWord: (id, patch) => request('PATCH', `/api/words/${id}`, patch),
  setWordGroups: (id, group_ids) => request('PUT', `/api/words/${id}/groups`, { group_ids }),
  deleteWord: (id) => request('DELETE', `/api/words/${id}`),
  deleteWords: (uv_ids) => request('POST', '/api/words/delete', { uv_ids }),
  removeFromGroup: (id, uv_ids) => request('DELETE', `/api/groups/${id}/words`, { uv_ids }),

  importPreview: (text) => request('POST', '/api/import/preview', { text }),
  importSave: (items, group_ids) => request('POST', '/api/import/save', { items, group_ids }),

  groups: () => request('GET', '/api/groups'),
  createGroup: (name) => request('POST', '/api/groups', { name }),
  renameGroup: (id, name) => request('PATCH', `/api/groups/${id}`, { name }),
  deleteGroup: (id) => request('DELETE', `/api/groups/${id}`),
  addToGroup: (id, uv_ids) => request('POST', `/api/groups/${id}/words`, { uv_ids }),

  practice: (params) => request('GET', `/api/practice${qs(params)}`),
  review: (uv_id, grade, source) => request('POST', '/api/review', { uv_id, grade, source }),

  exportUrl: (params) => `/api/export${qs(params)}`,
  resetDemo: () => request('POST', '/api/admin/reset-demo'),
};
