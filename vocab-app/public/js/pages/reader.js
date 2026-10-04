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
import { openWordPanel, closeWordPanel, isPanelOpen, bindSpeech } from '../components.js';
import { tokenize, quickTier } from '../shared/text.js';
import { buildTimeline, positionAt, wordIndexByChar } from '../shared/sync.js';
import { refreshStats } from '../app.js';
import { APP_CONFIG } from '../config.js';

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
    if (playing) t = Math.min(duration, t + (now - last) / 1000);
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
  return { time: () => t, seek: (s) => { t = s; playing = true; last = performance.now(); }, playing: () => playing, destroy: () => clearInterval(tick) };
}

/* ------------------------------------------------------------ word spans */

// data-wi on each word span = index of that word in line.words (live highlight).
const wiAttr = (map, from) => (map && map[from] >= 0 ? ` data-wi="${map[from]}"` : '');

/* ---------------------------------------------------------------- render */

function lineHtml(line, marks) {
  const wmap = line.words?.length ? wordIndexByChar(line.text) : null;
  const own = marks.filter((m) => m.line_id === line.id).sort((a, b) => a.start - b.start || b.end - a.end);
  const spans = [];
  let pos = 0;
  for (const m of own) {
    if (m.start < pos) continue; // overlapping phrase: keep the first
    spans.push({ from: pos, to: m.start });
    spans.push({ mark: m });
    pos = m.end;
  }
  spans.push({ from: pos, to: line.text.length });
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
  const body = spans.map((s) => (s.mark
    ? `<span class="mark ${s.mark.state === 'saved' ? 's-saved' : 's-suggested'}" data-vid="${s.mark.vocabulary_id}">${markInner(s.mark.start, s.mark.end)}</span>`
    : plain(line.text.slice(s.from, s.to), s.from))).join('');
  const seekable = line.start_seconds != null;
  return `
    <div class="line${seekable ? ' seekable' : ''}${wmap ? ' has-words' : ''}" data-id="${line.id}" data-start="${line.start_seconds ?? ''}">
      ${seekable ? `<button class="ts" data-seek="${line.start_seconds}" title="انتقل إلى هذه الجملة في الفيديو">${fmtTime(line.start_seconds)}</button>` : '<span class="ts-spacer"></span>'}
      <div class="line-body"><p class="line-en en">${body}</p>${line.text_ar ? `<p class="line-ar" dir="rtl">${esc(line.text_ar)}</p>` : '<p class="line-ar pending" dir="rtl">…</p>'}</div>
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
      <button class="btn icon sm ghost" id="del" aria-label="حذف المصدر" title="حذف المصدر">${icon.trash}</button>
    </div>
    <div class="reader-tabs segmented"><button data-tab="text" class="active">${isVideo ? 'الفيديو والنص' : 'النص'}</button><button data-tab="words">كلمات مقترحة (<span id="wcount">${data.items.length}</span>)</button></div>
    <div class="reader-grid" data-tab="text">
      <div class="reader-main">
        ${isVideo ? '<div class="player-box"><div id="player"></div></div>' : ''}
        <div class="reader-tools">
          <label class="switch"><input type="checkbox" id="arToggle" ${showAr ? 'checked' : ''}> <span>${icon.subtitles} العربي بجانب الإنجليزي</span></label>
          ${hasTimes ? `<label class="switch"><input type="checkbox" id="followToggle" ${follow ? 'checked' : ''}> <span>متابعة تلقائية</span></label>` : ''}
          <span class="tiny muted" id="trNote"></span>
        </div>
        <div class="transcript ${showAr ? 'bilingual' : 'hide-ar'}" id="lines"></div>
        <p class="tiny muted reader-hint">اضغط على أي كلمة لترى معناها في هذه الجملة${isVideo && hasTimes ? '، أو على الوقت / خارج الكلمات للانتقال إلى الجملة في الفيديو' : ''}. <span class="mark s-suggested">مقترحة</span> <span class="mark s-saved">محفوظة</span></p>
      </div>
      <aside class="reader-side card" id="side"></aside>
    </div>`;

  const linesEl = $('#lines', view);
  const side = $('#side', view);
  bindSpeech(view);

  const drawLines = () => {
    const keep = linesEl.scrollTop;
    linesEl.innerHTML = data.lines.map((l) => lineHtml(l, data.marks)).join('') || '<p class="muted">لا يوجد نص.</p>';
    linesEl.scrollTop = keep;
    if (currentId) linesEl.querySelector(`.line[data-id="${currentId}"]`)?.classList.add('current');
    currentWord = -1; // re-applied on the next tick
  };

  const drawSide = () => {
    const unsaved = data.items.filter((i) => !i.user_state);
    $('#wcount', view).textContent = data.items.length;
    side.innerHTML = `
      <div class="row between" style="margin-bottom:10px"><b>كلمات مقترحة</b>
        ${unsaved.length ? `<button class="btn sm" id="saveAll">${icon.bookmark} حفظ الكل (${unsaved.length})</button>` : ''}</div>
      <p class="tiny muted" id="refineNote" style="margin:-4px 0 10px">${source.extractor === 'dictionary' ? (state.config.ai.available ? '<span class="spinner"></span> ✨ الذكاء الاصطناعي يختار كلمات أدق…' : 'مختارة من القاموس المحلي. اضغط أي كلمة في النص لمعناها.') : ''}</p>
      <div class="side-list">${data.items.map((it) => `
        <div class="side-item ${it.user_state === 'dismissed' ? 'dim' : ''}" data-vid="${it.vocabulary_id}" data-line="${it.line_id}">
          <div style="min-width:0"><div class="row" style="gap:6px"><b class="en">${esc(it.term)}</b>${levelChip(it.level)}</div>
            <div class="small ink-2 clamp1">${esc(it.arabic || '')}</div></div>
          ${it.user_state === 'saved' ? '<span class="saved-tick" title="محفوظة">✓</span>' : `<button class="btn sm" data-save="${it.vocabulary_id}" data-occ="${it.occurrence_id}">حفظ</button>`}
        </div>`).join('') || '<p class="small muted">لم نجد كلمات مقترحة. اضغط على أي كلمة في النص لتفهمها وتحفظها.</p>'}</div>`;
  };

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
          if (line && !line.text_ar) line.text_ar = ar;
        }
        if (r.lines?.length) drawLines();
        if (r.complete) {
          if (r.ai_error && missingAr()) setTrNote(`تعذّرت الترجمة الآن. <button class="link-btn" id="retryTr">أعد المحاولة</button>`);
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

  // Player + sync.
  const startAt = params.t ? Number(params.t) : null;
  if (isVideo) {
    const box = $('#player', view);
    if (source.is_demo) player = demoPlayer(box.parentElement, source.duration_seconds || 600);
    else {
      box.parentElement.innerHTML = '<div id="player"></div>';
      youtubePlayer($('#player', view), source.youtube_id, startAt, (isPlaying) => setPlaying(isPlaying)).then((p) => (player = p)).catch(() => {
        $('.player-box', view).innerHTML = `<div class="alert info">تعذّر تحميل مشغّل يوتيوب. يمكنك القراءة هنا، أو <a href="https://www.youtube.com/watch?v=${esc(source.youtube_id)}" target="_blank" rel="noopener">فتح الفيديو في يوتيوب</a>.</div>`;
      });
    }
  }

  // Keep the current sentence comfortably in view (only scroll when it leaves the middle band).
  const bringIntoView = (el, force = false) => {
    if (!el || isPanelOpen() || (!force && Date.now() < userScrollUntil)) return;
    const top = el.offsetTop - linesEl.offsetTop;
    const view0 = linesEl.scrollTop;
    const h = linesEl.clientHeight;
    if (force || top < view0 + h * 0.12 || top + el.offsetHeight > view0 + h * 0.75) {
      linesEl.scrollTo({ top: Math.max(0, top - h / 3), behavior: 'smooth' });
    }
  };
  const setCurrent = (lineId, { scroll = follow, force = false } = {}) => {
    if (lineId === currentId) return;
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
  const tick = () => {
    if (!player || !timeline.length) return;
    const pos = positionAt(timeline, player.time());
    const entry = pos.line >= 0 ? timeline[pos.line] : null;
    setCurrent(entry ? entry.id : null);
    setWord(pos.word);
  };
  const loop = () => {
    tick();
    frame = playing ? requestAnimationFrame(loop) : 0;
  };
  function setPlaying(isPlaying) {
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
    const mark = e.target.closest('.mark');
    const tok = e.target.closest('.tok');
    if (mark) openWordPanel(mark, { vocabulary_id: mark.dataset.vid, line_id: line.dataset.id }, { onChange });
    else if (tok) openWordPanel(tok, { word: tok.dataset.w, line_id: line.dataset.id }, { onChange });
    else if (!window.getSelection()?.toString()) seekToLine(line); // the sentence itself (not a word): jump there
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
        const unsaved = data.items.filter((i) => !i.user_state);
        for (const it of unsaved) await api.saveWord(it.vocabulary_id, it.occurrence_id);
        toast(`تم حفظ ${unsaved.length} كلمات ✓`);
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
  $('#del', view).addEventListener('click', async () => {
    if (!confirm('حذف هذا المصدر ونصّه؟ كلماتك المحفوظة تبقى كما هي.')) return;
    await api.deleteSource(id);
    toast('تم الحذف');
    location.hash = '#/add';
  });

  return () => {
    alive = false;
    explainBtn.remove();
    clearInterval(syncTimer);
    if (frame) cancelAnimationFrame(frame);
    closeWordPanel();
    player?.destroy?.();
    void tab;
  };
}
