import { noteAnswer } from './goal.js';
// A word is tidied (multi-word pieces → their one word, simplest form) right AFTER it is saved, once — so nothing has to be
// re-checked later when «كلماتي» is opened. One quiet run a few seconds after the last save (several saves = one run).
let tidyTimer = 0;
let tidyBusy = false;
async function tidyNow() {
  if (tidyBusy) return;
  tidyBusy = true;
  try {
    for (let i = 0; i < 8; i += 1) {
      const r = await request('POST', '/api/words/tidy', {});
      if (r.done || r.skipped) break;
      await new Promise((res) => setTimeout(res, 1200));
    }
    for (let i = 0; i < 4; i += 1) {
      const r = await request('POST', '/api/words/simplify', {});
      if (r.done) break;
    }
  } catch { /* the next save (or the weekly check) will do it */ } finally { tidyBusy = false; }
}
// After a save the words are tidied at once (compound pieces → their one word, every word in its simplest form).
// A group save waits for it, so the list the learner sees next is already tidy; a single word is tidied ~1s later.
const afterSave = (p, { wait = false } = {}) => p.then(async (r) => {
  clearTimeout(tidyTimer);
  if (wait) { try { await tidyNow(); } catch { /* the next save will do it */ } } else tidyTimer = setTimeout(tidyNow, 1000);
  return r;
});

// ⚡ Moving between pages must feel instant: the two big lists (the words, the groups) are kept for this visit.
// Fresh (under 20 s) → straight from memory; older (under 10 min) → shown at once and refreshed quietly for next time;
// any change (save, answer, edit…) throws the copy away so nothing is ever stale after you changed it yourself.
const LISTS = new Map(); // url → { t, data, p }
let gen = 0; // bumps on every change: an answer that was already on its way is not kept
const FRESH_MS = 20000;
const STALE_MS = 600000;
const isList = (method, url) => method === 'GET' && (url === '/api/words' || url === '/api/groups');
function listRequest(url) {
  const hit = LISTS.get(url);
  const load = () => {
    const g = gen;
    const p = rawRequest('GET', url).then((data) => { if (g === gen) LISTS.set(url, { t: Date.now(), data, p: null }); return data; }, (err) => { if (g === gen) LISTS.delete(url); throw err; });
    LISTS.set(url, { ...(LISTS.get(url) || {}), p });
    return p;
  };
  if (hit?.p) return hit.data ? Promise.resolve([...hit.data]) : hit.p.then((d) => [...d]); // already on its way
  if (hit?.data) {
    const age = Date.now() - hit.t;
    if (age < FRESH_MS) return Promise.resolve([...hit.data]);
    if (age < STALE_MS) { load().catch(() => {}); return Promise.resolve([...hit.data]); }
  }
  return load().then((d) => [...d]);
}
/** Start loading a list now (a tap on its page is coming) — nothing is asked twice. */
export const warm = (url) => { if (isList('GET', url) && !LISTS.get(url)?.p) listRequest(url).catch(() => {}); };

async function request(method, url, body, retried = false) {
  if (isList(method, url)) return listRequest(url);
  // the quiet tidy-up calls change nothing most of the time: only a real change throws the copies away
  if (/^\/api\/words\/(tidy|simplify)$|^\/api\/levels$/.test(url)) {
    const r = await rawRequest(method, url, body, retried);
    if (r?.changed || r?.levelled || r?.simplified) { LISTS.clear(); gen += 1; }
    return r;
  }
  if (method !== 'GET' && !/^\/api\/(channels|social|notes|feedback|team|streak|me|ai\/(say|examples))(\/|$)/.test(url)) { LISTS.clear(); gen += 1; } // these never change the words or groups
  return rawRequest(method, url, body, retried);
}

