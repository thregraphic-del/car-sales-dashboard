// Quiz engine. One round = N questions; each question format is chosen per
// word: recognition (meaning, listening) while a word is weak, recall
// (fill-the-blank, translation, sentence building) once it's stronger.
// Every answer is a review: correct → good, wrong → hard (comes back soon).
import { api } from './api.js';
import { speak } from './audio.js';
import { esc, icon, shuffle, highlight, termRegex, levelChip, toast } from './ui.js';
import { bindSpeech } from './components.js';

export const TYPES = {
  meaning: { name: 'اختر المعنى', en: 'Choose the meaning', icon: 'check' },
  listen: { name: 'استمع واختر', en: 'Listen & choose', icon: 'ear' },
  context: { name: 'تحدّي السياق', en: 'Context challenge', icon: 'quote' },
  fill: { name: 'املأ الفراغ', en: 'Fill in the blank', icon: 'pen' },
  translate: { name: 'اكتبها بالإنجليزية', en: 'Translation', icon: 'translate' },
  build: { name: 'ركّب الجملة', en: 'Build the sentence', icon: 'shuffle' },
  connect: { name: 'روابط الكلمات', en: 'Word connections', icon: 'puzzle' },
  truefalse: { name: 'صح أو خطأ', en: 'True or false', icon: 'check' },
  spell: { name: 'اكتب ما تسمع', en: 'Spelling', icon: 'speaker' },
  scramble: { name: 'رتّب الحروف', en: 'Unscramble', icon: 'shuffle' },
  speed: { name: 'تحدّي الدقيقة', en: '60-second challenge', icon: 'fire' },
};

const letters = (w) => w.term.replace(/\b(something|someone)\b/gi, '').replace(/\s+/g, ' ').trim();

/* ------------------------------------------------------------ helpers */

function sentencesFor(w) {
  const list = [];
  for (const k of ['easy', 'user', 'example']) {
    const e = w.examples?.find((x) => x.kind === k);
    if (e) list.push(e.sentence);
  }
  if (w.context_sentence) list.push(w.context_sentence);
  return [...new Set(list)];
}
function blankable(w) {
  const re = termRegex(w.term);
  if (!re) return null;
  for (const s of sentencesFor(w)) {
    const m = s.match(re);
    if (m) return { sentence: s, match: m[0], index: m.index };
  }
  return null;
}
const buildable = (w) => sentencesFor(w).find((x) => {
  const n = x.split(/\s+/).length;
  return n >= 4 && n <= 13;
}) || null;

const can = {
  meaning: (w) => !!w.arabic,
  listen: () => true,
  context: (w) => !!(w.context_sentence && w.arabic),
  fill: (w) => !!blankable(w),
  translate: (w) => !!w.arabic,
  build: (w) => !!buildable(w),
  truefalse: (w) => !!w.arabic,
  spell: (w) => letters(w).length >= 3 && letters(w).split(' ').length <= 3,
  scramble: (w) => /^[a-z' -]{4,14}$/i.test(letters(w)),
  speed: (w) => !!w.arabic,
};

/** Pick a question format suited to how well the word is known. */
export function chooseType(w, i) {
  const weak = (w.mastery ?? 0) < 40 || w.difficult || w.review_count === 0;
  const order = weak
    ? ['meaning', 'truefalse', 'listen', 'context', 'fill']
    : ['fill', 'translate', 'spell', 'build', 'scramble', 'context', 'listen', 'meaning'];
  const ok = order.filter((t) => can[t](w));
  return ok.length ? ok[i % ok.length] : 'listen';
}

function distractors(target, pool, n, key) {
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

/* ------------------------------------------------------- question kinds */

function choice(stage, w, { prompt, options, text, after = '' }) {
  return new Promise((resolve) => {
    const opts = shuffle([w, ...options]);
    stage.innerHTML = `<div class="card question">${prompt}</div>
      <div class="options">${opts.map((o, k) => `<button class="option" data-k="${k}">${text(o)}</button>`).join('')}</div>
      <div class="feedback" id="fb"></div>
      <div class="next-wrap"><button class="btn primary hidden" id="nextBtn">التالي ←</button></div>`;
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
      reveal(stage, w, ok, after);
      const next = stage.querySelector('#nextBtn');
      next.classList.remove('hidden');
      next.focus();
      next.addEventListener('click', () => resolve(ok));
    }));
  });
}

