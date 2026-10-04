// Diagnostics: which ways of reaching a video's captions does YouTube accept
// from this server right now? Used by the internal probe endpoints (protected
// by INTERNAL_API_KEY) to choose and verify the transcript strategy.
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36';

const PLAYER_CLIENTS = {
  ANDROID_VR: { id: 28, v: '1.62.27', extra: { deviceMake: 'Oculus', deviceModel: 'Quest 3', androidSdkVersion: 32, osName: 'Android', osVersion: '12L' }, ua: 'com.google.android.apps.youtube.vr.oculus/1.62.27 (Linux; U; Android 12L; eureka-user Build/SQ3A.220605.009.A1) gzip' },
  IOS: { id: 5, v: '20.10.4', extra: { deviceMake: 'Apple', deviceModel: 'iPhone16,2', osName: 'iPhone', osVersion: '18.3.2.22D82' }, ua: 'com.google.ios.youtube/20.10.4 (iPhone16,2; U; CPU iOS 18_3_2 like Mac OS X;)' },
  ANDROID: { id: 3, v: '20.10.38', extra: { androidSdkVersion: 34 }, ua: 'com.google.android.youtube/20.10.38 (Linux; U; Android 14) gzip' },
  WEB: { id: 1, v: '2.20250312.04.00', ua: UA },
  MWEB: { id: 2, v: '2.20250311.03.00', ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_7_10 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1' },
  WEB_EMBEDDED_PLAYER: { id: 56, v: '1.20250310.01.00', ua: UA, thirdParty: { embedUrl: 'https://www.youtube.com/' } },
  TVHTML5: { id: 7, v: '7.20250312.16.00', ua: 'Mozilla/5.0 (ChromiumStylePlatform) Cobalt/Version' },
  TVHTML5_SIMPLY_EMBEDDED_PLAYER: { id: 85, v: '2.0', ua: UA, thirdParty: { embedUrl: 'https://www.youtube.com/' } },
  WEB_CREATOR: { id: 62, v: '1.20250312.03.01', ua: UA },
  WEB_REMIX: { id: 67, v: '1.20250310.01.00', ua: UA },
  ANDROID_MUSIC: { id: 21, v: '7.27.52', extra: { androidSdkVersion: 30 }, ua: 'com.google.android.apps.youtube.music/7.27.52 (Linux; U; Android 11) gzip' },
};

async function timed(fn, ms = 7000) {
  const t0 = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const out = await fn(ctrl.signal);
    return { ms: Date.now() - t0, ...out };
  } catch (err) {
    return { ms: Date.now() - t0, error: String(err.message || err).slice(0, 160) };
  } finally {
    clearTimeout(timer);
  }
}

const post = (endpoint, body, c, signal, extraHeaders = {}) => fetch(`https://www.youtube.com/youtubei/v1/${endpoint}?prettyPrint=false`, {
  method: 'POST',
  signal,
  headers: {
    'Content-Type': 'application/json',
    'User-Agent': c.ua,
    'Accept-Language': 'en-US,en;q=0.9',
    Origin: 'https://www.youtube.com',
    'X-YouTube-Client-Name': String(c.id),
    'X-YouTube-Client-Version': c.v,
    ...extraHeaders,
  },
  body: JSON.stringify(body),
});

async function probePlayer(name, videoId) {
  const c = PLAYER_CLIENTS[name];
  return timed(async (signal) => {
    const res = await post('player', {
      videoId, contentCheckOk: true, racyCheckOk: true,
      context: { client: { clientName: name, clientVersion: c.v, hl: 'en', gl: 'US', ...(c.extra || {}) }, ...(c.thirdParty ? { thirdParty: c.thirdParty } : {}) },
    }, c, signal);
    const j = await res.json().catch(() => ({}));
    const tracks = j?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
    let caption = null;
    if (tracks.length) {
      const u = new URL(tracks[0].baseUrl);
      u.searchParams.set('fmt', 'json3');
      const r = await fetch(u, { signal, headers: { 'User-Agent': c.ua } });
      const body = await r.text();
      caption = { http: r.status, bytes: body.length, pot: u.searchParams.has('exp') ? u.searchParams.get('exp') : null };
    }
    return { http: res.status, status: j?.playabilityStatus?.status, reason: String(j?.playabilityStatus?.reason || '').slice(0, 80), tracks: tracks.length, caption };
  });
}

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

const b64 = (bytes) => btoa(String.fromCharCode(...bytes));
const enc = (s) => [...new TextEncoder().encode(s)];
/** protobuf: field1 { field1: videoId } — the transcript panel's minimal params. */
function panelParams(videoId, lang) {
  const inner = [0x0a, videoId.length, ...enc(videoId)];
  const outer = [0x0a, inner.length, ...inner];
  if (!lang) return [b64([0x0a, videoId.length, ...enc(videoId)]), b64(outer)];
  return [b64(outer)];
}

