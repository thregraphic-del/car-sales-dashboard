// Interactive flashcard session. Each answer goes to the server, which updates
// spaced repetition, mastery and today's plan.
import { api } from './api.js';
import { speak } from './audio.js';
import { esc, icon, levelChip, typeLabel, highlight, BUCKET_AR, toast } from './ui.js';
import { bindSpeech } from './components.js';
import { refreshStats } from './app.js';

export function runFlashcards(container, words, { source = 'flashcard', onDone, doneActions = '' } = {}) {
  const queue = [...words];
  const requeued = new Set();
  const results = { hard: 0, good: 0, easy: 0 };
  const missed = new Map();
  let idx = 0;
  let flipped = false;
  let busy = false;
  const total = words.length;
  let finished = 0;

  function card() {
    const w = queue[idx];
    const easy = w.examples?.find((e) => e.kind === 'easy') || w.examples?.[0];
    const pct = Math.round((100 * finished) / total);
    container.innerHTML = `
      <div class="fc-wrap">
        <div class="fc-progress"><span class="small muted en-inline">${finished}/${total}</span><div class="bar"><span style="width:${pct}%"></span></div>
          ${w.bucket ? `<span class="chip ar-chip">${BUCKET_AR[w.bucket]}</span>` : ''}</div>
        <div class="flashcard ${flipped ? 'flipped' : ''}" id="fc" tabindex="0" aria-label="اقلب البطاقة">
          <div class="fc-inner">
            <div class="fc-face fc-front">
              <div class="row" style="gap:6px">${levelChip(w.level)}<span class="chip ar-chip">${esc(typeLabel(w))}</span></div>
              <div class="fc-term">${esc(w.term)}</div>
              <div class="en muted">${esc(w.pronunciation || '')}</div>
              <button class="btn sm ghost" data-say="${esc(w.term)}" data-rate="1">${icon.speaker} استمع</button>
              <div class="fc-hint">اضغط على البطاقة لقلبها <span class="kbd">Space</span></div>
            </div>
            <div class="fc-face fc-back">
              <div class="row between"><div class="en"><b class="display" style="font-size:22px">${esc(w.term)}</b></div>
                <div class="row" style="gap:4px"><button class="btn icon sm ghost" data-say="${esc(w.term)}" data-rate="1" aria-label="عادي">${icon.speaker}</button>
                <button class="btn sm ghost" data-say="${esc(w.term)}" data-rate="0.65">بطيء</button></div></div>
              <div><div class="tiny muted">المعنى</div><div style="font-size:21px;font-weight:700">${w.arabic ? esc(w.arabic) : '<span class="muted" style="font-size:15px">بدون معنى محفوظ</span>'}</div></div>
              ${w.simple_english ? `<p class="en ink-2">${esc(w.simple_english)}</p>` : ''}
              ${w.context_sentence ? `<div class="quote"><div class="tiny muted" style="margin-bottom:4px">من الفيديو ${w.timestamp_seconds != null ? `<button class="ts-btn" data-ts style="padding:1px 7px;font-size:11.5px">▶ ${Math.floor(w.timestamp_seconds / 60)}:${String(w.timestamp_seconds % 60).padStart(2, '0')}</button>` : ''}</div>
                <p class="en">“${highlight(w.context_sentence, w.term)}”</p>${w.context_arabic ? `<p class="small ink-2" style="margin-top:4px">${esc(w.context_arabic)}</p>` : ''}</div>` : ''}
              ${easy ? `<div><div class="tiny muted">مثال</div><p class="en">${highlight(easy.sentence, w.term)} <button class="btn icon sm ghost" data-say="${esc(easy.sentence)}" data-rate="0.9" aria-label="استمع للمثال" style="vertical-align:middle">${icon.speaker}</button></p></div>` : ''}
            </div>
          </div>
        </div>
        <div class="grade-row ${flipped ? '' : 'hidden'}" id="grades">
          <button class="grade hard" data-g="hard"><span class="em">❌</span>صعبة<small>1 · سأراها قريبًا</small></button>
          <button class="grade good" data-g="good"><span class="em">😐</span>جيدة<small>2</small></button>
          <button class="grade easy" data-g="easy"><span class="em">✅</span>سهلة<small>3</small></button>
        </div>
        ${flipped ? '' : `<div style="text-align:center;margin-top:18px"><button class="btn primary lg" id="flipBtn">اقلب البطاقة</button></div>`}
      </div>`;
  }

  function done() {
    const answered = results.hard + results.good + results.easy;
    container.innerHTML = `
      <div class="card done-panel fc-wrap">
        <div class="big">🎉</div>
        <h2 style="margin:10px 0 6px">أحسنت! أنهيت ${total} ${total === 1 ? 'بطاقة' : 'بطاقات'}</h2>
        <p class="ink-2">تم تحديث جدول المراجعة: الكلمات الصعبة ستعود قريبًا، والسهلة ستتباعد.</p>
        <div class="grid cols-3" style="margin:22px auto 0;max-width:420px">
          <div class="card soft stat"><div class="value" style="color:var(--bad)">${results.hard}</div><div class="label">صعبة</div></div>
          <div class="card soft stat"><div class="value" style="color:var(--warn)">${results.good}</div><div class="label">جيدة</div></div>
          <div class="card soft stat"><div class="value" style="color:var(--good)">${results.easy}</div><div class="label">سهلة</div></div>
        </div>
        ${missed.size ? `<div class="replay-box"><b>صعبت عليك ${missed.size} ${missed.size === 1 ? 'كلمة' : 'كلمات'}</b>
          <div class="en small" style="margin:6px 0 10px">${[...missed.values()].map((m) => esc(m.term)).join(' · ')}</div>
          <a class="btn primary" href="#/practice?ids=${[...missed.keys()].join(',')}&mode=quiz&replay=1">${icon.repeat} تدرّب عليها الآن</a></div>` : ''}
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
      if (!flipped) {
        flip();
        speak(w.term).catch(() => {});
      }
    }
  };
  const onKey = (e) => {
    if (!container.isConnected || idx >= queue.length) return;
    if (e.target.matches('input, textarea')) return;
    if (e.code === 'Space') {
      e.preventDefault();
      if (!flipped) speak(queue[idx].term).catch(() => {});
      flip();
    } else if (flipped && ['1', '2', '3'].includes(e.key)) {
      grade(['hard', 'good', 'easy'][Number(e.key) - 1]);
    }
  };
  bindSpeech(container);
  container.addEventListener('click', onClick);
  document.addEventListener('keydown', onKey);
  if (queue.length) card();
  else done();
  return () => document.removeEventListener('keydown', onKey);
}
