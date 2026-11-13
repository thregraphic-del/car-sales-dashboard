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
import { startTour, maybeTour } from '../tour.js';
import { state } from '../state.js';
import { notePassed, noteWatched } from '../goal.js';
import { summaryHtml } from '../summary-view.js';
import { esc, icon, levelChip, usageDot, usageLegend, fmtTime, fmtDuration, toast, $, emptyState, openModal, closeModal } from '../ui.js';
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

// 🎨 word colours (the learner picks; kept for every video)
const MK_NEW = [['#0ABAB5', 'تيفاني'], ['#22a35a', 'أخضر'], ['#3b82f6', 'أزرق'], ['#f59e0b', 'برتقالي'], ['#ec4899', 'وردي']];
const MK_MINE = [['#8b5cf6', 'بنفسجي'], ['#3b82f6', 'أزرق'], ['#64748b', 'رمادي'], ['#CBA55E', 'ذهبي'], ['#ef4444', 'أحمر']];
function applyMarkLook() {
  const r = document.documentElement;
  r.style.setProperty('--mk-new', pref('reader.mkNew', MK_NEW[0][0]));
  r.style.setProperty('--mk-mine', pref('reader.mkMine', MK_MINE[0][0]));
  r.dataset.mk = pref('reader.mkStyle', 'fill');
}

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
        onReady: () => {
          // ▶ starts by itself; if the phone blocks sound, it plays muted and offers «شغّل الصوت»
          try { p.playVideo(); } catch { /* ignore */ }
          setTimeout(() => {
            if (p.getPlayerState?.() !== 1 && p.getPlayerState?.() !== 3) {
              try { p.mute(); p.playVideo(); window.dispatchEvent(new CustomEvent('lexitube:muted')); } catch { /* ignore */ }
            }
          }, 1500);
          resolve({
          time: () => p.getCurrentTime?.() || 0,
          unmute: () => { p.unMute?.(); p.setVolume?.(100); },
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
          });
        },
        // 1 playing, 3 buffering (still moving), 2 paused, 0 ended
        onStateChange: (e) => { onState(e.data === 1 || e.data === 3); if (e.data === 0) window.dispatchEvent(new CustomEvent('lexitube:ended')); },
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

/**
 * Until the AI pairs the phrases exactly, a long line is cut into short rows (4–8 words,
 * at punctuation when possible) and its Arabic is shared out in the same proportion, so
 * each English row keeps its Arabic beside it at any font size, and both light up together.
 */
