// YouTube metadata + transcript extraction (server-side, no API key needed).
//
// Why not the official YouTube Data API? Its captions.download endpoint only
// works for videos the caller owns (OAuth as the channel owner), so it cannot
// fetch captions of arbitrary public videos. LexiTube therefore reads the same
// caption tracks the YouTube player uses:
//
//   1. InnerTube `player` endpoint with several player clients (Android VR,
//      iOS, Android, embedded web, TV). YouTube answers differently per client
//      and per server location, so one refusing (e.g. "confirm you're not a
//      bot", age check) doesn't end the attempt. Each answer gives the video's
//      playability status and its caption tracks.
//   2. The caption track itself as json3 — manual captions give a time per
//      caption; auto-generated captions also give a time per word.
//   3. The transcript panel (`get_transcript`), which the website shows under
//      a video — a different path that often works when 1–2 don't.
//   4. Optional external transcript service (TRANSCRIPT_API_URL).
//
// Language: English captions (human first, then auto-generated); otherwise an
// English translation of another track when YouTube offers one; otherwise the
// original language. Every failure becomes a TranscriptError with a specific
// Arabic message (private / removed / age-restricted / region / no captions /
// blocked) — the UI shows it and offers to paste the transcript instead.
import { config } from '../config.js';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36';
const WEB_VERSION = '2.20250312.04.00';

export const MESSAGES = {
  invalid_url: 'هذا لا يبدو رابط فيديو يوتيوب. الصق رابطًا مثل https://www.youtube.com/watch?v=… أو https://youtu.be/…',
  private: 'هذا الفيديو خاص — لا يستطيع إلا صاحبه مشاهدته، لذلك لا يمكن تنزيل نصه. اختر فيديو عامًا، أو الصق النص إن كان عندك.',
  unavailable: 'هذا الفيديو غير متاح على يوتيوب (ربما حُذف أو الرابط غير صحيح). تأكد من الرابط وجرّب مرة أخرى.',
  age_restricted: 'هذا الفيديو مقيّد بالعمر ويتطلب تسجيل الدخول في يوتيوب، لذلك لا يمكن تنزيل نصه تلقائيًا. افتح الفيديو في يوتيوب، ثم انسخ النص من «عرض النص» (Show transcript) والصقه هنا.',
  region_blocked: 'هذا الفيديو غير متاح في منطقة الخادم، لذلك لا يمكن تنزيل نصه تلقائيًا. إن كان يعمل عندك، انسخ النص من «عرض النص» في يوتيوب والصقه هنا.',
  live: 'هذا بث مباشر لم ينتهِ بعد — لا يوجد له نص كامل الآن. جرّب بعد انتهاء البث.',
  no_captions: 'هذا الفيديو بلا ترجمة نصية (captions) على يوتيوب، لذلك لا يوجد نص لتحليله. اختر فيديو فيه زر CC، أو الصق النص يدويًا.',
  blocked: 'رفض يوتيوب طلب الخادم مؤقتًا (يطلب التحقق من أنه ليس روبوتًا)، فلم نستطع تنزيل النص الآن. جرّب بعد قليل، أو افتح الفيديو في يوتيوب وانسخ النص من «عرض النص» والصقه هنا.',
  fetch_failed: 'تعذّر تنزيل نص الفيديو من يوتيوب الآن. تأكد أن للفيديو ترجمة (CC) وجرّب مرة أخرى، أو انسخ النص من «عرض النص» في يوتيوب والصقه هنا.',
};

export class TranscriptError extends Error {
  constructor(code, { meta = null, details = [], message } = {}) {
    super(message || MESSAGES[code] || MESSAGES.fetch_failed);
    this.code = code;
    this.status = code === 'invalid_url' ? 400 : 422;
    this.expose = true;
    this.meta = meta;
    this.details = details;
  }
}

const ID = /^[\w-]{11}$/;

