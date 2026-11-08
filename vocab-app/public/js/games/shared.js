// Building blocks shared by the review games.
import { speak } from '../audio.js';
import { esc, shuffle, termRegex, highlight } from '../ui.js';

export const letters = (w) => w.term.replace(/\b(something|someone)\b/gi, '').replace(/\s+/g, ' ').trim();

const wordCount = (s) => String(s || '').trim().split(/\s+/).filter(Boolean).length;

/**
 * Example sentences with their Arabic, best first: a translated sentence of a
 * comfortable length (7–24 words) that shows the word in real use.
 */
export function examplesFor(w) {
  const list = [];
  if (w.context_sentence) list.push({ sentence: w.context_sentence, arabic: w.context_arabic || '' });
  for (const e of w.examples || []) if (e?.sentence) list.push({ sentence: e.sentence, arabic: e.arabic || '' });
  const seen = new Set();
  const unique = list.filter((e) => {
    const k = e.sentence.trim().toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  const score = (e) => {
    const n = wordCount(e.sentence);
    return (e.arabic ? 4 : 0) + (n >= 7 && n <= 24 ? 3 : n >= 5 && n <= 30 ? 1 : 0) + (termRegex(w.term)?.test(e.sentence) ? 1 : 0);
  };
  return unique.map((e, i) => ({ ...e, i })).sort((a, b) => score(b) - score(a) || a.i - b.i);
}
export const sentencesFor = (w) => examplesFor(w).map((e) => e.sentence);
export const arabicFor = (w, sentence) => examplesFor(w).find((e) => e.sentence === sentence)?.arabic || '';

/** The sentence with its translation, shown after every answer. */
export function exampleHtml(w, sentence = null) {
  const ex = sentence ? { sentence, arabic: arabicFor(w, sentence) } : examplesFor(w)[0];
  if (!ex) return '';
  return `<div class="fb-ex"><p class="en" dir="ltr">${highlight(ex.sentence, w.term)} <button class="btn icon sm ghost" data-say="${esc(ex.sentence)}" data-rate="0.9" aria-label="استمع">🔊</button></p>${ex.arabic ? `<p class="fb-ar" dir="rtl">${esc(ex.arabic)}</p>` : ''}</div>`;
}
export function blankable(w) {
  const re = termRegex(w.term);
  if (!re) return null;
  // a real sentence only (5+ words) — a one-word "sentence" would leave nothing to read
  for (const s of sentencesFor(w).filter((x) => wordCount(x) >= 5)) {
    const m = s.match(re);
    if (m) return { sentence: s, match: m[0], index: m.index, arabic: arabicFor(w, s) };
  }
  return null;
}
export const buildable = (w) => sentencesFor(w).find((x) => {
  const n = wordCount(x);
  return n >= 5 && n <= 16;
}) || null;

/** Up to n other words whose key (meaning/term) differs from the target's. */
export function distractors(target, pool, n, key) {
  const seen = new Set([key(target)]);
  const out = [];
  const same = shuffle(pool.filter((w) => w.uv_id !== target.uv_id && w.level === target.level));
  const other = shuffle(pool.filter((w) => w.uv_id !== target.uv_id && w.level !== target.level));
  for (const w of [...same, ...other]) {
    if (out.length >= n) break;
    const k = key(w);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(w);
  }
  return out;
}

/** A multiple-choice question; resolves true/false. */
export function choice(stage, w, { prompt, options, text, after = '', sentence = null }) {
  return new Promise((resolve) => {
    const opts = shuffle([w, ...options]);
    // the English word is on the screen: it can be heard too (said once by itself)
    // one 🔊 only: skip ours when the game's prompt already has a listen button for the word
    const showsWord = prompt.includes(esc(w.term)) && !prompt.includes('data-say');
    stage.innerHTML = `<div class="card question">${prompt}${showsWord ? `<div class="q-say"><button class="btn icon sm ghost" data-say="${esc(w.term)}" data-rate="1" aria-label="استمع">🔊</button></div>` : ''}</div>
      <div class="options">${opts.map((o, k) => `<button class="option" data-k="${k}">${text(o)}</button>`).join('')}</div>
      <div class="feedback" id="fb"></div>
      <div class="next-wrap"><button class="btn primary hidden" id="nextBtn">التالي ←</button></div>`;
    if (showsWord) speak(w.term).catch(() => {});
    let done = false;
    stage.querySelectorAll('.option').forEach((btn) => btn.addEventListener('click', () => {
      if (done) return;
      done = true;
      const ok = opts[Number(btn.dataset.k)].uv_id === w.uv_id;
      stage.querySelectorAll('.option').forEach((b) => {
        b.disabled = true;
        if (opts[Number(b.dataset.k)].uv_id === w.uv_id) b.classList.add('correct');
      });
      if (!ok) btn.classList.add('wrong');
      reveal(stage, w, ok, after, sentence);
      const next = stage.querySelector('#nextBtn');
      next.classList.remove('hidden');
      next.focus();
      next.addEventListener('click', () => resolve(ok));
    }));
  });
}

export function reveal(stage, w, ok, extra = '', sentence = null) {
  const fb = stage.querySelector('#fb');
  fb.className = `feedback show ${ok ? 'ok' : 'no'}`;
  fb.innerHTML = `<b>${ok ? 'صحيح ✓' : 'ليست صحيحة'}</b> — <span class="en-inline"><b>${esc(w.term)}</b></span> <button class="btn icon sm ghost" data-say="${esc(w.term)}" data-rate="1" aria-label="استمع">🔊</button>: ${esc(w.arabic || '')}${extra}${exampleHtml(w, sentence)}`;
  speak(w.term).catch(() => {}); // every game: hear the word after answering
}

/** 🔊 button (tap twice = slow) for a word or sentence (works again and again, via the global data-say handler). */
export const sayBtns = (text) => `<span class="q-say"><button class="btn icon sm ghost" data-say="${esc(text)}" data-rate="1" aria-label="استمع">🔊</button></span>`;
