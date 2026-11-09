// Thin JSON client for the LexiTube API.
async function request(method, url, body, retried = false) {
  let res;
  try {
    res = await fetch(url, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    // a read that lost its connection is tried once more, quietly
    if (method === 'GET' && !retried) {
      await new Promise((r) => setTimeout(r, 1200));
      return request(method, url, body, true);
    }
    throw Object.assign(new Error('تعذّر الاتصال بالخادم. تأكد أن التطبيق يعمل ثم حاول مرة أخرى.'), { status: 0 });
  }
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* empty body */
  }
  if (res.status === 401 && data?.code === 'auth' && !url.startsWith('/api/auth/')) {
    // Session expired or signed out elsewhere: show the login screen.
    window.dispatchEvent(new CustomEvent('lexitube:auth'));
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
  saveProgress: (id, seconds, keepalive = false) => fetch(`/api/sources/${id}/progress`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ seconds }), keepalive }).catch(() => {}),
  deleteSource: (id) => request('DELETE', `/api/sources/${id}`),
  translation: (id) => request('GET', `/api/sources/${id}/translation`),
  summary: (id) => request('POST', `/api/sources/${id}/summary`),
  recap: (id, from, to) => request('POST', `/api/sources/${id}/recap`, { from, to }),
  repairTranslation: (id) => request('POST', `/api/sources/${id}/repair-translation`, {}),
  dictionaryWords: (id) => request('POST', `/api/sources/${id}/dictionary-words`),
  alignStep: (id, from, skip = 0) => request('POST', `/api/sources/${id}/align`, { from, skip }),
  translateStep: (id) => request('POST', `/api/sources/${id}/translation`),
  refineStep: (id) => request('POST', `/api/sources/${id}/refine`),

  lookup: (params) => request('GET', `/api/lookup${qs(params)}`),
  saveWord: (vocabulary_id, occurrence_id, group_ids, bulk = false) => request('POST', '/api/words', { vocabulary_id, occurrence_id, group_ids, bulk }),
  saveWordsBulk: (items) => request('POST', '/api/words/bulk', { items }),
  ensureLevels: (sourceId) => request('POST', '/api/levels', sourceId ? { source_id: sourceId } : {}),
  simplifyWords: () => request('POST', '/api/words/simplify', {}),
  wordClusters: () => request('GET', '/api/words/clusters'),
  ladder: (term, arabic) => request('POST', '/api/ai/ladder', { term, arabic }),
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
  importEnrich: (items) => request('POST', '/api/import/enrich', { items }),
  importSave: (items, group_ids) => request('POST', '/api/import/save', { items, group_ids }),

  groups: () => request('GET', '/api/groups'),
  createGroup: (name) => request('POST', '/api/groups', { name }),
  renameGroup: (id, name) => request('PATCH', `/api/groups/${id}`, { name }),
  deleteGroup: (id) => request('DELETE', `/api/groups/${id}`),
  addToGroup: (id, uv_ids) => request('POST', `/api/groups/${id}/words`, { uv_ids }),

  practice: (params) => request('GET', `/api/practice${qs(params)}`),
  // Words practised from a video before saving them have a negative id: not recorded.
  review: (uv_id, grade, source) => (Number(uv_id) > 0 ? request('POST', '/api/review', { uv_id, grade, source }) : Promise.resolve({ skipped: true })),

  exportUrl: (params) => `/api/export${qs(params)}`,

  authStatus: () => request('GET', '/api/auth/status'),
  login: (username, password) => request('POST', '/api/auth/login', { username, password }),
  setup: (setup_code, username, password) => request('POST', '/api/auth/setup', { setup_code, username, password }),
  register: (body) => request('POST', '/api/auth/register', body),
  forgotPassword: (login) => request('POST', '/api/auth/forgot', { login }),
  resetPassword: (body) => request('POST', '/api/auth/reset', body),
  myEmail: () => request('GET', '/api/auth/email'),
  saveEmail: (email) => request('POST', '/api/auth/email', { email }),
  logout: () => request('POST', '/api/auth/logout'),
  indexStep: (id) => request('POST', `/api/sources/${id}/index-step`),
  retranslate: (id) => request('POST', `/api/sources/${id}/retranslate`),
  calendar: () => request('GET', '/api/calendar'),
  simpleExamples: (words) => request('POST', '/api/ai/examples', { words }),
  sayArabic: (terms) => request('POST', '/api/ai/say', { terms }),
  channelsMore: (body) => request('POST', '/api/channels/more', body),
  channelCheck: (handles) => request('POST', '/api/channels/check', { handles }),
  vidPrefs: () => request('GET', '/api/social/vidprefs'),
  saveVidPrefs: (prefs) => request('POST', '/api/social/vidprefs', { prefs }),
  myCard: () => request('GET', '/api/social/me'),
  saveMyCard: (body) => request('POST', '/api/social/me', body),
  friends: () => request('GET', '/api/social/friends'),
  addFriend: (username) => request('POST', '/api/social/friends', { username }),
  removeFriend: (id) => request('DELETE', `/api/social/friends/${id}`),
  challenges: () => request('GET', '/api/social/challenges'),
  challenge: (id) => request('GET', `/api/social/challenges/${id}`),
  newChallenge: (to) => request('POST', '/api/social/challenges', { to }),
  challengeScore: (id, score) => request('POST', `/api/social/challenges/${id}/score`, { score }),
  shareLink: () => request('POST', '/api/social/share'),
  shared: (token) => request('GET', `/api/social/share/${token}`),
  credits: () => request('GET', '/api/credits'),
  saveCredits: (body) => request('POST', '/api/credits', body),
  changePassword: (current, password) => request('POST', '/api/auth/password', { current, password }),

  dataSummary: () => request('GET', '/api/data/summary'),
  wipeData: (scope) => request('POST', '/api/data/wipe', { scope, confirm: 'تأكيد' }),
  serverBackup: (id) => request('GET', `/api/data/backups/${id}`),
  backupUrl: () => '/api/data/backup',
  serverBackupUrl: (id) => `/api/data/backups/${id}`,
  importBegin: (profile) => request('POST', '/api/data/import/begin', { confirm: 'REPLACE', profile }),
  importRows: (table, rows) => request('POST', '/api/data/import/rows', { table, rows }),
  importFinish: () => request('POST', '/api/data/import/finish'),
  loadDemo: () => request('POST', '/api/data/demo'),
  aiStatus: () => request('GET', '/api/ai/status'),
  aiUsage: () => request('GET', '/api/ai/usage'),
  extractWords: (kind, data, name) => request('POST', '/api/ai/extract', { kind, data, name }),
  channels: () => request('GET', '/api/channels'),
  channelAction: (body) => request('POST', '/api/channels', body),
  similarChannels: () => request('POST', '/api/channels/similar', {}),
  channelVideos: (name, fresh) => request('POST', '/api/channels/videos', { name, fresh }),
  sendFeedback: (body) => request('POST', '/api/feedback', body),
  feedback: () => request('GET', '/api/feedback'),
  suggestWords: (body) => request('POST', '/api/ai/suggest-words', body),
  story: (opts = {}) => request('POST', '/api/ai/story', opts),
  suggestVideos: (duration, fresh) => request('GET', `/api/ai/suggest-videos${qs({ duration, fresh: fresh ? 1 : undefined })}`),
  synonyms: (word, meaning) => request('GET', `/api/ai/synonyms${qs({ word, meaning })}`),
  wordForms: (word) => request('GET', `/api/ai/forms${qs({ word })}`),
  explain: (text, line_id) => request('POST', '/api/ai/explain', { text, line_id }),
  resetDemo: () => request('POST', '/api/data/reset-demo'),
};
