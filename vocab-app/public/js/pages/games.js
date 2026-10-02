// Games built ONLY from the learner's saved vocabulary. Every answer is sent to
// the server as a review (correct → good, wrong → hard) so games feed SRS.
import { api } from '../api.js';
import { speak } from '../audio.js';
import { esc, icon, shuffle, highlight, termRegex, emptyState, toast, levelChip } from '../ui.js';
import { bindSpeech, openWordDetail } from '../components.js';
import { refreshStats } from '../app.js';

export const GAMES = [
  { id: 'connections', name: 'روابط الكلمات', en: 'Word Connections', desc: 'طابق الكلمة الإنجليزية مع معناها العربي.', icon: 'puzzle' },
  { id: 'choose-meaning', name: 'اختر المعنى', en: 'Choose the Meaning', desc: 'اختر المعنى العربي الصحيح للكلمة.', icon: 'check' },
  { id: 'listen-choose', name: 'استمع واختر', en: 'Listen & Choose', desc: 'استمع للنطق واختر الكلمة الصحيحة.', icon: 'ear' },
  { id: 'fill-blank', name: 'املأ الفراغ', en: 'Fill in the Blank', desc: 'أكمل الجملة بالكلمة المناسبة.', icon: 'pen' },
  { id: 'build-sentence', name: 'ركّب الجملة', en: 'Build the Sentence', desc: 'رتّب الكلمات المبعثرة لتكوين الجملة.', icon: 'shuffle' },
  { id: 'context', name: 'تحدّي السياق', en: 'Context Challenge', desc: 'جملة من الفيديو: ماذا تعني الكلمة هنا؟', icon: 'quote' },
  { id: 'translation', name: 'تحدّي الترجمة', en: 'Translation Challenge', desc: 'اكتب الكلمة الإنجليزية من معناها العربي.', icon: 'translate' },
];

const SCOPES = [
  ['mixed', 'مزيج ذكي'],
  ['today', 'كلمات اليوم'],
  ['yesterday', 'الأمس'],
  ['week', 'هذا الأسبوع'],
  ['previous', 'كلمات سابقة'],
  ['difficult', 'الصعبة'],
  ['all', 'الكل'],
];
const ROUNDS = 8;

export async function render(view, { segments, params }) {
  const gameId = segments[1];
  if (!gameId) return renderHub(view, params);
  return playGame(view, gameId, params);
}

/* ---------------------------------------------------------------- hub */

async function renderHub(view, params) {
  const scope = params.scope || 'mixed';
  const campaignQ = params.campaign ? `&campaign=${params.campaign}` : '';
  const pool = await api.gamePool(scope, params.campaign);
  const camp = params.campaign ? await api.campaign(params.campaign).catch(() => null) : null;
  view.innerHTML = `
    <div class="page-head"><div><div class="eyebrow">Games</div><h1>${camp ? `ألعاب: ${esc(camp.name)}` : 'الألعاب'}</h1>
      <p>كل الألعاب تستخدم كلماتك المحفوظة فقط، وكل إجابة تُحدّث جدول المراجعة.</p></div>
      <span class="chip ar-chip" style="font-size:13px">${pool.words.length} كلمة في هذه المجموعة</span></div>
    ${camp ? '' : `<div class="tabs">${SCOPES.map(([k, l]) => `<a class="tab ${k === scope ? 'active' : ''}" href="#/games?scope=${k}">${l}</a>`).join('')}</div>`}
    ${pool.distractors.length < 4 ? emptyState('🎯', 'تحتاج 4 كلمات محفوظة على الأقل', 'احفظ المزيد من الكلمات من فيديو لتفتح الألعاب.', `<a class="btn primary" href="#/analyzer">حلّل فيديو</a>`) : `
    <div class="game-grid">${GAMES.map((g) => `
      <a class="card game-card" href="#/games/${g.id}?scope=${scope}${campaignQ}" style="text-decoration:none">
        <div class="row between"><div class="game-icon">${icon[g.icon]}</div><span class="tiny muted en-inline">${g.en}</span></div>
        <h3 style="font-size:17px">${g.name}</h3><p class="small muted">${g.desc}</p>
        <span class="btn sm primary" style="justify-self:start;margin-top:4px">${icon.play} العب</span>
      </a>`).join('')}</div>`}`;
}

