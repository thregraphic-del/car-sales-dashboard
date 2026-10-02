// YouTube metadata + transcript extraction (server-side, no API key needed).
//
// Strategy, in order:
//   1. InnerTube `player` endpoint (ANDROID client) → caption tracks → timed text
//   2. Watch-page HTML → ytInitialPlayerResponse → caption tracks → timed text
//   3. Optional external transcript service (TRANSCRIPT_API_URL) if configured
// If every strategy fails we throw a TranscriptError — the UI shows it honestly
// and offers to paste the transcript instead.

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36';

export class TranscriptError extends Error {
  constructor(message, code = 'transcript_unavailable') {
    super(message);
    this.code = code;
    this.status = 422;
  }
}

export function parseYoutubeId(input) {
  if (!input) return null;
  const s = String(input).trim();
  if (/^[\w-]{11}$/.test(s)) return s;
  let url;
  try {
    url = new URL(s.startsWith('http') ? s : `https://${s}`);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^www\.|^m\.|^music\./, '');
  if (host === 'youtu.be') return url.pathname.slice(1, 12) || null;
  if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    if (url.searchParams.get('v')) return url.searchParams.get('v').slice(0, 11);
    const m = url.pathname.match(/^\/(?:embed|shorts|live|v)\/([\w-]{11})/);
    if (m) return m[1];
  }
  return null;
}

async function fetchWithTimeout(url, opts = {}, ms = 15000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

async function innertubePlayer(videoId) {
  const res = await fetchWithTimeout('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'com.google.android.youtube/20.10.38 (Linux; U; Android 14) gzip',
    },
    body: JSON.stringify({
      videoId,
      context: { client: { clientName: 'ANDROID', clientVersion: '20.10.38', androidSdkVersion: 34, hl: 'en', gl: 'US' } },
    }),
  });
  if (!res.ok) throw new Error(`InnerTube player HTTP ${res.status}`);
  return res.json();
}

async function watchPagePlayer(videoId) {
  const res = await fetchWithTimeout(`https://www.youtube.com/watch?v=${videoId}&hl=en`, {
    headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9', Cookie: 'CONSENT=YES+1' },
  });
  if (!res.ok) throw new Error(`Watch page HTTP ${res.status}`);
  const html = await res.text();
  const m = html.match(/ytInitialPlayerResponse\s*=\s*(\{.+?\})\s*;\s*(?:var\s|<\/script>)/s);
  if (!m) throw new Error('Could not find player data on the watch page');
  return JSON.parse(m[1]);
}

async function oembed(videoId) {
  try {
    const res = await fetchWithTimeout(
      `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}`,
    );
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

function pickEnglishTrack(tracks) {
  if (!tracks?.length) return null;
  const en = tracks.filter((t) => (t.languageCode || '').toLowerCase().startsWith('en'));
  // Prefer human captions over auto-generated (kind === 'asr').
  return en.find((t) => t.kind !== 'asr') || en[0] || null;
}

function decodeEntities(s) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/<[^>]+>/g, '');
}