/** The 11-character video id from any common YouTube link (or the id itself). */
export function parseYoutubeId(input) {
  if (!input) return null;
  const s = String(input).trim();
  if (ID.test(s)) return s;
  let url;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(s) ? s : `https://${s}`);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase().replace(/^(www|m|music|gaming)\./, '');
  const ok = (id) => (id && ID.test(id) ? id : null);
  if (host === 'youtu.be') return ok(url.pathname.split('/')[1]);
  if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    if (url.searchParams.get('v')) return ok(url.searchParams.get('v'));
    const m = url.pathname.match(/^\/(?:embed|shorts|live|v|e)\/([\w-]{11})(?:[/?#]|$)/);
    if (m) return m[1];
    // attribution_link?u=/watch%3Fv%3DID…
    const u = url.searchParams.get('u');
    if (u) return parseYoutubeId(`https://www.youtube.com${u.startsWith('/') ? '' : '/'}${u}`);
  }
  return null;
}

async function fetchWithTimeout(url, opts = {}, ms = 8000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

/* ------------------------------------------------------------ player clients */

const CLIENTS = [
  {
    name: 'android_vr', id: 28,
    client: { clientName: 'ANDROID_VR', clientVersion: '1.62.27', deviceMake: 'Oculus', deviceModel: 'Quest 3', androidSdkVersion: 32, osName: 'Android', osVersion: '12L' },
    ua: 'com.google.android.apps.youtube.vr.oculus/1.62.27 (Linux; U; Android 12L; eureka-user Build/SQ3A.220605.009.A1) gzip',
  },
  {
    name: 'ios', id: 5,
    client: { clientName: 'IOS', clientVersion: '20.10.4', deviceMake: 'Apple', deviceModel: 'iPhone16,2', osName: 'iPhone', osVersion: '18.3.2.22D82' },
    ua: 'com.google.ios.youtube/20.10.4 (iPhone16,2; U; CPU iOS 18_3_2 like Mac OS X;)',
  },
  {
    name: 'android', id: 3,
    client: { clientName: 'ANDROID', clientVersion: '20.10.38', androidSdkVersion: 34, osName: 'Android', osVersion: '14' },
    ua: 'com.google.android.youtube/20.10.38 (Linux; U; Android 14) gzip',
  },
  {
    name: 'web_embedded', id: 56,
    client: { clientName: 'WEB_EMBEDDED_PLAYER', clientVersion: '1.20250310.01.00' },
    thirdParty: { embedUrl: 'https://www.youtube.com/' },
    ua: UA,
  },
  {
    name: 'tv', id: 7,
    client: { clientName: 'TVHTML5', clientVersion: '7.20250312.16.00' },
    ua: 'Mozilla/5.0 (ChromiumStylePlatform) Cobalt/Version',
  },
];

async function innertube(endpoint, body, { ua = UA, clientId = 1, clientVersion = WEB_VERSION, visitorData } = {}, ms) {
  const res = await fetchWithTimeout(`https://www.youtube.com/youtubei/v1/${endpoint}?prettyPrint=false`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': ua,
      'Accept-Language': 'en-US,en;q=0.9',
      Origin: 'https://www.youtube.com',
      'X-YouTube-Client-Name': String(clientId),
      'X-YouTube-Client-Version': clientVersion,
      ...(visitorData ? { 'X-Goog-Visitor-Id': visitorData } : {}),
    },
    body: JSON.stringify(body),
  }, ms);
  if (!res.ok) throw new Error(`${endpoint} HTTP ${res.status}`);
  return res.json();
}

function playerRequest(c, videoId, visitorData, ms) {
  return innertube('player', {
    videoId,
    contentCheckOk: true,
    racyCheckOk: true,
    context: { client: { ...c.client, hl: 'en', gl: 'US', ...(visitorData ? { visitorData } : {}) }, ...(c.thirdParty ? { thirdParty: c.thirdParty } : {}) },
  }, { ua: c.ua, clientId: c.id, clientVersion: c.client.clientVersion, visitorData }, ms);
}

/** Map a non-OK playability status to one of our error codes. */
export function classifyPlayability(ps) {
  if (!ps || ps.status === 'OK') return null;
  const text = [ps.reason, ps.messages?.join(' '), ps.errorScreen?.playerErrorMessageRenderer?.subreason?.simpleText,
    ...(ps.errorScreen?.playerErrorMessageRenderer?.subreason?.runs || []).map((r) => r.text)].filter(Boolean).join(' ').toLowerCase();
  if (/private/.test(text)) return 'private';
  if (/your age|age-restricted|age restricted|inappropriate for some users|mature/.test(text)) return 'age_restricted';
  if (/not a bot|unusual traffic|sign in to confirm you/.test(text)) return 'blocked';
  if (/country|region|not available in your/.test(text)) return 'region_blocked';
  if (ps.status === 'LIVE_STREAM_OFFLINE' || /live|premiere/.test(text)) return 'live';
  if (ps.status === 'LOGIN_REQUIRED') return 'blocked';
  if (ps.status === 'ERROR' || /unavailable|removed|terminated|does not exist|no longer/.test(text)) return 'unavailable';
  return 'unavailable';
}