// Thin JSON client for the LexiTube API.
async function rawRequest(method, url, body, retried = false) {
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
      return rawRequest(method, url, body, true);
    }
    throw Object.assign(new Error('ما قدرنا نتصل بالخادم. تأكد أن التطبيق يعمل ثم حاول مرة ثانية.'), { status: 0 });
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
  // 👤 a guest reached the free trial: the app shows a kind «سجّل» card
  if (res.status === 403 && data?.code === 'guest_limit') window.dispatchEvent(new CustomEvent('lexitube:guest-limit', { detail: data.error }));
  if (!res.ok) {
    const err = new Error(data?.error || 'صار خطأ. حاول مرة ثانية.');
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
  tourSeen: (tour) => request('POST', '/api/me/tours', { tour }),
  updateMe: (patch) => request('PATCH', '/api/me', patch),
  today: () => request('GET', '/api/today'),
  rescueStreak: (doubled = false) => request('POST', '/api/streak/rescue', doubled ? { doubled: true } : {}),
  extendToday: (count) => request('POST', '/api/today/extend', { count }),
  stats: () => request('GET', '/api/stats'),

  analyzeYoutube: (body) => request('POST', '/api/sources/youtube', body),
  analyzeArticle: (url) => request('POST', '/api/sources/article', { url }),
  analyzeText: (text, title) => request('POST', '/api/sources/text', { text, title }),
  sources: () => request('GET', '/api/sources'),
  source: (id) => request('GET', `/api/sources/${id}`),
  saveProgress: (id, seconds, keepalive = false) => fetch(`/api/sources/${id}/progress`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ seconds }), keepalive }).catch(() => {}),
  deleteSource: (id) => request('DELETE', `/api/sources/${id}`),
  translation: (id) => request('GET', `/api/sources/${id}/translation`),
  summary: (id) => request('POST', `/api/sources/${id}/summary`),
  grammar: () => request('GET', '/api/grammar'),
  grammarSave: (b) => request('POST', '/api/grammar/examples', b),
  grammarSeen: (sub) => request('POST', '/api/grammar/seen', { sub }),
  grammarStatus: (sub, status) => request('PUT', '/api/grammar/status', { sub, status }),
  grammarDrop: (sub, id) => request('DELETE', '/api/grammar/examples', { sub, id }),
  grammarDetect: (lines) => request('POST', '/api/grammar/detect', { lines }),
  notes: () => request('GET', '/api/notes'),
  keepNote: (source_id, summary) => request('POST', '/api/notes', { source_id, summary }),
  editNote: (source_id, note, refs) => request('PUT', `/api/notes/${source_id}`, { note, refs }),
  keepGpt: (source_id, text) => request('PUT', `/api/notes/${source_id}/gpt`, { text }),
  dropNote: (source_id) => request('DELETE', `/api/notes/${source_id}`),
  keepClip: (source_id, t, en, ar) => request('POST', '/api/notes/clip', { source_id, t, en, ar }),
  dropClip: (source_id, t, en) => request('DELETE', `/api/notes/${source_id}/clip`, { t, en }),
  recap: (id, from, to) => request('POST', `/api/sources/${id}/recap`, { from, to }),
  repairTranslation: (id) => request('POST', `/api/sources/${id}/repair-translation`, {}),
  dictionaryWords: (id) => request('POST', `/api/sources/${id}/dictionary-words`),
  alignStep: (id, from, skip = 0) => request('POST', `/api/sources/${id}/align`, { from, skip }),
  translateStep: (id) => request('POST', `/api/sources/${id}/translation`),
  refineStep: (id) => request('POST', `/api/sources/${id}/refine`),

  lookup: (params) => request('GET', `/api/lookup${qs(params)}`),
  saveWord: (vocabulary_id, occurrence_id, group_ids, bulk = false) => afterSave(request('POST', '/api/words', { vocabulary_id, occurrence_id, group_ids, bulk })),
  saveWordsBulk: (items) => afterSave(request('POST', '/api/words/bulk', { items }), { wait: true }),
  ensureLevels: (sourceId) => request('POST', '/api/levels', sourceId ? { source_id: sourceId } : {}),
  simplifyWords: () => request('POST', '/api/words/simplify', {}),
  tidyWords: () => request('POST', '/api/words/tidy', {}),
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
  importSave: (items, group_ids) => afterSave(request('POST', '/api/import/save', { items, group_ids }), { wait: true }),

  groups: () => request('GET', '/api/groups'),
  createGroup: (name) => request('POST', '/api/groups', { name }),
  renameGroup: (id, name) => request('PATCH', `/api/groups/${id}`, { name }),
  deleteGroup: (id) => request('DELETE', `/api/groups/${id}`),
  addToGroup: (id, uv_ids) => request('POST', `/api/groups/${id}/words`, { uv_ids }),

  practice: (params) => request('GET', `/api/practice${qs(params)}`),
  // Words practised from a video before saving them have a negative id: not recorded.
  review: (uv_id, grade, source) => { noteAnswer(); return Number(uv_id) > 0 ? request('POST', '/api/review', { uv_id, grade, source }) : Promise.resolve({ skipped: true }); },

  exportUrl: (params) => `/api/export${qs(params)}`,

  authStatus: () => request('GET', '/api/auth/status'),
  guest: () => request('POST', '/api/auth/guest'),
  login: (username, password) => request('POST', '/api/auth/login', { username, password }),
  setup: (setup_code, username, password) => request('POST', '/api/auth/setup', { setup_code, username, password }),
  register: (body) => request('POST', '/api/auth/register', body),
  forgotPassword: (login) => request('POST', '/api/auth/forgot', { login }),
  resetPassword: (body) => request('POST', '/api/auth/reset', body),
  myEmail: () => request('GET', '/api/auth/email'),
  saveEmail: (email) => request('POST', '/api/auth/email', { email }),
  myPhone: () => request('GET', '/api/auth/phone'),
  savePhone: (phone) => request('POST', '/api/auth/phone', { phone }),
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
  siteFavs: () => request('GET', '/api/social/sitefavs'),
  saveSiteFavs: (favs) => request('POST', '/api/social/sitefavs', { favs }),
  myCard: () => request('GET', '/api/social/me'),
  saveMyCard: (body) => request('POST', '/api/social/me', body),
  friends: () => request('GET', '/api/social/friends'),
  addFriend: (login) => request('POST', '/api/social/friends', { login }), // username, email or phone number
  removeFriend: (id) => request('DELETE', `/api/social/friends/${id}`),
  challenges: () => request('GET', '/api/social/challenges'),
  challenge: (id) => request('GET', `/api/social/challenges/${id}`),
  newChallenge: (to) => request('POST', '/api/social/challenges', { to }),
  challengeScore: (id, score) => request('POST', `/api/social/challenges/${id}/score`, { score }),
  shareLink: () => request('POST', '/api/social/share'),
  shared: (token) => request('GET', `/api/social/share/${token}`),
  credits: () => request('GET', '/api/credits'),
  saveCredits: (body) => request('POST', '/api/credits', body),
  saveTwins: (groups) => request('POST', '/api/twins/save', { groups }),
  changeUsername: (username) => request('POST', '/api/auth/username', { username }),
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
  myMonth: () => request('GET', '/api/ai/my-month'),
  setPaid: (patch) => request('POST', '/api/paid', patch),
  clipCosts: () => request('GET', '/api/ai/clip-costs'),
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
  teamMe: () => request('GET', '/api/team/me'),
  teamJoin: (body) => request('POST', '/api/team/join', body),
  teamPayout: () => request('POST', '/api/team/payout'),
  teamAck: () => request('POST', '/api/team/ack'),
};
