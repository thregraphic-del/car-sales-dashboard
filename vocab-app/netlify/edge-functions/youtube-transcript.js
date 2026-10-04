// YouTube transcript fetch on Netlify's edge network.
//
// YouTube often answers requests from cloud servers (where the API function
// runs) with "Sign in to confirm you're not a bot". Edge functions run on a
// different network, so the API asks here first. Only the API may call this
// endpoint: it must send the shared INTERNAL_API_KEY (a server-side variable).
import { getVideoWithTranscript, parseYoutubeId } from '../../server/lib/youtube.js';

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
});

export default async (req) => {
  const key = globalThis.Netlify?.env?.get('INTERNAL_API_KEY');
  if (!key || req.headers.get('x-lexitube-key') !== key) return json({ error: 'forbidden' }, 403);
  const url = new URL(req.url);
  const videoId = parseYoutubeId(url.searchParams.get('v'));
  if (!videoId) return json({ error: 'invalid id' }, 400);
  const budgetMs = Math.min(30000, Number(url.searchParams.get('budget')) || 25000);
  try {
    const r = await getVideoWithTranscript(videoId, { budgetMs, timeoutMs: 8000, skip: ['external'] });
    return json({ ok: true, ...r });
  } catch (err) {
    return json({ ok: false, code: err.code || 'fetch_failed', details: err.details || [String(err.message).slice(0, 200)], meta: err.meta || null });
  }
};

export const config = { path: '/internal/youtube-transcript', cache: 'manual' };