function reveal(stage, w, ok, extra = '') {
  const fb = stage.querySelector('#fb');
  fb.className = `feedback show ${ok ? 'ok' : 'no'}`;
  fb.innerHTML = `<b>${ok ? 'صحيح ✓' : 'ليست صحيحة'}</b> — <span class="en-inline"><b>${esc(w.term)}</b></span>: ${esc(w.arabic || '')}${extra}`;
  if (ok) speak(w.term).catch(() => {});
}

const KINDS = {
  meaning: (stage, w, pool) => choice(stage, w, {
    prompt: `<div class="prompt">ما معنى هذه الكلمة؟</div><div class="q-big">${esc(w.term)}</div>
      <div style="margin-top:8px"><button class="btn sm ghost" data-say="${esc(w.term)}" data-rate="1">${icon.speaker} استمع</button></div>`,
    options: distractors(w, pool, 3, (x) => x.arabic),
    text: (o) => esc(o.arabic),
  }),
  listen: (stage, w, pool) => {
    setTimeout(() => speak(w.term).catch(() => {}), 250);
    return choice(stage, w, {
      prompt: `<div class="prompt">استمع واختر الكلمة التي سمعتها</div>
        <button class="big-play" data-say="${esc(w.term)}" data-rate="1" aria-label="تشغيل">${icon.speaker}</button>
        <div style="margin-top:8px"><button class="btn sm ghost" data-say="${esc(w.term)}" data-rate="0.6">🐢 بطيء</button></div>`,
      options: distractors(w, pool, 3, (x) => x.term.toLowerCase()),
      text: (o) => `<span class="en-inline">${esc(o.term)}</span>`,
    });
  },
  context: (stage, w, pool) => choice(stage, w, {
    prompt: `<div class="prompt">${w.source?.title ? `من <span class="en-inline">“${esc(w.source.title.slice(0, 48))}”</span>` : 'جملة حقيقية'}</div>
      <div class="q-sentence">“${highlight(w.context_sentence, w.term)}”</div>
      <div class="prompt" style="margin-top:12px">ماذا تعني <b class="en-inline">${esc(w.term)}</b> هنا؟</div>`,
    options: distractors(w, pool, 3, (x) => x.arabic),
    text: (o) => esc(o.arabic),
    after: w.context_arabic ? `<div class="small" style="margin-top:6px">${esc(w.context_arabic)}</div>` : '',
  }),
  fill: (stage, w, pool) => {
    const b = blankable(w);
    return choice(stage, w, {
      prompt: `<div class="prompt">أكمل الجملة</div>
        <div class="q-sentence">${esc(b.sentence.slice(0, b.index))}<span class="blank">&nbsp;</span>${esc(b.sentence.slice(b.index + b.match.length))}</div>
        ${w.arabic ? `<div class="small muted" style="margin-top:8px">التلميح: ${esc(w.arabic)}</div>` : ''}`,
      options: distractors(w, pool, 3, (x) => x.term.toLowerCase()),
      text: (o) => `<span class="en-inline">${esc(o.term)}</span>`,
      after: `<div class="en small" style="margin-top:6px">${highlight(b.sentence, w.term)}</div>`,
    });
  },
  translate: (stage, w) => new Promise((resolve) => {
    let hints = 0;
    const norm = (s) => s.toLowerCase().replace(/[’']/g, "'").replace(/\b(something|someone|sth|sb)\b/g, '').replace(/[^a-z' -]/g, '').replace(/\s+/g, ' ').trim();
    const mask = () => w.term.split(/\s+/).map((p) => p.slice(0, hints) + '_'.repeat(Math.max(0, Math.min(p.length, 12) - hints))).join(' ');
    stage.innerHTML = `
      <div class="card question"><div class="prompt">اكتبها بالإنجليزية</div><div class="q-ar">${esc(w.arabic)}</div>
        ${w.simple_english ? `<div class="small muted en" style="margin-top:6px;text-align:center">${esc(w.simple_english)}</div>` : ''}
        <div class="row" style="justify-content:center;gap:6px;margin-top:10px">${levelChip(w.level)}<span class="chip en-inline" id="hint">${mask()}</span></div></div>
      <form id="tf" class="url-row" style="margin-top:14px"><input class="input en" id="ans" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Type in English…"><button class="btn primary" type="submit">تحقّق</button></form>
      <div class="btn-row" style="justify-content:center;margin-top:10px"><button class="btn sm ghost" id="hintBtn">💡 تلميح</button><button class="btn sm ghost" id="skip">لا أعرف</button></div>
      <div class="feedback" id="fb"></div><div class="next-wrap"><button class="btn primary hidden" id="nextBtn">التالي ←</button></div>`;
    const input = stage.querySelector('#ans');
    input.focus();
    let done = false;
    const finish = (ok) => {
      if (done) return;
      done = true;
      input.disabled = true;
      reveal(stage, w, ok, ` <span class="en-inline">${esc(w.pronunciation || '')}</span>`);
      const next = stage.querySelector('#nextBtn');
      next.classList.remove('hidden');
      next.focus();
      next.addEventListener('click', () => resolve(ok));
    };
    stage.querySelector('#tf').addEventListener('submit', (e) => {
      e.preventDefault();
      if (!input.value.trim()) return;
      const re = termRegex(w.term);
      const given = norm(input.value);
      const right = given === norm(w.term) || (re && re.test(input.value.trim()) && given.split(' ').length <= norm(w.term).split(' ').length + 2);
      finish(right && hints < 2); // two hints = you didn't really know it
    });
    stage.querySelector('#hintBtn').addEventListener('click', () => {
      hints += 1;
      stage.querySelector('#hint').textContent = mask();
    });
    stage.querySelector('#skip').addEventListener('click', () => finish(false));
  }),
  build: (stage, w) => new Promise((resolve) => {
    const sentence = buildable(w);
    const tokens = sentence.split(/\s+/);
    let pool = shuffle(tokens.map((t, k) => ({ t, k })));
    if (pool.every((p, k) => p.k === k) && pool.length > 2) pool = [...pool.slice(1), pool[0]];
    const placed = [];
    let checked = false;
    const draw = () => {
      stage.innerHTML = `
        <div class="card question"><div class="prompt">رتّب الكلمات لتكوين جملة فيها</div><div class="q-big" style="font-size:26px">${esc(w.term)}</div>${w.arabic ? `<div class="small muted">${esc(w.arabic)}</div>` : ''}</div>
        <div class="token-area" id="answer" style="margin-top:14px">${placed.map((p, k) => `<button class="token placed" data-from="a" data-k="${k}">${esc(p.t)}</button>`).join('') || '<span class="muted small" dir="rtl">اضغط الكلمات بالترتيب…</span>'}</div>
        <div class="token-area pool" style="margin-top:10px">${pool.map((p, k) => `<button class="token" data-from="p" data-k="${k}">${esc(p.t)}</button>`).join('')}</div>
        <div class="feedback" id="fb"></div>
        <div class="btn-row" style="justify-content:center;margin-top:14px"><button class="btn" id="clear">مسح</button><button class="btn primary" id="check" ${pool.length ? 'disabled' : ''}>تحقّق</button><button class="btn primary hidden" id="nextBtn">التالي ←</button></div>`;
      stage.querySelectorAll('.token').forEach((b) => b.addEventListener('click', () => {
        if (checked) return;
        const k = Number(b.dataset.k);
        if (b.dataset.from === 'p') placed.push(...pool.splice(k, 1));
        else pool.push(...placed.splice(k, 1));
        draw();
      }));
      stage.querySelector('#clear').addEventListener('click', () => {
        if (checked) return;
        pool.push(...placed.splice(0));
        draw();
      });
      stage.querySelector('#check').addEventListener('click', () => {
        checked = true;
        const ok = placed.map((p) => p.t).join(' ') === sentence;
        const fb = stage.querySelector('#fb');
        fb.className = `feedback show ${ok ? 'ok' : 'no'}`;
        fb.innerHTML = `<b>${ok ? 'الترتيب صحيح ✓' : 'الترتيب الصحيح:'}</b><div class="en" style="margin-top:4px">${highlight(sentence, w.term)}</div>`;
        speak(sentence, { rate: 0.9 }).catch(() => {});
        stage.querySelector('#check').classList.add('hidden');
        stage.querySelector('#clear').classList.add('hidden');
        const next = stage.querySelector('#nextBtn');
        next.classList.remove('hidden');
        next.addEventListener('click', () => resolve(ok));
      });
    };
    draw();
  }),
};


/* -------------------------------------------------- more review games */

Object.assign(KINDS, {
  // صح أو خطأ: is this the right meaning?
  truefalse: (stage, w, pool) => new Promise((resolve) => {
    const other = distractors(w, pool, 1, (x) => x.arabic)[0];
    const showTrue = !other || Math.random() < 0.5;
    const shown = showTrue ? w.arabic : other.arabic;
    stage.innerHTML = `<div class="card question"><div class="prompt">هل هذا هو المعنى الصحيح؟</div>
        <div class="q-big">${esc(w.term)}</div><div class="tf-meaning">${esc(shown)}</div></div>
      <div class="options tf-options"><button class="option tf-yes" data-v="1">✓ صح</button><button class="option tf-no" data-v="0">✗ خطأ</button></div>
      <div class="feedback" id="fb"></div><div class="next-wrap"><button class="btn primary hidden" id="nextBtn">التالي ←</button></div>`;
    let done = false;
    stage.querySelectorAll('[data-v]').forEach((b) => b.addEventListener('click', () => {
      if (done) return;
      done = true;
      const ok = (b.dataset.v === '1') === showTrue;
      stage.querySelectorAll('[data-v]').forEach((x) => (x.disabled = true));
      b.classList.add(ok ? 'correct' : 'wrong');
      reveal(stage, w, ok);
      const next = stage.querySelector('#nextBtn');
      next.classList.remove('hidden');
      next.focus();
      next.addEventListener('click', () => resolve(ok));
    }));
  }),

  // اكتب ما تسمع: listen and type the word.
  spell: (stage, w) => new Promise((resolve) => {
    const target = letters(w);
    setTimeout(() => speak(target).catch(() => {}), 250);
    stage.innerHTML = `<div class="card question"><div class="prompt">استمع واكتب الكلمة</div>
        <button class="big-play" data-say="${esc(target)}" data-rate="1" aria-label="تشغيل">${icon.speaker}</button>
        <div style="margin-top:8px"><button class="btn sm ghost" data-say="${esc(target)}" data-rate="0.55">🐢 بطيء</button></div>
        ${w.arabic ? `<div class="small muted" style="margin-top:8px">التلميح: ${esc(w.arabic)}</div>` : ''}</div>
      <form id="sf" class="url-row" style="margin-top:14px"><input class="input en" id="ans" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Type what you hear…"><button class="btn primary" type="submit">تحقّق</button></form>
      <div class="btn-row" style="justify-content:center;margin-top:10px"><button class="btn sm ghost" id="skip">لا أعرف</button></div>
      <div class="feedback" id="fb"></div><div class="next-wrap"><button class="btn primary hidden" id="nextBtn">التالي ←</button></div>`;
    const input = stage.querySelector('#ans');
    input.focus();
    let done = false;
    const finish = (ok) => {
      if (done) return;
      done = true;
      input.disabled = true;
      reveal(stage, w, ok, ok ? '' : ` — كتبتَ: <span class="en-inline">${esc(input.value || '—')}</span>`);
      const next = stage.querySelector('#nextBtn');
      next.classList.remove('hidden');
      next.focus();
      next.addEventListener('click', () => resolve(ok));
    };
    const norm = (x) => x.toLowerCase().replace(/[’']/g, "'").replace(/[^a-z' -]/g, '').replace(/\s+/g, ' ').trim();
    stage.querySelector('#sf').addEventListener('submit', (e) => {
      e.preventDefault();
      if (input.value.trim()) finish(norm(input.value) === norm(target));
    });
    stage.querySelector('#skip').addEventListener('click', () => finish(false));
  }),

  // رتّب الحروف: rebuild the word from shuffled letters.
  scramble: (stage, w) => new Promise((resolve) => {
    const target = letters(w);
    let pool = shuffle([...target.replace(/ /g, '')].map((c, k) => ({ c, k })));
    if (pool.map((p) => p.c).join('') === target.replace(/ /g, '')) pool = [...pool.slice(1), pool[0]];
    const placed = [];
    let checked = false;
    const draw = () => {
      stage.innerHTML = `<div class="card question"><div class="prompt">رتّب الحروف لتكوين الكلمة</div>
          <div class="q-ar">${esc(w.arabic || '')}</div>${w.simple_english ? `<div class="small muted en" style="text-align:center;margin-top:6px">${esc(w.simple_english)}</div>` : ''}</div>
        <div class="token-area letters" style="margin-top:14px">${placed.map((p, k) => `<button class="token placed" data-from="a" data-k="${k}">${esc(p.c)}</button>`).join('') || '<span class="muted small" dir="rtl">اضغط الحروف بالترتيب…</span>'}</div>
        <div class="token-area pool letters" style="margin-top:10px">${pool.map((p, k) => `<button class="token" data-from="p" data-k="${k}">${esc(p.c)}</button>`).join('')}</div>
        <div class="feedback" id="fb"></div>
        <div class="btn-row" style="justify-content:center;margin-top:14px"><button class="btn" id="clear">مسح</button><button class="btn primary" id="check" ${pool.length ? 'disabled' : ''}>تحقّق</button><button class="btn primary hidden" id="nextBtn">التالي ←</button></div>`;
      stage.querySelectorAll('.token').forEach((b) => b.addEventListener('click', () => {
        if (checked) return;
        const k = Number(b.dataset.k);
        if (b.dataset.from === 'p') placed.push(...pool.splice(k, 1));
        else pool.push(...placed.splice(k, 1));
        draw();
      }));
      stage.querySelector('#clear').addEventListener('click', () => {
        if (checked) return;
        pool.push(...placed.splice(0));
        draw();
      });
      stage.querySelector('#check').addEventListener('click', () => {
        checked = true;
        const ok = placed.map((p) => p.c).join('').toLowerCase() === target.replace(/ /g, '').toLowerCase();
        reveal(stage, w, ok);
        stage.querySelector('#check').classList.add('hidden');
        stage.querySelector('#clear').classList.add('hidden');
        const next = stage.querySelector('#nextBtn');
        next.classList.remove('hidden');
        next.addEventListener('click', () => resolve(ok));
      });
    };
    draw();
  }),
});

/** 60-second challenge: as many meanings as possible; each word scored once. */
function speedRound(stage, words, pool, record, onProgress) {
  return new Promise((resolve) => {
    const usable = words.filter((w) => w.arabic);
    const scored = new Set();
    let left = 60;
    let i = 0;
    let streak = 0;
    let points = 0;
    stage.innerHTML = `<div class="speed-top"><span class="score-pill" id="timer">⏱ 60</span><span class="score-pill" id="pts">⭐ 0</span></div><div id="sq"></div>`;
    const timerEl = stage.querySelector('#timer');
    const tick = setInterval(() => {
      left -= 1;
      timerEl.textContent = `⏱ ${left}`;
      onProgress?.(60 - left, 60);
      if (left <= 0) {
        clearInterval(tick);
        resolve(points);
      }
    }, 1000);
    const ask = () => {
      if (left <= 0) return;
      const w = usable[i % usable.length];
      i += 1;
      const opts = shuffle([w, ...distractors(w, pool, 3, (x) => x.arabic)]);
      const q = stage.querySelector('#sq');
      q.innerHTML = `<div class="card question" style="padding:20px"><div class="q-big">${esc(w.term)}</div></div>
        <div class="options">${opts.map((o, k) => `<button class="option" data-k="${k}">${esc(o.arabic)}</button>`).join('')}</div>`;
      q.querySelectorAll('.option').forEach((b) => b.addEventListener('click', () => {
        const ok = opts[Number(b.dataset.k)].uv_id === w.uv_id;
        b.classList.add(ok ? 'correct' : 'wrong');
        q.querySelectorAll('.option').forEach((x) => (x.disabled = true));
        if (ok) {
          streak += 1;
          points += 1 + Math.floor(streak / 3);
        } else streak = 0;
        stage.querySelector('#pts').textContent = `⭐ ${points}${streak >= 3 ? ` 🔥×${streak}` : ''}`;
        if (!scored.has(w.uv_id)) {
          scored.add(w.uv_id);
          record(w, ok);
        }
        setTimeout(ask, ok ? 250 : 700);
      }));
    };
    ask();
  });
}

/** Match-the-pairs round over a set of words; resolves with Map(uv_id → correct). */
function connectRound(stage, set) {
  return new Promise((resolve) => {
    const results = new Map();
    const left = shuffle(set);
    const right = shuffle(set);
    let selL = null;
    let selR = null;
    stage.innerHTML = `<div class="card question" style="padding:16px"><div class="prompt" style="margin:0">اضغط كلمة إنجليزية ثم معناها</div></div>
      <div class="match-cols" style="margin-top:14px">
        <div class="col">${left.map((w) => `<button class="match-item en" data-side="L" data-id="${w.uv_id}" style="text-align:center">${esc(w.term)}</button>`).join('')}</div>
        <div class="col">${right.map((w) => `<button class="match-item" data-side="R" data-id="${w.uv_id}">${esc(w.arabic)}</button>`).join('')}</div>
      </div>`;
    const check = () => {
      if (!selL || !selR) return;
      const a = Number(selL.dataset.id);
      const b = Number(selR.dataset.id);
      if (a === b) {
        [selL, selR].forEach((el) => el.classList.replace('sel', 'done'));
        if (!results.has(a)) results.set(a, true);
        speak(set.find((x) => x.uv_id === a).term).catch(() => {});
        if ([...stage.querySelectorAll('.match-item.done')].length === set.length * 2) setTimeout(() => resolve(results), 500);
      } else {
        [selL, selR].forEach((el) => {
          el.classList.add('wrong');
          setTimeout(() => el.classList.remove('wrong', 'sel'), 450);
        });
        if (!results.has(a)) results.set(a, false);
      }
      selL = null;
      selR = null;
    };
    stage.querySelectorAll('.match-item').forEach((el) => el.addEventListener('click', () => {
      if (el.dataset.side === 'L') {
        selL?.classList.remove('sel');
        selL = el;
      } else {
        selR?.classList.remove('sel');
        selR = el;
      }
      el.classList.add('sel');
      check();
    }));
  });
}

/**
 * Run a round. type: 'mixed' or a key of TYPES.
 * onProgress(done, total, score); resolves {correct, wrong, missed: word[]}.
 */
export async function runQuiz(stage, { words, distractors: pool, type = 'mixed', onProgress = () => {} }) {
  bindSpeech(stage);
  const score = { correct: 0, wrong: 0, missed: [] };
  const record = async (w, ok) => {
    if (ok) score.correct += 1;
    else {
      score.wrong += 1;
      if (!score.missed.some((m) => m.uv_id === w.uv_id)) score.missed.push(w);
    }
    try {
      await api.review(w.uv_id, ok ? 'good' : 'hard', type === 'mixed' ? 'quiz' : `game:${type}`);
    } catch (err) {
      toast(err.message);
    }
  };
  const all = pool?.length >= 4 ? pool : words;

  if (type === 'speed') {
    score.points = await speedRound(stage, words, all, record, (d, t) => onProgress(d, t, score));
    return score;
  }
  if (type === 'connect') {
    const usable = words.filter((w) => w.arabic);
    for (let k = 0; k < usable.length; k += 6) {
      onProgress(k, usable.length, score);
      const set = usable.slice(k, k + 6);
      if (set.length < 2) break;
      const res = await connectRound(stage, set);
      for (const w of set) await record(w, res.get(w.uv_id) !== false);
    }
    return score;
  }

  const list = type === 'mixed' ? words : words.filter((w) => can[type]?.(w));
  for (let i = 0; i < list.length; i += 1) {
    onProgress(i, list.length, score);
    const w = list[i];
    const kind = type === 'mixed' ? chooseType(w, i) : type;
    const ok = await KINDS[kind](stage, w, all);
    await record(w, ok);
  }
  onProgress(list.length, list.length, score);
  return score;
}

export const canPlay = (type, w) => (type === 'mixed' ? true : type === 'connect' ? !!w.arabic : can[type]?.(w));
export const GAME_ORDER = ['connect', 'truefalse', 'speed', 'meaning', 'listen', 'spell', 'scramble', 'fill', 'context', 'build', 'translate'];
