// 🎯 Today's goal — the learner picks what counts (kept on this device, no server work):
//   pass     = new words that go by in a video or text (no need to open them)
//   watch    = minutes of watching
//   practice = answers in practice (cards, quizzes, games)
// Each kind is counted all the time; only the chosen one is the goal.

export const GOAL_TYPES = {
  pass: { label: 'أمرّ على كلمات جديدة', short: 'كلمات مرّت', unit: 'كلمة', def: 15, min: 3, max: 500, note: 'كل كلمة جديدة تمر عليك في مقطع أو نص — بدون ما تفتحها' },
  watch: { label: 'أشاهد مدة', short: 'دقائق مشاهدة', unit: 'دقيقة', def: 10, min: 1, max: 300, note: 'دقائق تشغيل المقطع فعليًا — لو حاب تتعرّض للغة بس' },
  practice: { label: 'أتدرّب على عدد', short: 'إجابات تدريب', unit: 'سؤال', def: 20, min: 3, max: 500, note: 'كل إجابة في البطاقات والاختبار والألعاب' },
};

const get = (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
const put = (k, v) => { try { localStorage.setItem(k, String(v)); } catch { /* storage off */ } };

/** Today in the learner's own calendar (local time). */
export const dayStr = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function goalCfg() {
  const type = GOAL_TYPES[get('goal.type', '')] ? get('goal.type', '') : 'pass';
  const t = GOAL_TYPES[type];
  const n = Math.max(t.min, Math.min(t.max, Math.round(Number(get(`goal.n.${type}`, t.def))) || t.def));
  return { type, n, ...t };
}

export function setGoal(type, n) {
  if (!GOAL_TYPES[type]) return;
  const t = GOAL_TYPES[type];
  put('goal.type', type);
  put(`goal.n.${type}`, Math.max(t.min, Math.min(t.max, Math.round(Number(n)) || t.def)));
  window.dispatchEvent(new CustomEvent('lexitube:goal-progress', { detail: progress() }));
}

const passKey = () => `lt.passed.${dayStr()}`;
const passedSet = () => { try { return new Set(JSON.parse(get(passKey(), '[]'))); } catch { return new Set(); } };

/** How far today's chosen goal is. */
export function progress() {
  const cfg = goalCfg();
  const counts = {
    pass: passedSet().size,
    watch: Math.floor(Number(get(`lt.watch.${dayStr()}`, 0)) / 60),
    practice: Number(get(`lt.answers.${dayStr()}`, 0)) || 0,
  };
  const count = counts[cfg.type];
  return { ...cfg, count, counts, done: count >= cfg.n, pct: Math.min(100, Math.round((100 * count) / cfg.n)) };
}

// fires once when the chosen goal is reached today
function after(before) {
  const now = progress();
  window.dispatchEvent(new CustomEvent('lexitube:goal-progress', { detail: now }));
  if (!before.done && now.done && get('goal.reached', '') !== `${dayStr()}:${now.type}`) {
    put('goal.reached', `${dayStr()}:${now.type}`);
    window.dispatchEvent(new CustomEvent('lexitube:goal-reached', { detail: now }));
  }
}

/** A new word went by (each counts once a day). */
export function notePassed(vocabularyId) {
  const s = passedSet();
  if (s.has(vocabularyId)) return;
  const before = progress();
  s.add(vocabularyId);
  put(passKey(), JSON.stringify([...s].slice(-5000)));
  after(before);
}

/** Seconds of real playing. */
export function noteWatched(seconds) {
  if (!(seconds > 0)) return;
  const before = progress();
  const k = `lt.watch.${dayStr()}`;
  put(k, Number(get(k, 0)) + Math.min(seconds, 30));
  if (Math.floor(Number(get(k, 0)) / 60) !== before.counts.watch) after(before);
}

/** One practice answer. */
export function noteAnswer() {
  const before = progress();
  const k = `lt.answers.${dayStr()}`;
  put(k, (Number(get(k, 0)) || 0) + 1);
  after(before);
}

/** «🎯 3 / 15 كلمة» */
export const goalText = (p = progress()) => `🎯 ${p.count} / ${p.n} ${p.unit}${p.done ? ' ✓' : ''}`;
