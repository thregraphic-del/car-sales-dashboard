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
  for (const e of w.examples || []) if (e?.sentence) list.push({ sentence: e.sentence, arabic: e.arabic || '', kind: e.kind });
  const seen = new Set();
  const unique = list.filter((e) => {
    const k = e.sentence.trim().toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  const score = (e) => {
    const n = wordCount(e.sentence);
    const full = /^[\s"'“(]*[A-Z0-9]/.test(e.sentence) && /[.?!]["')”]?\s*$/.test(e.sentence); // a whole sentence, not a cut line
    return (full ? 5 : 0) + (e.kind === 'ai1' ? 2 : 0) + (e.arabic ? 4 : 0) + (n >= 7 && n <= 24 ? 3 : n >= 5 && n <= 30 ? 1 : 0) + (termRegex(w.term)?.test(e.sentence) ? 2 : 0);
  };
  return unique.filter((e) => wordCount(e.sentence) >= 5).map((e, i) => ({ ...e, i })).sort((a, b) => score(b) - score(a) || a.i - b.i);
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
// a sentence that really contains the word, with its Arabic as the guide
export const buildable = (w) => examplesFor(w).find((e) => {
  const n = wordCount(e.sentence);
  return n >= 5 && n <= 16 && e.arabic && termRegex(w.term)?.test(e.sentence);
})?.sentence || null;

/** 💡 small hint: word type + first letter, e.g. «اسم · يبدأ بـ t» */
const POS_AR = { noun: 'اسم', verb: 'فعل', adjective: 'صفة', adverb: 'ظرف', phrase: 'عبارة', 'phrasal verb': 'فعل مركّب', idiom: 'تعبير' };
export function hintLine(w) {
  const pos = POS_AR[String(w.part_of_speech || '').toLowerCase()] || (w.term.includes(' ') ? 'عبارة' : '');
  return [pos, `يبدأ بـ ${w.term.trim()[0]?.toLowerCase() || ''}`, `${letters(w).replace(/\s/g, '').length} حروف`].filter(Boolean).join(' · ');
}
/** 💡 the hints of a word, in order: easy English meaning → the meaning in Arabic → a sentence with it hidden */
export function hintSteps(w) {
  const out = [];
  const def = String(w.simple_english || '').trim();
  const re = termRegex(w.term);
  if (def && !(re && re.test(def))) out.push(`<div class="hint-box"><p class="tiny muted" style="margin:0 0 4px">بإنجليزي سهل:</p><p class="en" dir="ltr">${esc(def)}</p><p class="tiny muted" style="margin:4px 0 0">${esc(hintLine(w))}</p></div>`);
  if (w.arabic) out.push(`<div class="hint-box"><p class="tiny muted" style="margin:0 0 4px">بالعربي:</p><p>${esc(w.arabic)}</p></div>`);
  const sent = hintSentence(w);
  if (sent) out.push(sent);
  if (!out.length) out.push(`<p class="tiny muted">${esc(hintLine(w))}</p>`);
  return out;
}
/** 💡 a clue that helps without giving the answer away: the meaning in easy English (+ the kind of word) */
export function smartHint(w) {
  const def = String(w.simple_english || '').trim();
  const re = termRegex(w.term);
  const safe = def && !(re && re.test(def)) ? def : '';
  if (safe) return `<div class="hint-box"><p class="tiny muted" style="margin:0 0 4px">معناها بإنجليزي سهل:</p><p class="en" dir="ltr">${esc(safe)}</p><p class="tiny muted" style="margin:4px 0 0">${esc(hintLine(w))}</p></div>`;
  return hintSentence(w) || `<p class="tiny muted">${esc(hintLine(w))}</p>`;
}
/** 💡 a clear sentence with the word hidden, and its Arabic */
export function hintSentence(w) {
  const ex = examplesFor(w)[0];
  if (!ex) return '';
  const re = termRegex(w.term);
  const masked = re ? ex.sentence.replace(re, '_____') : ex.sentence;
  return `<div class="hint-box"><p class="en" dir="ltr">${esc(masked)}</p>${ex.arabic ? `<p class="fb-ar" dir="rtl">${esc(ex.arabic)}</p>` : ''}</div>`;
}

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
    // 🔊 the English word is said as soon as the question opens, whenever it is on the screen
    if (prompt.toLowerCase().includes(esc(w.term).toLowerCase())) speak(w.term).catch(() => {});
    // 3 tries: a wrong pick turns grey and you try again; right first time (no hint) counts as known
    let done = false;
    let tries = 0;
    let hinted = false;
    // 💡 hints one after another, as many as needed (no penalty): easy English → Arabic → a sentence
    const hints = hintSteps(w);
    let shownHints = 0;
    stage.querySelector('.question').insertAdjacentHTML('beforeend', `<div id="hintBox"></div><button type="button" class="btn sm ghost hint-btn" id="hintBtn">💡 تلميح</button>`);
    stage.querySelector('#hintBtn').addEventListener('click', (e) => {
      hinted = true;
      stage.querySelector('#hintBox').insertAdjacentHTML('beforeend', hints[shownHints] || '');
      shownHints += 1;
      if (shownHints >= hints.length) e.currentTarget.remove();
      else e.currentTarget.textContent = '💡 تلميح آخر';
    });
    // 🌐 the sentence's Arabic, only when asked for
    stage.querySelector('[data-show-ar]')?.addEventListener('click', (e) => {
      stage.querySelector('.ctx-ar')?.classList.remove('hidden');
      e.currentTarget.remove();
    });
    stage.querySelectorAll('.option').forEach((btn) => btn.addEventListener('click', () => {
      if (done || btn.disabled) return;
      const right = opts[Number(btn.dataset.k)].uv_id === w.uv_id;
      tries += 1;
      if (!right && tries < 3) {
        btn.disabled = true;
        btn.classList.add('tried');
        stage.querySelector('#fb').className = 'feedback show no';
        stage.querySelector('#fb').innerHTML = `<b>جرّب مرة ثانية</b> — باقي ${3 - tries} ${3 - tries === 1 ? 'محاولة' : 'محاولات'}`;
        return;
      }
      done = true;
      const ok = right && tries === 1; // hints are free: a right first answer still wins
      void hinted;
      stage.querySelectorAll('.option').forEach((b) => {
        b.disabled = true;
        if (opts[Number(b.dataset.k)].uv_id === w.uv_id) b.classList.add('correct');
      });
      if (!right) btn.classList.add('wrong');
      reveal(stage, w, right, right && !ok ? ' — <span class="tiny">(تحتاج تدريب: ترجع لك قريب)</span>' + after : after, sentence);
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
