// 📚 «تدرّب › القواعد»: practice the grammar rules themselves — not only play. Every game is built from the fixed rule
// catalog (30 categories · 108 rules: name, how it is built, what it is for, examples with Arabic), so nothing is invented
// and nothing costs. After EVERY answer the rule is taught (its use, how it is built, an example); at the end the missed
// rules are listed to read again. Each question counts toward the «قواعد وأمثلة» goal.
import { api } from './api.js';
import { esc, shuffle } from './ui.js';
import { GRAMMAR } from './shared/grammar-catalog.js';
import { noteRule } from './goal.js';

const RULES = GRAMMAR.flatMap((cat) => cat.subs.map((sub) => ({ ...sub, cat })));
const KINDS = [['pos', '✅ جملة'], ['neg', '❌ نفي'], ['q', '❓ سؤال']];
const okEx = (e) => Array.isArray(e) && e[0] && e[0] !== '—' && e[0].trim().length > 3;
const exOf = (r) => KINDS.map(([k]) => ({ k, en: r.ex[k]?.[0], ar: r.ex[k]?.[1] })).filter((x) => okEx([x.en, x.ar]) && x.ar);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const nameOf = (r) => `${r.ar} · ${r.en}`;

/** wrong choices: first from the same category (they look alike), then from the rest */
function others(rule, n, ok = () => true) {
  const same = shuffle(RULES.filter((r) => r.id !== rule.id && r.cat.id === rule.cat.id && ok(r)));
  const rest = shuffle(RULES.filter((r) => r.cat.id !== rule.cat.id && ok(r)));
  return [...same, ...rest].slice(0, n);
}
const uniq = (list, text) => { const seen = new Set(); return list.filter((x) => { const t = text(x).trim().toLowerCase(); if (!t || seen.has(t)) return false; seen.add(t); return true; }); };

// ---------- the games: each builds one question for a rule ----------
// returns { prompt (html), options: [text…] with `right` index OR build: tokens, say?, key }
const mk = (rule, prompt, right, wrongs, text, extra = {}) => {
  const all = uniq([right, ...wrongs], text);
  const opts = shuffle(all.slice(0, 4));
  return { rule, prompt, opts: opts.map((o) => ({ t: text(o), right: o === right })), ...extra };
};

export const GRAMMAR_GAMES = [
  { key: 'use', name: 'وش فايدتها؟', desc: 'تشوف اسم القاعدة وتختار فايدتها', icon: '💡',
    ask: (r) => mk(r, `<div class="prompt">وش فايدة هذي القاعدة؟</div><div class="q-big">${esc(r.ar)}</div><p class="en tiny muted" dir="ltr">${esc(r.en)}</p>`, r, others(r, 5), (x) => x.use, { key: 'use' }) },
  { key: 'name', name: 'من الفايدة للاسم', desc: 'تقرأ الفايدة بالعربي وتختار اسم القاعدة', icon: '📋',
    ask: (r) => mk(r, `<div class="prompt">أي قاعدة هذي؟</div><div class="q-use">${esc(r.use)}</div>`, r, others(r, 5), nameOf, { key: 'use' }) },
  { key: 'sentence', name: 'أي قاعدة في الجملة؟', desc: 'جملة إنجليزية، وتختار القاعدة المستخدمة', icon: '🔎',
    ask: (r) => { const e = pick(exOf(r)); if (!e) return null; return mk(r, `<div class="prompt">أي قاعدة استُخدمت في هذي الجملة؟</div><div class="q-big en" dir="ltr">${esc(e.en)}</div>`, r, others(r, 5), nameOf, { key: e.k, say: e.en }); } },
  { key: 'pick', name: 'اختر الجملة', desc: 'تشوف القاعدة وتختار الجملة اللي تطبّقها', icon: '✍',
    ask: (r) => { const e = pick(exOf(r).filter((x) => x.k === 'pos').concat(exOf(r))); if (!e) return null;
      const wrong = others(r, 6).map((o) => pick(exOf(o))).filter(Boolean);
      return mk(r, `<div class="prompt">أي جملة تطبّق هذي القاعدة؟</div><div class="q-big">${esc(r.ar)}</div><p class="en tiny muted" dir="ltr">${esc(r.en)}</p>`, e, wrong, (x) => x.en, { key: e.k, ltr: true }); } },
  { key: 'translate', name: 'اختر الترجمة', desc: 'جملة بالإنجليزي وتختار ترجمتها، أو العكس', icon: '🌐',
    ask: (r, i) => { const e = pick(exOf(r)); if (!e) return null;
      const wrong = others(r, 6).map((o) => pick(exOf(o))).filter(Boolean);
      const toAr = i % 2 === 0;
      return toAr
        ? mk(r, `<div class="prompt">وش ترجمة هذي الجملة؟</div><div class="q-big en" dir="ltr">${esc(e.en)}</div>`, e, wrong, (x) => x.ar, { key: e.k, say: e.en })
        : mk(r, `<div class="prompt">وش الجملة الإنجليزية لهذي الترجمة؟</div><div class="q-big">${esc(e.ar)}</div>`, e, wrong, (x) => x.en, { key: e.k, ltr: true }); } },
  { key: 'form', name: 'تركيبها', desc: 'كيف تنبني القاعدة؟', icon: '🧩',
    ask: (r) => mk(r, `<div class="prompt">كيف تتركّب هذي القاعدة؟</div><div class="q-big">${esc(r.ar)}</div><p class="en tiny muted" dir="ltr">${esc(r.en)}</p>`, r, others(r, 5, (x) => x.form !== r.form), (x) => x.form, { key: 'form' }) },
  { key: 'build', name: 'رتّب الجملة', desc: 'ترتّب كلمات الجملة بالترتيب الصحيح', icon: '↻',
    ask: (r) => { const e = pick(exOf(r).filter((x) => x.en.split(/\s+/).length >= 3 && x.en.split(/\s+/).length <= 10)); if (!e) return null;
      const words = e.en.trim().split(/\s+/);
      return { rule: r, key: e.k, build: { words, shuffled: shuffle(words.map((w, i) => ({ w, i }))) }, prompt: `<div class="prompt">رتّب الجملة (المعنى: ${esc(e.ar)})</div>`, say: e.en }; } },
];
const MIXED = { key: 'mixed', name: 'ألعاب متنوعة', desc: 'كل الأنواع بالتناوب: فايدة · اسم · جملة · ترجمة · تركيب · ترتيب', icon: '🎲' };
const ORDER = ['sentence', 'use', 'translate', 'name', 'pick', 'form', 'build'];

