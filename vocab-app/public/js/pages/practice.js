// تدرّب — one place to practise. The system chooses the words (mistakes first,
// then due, then difficult, then new); the learner just presses start.
// After every round, missed words can be replayed immediately.
import { api } from '../api.js';
import { state, loadGroups } from '../state.js';
import { esc, icon, emptyState, openModal, levelChip, usageDot } from '../ui.js';
import { runQuiz, TYPES, canPlay, GAME_ORDER } from '../quiz.js';
import { runFlashcards } from '../flashcards.js';
import { runListening } from '../listen.js';
import { runStory } from '../story.js';
import { refreshStats } from '../app.js';

const MODES = [
  ['quiz', 'اختبار', 'check'],
  ['games', 'ألعاب', 'game'],
  ['cards', 'بطاقات', 'cards'],
  ['listen', 'استماع', 'headphones'],
  ['story', 'قصة', 'book'],
];
const FOCUS = [
  ['smart', 'اختيار ذكي'],
  ['difficult', 'تحتاج تدريب'],
  ['due', 'للمراجعة'],
  ['new', 'جديدة'],
];

const href = (p) => `#/practice?${new URLSearchParams(Object.entries(p).filter(([, v]) => v !== undefined && v !== null && v !== ''))}`;

const seenKey = (id) => `practice.seen.${id}`;
function seenOf(id) {
  try { return new Set(JSON.parse(sessionStorage.getItem(seenKey(id)) || '[]')); } catch { return new Set(); }
}
function saveSeen(id, set) {
  try { sessionStorage.setItem(seenKey(id), JSON.stringify([...set].slice(-2000))); } catch { /* storage unavailable */ }
}