/** Fetch caption track and return [{start, dur, text}] in seconds. */
async function fetchTrack(baseUrl) {
  const url = new URL(baseUrl);
  url.searchParams.set('fmt', 'json3');
  const res = await fetchWithTimeout(url.toString(), { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`Caption HTTP ${res.status}`);
  const body = await res.text();
  if (!body.trim()) throw new Error('Caption track was empty');
  if (body.trim().startsWith('{')) {
    const data = JSON.parse(body);
    return (data.events || [])
      .filter((e) => e.segs)
      .map((e) => ({
        start: (e.tStartMs || 0) / 1000,
        dur: (e.dDurationMs || 0) / 1000,
        text: e.segs.map((s) => s.utf8 || '').join('').replace(/\s+/g, ' ').trim(),
      }))
      .filter((s) => s.text);
  }
  // XML formats (srv1 <text start dur> or srv3 <p t d>)
  const segs = [];
  for (const m of body.matchAll(/<text start="([\d.]+)"(?: dur="([\d.]+)")?[^>]*>([\s\S]*?)<\/text>/g)) {
    segs.push({ start: Number(m[1]), dur: Number(m[2] || 0), text: decodeEntities(m[3]).replace(/\s+/g, ' ').trim() });
  }
  if (!segs.length) {
    for (const m of body.matchAll(/<p t="(\d+)"(?: d="(\d+)")?[^>]*>([\s\S]*?)<\/p>/g)) {
      segs.push({ start: Number(m[1]) / 1000, dur: Number(m[2] || 0) / 1000, text: decodeEntities(m[3]).replace(/\s+/g, ' ').trim() });
    }
  }
  return segs.filter((s) => s.text);
}

async function externalTranscript(videoId) {
  const base = process.env.TRANSCRIPT_API_URL;
  if (!base) return null;
  const url = base.replace('{id}', encodeURIComponent(videoId));
  const headers = {};
  if (process.env.TRANSCRIPT_API_KEY) headers.Authorization = `Bearer ${process.env.TRANSCRIPT_API_KEY}`;
  const res = await fetchWithTimeout(url, { headers }, 30000);
  if (!res.ok) throw new Error(`Transcript service HTTP ${res.status}`);
  const data = await res.json();
  // Accept [{start, dur|duration, text}] or {segments:[...]}
  const segs = Array.isArray(data) ? data : data.segments || data.transcript || [];
  return segs.map((s) => ({ start: Number(s.start ?? s.offset ?? 0), dur: Number(s.dur ?? s.duration ?? 0), text: String(s.text || '') }));
}

function metaFrom(videoId, player, oe) {
  const d = player?.videoDetails || {};
  return {
    youtube_id: videoId,
    url: `https://www.youtube.com/watch?v=${videoId}`,
    title: d.title || oe?.title || 'YouTube video',
    channel: d.author || oe?.author_name || null,
    duration_seconds: d.lengthSeconds ? Number(d.lengthSeconds) : null,
    thumbnail_url: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
  };
}

/**
 * Returns { meta, segments, source }. Throws TranscriptError with a clear
 * message when no English transcript can be obtained.
 */
export async function getVideoWithTranscript(videoId) {
  const errors = [];
  let player = null;
  for (const strategy of [innertubePlayer, watchPagePlayer]) {
    try {
      const p = await strategy(videoId);
      if (!player?.videoDetails) player = p;
      const status = p?.playabilityStatus?.status;
      if (status && status !== 'OK') {
        errors.push(`${strategy.name}: ${p.playabilityStatus.reason || status}`);
        continue;
      }
      const tracks = p?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
      const track = pickEnglishTrack(tracks);
      if (!track) {
        errors.push(`${strategy.name}: no English captions`);
        continue;
      }
      const segments = await fetchTrack(track.baseUrl);
      if (segments.length) {
        const oe = p.videoDetails ? null : await oembed(videoId);
        return { meta: metaFrom(videoId, p, oe), segments, source: track.kind === 'asr' ? 'youtube-auto-captions' : 'youtube-captions' };
      }
      errors.push(`${strategy.name}: caption track was empty`);
    } catch (err) {
      errors.push(`${strategy.name}: ${err.message}`);
    }
  }
  try {
    const segments = await externalTranscript(videoId);
    if (segments?.length) {
      const oe = await oembed(videoId);
      return { meta: metaFrom(videoId, player, oe), segments, source: 'transcript-service' };
    }
  } catch (err) {
    errors.push(`transcript-service: ${err.message}`);
  }

  const oe = await oembed(videoId);
  const meta = metaFrom(videoId, player, oe);
  const noCaptions = errors.every((e) => e.includes('no English captions'));
  const err = new TranscriptError(
    noCaptions
      ? 'This video has no English captions, so it cannot be analysed automatically.'
      : 'Could not download the transcript for this video from YouTube.',
    noCaptions ? 'no_captions' : 'transcript_fetch_failed',
  );
  err.details = errors;
  err.meta = meta.title !== 'YouTube video' ? meta : { ...meta, title: null };
  throw err;
}

/** Fetch only metadata (used when the learner pastes a transcript manually). */
export async function getVideoMeta(videoId) {
  let player = null;
  try {
    player = await innertubePlayer(videoId);
  } catch {
    /* fall through to oEmbed */
  }
  const oe = player?.videoDetails ? null : await oembed(videoId);
  return metaFrom(videoId, player, oe);
}

/**
 * Parse a pasted transcript. Supports lines like "04:37 text", "[1:02:03] text",
 * or plain text without timestamps.
 */
export function parsePastedTranscript(text) {
  const lines = String(text).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const segs = [];
  let pendingTime = null;
  for (const line of lines) {
    const m = line.match(/^\[?((?:\d{1,2}:)?\d{1,2}:\d{2})\]?\s*[-–]?\s*(.*)$/);
    if (m) {
      const parts = m[1].split(':').map(Number);
      const secs = parts.reduce((acc, p) => acc * 60 + p, 0);
      if (m[2]) segs.push({ start: secs, dur: 0, text: m[2] });
      else pendingTime = secs;
    } else {
      segs.push({ start: pendingTime, dur: 0, text: line });
      pendingTime = null;
    }
  }
  return segs;
}
