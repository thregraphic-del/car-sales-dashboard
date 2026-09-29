/* =====================================================================
   صور حقيقية من Wikimedia Commons (مرخّصة للاستخدام مع الإسناد)
   - الصورة الأمامية: الصورة الرئيسية لمقالة ويكيبيديا الخاصة بالموديل.
   - الجانبية/الخلفية/الداخلية: بحث في Wikimedia Commons باسم الموديل والزاوية.
   كل صورة تُعرض كـ "صورة تمثيلية للموديل" مع رابط لصفحة الملف ومصدره.
   عند تعذّر التحميل (بدون إنترنت) يظهر رسم خطي بديل بوضوح.
   ===================================================================== */
(function () {
  'use strict';
  const WP = 'https://en.wikipedia.org/w/api.php';
  const CM = 'https://commons.wikimedia.org/w/api.php';
  const CACHE_KEY = 'dealer-img-cache-v1';
  let cache = {};
  try { cache = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}'); } catch (e) { cache = {}; }
  const save = () => {
    const keep = {}; for (const k in cache) if (cache[k]) keep[k] = cache[k];
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(keep)); } catch (e) { /* ignore */ }
  };

  const VIEW_WORDS = {
    front: { q: 'front', must: ['front', 'vorne', 'avant', ' fl', 'frontal'] },
    side: { q: 'side view', must: ['side', 'profile', 'seite', 'lateral'] },
    rear: { q: 'rear', must: ['rear', 'back', 'heck', 'arrière', ' rl', ' rr'] },
    interior: { q: 'interior', must: ['interior', 'dashboard', 'cockpit', 'innenraum', 'cabin', 'intérieur'] }
  };

  // simple concurrency queue so we don't hammer the API
  const queue = []; let active = 0; const MAX = 4;
  function enqueue(fn) {
    return new Promise((res, rej) => { queue.push({ fn, res, rej }); pump(); });
  }
  function pump() {
    while (active < MAX && queue.length) {
      const job = queue.shift(); active++;
      job.fn().then(job.res, job.rej).finally(() => { active--; pump(); });
    }
  }
  async function api(base, params) {
    const u = base + '?' + new URLSearchParams(Object.assign({ format: 'json', origin: '*' }, params)).toString();
    const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = ctl ? setTimeout(() => ctl.abort(), 8000) : null;
    let r;
    try { r = await fetch(u, ctl ? { signal: ctl.signal } : undefined); } finally { if (timer) clearTimeout(timer); }
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  }
  const fileUrl = (name) => 'https://commons.wikimedia.org/wiki/File:' + encodeURIComponent(name.replace(/^File:/, '').replace(/ /g, '_'));

  async function wikiLead(titles) {
    for (const t of titles) {
      try {
        const j = await api(WP, { action: 'query', redirects: 1, prop: 'pageimages', piprop: 'thumbnail|name', pithumbsize: 960, titles: t });
        const pages = j.query && j.query.pages ? Object.values(j.query.pages) : [];
        const p = pages.find((x) => x.thumbnail && x.thumbnail.source);
        if (p) return { src: p.thumbnail.source, page: fileUrl(p.pageimage || ''), article: 'https://en.wikipedia.org/wiki/' + encodeURIComponent(p.title.replace(/ /g, '_')) };
      } catch (e) { /* try next */ }
    }
    return null;
  }

  async function commonsView(query, token, view) {
    const vw = VIEW_WORDS[view];
    try {
      const j = await api(CM, {
        action: 'query', generator: 'search', gsrnamespace: 6, gsrlimit: 20,
        gsrsearch: query + ' ' + vw.q + ' filetype:bitmap',
        prop: 'imageinfo', iiprop: 'url|mime|size', iiurlwidth: 960
      });
      const pages = j.query && j.query.pages ? Object.values(j.query.pages) : [];
      const tok = String(token || '').toLowerCase();
      const scored = pages
        .filter((p) => p.imageinfo && p.imageinfo[0] && /jpe?g|png|webp/.test(p.imageinfo[0].mime || ''))
        .map((p) => {
          const t = p.title.toLowerCase();
          let s = 0;
          if (tok && t.includes(tok)) s += 5; else s -= 10;
          if (vw.must.some((w) => t.includes(w))) s += 6;
          const yr = (t.match(/20(1[5-9]|2[0-9])/) || [])[0];
          if (yr) s += (+yr - 2014) * 0.3;
          const ii = p.imageinfo[0];
          if (ii.width && ii.width < 800) s -= 3;
          return { p, s };
        })
        .filter((x) => x.s > 4)
        .sort((a, b) => b.s - a.s || (a.p.index || 0) - (b.p.index || 0));
      if (!scored.length) return null;
      const ii = scored[0].p.imageinfo[0];
      return { src: ii.thumburl || ii.url, page: ii.descriptionurl || fileUrl(scored[0].p.title) };
    } catch (e) { return null; }
  }

  /* vehicle: resolve a single view lazily ("front" | "side" | "rear" | "interior") */
  const inflight = {};
  function vehicleView(v, view) {
    const key = v.id + ':' + view;
    if (cache[key] !== undefined) return Promise.resolve(cache[key]);
    if (inflight[key]) return inflight[key];
    inflight[key] = enqueue(async () => {
      let r = null;
      if (view === 'front') r = await wikiLead(v.wiki);
      if (!r) r = await commonsView(v.q, v.token, view);
      if (!r && view === 'front') r = await commonsView(v.full, v.token, 'front');
      cache[key] = r;
      if (r) save(); // only successful lookups persist; misses are retried next visit
      return r;
    }).catch(() => null);
    return inflight[key];
  }

  function partImage(part) {
    const key = 'part:' + part.id;
    if (cache[key] !== undefined) return Promise.resolve(cache[key]);
    return enqueue(async () => {
      const r = await wikiLead(part.wiki);
      cache[key] = r; if (r) save(); return r;
    }).catch(() => null);
  }

  /* line-art fallback silhouettes (mono-line) */
  function silhouette(body) {
    const paths = {
      Sedan: 'M20 78 h14 a13 13 0 0 1 26 0 h92 a13 13 0 0 1 26 0 h14 v-14 c0-6-4-9-10-10 l-30-5 -26-20 c-4-3-8-4-13-4 h-48 c-6 0-10 2-14 6 l-17 18 -12 3 c-5 1-8 5-8 10 z M72 32 l-15 19 h40 v-19 z M104 32 v19 h42 l-22-17 c-2-1-4-2-7-2 z',
      SUV: 'M18 78 h16 a13 13 0 0 1 26 0 h92 a13 13 0 0 1 26 0 h16 v-22 c0-6-3-9-9-10 l-24-4 -18-22 c-3-4-7-6-12-6 h-76 c-5 0-8 3-10 7 l-10 21 -8 3 c-5 2-9 5-9 11 z M50 24 l-9 20 h52 v-20 z M100 24 v20 h50 l-15-17 c-2-2-4-3-7-3 z',
      Pickup: 'M16 78 h18 a13 13 0 0 1 26 0 h92 a13 13 0 0 1 26 0 h14 v-26 h-70 v-26 c0-4-3-6-7-6 h-46 c-5 0-9 2-11 6 l-12 22 -12 4 c-6 2-8 6-8 12 z M58 26 l-9 18 h40 v-18 z'
    };
    const d = paths[body] || paths.Sedan;
    return '<svg class="silhouette" viewBox="0 0 210 100" aria-hidden="true"><path d="' + d + '"/><circle cx="47" cy="78" r="9"/><circle cx="165" cy="78" r="9"/><line x1="10" y1="92" x2="200" y2="92"/></svg>';
  }

  function clear() { cache = {}; save(); }

  window.IMG = { vehicleView, partImage, silhouette, clear };
})();
