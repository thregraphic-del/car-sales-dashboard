// Reader — watch / read a source with synchronized English + Arabic lines.
// Every meaningful word is clickable and explained in place; nothing navigates away.
//
// Live sync: the transcript follows the real player time (YouTube IFrame API
// getCurrentTime). A timeline built once from the caption timestamps
// (shared/sync.js) gives the current sentence — and the current word when
// YouTube provided word timings — by binary search on every animation frame
// while playing; when paused it checks a few times a second so seeking still
// moves the highlight. Clicking a sentence (outside its words) or its time
// seeks the video there.
import { api } from '../api.js';
import { state } from '../state.js';
import { esc, icon, levelChip, fmtTime, fmtDuration, toast, $, emptyState, openModal } from '../ui.js';
import { openWordPanel, closeWordPanel, isPanelOpen, bindSpeech, celebrateGoal } from '../components.js';
import { tokenize, quickTier, normalizeArabic } from '../shared/text.js';
import { buildTimeline, positionAt, steadyPosition, wordIndexByChar } from '../shared/sync.js';
import { refreshStats } from '../app.js';
import { APP_CONFIG } from '../config.js';
import { speak, stop as stopSpeech } from '../audio.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const pref = (k, d) => {
  try {
    return localStorage.getItem(k) ?? d;
  } catch {
    return d;
  }
};
const setPref = (k, v) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* ignore */
  }
};

/* --------------------------------------------------------------- players */

let ytApi = null;
function loadYouTubeApi() {
  if (ytApi) return ytApi;
  ytApi = new Promise((resolve, reject) => {
    if (window.YT?.Player) return resolve(window.YT);
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    s.onerror = () => reject(new Error('YouTube unavailable'));
    window.onYouTubeIframeAPIReady = () => resolve(window.YT);
    document.head.appendChild(s);
    setTimeout(() => reject(new Error('YouTube timeout')), 12000);
  });
  ytApi.catch(() => (ytApi = null));
  return ytApi;
}

/** Real YouTube player (IFrame API). onState(playing) is called on play/pause/seek. */
async function youtubePlayer(el, videoId, start, onState = () => {}) {
  const YT = await loadYouTubeApi();
  return new Promise((resolve) => {
    const p = new YT.Player(el, {
      videoId,
      playerVars: { playsinline: 1, rel: 0, modestbranding: 1, start: Math.floor(start || 0), cc_load_policy: 0 },
      events: {
        onReady: () => resolve({
          time: () => p.getCurrentTime?.() || 0,
          seek: (t, { play = true } = {}) => {
            p.seekTo(t, true);
            if (play) p.playVideo();
            onState(play);
          },
          playing: () => p.getPlayerState?.() === 1,
          pause: () => p.pauseVideo?.(),
          play: () => p.playVideo?.(),
          setRate: (r) => p.setPlaybackRate?.(r),
          destroy: () => p.destroy?.(),
        }),
        // 1 playing, 3 buffering (still moving), 2 paused, 0 ended
        onStateChange: (e) => onState(e.data === 1 || e.data === 3),
      },
    });
  });
}

/** Demo videos aren't on YouTube: a simple clock drives the same sync. */
function demoPlayer(el, duration) {
  let t = 0;
  let playing = false;
  let rate = 1;
  let last = performance.now();
  el.innerHTML = `
    <div class="demo-player">
      <button class="big-play sm" data-dp="toggle" aria-label="تشغيل">${icon.play}</button>
      <div style="flex:1"><div class="bar dp-bar"><span style="width:0%"></span></div>
        <div class="row between tiny muted" style="margin-top:6px"><span class="en-inline dp-time">0:00</span><span>فيديو تجريبي — محاكاة التشغيل لعرض الترجمة المتزامنة</span><span class="en-inline">${fmtDuration(duration)}</span></div></div>
    </div>`;
  const btn = el.querySelector('[data-dp="toggle"]');
  const bar = el.querySelector('.dp-bar span');
  const timeEl = el.querySelector('.dp-time');
  const tick = setInterval(() => {
    const now = performance.now();
    if (playing) t = Math.min(duration, t + ((now - last) / 1000) * rate);
    last = now;
    if (t >= duration) playing = false;
    bar.style.width = `${(100 * t) / duration}%`;
    timeEl.textContent = fmtTime(t);
    btn.innerHTML = playing ? icon.pause : icon.play;
  }, 200);
  btn.addEventListener('click', () => {
    playing = !playing;
    last = performance.now();
  });
  el.querySelector('.dp-bar').parentElement.addEventListener('click', (e) => {
    const r = el.querySelector('.dp-bar').getBoundingClientRect();
    const ratio = (r.right - e.clientX) / r.width; // RTL bar fills from the right
    if (ratio >= 0 && ratio <= 1) t = ratio * duration;
  });
  return {
    time: () => t,
    seek: (s, { play = true } = {}) => { t = s; playing = play; last = performance.now(); },
    playing: () => playing,
    pause: () => { playing = false; },
    setRate: (r) => { rate = r; },
    play: () => { playing = true; last = performance.now(); },
    destroy: () => clearInterval(tick),
  };
}

/* ------------------------------------------------------------ word spans */

// data-wi on each word span = index of that word in line.words (live highlight).
const wiAttr = (map, from) => (map && map[from] >= 0 ? ` data-wi="${map[from]}"` : '');

/* ---------------------------------------------------------------- render */

function lineHtml(line, marks) {
  const wmap = wordIndexByChar(line.text); // word i ↔ timing i (real or estimated)
  const own = marks.filter((m) => m.line_id === line.id).sort((a, b) => a.start - b.start || b.end - a.end);
  const kept = [];
  let last = 0;
  for (const m of own) {
    if (m.start < last) continue; // overlapping phrase: keep the first
    kept.push(m);
    last = m.end;
  }
  const plain = (text, base) => tokenize(text).map((t) => {
    if (!t.word) return esc(t.text);
    const wi = wiAttr(wmap, base + t.start);
    if (quickTier(t.text) === 'function') return `<span class="fw"${wi}>${esc(t.text)}</span>`;
    return `<span class="tok" data-w="${esc(t.text)}"${wi}>${esc(t.text)}</span>`;
  }).join('');
  // Inside a highlighted phrase, words still get their own span for the live highlight.
  const markInner = (from, to) => (wmap
    ? tokenize(line.text.slice(from, to)).map((t) => (t.word ? `<span class="w"${wiAttr(wmap, from + t.start)}>${esc(t.text)}</span>` : esc(t.text))).join('')
    : esc(line.text.slice(from, to)));
  // The text between two character positions (a highlighted phrase may be cut at a phrase border).
  const renderRange = (from, to) => {
    let out = '';
    let pos = from;
    for (const m of kept) {
      if (m.end <= from || m.start >= to) continue;
      const s = Math.max(m.start, from);
      const e = Math.min(m.end, to);
      if (s > pos) out += plain(line.text.slice(pos, s), pos);
      out += `<span class="mark ${m.state === 'saved' ? 's-saved' : m.light ? 's-light' : 's-suggested'}" data-vid="${m.vocabulary_id}">${markInner(s, e)}</span>`;
      pos = e;
    }
    if (pos < to) out += plain(line.text.slice(pos, to), pos);
    return out;
  };
  const seekable = line.start_seconds != null;
  const wordsIn = (from, to) => {
    let lo = -1;
    let hi = -1;
    for (let i = from; i < to; i += 1) {
      const w = wmap[i];
      if (w >= 0) {
        if (lo < 0) lo = w;
        hi = w;
      }
    }
    return [lo, hi];
  };
  // Phrase by phrase: each English phrase with its Arabic on the same row.
  // Until it is split into phrases, a line is one row: English beside its Arabic.
  const rows = line.align?.length ? line.align : (seekable ? [[0, line.text.length, line.text_ar || '']] : null);
  const body = rows
    ? `<div class="line-body chunked">${rows.map(([from, to, ar], k) => {
      const [w0, w1] = wordsIn(from, to);
      return `<div class="chunk" data-c="${k}" data-w0="${w0}" data-w1="${w1}"><p class="c-en en">${renderRange(from, to)}</p><p class="c-ar${ar ? '' : ' pending'}" dir="rtl">${ar ? esc(ar) : '…'}</p></div>`;
    }).join('')}</div>`
    : `<div class="line-body"><p class="line-en en">${renderRange(0, line.text.length)}</p>${line.text_ar ? `<p class="line-ar" dir="rtl">${seekable ? line.text_ar.split(/(\s+)/).map((w) => (/\S/.test(w) ? `<span class="aw">${esc(w)}</span>` : w)).join('') : esc(line.text_ar)}</p>` : '<p class="line-ar pending" dir="rtl">…</p>'}</div>`;
  return `
    <div class="line${seekable ? ' seekable has-words' : ''}" data-id="${line.id}" data-start="${line.start_seconds ?? ''}">
      ${seekable ? `<button class="ts" data-seek="${line.start_seconds}" title="انتقل إلى هذه الجملة في الفيديو">${fmtTime(line.start_seconds)}</button>` : '<span class="ts-spacer"></span>'}
      ${body}
    </div>`;
}