// ---------- teaching card (after every answer) ----------
function teachHtml(r, { full = false } = {}) {
  const ex = exOf(r).slice(0, full ? 3 : 1);
  return `<div class="g-teach"><div class="g-teach-h"><b>${esc(r.ar)}</b> <span class="en tiny muted" dir="ltr">${esc(r.en)}</span></div>
    <p class="g-teach-p"><b>💡 فايدتها:</b> ${esc(r.use)}</p>
    <p class="g-teach-p"><b>🧩 تركيبها:</b> ${esc(r.form)}</p>
    ${ex.map((e) => `<div class="g-ex"><p class="en" dir="ltr">${esc(e.en)} <button type="button" class="btn icon sm ghost" data-say="${esc(e.en)}" data-rate="0.9" aria-label="استمع">🔊</button></p><p class="tiny muted">${esc(e.ar)}</p></div>`).join('')}
    <a class="link-btn tiny" href="#/words?tab=grammar&sub=${esc(r.id)}">📖 افتح القاعدة كاملة ←</a></div>`;
}

// ---------- one round ----------
export function runGrammarRound(stage, { game = 'mixed', catId = '', n = 10, rules = null, onExit }) {
  const pool = rules || RULES.filter((r) => !catId || r.cat.id === catId);
  const useGames = game === 'mixed' ? ORDER.map((k) => GRAMMAR_GAMES.find((g) => g.key === k)) : [GRAMMAR_GAMES.find((g) => g.key === game)];
  let lib = { subs: {} };
  api.grammar().then((l) => { lib = l; }).catch(() => {});
  // rules the learner knows least come first (new → learning → mastered), then a shuffle
  const rank = (r) => ({ new: 0, learning: 1, mastered: 2 })[lib.subs?.[r.id]?.status || 'new'] ?? 0;
  const queue = [...shuffle(pool)].sort((a, b) => rank(a) - rank(b) + (Math.random() - 0.5) * 0.9).slice(0, Math.min(n, pool.length));
  const missed = [];
  let score = 0;
  let i = 0;
  let alive = true;

  const finish = () => {
    if (!alive) return;
    const total = queue.length;
    const pct = total ? Math.round((100 * score) / total) : 0;
    const uniqMissed = [...new Map(missed.map((r) => [r.id, r])).values()];
    // the rules that were missed are marked «أتعلمها» (only if still «ما تعلمتها») — a few small writes, once
    uniqMissed.filter((r) => (lib.subs?.[r.id]?.status || 'new') === 'new').slice(0, 10).forEach((r) => api.grammarStatus(r.id, 'learning').catch(() => {}));
    stage.innerHTML = `<div class="card question gp-end"><div class="celebrate-emoji">${pct >= 80 ? '🎉' : pct >= 50 ? '👍' : '💪'}</div>
      <h2>${score} من ${total} صحيحة</h2><i class="th-lost-bar" style="max-width:260px;margin:6px auto"><b style="width:${pct}%"></b></i>
      <p class="ink-2">${pct >= 80 ? 'ممتاز! القواعد ثابتة عندك.' : pct >= 50 ? 'حلو — راجع القواعد اللي غلطت فيها تحت.' : 'عادي — القواعد تثبت بالتكرار. اقرأ اللي غلطت فيه وعيد.'}</p>
      ${uniqMissed.length ? `<div class="gp-missed"><b>راجع هذي القواعد:</b>${uniqMissed.map((r) => `<details><summary>${esc(r.ar)} <span class="en tiny muted" dir="ltr">· ${esc(r.en)}</span></summary>${teachHtml(r, { full: true })}</details>`).join('')}</div>` : ''}
      <div class="btn-row" style="justify-content:center;margin-top:12px">
        ${uniqMissed.length ? '<button type="button" class="btn primary" id="gpAgain">أعد القواعد اللي غلطت فيها</button>' : ''}
        <button type="button" class="btn ${uniqMissed.length ? '' : 'primary'}" id="gpNew">جولة جديدة</button><button type="button" class="btn ghost" id="gpExit">رجوع</button></div></div>`;
    stage.querySelector('#gpAgain')?.addEventListener('click', () => { alive = false; runGrammarRound(stage, { game, n: uniqMissed.length, rules: uniqMissed, onExit }); });
    stage.querySelector('#gpNew')?.addEventListener('click', () => { alive = false; runGrammarRound(stage, { game, catId, n, onExit }); });
    stage.querySelector('#gpExit')?.addEventListener('click', () => { alive = false; onExit?.(); });
  };

  const settle = (q, right) => {
    if (right) score += 1; else missed.push(q.rule);
    noteRule(`${q.rule.id}:${q.key || 'q'}`); // counts toward the «قواعد وأمثلة» goal
    api.grammarSeen(q.rule.id).catch(() => {});
    const fb = stage.querySelector('#gpFb');
    fb.className = `feedback show ${right ? 'ok' : 'no'}`;
    fb.innerHTML = `<b>${right ? 'صحيح ✓' : 'ليست صحيحة'}</b>${teachHtml(q.rule, { full: !right })}`;
    fb.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); // the lesson is right there after the answer
    const next = stage.querySelector('#gpNext');
    next.classList.remove('hidden');
    next.textContent = i + 1 >= queue.length ? 'النتيجة ←' : 'التالي ←';
    next.focus();
    next.addEventListener('click', () => { i += 1; step(); }, { once: true });
  };

  function step() {
    if (!alive) return;
    if (i >= queue.length) { finish(); return; }
    const r = queue[i];
    // a game that cannot ask about this rule (e.g. no example) is replaced by another one
    let q = null;
    for (let t = 0; t < useGames.length && !q; t += 1) q = useGames[(i + t) % useGames.length].ask(r, i);
    if (!q || (q.opts && q.opts.length < 2)) { queue.splice(i, 1); step(); return; }
    const head = `<div class="gp-head"><span class="tiny muted en-inline" dir="ltr">${i + 1} / ${queue.length}</span><i class="th-lost-bar gp-bar"><b style="width:${Math.round((100 * i) / queue.length)}%"></b></i><button type="button" class="btn icon sm ghost" id="gpQuit" aria-label="إنهاء">✕</button></div>`;
    const tail = '<div class="feedback" id="gpFb"></div><div class="next-wrap"><button type="button" class="btn primary hidden" id="gpNext">التالي ←</button></div>';
    if (q.build) {
      stage.innerHTML = `<div class="card question">${head}${q.prompt}<div class="gp-built en" dir="ltr" id="gpBuilt"></div>
        <div class="gp-bank en" dir="ltr" id="gpBank">${q.build.shuffled.map((t) => `<button type="button" class="gp-tok" data-i="${t.i}">${esc(t.w)}</button>`).join('')}</div>
        <div class="btn-row"><button type="button" class="btn ghost sm" id="gpUndo">↶ تراجع</button></div>${tail}</div>`;
      const built = [];
      const draw = () => {
        stage.querySelector('#gpBuilt').innerHTML = built.map((t) => `<span class="gp-tok on">${esc(t.w)}</span>`).join('') || '<span class="tiny muted">اضغط الكلمات بالترتيب…</span>';
        stage.querySelectorAll('#gpBank .gp-tok').forEach((b) => { b.disabled = built.some((t) => t.i === Number(b.dataset.i)); });
        if (built.length === q.build.words.length) {
          const right = built.map((t) => t.w).join(' ') === q.build.words.join(' ');
          stage.querySelectorAll('#gpBank .gp-tok, #gpUndo').forEach((b) => { b.disabled = true; });
          stage.querySelector('#gpBuilt').classList.add(right ? 'ok' : 'no');
          if (!right) stage.querySelector('#gpBuilt').insertAdjacentHTML('afterend', `<p class="en tiny" dir="ltr">الصحيح: <b>${esc(q.build.words.join(' '))}</b></p>`);
          settle(q, right);
        }
      };
      stage.querySelector('#gpBank').addEventListener('click', (e) => { const b = e.target.closest('.gp-tok'); if (!b || b.disabled) return; built.push(q.build.shuffled.find((t) => t.i === Number(b.dataset.i))); draw(); });
      stage.querySelector('#gpUndo').addEventListener('click', () => { built.pop(); draw(); });
      draw();
    } else {
      stage.innerHTML = `<div class="card question">${head}${q.prompt}${q.say ? `<div class="q-say"><button type="button" class="btn icon sm ghost" data-say="${esc(q.say)}" data-rate="1" aria-label="استمع">🔊</button></div>` : ''}
        <div class="options">${q.opts.map((o, k) => `<button type="button" class="option${q.ltr ? ' en' : ''}" data-k="${k}" ${q.ltr ? 'dir="ltr"' : ''}>${esc(o.t)}</button>`).join('')}</div>${tail}</div>`;
      stage.querySelectorAll('.option').forEach((btn) => btn.addEventListener('click', () => {
        const right = q.opts[Number(btn.dataset.k)].right;
        stage.querySelectorAll('.option').forEach((b) => { b.disabled = true; if (q.opts[Number(b.dataset.k)].right) b.classList.add('correct'); });
        if (!right) btn.classList.add('wrong');
        settle(q, right);
      }));
    }
    stage.querySelector('#gpQuit')?.addEventListener('click', () => { if (confirm('تنهي الجولة؟')) { alive = false; onExit?.(); } });
  }
  step();
  return () => { alive = false; };
}