/* --------------------------------------------------------------- play */

function sentencesFor(w) {
  const list = [];
  const easy = w.examples?.find((e) => e.kind === 'easy');
  const ex = w.examples?.find((e) => e.kind === 'example');
  if (easy) list.push(easy.sentence);
  if (ex) list.push(ex.sentence);
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

function buildable(w) {
  const s = sentencesFor(w).find((x) => {
    const n = x.split(/\s+/).length;
    return n >= 4 && n <= 13;
  });
  return s || null;
}

const eligible = {
  connections: () => true,
  'choose-meaning': () => true,
  'listen-choose': () => true,
  translation: () => true,
  'fill-blank': (w) => !!blankable(w),
  'build-sentence': (w) => !!buildable(w),
  context: (w) => !!w.context_sentence,
};

function distractorsFor(target, all, n, key) {
  const seen = new Set([key(target)]);
  const sameLevel = shuffle(all.filter((w) => w.uv_id !== target.uv_id && w.level === target.level));
  const others = shuffle(all.filter((w) => w.uv_id !== target.uv_id && w.level !== target.level));
  const out = [];
  for (const w of [...sameLevel, ...others]) {
    if (out.length >= n) break;
    const k = key(w);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(w);
  }
  return out;
}

async function playGame(view, gameId, params) {
  const game = GAMES.find((g) => g.id === gameId);
  if (!game) {
    location.hash = '#/games';
    return;
  }
  const scope = params.scope || 'mixed';
  const backHref = `#/games?scope=${scope}${params.campaign ? `&campaign=${params.campaign}` : ''}`;
  const { words: poolWords, distractors } = await api.gamePool(scope, params.campaign);
  // Difficult and due words first so games reinforce weak spots, then the rest.
  const ranked = shuffle(poolWords.filter(eligible[gameId])).sort((a, b) => Number(b.difficult || b.due) - Number(a.difficult || a.due));
  const words = ranked.slice(0, gameId === 'connections' ? 12 : ROUNDS);

  const score = { correct: 0, wrong: 0 };
  const missed = new Map();
  let cleanupKey = null;

  view.innerHTML = `
    <div class="game-stage">
      <div class="game-top">
        <div class="row" style="gap:10px"><a class="btn icon sm ghost" href="${backHref}" aria-label="رجوع">${icon.prev}</a>
          <div><h1 style="font-size:22px">${game.name}</h1><div class="tiny muted en-inline">${game.en}</div></div></div>
        <div class="row" style="gap:8px"><span class="score-pill" id="score">✅ 0 · ❌ 0</span><span class="score-pill" id="round"></span></div>
      </div>
      <div class="bar" style="margin-bottom:18px"><span id="gbar" style="width:0%"></span></div>
      <div id="stage"></div>
    </div>`;
  const stage = view.querySelector('#stage');
  bindSpeech(stage);

  if (distractors.length < 4 || !words.length) {
    stage.innerHTML = emptyState('🎯', 'لا توجد كلمات مناسبة لهذه اللعبة هنا', distractors.length < 4 ? 'احفظ 4 كلمات على الأقل لتفتح الألعاب.' : 'جرّب مجموعة كلمات أخرى أو لعبة مختلفة.', `<a class="btn" href="${backHref}">رجوع</a>`);
    return;
  }

  const setProgress = (done, total) => {
    view.querySelector('#gbar').style.width = `${Math.round((100 * done) / total)}%`;
    view.querySelector('#round').textContent = `${Math.min(done + 1, total)} / ${total}`;
  };

  async function answer(w, correct) {
    if (correct) score.correct += 1;
    else {
      score.wrong += 1;
      missed.set(w.uv_id, w);
    }
    view.querySelector('#score').textContent = `✅ ${score.correct} · ❌ ${score.wrong}`;
    try {
      await api.review(w.uv_id, correct ? 'good' : 'hard', `game:${gameId}`);
    } catch (err) {
      toast(err.message);
    }
  }

  function finish() {
    refreshStats();
    const total = score.correct + score.wrong;
    const pct = total ? Math.round((100 * score.correct) / total) : 0;
    view.querySelector('#gbar').style.width = '100%';
    stage.innerHTML = `
      <div class="card done-panel">
        <div class="big">${pct >= 80 ? '🏆' : pct >= 50 ? '👏' : '💪'}</div>
        <h2 style="margin:10px 0 4px">${score.correct} من ${total} صحيحة</h2>
        <p class="ink-2">${missed.size ? 'الكلمات التي أخطأت فيها ستظهر أكثر في المراجعة القادمة.' : 'ممتاز! ستتباعد مراجعة هذه الكلمات.'}</p>
        ${missed.size ? `<div class="word-list" style="margin-top:18px;text-align:start" id="missed">${[...missed.values()].map((w) => `
          <div class="word-row" data-id="${w.uv_id}"><div><div class="en-row en"><span class="term">${esc(w.term)}</span>${levelChip(w.level)}</div><div class="meaning">${esc(w.arabic)}</div></div>
          <div class="actions"><button class="btn icon sm ghost" data-say="${esc(w.term)}" data-rate="1">${icon.speaker}</button></div></div>`).join('')}</div>` : ''}
        <div class="btn-row" style="justify-content:center;margin-top:22px">
          <button class="btn primary" id="again">${icon.repeat} العب مجددًا</button><a class="btn" href="${backHref}">لعبة أخرى</a>
          ${missed.size ? `<a class="btn" href="#/review?ids=${[...missed.keys()].join(',')}">${icon.cards} راجع الأخطاء</a>` : ''}
        </div>
      </div>`;
    stage.querySelector('#again').addEventListener('click', () => playGame(view, gameId, params));
    stage.querySelector('#missed')?.addEventListener('click', (e) => {
      if (e.target.closest('[data-say]')) return;
      const row = e.target.closest('.word-row');
      if (row) openWordDetail(missed.get(Number(row.dataset.id)));
    });
  }

  const ctx = { stage, words, distractors, answer, finish, setProgress, onKey: (fn) => (cleanupKey = fn) };
  RUNNERS[gameId](ctx);
  return () => cleanupKey && document.removeEventListener('keydown', cleanupKey);
}

/* ---------------------------------------------------- multiple choice */

function runMultipleChoice(ctx, { prompt, options, optionText, optionClass = '', afterReveal = () => '', onShow }) {
  const { stage, words } = ctx;
  let i = 0;
  const next = () => {
    if (i >= words.length) return ctx.finish();
    ctx.setProgress(i, words.length);
    const w = words[i];
    const opts = shuffle([w, ...options(w)]);
    stage.innerHTML = `
      <div class="card question">${prompt(w)}</div>
      <div class="options">${opts.map((o, k) => `<button class="option ${optionClass}" data-k="${k}">${optionText(o)}</button>`).join('')}</div>
      <div class="feedback" id="fb"></div>
      <div style="text-align:center;margin-top:14px"><button class="btn primary hidden" id="nextBtn">التالي ←</button></div>`;
    onShow?.(w);
    let answered = false;
    stage.querySelectorAll('.option').forEach((btn) =>
      btn.addEventListener('click', () => {
        if (answered) return;
        answered = true;
        const chosen = opts[Number(btn.dataset.k)];
        const ok = chosen.uv_id === w.uv_id;
        stage.querySelectorAll('.option').forEach((b) => {
          b.disabled = true;
          if (opts[Number(b.dataset.k)].uv_id === w.uv_id) b.classList.add('correct');
        });
        if (!ok) btn.classList.add('wrong');
        const fb = stage.querySelector('#fb');
        fb.className = `feedback show ${ok ? 'ok' : 'no'}`;
        fb.innerHTML = `<b>${ok ? 'إجابة صحيحة ✓' : 'ليست صحيحة'}</b> — <span class="en-inline"><b>${esc(w.term)}</b></span>: ${esc(w.arabic)}${afterReveal(w)}`;
        ctx.answer(w, ok);
        if (ok) speak(w.term).catch(() => {});
        stage.querySelector('#nextBtn').classList.remove('hidden');
        stage.querySelector('#nextBtn').focus();
      }),
    );
    stage.querySelector('#nextBtn').addEventListener('click', () => {
      i += 1;
      next();
    });
  };
  next();
}

const arabicKey = (w) => w.arabic;
const termKey = (w) => w.term.toLowerCase();

const RUNNERS = {
  'choose-meaning': (ctx) =>
    runMultipleChoice(ctx, {
      prompt: (w) => `<div class="prompt">ما معنى هذه الكلمة؟</div><div class="q-big">${esc(w.term)}</div>
        <div style="margin-top:10px"><button class="btn sm ghost" data-say="${esc(w.term)}" data-rate="1">${icon.speaker} استمع</button></div>`,
      options: (w) => distractorsFor(w, ctx.distractors, 3, arabicKey),
      optionText: (o) => esc(o.arabic),
    }),

  'listen-choose': (ctx) =>
    runMultipleChoice(ctx, {
      prompt: (w) => `<div class="prompt">استمع واختر الكلمة التي سمعتها</div>
        <button class="big-play" data-say="${esc(w.term)}" data-rate="1" aria-label="تشغيل">${icon.speaker}</button>
        <div style="margin-top:10px"><button class="btn sm ghost" data-say="${esc(w.term)}" data-rate="0.6">🐢 بطيء</button></div>`,
      options: (w) => distractorsFor(w, ctx.distractors, 3, termKey),
      optionText: (o) => `<span class="en-inline">${esc(o.term)}</span>`,
      onShow: (w) => setTimeout(() => speak(w.term).catch(() => {}), 250),
    }),

  context: (ctx) =>
    runMultipleChoice(ctx, {
      prompt: (w) => `<div class="prompt">جملة من الفيديو${w.video?.title ? ` <span class="en-inline tiny">“${esc(w.video.title.slice(0, 50))}”</span>` : ''}</div>
        <div class="q-sentence">“${highlight(w.context_sentence, w.term)}”</div>
        <div class="prompt" style="margin-top:14px">ماذا تعني <b class="en-inline">${esc(w.term)}</b> في هذا السياق؟</div>
        <button class="btn sm ghost" data-say="${esc(w.context_sentence)}" data-rate="0.9">${icon.speaker} استمع للجملة</button>`,
      options: (w) => distractorsFor(w, ctx.distractors, 3, arabicKey),
      optionText: (o) => esc(o.arabic),
      afterReveal: (w) => (w.context_arabic ? `<div class="small" style="margin-top:6px">${esc(w.context_arabic)}</div>` : ''),
    }),

  'fill-blank': (ctx) =>
    runMultipleChoice(ctx, {
      prompt: (w) => {
        const b = blankable(w);
        const before = esc(b.sentence.slice(0, b.index));
        const after = esc(b.sentence.slice(b.index + b.match.length));
        return `<div class="prompt">أكمل الجملة بالكلمة المناسبة</div><div class="q-sentence">${before}<span class="blank">&nbsp;</span>${after}</div>
          <div class="small muted" style="margin-top:10px">التلميح: ${esc(w.arabic)}</div>`;
      },
      options: (w) => distractorsFor(w, ctx.distractors, 3, termKey),
      optionText: (o) => `<span class="en-inline">${esc(o.term)}</span>`,
      afterReveal: (w) => `<div class="en small" style="margin-top:6px">${highlight(blankable(w).sentence, w.term)}</div>`,
    }),

  connections: (ctx) => {
    const { stage, words } = ctx;
    const rounds = [];
    for (let k = 0; k < words.length; k += 6) rounds.push(words.slice(k, k + 6));
    if (rounds.length > 1 && rounds.at(-1).length < 3) rounds[rounds.length - 2].push(...rounds.pop());
    let r = 0;
    const playRound = () => {
      if (r >= rounds.length) return ctx.finish();
      ctx.setProgress(r, rounds.length);
      const set = rounds[r];
      const left = shuffle(set);
      const right = shuffle(set);
      const matched = new Set();
      const penalised = new Set();
      let selL = null;
      let selR = null;
      stage.innerHTML = `<div class="card question" style="padding:18px"><div class="prompt" style="margin:0">اضغط كلمة إنجليزية ثم معناها العربي</div></div>
        <div class="match-cols" style="margin-top:14px">
          <div class="col">${left.map((w) => `<button class="match-item en" data-side="L" data-id="${w.uv_id}" style="text-align:center">${esc(w.term)}</button>`).join('')}</div>
          <div class="col">${right.map((w) => `<button class="match-item" data-side="R" data-id="${w.uv_id}">${esc(w.arabic)}</button>`).join('')}</div>
        </div>`;
      const check = () => {
        if (!selL || !selR) return;
        const a = Number(selL.dataset.id);
        const b = Number(selR.dataset.id);
        const w = set.find((x) => x.uv_id === a);
        if (a === b) {
          selL.classList.add('done');
          selR.classList.add('done');
          selL.classList.remove('sel');
          selR.classList.remove('sel');
          matched.add(a);
          if (!penalised.has(a)) ctx.answer(w, true);
          speak(w.term).catch(() => {});
          if (matched.size === set.length) {
            r += 1;
            setTimeout(playRound, 600);
          }
        } else {
          [selL, selR].forEach((el) => {
            el.classList.add('wrong');
            setTimeout(() => el.classList.remove('wrong', 'sel'), 450);
          });
          if (!penalised.has(a)) {
            penalised.add(a);
            ctx.answer(w, false);
          }
        }
        selL = null;
        selR = null;
      };
      stage.querySelectorAll('.match-item').forEach((el) =>
        el.addEventListener('click', () => {
          if (el.dataset.side === 'L') {
            selL?.classList.remove('sel');
            selL = el;
          } else {
            selR?.classList.remove('sel');
            selR = el;
          }
          el.classList.add('sel');
          check();
        }),
      );
    };
    playRound();
  },

  'build-sentence': (ctx) => {
    const { stage, words } = ctx;
    let i = 0;
    const next = () => {
      if (i >= words.length) return ctx.finish();
      ctx.setProgress(i, words.length);
      const w = words[i];
      const sentence = buildable(w);
      const tokens = sentence.split(/\s+/);
      let pool = shuffle(tokens.map((t, k) => ({ t, k })));
      if (pool.every((p, k) => p.k === k) && pool.length > 2) pool = [...pool.slice(1), pool[0]];
      const placed = [];
      let checked = false;
      const draw = () => {
        stage.innerHTML = `
          <div class="card question"><div class="prompt">رتّب الكلمات لتكوين جملة تستخدم</div><div class="q-big" style="font-size:26px">${esc(w.term)}</div>
            <div class="small muted" style="margin-top:6px">${esc(w.arabic)}</div></div>
          <div class="token-area" id="answer" style="margin-top:14px">${placed.map((p, k) => `<button class="token placed" data-from="answer" data-k="${k}">${esc(p.t)}</button>`).join('') || '<span class="muted small" dir="rtl" style="font-family:var(--font-ar)">اضغط الكلمات بالترتيب…</span>'}</div>
          <div class="token-area" id="pool" style="margin-top:10px;border-style:solid;background:var(--surface-2)">${pool.map((p, k) => `<button class="token" data-from="pool" data-k="${k}">${esc(p.t)}</button>`).join('')}</div>
          <div class="feedback" id="fb"></div>
          <div class="btn-row" style="justify-content:center;margin-top:14px">
            <button class="btn" id="clear">مسح</button>
            <button class="btn primary" id="check" ${pool.length ? 'disabled' : ''}>تحقّق</button>
            <button class="btn primary hidden" id="nextBtn">التالي ←</button>
          </div>`;
        stage.querySelectorAll('.token').forEach((b) =>
          b.addEventListener('click', () => {
            if (checked) return;
            const k = Number(b.dataset.k);
            if (b.dataset.from === 'pool') placed.push(...pool.splice(k, 1));
            else pool.push(...placed.splice(k, 1));
            draw();
          }),
        );
        stage.querySelector('#clear').addEventListener('click', () => {
          if (checked) return;
          pool.push(...placed.splice(0));
          draw();
        });
        stage.querySelector('#check').addEventListener('click', () => {
          checked = true;
          const built = placed.map((p) => p.t).join(' ');
          const ok = built === sentence;
          const fb = stage.querySelector('#fb');
          fb.className = `feedback show ${ok ? 'ok' : 'no'}`;
          fb.innerHTML = `<b>${ok ? 'ممتاز! الترتيب صحيح ✓' : 'الترتيب الصحيح:'}</b><div class="en" style="margin-top:4px">${highlight(sentence, w.term)}</div>`;
          ctx.answer(w, ok);
          speak(sentence, { rate: 0.9 }).catch(() => {});
          stage.querySelector('#check').classList.add('hidden');
          stage.querySelector('#clear').classList.add('hidden');
          stage.querySelector('#nextBtn').classList.remove('hidden');
          stage.querySelector('#nextBtn').addEventListener('click', () => {
            i += 1;
            next();
          });
        });
      };
      draw();
    };
    next();
  },

  translation: (ctx) => {
    const { stage, words } = ctx;
    let i = 0;
    const norm = (s) => s.toLowerCase().replace(/[’']/g, "'").replace(/\b(something|someone|sth|sb)\b/g, '').replace(/[^a-z' -]/g, '').replace(/\s+/g, ' ').trim();
    const next = () => {
      if (i >= words.length) return ctx.finish();
      ctx.setProgress(i, words.length);
      const w = words[i];
      let hints = 0;
      stage.innerHTML = `
        <div class="card question"><div class="prompt">اكتب الكلمة أو العبارة الإنجليزية</div><div class="q-ar">${esc(w.arabic)}</div>
          <div class="small muted en" style="margin-top:8px;text-align:center">${esc(w.simple_english)}</div>
          <div class="row" style="justify-content:center;gap:6px;margin-top:10px">${levelChip(w.level)}<span class="chip en-inline" id="hint">${w.term.split(/\s+/).map((p) => '_'.repeat(Math.min(p.length, 12))).join(' ')}</span></div></div>
        <form id="tf" class="url-row" style="margin-top:14px">
          <input class="input en" id="ans" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Type in English…">
          <button class="btn primary" type="submit">تحقّق</button>
        </form>
        <div class="btn-row" style="justify-content:center;margin-top:10px"><button class="btn sm ghost" id="hintBtn">💡 تلميح</button><button class="btn sm ghost" id="skip">لا أعرف</button></div>
        <div class="feedback" id="fb"></div>
        <div style="text-align:center;margin-top:14px"><button class="btn primary hidden" id="nextBtn">التالي ←</button></div>`;
      const input = stage.querySelector('#ans');
      input.focus();
      let done = false;
      const reveal = (ok) => {
        if (done) return;
        done = true;
        const fb = stage.querySelector('#fb');
        fb.className = `feedback show ${ok ? 'ok' : 'no'}`;
        fb.innerHTML = `<b>${ok ? 'صحيح ✓' : 'الإجابة:'}</b> <span class="en-inline"><b>${esc(w.term)}</b> ${esc(w.pronunciation || '')}</span>`;
        ctx.answer(w, ok);
        speak(w.term).catch(() => {});
        input.disabled = true;
        stage.querySelector('#nextBtn').classList.remove('hidden');
        stage.querySelector('#nextBtn').focus();
      };
      stage.querySelector('#tf').addEventListener('submit', (e) => {
        e.preventDefault();
        if (done || !input.value.trim()) return;
        const given = norm(input.value);
        const target = norm(w.term);
        const re = termRegex(w.term);
        // Hints used twice or more count as not known.
        reveal((given === target || (re && re.test(input.value.trim()) && given.split(' ').length <= target.split(' ').length + 2)) && hints < 2);
      });
      stage.querySelector('#hintBtn').addEventListener('click', () => {
        hints += 1;
        const parts = w.term.split(/\s+/);
        stage.querySelector('#hint').textContent = parts.map((p) => p.slice(0, hints + 1) + '_'.repeat(Math.max(0, Math.min(p.length, 12) - hints - 1))).join(' ');
      });
      stage.querySelector('#skip').addEventListener('click', () => reveal(false));
      stage.querySelector('#nextBtn').addEventListener('click', () => {
        i += 1;
        next();
      });
    };
    next();
  },
};