export async function render(view, { params }) {
  await loadGroups();
  const mode = params.mode || (params.session === 'today' ? 'cards' : 'quiz');
  const focus = params.focus || 'smart';
  const group = params.group ? Number(params.group) : null;
  const type = params.type || 'mixed';
  let cleanup = null;

  // Which words? Today's session / explicit ids (replay) / group / focus.
  let words;
  let distractors;
  let label = null;
  if (mode === 'story') {
    words = [];
    distractors = [];
  } else if (params.session === 'today') {
    const { plan } = await api.today();
    words = plan.items.filter((i) => !i.completed);
    distractors = (await api.practice({ size: 1 })).distractors;
    label = 'جلسة اليوم';
  } else {
    const r = await api.practice({ ids: params.ids, group_id: group, source_id: params.source, vids: params.vids, seen: params.source && !params.vids ? [...seenOf(params.source)].slice(-600).join(',') || undefined : undefined, focus, size: params.source ? 15 : 10 });
    words = r.words;
    if (params.source && !params.vids) {
      // remember what was practised so "15 more" brings new words
      const seen = r.remaining ? seenOf(params.source) : new Set();
      for (const w of words) seen.add(w.vocabulary_id);
      saveSeen(params.source, seen);
    }
    distractors = r.distractors;
    if (params.ids) label = params.yesterday ? 'كلمات أمس' : params.replay ? 'الكلمات التي أخطأت فيها' : 'كلمات مختارة';
  }
  const groupObj = state.groups.find((g) => g.id === group);
  if (groupObj) label = `مجموعة: ${groupObj.name}`;

  if (params.source) label = `${params.vids ? 'كلمات مختارة من المقطع' : 'كلمات المقطع'}${params.title ? `: ${params.title}` : ''}`;
  const base = { mode, focus: params.ids || params.session || params.source ? undefined : focus, group: group || undefined, ids: params.ids, session: params.session, replay: params.replay, source: params.source, vids: params.vids, title: params.title, type: type !== 'mixed' ? type : undefined };

  view.innerHTML = `
    <div class="page-head compact"><div><h1>تدرّب</h1></div>
      <div class="segmented mode-tabs">${MODES.map(([k, l, ic]) => `<a class="${k === mode ? 'active' : ''}" href="${href({ ...base, mode: k })}">${icon[ic]} ${l}</a>`).join('')}</div>
    </div>
    ${label ? `<div class="chip-row"><span class="gchip on">${esc(label)}</span>${params.source ? `<a class="link-btn" href="#/source/${esc(params.source)}">↩ رجوع للمقطع</a>` : `<a class="link-btn" href="${href({ mode })}">✕ اختيار ذكي بدلًا منها</a>`}</div>`
      : `<div class="chip-row">${mode === 'story' ? `<a class="tab active" href="${href({ mode })}">كلماتي الأخيرة</a>` : FOCUS.map(([k, l]) => `<a class="tab ${k === focus ? 'active' : ''}" href="${href({ ...base, focus: k })}">${l}</a>`).join('') + '<button type="button" class="tab pf-open-btn" id="pfOpen">🎛 فلترة دقيقة</button>'}
        ${state.groups.length > 6 ? `<select class="input sm group-select" id="groupSelect" aria-label="مجموعة"><option value="">أو اختر مجموعة…</option>${state.groups.map((g) => `<option value="${g.id}">${esc(g.name)}</option>`).join('')}</select>`
    : state.groups.length ? `<span class="tiny muted" style="margin-inline-start:6px">أو مجموعة:</span>${state.groups.map((g) => `<a class="gchip" href="${href({ mode, group: g.id })}">${esc(g.name)}</a>`).join('')}` : ''}</div>`}
    <div id="stage"></div>`;
  const stage = view.querySelector('#stage');
  view.querySelector('#pfOpen')?.addEventListener('click', () => openFilter(mode));
  view.querySelector('#groupSelect')?.addEventListener('change', (e) => {
    if (e.target.value) location.hash = href({ mode, group: e.target.value });
  });

  if (mode === 'story') {
    const stopStory = runStory(stage, { groupId: group, label: groupObj ? `مجموعة «${groupObj.name}»` : 'كلماتك الأخيرة' });
    return () => stopStory();
  }

  if (!words.length) {
    stage.innerHTML = emptyState('✨', focus === 'due' ? 'لا شيء للمراجعة الآن' : 'لا توجد كلمات هنا', 'جرّب الاختيار الذكي، أو أضف كلمات جديدة.',
      `<div class="btn-row" style="justify-content:center"><a class="btn primary" href="${href({ mode })}">اختيار ذكي</a><a class="btn" href="#/add">${icon.plus} أضف كلمات</a></div>`);
    return;
  }

  /* ----------------------------------------------------------- games */
  if (mode === 'games' && type === 'mixed') {
    stage.innerHTML = `
      <p class="small ink-2" style="margin-bottom:12px">كل لعبة تستخدم ${words.length} ${words.length === 1 ? 'كلمة' : 'كلمات'} من كلماتك — الأخطاء الحديثة والصعبة أولًا، وكل إجابة تحدّث جدول المراجعة.</p>
      <div class="game-grid">${GAME_ORDER.map((k) => {
        const playable = words.filter((w) => canPlay(k, w)).length;
        return `<a class="card game-card ${playable ? '' : 'off'}" href="${playable ? href({ ...base, mode: 'games', type: k }) : '#'}" style="text-decoration:none">
          <div class="row between"><div class="game-icon">${icon[TYPES[k].icon]}</div><span class="tiny muted en-inline">${TYPES[k].en}</span></div>
          <h3 style="font-size:16.5px">${TYPES[k].name}</h3><p class="small muted">${TYPES[k].description}</p>
          ${playable ? '' : '<span class="tiny muted">لا توجد كلمات مناسبة هنا</span>'}</a>`;
      }).join('')}</div>`;
    return;
  }

  /* ----------------------------------------------------------- ready */
  const start = () => {
    if (mode === 'cards') {
      cleanup = runFlashcards(stage, words, {
        source: params.session === 'today' ? 'today' : 'flashcard',
        doneActions: params.source ? sourceActions() : `<a class="btn" href="${href({ ...base, mode: 'quiz' })}">${icon.game} اختبار على نفس الكلمات</a><a class="btn ghost" href="#/practice">انتهيت</a>`,
        hardHref: params.source ? (list) => href({ ...base, mode: 'cards', vids: list.map((m) => m.vocabulary_id).join(','), n: Date.now() }) : null,
      });
      return;
    }
    if (mode === 'games') return runRound(words);
    if (mode === 'listen') {
      cleanup = runListening(stage, words);
      return;
    }
    runRound(words);
  };

  async function runRound(list) {
    const playable = list.filter((w) => canPlay(type, w));
    stage.innerHTML = `
      <div class="game-stage">
        <div class="game-top"><span class="small muted">${type === 'mixed' ? 'أسئلة متنوعة' : TYPES[type].name}${mode === 'games' ? ` · <a class="link-btn" href="${href({ ...base, mode: 'games', type: undefined })}">كل الألعاب</a>` : ''}</span><span class="score-pill" id="score">✅ 0 · ❌ 0</span></div>
        <div class="bar" style="margin-bottom:18px"><span id="gbar" style="width:0%"></span></div>
        <div id="q"></div>
      </div>`;
    const q = stage.querySelector('#q');
    const result = await runQuiz(q, {
      words: playable.length ? playable : list,
      distractors,
      type: playable.length ? type : 'mixed',
      onProgress: (done, total, score) => {
        const bar = stage.querySelector('#gbar');
        if (!bar) return;
        bar.style.width = `${Math.round((100 * done) / total)}%`;
        stage.querySelector('#score').textContent = `✅ ${score.correct} · ❌ ${score.wrong}`;
      },
    });
    if (!view.isConnected) return;
    refreshStats();
    summary(result);
  }

  function summary({ correct, wrong, missed, points }) {
    const total = correct + wrong;
    const replay = params.replay || params.ids;
    stage.innerHTML = `
      <div class="card done-panel">
        <div class="big">${!missed.length ? '🏆' : correct >= wrong ? '👏' : '💪'}</div>
        <h2 style="margin:10px 0 4px">${correct} من ${total} صحيحة</h2>
        ${points !== undefined ? `<p class="ink-2">⭐ نقاطك في تحدّي الدقيقة: <b>${points}</b></p>` : ''}
        ${missed.length ? `
          <div class="replay-box">
            <b>فاتتك ${missed.length} ${missed.length === 1 ? 'كلمة' : 'كلمات'}</b>
            <div class="missed-list">${missed.map((m) => `<span><b class="en-inline">${esc(m.term)}</b> <span class="small ink-2">${esc(m.arabic || '')}</span></span>`).join('')}</div>
            <a class="btn primary lg" href="${href({ mode: 'quiz', ids: missed.map((m) => m.uv_id).join(','), replay: 1 })}">${icon.repeat} تدرّب عليها الآن</a>
            <p class="tiny muted" style="margin-top:8px">ستعود هذه الكلمات أيضًا في خطتك خلال الأيام القادمة.</p>
          </div>`
          : `<p class="ink-2">${replay ? 'ممتاز — أجبت عن كل الكلمات التي أخطأت فيها.' : 'ممتاز! ستتباعد مراجعة هذه الكلمات.'}</p>`}
        <div class="btn-row" style="justify-content:center;margin-top:18px">
          ${params.source ? sourceActions(missed) : `${mode === 'games' ? `<a class="btn" href="${href({ ...base, mode: 'games', type: undefined })}">${icon.game} لعبة أخرى</a>` : ''}
          <a class="btn" href="${href(mode === 'games' ? { ...base, mode: 'games', ids: undefined, replay: undefined } : { mode: 'quiz' })}">${icon.repeat} ${mode === 'games' ? 'العب مجددًا' : 'جولة جديدة'}</a>
          <a class="btn ghost" href="#/practice">انتهيت</a>`}
        </div>
      </div>`;
  }

  // End of a round on a video's words: back to the video, 15 more, or the hard ones again.
  function sourceActions(missed = []) {
    const back = `<a class="btn primary" href="#/source/${esc(params.source)}">↩ رجوع للمقطع</a>`;
    const more = `<a class="btn" href="${href({ ...base, vids: undefined, n: Date.now() })}">➕ ١٥ كلمة أخرى</a>`;
    const hard = missed.length ? `<a class="btn" href="${href({ ...base, vids: missed.map((m) => m.vocabulary_id).join(','), n: Date.now() })}">${icon.repeat} راجع الصعب (${missed.length})</a>` : '';
    return back + more + hard;
  }

  // Skip the "ready" screen when the learner already chose (today's session / replay).
  if (params.session || params.replay || params.vids || params.n || (params.ids && mode !== 'quiz') || mode === 'games') {
    start();
  } else {
    stage.innerHTML = `
      <div class="card ready-card">
        <div><b style="font-size:18px">${words.length} ${words.length === 1 ? 'كلمة جاهزة' : 'كلمات جاهزة'}</b>
          <p class="small ink-2" style="margin-top:4px">${focus === 'smart' && !label ? 'اخترناها لك: أخطاء حديثة أولًا، ثم المستحقة، ثم الصعبة، ثم الجديدة.' : ''}</p>
          <div class="word-peek en">${words.slice(0, 10).map((w) => `<span>${esc(w.term)}</span>`).join('')}</div></div>
        <div class="stack" style="gap:8px;justify-items:end">
          <button class="btn primary lg" id="go">ابدأ ←</button>
          ${mode === 'quiz' ? `<select class="input sm-select" id="type" aria-label="نوع الأسئلة">
            <option value="mixed">أسئلة متنوعة (مستحسن)</option>${Object.entries(TYPES).map(([k, t]) => `<option value="${k}" ${k === type ? 'selected' : ''}>${t.name}</option>`).join('')}</select>` : ''}
        </div>
      </div>`;
    stage.querySelector('#go').addEventListener('click', start);
    stage.querySelector('#type')?.addEventListener('change', (e) => {
      location.hash = href({ ...base, type: e.target.value === 'mixed' ? undefined : e.target.value });
    });
  }
  return () => cleanup?.();
}