async function probePanel(videoId) {
  const web = PLAYER_CLIENTS.WEB;
  const context = { client: { clientName: 'WEB', clientVersion: web.v, hl: 'en', gl: 'US' } };
  const out = {};
  let fromNext = null;
  let visitor = null;
  out.next = await timed(async (signal) => {
    const res = await post('next', { videoId, context }, web, signal);
    const j = await res.json().catch(() => ({}));
    fromNext = findAll(j, 'getTranscriptEndpoint').map((e) => e.params).find(Boolean) || null;
    visitor = j?.responseContext?.visitorData || null;
    return { http: res.status, params: Boolean(fromNext), visitor: Boolean(visitor) };
  });
  const variants = [['next_params', fromNext], ...panelParams(videoId).map((p, i) => [`built_${i}`, p])].filter(([, p]) => p);
  for (const [label, params] of variants) {
    for (const withVisitor of [false, true]) {
      if (withVisitor && !visitor) continue;
      out[`${label}${withVisitor ? '+visitor' : ''}`] = await timed(async (signal) => {
        const ctx = withVisitor ? { client: { ...context.client, visitorData: visitor } } : context;
        const res = await post('get_transcript', { context: ctx, params }, web, signal, withVisitor ? { 'X-Goog-Visitor-Id': visitor } : {});
        const text = await res.text();
        let segs = 0;
        try {
          segs = findAll(JSON.parse(text), 'transcriptSegmentRenderer').length;
        } catch { /* not json */ }
        return { http: res.status, segs, body: res.ok ? undefined : text.slice(0, 120) };
      });
    }
  }
  return out;
}

async function probeUrl(url) {
  return timed(async (signal) => {
    const res = await fetch(url, { signal, headers: { 'User-Agent': UA } });
    const text = await res.text();
    return { http: res.status, bytes: text.length, start: text.slice(0, 60) };
  });
}

const INVIDIOUS = ['https://inv.nadeko.net', 'https://yewtu.be', 'https://invidious.nerdvpn.de', 'https://inv.tux.pizza', 'https://invidious.privacyredirect.com',
  'https://iv.melmac.space', 'https://invidious.f5.si', 'https://inv.perennialte.ch', 'https://invidious.materialio.us', 'https://youtube.alt.tyil.nl'];

async function probeInvidious(base, videoId) {
  return timed(async (signal) => {
    const res = await fetch(`${base}/api/v1/captions/${videoId}`, { signal, headers: { 'User-Agent': UA } });
    const text = await res.text();
    let list = [];
    try {
      list = JSON.parse(text).captions || [];
    } catch { /* not json */ }
    const en = list.find((c) => /^en/i.test(c.languageCode) && !/auto/i.test(c.label)) || list.find((c) => /^en/i.test(c.languageCode));
    let file = null;
    if (en) {
      const r = await fetch(new URL(en.url, base), { signal, headers: { 'User-Agent': UA } });
      const vtt = await r.text();
      file = { http: r.status, bytes: vtt.length, cues: (vtt.match(/-->/g) || []).length, label: en.label, start: vtt.slice(0, 80) };
    }
    return { http: res.status, tracks: list.length, labels: list.map((c) => c.label).slice(0, 6), file };
  }, 9000);
}

/** Run every probe for one video. */
export async function probeYoutube(videoId) {
  const players = {};
  await Promise.all(Object.keys(PLAYER_CLIENTS).map(async (name) => {
    players[name] = await probePlayer(name, videoId);
  }));
  const [panel, timedtext, timedtextAsr, oembed, invidious, piped] = await Promise.all([
    probePanel(videoId),
    probeUrl(`https://www.youtube.com/api/timedtext?v=${videoId}&lang=en&fmt=json3`),
    probeUrl(`https://www.youtube.com/api/timedtext?v=${videoId}&lang=en&kind=asr&fmt=json3`),
    probeUrl(`https://www.youtube.com/oembed?format=json&url=https://www.youtube.com/watch?v=${videoId}`),
    probeUrl(`https://inv.nadeko.net/api/v1/captions/${videoId}`),
    probeUrl(`https://pipedapi.kavin.rocks/streams/${videoId}`),
  ]);
  const instances = {};
  await Promise.all(INVIDIOUS.map(async (base) => {
    instances[base] = await probeInvidious(base, videoId);
  }));
  return { videoId, players, panel, timedtext, timedtextAsr, oembed, invidious, piped, instances };
}
