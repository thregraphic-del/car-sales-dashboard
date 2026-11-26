// Interactive flashcard session. Each answer goes to the server, which updates
// spaced repetition, mastery and today's plan.
import { api } from './api.js';
import { speak } from './audio.js';
import { esc, icon, levelChip, typeLabel, highlight, BUCKET_AR, toast } from './ui.js';
import { bindSpeech } from './components.js';
import { refreshStats } from './app.js';
import { isFullSentence } from './games/shared.js';

export function runFlashcards(container, words, { source = 'flashcard', onDone, doneActions = '', hardHref = null } = {}) {
  const queue = [...words];
  const requeued = new Set();
  const results = { hard: 0, good: 0, easy: 0 };
  const missed = new Map();
  let idx = 0;
  let flipped = false;
  let busy = false;
  const total = words.length;
  let finished = 0;

  // a clear translated example for every word: the ones missing it are asked in small batches (written once, saved for everyone)
  const generated = new Map();
  const asked = new Set();
  const hasArabicExample = (w) => w.examples?.some((e) => e.arabic);
  async function fillExamples(from) {
    const need = queue.slice(from, from + 20).filter((w) => !hasArabicExample(w) && !asked.has(String(w.term).toLowerCase()));
    if (!need.length) return;
    need.forEach((w) => asked.add(String(w.term).toLowerCase()));
    try {
      const r = await api.simpleExamples(need.map((w) => ({ term: w.term, arabic: w.user_arabic || w.arabic })));
      for (const [k, v] of Object.entries(r.examples || {})) if (v?.sentence && v?.arabic) generated.set(k.toLowerCase(), v);
      if (container.isConnected && idx < queue.length && generated.has(String(queue[idx].term).toLowerCase())) card();
    } catch { /* the card still shows what exists */ }
  }

  let lastSaid = -1;
  function card() {
    const w = queue[idx];
    // the example, best first: a saved one that has its Arabic → one written once by AI (saved for everyone) → any saved one → the video's own sentence
    const okEx = (w.examples || []).filter((e) => isFullSentence(e.sentence));
    const found = okEx.find((e) => e.kind === 'easy' && e.arabic) || okEx.find((e) => e.arabic) || okEx.find((e) => e.kind === 'easy') || okEx[0];
    const gen = generated.get(String(w.term).toLowerCase());
    const easy = found?.arabic ? { sentence: found.sentence, arabic: found.arabic }
      : gen ? { sentence: gen.sentence, arabic: gen.arabic }
        : found ? { sentence: found.sentence, arabic: found.arabic }
          : w.context_sentence && w.context_arabic && isFullSentence(w.context_sentence) ? { sentence: w.context_sentence, arabic: w.context_arabic } : null; // never a cut transcript line
    const pct = Math.round((100 * finished) / total);
    container.innerHTML = `
      <div class="fc-wrap">
        <div class="fc-progress"><span class="small muted en-inline">${finished}/${total}</span><div class="bar"><span style="width:${pct}%"></span></div>
          ${w.bucket ? `<span class="chip ar-chip">${BUCKET_AR[w.bucket]}</span>` : ''}</div>
        <div class="flashcard ${flipped ? 'flipped' : ''}" id="fc" tabindex="0" aria-label="اقلب البطاقة">
          <div class="fc-inner">
            <div class="fc-face fc-front">
              <div class="fc-corner">${levelChip(w.level)}<span class="chip ar-chip">${esc(typeLabel(w))}</span></div>
              <div class="fc-term">${esc(w.term)}</div>
              <div class="fc-say"><button type="button" class="btn icon ghost" data-say="${esc(w.term)}" data-rate="1" aria-label="استمع">${icon.speaker}</button></div>
            </div>
            <div class="fc-face fc-back">
              <div class="row between"><div class="en"><b class="display" style="font-size:22px">${esc(w.term)}</b></div>
                <div class="row" style="gap:4px"><button class="btn icon sm ghost" data-say="${esc(w.term)}" data-rate="1" aria-label="عادي">${icon.speaker}</button>
                </div></div>
              <div><div class="tiny muted">المعنى</div><div style="font-size:21px;font-weight:700">${w.arabic ? esc(w.arabic) : '<span class="muted" style="font-size:15px">بدون معنى محفوظ</span>'}</div></div>
              ${easy ? `<div class="fc-ex"><div class="tiny muted">مثال</div><p class="en fc-ex-en">${highlight(easy.sentence, w.term)} <button class="btn icon sm ghost" data-say="${esc(easy.sentence)}" data-rate="0.9" aria-label="استمع للمثال" style="vertical-align:middle">${icon.speaker}</button></p>${easy.arabic ? `<p class="fc-ex-ar">${esc(easy.arabic)}</p>` : ''}</div>` : ''}
              ${w.source?.id && w.timestamp_seconds != null ? `<button type="button" class="fc-vid" data-ts>${icon.play} مثال من الفيديو <span class="en-inline">${Math.floor(w.timestamp_seconds / 60)}:${String(Math.floor(w.timestamp_seconds % 60)).padStart(2, '0')}</span></button>` : ''}
            </div>
          </div>
        </div>
        <div class="grade-row two ${flipped ? '' : 'hidden'}" id="grades">
          <button class="grade hard" data-g="hard"><span class="em">🤔</span>ما أعرفها</button>
          <button class="grade easy" data-g="good"><span class="em">✅</span>أعرفها</button>
        </div>
        ${flipped ? '' : `<div style="text-align:center;margin-top:18px"><button class="btn primary lg" id="flipBtn">اقلب البطاقة</button></div>`}
      </div>`;
    // a new card: hear the word straight away (the 🔊 button plays it again)
    if (!flipped && lastSaid !== idx) { lastSaid = idx; speak(w.term).catch(() => {}); }
  }

  function done() {
    const answered = results.hard + results.good + results.easy;
    container.innerHTML = `
      <div class="card done-panel fc-wrap">
        <div class="big">🎉</div>
        <h2 style="margin:10px 0 6px">أحسنت! أنهيت ${total} ${total === 1 ? 'بطاقة' : 'بطاقات'}</h2>
        <p class="ink-2">تم تحديث جدول المراجعة: الكلمات الصعبة ستعود قريبًا، والسهلة ستتباعد.</p>
        <div class="grid cols-2" style="margin:22px auto 0;max-width:340px;grid-template-columns:1fr 1fr">
          <div class="card soft stat"><div class="value" style="color:var(--bad)">${results.hard}</div><div class="label">ما أعرفها</div></div>
          <div class="card soft stat"><div class="value" style="color:var(--good)">${results.good + results.easy}</div><div class="label">أعرفها</div></div>
        </div>
        ${missed.size ? `<div class="replay-box"><b>صعبت عليك ${missed.size} ${missed.size === 1 ? 'كلمة' : 'كلمات'}</b>
          <div class="en small" style="margin:6px 0 10px">${[...missed.values()].map((m) => esc(m.term)).join(' · ')}</div>
          <a class="btn primary" href="${hardHref ? hardHref([...missed.values()]) : `#/practice?ids=${[...missed.keys()].join(',')}&mode=quiz&replay=1`}">${icon.repeat} ${hardHref ? "راجع الصعب" : "تدرّب عليها الحين"}</a></div>` : ''}
        <div class="btn-row" style="justify-content:center;margin-top:18px">${doneActions}</div>
        <p class="tiny muted" style="margin-top:12px">${answered} إجابة سُجّلت في قاعدة البيانات.</p>
      </div>`;
    onDone?.({ ...results, missed: [...missed.values()] });
  }

  function flip() {
    if (flipped) return;
    flipped = true;
    // Toggle classes in place so the 3D flip animates.
    container.querySelector('#fc')?.classList.add('flipped');
    container.querySelector('#grades')?.classList.remove('hidden');
    container.querySelector('#flipBtn')?.parentElement.remove();
  }

  async function grade(g) {
    if (busy || !flipped) return;
    busy = true;
    const w = queue[idx];
    try {
      await api.review(w.uv_id, g, source);
      results[g] += 1;
      if (g === 'hard') missed.set(w.uv_id, w);
      if (g === 'hard' && !requeued.has(w.uv_id)) {
        // See it again a few cards later in this session.
        requeued.add(w.uv_id);
        queue.splice(Math.min(queue.length, idx + 4), 0, w);
      } else {
        finished += 1;
      }
      idx += 1;
      flipped = false;
      if (idx % 12 === 0) fillExamples(idx);
      if (idx >= queue.length) done();
      else card();
      refreshStats();
    } catch (err) {
      toast(err.message);
    } finally {
      busy = false;
    }
  }

  const onClick = (e) => {
    if (e.target.closest('[data-say]')) return;
    const w = queue[idx];
    if (e.target.closest('[data-ts]')) {
      e.stopPropagation();
      if (w.source?.id) location.hash = `#/source/${w.source.id}?t=${w.timestamp_seconds}`;
      return;
    }
    const g = e.target.closest('[data-g]');
    if (g) return grade(g.dataset.g);
    if (e.target.closest('#flipBtn') || e.target.closest('#fc')) {
      if (!flipped) flip();
    }
  };
  const onKey = (e) => {
    if (!container.isConnected || idx >= queue.length) return;
    if (e.target.matches('input, textarea')) return;
    if (e.code === 'Space') {
      e.preventDefault();
      flip();
    } else if (flipped && ['1', '2'].includes(e.key)) {
      grade(['hard', 'good'][Number(e.key) - 1]);
    }
  };
  bindSpeech(container);
  container.addEventListener('click', onClick);
  document.addEventListener('keydown', onKey);
  if (queue.length) { card(); fillExamples(0); }
  else done();
  return () => document.removeEventListener('keydown', onKey);
}