export async function render(view, { segments, params }) {
  const id = Number(segments[1]);
  let data;
  try {
    data = await api.source(id);
  } catch (err) {
    view.innerHTML = emptyState('🔎', 'لم نجد هذا المصدر', err.message, '<a class="btn" href="#/add">أضف مصدرًا</a>');
    return;
  }
  const { source } = data;
  const isVideo = source.kind === 'youtube';
  const hasTimes = data.lines.some((l) => l.start_seconds != null);
  let showAr = pref('reader.ar', '1') === '1';
  let arLayout = pref('reader.arLayout', 'side') === 'below' ? 'below' : 'side';
  let follow = pref('reader.follow', '1') === '1';
  let player = null;
  let currentId = null;
  let currentWord = -1;
  let syncTimer = null;
  let frame = 0;
  let playing = false;
  let timeline = buildTimeline(data.lines);
  let userScrollUntil = 0; // the learner is scrolling: don't pull the transcript back for a moment
  let tab = 'text';

  view.innerHTML = `
    <div class="reader-head">
      <a class="btn icon sm ghost" href="#/add" aria-label="رجوع">${icon.prev}</a>
      <div style="min-width:0;flex:1"><h1 class="en reader-title" dir="auto">${esc(source.title)}</h1>
        <div class="tiny muted en">${esc(source.channel || (source.kind === 'text' ? 'نص أضفته' : ''))}${source.duration_seconds ? ` · ${fmtDuration(source.duration_seconds)}` : ''}</div></div>
      ${source.youtube_id && !source.is_demo ? `<a class="btn icon sm ghost" href="https://www.youtube.com/watch?v=${esc(source.youtube_id)}" target="_blank" rel="noopener" aria-label="فتح في يوتيوب">${icon.link}</a>` : ''}
      <button class="btn sm ghost" id="summaryBtn" title="ملخص المقطع: الفكرة، الفائدة، الخطوات والأقوال">📝<span class="btn-label"> الملخص</span></button>
      <button class="btn sm ghost" id="listenBtn" title="يقرأ لك كل جملة بالعربي ثم بالإنجليزي — تابع بأذنك">🎧<span class="btn-label"> استماع</span></button>
      <button class="btn icon sm ghost" id="del" aria-label="حذف المصدر" title="حذف المصدر">${icon.trash}</button>
    </div>
    <div class="listen-bar hidden" id="listenBar"><span id="listenNote">🎧 يقرأ…</span>
      <div class="segmented" id="listenOrder"><button data-order="ar-en">عربي ← إنجليزي</button><button data-order="en-ar">إنجليزي ← عربي</button></div>
      <button class="btn sm" id="listenStop">⏹ إيقاف</button></div>
    <div class="reader-tabs segmented"><button data-tab="text" class="active">${isVideo ? 'الفيديو والنص' : 'النص'}</button><button data-tab="words">كلمات مقترحة (<span id="wcount">${data.items.length}</span>)</button></div>
    <div class="reader-grid" data-tab="text">
      <div class="reader-main">
        <div class="reader-tools">
          <span class="goal-chip" id="goalChip" title="هدف اليوم: الكلمات التي مررت عليها"></span>
          <span class="tr-search"><input class="input sm" id="trQ" type="search" placeholder="🔎 ابحث في النص" aria-label="ابحث في النص"><span class="tiny muted" id="trQn"></span></span>
          ${isVideo && hasTimes ? `<div class="speed-pick" id="mode"><button type="button" class="btn sm ghost" id="modeBtn" aria-haspopup="true" aria-expanded="false" title="التشغيل: السرعة والتوقف والترديد"><span id="modeVal">▶ تشغيل</span> <span class="en-inline" id="speedVal">1×</span></button>
            <div class="speed-menu mode-menu hidden" role="menu"><div class="menu-label">السرعة</div><div class="gap-chips" id="speed">${[0.5, 0.75, 0.9, 1, 1.25, 1.5].map((r) => `<button type="button" data-rate="${r}" class="en-inline">${r}×</button>`).join('')}</div><div class="mode-sep"></div><label class="mode-switch"><input type="checkbox" class="check" id="gapOn"> ⏸ توقف بعد كل سطر</label><div class="gap-chips" id="gapChips">${[300, 500, 1000, 1500, 2000, 3000].map((ms) => `<button type="button" data-gap="${ms}" class="en-inline">${ms / 1000}ث</button>`).join('')}</div><div class="mode-sep"></div><button type="button" role="menuitem" data-mode="shadow">🗣 ردّد ورائي</button></div><button type="button" class="btn icon sm ghost hidden" id="modeOff" title="إيقاف التوقف — تشغيل عادي">✕</button></div>` : ''}
          ${isVideo && hasTimes ? '<button type="button" class="btn icon sm ghost" id="loopBtn" aria-pressed="false" title="كرّر الجملة الحالية حتى تفهمها (L)">🔁</button>' : ''}
          <div class="speed-pick" id="viewPick"><button type="button" class="btn sm ghost" id="viewBtn" aria-haspopup="true" aria-expanded="false" title="العرض: الترجمة، الخط، المتابعة">${icon.subtitles} العرض</button>
            <div class="speed-menu view-menu hidden" id="viewMenu">
              <label class="switch"><input type="checkbox" id="arToggle" ${showAr ? 'checked' : ''}> <span>الترجمة العربية</span></label>
              <div class="segmented ar-layout${showAr ? '' : ' hidden'}" id="arLayout" role="group" aria-label="مكان الترجمة"><button type="button" data-layout="side" title="العربي بجانب الإنجليزي">⇆ بجانبه</button><button type="button" data-layout="below" title="العربي تحت الإنجليزي">⇅ تحته</button></div>
              <button type="button" class="btn sm ghost" id="hideArBtn" aria-pressed="false" title="أخفِ العربي، والمسه لتراه (A)">🙈 أخفِ العربي حتى ألمسه</button>
              ${hasTimes ? `<label class="switch"><input type="checkbox" id="followToggle" ${follow ? 'checked' : ''}> <span>متابعة تلقائية للنص</span></label>` : ''}
              <div class="view-row"><span class="tiny muted">حجم الخط</span><div class="segmented fontsize" role="group" aria-label="حجم الخط"><button type="button" data-font="-1" title="خط أصغر">A−</button><button type="button" data-font="1" title="خط أكبر">A+</button></div></div>
            </div></div>
          <button type="button" class="btn icon sm ghost" id="focusBtn" aria-pressed="false" title="توسيع: إخفاء التفاصيل والتركيز على النص"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg></button>
          <span class="tiny mode-note" id="modeNote"></span>
          <span class="tiny muted" id="trNote"></span>
        </div>
        ${isVideo ? '<div class="player-box"><div id="player"></div></div><div class="split" id="split" role="separator" aria-orientation="horizontal" title="اسحب لتكبير الفيديو أو النص"><span></span></div>' : ''}
        <button type="button" class="btn sm primary back-now hidden" id="backNow">↓ الجملة الحالية</button>
        <div class="transcript ${showAr ? 'bilingual' : 'hide-ar'}${arLayout === 'below' ? ' ar-below' : ''}" id="lines"></div>
        <p class="tiny muted reader-hint">${isVideo && hasTimes ? 'اضغط أي كلمة: يقف الفيديو عندها ويظهر معناها، ويكمل حين تغلقها أو تحفظها. اسحب الفاصل تحت الفيديو لتكبيره أو تصغيره. لوحة المفاتيح: مسافة تشغيل/إيقاف · ← → الجملة السابقة/التالية · R أعد الجملة · L كرّرها · A أخفِ العربي.' : 'اضغط على أي كلمة لترى معناها في هذه الجملة.'} <span class="mark s-suggested">مقترحة</span> <span class="mark s-saved">محفوظة</span></p>
      </div>
      <aside class="reader-side card" id="side"></aside>
    </div>`;

  const linesEl = $('#lines', view);
  // Arabic beside the English (same row) or under it — the learner chooses.
  const showLayout = () => {
    linesEl.classList.toggle('ar-below', arLayout === 'below');
    view.querySelectorAll('#arLayout [data-layout]').forEach((b) => b.classList.toggle('active', b.dataset.layout === arLayout));
  };
  showLayout();
  view.querySelectorAll('#arLayout [data-layout]').forEach((b) => b.addEventListener('click', () => {
    arLayout = b.dataset.layout;
    setPref('reader.arLayout', arLayout);
    showLayout();
    recenter();
  }));
  // Font size of the transcript (remembered).
  let fontPx = Number(pref('reader.font', '16')) || 16;
  const applyFont = () => linesEl.style.setProperty('--reader-font', `${fontPx}px`);
  applyFont();
  view.querySelectorAll('[data-font]').forEach((b) => b.addEventListener('click', () => {
    fontPx = Math.max(12, Math.min(26, fontPx + Number(b.dataset.font)));
    setPref('reader.font', String(fontPx));
    applyFont();
    recenter();
  }));
  // "العرض" menu: Arabic, layout, hide Arabic, follow, font size — all in one place.
  const viewMenu = $('#viewMenu', view);
  const toggleView = (open) => { viewMenu.classList.toggle('hidden', !open); $('#viewBtn', view).setAttribute('aria-expanded', String(open)); };
  $('#viewBtn', view).addEventListener('click', () => toggleView(viewMenu.classList.contains('hidden')));
  const closeView = (e) => { if (!e.target.closest?.('#viewPick')) toggleView(false); };
  document.addEventListener('click', closeView);
  // After a font change or rotating the phone, bring the spoken sentence back into view.
  function recenter() {
    requestAnimationFrame(() => {
      const el = currentId != null && linesEl.querySelector(`.line[data-id="${currentId}"]`);
      if (el) bringIntoView(el, true);
    });
  }
  let resizeTimer = 0;
  const onResize = () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(recenter, 250); };
  window.addEventListener('resize', onResize);
  // Playback speed (slower = easier to follow), remembered.
  let rate = Number(pref('reader.rate', '1')) || 1;
  const speedMenu = $('#speed .speed-menu', view);
  const toggleSpeed = (open) => {
    speedMenu?.classList.toggle('hidden', !open);
    $('#speedBtn', view)?.setAttribute('aria-expanded', String(open));
  };
  const showRate = () => {
    view.querySelectorAll('#speed [data-rate]').forEach((b) => b.classList.toggle('active', Number(b.dataset.rate) === rate));
    const v = $('#speedVal', view);
    if (v) v.textContent = `${rate}×`;
  };
  showRate();
  const closeSpeed = (e) => { if (!e.target.closest?.('#speed')) toggleSpeed(false); };
  document.addEventListener('click', closeSpeed);
  $('#speed', view)?.addEventListener('click', (e) => {
    if (e.target.closest('#speedBtn')) { toggleSpeed(speedMenu.classList.contains('hidden')); return; }
    const b = e.target.closest('[data-rate]');
    if (!b) return;
    toggleSpeed(false);
    rate = Number(b.dataset.rate);
    setPref('reader.rate', String(rate));
    player?.setRate?.(rate);
    showRate();
  });
  // Focus mode: hide everything but the video and the transcript (toggle).
  let focusFs = false;
  const setFocus = (on) => {
    document.body.classList.toggle('reader-focus', on);
    const b = $('#focusBtn', view);
    b?.setAttribute('aria-pressed', String(on));
    b?.classList.toggle('primary', on);
    if (b) b.title = on ? 'إظهار تفاصيل الموقع' : 'توسيع: إخفاء التفاصيل والتركيز على النص';
    if (on && document.documentElement.requestFullscreen && !document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => { focusFs = true; }).catch(() => {});
    } else if (!on && focusFs && document.fullscreenElement) {
      focusFs = false;
      document.exitFullscreen().catch(() => {});
    }
  };
  $('#focusBtn', view)?.addEventListener('click', () => setFocus(!document.body.classList.contains('reader-focus')));
  const onFsChange = () => { if (focusFs && !document.fullscreenElement) { focusFs = false; setFocus(false); } };
  document.addEventListener('fullscreenchange', onFsChange);
  // Draggable divider: bigger video ↔ more transcript (remembered).
  const mainEl = $('.reader-main', view);
  const applySplit = (pct) => {
    const p = Math.max(30, Math.min(100, pct));
    mainEl.style.setProperty('--pw', `${p}%`);
    const box = $('.player-box', view);
    if (box) mainEl.style.setProperty('--ph', `${Math.round(box.getBoundingClientRect().height)}px`);
    return p;
  };
  let splitPct = applySplit(Number(pref('reader.split', '100')));
  $('#split', view)?.addEventListener('pointerdown', (e) => {
    const box = $('.player-box', view);
    const startY = e.clientY;
    const startH = box.getBoundingClientRect().height;
    const full = mainEl.getBoundingClientRect().width * (9 / 16);
    e.currentTarget.setPointerCapture(e.pointerId);
    box.style.pointerEvents = 'none';
    const move = (ev) => {
      splitPct = applySplit(((startH + ev.clientY - startY) / full) * 100);
    };
    const up = () => {
      box.style.pointerEvents = '';
      setPref('reader.split', String(Math.round(splitPct)));
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  });
  const side = $('#side', view);
  bindSpeech(view);

  const drawLines = () => {
    const keep = linesEl.scrollTop;
    linesEl.innerHTML = data.lines.map((l) => lineHtml(l, data.marks)).join('') || '<p class="muted">لا يوجد نص.</p>';
    linesEl.scrollTop = keep;
    if (currentId) linesEl.querySelector(`.line[data-id="${currentId}"]`)?.classList.add('current');
    currentWord = -1; // re-applied on the next tick
  };

  // Suggested words: filter by level, search, only unsaved; long lists shown 150 at a time.
  const sideKey = `reader.side.${id}`;
  const sideF = (() => { try { return { level: '', q: '', unsaved: false, ...JSON.parse(pref(sideKey, '{}')) }; } catch { return { level: '', q: '', unsaved: false }; } })();
  let sideLimit = 150;
  const sideShown = () => data.items.filter((it) => (!sideF.level || it.level === sideF.level)
    && (!sideF.unsaved || !it.user_state)
    && (!sideF.q || `${it.term} ${it.arabic || ''}`.toLowerCase().includes(sideF.q.toLowerCase())));
  const drawSide = () => {
    const shown = sideShown();
    const unsavedShown = shown.filter((i) => !i.user_state);
    const levels = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].filter((l) => data.items.some((i) => i.level === l));
    $('#wcount', view).textContent = data.items.length;
    side.innerHTML = `
      <div class="side-head">
        <div class="row between"><b>كلمات مقترحة <span class="tiny muted en-inline">(${shown.length}${shown.length !== data.items.length ? `/${data.items.length}` : ''})</span></b>
          ${unsavedShown.length ? `<button class="btn sm" id="saveAll">${icon.bookmark} حفظ ${shown.length !== data.items.length ? 'المعروض' : 'الكل'} (${unsavedShown.length})</button>` : ''}</div>
        ${data.items.length >= 4 ? (() => {
          const q = (extra) => `#/practice?${new URLSearchParams({ source: id, title: source.title.slice(0, 40), ...extra })}`;
          return `<div class="side-practice"><span class="tiny muted">🎯 تدرّب على كلمات المقطع:</span>
            <a class="chip" href="${q({ mode: 'cards' })}">بطاقات</a><a class="chip" href="${q({ mode: 'games', type: 'meaning' })}">المعنى</a>
            <a class="chip" href="${q({ mode: 'games', type: 'listen' })}">استمع واختر</a><a class="chip" href="${q({ mode: 'games', type: 'connect' })}">روابط</a></div>`;
        })() : ''}
        ${data.items.length > 12 ? `<div class="side-filters">
          <div class="side-levels"><button class="lv ${sideF.level ? '' : 'on'}" data-lv="">الكل</button>${levels.map((l) => `<button class="lv ${sideF.level === l ? 'on' : ''}" data-lv="${l}">${l}</button>`).join('')}</div>
          <div class="row" style="gap:6px"><input class="input sm" id="sideQ" type="search" placeholder="ابحث في الكلمات…" value="${esc(sideF.q)}" style="flex:1;min-width:0">
          <label class="row tiny" style="gap:4px;white-space:nowrap"><input type="checkbox" class="check" id="sideUnsaved" ${sideF.unsaved ? 'checked' : ''}> غير المحفوظة</label></div></div>` : ''}
        <p class="tiny muted" id="refineNote" style="margin:6px 0 0">${source.extractor === 'dictionary' ? (state.config.ai.available ? '<span class="spinner"></span> ✨ الذكاء الاصطناعي يختار كلمات أدق…' : 'مختارة من القاموس المحلي. اضغط أي كلمة في النص لمعناها.') : ''}</p>
      </div>
      <div class="side-list">${shown.slice(0, sideLimit).map((it) => `
        <div class="side-item ${it.user_state === 'dismissed' ? 'dim' : ''}" data-vid="${it.vocabulary_id}" data-line="${it.line_id}">
          <div style="min-width:0"><div class="row" style="gap:6px"><b class="en">${esc(it.term)}</b>${levelChip(it.level)}</div>
            <div class="small ink-2 clamp1">${esc(it.arabic || '')}</div></div>
          ${it.user_state === 'saved' ? '<span class="saved-tick" title="محفوظة">✓</span>' : `<button class="btn sm" data-save="${it.vocabulary_id}" data-occ="${it.occurrence_id}">حفظ</button>`}
        </div>`).join('') || '<p class="small muted">لا توجد كلمات هنا. غيّر الفلتر، أو اضغط أي كلمة في النص لتفهمها وتحفظها.</p>'}
        ${shown.length > sideLimit ? `<button class="btn sm ghost" id="sideMore" style="width:100%;margin-top:8px">عرض ${Math.min(150, shown.length - sideLimit)} أخرى (${shown.length - sideLimit} متبقية)</button>` : ''}</div>`;
  };
  const saveSideF = () => setPref(sideKey, JSON.stringify(sideF));
  side.addEventListener('click', (e) => {
    const lv = e.target.closest('[data-lv]');
    if (lv) { sideF.level = lv.dataset.lv; sideLimit = 150; saveSideF(); drawSide(); return; }
    if (e.target.closest('#sideMore')) { sideLimit += 150; drawSide(); }
  });
  side.addEventListener('input', (e) => {
    if (e.target.id !== 'sideQ') return;
    sideF.q = e.target.value;
    sideLimit = 150;
    const pos = e.target.selectionStart;
    drawSide();
    const q = $('#sideQ', view);
    q.focus();
    q.setSelectionRange(pos, pos);
  });
  side.addEventListener('change', (e) => {
    if (e.target.id !== 'sideUnsaved') return;
    sideF.unsaved = e.target.checked;
    saveSideF();
    drawSide();
  });

  const refresh = async () => {
    data = await api.source(id);
    timeline = buildTimeline(data.lines);
    drawLines();
    drawSide();
    refreshStats();
  };

  drawLines();
  drawSide();

  // AI work runs in short steps (one request each) so it fits any hosting
  // time limit; every finished step is saved, and the page stops when you leave.
  let alive = true;
  const ai = () => state.config.ai.available;

  // 1) Arabic subtitles: shown side by side with the English when switched on.
  const trNote = $('#trNote', view);
  const missingAr = () => data.lines.some((l) => !l.text_ar);
  let translating = false;
  const setTrNote = (html) => {
    trNote.innerHTML = html;
    $('#retryTr', view)?.addEventListener('click', ensureTranslation);
  };
  // Phrase-by-phrase alignment (English ↔ Arabic on the same row), from where the learner is.
  let aligning = false;
  const redrawLine = (line) => {
    const el = linesEl.querySelector(`.line[data-id="${line.id}"]`);
    if (!el) return;
    const wasCurrent = el.classList.contains('current');
    el.outerHTML = lineHtml(line, data.marks);
    if (wasCurrent) {
      linesEl.querySelector(`.line[data-id="${line.id}"]`)?.classList.add('current');
      currentWord = -1;
    }
  };
  async function ensureAlignment() {
    if (!showAr || aligning || !hasTimes || !state.config.ai.available) return;
    aligning = true;
    let complete = false;
    // Three batches at a time, starting where the learner is, so the visible lines are ready first.
    const worker = async (offset) => {
      for (let step = 0; alive && showAr && !complete && step < 40; step += 1) {
        const cur = data.lines.find((l) => l.id === currentId);
        const from = cur ? cur.idx : 0;
        let r;
        try {
          r = await api.alignStep(id, from, offset); // each worker takes a different batch
        } catch {
          return;
        }
        for (const a of r.lines || []) {
          const line = data.lines.find((l) => l.id === a.id);
          if (!line) continue;
          line.align = a.align;
          if (!line.text_ar && a.ar) line.text_ar = a.ar;
          redrawLine(line);
        }
        if (r.complete || r.ai_error) {
          complete = true;
          return;
        }
        if (!r.lines?.length) return; // nothing left for this worker
      }
    };
    try {
      await Promise.all([0, 12, 24, 36, 48].map(worker));
    } finally {
      aligning = false;
    }
  }

  async function ensureTranslation() {
    if (!showAr || !missingAr() || translating) return;
    if (!state.config.ai.configured) {
      setTrNote('ترجمة المقطع بالذكاء الاصطناعي غير متاحة — نعرض المتوفر فقط.');
      return;
    }
    translating = true;
    try {
      for (let step = 0; alive && showAr && step < APP_CONFIG.maxAiSteps; step += 1) {
        const have = data.lines.filter((l) => l.text_ar).length;
        setTrNote(`<span class="spinner"></span> نجهّز الترجمة العربية… ${have}/${data.lines.length}`);
        const r = await api.translateStep(id);
        for (const { id: lineId, ar } of r.lines || []) {
          const line = data.lines.find((l) => l.id === lineId);
          if (line && !line.text_ar) {
            line.text_ar = ar;
            if (!line.align) redrawLine(line);
          }
        }
        if (r.complete) {
          if (r.ai_error && missingAr()) setTrNote(`تعذّرت الترجمة: ${esc(r.ai_error)} <button class="link-btn" id="retryTr">أعد المحاولة</button>`);
          else setTrNote('');
          break;
        }
        await sleep(APP_CONFIG.aiStepPauseMs);
      }
    } catch {
      setTrNote('تعذّرت الترجمة الآن. <button class="link-btn" id="retryTr">أعد المحاولة</button>');
    } finally {
      translating = false;
      if (!alive) return;
      if (!missingAr()) setTrNote('');
    }
  }
  ensureAlignment();
  ensureTranslation();

  // 2) Smarter word choice: AI reads the transcript in chunks and adds the
  //    useful words / expressions with their meaning in context.
  async function refineWords() {
    if (source.is_demo || source.extractor === 'ai' || !ai()) return;
    const note = () => $('#refineNote', view);
    try {
      for (let step = 0; alive && step < APP_CONFIG.maxAiSteps; step += 1) {
        const r = await api.refineStep(id);
        if (!alive) return;
        if (r.added) await refresh();
        const n = note();
        if (r.done) {
          if (n) n.innerHTML = r.ai_error ? `${esc(r.ai_error)}` : '';
          if (!r.ai_error) source.extractor = 'ai';
          drawSide();
          break;
        }
        if (n) n.innerHTML = `<span class="spinner"></span> ✨ الذكاء الاصطناعي يختار كلمات أدق… ${Math.round((100 * r.cursor) / Math.max(1, r.total))}%`;
        await sleep(APP_CONFIG.aiStepPauseMs);
      }
    } catch {
      /* the dictionary words stay; nothing lost */
    }
  }
  refineWords();
  // 🎯 Today's goal: words gone through (opened or saved one by one) in any video.
  const showGoal = (g) => {
    const chip = $('#goalChip', view);
    if (!chip || !g) return;
    chip.innerHTML = `🎯 <b class="en-inline">${Math.min(g.count, g.goal)}/${g.goal}</b>${g.count >= g.goal ? ' ✓' : ''}`;
    chip.classList.toggle('done', g.count >= g.goal);
  };
  api.today().then((t) => showGoal(t.watch_goal)).catch(() => {});
  const onGoal = (e) => {
    showGoal(e.detail);
    if (e.detail.just_reached) {
      closeWordPanel();
      player?.pause?.();
      celebrateGoal(e.detail, `#/practice?${new URLSearchParams({ source: id, title: source.title.slice(0, 40), mode: 'cards' })}`);
    }
  };
  window.addEventListener('lexitube:goal', onGoal);
  // Every word of the built-in dictionary used in this video (once per video, no AI).
  if ((!source.dict_words_at || !source.simplified) && !source.is_demo) {
    api.dictionaryWords(id).then((r) => { if (alive && (r.added || r.simplified)) refresh(); }).catch(() => {});
  }

  // Player + sync.
  const startAt = params.t ? Number(params.t) : null;
  // Continue where the learner stopped last time (unless a link asks for a moment).
  const saved = Number(source.progress_seconds) || 0;
  const resumeAt = isVideo && hasTimes && startAt == null && !params.line && saved > 5
    && (!source.duration_seconds || saved < source.duration_seconds - 10) ? saved : null;
  if (isVideo) {
    const box = $('#player', view);
    if (source.is_demo) {
      player = demoPlayer(box.parentElement, source.duration_seconds || 600);
      player.setRate(rate);
      if (resumeAt != null) player.seek(resumeAt, { play: false });
    } else {
      box.parentElement.innerHTML = '<div id="player"></div>';
      youtubePlayer($('#player', view), source.youtube_id, startAt ?? resumeAt, (isPlaying) => setPlaying(isPlaying)).then((p) => {
        player = p;
        player.setRate?.(rate);
      }).catch(() => {
        $('.player-box', view).innerHTML = `<div class="alert info">تعذّر تحميل مشغّل يوتيوب. يمكنك القراءة هنا، أو <a href="https://www.youtube.com/watch?v=${esc(source.youtube_id)}" target="_blank" rel="noopener">فتح الفيديو في يوتيوب</a>.</div>`;
      });
    }
  }

  // Keep the current sentence comfortably in view (only scroll when it leaves the middle band).
  const bringIntoView = (el, force = false) => {
    if (!el || isPanelOpen() || (!force && Date.now() < userScrollUntil)) return;
    // Position inside the transcript box, measured on screen (independent of offsetParent).
    const box = linesEl.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    const top = r.top - box.top + linesEl.scrollTop;
    const view0 = linesEl.scrollTop;
    const h = linesEl.clientHeight;
    // Keep the spoken sentence about a third of the way down; scroll only when it
    // leaves the comfortable band, so the text moves steadily down with the speech.
    if (force || top < view0 + h * 0.08 || top + r.height > view0 + h * 0.7) {
      const target = Math.max(0, Math.min(top - h * 0.3, linesEl.scrollHeight - h));
      if (Math.abs(target - view0) > 4) linesEl.scrollTo({ top: target, behavior: force ? 'auto' : 'smooth' });
    }
  };
  const setCurrent = (lineId, { scroll = follow, force = false } = {}) => {
    if (lineId === currentId) return;
    linesEl.querySelectorAll('.c-now, .c-said').forEach((c) => c.classList.remove('c-now', 'c-said'));
    linesEl.querySelector('.line.current')?.classList.remove('current');
    linesEl.querySelectorAll('.w-now, .w-said').forEach((w) => w.classList.remove('w-now', 'w-said'));
    currentId = lineId;
    currentWord = -1;
    const el = lineId != null && linesEl.querySelector(`.line[data-id="${lineId}"]`);
    if (!el) return;
    el.classList.add('current');
    if (scroll) bringIntoView(el, force);
  };
  const setWord = (wi) => {
    if (wi === currentWord) return;
    currentWord = wi;
    const el = currentId != null && linesEl.querySelector(`.line[data-id="${currentId}"]`);
    if (!el) return;
    el.querySelectorAll('.w-now, .w-said').forEach((w) => w.classList.remove('w-now', 'w-said'));
    // Phrase rows: the phrase being spoken lights up in English and Arabic together.
    el.querySelectorAll('.chunk').forEach((c) => {
      const w0 = Number(c.dataset.w0);
      const w1 = Number(c.dataset.w1);
      c.classList.toggle('c-now', wi >= 0 && wi >= w0 && wi <= w1);
      c.classList.toggle('c-said', wi >= 0 && w1 >= 0 && w1 < wi);
    });
    // Arabic follows the same progress through the sentence (word order differs, so it is proportional).
    const ar = el.querySelectorAll('.aw');
    if (ar.length) {
      const total = el.querySelectorAll('[data-wi]').length || 1;
      const upto = wi < 0 ? -1 : Math.min(ar.length - 1, Math.floor(((wi + 0.5) / total) * ar.length));
      ar.forEach((a, k) => {
        a.classList.toggle('w-said', k < upto);
        a.classList.toggle('w-now', k === upto);
      });
    }
    if (wi < 0) return;
    el.querySelectorAll('[data-wi]').forEach((w) => {
      const k = Number(w.dataset.wi);
      if (k < wi) w.classList.add('w-said');
      else if (k === wi) w.classList.add('w-now');
    });
  };
  const lineAt = (t) => {
    const i = positionAt(timeline, t).line;
    return i >= 0 ? timeline[i] : null;
  };
  // One sync step from the real player time.
  let lastT = null;
  let steady = null; // last shown position (keeps the highlight moving forward)
  let resumeAfterWord = false;
  // Playback modes: a short pause after each sentence, or "repeat after me"
  // (a silence as long as the sentence, so the learner can say it, then it continues).
  let playMode = pref('reader.mode', 'normal');
  let loopId = null; // the sentence being repeated
  let gapMs = Math.max(200, Math.min(3000, Number(pref('reader.gapMs', '1000')) || 1000));
  let gapTimer = 0;
  let gapTick = 0;
  let gapDoneFor = null;
  let prevEntry = null;
  const modeNote = (t) => { const n = $('#modeNote', view); if (n) n.textContent = t; };
  const cancelGap = () => {
    const was = Boolean(gapTimer);
    clearTimeout(gapTimer);
    clearInterval(gapTick);
    gapTimer = 0;
    gapTick = 0;
    modeNote('');
    return was;
  };
  function startGap(entry) {
    gapDoneFor = entry.id;
    const ms = playMode === 'shadow'
      ? Math.max(1500, ((entry.end - entry.start) * 1000) / (rate || 1) + 600)
      : gapMs;
    player.pause();
    const until = Date.now() + ms;
    const show = () => {
      const left = Math.max(0, Math.ceil((until - Date.now()) / 1000));
      modeNote(playMode === 'shadow' ? `🗣 ردّد الجملة الآن… ${left}` : '⏸ …');
    };
    show();
    gapTick = setInterval(show, 250);
    gapTimer = setTimeout(() => {
      cancelGap();
      if (alive && !isPanelOpen()) player.play();
    }, ms);
  }
  const secs = () => `${gapMs >= 1000 ? gapMs / 1000 : (gapMs / 1000).toFixed(1)}ث`;
  const showMode = () => {
    const labels = { normal: '▶ تشغيل', gap: `⏸ توقف ${secs()}`, shadow: '🗣 ردّد ورائي' };
    const v = $('#modeVal', view);
    if (v) v.textContent = labels[playMode] || labels.normal;
    const on = $('#gapOn', view);
    if (on) on.checked = playMode === 'gap';
    view.querySelectorAll('#gapChips [data-gap]').forEach((b) => b.classList.toggle('active', playMode === 'gap' && Number(b.dataset.gap) === gapMs));
    view.querySelectorAll('#mode [data-mode]').forEach((b) => b.classList.toggle('active', b.dataset.mode === playMode));
    $('#modeBtn', view)?.classList.toggle('primary', playMode !== 'normal');
    $('#modeOff', view)?.classList.toggle('hidden', playMode === 'normal');
  };
  const setMode = (m) => {
    playMode = m;
    setPref('reader.mode', playMode);
    gapDoneFor = null;
    if (cancelGap() && alive) player?.play?.();
    showMode();
  };
  const modeMenu = $('#mode .speed-menu', view);
  const toggleMode = (open) => {
    modeMenu?.classList.toggle('hidden', !open);
    $('#modeBtn', view)?.setAttribute('aria-expanded', String(open));
  };
  const closeMode = (e) => { if (!e.target.closest?.('#mode')) toggleMode(false); };
  document.addEventListener('click', closeMode);
  $('#mode', view)?.addEventListener('click', (e) => {
    if (e.target.closest('#modeBtn')) { toggleMode(modeMenu.classList.contains('hidden')); return; }
    if (e.target.closest('#modeOff')) { setMode('normal'); return; }
    const chip = e.target.closest('[data-gap]');
    if (chip) {
      gapMs = Number(chip.dataset.gap);
      setPref('reader.gapMs', String(gapMs));
      setMode('gap');
      return;
    }
    const b = e.target.closest('[data-mode]');
    if (!b) return;
    toggleMode(false);
    setMode(playMode === b.dataset.mode ? 'normal' : b.dataset.mode);
  });
  $('#gapOn', view)?.addEventListener('change', (e) => setMode(e.target.checked ? 'gap' : 'normal'));
  showMode();

  // 🔁 Repeat the current sentence
  const showLoop = () => {
    const b = $('#loopBtn', view);
    if (!b) return;
    b.classList.toggle('primary', loopId != null);
    b.setAttribute('aria-pressed', String(loopId != null));
    linesEl.querySelectorAll('.line.looping').forEach((l) => l.classList.remove('looping'));
    if (loopId != null) linesEl.querySelector(`.line[data-id="${loopId}"]`)?.classList.add('looping');
  };
  const toggleLoop = () => {
    loopId = loopId == null ? (currentId ?? timeline[0]?.id ?? null) : null;
    if (loopId != null) {
      const e = timeline.find((x) => x.id === loopId);
      if (e) player?.seek?.(Math.max(0, e.start - 0.05));
      lastT = null;
    }
    showLoop();
  };
  $('#loopBtn', view)?.addEventListener('click', toggleLoop);

  // 🙈 Hide the Arabic until it is touched (try to understand first)
  let hideAr = pref('reader.hideAr', '0') === '1';
  const showHideAr = () => {
    linesEl.classList.toggle('ar-hidden', hideAr);
    linesEl.querySelectorAll('.ar-shown').forEach((x) => x.classList.remove('ar-shown'));
    const b = $('#hideArBtn', view);
    b?.classList.toggle('primary', hideAr);
    b?.setAttribute('aria-pressed', String(hideAr));
  };
  const toggleHideAr = () => {
    hideAr = !hideAr;
    setPref('reader.hideAr', hideAr ? '1' : '0');
    showHideAr();
  };
  $('#hideArBtn', view)?.addEventListener('click', toggleHideAr);
  showHideAr();
  linesEl.addEventListener('click', (e) => {
    if (!hideAr) return;
    const ar = e.target.closest('.c-ar, .line-ar');
    if (ar && !ar.classList.contains('ar-shown')) {
      ar.classList.add('ar-shown');
      e.stopPropagation();
    }
  }, true);

  // ⌨️ Keyboard: space, ← →, R, L, A
  const stepLine = (dir) => {
    const i = timeline.findIndex((x) => x.id === currentId);
    const next = timeline[Math.max(0, Math.min(timeline.length - 1, (i < 0 ? 0 : i) + dir))];
    if (!next || !player) return;
    if (loopId != null) { loopId = next.id; showLoop(); }
    player.seek(Math.max(0, next.start - 0.05));
    lastT = null;
    tick();
  };
  const onKey = (e) => {
    if (e.target.closest?.('input, textarea, select, [contenteditable]') || e.metaKey || e.ctrlKey || e.altKey || isPanelOpen()) return;
    const k = e.key.toLowerCase();
    if (k === ' ' && player) {
      e.preventDefault();
      if (player.playing?.()) player.pause(); else player.play();
    } else if (e.key === 'ArrowRight') { e.preventDefault(); stepLine(-1); } // RTL page: → goes back
    else if (e.key === 'ArrowLeft') { e.preventDefault(); stepLine(1); }
    else if (k === 'r') {
      const cur = timeline.find((x) => x.id === currentId);
      if (cur && player) { player.seek(Math.max(0, cur.start - 0.05)); lastT = null; }
    } else if (k === 'l') toggleLoop();
    else if (k === 'a') toggleHideAr();
  };
  document.addEventListener('keydown', onKey);
  const tick = () => {
    if (!player || !timeline.length) return;
    let t = player.time();
    // 🔁 Repeat one sentence: back to its start each time it ends.
    if (loopId != null && playing) {
      const e = timeline.find((x) => x.id === loopId);
      if (e && (t >= e.end - 0.12 || t < e.start - 1.5)) {
        player.seek(Math.max(0, e.start - 0.05));
        lastT = null;
        t = Math.max(0, e.start - 0.05);
      }
    }
    // A jump (seek on the YouTube bar, or a click here) brings the transcript along at once.
    const jumped = lastT !== null && Math.abs(t - lastT) > 2;
    lastT = t;
    const pos = steadyPosition(timeline, t, jumped ? null : steady, { playing });
    steady = pos;
    const entry = pos.line >= 0 ? timeline[pos.line] : null;
    setCurrent(entry ? entry.id : null, { force: jumped });
    setWord(pos.word);
    if (jumped) gapDoneFor = null; // after a seek, pause again at the end of the sentence reached
    if (playMode !== 'normal' && loopId == null && playing && entry && !gapTimer) {
      if (gapDoneFor !== entry.id && t >= entry.end - 0.25) startGap(entry);
      else if (!jumped && prevEntry && prevEntry.id !== entry.id && gapDoneFor !== prevEntry.id && entry.start >= prevEntry.end - 0.01 && t - entry.start < 1) {
        // The clock stepped past the end of the last sentence: go back to its end and pause there.
        player.seek(Math.max(0, entry.start - 0.05), { play: false });
        lastT = null;
        startGap(prevEntry);
      }
    }
    prevEntry = entry;
  };
  const loop = () => {
    tick();
    frame = playing ? requestAnimationFrame(loop) : 0;
  };
  function setPlaying(isPlaying) {
    if (playing && !isPlaying && !gapTimer) setTimeout(() => saveProgress(), 0);
    playing = isPlaying;
    linesEl.classList.toggle('is-playing', isPlaying);
    if (isPlaying && !frame) frame = requestAnimationFrame(loop);
    if (!isPlaying) tick();
  }
  if (hasTimes) {
    // Smooth rAF while playing; a slow check otherwise (seek while paused, demo player).
    syncTimer = setInterval(() => {
      if (!player) return;
      const now = player.playing?.() ?? false;
      if (now !== playing) setPlaying(now);
      if (!playing) tick();
    }, 300);
    const markUserScroll = () => {
      userScrollUntil = Date.now() + 4000;
    };
    linesEl.addEventListener('wheel', markUserScroll, { passive: true });
    linesEl.addEventListener('touchmove', markUserScroll, { passive: true });
  }
  // Deep links: ?t=seconds or ?line=id
  if (startAt != null) {
    const l = lineAt(startAt);
    if (l) setTimeout(() => setCurrent(l.id, { scroll: true, force: true }), 50);
    if (player?.seek) player.seek(startAt);
    else setTimeout(() => player?.seek?.(startAt), 600);
  }
  if (resumeAt != null) {
    const l = lineAt(resumeAt);
    if (l) setTimeout(() => setCurrent(l.id, { scroll: true, force: true }), 50);
    const note = document.createElement('div');
    note.className = 'resume-note';
    note.innerHTML = `▶ تكمل من حيث توقفت (<span class="en-inline">${fmtTime(resumeAt)}</span>) <button type="button" class="link-btn" data-restart>ابدأ من البداية</button>`;
    linesEl.before(note);
    note.querySelector('[data-restart]').addEventListener('click', () => {
      player?.seek?.(0, { play: false });
      lastT = null;
      tick();
      note.remove();
    });
    setTimeout(() => note.remove(), 15000);
  }
  // Remember the position: while playing, on pause, and when leaving.
  let savedAt = resumeAt ?? saved;
  const saveProgress = (keepalive = false) => {
    if (!isVideo || !player?.time) return;
    const t = player.time();
    if (!Number.isFinite(t) || Math.abs(t - savedAt) < 3) return;
    savedAt = t;
    api.saveProgress(id, t, keepalive);
  };
  const progressTimer = isVideo ? setInterval(() => { if (playing) saveProgress(); }, 10000) : 0;
  if (params.line) {
    setTimeout(() => {
      const el = linesEl.querySelector(`.line[data-id="${params.line}"]`);
      if (el) {
        setCurrent(Number(params.line), { scroll: true, force: true });
        el.classList.add('flash');
      }
    }, 50);
  }

  /* ----------------------------------------------------------- events */

  const onChange = () => refresh();
  const seekToLine = (lineEl) => {
    const t = Number(lineEl.dataset.start);
    if (!player || lineEl.dataset.start === '' || !Number.isFinite(t)) return false;
    if (cancelGap()) player.play?.();
    gapDoneFor = null;
    if (loopId != null) { loopId = Number(lineEl.dataset.id); showLoop(); }
    player.seek(t);
    setCurrent(Number(lineEl.dataset.id), { scroll: false });
    tick();
    return true;
  };
  linesEl.addEventListener('click', (e) => {
    const line = e.target.closest('.line');
    if (!line) return;
    if (e.target.closest('[data-seek]')) {
      seekToLine(line);
      return;
    }
    if (window.getSelection()?.toString()) return; // selecting text for "explain"
    const chunkAr = e.target.closest('.c-ar');
    if (chunkAr && player) {
      const entry0 = timeline.find((x) => String(x.id) === line.dataset.id);
      const w0 = Number(chunkAr.closest('.chunk')?.dataset.w0);
      const t0 = entry0?.words?.[w0]?.start ?? entry0?.start;
      if (Number.isFinite(t0)) {
        player.seek(Math.max(0, t0 - 0.1));
        lastT = null;
        tick();
      }
      return;
    }
    const mark = e.target.closest('.mark');
    const tok = e.target.closest('.tok');
    const wEl = e.target.closest('[data-wi]');
    const entry = timeline.find((x) => String(x.id) === line.dataset.id);
    const wi = wEl ? Number(wEl.dataset.wi) : -1;
    // A word: the video goes to it and waits (paused) while its meaning is open;
    // closing the meaning (or saving) continues playback if it was playing.
    if (mark || tok) {
      const inGap = cancelGap();
      if (player && !isPanelOpen()) resumeAfterWord = resumeAfterWord || inGap || (player.playing?.() ?? false);
      if (player && entry?.words?.[wi]) {
        player.seek(Math.max(0, entry.words[wi].start - 0.15), { play: false });
        setCurrent(entry.id, { scroll: false });
        lastT = null;
        tick();
      }
      player?.pause?.();
      const onClose = () => {
        if (resumeAfterWord && alive) player?.play?.();
        resumeAfterWord = false;
      };
      if (mark) openWordPanel(mark, { vocabulary_id: mark.dataset.vid, line_id: line.dataset.id }, { onChange, onClose });
      else openWordPanel(tok, { word: tok.dataset.w, line_id: line.dataset.id }, { onChange, onClose });
      return;
    }
    if (player && entry?.words?.[wi]) {
      player.seek(Math.max(0, entry.words[wi].start - 0.15)); // a small word (the, of…): jump there
      return;
    }
    seekToLine(line); // the sentence itself (not a word): jump there
  });

  side.addEventListener('click', async (e) => {
    const save = e.target.closest('[data-save]');
    try {
      if (save) {
        e.stopPropagation();
        save.disabled = true;
        await api.saveWord(Number(save.dataset.save), Number(save.dataset.occ));
        toast('تم الحفظ ✓');
        return refresh();
      }
      if (e.target.closest('#saveAll')) {
        const unsaved = sideShown().filter((i) => !i.user_state);
        const btn = e.target.closest('#saveAll');
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner"></span> نحفظ…';
        // one request; "save all" does not count as words gone through
        const r = await api.saveWordsBulk(unsaved.map((it) => ({ vocabulary_id: it.vocabulary_id, occurrence_id: it.occurrence_id })));
        toast(`تم حفظ ${r.saved} كلمة ✓`);
        return refresh();
      }
      const item = e.target.closest('.side-item');
      if (item) {
        if (window.matchMedia('(max-width: 900px)').matches) switchTab('text');
        const lineEl = linesEl.querySelector(`.line[data-id="${item.dataset.line}"]`);
        if (lineEl) {
          setCurrent(Number(item.dataset.line), { scroll: true });
          const it = data.items.find((x) => String(x.vocabulary_id) === item.dataset.vid);
          if (it?.timestamp_seconds != null) player?.seek?.(it.timestamp_seconds);
          const target = lineEl.querySelector(`.mark[data-vid="${item.dataset.vid}"]`) || lineEl;
          setTimeout(() => openWordPanel(target, { vocabulary_id: item.dataset.vid, line_id: item.dataset.line }, { onChange }), 350);
        }
      }
    } catch (err) {
      toast(err.message);
    }
  });

  /* ------------------------------------------- explain a selection (AI) */

  const explainBtn = document.createElement('button');
  explainBtn.className = 'btn sm primary explain-fab hidden';
  explainBtn.type = 'button';
  explainBtn.innerHTML = '✨ اشرح بالذكاء الاصطناعي';
  document.body.append(explainBtn);
  let selection = null;
  const hideExplain = () => explainBtn.classList.add('hidden');
  const onSelect = () => setTimeout(() => {
    const sel = window.getSelection();
    const text = sel?.toString().replace(/\s+/g, ' ').trim() || '';
    const lineEl = sel?.anchorNode && linesEl.contains(sel.anchorNode) ? sel.anchorNode.parentElement?.closest('.line') : null;
    if (!lineEl || text.length < 2 || text.length > 300) return hideExplain();
    const r = sel.getRangeAt(0).getBoundingClientRect();
    selection = { text, lineId: Number(lineEl.dataset.id) };
    explainBtn.style.top = `${Math.max(8, r.top + window.scrollY - 44)}px`;
    explainBtn.style.left = `${Math.max(8, Math.min(window.innerWidth - 230, r.left + window.scrollX))}px`;
    explainBtn.classList.remove('hidden');
    return undefined;
  }, 10);
  linesEl.addEventListener('mouseup', onSelect);
  linesEl.addEventListener('touchend', onSelect);
  document.addEventListener('selectionchange', () => {
    if (!window.getSelection()?.toString().trim()) setTimeout(hideExplain, 150);
  });
  explainBtn.addEventListener('mousedown', (e) => e.preventDefault()); // keep the selection
  explainBtn.addEventListener('click', async () => {
    if (!selection) return;
    hideExplain();
    const { text, lineId } = selection;
    openModal(`<div class="stack"><b class="en" dir="ltr">${esc(text)}</b><p class="small muted"><span class="spinner"></span> الذكاء الاصطناعي يشرح…</p></div>`);
    const box = document.querySelector('.modal .stack') || document.querySelector('.modal');
    try {
      const r = await api.explain(text, lineId);
      const words = r.key_words || [];
      box.innerHTML = `
        <b class="en" dir="ltr" style="font-size:18px">${esc(text)}</b>
        <p style="font-size:17px;margin:0">${esc(r.arabic)}</p>
        <p class="small ink-2" style="margin:0">${esc(r.explanation)}</p>
        ${r.simple_english ? `<p class="small en" dir="ltr" style="margin:0">${esc(r.simple_english)}</p>` : ''}
        ${r.grammar_note ? `<p class="tiny muted" style="margin:0">📝 ${esc(r.grammar_note)}</p>` : ''}
        ${words.length ? `<div class="stack" style="gap:8px"><b class="small">كلمات مفيدة</b>${words.map((w, i) => `
          <div class="row between" style="gap:8px"><div><b class="en">${esc(w.term)}</b> ${levelChip(w.level)} <span class="small ink-2">${esc(w.arabic)}</span>
            ${w.note ? `<div class="tiny muted">${esc(w.note)}</div>` : ''}</div>
            <button class="btn sm" data-ai-save="${i}">حفظ</button></div>`).join('')}</div>` : ''}
        <p class="tiny muted" style="margin:0">✨ OpenRouter · ${esc(state.config.ai.model || '')}</p>`;
      box.querySelectorAll('[data-ai-save]').forEach((b) => b.addEventListener('click', async () => {
        b.disabled = true;
        try {
          const w = words[Number(b.dataset.aiSave)];
          const info = await api.lookup({ word: w.term, line_id: lineId });
          if (!info.found) throw new Error('تعذّر حفظ هذه الكلمة.');
          await api.saveWord(info.vocabulary_id, info.occurrence_id || undefined);
          b.textContent = '✓ محفوظة';
          refresh();
        } catch (err) {
          b.disabled = false;
          toast(err.message);
        }
      }));
    } catch (err) {
      box.innerHTML = `<b class="en" dir="ltr">${esc(text)}</b><div class="alert" role="alert">${esc(err.message)}</div>`;
    }
  });

  $('#arToggle', view).addEventListener('change', (e) => {
    showAr = e.target.checked;
    setPref('reader.ar', showAr ? '1' : '0');
    linesEl.classList.toggle('hide-ar', !showAr);
    linesEl.classList.toggle('bilingual', showAr);
    $('#arLayout', view)?.classList.toggle('hidden', !showAr);
    ensureAlignment();
    ensureTranslation();
  });
  $('#followToggle', view)?.addEventListener('change', (e) => {
    follow = e.target.checked;
    setPref('reader.follow', follow ? '1' : '0');
  });
  const switchTab = (t) => {
    tab = t;
    $('.reader-grid', view).dataset.tab = t;
    view.querySelectorAll('.reader-tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === t));
  };
  view.querySelector('.reader-tabs').addEventListener('click', (e) => {
    const b = e.target.closest('[data-tab]');
    if (b) switchTab(b.dataset.tab);
  });
  /* 📝 Summary of the video */
  let summaryCache = null;
  $('#summaryBtn', view)?.addEventListener('click', async () => {
    const box = openModal('<h2>📝 ملخص المقطع</h2><p class="muted"><span class="spinner"></span> نقرأ المقطع كاملًا ونلخّصه…</p>', { wide: true });
    try {
      summaryCache = summaryCache || await api.summary(id);
      const s = summaryCache;
      box.innerHTML = `<button class="btn icon sm ghost modal-close" data-close aria-label="إغلاق">${icon.x}</button>
        <h2 style="margin-bottom:4px">📝 ملخص المقطع</h2><div class="tiny muted en" style="margin-bottom:12px">${esc(source.title)}</div>
        <div class="sum-sec"><b>💡 الفكرة</b><p>${esc(s.idea)}</p></div>
        <div class="sum-sec"><b>🎁 الفائدة</b><p>${esc(s.benefit)}</p></div>
        ${s.points.length ? `<div class="sum-sec"><b>📌 أهم النقاط</b><ul>${s.points.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}
        ${s.steps.length ? `<div class="sum-sec"><b>✅ خطوات عملية</b><ol>${s.steps.map((x) => `<li>${esc(x)}</li>`).join('')}</ol></div>` : ''}
        ${s.quotes.length ? `<div class="sum-sec"><b>💬 أقوال وحِكم من المقطع</b>${s.quotes.map((q) => `<blockquote class="sum-quote"><p class="en" dir="ltr">“${esc(q.en)}” <button class="btn icon sm ghost" data-say="${esc(q.en)}" aria-label="استمع">🔊</button></p><p>${esc(q.ar)}</p></blockquote>`).join('')}</div>` : ''}`;
      bindSpeech(box);
    } catch (err) {
      box.innerHTML = `<button class="btn icon sm ghost modal-close" data-close aria-label="إغلاق">${icon.x}</button><h2>📝 ملخص المقطع</h2><div class="alert">${esc(err.message)}</div>`;
    }
  });

  /* 🎧 Listen: each sentence read aloud, Arabic then English (or the other way) — follow by ear */
  let listenRun = 0;
  let listenOrder = pref('reader.listenOrder', 'ar-en');
  let wakeLock = null;
  const listenBar = $('#listenBar', view);
  const showOrder = () => view.querySelectorAll('#listenOrder [data-order]').forEach((b) => b.classList.toggle('active', b.dataset.order === listenOrder));
  const stopListening = () => {
    listenRun += 1;
    stopSpeech();
    listenBar?.classList.add('hidden');
    $('#listenBtn', view)?.classList.remove('primary');
    wakeLock?.release?.().catch(() => {});
    wakeLock = null;
  };
  const startListening = async () => {
    const my = ++listenRun;
    player?.pause?.();
    listenBar.classList.remove('hidden');
    $('#listenBtn', view).classList.add('primary');
    showOrder();
    try { wakeLock = await navigator.wakeLock?.request?.('screen'); } catch { /* screen may sleep */ }
    const ok = () => my === listenRun && alive;
    let i = Math.max(0, data.lines.findIndex((l) => l.id === currentId));
    for (; i < data.lines.length && ok(); i += 1) {
      const line = data.lines[i];
      setCurrent(line.id, { scroll: true, force: true });
      $('#listenNote', view).textContent = `🎧 ${i + 1} / ${data.lines.length}`;
      const parts = listenOrder === 'ar-en' ? [[line.text_ar, 'ar'], [line.text, 'en']] : [[line.text, 'en'], [line.text_ar, 'ar']];
      for (const [text, lang] of parts) {
        if (!text || !ok()) continue;
        try { await speak(text, { lang }); } catch { /* skip */ }
        await sleep(250);
      }
      await sleep(450);
    }
    if (ok()) stopListening();
  };
  $('#listenBtn', view)?.addEventListener('click', () => (listenBar.classList.contains('hidden') ? startListening() : stopListening()));
  $('#listenStop', view)?.addEventListener('click', stopListening);
  view.querySelectorAll('#listenOrder [data-order]').forEach((b) => b.addEventListener('click', () => {
    listenOrder = b.dataset.order;
    setPref('reader.listenOrder', listenOrder);
    showOrder();
  }));

  /* 🔎 Search in the transcript (Enter = next match) */
  let hits = [];
  let hitAt = -1;
  const trQ = $('#trQ', view);
  const findHits = () => {
    const q = trQ.value.trim().toLowerCase();
    linesEl.querySelectorAll('.line.hit').forEach((l) => l.classList.remove('hit'));
    hits = q.length < 2 ? [] : data.lines.filter((l) => `${l.text} ${l.text_ar || ''}`.toLowerCase().includes(q)).map((l) => l.id);
    hits.forEach((lid) => linesEl.querySelector(`.line[data-id="${lid}"]`)?.classList.add('hit'));
    hitAt = -1;
    $('#trQn', view).textContent = q.length < 2 ? '' : hits.length ? `${hits.length} نتيجة` : 'لا نتائج';
  };
  const nextHit = () => {
    if (!hits.length) return;
    hitAt = (hitAt + 1) % hits.length;
    const el = linesEl.querySelector(`.line[data-id="${hits[hitAt]}"]`);
    userScrollUntil = Date.now() + 8000;
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    el?.classList.remove('flash'); void el?.offsetWidth; el?.classList.add('flash');
    $('#trQn', view).textContent = `${hitAt + 1}/${hits.length}`;
  };
  trQ?.addEventListener('input', findHits);
  trQ?.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); nextHit(); } });

  /* ↓ Back to the sentence being spoken after scrolling away */
  const backNow = $('#backNow', view);
  const checkBack = () => {
    const el = currentId != null && linesEl.querySelector(`.line[data-id="${currentId}"]`);
    if (!el || !backNow) return;
    const box = linesEl.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    const inBox = r.bottom > box.top && r.top < box.bottom;
    const onScreen = r.bottom > 0 && r.top < window.innerHeight;
    backNow.classList.toggle('hidden', inBox && onScreen);
  };
  linesEl.addEventListener('scroll', () => requestAnimationFrame(checkBack), { passive: true });
  const backTimer = setInterval(checkBack, 700); // also after smooth scrolls and page scrolling
  backNow?.addEventListener('click', () => {
    userScrollUntil = 0;
    const el = linesEl.querySelector(`.line[data-id="${currentId}"]`);
    if (el) bringIntoView(el, true);
    backNow.classList.add('hidden');
  });

  $('#del', view).addEventListener('click', async () => {
    if (!confirm('حذف هذا المصدر ونصّه؟ كلماتك المحفوظة تبقى كما هي.')) return;
    await api.deleteSource(id);
    toast('تم الحذف');
    location.hash = '#/add';
  });

  return () => {
    alive = false;
    clearInterval(progressTimer);
    saveProgress(true);
    document.removeEventListener('click', closeSpeed);
    document.removeEventListener('click', closeMode);
    document.removeEventListener('click', closeView);
    document.removeEventListener('keydown', onKey);
    stopListening();
    clearInterval(backTimer);
    window.removeEventListener('lexitube:goal', onGoal);
    window.removeEventListener('resize', onResize);
    cancelGap();
    document.removeEventListener('fullscreenchange', onFsChange);
    setFocus(false);
    explainBtn.remove();
    clearInterval(syncTimer);
    if (frame) cancelAnimationFrame(frame);
    closeWordPanel();
    player?.destroy?.();
    void tab;
  };
}
