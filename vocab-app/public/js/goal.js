// 🎯 Today's goal — kept on this device, no server work. The learner picks ONE goal or SEVERAL (a combined goal):
//   pass     = new words that go by in a video or text (no need to open them)
//   practice = answers in word practice (cards, quizzes, games)
//   watch    = minutes of watching
//   rules    = grammar rules / examples met today (a rule opened, or a grammar-practice question)
// Everything is counted all the time; the chosen ones are the goal. With several chosen, the day is done when ALL are reached.

export const GOAL_TYPES = {
  pass: { label: 'أمرّ على كلمات جديدة', short: 'كلمات مرّت', unit: 'كلمة', def: 15, min: 3, max: 500, note: 'كل كلمة جديدة تمر عليك في مقطع أو نص — بدون ما تفتحها' },
  practice: { label: 'أتدرّب على كلمات', short: 'إجابات تدريب', unit: 'سؤال', def: 20, min: 3, max: 500, note: 'كل إجابة في بطاقات وألعاب الكلمات' },
  watch: { label: 'أقضي وقتًا في الموقع', short: 'دقائق تعلّم', unit: 'دقيقة', def: 20, min: 1, max: 600, note: 'كل وقت نشاطك في الموقع: مشاهدة وتدريب ومراجعة وتنقل — يتوقف العدّ لما تسكت أكثر من دقيقتين' },
  rules: { label: 'أمرّ على قواعد وأمثلة', short: 'قواعد وأمثلة', unit: 'قاعدة', def: 10, min: 1, max: 300, note: 'كل قاعدة أو مثال تفتحه أو تتدرّب عليه في القواعد (مرة باليوم لكل واحدة)' },
};
const ORDER = ['pass', 'practice', 'watch', 'rules'];

