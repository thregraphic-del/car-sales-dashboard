// /api/youtube/search — search YouTube videos from inside the site (the key stays on the server; every search is saved for a week).
import { Router } from 'express';
import { wrap } from '../http.js';
import { httpError } from '../lib/errors.js';
import { get, run } from '../db/index.js';

const router = Router();
const WEEK = 7 * 24 * 3600 * 1000;
const clean = (s, n = 80) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, n);

export async function searchVideos(q, { page = '', fetcher = fetch, key = process.env.YOUTUBE_API_KEY } = {}) {
  if (!key) throw httpError(503, 'البحث في يوتيوب غير مفعّل بعد (ما انضاف المفتاح).');
  const cacheKey = `yt:${q.toLowerCase()}:${page}`;
  const row = await get('SELECT value FROM app_settings WHERE key = ?', cacheKey);
  if (row) { try { const c = JSON.parse(row.value); if (Date.now() - c.at < WEEK) return c.data; } catch { /* search again */ } }
  const u = new URL('https://www.googleapis.com/youtube/v3/search');
  u.search = new URLSearchParams({
    part: 'snippet', type: 'video', maxResults: '12', q, key,
    videoEmbeddable: 'true', videoCaption: 'closedCaption', relevanceLanguage: 'en', safeSearch: 'moderate', ...(page ? { pageToken: page } : {}),
  }).toString();
  const res = await fetcher(u);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const reason = body?.error?.errors?.[0]?.reason || '';
    if (reason === 'quotaExceeded' || reason === 'dailyLimitExceeded') throw httpError(429, 'انتهت حصة البحث اليوم — جرّب بكرة أو الصق رابط الفيديو.');
    throw httpError(502, 'ما قدرنا نبحث في يوتيوب الحين.');
  }
  const j = await res.json();
  const data = {
    next: j.nextPageToken || null,
    items: (j.items || []).filter((x) => x.id?.videoId).map((x) => ({
      id: x.id.videoId, title: clean(x.snippet?.title, 120), channel: clean(x.snippet?.channelTitle, 60),
      thumb: x.snippet?.thumbnails?.medium?.url || `https://i.ytimg.com/vi/${x.id.videoId}/mqdefault.jpg`, published: String(x.snippet?.publishedAt || '').slice(0, 10),
    })),
  };
  await run('INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value', cacheKey, JSON.stringify({ at: Date.now(), data }));
  return data;
}

router.get('/search', wrap(async (req) => {
  const q = clean(req.query.q, 80);
  if (q.length < 2) throw httpError(400, 'اكتب كلمة للبحث.');
  return searchVideos(q, { page: clean(req.query.page, 60) });
}));

export default router;
