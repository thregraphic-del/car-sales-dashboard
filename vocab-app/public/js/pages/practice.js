// تدرّب — one place to practise. The system chooses the words (mistakes first,
// then due, then difficult, then new); the learner just presses start.
// After every round, missed words can be replayed immediately.
import { api } from '../api.js';
import { state, loadGroups } from '../state.js';
import { esc, icon, emptyState } from '../ui.js';
import { runQuiz, TYPES, canPlay } from '../quiz.js';
import { runFlashcards } from '../flashcards.js';
import { runListening } from '../listen.js';
import { refreshStats } from '../app.js';

const MODES = [
  ['quiz', 'اختبار', 'game'],
  ['cards', 'بطاقات', 'cards'],
  ['listen', 'استماع', 'headphones'],
];
const FOCUS = [
  ['smart', 'اختيار ذكي'],
  ['difficult', 'تحتاج تدريب'],
  ['due', 'للمراجعة'],
  ['new', 'جديدة'],
];

const href = (p) => `#/practice?${new URLSearchParams(Object.entries(p).filter(([, v]) => v !== undefined && v !== null && v !== ''))}`;

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
  if (params.session === 'today') {
    const { plan } = await api.today();
    words = plan.items.filter((i) => !i.completed);
    distractors = (await api.practice({ size: 1 })).distractors;
    label = 'جلسة اليوم';
  } else {
    const r = await api.practice({ ids: params.ids, group_id: group, focus, size: 10 });
    words = r.words;
    distractors = r.distractors;
    if (params.ids) label = params.replay ? 'الكلمات التي أخطأت فيها' : 'كلمات مختارة';
  }
  const groupObj = state.groups.find((g) => g.id === group);
  if (groupObj) label = `مجموعة: ${groupObj.name}`;

  const base = { mode, focus: params.ids || params.session ? undefined : focus, group: group || undefined, ids: params.ids, session: params.session, replay: params.replay, type: type !== 'mixed' ? type : undefined };

  view.innerHTML = `
    <div class="page-head compact"><div><h1>تدرّب</h1></div>
      <div class="segmented mode-tabs">${MODES.map(([k, l, ic]) => `<a class="${k === mode ? 'active' : ''}" href="${href({ ...base, mode: k })}">${icon[ic]} ${l}</a>`).join('')}</div>
    </div>
    ${label ? `<div class="chip-row"><span class="gchip on">${esc(label)}</span><a class="link-btn" href="${href({ mode })}">✕ اختيار ذكي بدلًا منها</a></div>`
      : `<div class="chip-row">${FOCUS.map(([k, l]) => `<a class="tab ${k === focus ? 'active' : ''}" href="${href({ ...base, focus: k })}">${l}</a>`).join('')}
        ${state.groups.length ? `<span class="tiny muted" style="margin-inline-start:6px">أو مجموعة:</span>${state.groups.map((g) => `<a class="gchip" href="${href({ mode, group: g.id })}">${esc(g.name)}</a>`).join('')}` : ''}</div>`}
    <div id="stage"></div>`;
  const stage = view.querySelector('#stage');

  if (!words.length) {
    stage.innerHTML = emptyState('✨', focus === 'due' ? 'لا شيء للمراجعة الآن' : 'لا توجد كلمات هنا', 'جرّب الاختيار الذكي، أو أضف كلمات جديدة.',
      `<div class="btn-row" style="justify-content:center"><a class="btn primary" href="${href({ mode })}">اختيار ذكي</a><a class="btn" href="#/add">${icon.plus} أضف كلمات</a></div>`);
    return;
  }

  /* ----------------------------------------------------------- ready */
  const start = () => {
    if (mode === 'cards') {
      cleanup = runFlashcards(stage, words, {
        source: params.session === 'today' ? 'today' : 'flashcard',
        doneActions: `<a class="btn" href="${href({ ...base, mode: 'quiz' })}">${icon.game} اختبار على نفس الكلمات</a><a class="btn ghost" href="#/">انتهيت</a>`,
      });
      return;
    }
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
        <div class="game-top"><span class="small muted">${type === 'mixed' ? 'أسئلة متنوعة' : TYPES[type].name}</span><span class="score-pill" id="score">✅ 0 · ❌ 0</span></div>
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

  function summary({ correct, wrong, missed }) {
    const total = correct + wrong;
    const replay = params.replay || params.ids;
    stage.innerHTML = `
      <div class="card done-panel">
        <div class="big">${!missed.length ? '🏆' : correct >= wrong ? '👏' : '💪'}</div>
        <h2 style="margin:10px 0 4px">${correct} من ${total} صحيحة</h2>
        ${missed.length ? `
          <div class="replay-box">
            <b>فاتتك ${missed.length} ${missed.length === 1 ? 'كلمة' : 'كلمات'}</b>
            <div class="missed-list">${missed.map((m) => `<span><b class="en-inline">${esc(m.term)}</b> <span class="small ink-2">${esc(m.arabic || '')}</span></span>`).join('')}</div>
            <a class="btn primary lg" href="${href({ mode: 'quiz', ids: missed.map((m) => m.uv_id).join(','), replay: 1 })}">${icon.repeat} تدرّب عليها الآن</a>
            <p class="tiny muted" style="margin-top:8px">ستعود هذه الكلمات أيضًا في خطتك خلال الأيام القادمة.</p>
          </div>`
          : `<p class="ink-2">${replay ? 'ممتاز — أجبت عن كل الكلمات التي أخطأت فيها.' : 'ممتاز! ستتباعد مراجعة هذه الكلمات.'}</p>`}
        <div class="btn-row" style="justify-content:center;margin-top:18px">
          <a class="btn" href="${href({ mode: 'quiz' })}">${icon.game} جولة جديدة</a>
          <a class="btn ghost" href="#/">انتهيت</a>
        </div>
      </div>`;
  }

  // Skip the "ready" screen when the learner already chose (today's session / replay).
  if (params.session || params.replay || (params.ids && mode !== 'quiz')) {
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