/* ---------------------------------------------------------------- tracks */

const trackName = (t) => t.name?.simpleText || (t.name?.runs || []).map((r) => r.text).join('') || t.languageCode;

/**
 * Best caption track for an English learner:
 *   English (human) → English (auto) → English translation of another track → original language.
 * Returns {track, translate} where translate='en' asks YouTube to translate.
 */
export function chooseTrack(tracks) {
  if (!tracks?.length) return null;
  const isEn = (t) => /^en\b/i.test(t.languageCode || '') || /^a?\.?en/i.test(t.vssId || '');
  const human = (t) => t.kind !== 'asr';
  const en = tracks.filter(isEn);
  const pick = en.find(human) || en[0];
  if (pick) return { track: pick, translate: null };
  const translatable = tracks.find((t) => human(t) && t.isTranslatable) || tracks.find((t) => t.isTranslatable);
  if (translatable) return { track: translatable, translate: 'en' };
  return { track: tracks.find(human) || tracks[0], translate: null };
}

const decodeEntities = (s) => s
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
  .replace(/&#39;|&#x27;|&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
  .replace(/<[^>]+>/g, '');

/**
 * Caption file → [{start, dur, text, words?}] (seconds). json3 events carry
 * segments; in auto-generated captions (wordLevel) each segment is one word
 * with its own tOffsetMs. Rolling auto-captions add "append" events that only
 * hold a line break — those are skipped.
 */
export function parseCaptions(body, { wordLevel = false } = {}) {
  const text = String(body || '').trim();
  if (!text) return [];
  if (text.startsWith('{')) {
    const data = JSON.parse(text);
    const out = [];
    for (const e of data.events || []) {
      if (!e.segs || e.aAppend) continue;
      const start = (e.tStartMs || 0) / 1000;
      const segs = e.segs.filter((s) => (s.utf8 || '').trim() && s.utf8 !== '\n');
      if (!segs.length) continue;
      const line = segs.map((s) => s.utf8).join('').replace(/\s+/g, ' ').trim();
      const words = wordLevel
        ? segs.map((s) => ({ t: start + (s.tOffsetMs || 0) / 1000, text: s.utf8.replace(/\s+/g, ' ').trim() })).filter((w) => w.text)
        : null;
      out.push({ start, dur: (e.dDurationMs || 0) / 1000, text: line, ...(words?.length ? { words } : {}) });
    }
    return out;
  }
  const segs = [];
  for (const m of text.matchAll(/<text start="([\d.]+)"(?: dur="([\d.]+)")?[^>]*>([\s\S]*?)<\/text>/g)) {
    segs.push({ start: Number(m[1]), dur: Number(m[2] || 0), text: decodeEntities(m[3]).replace(/\s+/g, ' ').trim() });
  }
  if (!segs.length) {
    for (const m of text.matchAll(/<p t="(\d+)"(?: d="(\d+)")?[^>]*>([\s\S]*?)<\/p>/g)) {
      segs.push({ start: Number(m[1]) / 1000, dur: Number(m[2] || 0) / 1000, text: decodeEntities(m[3]).replace(/\s+/g, ' ').trim() });
    }
  }
  return segs.filter((s) => s.text);
}

async function fetchTrack(track, translate, ua, ms) {
  const tries = ['json3', 'srv3', null];
  let last = 'empty caption track';
  for (const fmt of tries) {
    const url = new URL(track.baseUrl.startsWith('http') ? track.baseUrl : `https://www.youtube.com${track.baseUrl}`);
    if (fmt) url.searchParams.set('fmt', fmt);
    else url.searchParams.delete('fmt');
    if (translate) url.searchParams.set('tlang', translate);
    const res = await fetchWithTimeout(url.toString(), { headers: { 'User-Agent': ua || UA, 'Accept-Language': 'en-US,en;q=0.9' } }, ms);
    if (res.status === 429) throw new Error('caption HTTP 429');
    if (!res.ok) {
      last = `caption HTTP ${res.status}`;
      continue;
    }
    const segs = parseCaptions(await res.text(), { wordLevel: track.kind === 'asr' && !translate });
    if (segs.length) return segs;
  }
  throw new Error(last);
}

/* ------------------------------------------------------ transcript panel */

function findAll(obj, key, out = []) {
  if (!obj || typeof obj !== 'object') return out;
  if (Array.isArray(obj)) {
    for (const v of obj) findAll(v, key, out);
    return out;
  }
  for (const [k, v] of Object.entries(obj)) {
    if (k === key) out.push(v);
    else findAll(v, key, out);
  }
  return out;
}

/** Segments from a get_transcript answer (exported for tests). */
export function parseTranscriptPanel(data) {
  return findAll(data, 'transcriptSegmentRenderer').map((r) => {
    const start = Number(r.startMs || 0) / 1000;
    const end = Number(r.endMs || 0) / 1000;
    const text = (r.snippet?.runs || []).map((x) => x.text).join('') || r.snippet?.simpleText || '';
    return { start, dur: Math.max(0, end - start), text: text.replace(/\s+/g, ' ').trim() };
  }).filter((s) => s.text);
}

async function transcriptPanel(videoId, ms) {
  const context = { client: { clientName: 'WEB', clientVersion: WEB_VERSION, hl: 'en', gl: 'US' } };
  const next = await innertube('next', { videoId, context }, {}, ms);
  const params = findAll(next, 'getTranscriptEndpoint').map((e) => e.params).find(Boolean);
  if (!params) throw new Error('no transcript panel');
  const data = await innertube('get_transcript', { context, params }, {}, ms);
  const segs = parseTranscriptPanel(data);
  if (!segs.length) throw new Error('transcript panel empty');
  const details = next?.contents?.twoColumnWatchNextResults?.results?.results?.contents || [];
  const title = findAll(details, 'videoPrimaryInfoRenderer')[0]?.title?.runs?.map((r) => r.text).join('') || null;
  const channel = findAll(details, 'videoOwnerRenderer')[0]?.title?.runs?.[0]?.text || null;
  return { segs, title, channel };
}

/* ------------------------------------------------------------- external */

async function externalTranscript(videoId) {
  const base = config.youtube.transcriptApiUrl;
  if (!base) return null;
  const url = base.replace('{id}', encodeURIComponent(videoId));
  const headers = {};
  const key = config.youtube.transcriptApiKey();
  if (key) headers.Authorization = `Bearer ${key}`;
  const res = await fetchWithTimeout(url, { headers }, 20000);
  if (!res.ok) throw new Error(`transcript service HTTP ${res.status}`);
  const data = await res.json();
  const segs = Array.isArray(data) ? data : data.segments || data.transcript || [];
  return segs.map((s) => ({ start: Number(s.start ?? s.offset ?? 0), dur: Number(s.dur ?? s.duration ?? 0), text: String(s.text || '') })).filter((s) => s.text.trim());
}

/* --------------------------------------------------------------- metadata */

async function oembed(videoId) {
  try {
    const res = await fetchWithTimeout(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}`, {}, 5000);
    if (res.status === 401 || res.status === 403) return { private: true };
    if (res.status === 404 || res.status === 400) return { missing: true };
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

function metaFrom(videoId, details, oe, extra = {}) {
  const d = details || {};
  return {
    youtube_id: videoId,
    url: `https://www.youtube.com/watch?v=${videoId}`,
    title: d.title || extra.title || oe?.title || 'YouTube video',
    channel: d.author || extra.channel || oe?.author_name || null,
    duration_seconds: d.lengthSeconds ? Number(d.lengthSeconds) : null,
    thumbnail_url: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
  };
}

// Which error to report when several attempts failed, most specific first.
const PRIORITY = ['private', 'unavailable', 'live', 'age_restricted', 'region_blocked', 'no_captions', 'blocked', 'fetch_failed'];

/**
 * Video metadata + transcript. Returns {meta, segments, source, language}.
 * Throws TranscriptError with a specific, learner-facing message.
 */
export async function getVideoWithTranscript(videoId, { budgetMs = config.youtube.budgetMs } = {}) {
  const started = Date.now();
  const left = () => budgetMs - (Date.now() - started);
  const per = () => Math.max(1500, Math.min(config.youtube.timeoutMs, left()));
  const details = [];
  const codes = new Set();
  let videoDetails = null;
  let visitorData = null;
  let sawTracks = false;

  for (const c of CLIENTS) {
    if (left() < 2000) break;
    let p;
    try {
      p = await playerRequest(c, videoId, visitorData, per());
    } catch (err) {
      details.push(`${c.name}: ${err.message}`);
      continue;
    }
    visitorData ||= p?.responseContext?.visitorData || null;
    if (p?.videoDetails?.videoId === videoId) videoDetails ||= p.videoDetails;
    const problem = classifyPlayability(p?.playabilityStatus);
    if (problem) {
      codes.add(problem);
      details.push(`${c.name}: ${p.playabilityStatus.status} ${String(p.playabilityStatus.reason || '').slice(0, 120)}`);
      if (problem === 'private' || problem === 'unavailable') break; // no client will see it
      continue;
    }
    if (p?.videoDetails?.isLive || (p?.videoDetails?.isLiveContent && p?.videoDetails?.isUpcoming)) {
      codes.add('live');
      details.push(`${c.name}: live`);
      break;
    }
    const tracks = p?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
    const choice = chooseTrack(tracks);
    if (!choice) {
      codes.add('no_captions');
      details.push(`${c.name}: no caption tracks`);
      continue;
    }
    sawTracks = true;
    try {
      const segments = await fetchTrack(choice.track, choice.translate, c.ua, per());
      return {
        meta: metaFrom(videoId, p.videoDetails, null),
        segments,
        source: choice.translate ? 'youtube-translated-captions' : choice.track.kind === 'asr' ? 'youtube-auto-captions' : 'youtube-captions',
        language: choice.translate ? `${choice.track.languageCode}→en` : choice.track.languageCode,
        track: trackName(choice.track),
      };
    } catch (err) {
      codes.add('fetch_failed');
      details.push(`${c.name}: ${err.message}`);
    }
  }

  const definitive = codes.has('private') || codes.has('unavailable') || codes.has('live');
  if (!definitive && left() > 2500) {
    try {
      const { segs, title, channel } = await transcriptPanel(videoId, per());
      return { meta: metaFrom(videoId, videoDetails, null, { title, channel }), segments: segs, source: 'youtube-transcript-panel', language: null };
    } catch (err) {
      details.push(`transcript_panel: ${err.message}`);
    }
  }
  if (!definitive) {
    try {
      const segments = await externalTranscript(videoId);
      if (segments?.length) return { meta: metaFrom(videoId, videoDetails, await oembed(videoId)), segments, source: 'transcript-service', language: null };
    } catch (err) {
      details.push(`transcript_service: ${err.message}`);
    }
  }

  const oe = await oembed(videoId);
  // oEmbed only decides when YouTube gave no specific reason.
  const vague = [...codes].every((k) => k === 'blocked' || k === 'fetch_failed');
  if (vague && oe?.private && !videoDetails) codes.add('private');
  if (vague && oe?.missing && !videoDetails) codes.add('unavailable');
  // "No captions" from one client is only certain when no client saw tracks.
  if (sawTracks) codes.delete('no_captions');
  if (!codes.size) codes.add('fetch_failed');
  const code = PRIORITY.find((k) => codes.has(k)) || 'fetch_failed';
  const meta = metaFrom(videoId, videoDetails, oe?.title ? oe : null);
  throw new TranscriptError(code, { meta: meta.title === 'YouTube video' ? { ...meta, title: null } : meta, details });
}

/** Fetch only metadata (used when the learner pastes a transcript manually). */
export async function getVideoMeta(videoId) {
  let d = null;
  try {
    d = (await playerRequest(CLIENTS[0], videoId, null, 6000))?.videoDetails || null;
  } catch {
    /* fall through to oEmbed */
  }
  const oe = d ? null : await oembed(videoId);
  return metaFrom(videoId, d, oe?.title ? oe : null);
}

/**
 * Parse a pasted transcript. Supports lines like "04:37 text", "[1:02:03] text",
 * a time on its own line followed by the text (YouTube's "Show transcript"
 * copy), or plain text without timestamps.
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