// ---------- the «القواعد» section of the practice page ----------
export function renderGrammarSection(stage) {
  let cat = '';
  let n = 10;
  let stop = null;
  const draw = () => {
    stage.innerHTML = `<div class="card pb gp-home">
      <p class="muted" style="margin:0">تعلّم القواعد وتدرّب عليها: كل سؤال يعلّمك القاعدة بعد جوابك (فايدتها وتركيبها ومثال بالعربي).</p>
      <div class="gp-filters">
        <label class="field"><span class="tiny muted">القواعد</span><select class="input" id="gpCat"><option value="">كل القواعد (${RULES.length})</option>${GRAMMAR.map((c) => `<option value="${c.id}" ${cat === c.id ? 'selected' : ''}>${c.n}. ${esc(c.ar)} (${c.subs.length})</option>`).join('')}</select></label>
        <label class="field"><span class="tiny muted">عدد الأسئلة</span><select class="input" id="gpN">${[10, 15, 20, 30].map((x) => `<option ${n === x ? 'selected' : ''}>${x}</option>`).join('')}</select></label></div>
      <div class="gp-games">${[MIXED, ...GRAMMAR_GAMES].map((g) => `<button type="button" class="game-card gp-game" data-g="${g.key}"><span class="gp-ic" aria-hidden="true">${g.icon}</span><b>${esc(g.name)}</b><span class="tiny muted">${esc(g.desc)}</span></button>`).join('')}</div>
      <a class="btn ghost" href="#/words?tab=grammar" style="justify-self:start">📚 مكتبة قواعدي</a></div>`;
    stage.querySelector('#gpCat').addEventListener('change', (e) => { cat = e.target.value; });
    stage.querySelector('#gpN').addEventListener('change', (e) => { n = Number(e.target.value); });
    stage.querySelector('.gp-games').addEventListener('click', (e) => {
      const b = e.target.closest('[data-g]');
      if (!b) return;
      stop = runGrammarRound(stage, { game: b.dataset.g, catId: cat, n, onExit: draw });
    });
  };
  draw();
  return () => stop?.();
}