const get = (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
const put = (k, v) => { try { localStorage.setItem(k, String(v)); } catch { /* storage off */ } };

/** Today in the learner's own calendar (local time). */
export const dayStr = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const clampN = (type, n) => {
  const t = GOAL_TYPES[type];
  return Math.max(t.min, Math.min(t.max, Math.round(Number(n)) || t.def));
};

/** The number the learner set (or the default) for one kind of goal. */
export const ADVANCED_GOALS = ['watch', 'rules']; // switched on from the general settings
export const goalFor = (type) => clampN(type, get(`goal.n.${type}`, GOAL_TYPES[type].def));

/** The chosen kinds (one or several). An old single choice (`goal.type`) still works. */
export function goalTypes() {
  let list = [];
  try { list = JSON.parse(get('goal.types', 'null')) || []; } catch { list = []; }
  list = ORDER.filter((t) => list.includes(t));
  // the basics are two goals: new words + practice questions (time and rules are «advanced», switched on in the settings)
  if (!list.length) list = GOAL_TYPES[get('goal.type', '')] ? [get('goal.type', '')] : ['pass', 'practice'];
  return list;
}

const isCombo = () => goalTypes().length > 1;

export function setGoalTypes(types) {
  const list = ORDER.filter((t) => types.includes(t));
  put('goal.types', JSON.stringify(list.length ? list : ['pass']));
  window.dispatchEvent(new CustomEvent('lexitube:goal-progress', { detail: progress() }));
}

export function setGoalN(type, n) {
  if (!GOAL_TYPES[type]) return;
  put(`goal.n.${type}`, clampN(type, n));
  window.dispatchEvent(new CustomEvent('lexitube:goal-progress', { detail: progress() }));
}

/** Old API: set one goal and its number. */
export function setGoal(type, n) {
  if (!GOAL_TYPES[type]) return;
  put(`goal.n.${type}`, clampN(type, n));
  if (!isCombo()) put('goal.types', JSON.stringify([type]));
  window.dispatchEvent(new CustomEvent('lexitube:goal-progress', { detail: progress() }));
}

const passKey = (k = dayStr()) => `lt.passed.${k}`;
const ruleKey = (k = dayStr()) => `lt.rules.${k}`;
const setOf = (key) => { try { return new Set(JSON.parse(get(key, '[]'))); } catch { return new Set(); } };

/** What was done on one day (any day): { pass, practice, watch, rules }. */
export function dayCounts(k = dayStr()) {
  return {
    pass: setOf(passKey(k)).size,
    practice: Number(get(`lt.answers.${k}`, 0)) || 0,
    watch: Math.floor(Number(get(`lt.watch.${k}`, 0)) / 60),
    rules: setOf(ruleKey(k)).size,
  };
}

/** The chosen goal(s), with their numbers. One: as before. Several: a combined goal. */
export function goalCfg() {
  const types = goalTypes();
  const items = types.map((type) => ({ type, n: goalFor(type), ...GOAL_TYPES[type] }));
  if (items.length === 1) return { ...items[0], items, combo: false };
  return { type: 'combo', label: 'هدف مركّب', short: 'أهداف', unit: 'هدف', note: '', def: items.length, min: items.length, max: items.length, n: items.length, items, combo: true };
}

/** How far today's goal (or each part of it) is. */
export function progress() {
  const cfg = goalCfg();
  const counts = dayCounts();
  const items = cfg.items.map((it) => {
    const count = counts[it.type];
    return { ...it, count, done: count >= it.n, pct: Math.min(100, Math.round((100 * count) / it.n)) };
  });
  if (!cfg.combo) return { ...items[0], counts, items, combo: false };
  const doneN = items.filter((i) => i.done).length;
  return { ...cfg, counts, items, count: doneN, done: doneN === items.length, pct: Math.round(items.reduce((a, i) => a + i.pct, 0) / items.length) };
}

/** Was the goal (every chosen part) reached on that day? `extra` = answers known from elsewhere (the server's calendar). */
export function reachedOn(k, extra = {}) {
  const c = dayCounts(k);
  if (extra.practice) c.practice = Math.max(c.practice, Number(extra.practice) || 0);
  return goalTypes().every((t) => c[t] >= goalFor(t));
}

// fires once when today's goal (every part of it) is reached
function after(before) {
  const now = progress();
  window.dispatchEvent(new CustomEvent('lexitube:goal-progress', { detail: now }));
  const mark = `${dayStr()}:${goalTypes().join('+')}`;
  if (!before.done && now.done && get('goal.reached', '') !== mark) {
    put('goal.reached', mark);
    window.dispatchEvent(new CustomEvent('lexitube:goal-reached', { detail: now }));
  }
}

/** A new word went by (each counts once a day). */
export function notePassed(vocabularyId) {
  const s = setOf(passKey());
  if (s.has(vocabularyId)) return;
  const before = progress();
  s.add(vocabularyId);
  put(passKey(), JSON.stringify([...s].slice(-5000)));
  after(before);
}

/** A grammar rule or example was met (opened, or asked in grammar practice) — each counts once a day. */
export function noteRule(key) {
  const k = String(key || '');
  if (!k) return;
  const s = setOf(ruleKey());
  if (s.has(k)) return;
  const before = progress();
  s.add(k);
  put(ruleKey(), JSON.stringify([...s].slice(-3000)));
  after(before);
}

// ⏱ Time on the site = every moment of ACTIVITY: a tap, a key, a scroll, or a video that is playing. Between two activities the
// time counts while the gap is short (up to two minutes); a longer silence ends the session, and the next tap starts a new one.
// Nothing runs by itself: it is added only when the learner does something.
const IDLE_MS = 120000;
let lastAct = 0;
export const endSession = () => { lastAct = 0; };
export function noteActive() {
  const now = Date.now();
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') { lastAct = 0; return; }
  const gap = lastAct ? now - lastAct : 0;
  lastAct = now;
  if (gap <= 0 || gap > IDLE_MS) return; // the first tap of a session adds nothing yet
  const k = `lt.watch.${dayStr()}`;
  const prev = Number(get(k, 0)) || 0;
  const next = prev + gap / 1000;
  if (Math.floor(next / 60) === Math.floor(prev / 60)) { put(k, next); return; } // the same minute: just keep the seconds
  const before = progress();
  put(k, next);
  after(before);
}
/** (old name) a video is playing — counts as activity. */
export const noteWatched = () => noteActive();

/** One practice answer (words). */
export function noteAnswer() {
  const before = progress();
  const k = `lt.answers.${dayStr()}`;
  put(k, (Number(get(k, 0)) || 0) + 1);
  after(before);
}

/** «🎯 3 / 15 كلمة» · for a combined goal: «🎯 2 / 3 هدف» */
export const goalText = (p = progress()) => `🎯 ${p.count} / ${p.n} ${p.unit}${p.done ? ' ✓' : ''}`;