function autoRows(text, ar) {
  const words = [...text.matchAll(/\S+/g)];
  const arWords = String(ar || '').split(/\s+/).filter(Boolean);
  if (words.length <= 8 || arWords.length < 4) return [[0, text.length, ar]];
  const groups = [];
  let from = 0;
  for (let i = 0; i < words.length; i++) {
    const n = i - from + 1;
    const last = i === words.length - 1;
    const left = words.length - 1 - i;
    if (last || (n >= 4 && /[,;:.?!…]["')]?$/.test(words[i][0]) && left >= 3) || (n >= 7 && left >= 3)) {
      groups.push([from, i]);
      from = i + 1;
    }
  }
  const total = words.length;
  let done = 0;
  let arFrom = 0;
  return groups.map(([a, b], k) => {
    done += b - a + 1;
    let arTo = k === groups.length - 1 ? arWords.length : Math.round((done / total) * arWords.length);
    // move the Arabic cut to a nearby comma or full stop when there is one
    for (const d of [0, 1, -1, 2, -2]) {
      const j = arTo + d;
      if (j > arFrom && j < arWords.length && /[،,.؛:؟!]$/.test(arWords[j - 1])) { arTo = j; break; }
    }
    arTo = Math.max(arFrom + 1, Math.min(arTo, arWords.length - (groups.length - 1 - k)));
    const piece = arWords.slice(arFrom, arTo).join(' ');
    arFrom = arTo;
    return [words[a].index, words[b].index + words[b][0].length, piece];
  });
}

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
      out += `<span class="mark ${m.state === 'saved' ? 's-saved' : m.light ? 's-light' : 's-suggested'}${m.usage ? ` u-${m.usage}` : ''}" data-vid="${m.vocabulary_id}">${markInner(s, e)}</span>`;
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
  const rows = line.align?.length ? line.align : (seekable ? autoRows(line.text, line.text_ar || '') : null);
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
    view.innerHTML = emptyState('🔎', 'ما لقينا هذا المقطع', err.message, '<a class="btn" href="#/add">أضف مصدرًا</a>');
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
  let lastSelfPause = 0;
  const selfPause = () => { lastSelfPause = Date.now(); };
  let timeline = buildTimeline(data.lines);
  let userScrollUntil = 0; // the learner is scrolling: don't pull the transcript back for a moment
  let tab = 'text';

  view.innerHTML = `
    <div class="reader-head slim one-row">
      <a class="btn icon sm ghost" href="#/add" id="backLink" aria-label="رجوع">${icon.prev}</a>
      <div class="reader-title-sm en" dir="auto" title="${esc(source.title)}">${esc(source.title)}</div>
      ${isVideo ? `<button type="button" class="rb-btn rb-ic play-btn" id="playBtn" title="تشغيل / إيقاف (مسافة)" aria-label="تشغيل أو إيقاف">${icon.play}</button>` : ''}
      ${isVideo && hasTimes ? `<button type="button" class="rb-btn rb-ic" id="againBtn" aria-pressed="false" title="كل جملة تُعاد مرتين تلقائيًا">${icon.repeat}<span class="rb-x">×2</span></button><button type="button" class="rb-btn rb-ic" id="shadowBtn" aria-pressed="false" title="ردّد معي: يقف بعد كل جملة لتعيدها">${icon.mic}<span>ردّد</span></button>` : ''}
      ${isVideo || data.lines.length ? `<button type="button" class="rb-btn sum-top" id="sumTop" title="ملخص المقطع كامل: أبرز الأفكار، خطوات عملية، الحكم والرسالة">${icon.doc}<span>ملخص المقطع</span></button>` : ''}
      <button type="button" class="rb-btn words-btn" id="wordsBtn" aria-pressed="false" title="الكلمات الجديدة في المقطع">${icon.list}<span>الكلمات</span> <b id="wcount2">${data.items.length}</b></button>
      <button type="button" class="rb-btn rb-ic" id="focusBtn" aria-pressed="false" title="توسيع الشاشة">${icon.expand}</button>
      <button type="button" class="btn icon sm ghost set-btn" id="setBtn" aria-expanded="false" title="إعدادات المقطع">${icon.settings}</button>
    </div>
    <div class="listen-bar hidden" id="listenBar"><span id="listenNote">🎧 يقرأ…</span>
      <div class="segmented" id="listenOrder"><button data-order="ar-en">عربي ← إنجليزي</button><button data-order="en-ar">إنجليزي ← عربي</button></div>
      <button class="btn sm" id="listenStop">⏹ إيقاف</button></div>
    <div class="reader-tabs segmented"><button data-tab="text" class="active">${isVideo ? 'الفيديو والنص' : 'النص'}</button><button data-tab="words">كلمات جديدة (<span id="wcount">${data.items.length}</span>)</button></div>
    <div class="reader-grid" data-tab="text">
      <div class="reader-main">
        <div class="rset hidden" id="rset">
          <div class="rset-title">إعدادات المقطع</div>
          ${isVideo && hasTimes ? `<div class="sgroup">التشغيل</div><div id="mode" class="rgrp">
            <div class="srow"><span class="slabel">السرعة</span><div class="sopts" id="speed">${[0.5, 0.75, 0.9, 1, 1.25, 1.5].map((r) => `<button type="button" class="sopt en-inline" data-rate="${r}">${r}×</button>`).join('')}</div></div>
            <div class="srow"><span class="slabel">التوقف</span><div class="sopts"><label class="sopt-check"><input type="checkbox" class="check" id="gapOn"> بعد كل سطر</label><span class="sopts" id="gapChips">${[500, 1000, 2000, 3000].map((ms) => `<button type="button" class="sopt en-inline" data-gap="${ms}">${ms / 1000}ث</button>`).join('')}</span></div></div>
            <div class="srow"><span class="slabel">التدريب</span><div class="sopts"><button type="button" class="sopt" data-mode="shadow">🗣 ردّد ورائي</button><button type="button" class="sopt" id="loopBtn" aria-pressed="false">🔁 كل جملة مرتين</button><button type="button" class="sopt hidden" id="modeOff">✕ عادي</button></div></div>
          </div>
          <div class="sgroup">المساعدة</div>
          <div class="srow"><span class="slabel">قائمة الكلمات</span><div class="sopts"><label class="sopt-check"><input type="checkbox" class="check" id="wbOn"> كل</label><input class="input sopt-num" id="wbN" type="number" min="3" max="300" inputmode="numeric"> <span class="tiny">كلمة</span><span class="sopts" id="wbWhen"><button type="button" class="sopt" data-when="before">قبلها</button><button type="button" class="sopt" data-when="after">بعدها</button></span></div></div>
          <div class="srow"><span class="slabel">ملخص كل فترة</span><div class="sopts"><label class="sopt-check"><input type="checkbox" class="check" id="recapOn"> بالعامية</label>
            <span class="sopts" id="recapMin">${[3, 6].map((m) => `<button type="button" class="sopt en-inline" data-rmin="${m}">${m}د</button>`).join('')}<input class="input sopt-num" id="recapMinN" type="number" min="1" max="60" inputmode="numeric" placeholder="اكتب" aria-label="كل كم دقيقة"></span>
            <span class="sopts" id="recapWhen"><button type="button" class="sopt" data-rwhen="before">قبل</button><button type="button" class="sopt" data-rwhen="after">بعد</button></span></div></div>` : ''}
          <div class="sgroup">العرض</div>
          <div id="viewPick" class="rgrp"><button type="button" class="hidden" id="viewBtn"></button><div id="viewMenu" class="rgrp">
            <div class="srow"><span class="slabel">الترجمة</span><div class="sopts"><label class="sopt-check"><input type="checkbox" class="check" id="arToggle" ${showAr ? 'checked' : ''}> عربي</label><span class="sopts${showAr ? '' : ' hidden'}" id="arLayout"><button type="button" class="sopt" data-layout="side">بجانبه</button><button type="button" class="sopt" data-layout="below">تحته</button></span><button type="button" class="sopt" id="hideArBtn" aria-pressed="false">🙈 أخفه</button></div></div>
            <div class="srow"><span class="slabel">شكل الكلمات</span><div class="sopts mk-set">
              <span class="sopts" id="mkStyle"><button type="button" class="sopt" data-mks="fill">تظليل</button><button type="button" class="sopt" data-mks="frame">إطار</button></span>
              <span class="mk-row"><span class="tiny">الجديدة</span>${MK_NEW.map(([c, n]) => `<button type="button" class="mk-sw" data-mkn="${c}" style="--c:${c}" title="${n}" aria-label="${n}"></button>`).join('')}</span>
              <span class="mk-row"><span class="tiny">كلماتي</span>${MK_MINE.map(([c, n]) => `<button type="button" class="mk-sw" data-mkm="${c}" style="--c:${c}" title="${n}" aria-label="${n}"></button>`).join('')}</span></div></div>
            <div class="srow tb-only"><span class="slabel">أزرار تحت</span><div class="sopts"><span class="sopts" id="tbShow">${[['normal', 'بالعادي بس'], ['always', 'دايم'], ['off', 'مخفية']].map(([k, l]) => `<button type="button" class="sopt" data-tbs="${k}">${l}</button>`).join('')}</span><span class="sopts" id="tbSize">${[['s', 'صغير'], ['m', 'وسط'], ['l', 'كبير']].map(([k, l]) => `<button type="button" class="sopt" data-tbz="${k}">${l}</button>`).join('')}</span></div></div>
            <div class="srow"><span class="slabel">الخلفية</span><div class="sopts" id="rBg">${[['', 'مثل الموقع'], ['night', '🌙 ليلي'], ['white', '⬜ أبيض'], ['beige', '🟫 بيج']].map(([k, l]) => `<button type="button" class="sopt" data-rbg="${k}">${l}</button>`).join('')}</div></div>
            <div class="srow"><span class="slabel">النص</span><div class="sopts">${hasTimes ? `<label class="sopt-check"><input type="checkbox" class="check" id="followToggle" ${follow ? 'checked' : ''}> متابعة تلقائية</label>` : ''}${hasTimes ? '<label class="sopt-check"><input type="checkbox" class="check" id="timesToggle"> الوقت</label>' : ''}<span class="sopts fontsize"><button type="button" class="sopt" data-font="-1">A−</button><button type="button" class="sopt" data-font="1">A+</button></span></div></div>
          </div></div>
          ${isVideo ? `<div class="srow"><span class="slabel">الفيديو</span><div class="sopts" id="vidPos"><button type="button" class="sopt" data-vpos="top">فوق</button><button type="button" class="sopt" data-vpos="bottom">تحت</button><button type="button" class="sopt" data-vpos="float">عائم</button></div></div>` : ''}
          <div class="srow"><span class="slabel">بحث</span><div class="sopts tr-search"><input class="input sm" id="trQ" type="search" placeholder="ابحث في النص" aria-label="ابحث في النص"><span class="tiny muted" id="trQn"></span></div></div>
          <div class="sgroup">أدوات</div>
          <div class="srow"><span class="slabel">شرح</span><div class="sopts"><button class="sopt" id="tourR">شرح الأزرار</button><button class="sopt" id="colorKey">🎨 مفتاح الألوان</button><button class="sopt" id="resetR">↺ رجّع كل الإعدادات للأصل</button></div></div>
          <div class="srow"><span class="slabel">أدوات</span><div class="sopts">
            <button class="sopt" id="retrBtn">ترجمة أدق</button><button class="sopt" id="summaryBtn">📝 ملخص المقطع كامل</button><button class="sopt" id="listenBtn">🎧 استماع</button>
            ${source.youtube_id && !source.is_demo ? `<a class="sopt" href="https://www.youtube.com/watch?v=${esc(source.youtube_id)}" target="_blank" rel="noopener">يوتيوب ↗</a>` : ''}
            <button class="sopt" id="del" style="color:var(--bad)">🗑 حذف</button></div></div>
          <button type="button" class="btn rset-reset" id="resetAll">↺ رجّع كل الإعدادات للأصل</button>
          <button type="button" class="btn primary rset-ok" id="setOk">موافق</button>
        </div>
        <div class="reader-status"><span class="mk-legend" aria-hidden="true"><span class="mk-l mine">كلماتي</span><span class="mk-l new">جديد</span></span><span class="tiny mode-note" id="modeNote"></span><span class="tiny muted" id="trNote"></span></div>
        ${isVideo ? '<div class="player-box yt-clean"><div id="player"></div><button type="button" class="yt-shield" id="ytShield" aria-label="أظهر أزرار يوتيوب"></button></div><div class="split" id="split" role="separator" aria-orientation="horizontal" title="اسحب لتكبير الفيديو أو النص"><span></span></div>' : ''}
        <button type="button" class="btn sm primary back-now hidden" id="backNow">↓ الجملة الحالية</button>
        <div class="transcript ${showAr ? 'bilingual' : 'hide-ar'}${arLayout === 'below' ? ' ar-below' : ''}" id="lines"></div>
        <p class="tiny muted reader-hint">${isVideo && hasTimes ? 'اضغط أي كلمة: يقف الفيديو عندها ويظهر معناها، ويكمل حين تغلقها أو تحفظها. اسحب الفاصل تحت الفيديو لتكبيره أو تصغيره. لوحة المفاتيح: مسافة تشغيل/إيقاف · ← → الجملة السابقة/التالية · R أعد الجملة · L كرّرها · A أخفِ العربي.' : 'اضغط على أي كلمة لترى معناها في هذه الجملة.'} جديدة: <span class="mark s-suggested u-common">شائعة</span> <span class="mark s-suggested u-medium">أقل شيوعًا</span> <span class="mark s-suggested u-rare">نادرة</span> · <span class="mark s-saved">في كلماتي</span></p>
      </div>
      <aside class="reader-side card" id="side"></aside>
    </div>`;

  const linesEl = $('#lines', view);
  // ⚙ One settings panel instead of a row of buttons.
  const rset = $('#rset', view);
  const toggleSet = (open) => { rset.classList.toggle('hidden', !open); $('#setBtn', view).setAttribute('aria-expanded', String(open)); $('#setBtn', view).classList.toggle('primary', open); };
  $('#setBtn', view).addEventListener('click', (e) => { e.stopPropagation(); toggleSet(rset.classList.contains('hidden')); });
  const closeSet = (e) => { if (!rset.classList.contains('hidden') && !e.target.closest?.('#rset, #setBtn')) toggleSet(false); };
  document.addEventListener('click', closeSet);
  $('#setOk', view).addEventListener('click', () => toggleSet(false));
  // Video above the text, below it, or floating in a corner (drag it anywhere, it snaps to a corner).
  // 🎬 The video sits above the text by default; when the learner picks «عائم» it floats, large, over the lower half; it can be moved
  // anywhere (drag its top bar) and resized (drag its corner ↘ or pinch the bar with two fingers).
  let vidPos = ['top', 'bottom', 'float'].includes(pref('reader.vp', 'top')) ? pref('reader.vp', 'top') : 'top';
  const vw = () => window.innerWidth;
  const vh = () => window.innerHeight;
  let floatW = Number(pref('reader.fw', '0')) || 0; // 0 = automatic (large)
  let fpos = (() => { try { return JSON.parse(pref('reader.fpos', 'null')); } catch { return null; } })(); // {x,y} fractions
  const pbox = () => $('.player-box', view);
  // 🎬 clean video: YouTube's title, «more videos» strip and control bar sit outside the visible
  // frame (cropped), even when the video pauses (ردّد معي / التوقف). One tap = YouTube's own
  // buttons for a few seconds, then clean again.
  let ytShowT = 0;
  $('#ytShield', view)?.addEventListener('click', () => {
    const box = pbox();
    if (!box) return;
    box.classList.remove('yt-clean');
    clearTimeout(ytShowT);
    ytShowT = setTimeout(() => { if (alive) pbox()?.classList.add('yt-clean'); }, 6000);
  });
  function ensureFloatBar() {
    const b = pbox();
    if (!b || b.querySelector('.float-bar')) return;
    b.insertAdjacentHTML('afterbegin', '<div class="float-bar"><span class="fh" title="اسحب للتحريك">⠿ اسحب</span><button type="button" data-fs="-" title="أصغر">−</button><button type="button" data-fs="+" title="أكبر">＋</button><button type="button" data-fs="dock" title="أرجعه فوق النص">✕</button></div><span class="float-rs" title="اسحب للتكبير أو التصغير">↘</span>');
    bindFloatBar(b);
    floatHint();
  }
  const clearFloat = () => {
    const b = pbox();
    if (b) ['width', 'left', 'right', 'top', 'bottom'].forEach((k) => b.style.removeProperty(k));
    $('.reader-main', view)?.style.removeProperty('--float-h');
  };
  const widthNow = () => Math.round(Math.max(180, Math.min(vw() - 8, floatW || (vw() < 700 ? vw() - 16 : Math.min(720, vw() * 0.55)))));
  const placeFloat = () => {
    const b = pbox();
    if (!b || vidPos !== 'float') return;
    clearFloat();
    const w = widthNow();
    const h = Math.round((w * 9) / 16) + 30;
    b.style.width = `${w}px`;
    const bottomGap = vw() < 900 ? 78 : 16;
    let x = fpos ? fpos.x * vw() : (vw() - w) / 2;
    let y = fpos ? fpos.y * vh() : vh() - h - bottomGap; // lower half by default
    x = Math.max(0, Math.min(vw() - w, x));
    y = Math.max(0, Math.min(vh() - h, y));
    b.style.left = `${Math.round(x)}px`;
    b.style.top = `${Math.round(y)}px`;
    b.style.right = 'auto';
    b.style.bottom = 'auto';
    // the text can scroll above the video: leave room under it
    $('.reader-main', view)?.style.setProperty('--float-h', `${h + 12}px`);
  };
  const showVidPos = () => {
    const m = $('.reader-main', view);
    m.classList.toggle('video-bottom', vidPos === 'bottom');
    m.classList.toggle('video-float', vidPos === 'float');
    view.querySelectorAll('#vidPos [data-vpos]').forEach((b) => b.classList.toggle('active', b.dataset.vpos === vidPos));
    if (vidPos === 'float') { ensureFloatBar(); placeFloat(); } else clearFloat();
  };
  const setVidPos = (v) => { vidPos = v; setPref('reader.vp', vidPos); showVidPos(); };
  view.querySelectorAll('#vidPos [data-vpos]').forEach((b) => b.addEventListener('click', () => setVidPos(b.dataset.vpos)));
  const savePos = () => {
    const r = pbox().getBoundingClientRect();
    fpos = { x: r.left / vw(), y: r.top / vh() };
    setPref('reader.fpos', JSON.stringify(fpos));
    setPref('reader.fw', String(floatW));
  };
  // 👆 a short hint the first three times
  function floatHint() {
    const n = Number(pref('reader.fhint', '0')) || 0;
    if (n >= 3) return;
    setPref('reader.fhint', String(n + 1));
    const b = pbox();
    b.insertAdjacentHTML('beforeend', '<div class="float-hint"><b>👆</b><span>اسحب الشريط لتحريك الفيديو</span><span>اسحب الزاوية ↘ أو قرّص بإصبعين للتكبير والتصغير</span></div>');
    const h = b.querySelector('.float-hint');
    const close = () => h?.remove();
    h.addEventListener('click', close);
    setTimeout(close, 6000);
  }
  function bindFloatBar(b) {
    const bar = b.querySelector('.float-bar');
    bar.addEventListener('click', (e) => {
      const f = e.target.closest('[data-fs]')?.dataset.fs;
      if (!f) return;
      if (f === 'dock') return setVidPos('top');
      floatW = Math.max(180, Math.min(vw() - 8, widthNow() + (f === '+' ? 80 : -80)));
      placeFloat();
      savePos();
    });
    // drag (one finger) or pinch (two fingers) on the bar
    const pts = new Map();
    let start = null;
    bar.addEventListener('pointerdown', (e) => {
      if (e.target.closest('[data-fs]')) return;
      bar.setPointerCapture(e.pointerId);
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const r = b.getBoundingClientRect();
      const [p1, p2] = [...pts.values()];
      start = { r, p1: { ...p1 }, dist: p2 ? Math.hypot(p1.x - p2.x, p1.y - p2.y) : 0, w: r.width };
      b.classList.add('moving');
    });
    bar.addEventListener('pointermove', (e) => {
      if (!pts.has(e.pointerId) || !start) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const [p1, p2] = [...pts.values()];
      if (p2 && start.dist) {
        floatW = Math.max(180, Math.min(vw() - 8, start.w * (Math.hypot(p1.x - p2.x, p1.y - p2.y) / start.dist)));
        b.style.width = `${Math.round(floatW)}px`;
      } else {
        b.style.left = `${Math.max(0, Math.min(vw() - start.r.width, start.r.left + p1.x - start.p1.x))}px`;
        b.style.top = `${Math.max(0, Math.min(vh() - start.r.height, start.r.top + p1.y - start.p1.y))}px`;
      }
    });
    const up = (e) => {
      pts.delete(e.pointerId);
      if (pts.size) return;
      b.classList.remove('moving');
      start = null;
      savePos();
      placeFloat();
    };
    bar.addEventListener('pointerup', up);
    bar.addEventListener('pointercancel', up);
    // the corner handle: drag to resize
    const rs = b.querySelector('.float-rs');
    rs.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      rs.setPointerCapture(e.pointerId);
      const r = b.getBoundingClientRect();
      const x0 = e.clientX;
      b.classList.add('moving');
      const mv = (ev) => { floatW = Math.max(180, Math.min(vw() - r.left, r.width + (ev.clientX - x0))); b.style.width = `${Math.round(floatW)}px`; };
      const done = () => { b.classList.remove('moving'); rs.removeEventListener('pointermove', mv); savePos(); placeFloat(); };
      rs.addEventListener('pointermove', mv);
      rs.addEventListener('pointerup', done, { once: true });
      rs.addEventListener('pointercancel', done, { once: true });
    });
  }
  window.addEventListener('resize', placeFloat);
  showVidPos();

  // Small cards over the page that never block the view for long.
  function popNote(html, { ms = 0, cls = '' } = {}) {
    document.querySelectorAll('.lt-note').forEach((n) => n.remove());
    const n = document.createElement('div');
    n.className = `lt-note ${cls}`;
    n.innerHTML = `<button type="button" class="lt-x" aria-label="إغلاق">✕</button>${html}`;
    document.body.appendChild(n);
    const close = () => n.remove();
    n.querySelector('.lt-x').addEventListener('click', close);
    if (ms) setTimeout(close, ms);
    return n;
  }

  // 🏁 The video ended: a quick 5-question quiz on its words.
  let endedFlow = null; // set below: the summary, then «أحسنت»
  const onEnded = () => endedFlow?.();
  window.addEventListener('lexitube:ended', onEnded);
  // 🔔 Every N new words of the video: a list with meanings — before they come, or after they went by.
  // A word shown once in this video is never listed again (so new words always take the place).
  let wbN = Math.max(3, Math.min(300, Number(pref('reader.wbN2', '10')) || 10)); // default: the next 10 words
  let wbOn = pref('reader.wbOn3', '1') === '1' && !params.jump; // on by default
  let wbWhen = pref('reader.wbWhen2', 'before') === 'after' ? 'after' : 'before'; // shown BEFORE they come
  const shownKey = `reader.shown.${id}`;
  const shown = new Set((() => { try { return JSON.parse(localStorage.getItem(shownKey) || '[]'); } catch { return []; } })());
  const saveShown = () => { try { localStorage.setItem(shownKey, JSON.stringify([...shown])); } catch { /* storage unavailable */ } };
  const passed = new Map(); // vocabulary_id → item (words heard, not listed yet)
  const showWb = () => {
    const on = $('#wbOn', view); if (on) on.checked = wbOn;
    const n = $('#wbN', view); if (n) n.value = String(wbN);
    view.querySelectorAll('#wbWhen [data-when]').forEach((b) => b.classList.toggle('active', b.dataset.when === wbWhen));
  };
  $('#wbOn', view)?.addEventListener('change', (e) => { wbOn = e.target.checked; setPref('reader.wbOn3', wbOn ? '1' : '0'); passed.clear(); });
  $('#wbN', view)?.addEventListener('change', (e) => { wbN = Math.max(3, Math.min(300, Number(e.target.value) || 10)); setPref('reader.wbN2', String(wbN)); showWb(); });
  view.querySelectorAll('#wbWhen [data-when]').forEach((b) => b.addEventListener('click', () => { wbWhen = b.dataset.when; setPref('reader.wbWhen2', wbWhen); passed.clear(); showWb(); }));
  showWb();
  // the words still to come, in the order they are said, that were never listed
  const upcoming = (n) => {
    const out = [];
    const seen = new Set();
    const cur = linesEl.querySelector('.line.current');
    let started = !cur;
    for (const l of linesEl.querySelectorAll('.line')) {
      if (!started) { if (l === cur) started = true; else continue; }
      for (const m of l.querySelectorAll('.mark[data-vid]')) {
        const vid = Number(m.dataset.vid);
        if (shown.has(vid) || seen.has(vid) || knownBefore.has(vid)) continue;
        const it = data.items.find((x) => x.vocabulary_id === vid);
        if (!it) continue;
        seen.add(vid);
        out.push(it);
        if (out.length >= n) return out;
      }
    }
    return out;
  };
  function listCard(list, title, actionLabel) {
    list.forEach((w) => shown.add(w.vocabulary_id));
    saveShown();
    selfPause(); player?.pause?.();
    const href = `#/practice?${new URLSearchParams({ source: id, title: source.title.slice(0, 40), mode: 'quiz', vids: list.map((w) => w.vocabulary_id).join(','), n: Date.now() })}`;
    const n = popNote(`<div class="lt-title">${title}</div>
      <div class="lt-words">${list.map((w) => `<div class="lt-w u-${esc(w.usage || '')}"><b class="en">${esc(w.term)}</b><span>${esc(w.arabic || '')}</span></div>`).join('')}</div>
      <div class="lt-actions"><a class="btn primary sm" href="${href}">🎮 العبها</a><button type="button" class="btn sm" data-back>${actionLabel}</button></div>`, { cls: 'lt-words-card lt-contrast' });
    n.querySelector('[data-back]').addEventListener('click', () => { n.remove(); held = false; player?.play?.(); });
  }
  let previewDone = false;
  const previewSet = new Set(); // words announced and not yet heard
  function previewNext() {
    const list = upcoming(wbN);
    previewSet.clear();
    list.forEach((w) => previewSet.add(w.vocabulary_id));
    if (list.length) listCard(list, `👀 الكلمات القادمة (${list.length})`, '▶ كمّل المقطع');
  }
  function wordsPassed(lineEl) {
    if (!lineEl) return;
    for (const m of lineEl.querySelectorAll('.mark[data-vid]')) {
      const vid = Number(m.dataset.vid);
      countPassed(vid);
      previewSet.delete(vid);
      if (shown.has(vid) || passed.has(vid) || knownBefore.has(vid)) continue;
      const it = data.items.find((x) => x.vocabulary_id === vid);
      if (it) passed.set(vid, it);
    }
    if (!wbOn) return;
    if (wbWhen === 'before') {
      // all the announced words were heard: announce the next ones
      if (previewDone && !previewSet.size) { passed.clear(); previewNext(); }
      return;
    }
    if (passed.size < wbN) return;
    const list = [...passed.values()];
    passed.clear();
    listCard(list, `🔔 مرّت عليك ${list.length} كلمة جديدة`, '↩ عد للمقطع');
  }

  // 🎯 a NEW word that goes by counts toward today's goal (once a day, no need to open it)
  function countPassed(vid) {
    if (knownBefore.has(vid) || !data.items.some((it) => it.vocabulary_id === vid)) return;
    notePassed(vid);
  }

  // 🎛 Practise exactly the words you want: part of the video, how many, level, how common,
  // new or saved, and a list to tick — then cards, a quiz or games.
  function openPracticeFilter() {
    const dur = Number(source.duration_seconds) || Math.max(60, ...data.lines.map((l) => Number(l.start_seconds) || 0));
    const now = player?.time?.() || 0;
    const f = JSON.parse(pref('reader.pf', '{}') || '{}');
    const F = { part: f.part || 'all', from: f.from ?? '', to: f.to ?? '', count: f.count || 'all', n: f.n || 30, levels: f.levels || [], usage: f.usage || [], state: f.state || 'all', mode: f.mode || 'cards' };
    const chips = (name, opts, multi) => opts.map(([k, l]) => `<button type="button" class="sopt" data-f="${name}" data-v="${k}" data-multi="${multi ? 1 : 0}">${l}</button>`).join('');
    const box = openModal(`<div class="pf">
      <div class="rset-title">🎛 تدرّب على كلمات المقطع</div>
      <div class="srow"><span class="slabel">الجزء</span><div class="sopts">${chips('part', [['all', 'الكل'], ['q1', 'الربع ١'], ['q2', 'الربع ٢'], ['q3', 'الربع ٣'], ['q4', 'الربع ٤'], ['sofar', 'حتى موضعي'], ['range', 'من–إلى']])}
        <span class="pf-range"><input class="input sopt-num" id="pfFrom" type="number" min="0" placeholder="من" value="${esc(String(F.from))}"> – <input class="input sopt-num" id="pfTo" type="number" min="0" placeholder="إلى" value="${esc(String(F.to))}"> <span class="tiny">دقيقة</span></span></div></div>
      <div class="srow"><span class="slabel">العدد</span><div class="sopts">${chips('count', [['all', 'الكل'], ['first', 'أول'], ['last', 'آخر']])}<input class="input sopt-num" id="pfN" type="number" min="1" value="${F.n}"> <span class="tiny">كلمة</span></div></div>
      <div class="srow"><span class="slabel">المستوى</span><div class="sopts">${chips('levels', ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].map((l) => [l, l]), true)}</div></div>
      <div class="srow"><span class="slabel">الشيوع</span><div class="sopts">${chips('usage', [['common', '🟢 شائعة'], ['medium', '🟡 أقل'], ['rare', '🔴 نادرة']], true)}</div></div>
      <div class="srow"><span class="slabel">الحالة</span><div class="sopts">${chips('state', [['all', 'الكل'], ['new', 'الجديدة'], ['saved', 'المحفوظة']])}</div></div>
      <div class="srow"><span class="slabel">التمرين</span><div class="sopts">${chips('mode', [['cards', '🃏 بطاقات'], ['quiz', '✅ اختبار'], ['games', '🎮 ألعاب']])}</div></div>
      <div class="pf-res"><b id="pfCount"></b> <button type="button" class="link-btn" id="pfAll">تحديد الكل</button> · <button type="button" class="link-btn" id="pfNone">إلغاء الكل</button></div>
      <div class="pf-list" id="pfList"></div>
      <div class="btn-row"><a class="btn primary" id="pfGo">ابدأ</a><button type="button" class="btn ghost" data-close>إغلاق</button></div></div>`);
    const off = new Set();
    const pick = () => {
      let lo = 0;
      let hi = Infinity;
      if (/^q[1-4]$/.test(F.part)) { const k = Number(F.part[1]); lo = (dur * (k - 1)) / 4; hi = (dur * k) / 4; }
      if (F.part === 'sofar') hi = now + 1;
      if (F.part === 'range') { lo = (Number(F.from) || 0) * 60; hi = F.to === '' ? Infinity : (Number(F.to) || 0) * 60; }
      let list = data.items.filter((it) => {
        const t = Number(it.timestamp_seconds) || 0;
        if (t < lo || t > hi) return false;
        if (F.levels.length && !F.levels.includes(it.level)) return false;
        if (F.usage.length && !F.usage.includes(it.usage)) return false;
        if (F.state === 'new' && it.user_state === 'saved') return false;
        if (F.state === 'saved' && it.user_state !== 'saved') return false;
        return Boolean(it.arabic);
      }).sort((a, b) => (Number(a.timestamp_seconds) || 0) - (Number(b.timestamp_seconds) || 0));
      const n = Math.max(1, Number(F.n) || 30);
      if (F.count === 'first') list = list.slice(0, n);
      if (F.count === 'last') list = list.slice(-n);
      return list;
    };
    const draw = () => {
      box.querySelectorAll('[data-f]').forEach((b) => {
        const v = F[b.dataset.f];
        b.classList.toggle('active', Array.isArray(v) ? v.includes(b.dataset.v) : v === b.dataset.v);
      });
      box.querySelector('.pf-range').classList.toggle('hidden', F.part !== 'range');
      const list = pick();
      const chosen = list.filter((it) => !off.has(it.vocabulary_id)).slice(0, 600);
      box.querySelector('#pfCount').textContent = `${chosen.length} كلمة`;
      box.querySelector('#pfList').innerHTML = list.map((it) => `<label class="pf-item"><input type="checkbox" class="check" data-pv="${it.vocabulary_id}" ${off.has(it.vocabulary_id) ? '' : 'checked'}> ${usageDot(it.usage)}<b class="en">${esc(it.term)}</b> <span class="tiny ink-2">${esc(it.arabic || '')}</span> <span class="tiny muted en-inline">${fmtTime(Number(it.timestamp_seconds) || 0)}</span></label>`).join('') || '<p class="small muted">ما فيه كلمات بهذه الفلاتر.</p>';
      const go = box.querySelector('#pfGo');
      go.href = `#/practice?${new URLSearchParams({ source: id, title: source.title.slice(0, 40), mode: F.mode, vids: chosen.map((it) => it.vocabulary_id).join(','), n: Date.now() })}`;
      go.classList.toggle('disabled', !chosen.length);
      setPref('reader.pf', JSON.stringify(F));
    };
    box.addEventListener('click', (e) => {
      const b = e.target.closest('[data-f]');
      if (b) {
        const k = b.dataset.f;
        if (b.dataset.multi === '1') F[k] = F[k].includes(b.dataset.v) ? F[k].filter((x) => x !== b.dataset.v) : [...F[k], b.dataset.v];
        else F[k] = b.dataset.v;
        off.clear();
        return draw();
      }
      if (e.target.closest('#pfAll')) { off.clear(); return draw(); }
      if (e.target.closest('#pfNone')) { pick().forEach((it) => off.add(it.vocabulary_id)); return draw(); }
      if (e.target.closest('#pfGo') && box.querySelector('#pfGo').classList.contains('disabled')) e.preventDefault();
    });
    box.addEventListener('change', (e) => {
      const c = e.target.closest('[data-pv]');
      if (c) { const v = Number(c.dataset.pv); if (c.checked) off.delete(v); else off.add(v); draw(); return; }
      if (e.target.id === 'pfFrom') F.from = e.target.value;
      if (e.target.id === 'pfTo') F.to = e.target.value;
      if (e.target.id === 'pfN') F.n = Number(e.target.value) || 30;
      draw();
    });
    draw();
  }
  view.addEventListener('click', (e) => { if (e.target.closest('#pfOpen')) openPracticeFilter(); });

  // 📝 What it is about, in a few words of everyday Saudi Arabic — when and how often the learner chooses.
  let recapOn = pref('reader.recap3', '1') === '1' && !params.jump; // on by default
  const recapBox = $('#recapOn', view);
  if (recapBox) {
    recapBox.checked = recapOn;
    recapBox.addEventListener('change', () => { recapOn = recapBox.checked; setPref('reader.recap3', recapOn ? '1' : '0'); resetRecap(); });
  }
  // ⏱ every N minutes (3 / 5 / 10 / any number) · «قبل» = what the next part is about, «بعد» = what was just said
  let recapMin = Math.max(1, Math.min(60, Number(pref('reader.recapMin2', '3')) || 3)); // every 3 minutes
  let recapWhen = pref('reader.recapWhen2', 'after') === 'before' ? 'before' : 'after';
  const showRecap = () => {
    view.querySelectorAll('[data-rmin]').forEach((b) => b.classList.toggle('active', Number(b.dataset.rmin) === recapMin));
    const n = $('#recapMinN', view); if (n && ![3, 6].includes(recapMin)) n.value = String(recapMin);
    view.querySelectorAll('[data-rwhen]').forEach((b) => b.classList.toggle('active', b.dataset.rwhen === recapWhen));
  };
  showRecap();
  view.querySelectorAll('[data-rmin]').forEach((b) => b.addEventListener('click', () => { recapMin = Number(b.dataset.rmin); setPref('reader.recapMin2', String(recapMin)); const n = $('#recapMinN', view); if (n) n.value = ''; resetRecap(); showRecap(); }));
  $('#recapMinN', view)?.addEventListener('change', (e) => { recapMin = Math.max(1, Math.min(60, Number(e.target.value) || 3)); setPref('reader.recapMin2', String(recapMin)); resetRecap(); showRecap(); });
  view.querySelectorAll('[data-rwhen]').forEach((b) => b.addEventListener('click', () => { recapWhen = b.dataset.rwhen; setPref('reader.recapWhen2', recapWhen); resetRecap(); showRecap(); }));
  // 📝 «السالفة باختصار» every N minutes OF THE VIDEO (not of the clock): the video is cut into
  // fixed parts (0–5, 5–10, …). Entering a new part shows the part just watched («بعد») or the
  // part about to start («قبل»). Fixed parts = the same text each time, so the AI answer is cached
  // and reused (never asked twice). Speed, pauses and seeking back don't trigger it.
  let lastPart = null;
  let recapBusy = false;
  const readMs = (text) => Math.max(5000, Math.min(12000, String(text).split(/\s+/).length * 330 + 1500));
  const showRecapNote = (from, to, title) => {
    if (!state.config.ai.available || recapBusy) return;
    recapBusy = true;
    api.recap(id, from, to).then((r) => {
      if (!alive || !r.ok || !r.text) return;
      // stays up as long as it takes to read it (5–12 s), then hides by itself
      popNote(`<div class="lt-title">${title}</div><p class="lt-text">${esc(r.text)}</p>`, { ms: readMs(r.text), cls: 'lt-recap' });
    }).catch(() => {}).finally(() => { recapBusy = false; });
  };
  // a new choice (minutes / before-after): start counting from where the video is now
  const resetRecap = () => { lastPart = null; };
  const recapTimer = setInterval(() => {
    if (!playing || !player || !recapOn) return;
    const t = player.time?.() || 0;
    const span = recapMin * 60;
    const part = Math.floor(t / span);
    if (lastPart == null) {
      lastPart = part;
      if (recapWhen === 'before') showRecapNote(part * span, (part + 1) * span, 'الجاي باختصار');
      return;
    }
    if (part <= lastPart) { lastPart = part; return; } // same part, or the learner went back
    lastPart = part;
    if (recapWhen === 'before') showRecapNote(part * span, (part + 1) * span, 'الجاي باختصار');
    else showRecapNote((part - 1) * span, part * span, 'السالفة باختصار');
  }, 1000);
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
  // ⚙ Settings: one clear list, every section open — a soft grey line between sections,
  // each title in a rounded tinted pill with its own line icon (the site's theme).
  (() => {
    const rset = $('#rset', view);
    if (!rset) return;
    const sv = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
    const IC = {
      'السرعة': sv('<path d="M4 15a8 8 0 1 1 16 0"/><path d="m12 15 4-5"/>'),
      'التوقف': sv('<rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/>'),
      'التدريب': sv('<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>'),
      'قائمة الكلمات': sv('<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/>'),
      'ملخص كل فترة': sv('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
      'الترجمة': sv('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>'),
      'شكل الكلمات': sv('<path d="M4 20h16"/><rect x="5" y="5" width="14" height="9" rx="2"/>'),
      'أزرار تحت': sv('<rect x="3" y="14" width="18" height="7" rx="2"/><path d="M8 17.5h.01M12 17.5h.01M16 17.5h.01"/>'),
      'الخلفية': sv('<path d="M12 3a9 9 0 1 0 9 9 7 7 0 0 1-9-9z"/>'),
      'النص': sv('<path d="M5 7V5h14v2M12 5v14M9 19h6"/>'),
      'الفيديو': sv('<rect x="3" y="5" width="18" height="14" rx="3"/><path d="m10 9 5 3-5 3z"/>'),
      'بحث': sv('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>'),
      'شرح': sv('<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.7M12 17h.01"/>'),
      'أدوات': sv('<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.5-.5-.5-2.5z"/>'),
    };
    rset.querySelectorAll('.slabel').forEach((l) => {
      const name = l.textContent.trim();
      l.innerHTML = `${IC[name] || ''}<span>${esc(name)}</span>`;
    });
    rset.classList.add('rs-list');
    // 🔲 expanded mode keeps only ⏯ 📝 ⚙ on top — the rest lives here
    const fr = document.createElement('div');
    fr.className = 'rs-focus-row';
    fr.innerHTML = `<button type="button" class="btn sm" data-fx="wordsBtn">📋 الكلمات <b class="en-inline" data-fx-count></b></button><button type="button" class="btn sm" data-fx="focusBtn">↙ تصغير الشاشة</button>`;
    fr.addEventListener('click', (e) => {
      const b = e.target.closest('[data-fx]');
      if (!b) return;
      $('#setBtn', view)?.click();
      $(`#${b.dataset.fx}`, view)?.click();
    });
    rset.insertBefore(fr, rset.querySelector('.rset-title')?.nextSibling || rset.firstChild);
  })();
  // 🎨 words: highlight or frame, colour of new words and of «كلماتي»; 🌗 page background — for every video
  applyMarkLook();
  const rbgOf = () => pref('reader.bg', '');
  const applyBg = () => { if (rbgOf()) document.documentElement.dataset.rbg = rbgOf(); else delete document.documentElement.dataset.rbg; };
  applyBg();
  const drawLook = () => {
    view.querySelectorAll('[data-mks]').forEach((b) => b.classList.toggle('active', b.dataset.mks === pref('reader.mkStyle', 'fill')));
    view.querySelectorAll('[data-mkn]').forEach((b) => b.classList.toggle('on', b.dataset.mkn === pref('reader.mkNew', MK_NEW[0][0])));
    view.querySelectorAll('[data-mkm]').forEach((b) => b.classList.toggle('on', b.dataset.mkm === pref('reader.mkMine', MK_MINE[0][0])));
    view.querySelectorAll('[data-rbg]').forEach((b) => b.classList.toggle('active', b.dataset.rbg === rbgOf()));
  };
  // 👍 phone buttons under the thumb: when to show them and how big (for every video)
  const applyTb = () => { document.body.dataset.tb = pref('reader.tbShow', 'normal'); document.body.dataset.tbsize = pref('reader.tbSize', 'm'); };
  applyTb();
  const drawTb = () => {
    view.querySelectorAll('[data-tbs]').forEach((b) => b.classList.toggle('active', b.dataset.tbs === pref('reader.tbShow', 'normal')));
    view.querySelectorAll('[data-tbz]').forEach((b) => b.classList.toggle('active', b.dataset.tbz === pref('reader.tbSize', 'm')));
  };
  drawTb();
  $('#rset', view)?.addEventListener('click', (e) => {
    const b = e.target.closest('[data-tbs],[data-tbz]');
    if (!b) return;
    if (b.dataset.tbs) setPref('reader.tbShow', b.dataset.tbs);
    if (b.dataset.tbz) setPref('reader.tbSize', b.dataset.tbz);
    applyTb(); drawTb();
  });
  drawLook();
  $('#rset', view)?.addEventListener('click', (e) => {
    const b = e.target.closest('[data-mks],[data-mkn],[data-mkm],[data-rbg]');
    if (!b) return;
    if (b.dataset.mks) setPref('reader.mkStyle', b.dataset.mks);
    if (b.dataset.mkn) setPref('reader.mkNew', b.dataset.mkn);
    if (b.dataset.mkm) setPref('reader.mkMine', b.dataset.mkm);
    if (b.dataset.rbg !== undefined) { setPref('reader.bg', b.dataset.rbg); applyBg(); }
    applyMarkLook();
    drawLook();
  });
  // Font size of the transcript (remembered). Phones start at 13 until the learner changes it.
  const defFont = window.matchMedia?.('(max-width: 760px)').matches ? '13' : '16';
  let fontPx = Number(pref('reader.font', defFont)) || Number(defFont);
  const applyFont = () => linesEl.style.setProperty('--reader-font', `${fontPx}px`);
  applyFont();
  const stepFont = (d) => {
    fontPx = Math.max(12, Math.min(30, fontPx + d));
    setPref('reader.font', String(fontPx));
    applyFont();
    recenter();
    const n = document.querySelector('#fontPill b');
    if (n) n.textContent = String(fontPx);
  };
  // 🔠 A−/A+ close the settings sheet and show a small pill, so the text is seen while resizing
  const fontPill = () => {
    document.querySelector('#fontPill')?.remove();
    const p = document.createElement('div');
    p.id = 'fontPill';
    p.className = 'font-pill';
    p.innerHTML = `<button type="button" data-f="-1">A−</button><b class="en-inline">${fontPx}</b><button type="button" data-f="1">A+</button><button type="button" data-f="ok">✓</button>`;
    document.body.appendChild(p);
    p.addEventListener('click', (e) => {
      const f = e.target.closest('[data-f]')?.dataset.f;
      if (f === 'ok') p.remove(); else if (f) stepFont(Number(f));
    });
  };
  view.querySelectorAll('[data-font]').forEach((b) => b.addEventListener('click', () => {
    stepFont(Number(b.dataset.font));
    $('#rset', view)?.classList.add('hidden');
    $('#setBtn', view)?.classList.remove('primary');
    fontPill();
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
    if (b) {
      b.title = on ? 'تصغير: رجوع للشاشة العادية' : 'توسيع الشاشة';
      b.innerHTML = icon.expand;
    }
    setTimeout(placeFloat, 50);
    if (on && document.documentElement.requestFullscreen && !document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => { focusFs = true; }).catch(() => {});
    } else if (!on && focusFs && document.fullscreenElement) {
      focusFs = false;
      document.exitFullscreen().catch(() => {});
    }
  };
  $('#focusBtn', view)?.addEventListener('click', () => {
    const on = !document.body.classList.contains('reader-focus');
    setPref('reader.focus', on ? '1' : '0'); // remembered: the page opens the way it was left
    setFocus(on);
  });
  // a video opens wide by itself (no site bars) unless the learner shrank it last time
  // …and a link just pasted on «أضف» always opens wide (only the top bar + ⚙)
  let justAdded = false;
  try { justAdded = sessionStorage.getItem('reader.openWide') === String(id); sessionStorage.removeItem('reader.openWide'); } catch { /* ignore */ }
  if (justAdded || (isVideo && pref('reader.focus', '1') === '1')) setFocus(true);
  // The browser may leave full screen by itself (on iPad: scrolling up to read earlier lines).
  // Focus mode stays on — only the ✕ / shrink button takes the learner back.
  const onFsChange = () => { if (focusFs && !document.fullscreenElement) focusFs = false; };
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
    linesEl.innerHTML = data.lines.map((l) => lineHtml(l, data.marks)).join('') || '<p class="muted">ما فيه نص.</p>';
    linesEl.scrollTop = keep;
    if (currentId) linesEl.querySelector(`.line[data-id="${currentId}"]`)?.classList.add('current');
    currentWord = -1; // re-applied on the next tick
    markParas();
  };
  // Lines that make one complete sentence or idea (about 2–4 lines) form a paragraph:
  // it lights up green as a whole; inside it the spoken line is yellow, and the word orange.
  let currentPara = null;
  function markParas() {
    const byId = new Map(data.lines.map((l) => [String(l.id), l]));
    let para = 0;
    let n = 0;
    let chars = 0;
    let prevEnd = null;
    for (const el of linesEl.querySelectorAll('.line')) {
      const l = byId.get(el.dataset.id);
      const text = String(l?.text || '').trim();
      const start = Number(l?.start_seconds);
      // a long pause also starts a new paragraph
      if (n && prevEnd != null && Number.isFinite(start) && start - prevEnd > 6) { para += 1; n = 0; chars = 0; }
      // never more than 3 rows on screen in one green paragraph
      const rows = el.querySelectorAll('.chunk').length || 1;
      if (n && n + rows > 3) { para += 1; n = 0; chars = 0; }
      el.dataset.para = String(para);
      n += rows;
      chars += text.length;
      prevEnd = Number.isFinite(start) ? start + Math.max(1, text.split(/\s+/).length * 0.35) : prevEnd;
      const ends = /[.?!…]["')\]]?$/.test(text);
      if ((ends && (n >= 2 || chars >= 90)) || n >= 3) { para += 1; n = 0; chars = 0; }
    }
    if (currentPara != null) showPara(currentPara, false);
  }
  function showPara(p, fadePrev = true) {
    linesEl.querySelectorAll('.line.para-now, .line.past-fade').forEach((x) => x.classList.remove('para-now', 'para-first', 'para-last', 'past-fade'));
    const lines = [...linesEl.querySelectorAll(`.line[data-para="${p}"]`)];
    lines.forEach((x, k) => {
      x.classList.add('para-now');
      x.classList.toggle('para-first', k === 0);
      x.classList.toggle('para-last', k === lines.length - 1);
    });
    // everything already said is faded (80% transparent), so the eye stays on the green block
    void fadePrev;
    for (const x of linesEl.querySelectorAll('.line[data-para]')) if (Number(x.dataset.para) < Number(p)) x.classList.add('past-fade');
    return lines[0];
  }

  // Suggested words: filter by level, search, only unsaved; long lists shown 150 at a time.
  const sideKey = `reader.side.${id}`;
  const sideF = (() => { try { return { level: '', q: '', unsaved: false, ...JSON.parse(pref(sideKey, '{}')) }; } catch { return { level: '', q: '', unsaved: false }; } })();
  let sideLimit = 150;
  let sidePop = '';
  // Only NEW words are suggested: words already in «كلماتي» (or marked «أعرفها») before this
  // video was opened are left out; a word saved here stays in the list (with ✓) until you leave.
  const seenItems = new Set();
  const knownBefore = new Set();
  // 📝 the video's NEW words are fixed the first time it is opened (kept on this device), so the
  // count never drops to 0 after saving them — saved ones stay listed with ✓
  const newKey = `reader.new.${id}`;
  const firstNew = (() => { try { const v = JSON.parse(localStorage.getItem(newKey) || 'null'); return Array.isArray(v) ? new Set(v) : null; } catch { return null; } })();
  const newSet = firstNew || new Set();
  const noteKnown = () => {
    let added = false;
    for (const it of data.items) {
      if (seenItems.has(it.vocabulary_id)) continue;
      seenItems.add(it.vocabulary_id);
      const had = it.user_state === 'saved' || it.user_state === 'dismissed';
      if (newSet.has(it.vocabulary_id)) continue;
      if (had && !it.saved_here && (firstNew || !autoSaveAll)) knownBefore.add(it.vocabulary_id);
      else { newSet.add(it.vocabulary_id); added = true; }
    }
    if (added) { try { localStorage.setItem(newKey, JSON.stringify([...newSet].slice(-3000))); } catch { /* ignore */ } }
  };
  let autoSaveAll = (() => { try { return localStorage.getItem(`reader.saveall.${id}`) === '1'; } catch { return false; } })(); // «احفظ الكل» once = the later ones too
  noteKnown();
  // a word saved FROM this video is always one of its new words (on any device)
  const isNew = (it) => it.saved_here || hereSetHas(it.vocabulary_id) || !knownBefore.has(it.vocabulary_id);
  let hereSetHas = () => false;
  // 🟦 this video's NEW words stay teal in the text even after they are saved — a clear record of
  // what this video added; purple is only for words that were in «كلماتي» before it.
  // any word seen NOT saved in this video's text is «new here» from then on (kept on this device)
  const hereKey = `reader.newhere.${id}`;
  const hereSet = (() => { try { return new Set(JSON.parse(localStorage.getItem(hereKey) || '[]')); } catch { return new Set(); } })();
  newSet.forEach((v) => hereSet.add(v));
  hereSetHas = (v) => hereSet.has(v);
  const paintNew = () => {
    let grew = false;
    linesEl.querySelectorAll('.mark[data-vid]').forEach((m) => {
      const v = Number(m.dataset.vid);
      if (!m.classList.contains('s-saved') && !hereSet.has(v)) { hereSet.add(v); grew = true; }
      const on = hereSet.has(v);
      if (on !== m.classList.contains('s-newhere')) m.classList.toggle('s-newhere', on);
    });
    if (grew) { try { localStorage.setItem(hereKey, JSON.stringify([...hereSet].slice(-4000))); } catch { /* ignore */ } }
  };
  paintNew();
  const newObs = new MutationObserver(paintNew);
  newObs.observe(linesEl, { childList: true, subtree: true });
  const sideShown = () => data.items.filter(isNew).filter((it) => (!sideF.level || it.level === sideF.level)
    && (!sideF.show || sideF.show === 'all' || (sideF.show === 'unsaved' ? !it.user_state : it.user_state === 'saved'))
    && (!sideF.q || `${it.term} ${it.arabic || ''}`.toLowerCase().includes(sideF.q.toLowerCase())));
  const drawSide = () => {
    const shown = sideShown();
    const unsavedShown = shown.filter((i) => !i.user_state);
    const fresh = data.items.filter(isNew);
    const levels = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].filter((l) => fresh.some((i) => i.level === l));
    $('#wcount', view).textContent = fresh.length;
    if ($('#wcount2', view)) $('#wcount2', view).textContent = fresh.length;
    view.querySelectorAll('[data-fx-count]').forEach((x) => { x.textContent = fresh.length; });
    const q = (extra) => `#/practice?${new URLSearchParams({ source: id, title: source.title.slice(0, 40), ...extra })}`;
    side.innerHTML = `
      <div class="side-head">
        <div class="row between"><b>الكلمات الجديدة <span class="tiny muted en-inline">${shown.length}${shown.length !== fresh.length ? `/${fresh.length}` : ''}</span></b>
          <span class="row" style="gap:8px"><span class="u-dots" title="شائعة · أقل · نادرة"><i class="u-d common"></i><i class="u-d medium"></i><i class="u-d rare"></i></span><button type="button" class="pop-x side-close" id="sideClose" aria-label="إغلاق">✕</button></span></div>
        <div class="glow-row">
          ${unsavedShown.length ? `<button class="save-all-btn" id="saveAll" title="احفظ كل الكلمات الجديدة">${icon.bookmark}<span>حفظ الكل</span></button>` : ''}
          ${fresh.some((i) => i.user_state === 'saved') ? `<button class="glow-ic ${sideF.show === 'saved' ? 'on' : ''}" id="savedOnly" title="اعرض المحفوظة فقط">${icon.check}<span>المحفوظة</span>${sideF.show === 'saved' ? '<b class="x">✕</b>' : ''}</button>` : ''}
          ${data.items.length >= 4 ? `<button class="glow-ic" data-pop="prac" title="تدرّب">${icon.game}<span>تدرّب</span></button>` : ''}
          ${levels.length > 1 ? `<button class="glow-ic ${sideF.level ? 'on' : ''}" data-pop="lv" title="المستوى">${icon.sliders}<span>${sideF.level || 'المستوى'}</span></button>` : ''}
          <button class="glow-ic ${sideF.q ? 'on' : ''}" data-pop="q" title="بحث">${icon.search}</button>

        </div>
        ${sidePop === 'save' ? `<div class="pop-menu">${unsavedShown.length ? `<button type="button" class="pop-opt" id="saveAll">${icon.save} احفظ الكل (${unsavedShown.length})</button>` : ''}<span class="tiny muted">عرض:</span>${[['all', 'الكل'], ['unsaved', 'غير المحفوظة'], ['saved', 'المحفوظة']].map(([k, l]) => `<button type="button" class="pop-opt ${(sideF.show || 'all') === k ? 'on' : ''}" data-show="${k}">${l}</button>`).join('')}<button type="button" class="pop-x" data-pop="">✕</button></div>` : ''}
        ${sidePop === 'prac' ? `<div class="pop-menu"><a class="pop-opt" href="${q({ mode: 'cards' })}">بطاقات</a><a class="pop-opt" href="${q({ mode: 'games', type: 'meaning' })}">المعنى</a><a class="pop-opt" href="${q({ mode: 'games', type: 'listen' })}">استمع واختر</a><a class="pop-opt" href="${q({ mode: 'games', type: 'connect' })}">روابط</a><button type="button" class="pop-opt pf-open" id="pfOpen">اختر بدقة</button><button type="button" class="pop-x" data-pop="">✕</button></div>` : ''}
        ${sidePop === 'lv' ? `<div class="pop-menu"><button class="pop-opt lv ${sideF.level ? '' : 'on'}" data-lv="">الكل</button>${levels.map((l) => `<button class="pop-opt lv ${sideF.level === l ? 'on' : ''}" data-lv="${l}">${l}</button>`).join('')}<button type="button" class="pop-x" data-pop="">✕</button></div>` : ''}
        ${sidePop === 'q' || sideF.q ? `<div class="row" style="gap:6px;margin-top:6px"><input class="input sm" id="sideQ" type="search" placeholder="ابحث…" value="${esc(sideF.q)}" style="flex:1;min-width:0"><button type="button" class="pop-x" data-clearq>✕</button></div>` : ''}
        <p class="tiny muted" id="refineNote" style="margin:4px 0 0">${source.extractor === 'dictionary' && state.config.ai.available ? '<span class="spinner"></span>' : ''}</p>
      </div>
      <div class="side-list">${shown.slice(0, sideLimit).map((it) => `
        <div class="side-item ${it.user_state === 'dismissed' ? 'dim' : ''}" data-vid="${it.vocabulary_id}" data-line="${it.line_id}">
          <div style="min-width:0"><div class="row" style="gap:6px">${usageDot(it.usage)}<b class="en u-t-${esc(it.usage || '')}">${esc(it.term)}</b>${levelChip(it.level)}</div>
            <div class="small ink-2 clamp1">${esc(it.arabic || '')}</div></div>
          ${it.user_state === 'saved' ? '<span class="saved-tick" title="محفوظة">✓</span>' : `<button class="btn sm" data-save="${it.vocabulary_id}" data-occ="${it.occurrence_id}">حفظ</button>`}
        </div>`).join('') || '<p class="small muted">ما فيه كلمات هنا. غيّر الفلتر، أو اضغط أي كلمة في النص لتفهمها وتحفظها.</p>'}
        ${shown.length > sideLimit ? `<button class="btn sm ghost" id="sideMore" style="width:100%;margin-top:8px">عرض ${Math.min(150, shown.length - sideLimit)} أخرى (${shown.length - sideLimit} متبقية)</button>` : ''}</div>`;
  };
  const saveSideF = () => setPref(sideKey, JSON.stringify(sideF));
  side.addEventListener('click', (e) => {
    const pop = e.target.closest('[data-pop]');
    if (pop) { sidePop = sidePop === pop.dataset.pop ? '' : pop.dataset.pop; drawSide(); if (sidePop === 'q') $('#sideQ', view)?.focus(); return; }
    if (e.target.closest('[data-clearq]')) { sideF.q = ''; sidePop = ''; saveSideF(); drawSide(); return; }
    if (e.target.closest('#sideClose')) { switchTab('text'); return; }
    if (e.target.closest('#savedOnly')) { sideF.show = sideF.show === 'saved' ? 'all' : 'saved'; saveSideF(); drawSide(); return; }
    const sh = e.target.closest('[data-show]');
    if (sh) { sideF.show = sh.dataset.show; sidePop = ''; saveSideF(); drawSide(); return; }
    const lv = e.target.closest('[data-lv]');
    if (lv) { sideF.level = lv.dataset.lv; sideLimit = 150; sidePop = ''; saveSideF(); drawSide(); return; }
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
    noteKnown?.();
    if (autoSaveAll) {
      const later = data.items.filter((it) => !it.user_state && newSet.has(it.vocabulary_id));
      if (later.length) {
        await api.saveWordsBulk(later.map((it) => ({ vocabulary_id: it.vocabulary_id, occurrence_id: it.occurrence_id }))).catch(() => {});
        data = await api.source(id);
      }
    }
    timeline = buildTimeline(data.lines);
    drawLines();
    drawSide();
    refreshStats();
  };

  drawLines();
  drawSide();
  // «احفظ الكل» was pressed on an earlier visit: words that arrived since are saved now
  if (autoSaveAll && data.items.some((it) => !it.user_state && newSet.has(it.vocabulary_id))) refresh().catch(() => {});

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
    const para = el.dataset.para;
    const cls = ['para-now', 'para-first', 'para-last', 'past-fade'].filter((c) => el.classList.contains(c));
    el.outerHTML = lineHtml(line, data.marks);
    const fresh = linesEl.querySelector(`.line[data-id="${line.id}"]`);
    if (fresh) { fresh.dataset.para = para; fresh.classList.add(...cls); }
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
        // a step that timed out or lost its connection is tried again quietly (3 times)
        let r;
        for (let t = 0; ; t++) {
          try { r = await api.translateStep(id); break; } catch (err) {
            if (t >= 3 || !alive || (err.status && err.status < 500)) throw err;
            await sleep(1500 * (t + 1));
          }
        }
        for (const { id: lineId, ar } of r.lines || []) {
          const line = data.lines.find((l) => l.id === lineId);
          if (line && !line.text_ar) {
            line.text_ar = ar;
            if (!line.align) redrawLine(line);
          }
        }
        if (r.complete) {
          if (r.ai_error && missingAr()) setTrNote(`ما قدرنا نترجم: ${esc(r.ai_error)} <button class="link-btn" id="retryTr">أعد المحاولة</button>`);
          else setTrNote('');
          break;
        }
        await sleep(APP_CONFIG.aiStepPauseMs);
      }
    } catch {
      setTrNote('ما قدرنا نترجم الحين. <button class="link-btn" id="retryTr">أعد المحاولة</button>');
    } finally {
      translating = false;
      if (!alive) return;
      if (!missingAr()) { setTrNote(''); repairTranslation(); }
    }
  }
  // Translations made before the fix could slip to the wrong line (a whole sentence put into
  // its first fragment): such windows are translated again, line by line, and redrawn.
  let repairing = false;
  async function repairTranslation() {
    if (repairing || source.is_demo || !ai()) return;
    repairing = true;
    let fixed = 0;
    try {
      for (let i = 0; alive && i < 40; i++) {
        const r = await api.repairTranslation(id);
        fixed += r.fixed || 0;
        if (r.fixed) setTrNote('<span class="spinner"></span> نصحّح ترجمة بعض السطور لتطابق الإنجليزي سطرًا بسطر…');
        if (!r.more) break;
      }
    } catch { /* try again next time */ }
    repairing = false;
    if (!alive) return;
    setTrNote('');
    if (fixed) { await refresh(); ensureAlignment(); }
  }
  ensureAlignment();
  ensureTranslation();
  if (!missingAr()) repairTranslation();
  // 🌐 «ترجمة أدق»: translate this video again with the newer rules (once, then saved)
  $('#retrBtn', view)?.addEventListener('click', async () => {
    toggleSet(false);
    try {
      await api.retranslate(id);
      setTrNote('<span class="spinner"></span> نعيد ترجمة المقطع بدقة أكثر…');
      repairing = false;
      await repairTranslation();
      toast('تمت الترجمة الأدق ✓');
    } catch (err) { toast(err.message); }
  });

  // 2) Smarter word choice: AI reads the transcript in chunks and adds the
  //    useful words / expressions with their meaning in context.
  // ⚡ the rest of the words found in the site index arrive in short steps right after opening
  (async () => {
    if (source.is_demo) return;
    try {
      for (let i = 0; alive && i < 40; i++) {
        const r = await api.indexStep(id);
        if (r.added) await refresh();
        if (!r.more) break;
      }
    } catch { /* the first words are already there */ }
  })();
  let refining = false;
  async function refineWords() {
    if (source.is_demo || source.extractor === 'ai' || !ai()) return;
    const note = () => $('#refineNote', view);
    refining = true;
    try {
      for (let step = 0; alive && step < APP_CONFIG.maxAiSteps; step += 1) {
        const r = await api.refineStep(id);
        if (!alive) return;
        if (r.added) await refresh();
        const n = note();
        if (r.done) {
          if (n) n.innerHTML = r.ai_error ? `${esc(r.ai_error)}` : '';
          if (!source.is_demo) simplifyWords(); // the AI's words too, in their simplest form
          if (!r.ai_error) source.extractor = 'ai';
          refining = false;
          drawSide();
          break;
        }
        if (n) n.innerHTML = `<span class="spinner"></span> نجمع كلمات أكثر… ${Math.round((100 * r.cursor) / Math.max(1, r.total))}%`;
        await sleep(APP_CONFIG.aiStepPauseMs);
      }
    } catch {
      refining = false;
      /* the dictionary words stay; nothing lost */
    }
  }
  refineWords();
  // 🎯 Today's goal (target from the learner's settings; the count is the words gone through).
  // the goal the learner chose (words that went by / minutes watched / answers) — reached here
  const onGoal = (e) => {
    closeWordPanel();
    selfPause(); player?.pause?.();
    celebrateGoal(e.detail, `#/practice?${new URLSearchParams({ source: id, title: source.title.slice(0, 40), mode: 'cards' })}`);
  };
  window.addEventListener('lexitube:goal-reached', onGoal);
  // ⏱ minutes watched (counted on this device only, while the video really plays)
  let watchAt = Date.now();
  const watchTimer = isVideo ? setInterval(() => {
    const now = Date.now();
    if (playing && document.visibilityState === 'visible') noteWatched((now - watchAt) / 1000);
    watchAt = now;
  }, 5000) : 0;
  // Every word of the built-in dictionary used in this video (once per video, no AI).
  // Then every suggested word moves to its simplest form, a few seconds per call.
  let simplifying = null;
  const simplifyWords = () => {
    simplifying ??= (async () => {
      let changed = 0;
      for (let i = 0; alive && i < 25; i++) {
        const r = await api.dictionaryWords(id);
        changed += (r.added || 0) + (r.simplified || 0);
        if (!r.more) break;
      }
      if (alive && changed) await refresh();
    })().catch(() => {}).finally(() => { simplifying = null; });
    return simplifying;
  };
  if ((!String(source.dict_words_at || '').startsWith('v2:') || !source.simplified) && !source.is_demo) simplifyWords();
  // words of this video that never had their level checked get it now — once, then saved for good
  (async () => {
    if (source.is_demo || !ai()) return;
    let changed = 0;
    try {
      for (let i = 0; alive && i < 12; i++) {
        const r = await api.ensureLevels(id);
        changed += r.levelled || 0;
        if (!r.more) break;
      }
    } catch { /* next time */ }
    if (alive && changed) await refresh();
  })();

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
      setTimeout(showVidPos, 0);
      player.setRate(rate);
      if (resumeAt != null) player.seek(resumeAt, { play: false });
    } else {
      box.parentElement.innerHTML = '<div id="player"></div>';
      youtubePlayer($('#player', view), source.youtube_id, startAt ?? resumeAt, (isPlaying) => setPlaying(isPlaying)).then((p) => {
        player = p;
        player.setRate?.(rate);
        showVidPos();
      }).catch(() => {
        $('.player-box', view).innerHTML = `<div class="alert info">ما قدرنا نحمّل مشغّل يوتيوب. يمكنك القراءة هنا، أو <a href="https://www.youtube.com/watch?v=${esc(source.youtube_id)}" target="_blank" rel="noopener">فتح الفيديو في يوتيوب</a>.</div>`;
      });
    }
  }

  // The spoken block stays near the top and still while the yellow phrase moves down
  // through it; only when the block ends does the text glide up one step. The block
  // just finished stays above it, faded, then scrolls away.
  const bringIntoView = (el, force = false) => {
    if (!el || isPanelOpen() || (!force && Date.now() < userScrollUntil)) return;
    // Position inside the transcript box, measured on screen (independent of offsetParent).
    const box = linesEl.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    const top = r.top - box.top + linesEl.scrollTop;
    const view0 = linesEl.scrollTop;
    const h = linesEl.clientHeight;
    const prev = el.previousElementSibling?.classList.contains('line') ? el.previousElementSibling : null; // last line of the paragraph before
    const prevH = prev ? Math.min(prev.getBoundingClientRect().height, h * 0.22) : 0;
    const target = Math.max(0, Math.min(top - prevH - 6, linesEl.scrollHeight - h));
    if (Math.abs(target - view0) > 3) linesEl.scrollTo({ top: target, behavior: force ? 'auto' : 'smooth' });
  };
  const setCurrent = (lineId, { scroll = follow, force = false } = {}) => {
    if (lineId === currentId) return;
    linesEl.querySelectorAll('.c-now, .c-said').forEach((c) => c.classList.remove('c-now', 'c-said'));
    const was = linesEl.querySelector('.line.current');
    was?.classList.remove('current');
    linesEl.querySelectorAll('.w-now, .w-said').forEach((w) => w.classList.remove('w-now', 'w-said'));
    currentId = lineId;
    currentWord = -1;
    const el = lineId != null && linesEl.querySelector(`.line[data-id="${lineId}"]`);
    if (!el) return;
    el.classList.add('current');
    if (was && was !== el && playing) wordsPassed(was);
    // a new paragraph: the green moves on, the one just said fades above it, the text glides up
    if (el.dataset.para !== currentPara || force) {
      const jump = currentPara == null || Math.abs(Number(el.dataset.para) - Number(currentPara)) !== 1;
      currentPara = el.dataset.para;
      const first = showPara(currentPara, !jump);
      if (scroll) bringIntoView(first || el, force);
    }
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
      const on = wi >= 0 && wi >= w0 && wi <= w1;
      c.classList.toggle('c-now', on);
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
  let held = false; // the learner stopped the video: no automatic restart
  let prevEntry = null;
  const modeNote = (t) => { const n = $('#modeNote', view); if (n) n.textContent = t; };
  const cancelGap = () => {
    const was = Boolean(gapTimer);
    clearTimeout(gapTimer);
    clearInterval(gapTick);
    gapTimer = 0;
    gapTick = 0;
    modeNote('');
    showPlayBtn?.();
    return was;
  };
  // «ردّد ورائي» waits for the end of the whole green paragraph (a complete idea, ~3 lines).
  const paraOf = (entry) => {
    const el = entry && linesEl.querySelector(`.line[data-id="${entry.id}"]`);
    if (!el) return { last: true, start: entry?.start ?? 0 };
    const next = el.nextElementSibling;
    const last = !next?.classList.contains('line') || next.dataset.para !== el.dataset.para;
    const first = linesEl.querySelector(`.line[data-para="${el.dataset.para}"]`);
    const firstEntry = first && timeline.find((x) => String(x.id) === first.dataset.id);
    return { last, start: firstEntry ? firstEntry.start : entry.start };
  };
  const pauseHere = (entry) => playMode !== 'shadow' || paraOf(entry).last;
  function startGap(entry) {
    gapDoneFor = entry.id;
    if (held) return;
    const ms = playMode === 'shadow'
      ? Math.min(25000, Math.max(1500, ((entry.end - paraOf(entry).start) * 1000) / (rate || 1) + 800))
      : gapMs;
    selfPause(); player.pause();
    const until = Date.now() + ms;
    const show = () => {
      const left = Math.max(0, Math.ceil((until - Date.now()) / 1000));
      modeNote(playMode === 'shadow' ? `🗣 ردّد الفقرة الحين… ${left}` : '⏸ …');
    };
    show();
    gapTick = setInterval(show, 250);
    showPlayBtn();
    gapTimer = setTimeout(() => {
      cancelGap();
      if (alive && !isPanelOpen() && !held) player.play();
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
    $('#shadowBtn', view)?.classList.toggle('primary', playMode === 'shadow');
    $('#shadowBtn', view)?.setAttribute('aria-pressed', String(playMode === 'shadow'));
  };
  const setMode = (m) => {
    playMode = m;
    setPref('reader.mode', playMode);
    gapDoneFor = null;
    if (cancelGap() && alive && !held) player?.play?.();
    showMode();
  };
  $('#shadowBtn', view)?.addEventListener('click', () => {
    setMode(playMode === 'shadow' ? 'normal' : 'shadow');
    toast(playMode === 'shadow' ? '🗣 ردّد معي: يقف بعد كل جملة لتعيدها' : 'رجع التشغيل عادي');
  });
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

  // 🔁 Each green paragraph is played twice, then the video goes on.
  let repeatPara = pref('reader.repeatPara', '0') === '1';
  let repeatedPara = null;
  const showLoop = () => {
    for (const b of [$('#loopBtn', view), $('#againBtn', view)]) {
      if (!b) continue;
      b.classList.toggle('primary', repeatPara);
      b.setAttribute('aria-pressed', String(repeatPara));
    }
  };
  const toggleLoop = () => {
    repeatPara = !repeatPara;
    repeatedPara = null;
    setPref('reader.repeatPara', repeatPara ? '1' : '0');
    showLoop();
    toast(repeatPara ? '🔁 كل جملة تُعاد مرتين تلقائيًا' : 'الإعادة متوقفة');
  };
  showLoop();
  $('#loopBtn', view)?.addEventListener('click', toggleLoop);
  $('#againBtn', view)?.addEventListener('click', toggleLoop);
  $('#tourR', view)?.addEventListener('click', () => { toggleSet(false); startTour('reader'); });
  // back = where the learner came from (today, words…), not always «أضف»
  $('#backLink', view)?.addEventListener('click', (e) => { if (window.__navCount > 1) { e.preventDefault(); window.history.back(); } });
  $('#colorKey', view)?.addEventListener('click', () => {
    toggleSet(false);
    popNote(`<div class="lt-title">🎨 مفتاح الألوان</div><div class="ck">
      <div><span class="mark s-suggested u-common">كلمة</span> جديدة وشائعة — تستاهل تحفظها</div>
      <div><span class="mark s-suggested u-medium">كلمة</span> جديدة وأقل شيوع</div>
      <div><span class="mark s-suggested u-rare">كلمة</span> جديدة ونادرة</div>
      <div><span class="mark s-saved s-newhere">كلمة</span> جديدة من هذا المقطع وحفظتها — تبقى تيفاني</div>
      <div><span class="mark s-saved">كلمة</span> كانت في كلماتك قبل هذا المقطع</div>
      <div><span class="ck-line"></span> السطر اللي ينقال الحين</div></div>`, { cls: 'lt-contrast' });
  });
  // ↺ every look/behaviour setting back to the original (they are shared by ALL videos);
  // the learner's data — which words were new in each video, «احفظ الكل» — is kept
  const resetAll = () => {
    if (!confirm('ترجع كل إعدادات المقاطع للأصل؟ (كلماتك ما تتأثر)')) return;
    try { Object.keys(localStorage).filter((k) => k.startsWith('reader.') && !/^reader\.(saveall|new|newhere)\./.test(k)).forEach((k) => localStorage.removeItem(k)); } catch { /* ignore */ }
    toast('رجعت كل الإعدادات للأصل ✓');
    setTimeout(() => location.reload(), 700);
  };
  $('#resetR', view)?.addEventListener('click', resetAll);
  $('#resetAll', view)?.addEventListener('click', resetAll);
  maybeTour('reader');

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
  // ⏯ A stop that always holds: it also ends a «ردّد ورائي» pause, and nothing restarts
  // the video by itself until it is pressed again.
  function showPlayBtn() {
    const b = $('#playBtn', view);
    if (!b) return;
    const on = (playing || Boolean(gapTimer)) && !held;
    b.innerHTML = on ? icon.pause : icon.play;
    b.classList.toggle('primary', on);
    const tb = document.querySelector('.thumb-bar .tb-play');
    if (tb) tb.innerHTML = on ? icon.pause : icon.play;
  }
  function togglePlay() {
    if (!player) return;
    if ((player.playing?.() || gapTimer) && !held) {
      held = true;
      cancelGap();
      selfPause(); player.pause();
    } else {
      held = false;
      cancelGap();
      player.play();
    }
    showPlayBtn();
  }
  $('#playBtn', view)?.addEventListener('click', togglePlay);
  // 👍 phones: the main controls under the thumb (previous · play · again · next)
  let thumbBar = null;
  if (isVideo && hasTimes && window.matchMedia?.('(pointer: coarse) and (max-width: 760px)').matches) {
    thumbBar = document.createElement('div');
    thumbBar.className = 'thumb-bar';
    thumbBar.innerHTML = `<button type="button" data-tb="prev" aria-label="الجملة السابقة">${icon.next}</button><button type="button" data-tb="play" class="tb-play" aria-label="تشغيل أو إيقاف">${icon.play}</button><button type="button" data-tb="again" aria-label="أعد الجملة">↻</button><button type="button" data-tb="next" aria-label="الجملة التالية">${icon.prev}</button>`;
    document.body.appendChild(thumbBar);
    document.body.classList.add('has-thumb-bar');
    thumbBar.addEventListener('click', (e) => {
      const k = e.target.closest('[data-tb]')?.dataset.tb;
      if (k === 'play') togglePlay(); else if (k === 'again') againLine(); else if (k === 'prev') stepLine(-1); else if (k === 'next') stepLine(1);
    });
  }
  // 🔁 one press: the current sentence again (and the video plays even if it was stopped)
  function againLine() {
    const cur = timeline.find((x) => x.id === currentId) || timeline[0];
    if (!cur || !player) return;
    player.seek(Math.max(0, cur.start - 0.05));
    lastT = null;
    held = false;
    cancelGap();
    player.play();
    showPlayBtn();
  }

  const onKey = (e) => {
    if (e.target.closest?.('input, textarea, select, [contenteditable]') || e.metaKey || e.ctrlKey || e.altKey || isPanelOpen()) return;
    const k = e.key.toLowerCase();
    if (k === ' ' && player) {
      e.preventDefault();
      togglePlay();
    } else if (e.key === 'ArrowRight') { e.preventDefault(); stepLine(-1); } // RTL page: → goes back
    else if (e.key === 'ArrowLeft') { e.preventDefault(); stepLine(1); }
    else if (k === 'r') againLine(); else if (k === 'l') toggleLoop();
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
    // 🔁 the end of a green paragraph heard once: back to its start for a second time
    if (repeatPara && playing && entry && !gapTimer) {
      const back = (e) => {
        const key = linesEl.querySelector(`.line[data-id="${e.id}"]`)?.dataset.para;
        if (key == null || repeatedPara === key || !paraOf(e).last) return false;
        repeatedPara = key;
        player.seek(Math.max(0, paraOf(e).start - 0.05));
        lastT = null;
        prevEntry = null;
        return true;
      };
      if (t >= entry.end - 0.25 && back(entry)) return;
      if (!jumped && prevEntry && prevEntry.id !== entry.id && t - entry.start < 1 && back(prevEntry)) return;
    }
    if (playMode !== 'normal' && loopId == null && playing && entry && !gapTimer) {
      if (gapDoneFor !== entry.id && t >= entry.end - 0.25 && pauseHere(entry)) startGap(entry);
      else if (!jumped && prevEntry && prevEntry.id !== entry.id && gapDoneFor !== prevEntry.id && pauseHere(prevEntry) && entry.start >= prevEntry.end - 0.01 && t - entry.start < 1) {
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
    // ⏸ stopped on the YouTube player itself (not by our own pauses): it stays stopped
    if (playing && !isPlaying && Date.now() - lastSelfPause > 1500 && !gapTimer) held = true;
    if (isPlaying) held = false; // started again (here or on the YouTube player)
    if (isPlaying && wbOn && wbWhen === 'before' && !previewDone) { previewDone = true; setTimeout(previewNext, 0); }
    playing = isPlaying;
    showPlayBtn();
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
  const progressTimer = isVideo ? setInterval(() => { if (playing) saveProgress(); }, 60000) : 0;
  // ⏯ the exact place is kept when the page is left, hidden or the phone is locked
  const onHide = () => { if (document.visibilityState === 'hidden') saveProgress(true); };
  const onLeave = () => saveProgress(true);
  document.addEventListener('visibilitychange', onHide);
  window.addEventListener('pagehide', onLeave);
  // 🔊 the phone allowed only a muted start: the first touch anywhere on the page turns the sound on (no button)
  const unmuteOnTouch = () => { player?.unmute?.(); document.removeEventListener('pointerdown', unmuteOnTouch, true); };
  const onMuted = () => document.addEventListener('pointerdown', unmuteOnTouch, true);
  window.addEventListener('lexitube:muted', onMuted);
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
    // closing the meaning (or saving) plays the video again by itself.
    if (mark || tok) {
      const inGap = cancelGap();
      if (player && !isPanelOpen()) resumeAfterWord = resumeAfterWord || inGap || (player.playing?.() ?? false);
      if (player && entry?.words?.[wi]) {
        player.seek(Math.max(0, entry.words[wi].start - 0.15), { play: false });
        setCurrent(entry.id, { scroll: false });
        lastT = null;
        tick();
      }
      selfPause(); player?.pause?.();
      // closing the meaning (✕, tap outside, or after «حفظ») always plays the video again — no extra tap
      const onClose = () => {
        resumeAfterWord = false;
        if (!alive || !player || isPanelOpen()) return;
        held = false;
        cancelGap();
        player.play?.();
        showPlayBtn();
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
        // remembered for this video: every word that arrives later (now or on a later visit) is saved too
        autoSaveAll = true;
        try { localStorage.setItem(`reader.saveall.${id}`, '1'); } catch { /* ignore */ }
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

  // one small bar over a highlighted passage: 📌 keep it in «أفكار» · ✨ explain it (short ones)
  const selBar = document.createElement('div');
  selBar.className = 'sel-fab hidden';
  selBar.innerHTML = '<button type="button" class="btn sm" id="keepSel">📌 احفظ في «أفكار»</button>';
  const explainBtn = document.createElement('button');
  explainBtn.className = 'btn sm primary';
  explainBtn.type = 'button';
  explainBtn.innerHTML = '✨ اشرح';
  selBar.append(explainBtn);
  document.body.append(selBar);
  let selection = null;
  const hideExplain = () => selBar.classList.add('hidden');
  const lineOf = (node) => (node && linesEl.contains(node) ? (node.nodeType === 1 ? node : node.parentElement)?.closest('.line') : null);
  const onSelect = () => setTimeout(() => {
    const sel = window.getSelection();
    const text = sel?.toString().replace(/\s+/g, ' ').trim() || '';
    const a = lineOf(sel?.anchorNode);
    const b = lineOf(sel?.focusNode) || a;
    if (!a || text.length < 2 || text.length > 2000) return hideExplain();
    // the lines the passage covers (for its time and its Arabic)
    const all = [...linesEl.querySelectorAll('.line')];
    const [i, j] = [all.indexOf(a), all.indexOf(b)].sort((x, y) => x - y);
    const ids = all.slice(i, j + 1).map((el) => Number(el.dataset.id));
    const covered = data.lines.filter((l) => ids.includes(l.id));
    const r = sel.getRangeAt(0).getBoundingClientRect();
    // the English passage: the whole lines when several are covered, else the words picked (no Arabic / times)
    const picked = text.replace(/[\u0600-\u06FF\u0750-\u077F]+[^A-Za-z]*/g, ' ').replace(/\b\d{1,2}:\d{2}\b/g, ' ').replace(/\s+/g, ' ').trim();
    const en = covered.length > 1 ? covered.map((l) => l.text).join(' ') : (picked.length >= 2 ? picked : covered[0]?.text || text);
    selection = { text: picked || text, en, lineId: ids[0], t: Math.floor(Number(covered[0]?.start_seconds) || 0), ar: covered.map((l) => l.text_ar || '').filter(Boolean).join(' ') };
    explainBtn.classList.toggle('hidden', text.length > 300);
    selBar.style.top = `${Math.max(8, r.top + window.scrollY - 46)}px`;
    selBar.style.left = `${Math.max(8, Math.min(window.innerWidth - 290, r.left + window.scrollX))}px`;
    selBar.classList.remove('hidden');
    return undefined;
  }, 10);
  linesEl.addEventListener('mouseup', onSelect);
  linesEl.addEventListener('touchend', onSelect);
  document.addEventListener('selectionchange', () => {
    if (!window.getSelection()?.toString().trim()) setTimeout(hideExplain, 150);
  });
  selBar.addEventListener('mousedown', (e) => e.preventDefault()); // keep the selection
  selBar.querySelector('#keepSel').addEventListener('click', async () => {
    if (!selection) return;
    hideExplain();
    const { en, t, ar } = selection;
    try {
      await api.keepClip(id, t, en, ar);
      window.getSelection()?.removeAllRanges();
      toast('📌 انحفظت في «أفكار»');
    } catch (err) { toast(err.message); }
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
          if (!info.found) throw new Error('ما قدرنا نحفظ هذي الكلمة.');
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
  // ⏱ line times: hidden by default on phones (more room for the text), shown on bigger screens
  let showTimes = pref('reader.times', window.innerWidth < 700 ? '0' : '1') === '1';
  const applyTimes = () => { linesEl.classList.toggle('no-times', !showTimes); const c = $('#timesToggle', view); if (c) c.checked = showTimes; };
  applyTimes();
  $('#timesToggle', view)?.addEventListener('change', (e) => { showTimes = e.target.checked; setPref('reader.times', showTimes ? '1' : '0'); applyTimes(); });
  $('#followToggle', view)?.addEventListener('change', (e) => {
    follow = e.target.checked;
    setPref('reader.follow', follow ? '1' : '0');
  });
  const switchTab = (t) => {
    tab = t;
    $('.reader-grid', view).dataset.tab = t;
    view.querySelectorAll('.reader-tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === t));
    $('#wordsBtn', view)?.classList.toggle('primary', t === 'words');
  };
  $('#wordsBtn', view)?.addEventListener('click', () => { switchTab(tab === 'words' ? 'text' : 'words'); window.scrollTo({ top: 0 }); });
  view.querySelector('.reader-tabs').addEventListener('click', (e) => {
    const b = e.target.closest('[data-tab]');
    if (b) switchTab(b.dataset.tab);
  });
  /* 📝 Summary of the video */
  let summaryCache = null;
  $('#sumTop', view)?.addEventListener('click', () => $('#summaryBtn', view)?.click());
  // done = a «✓ تم» button at the end (used when the video ends)
  const showSummary = async (done = null) => {
    const doneBtn = done ? '<div class="btn-row" style="justify-content:center;margin-top:14px"><button type="button" class="btn primary" id="sumDone">✓ تم</button></div>' : '';
    const box = openModal('<h2>📝 ملخص المقطع</h2><p class="muted"><span class="spinner"></span> نقرأ المقطع كاملًا ونلخّصه…</p>', { wide: true });
    try {
      summaryCache = summaryCache || await api.summary(id);
      const s = summaryCache;
      box.innerHTML = `<button class="btn icon sm ghost modal-close" data-close aria-label="إغلاق">${icon.x}</button>
        <h2 style="margin-bottom:4px">📝 ملخص المقطع</h2><div class="tiny muted en" style="margin-bottom:12px">${esc(source.title)}</div>
        ${summaryHtml(s)}
        <div class="btn-row" style="justify-content:center;margin-top:12px"><button type="button" class="btn" id="sumKeep">${icon.bookmark} احفظ في «أفكار»</button></div>${doneBtn}`;
      bindSpeech(box);
      box.querySelector('#sumKeep')?.addEventListener('click', async (e) => {
        const b = e.currentTarget;
        b.disabled = true;
        try { await api.keepNote(id, s); b.innerHTML = `${icon.check} محفوظ في <a href="#/notes" data-close>أفكار</a>`; } catch (err) { b.disabled = false; toast(err.message); }
      });
    } catch (err) {
      box.innerHTML = `<button class="btn icon sm ghost modal-close" data-close aria-label="إغلاق">${icon.x}</button><h2>📝 ملخص المقطع</h2><div class="alert">${esc(err.message)}</div>${doneBtn}`;
    }
    box.querySelector('#sumDone')?.addEventListener('click', () => { closeModal(true); done(); });
  };
  $('#summaryBtn', view)?.addEventListener('click', () => showSummary());

  // 🏁 the video ended: its summary, then «أحسنت» 🎉 with practice on its words (not a test) or finish
  const finishVideo = () => {
    const colors = ['#0ABAB5', '#8b5cf6', '#CBA55E', '#22a35a', '#ec4899', '#3b82f6', '#f59e0b'];
    const bits = Array.from({ length: 70 }, (_, i) => `<i style="--x:${Math.round(Math.random() * 100)}%;--d:${(Math.random() * 0.9).toFixed(2)}s;--t:${(1.6 + Math.random() * 1.4).toFixed(2)}s;--r:${Math.round(Math.random() * 720 - 360)}deg;--c:${colors[i % colors.length]}"></i>`).join('');
    const box = openModal(`<div class="confetti" aria-hidden="true">${bits}</div><div class="celebrate"><div class="celebrate-emoji">🎉</div>
      <h2>أحسنت! خلّصت المقطع</h2>
      <p class="ink-2">${data.items.length ? `فيه <b class="en-inline">${data.items.length}</b> كلمة جديدة — ثبّتها الحين وهي طازجة في بالك.` : 'خطوة زينة في طريقك.'}</p>
      <div class="stack" style="gap:8px;margin-top:14px">
        ${data.items.length ? `<a class="btn primary" href="#/practice?${new URLSearchParams({ source: id, title: source.title.slice(0, 40) })}" data-close>🎮 تدرّب على كلمات المقطع</a>` : ''}
        <button type="button" class="btn" id="endExit">إنهاء</button></div></div>`);
    box.querySelector('#endExit')?.addEventListener('click', () => { closeModal(); location.hash = '#/add'; });
  };
  endedFlow = () => showSummary(finishVideo);

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
    selfPause(); player?.pause?.();
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
    window.removeEventListener('lexitube:ended', onEnded);
    document.removeEventListener('visibilitychange', onHide);
    window.removeEventListener('pagehide', onLeave);
    window.removeEventListener('lexitube:muted', onMuted);
    document.removeEventListener('pointerdown', unmuteOnTouch, true);
    document.querySelector('#fontPill')?.remove();
    alive = false;
    clearInterval(progressTimer);
    saveProgress(true);
    document.removeEventListener('click', closeSpeed);
    document.removeEventListener('click', closeMode);
    document.removeEventListener('click', closeSet);
    document.removeEventListener('click', closeView);
    document.removeEventListener('keydown', onKey);
    stopListening();
    clearInterval(backTimer);
    clearInterval(recapTimer);
    newObs.disconnect();
    thumbBar?.remove();
    document.body.classList.remove('has-thumb-bar');
    window.removeEventListener('resize', placeFloat);
    document.querySelectorAll('.lt-note').forEach((n) => n.remove());
    window.removeEventListener('lexitube:goal-reached', onGoal);
    clearInterval(watchTimer);
    delete document.documentElement.dataset.rbg;
    delete document.body.dataset.tb; delete document.body.dataset.tbsize;
    window.removeEventListener('resize', onResize);
    cancelGap();
    document.removeEventListener('fullscreenchange', onFsChange);
    setFocus(false);
    selBar.remove();
    clearInterval(syncTimer);
    if (frame) cancelAnimationFrame(frame);
    closeWordPanel();
    player?.destroy?.();
    void tab;
  };
}