/* 🎛 Exact choice of the words to practise, with filters like «كلماتي». */
async function openFilter(mode0) {
  const all = await api.words();
  const DAY = 86400000;
  const today0 = (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); })();
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem('practice.filter') || '{}'); } catch { /* none */ }
  const F = { when: 'all', from: '', to: '', groups: [], source: '', levels: [], usage: [], status: 'all', count: 'all', n: 20, sort: 'new', mode: ['cards', 'quiz', 'games', 'listen'].includes(mode0) ? mode0 : 'cards', ...saved };
  const sources = [...new Map(all.filter((w) => w.source?.id).map((w) => [w.source.id, w.source])).values()];
  const chips = (name, opts, multi) => opts.map(([k, l]) => `<button type="button" class="sopt" data-f="${name}" data-v="${esc(String(k))}" data-multi="${multi ? 1 : 0}">${l}</button>`).join('');
  const box = openModal(`<div class="pf">
    <div class="rset-title">🎛 اختر كلمات التدريب</div>
    <div class="srow"><span class="slabel">الوقت</span><div class="sopts">${chips('when', [['all', 'الكل'], ['today', 'اليوم'], ['yesterday', 'أمس'], ['week', 'آخر أسبوع'], ['month', 'آخر شهر'], ['range', 'من–إلى']])}
      <span class="pf-dates"><input class="input sopt-num" style="width:140px" type="date" id="fFrom" value="${esc(F.from)}"> – <input class="input sopt-num" style="width:140px" type="date" id="fTo" value="${esc(F.to)}"></span></div></div>
    ${state.groups.length ? `<div class="srow"><span class="slabel">المجموعة</span><div class="sopts">${chips('groups', state.groups.map((g) => [g.id, esc(g.name)]), true)}</div></div>` : ''}
    ${sources.length ? `<div class="srow"><span class="slabel">المقطع</span><div class="sopts"><select class="input sm" id="fSource" style="max-width:100%"><option value="">كل المقاطع</option>${sources.map((x) => `<option value="${x.id}" ${String(F.source) === String(x.id) ? 'selected' : ''}>${esc(x.title.slice(0, 50))}</option>`).join('')}</select></div></div>` : ''}
    <div class="srow"><span class="slabel">المستوى</span><div class="sopts">${chips('levels', ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].map((l) => [l, l]), true)}</div></div>
    <div class="srow"><span class="slabel">الشيوع</span><div class="sopts">${chips('usage', [['common', '🟢 شائعة'], ['medium', '🟡 متوسطة'], ['rare', '🔴 نادرة']], true)}</div></div>
    <div class="srow"><span class="slabel">الحالة</span><div class="sopts">${chips('status', [['all', 'الكل'], ['new', 'جديدة'], ['practice', 'تحتاج تدريب'], ['due', 'للمراجعة'], ['mastered', 'متقنة']])}</div></div>
    <div class="srow"><span class="slabel">العدد</span><div class="sopts">${chips('count', [['all', 'الكل'], ['first', 'أول'], ['last', 'آخر'], ['random', 'عشوائي']])}<input class="input sopt-num" id="fN" type="number" min="1" value="${F.n}"> <span class="tiny">كلمة</span></div></div>
    <div class="srow"><span class="slabel">الترتيب</span><div class="sopts">${chips('sort', [['new', 'الأحدث'], ['old', 'الأقدم'], ['az', 'أبجدي'], ['hard', 'الأصعب']])}</div></div>
    <div class="srow"><span class="slabel">التمرين</span><div class="sopts">${chips('mode', [['cards', '🃏 بطاقات'], ['quiz', '✅ اختبار'], ['games', '🎮 ألعاب'], ['listen', '🎧 استماع']])}</div></div>
    <div class="pf-res"><b id="fCount"></b> <button type="button" class="link-btn" id="fAll">تحديد الكل</button> · <button type="button" class="link-btn" id="fNone">إلغاء الكل</button></div>
    <div class="pf-list" id="fList"></div>
    <div class="btn-row"><a class="btn primary" id="fGo">ابدأ</a><button type="button" class="btn ghost" data-close>إغلاق</button></div></div>`);
  const off = new Set();
  const inWhen = (w) => {
    const t = new Date(w.saved_at).getTime();
    if (F.when === 'today') return t >= today0;
    if (F.when === 'yesterday') return t >= today0 - DAY && t < today0;
    if (F.when === 'week') return t >= today0 - 6 * DAY;
    if (F.when === 'month') return t >= today0 - 29 * DAY;
    if (F.when === 'range') return (!F.from || t >= new Date(F.from).getTime()) && (!F.to || t < new Date(F.to).getTime() + DAY);
    return true;
  };
  let randomOrder = new Map();
  const pick = () => {
    let list = all.filter((w) => inWhen(w)
      && (!F.groups.length || F.groups.some((g) => w.group_ids.includes(Number(g))))
      && (!F.source || w.source?.id === Number(F.source))
      && (!F.levels.length || F.levels.includes(w.level))
      && (!F.usage.length || F.usage.includes(w.usage))
      && (F.status === 'all' || (F.status === 'new' && w.status === 'new') || (F.status === 'practice' && (w.difficult || w.due)) || (F.status === 'due' && w.due) || (F.status === 'mastered' && w.status === 'mastered')));
    const sorters = { new: (a, b) => new Date(b.saved_at) - new Date(a.saved_at), old: (a, b) => new Date(a.saved_at) - new Date(b.saved_at), az: (a, b) => a.term.localeCompare(b.term), hard: (a, b) => (b.difficulty || 0) - (a.difficulty || 0) || a.mastery - b.mastery };
    list.sort(sorters[F.sort] || sorters.new);
    const n = Math.max(1, Number(F.n) || 20);
    if (F.count === 'first') list = list.slice(0, n);
    if (F.count === 'last') list = list.slice(-n);
    if (F.count === 'random') {
      list.forEach((w) => { if (!randomOrder.has(w.uv_id)) randomOrder.set(w.uv_id, Math.random()); });
      list = [...list].sort((a, b) => randomOrder.get(a.uv_id) - randomOrder.get(b.uv_id)).slice(0, n);
    }
    return list;
  };
  const draw = () => {
    box.querySelectorAll('[data-f]').forEach((b) => {
      const v = F[b.dataset.f];
      b.classList.toggle('active', Array.isArray(v) ? v.map(String).includes(b.dataset.v) : String(v) === b.dataset.v);
    });
    box.querySelector('.pf-dates').classList.toggle('hidden', F.when !== 'range');
    const list = pick();
    const chosen = list.filter((w) => !off.has(w.uv_id)).slice(0, 1000);
    box.querySelector('#fCount').textContent = `${chosen.length} كلمة`;
    box.querySelector('#fList').innerHTML = list.map((w) => `<label class="pf-item"><input type="checkbox" class="check" data-pv="${w.uv_id}" ${off.has(w.uv_id) ? '' : 'checked'}> ${usageDot(w.usage)}<b class="en">${esc(w.term)}</b> ${levelChip(w.level)} <span class="tiny ink-2">${esc(w.arabic || '')}</span></label>`).join('') || '<p class="small muted">لا توجد كلمات بهذه الفلاتر.</p>';
    const go = box.querySelector('#fGo');
    go.href = href({ mode: F.mode, ids: chosen.map((w) => w.uv_id).join(','), n: Date.now() });
    go.classList.toggle('disabled', !chosen.length);
    try { localStorage.setItem('practice.filter', JSON.stringify({ ...F, from: F.from, to: F.to })); } catch { /* storage unavailable */ }
  };
  box.addEventListener('click', (e) => {
    const b = e.target.closest('[data-f]');
    if (b) {
      const k = b.dataset.f;
      if (b.dataset.multi === '1') F[k] = F[k].map(String).includes(b.dataset.v) ? F[k].filter((x) => String(x) !== b.dataset.v) : [...F[k], b.dataset.v];
      else F[k] = b.dataset.v;
      off.clear();
      return draw();
    }
    if (e.target.closest('#fAll')) { off.clear(); return draw(); }
    if (e.target.closest('#fNone')) { pick().forEach((w) => off.add(w.uv_id)); return draw(); }
    if (e.target.closest('#fGo') && box.querySelector('#fGo').classList.contains('disabled')) e.preventDefault();
  });
  box.addEventListener('change', (e) => {
    const c = e.target.closest('[data-pv]');
    if (c) { const v = Number(c.dataset.pv); if (c.checked) off.delete(v); else off.add(v); return draw(); }
    if (e.target.id === 'fFrom') F.from = e.target.value;
    if (e.target.id === 'fTo') F.to = e.target.value;
    if (e.target.id === 'fN') { F.n = Number(e.target.value) || 20; randomOrder = new Map(); }
    if (e.target.id === 'fSource') F.source = e.target.value;
    draw();
  });
  draw();
}
