// اليوم — a daily learning home, one clear task:
//   greeting + 🔔 (what's new · daily reminder) · 🔥 streak with this week's days
//   · «مراجعة كلمات آخر يوم» (the main task) · this week's progress.
import { api } from '../api.js';
import { maybeTour } from '../tour.js';
import { state } from '../state.js';
import { esc, icon, openModal, closeModal, toast } from '../ui.js';
import { dayStr, goalFor, dayCounts, GOAL_TYPES, goalTypes, setGoalTypes, setGoalN, progress } from '../goal.js';
import { setPending, checkDouble, doubleInfo } from '../streak-rescue.js';
import { getReminder, reminderSummary, openReminderFlow } from '../reminder.js';

const ls = (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch { /* storage off */ } };
const WD = ['ح', 'ن', 'ث', 'ر', 'خ', 'ج', 'س']; // Sun..Sat
const DAY_NAMES = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const shuffle = (a) => { const x = [...a]; for (let i = x.length - 1; i > 0; i -= 1) { const j = Math.floor(Math.random() * (i + 1)); [x[i], x[j]] = [x[j], x[i]]; } return x; };

/** Minutes on the site today (activity based, counted on this device). */
function todayMinutes() {
  return Math.floor((Number(ls(`lt.watch.${dayStr()}`, 0)) || 0) / 60);
}

/** What the dashboard measures — the four goals: time on the site · new words · practice answers · grammar rules (each against its own goal). */
const METRICS = {
  time: { goal: 'watch', unit: 'دقيقة', label: '⏱ الوقت', key: 'دقائق تعلّم في الموقع (على هذا الجهاز)' },
  words: { goal: 'pass', unit: 'كلمة', label: '📚 الكلمات', key: 'كلمات جديدة مرّت عليك' },
  practice: { goal: 'practice', unit: 'سؤال', label: '🎮 التدريب', key: 'إجابات تدريب' },
  rules: { goal: 'rules', unit: 'قاعدة', label: '📖 القواعد', key: 'قواعد وأمثلة' },
};
const metricPref = () => (METRICS[ls('today.metric', 'time')] ? ls('today.metric', 'time') : 'time');
const watchMin = (d) => Math.round((Number(ls(`lt.watch.${dayStr(d)}`, 0)) || 0) / 60);
/** One day's number for each of the four measures (this device's counters, plus what the server remembers). */
const dayAll = (d, days) => {
  const c = dayCounts(dayStr(d));
  const s = days[d.toISOString().slice(0, 10)] || {};
  return { time: watchMin(d), words: Math.max(c.pass, Number(s.saved || 0)), practice: Math.max(c.practice, Number(s.answers || 0)), rules: c.rules };
};
const dayValue = (d, days, metric) => dayAll(d, days)[metric];
const dayActive = (d, days) => { const a = dayAll(d, days); const x = days[d.toISOString().slice(0, 10)]; return a.time > 0 || a.words > 0 || a.practice > 0 || a.rules > 0 || !!(x && x.answers + x.saved + x.seen > 0); };

/** The words of the last day something was saved (yesterday if any, else the latest earlier day). */
function lastDay(words) {
  const today = dayStr();
  const by = new Map();
  for (const w of words) {
    if (!w.saved_at) continue;
    const d = dayStr(new Date(w.saved_at));
    if (d >= today) continue;
    if (!by.has(d)) by.set(d, []);
    by.get(d).push(w);
  }
  const day = [...by.keys()].sort().pop();
  if (!day) return null;
  const y = new Date(); y.setDate(y.getDate() - 1);
  return { day, words: by.get(day), yesterday: day === dayStr(y), name: DAY_NAMES[new Date(`${day}T12:00:00`).getDay()] };
}

/** This week's minutes (watching, counted on this device). */
function weekMinutes() {
  let sec = 0;
  for (let i = 0; i < 7; i += 1) { const d = new Date(); d.setDate(d.getDate() - i); sec += Number(ls(`lt.watch.${dayStr(d)}`, 0)) || 0; }
  return Math.round(sec / 60);
}

/** Start a review of the given words: random different games, each word once. */
export function startReview(list, { label = 'lastday', rest = [], kind = 'random' } = {}) {
  lsSet('review.rest', JSON.stringify(rest.map((w) => w.uv_id)));
  lsSet('review.kind', kind);
  location.hash = `#/practice?mode=${kind === 'cards' ? 'cards' : 'quiz&mix=random'}&review=${label}&exact=1&ids=${list.map((w) => w.uv_id).join(',')}&n=${Date.now()}`;
}

function openReviewSetup(words) {
  let count = Math.min(10, words.length) === words.length ? 0 : 10;
  let level = '';
  let kind = ls('review.kind', 'random');
  const box = openModal('');
  const pick = () => { const l = level ? words.filter((w) => String(w.level || '').startsWith(level)) : words; return shuffle(l); };
  const draw = () => {
    const n = pick().length;
    box.innerHTML = `<div class="rv-setup stack">
      <h3 style="margin:0">خصّص مراجعتك</h3>
      <div class="field"><span class="small ink-2">عدد الكلمات</span><div class="segmented rv-seg" id="rvN">${[[5, '5'], [10, '10'], [20, '20'], [0, 'الكل']].map(([v, l]) => `<button type="button" data-n="${v}" class="${count === v ? 'active' : ''}">${l}</button>`).join('')}</div></div>
      <div class="field"><span class="small ink-2">المستوى</span><div class="segmented rv-seg" id="rvL">${[['', 'الكل'], ['A', 'مبتدئ'], ['B', 'متوسط'], ['C', 'متقدم']].map(([v, l]) => `<button type="button" data-l="${v}" class="${level === v ? 'active' : ''}">${l}</button>`).join('')}</div></div>
      <div class="field"><span class="small ink-2">نوع التدريب</span><div class="segmented rv-seg" id="rvK">${[['random', '🎲 ألعاب عشوائية'], ['cards', '🃏 بطاقات']].map(([v, l]) => `<button type="button" data-k="${v}" class="${kind === v ? 'active' : ''}">${l}</button>`).join('')}</div></div>
      ${n ? '' : '<p class="tiny muted">ما فيه كلمات بهذا المستوى</p>'}
      <button class="btn primary lg" id="rvGo" ${n ? '' : 'disabled'}>ابدأ الاختبار ←</button></div>`;
  };
  box.addEventListener('click', (e) => {
    const nb = e.target.closest('[data-n]'); if (nb) { count = Number(nb.dataset.n); draw(); return; }
    const lb = e.target.closest('[data-l]'); if (lb) { level = lb.dataset.l; draw(); return; }
    const kb = e.target.closest('[data-k]'); if (kb) { kind = kb.dataset.k; draw(); return; }
    if (e.target.closest('#rvGo')) {
      const all = pick();
      const take = count ? all.slice(0, count) : all;
      closeModal();
      startReview(take, { rest: all.slice(take.length), kind });
    }
  });
  draw();
}

/* 🔔 what's new + a daily reminder */
// a day that reached its goal: a small orange flame (warm, motivating) instead of the old spark
const ORANGE_FLAME = '<svg class="th-flame-ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 22.5c4.2 0 7.2-2.8 7.2-7.1 0-3.1-2-5.7-3.6-7.3-.3 2.1-1.5 3.2-2.6 3.2 0-3.1-1.5-6.2-4.2-8.3.2 3.1-1.7 5.2-3.1 6.9-1.3 1.6-1.8 3.4-1.8 5.5 0 4.3 3.1 7.1 8.1 7.1z" fill="#FF7A1A" stroke="none"/><path d="M12 22.5c2.4 0 4-1.5 4-3.8 0-1.8-1.1-3.1-2.2-4.1-.2 1.2-.9 1.8-1.6 1.8 0-1.8-.8-3.4-2.2-4.6.1 1.8-.9 3-1.7 3.9-.7.9-1 1.8-1 3 0 2.3 1.7 3.8 4.7 3.8z" fill="#FFC83D" stroke="none"/></svg>';

function newsItems(stats, ld) {
  const out = [];
  if (stats.streak.rescue) out.push(['🔥', 'فاتك أمس؟ عادي — ضاعف هدف اليوم ويرجع كأنه ما فاتك، أو سوّ تدريب سريع', 'rescue']);
  if (ld) out.push(['📚', `مراجعة كلمات ${ld.yesterday ? 'أمس' : `يوم ${ld.name}`}`, 'review']);
  if (stats.due) out.push(['⏰', `${stats.due} كلمة حان وقت مراجعتها`, '#/practice?mode=quiz&focus=due']);
  if (stats.difficult) out.push(['💪', `${stats.difficult} كلمة صعبة تحتاج تدريب`, '#/practice?mode=quiz&focus=difficult']);
  if (stats.saved_today) out.push(['✨', `حفظت اليوم ${stats.saved_today} كلمة جديدة`, '#/words']);
  return out;
}
const newsSig = (items) => items.map((i) => i[1]).join('|');

function openBell(items, onAct) {
  const box = openModal('');
  const rem = getReminder();
  box.innerHTML = `<div class="bell-sheet stack">
    <h3 style="margin:0">${icon.bell} الجديد</h3>
    ${items.length ? `<div class="bell-list">${items.map(([ic, txt, act], i) => `<button type="button" class="bell-item" data-i="${i}"><span>${ic}</span><span>${esc(txt)}</span><span class="muted">‹</span></button>`).join('')}</div>` : '<p class="small muted">ما فيه شي جديد الحين 👌</p>'}
    <div class="divider"></div>
    <b>⏰ منبّه كمّل إنجازك</b>
    <p class="tiny muted" id="remNote" style="margin:0">${rem.time ? `مضبوط: <b class="en-inline">${esc(reminderSummary(rem))}</b>` : 'اختر الساعة والأيام، وبنوريك كيف تحفظه في التقويم.'}</p>
    <div class="btn-row"><button class="btn primary sm" id="remOpen">${rem.time ? 'تعديل المنبّه' : 'ضبط المنبّه ←'}</button></div>
  </div>`;
  box.addEventListener('click', async (e) => {
    const it = e.target.closest('[data-i]');
    if (it) { closeModal(); onAct(items[Number(it.dataset.i)][2]); return; }
    if (e.target.closest('#remOpen')) { closeModal(); openReminderFlow({ onDone: () => {} }); }
  });
}

export async function render(view) {
  const [{ stats }, words] = await Promise.all([api.today(), api.words().catch(() => [])]);
  state.stats = stats;
  // 🔥 practised today after missing yesterday → the flame comes back
  if (stats.streak.rescue && stats.streak.studied_today) {
    try { stats.streak = await api.rescueStreak(); toast(`🔥 رجعت شعلتك — ${stats.streak.current} أيام متتالية`); } catch { /* ignore */ }
  }
  setPending(stats.streak);
  await checkDouble(); // the goal may already be doubled (the result lands in stats.streak)
  const st = stats.streak;
  const grey = !!st.rescue;
  const flameN = grey ? st.rescue.lost : st.current;
  const ld = lastDay(words);
  const items = newsItems(stats, ld);
  const unseen = items.length && ls('bell.seen', '') !== newsSig(items);

  // the only words on the page: «مراجعة السابق» (the review of the last day's words, as before) — or «أضف مقطع» when nothing is saved yet
  const task = ld
    ? '<button type="button" class="btn th-review" id="rvStart">مراجعة السابق</button>'
    : '<a class="btn th-review" href="#/add">أضف مقطع</a>';

  const dbl = doubleInfo();
  const sadFace = '<svg class="lost-svg" viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><g class="lost-head"><circle cx="30" cy="34" r="21"/><path d="M19.5 30.5l5.5-2.6M40.5 30.5l-5.5-2.6" stroke-width="2.2"/><circle cx="23" cy="34" r="1.7" fill="currentColor" stroke="none"/><circle cx="37" cy="34" r="1.7" fill="currentColor" stroke="none"/><path d="M22.5 46c2.2-3.6 12.8-3.6 15 0"/></g><path class="lost-tear" d="M42 38c-2 2.6-2.2 4.4-.6 5.3 1.6.9 3-.9 .6-5.3z" fill="currentColor" stroke="none"/><g class="lost-wave" stroke-width="2.2"><path d="M6 25c-2 3.2-2 7.8 0 11"/><path d="M1 21c-3.4 5.4-3.4 13.6 0 19"/></g></svg>';
  const lostCard = grey ? `<div class="card th-lost" id="lostCard"><div class="lost-row"><span class="lost-face">${sadFace}</span>
      <div class="lost-bubble"><b>شعلتك طفت — بس عادي!</b><span>يمكنك مضاعفة هدف اليوم ليتعدّل أمس</span></div></div>
      <div class="th-lost-m"><span>${esc(dbl.line)}</span><span class="en-inline th-lost-c">${dbl.combo ? `${dbl.count}/${dbl.target}` : `${dbl.count}/${dbl.target}`}</span></div>
      <i class="th-lost-bar"><b style="width:${dbl.pct}%"></b></i>
      <button type="button" class="btn sm ghost" id="lostQuick">أو سوّ تدريب سريع (٥ كلمات) ←</button></div>` : '';
  view.innerHTML = `<div class="th">
    <div class="th-top th-top-min">
      <button type="button" class="th-bell${unseen ? ' dot' : ''}" id="bell" aria-label="الجديد والتذكير">${icon.bell}</button>
      <button type="button" class="th-flame-btn${grey ? ' grey' : ''}" id="flame" aria-label="أيامك المتتالية وكل التفاصيل"><span class="th-fl">🔥</span><b>${flameN}</b></button>
    </div>
    ${lostCard}
    ${task}
    <div class="th-prog-wrap"><div class="tiny muted th-cap">آخر ٧ أيام</div>
      <div class="card th-prog th-prog2">
        <div class="th-stat" aria-label="كلمات"><span class="th-si">${icon.library}</span><b>${stats.week?.saved || 0}</b><span class="th-sl">كلمة</span></div>
        <div class="th-stat" aria-label="دقائق"><span class="th-si">${icon.clock}</span><b>${weekMinutes()}</b><span class="th-sl">دقيقة</span></div>
      </div></div>
    <p class="th-spent" aria-label="دقائق اليوم">قضيت اليوم ${todayMinutes().toLocaleString('ar-EG')} د</p>
  </div>`;

  const act = (a) => {
    if (a === 'rescue') return rescue();
    if (a === 'review') return ld && openReviewSetup(ld.words);
    location.hash = a;
    return null;
  };
  const rescue = () => {
    const pool = shuffle(words.filter((w) => w.uv_id));
    if (!pool.length) { location.hash = '#/add'; return; }
    location.hash = `#/practice?mode=quiz&mix=random&rescue=1&exact=1&ids=${pool.slice(0, 5).map((w) => w.uv_id).join(',')}&n=${Date.now()}`;
  };
  view.querySelector('#flame').addEventListener('click', openCalendar);
  view.querySelector('#lostQuick')?.addEventListener('click', rescue);
  view.querySelector('#bell').addEventListener('click', () => { lsSet('bell.seen', newsSig(items)); view.querySelector('#bell').classList.remove('dot'); openBell(items, act); });
  view.querySelector('#rvStart')?.addEventListener('click', () => openReviewSetup(ld.words));
  maybeTour('home');
}

/* 📅 The dashboard: the days as squares, columns or a curve — filled by the time watched or the words learned
   (switch beside it) — and a tap on any day shows its numbers. */
const SHAPE_IC = {
  squares: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="3.5" width="7" height="7" rx="2"/><rect x="13.5" y="3.5" width="7" height="7" rx="2"/><rect x="3.5" y="13.5" width="7" height="7" rx="2"/><rect x="13.5" y="13.5" width="7" height="7" rx="2"/></svg>',
  bars: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M5 20V12M10 20V5M15 20V9M20 20V15"/></svg>',
  line: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17c3-1 4-9 8-9s4 8 10 3"/></svg>',
};
async function openCalendar() {
  const box = openModal('<p class="tiny muted"><span class="spinner"></span></p>', { wide: true });
  let r;
  try { r = await api.calendar(); } catch (err) { box.innerHTML = `<p>${esc(err.message)}</p>`; return; }
  const days = r.days || {};
  const keys = Object.keys(days).sort();
  const first = keys[0] ? new Date(`${keys[0]}T12:00:00`) : new Date();
  const now = new Date(); now.setHours(12, 0, 0, 0);
  let metric = metricPref();
  let shape = ['squares', 'bars', 'line'].includes(ls('today.shape', 'bars')) ? ls('today.shape', 'bars') : 'bars';
  const MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
  const addD = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const key = (d) => d.toISOString().slice(0, 10);
  const parse = (k) => new Date(`${k}T12:00:00`);
  const ny = now.getFullYear(); const nm = now.getMonth();
  const years = () => { const o = []; for (let yy = Math.min(first.getFullYear(), ny - 1); yy <= ny; yy += 1) o.push(yy); return o; };
  const weeksIn = (yy, mm) => { const len = new Date(yy, mm + 1, 0).getDate(); let n = 0; for (let d0 = 1; d0 <= len; d0 += 7) if (new Date(yy, mm, d0, 12) <= now) n += 1; return n; };
  const curW = Math.max(1, weeksIn(ny, nm));
  // ⚙️ the filter: first the unit (day · week · month · year), then what to do with it: last · range · a set of them · compare two
  const UNITS = { day: 'يوم', week: 'أسبوع', month: 'شهر', year: 'سنة' };
  const MODES = { last: 'آخر', range: 'نطاق', set: 'مجموعة', cmp: 'مقارنة' };
  const prevM = nm === 0 ? { y: ny - 1, m: 11 } : { y: ny, m: nm - 1 };
  const F = {
    unit: 'day', mode: 'last', last: { day: 30, week: 1, month: 3, year: 1 }, y: ny, m: nm,
    d: { cf: key(addD(now, -29)), ct: key(now), set: [], A: key(addD(now, -1)), B: key(now) },
    w: { from: 1, to: curW, set: [curW], A: { y: ny, m: nm, w: 1 }, B: { y: ny, m: nm, w: curW } },
    mo: { from: 0, to: nm, set: [nm], A: { ...prevM }, B: { y: ny, m: nm } },
    yr: { from: ny - 1, to: ny, set: [ny], A: ny - 1, B: ny },
  };
  try { const sv = JSON.parse(ls('today.filter', 'null')); if (sv && UNITS[sv.unit] && MODES[sv.mode]) { F.unit = sv.unit; F.mode = sv.mode; Object.assign(F.last, sv.last || {}); } } catch { /* default */ }
  let open = false;
  let pick = '';
  const memo = new Map();
  const A = (d) => { const k = key(d); if (!memo.has(k)) memo.set(k, dayAll(d, days)); return memo.get(k); };
  const unit = () => METRICS[metric].unit;
  const goalN = () => goalFor(METRICS[metric].goal); // the learner's own number (or the default) for the chosen measure
  const lvl = (v, max) => { if (!v) return 0; const p = v / max; return p >= 0.75 ? 4 : p >= 0.5 ? 3 : p >= 0.25 ? 2 : 1; };

  // one bucket = a day, a week, a month or a year: its totals for the four measures and the days that have passed in it (the goal grows with them)
  const mkB = (from, to, gran, _x, label, sub, tl) => {
    const t = { time: 0, words: 0, practice: 0, rules: 0 };
    let n = 0;
    for (let d = new Date(from); d <= to && d <= now; d = addD(d, 1)) { const a = A(d); Object.keys(t).forEach((k) => { t[k] += a[k]; }); n += 1; }
    return { id: key(from), from, to, gran, span: n, label, sub, tl, t };
  };
  const dayB = (d) => mkB(d, d, 'day', 0, String(d.getDate()), WD[d.getDay()], `${d.getDate()}/${d.getMonth() + 1}`);
  const wkB = (yy, mm, w) => { const len = new Date(yy, mm + 1, 0).getDate(); return mkB(new Date(yy, mm, (w - 1) * 7 + 1, 12), new Date(yy, mm, Math.min(len, w * 7), 12), 'week', 0, String(w), MONTHS[mm].slice(0, 3), `أ${w} ${MONTHS[mm]}`); };
  const monB = (yy, mm) => mkB(new Date(yy, mm, 1, 12), new Date(yy, mm + 1, 0, 12), 'month', 0, String(mm + 1), MONTHS[mm].slice(0, 3), MONTHS[mm]);
  const yrB = (yy) => mkB(new Date(yy, 0, 1, 12), new Date(yy, 11, 31, 12), 'year', 0, String(yy), '', String(yy));
  const started = (b) => b.from <= now;
  const lo = (a, b2) => (a <= b2 ? [a, b2] : [b2, a]);
  const asc = (arr) => [...arr].sort((p, q) => p - q);
  const build = () => {
    const { unit: u, mode } = F;
    let list = []; let gran = u;
    if (u === 'day') {
      if (mode === 'last') for (let i = F.last.day - 1; i >= 0; i -= 1) list.push(dayB(addD(now, -i)));
      else if (mode === 'range') { let [f, e] = lo(parse(F.d.cf), parse(F.d.ct)); if (e > now) e = now; if (addD(e, -365) > f) f = addD(e, -365); for (let d = new Date(f); d <= e; d = addD(d, 1)) list.push(dayB(d)); }
      else if (mode === 'set') list = asc(F.d.set).map((n) => dayB(new Date(F.y, F.m, n, 12))).filter(started);
      else list = [dayB(parse(F.d.A)), dayB(parse(F.d.B))];
    } else if (u === 'week') {
      if (mode === 'last') for (let i = F.last.week - 1; i >= 0; i -= 1) { const to = addD(now, -7 * i); const f = addD(to, -6); list.push(mkB(f, to, 'week', 0, String(f.getDate()), String(f.getMonth() + 1), `${f.getDate()}/${f.getMonth() + 1}`)); }
      else if (mode === 'range') { const [a, b2] = lo(F.w.from, F.w.to); for (let n = a; n <= b2; n += 1) list.push(wkB(F.y, F.m, n)); }
      else if (mode === 'set') list = asc(F.w.set).map((n) => wkB(F.y, F.m, n));
      else list = [wkB(F.w.A.y, F.w.A.m, F.w.A.w), wkB(F.w.B.y, F.w.B.m, F.w.B.w)];
    } else if (u === 'month') {
      if (mode === 'last') for (let i = F.last.month - 1; i >= 0; i -= 1) { const d = new Date(ny, nm - i, 1, 12); list.push(monB(d.getFullYear(), d.getMonth())); }
      else if (mode === 'range') { const [a, b2] = lo(F.mo.from, F.mo.to); for (let n = a; n <= b2; n += 1) list.push(monB(F.y, n)); }
      else if (mode === 'set') list = asc(F.mo.set).map((n) => monB(F.y, n));
      else list = [monB(F.mo.A.y, F.mo.A.m), monB(F.mo.B.y, F.mo.B.m)];
    } else {
      if (mode === 'last') for (let i = F.last.year - 1; i >= 0; i -= 1) list.push(yrB(ny - i));
      else if (mode === 'range') { const [a, b2] = lo(F.yr.from, F.yr.to); for (let n = a; n <= b2; n += 1) list.push(yrB(n)); }
      else if (mode === 'set') list = asc(F.yr.set).map(yrB);
      else list = [yrB(F.yr.A), yrB(F.yr.B)];
    }
    if (mode !== 'cmp') list = list.filter(started);
    if (mode === 'cmp') { list[0].id += 'a'; list[1].id += 'b'; }
    return { gran, list, cmp: mode === 'cmp' };
  };
  const GRAN = { day: 'يوم', week: 'أسبوع', month: 'شهر', year: 'سنة' };
  let V = build();
  const val = (b) => b.t[metric];
  const lineGoal = () => goalN() * Math.max(1, ...V.list.map((b) => b.span));
  const goalTxt = () => `${lineGoal()} ${unit()}${V.gran === 'day' ? '' : ` لكل ${GRAN[V.gran]}`}`;
  const maxOf = () => Math.max(metric === 'time' ? 10 : 5, lineGoal(), ...V.list.map(val));
  const hit = (b) => b.span > 0 && val(b) >= goalN() * b.span;

  const squares = () => {
    const mx = maxOf();
    const cell = (b) => `<button type="button" class="cal-d l${lvl(val(b), mx)}${hit(b) ? ' hit' : ''} ${pick === b.id ? 'pick' : ''}${b.from <= now && b.to >= now ? ' today' : ''}" data-d="${b.id}"><b>${V.gran === 'day' ? b.label : b.tl}</b><small>${val(b) || ''}</small></button>`;
    if (V.gran !== 'day' || F.mode === 'set' || V.cmp) return `<div class="cal-g tiles">${V.list.map(cell).join('')}</div>`;
    const pad = Array.from({ length: V.list[0]?.from.getDay() || 0 }, () => '<span></span>').join('');
    return `<div class="cal-w">${['أحد', 'إثن', 'ثلا', 'أرب', 'خمي', 'جمع', 'سبت'].map((d) => `<span>${d}</span>`).join('')}</div><div class="cal-g">${pad}${V.list.map(cell).join('')}</div>`;
  };
  const bars = () => {
    const mx = maxOf(); const n = V.list.length; const step = Math.ceil(n / 12);
    return `<div class="cal-bars${n > 16 ? ' dense' : ''}" style="--g:${(lineGoal() / mx).toFixed(3)}"><div class="cb-goal" aria-hidden="true"><span>الهدف ${goalTxt()}</span></div>${V.list.map((b, i) => {
      const v = val(b);
      const pct = v ? Math.max(8, Math.min(100, Math.round((100 * v) / mx))) : 0;
      const showL = n <= 16 || i % step === 0 || i === n - 1;
      return `<button type="button" class="cb${pick === b.id ? ' pick' : ''}${b.from <= now && b.to >= now ? ' today' : ''}${hit(b) ? ' hit' : ''}" data-d="${b.id}"><em>${n > 16 ? '' : (v || '')}</em><i><b class="l${lvl(v, mx)}" style="height:${pct}%"></b></i><span>${showL ? b.label : ''}</span><small>${n > 16 ? '' : b.sub}</small></button>`;
    }).join('')}</div>`;
  };
  const line = () => {
    const list = V.list; const N = list.length; const mx = maxOf();
    const W = 320; const H = 130; const px = 14; const py = 14;
    const X = (i) => W - px - (i * (W - 2 * px)) / Math.max(1, N - 1); // oldest at the right (Arabic reads right to left)
    const Yv = (v) => H - py - ((H - 2 * py) * v) / mx;
    const pts = list.map((b, i) => [X(i), Yv(val(b))]);
    const path = pts.map((q, i) => `${i ? 'L' : 'M'}${q[0].toFixed(1)} ${q[1].toFixed(1)}`).join(' ');
    const area = `${path} L${X(N - 1).toFixed(1)} ${H - py} L${X(0).toFixed(1)} ${H - py} Z`;
    const lab = (i) => list[i].tl;
    const mid = Math.floor((N - 1) / 2);
    return `<svg class="cal-line" viewBox="0 0 ${W} ${H + 16}" role="img" aria-label="المنحنى">
      <path d="M${px} ${H - py} H${W - px}" class="cl-axis"/><path class="cl-area" d="${area}"/>
      <path class="cl-goal" d="M${px} ${Yv(lineGoal()).toFixed(1)} H${W - px}"/><text class="cl-gt" x="${W - px}" y="${(Yv(lineGoal()) - 4).toFixed(1)}" text-anchor="start">الهدف ${goalTxt()}</text>
      <path class="cl-path" d="${path}"/>
      ${list.map((b, i) => `<circle class="cl-dot${b.id === pick ? ' pick' : ''}${val(b) ? ' on' : ''}${hit(b) ? ' hit' : ''}" cx="${pts[i][0].toFixed(1)}" cy="${pts[i][1].toFixed(1)}" r="${b.id === pick ? 5 : N > 40 ? 2 : 3}"/><circle class="cl-hit" data-d="${b.id}" cx="${pts[i][0].toFixed(1)}" cy="${pts[i][1].toFixed(1)}" r="${N > 40 ? 5 : 9}"/>`).join('')}
      <text class="cl-t" x="${X(0)}" y="${H + 12}" text-anchor="end">${lab(0)}</text>${N > 2 ? `<text class="cl-t" x="${X(mid)}" y="${H + 12}" text-anchor="middle">${lab(mid)}</text>` : ''}${N > 1 ? `<text class="cl-t" x="${X(N - 1)}" y="${H + 12}" text-anchor="start">${lab(N - 1)}</text>` : ''}</svg>`;
  };
  const shapeHtml = () => (!V.list.length ? '<p class="tiny muted" style="text-align:center">ما فيه أيام في هذي المدة — اختر شهرًا أو فترة ثانية.</p>' : shape === 'bars' ? bars() : shape === 'line' ? line() : squares());
  const dm = (k) => { const d = parse(k); return `${d.getDate()}/${d.getMonth() + 1}`; };
  const plural = (n, one, many) => (n === 1 ? `آخر ${one}` : `آخر ${n} ${many}`);
  const fTitle = () => {
    const { unit: u, mode } = F;
    if (mode === 'cmp') return `مقارنة ${{ day: 'يومين', week: 'أسبوعين', month: 'شهرين', year: 'سنتين' }[u]}`;
    if (u === 'day') return mode === 'last' ? plural(F.last.day, 'يوم', 'يوم') : mode === 'range' ? `${dm(F.d.cf)} ← ${dm(F.d.ct)}` : `${F.d.set.length} أيام · ${MONTHS[F.m]}`;
    if (u === 'week') return mode === 'last' ? plural(F.last.week, 'أسبوع', 'أسابيع') : mode === 'range' ? `أسبوع ${F.w.from} ← ${F.w.to} · ${MONTHS[F.m]}` : `أسابيع ${asc(F.w.set).join('، ')} · ${MONTHS[F.m]}`;
    if (u === 'month') return mode === 'last' ? plural(F.last.month, 'شهر', 'شهور') : mode === 'range' ? `${MONTHS[F.mo.from]} ← ${MONTHS[F.mo.to]} ${F.y}` : `${F.mo.set.length} شهور · ${F.y}`;
    return mode === 'last' ? plural(F.last.year, 'سنة', 'سنوات') : mode === 'range' ? `${F.yr.from} ← ${F.yr.to}` : `سنوات ${asc(F.yr.set).join('، ')}`;
  };
  const bTitle = (b) => (b.gran === 'day' ? `${DAY_NAMES[b.from.getDay()]} ${b.from.getDate()}/${b.from.getMonth() + 1}` : b.gran === 'week' ? `من ${b.from.getDate()}/${b.from.getMonth() + 1} إلى ${b.to.getDate()}/${b.to.getMonth() + 1}` : b.gran === 'month' ? `${MONTHS[b.from.getMonth()]} ${b.from.getFullYear()}` : `سنة ${b.from.getFullYear()}`);
  // 🧮 a summary of buckets: totals of the four measures and the days they cover — what the part below the chart shows
  const summ = (list) => ({ t: list.reduce((o, b) => { Object.keys(o).forEach((k) => { o[k] += b.t[k]; }); return o; }, { time: 0, words: 0, practice: 0, rules: 0 }), days: list.reduce((n, b) => n + b.span, 0), from: list[0]?.from, to: list[list.length - 1]?.to, n: list.length });
  const rows4 = (S) => Object.entries(METRICS).map(([k, mt]) => { const goal = goalFor(mt.goal) * Math.max(1, S.days); return { k, mt, got: S.t[k], goal, pct: S.t[k] / goal }; });
  const avgOf = (S) => { const rs = rows4(S); return Math.round((100 * rs.reduce((a, x) => a + Math.min(1, x.pct), 0)) / rs.length); };
  // the window of the same length right before (the day before, the week before …)
  const before = (S) => { const len = Math.max(1, S.days); const f = addD(S.from, -len); return summ([mkB(f, addD(S.from, -1), 'x', 0, '', '', '')]); };
  const deltaHtml = (cur, prev, what) => {
    let cls = 'flat'; let sym = '＝'; let txt = '٠٪';
    if (!prev && !cur) { txt = '—'; } else if (!prev) { cls = 'up'; sym = '▲'; txt = 'أول نشاط'; } else {
      const pc = Math.round((100 * (cur - prev)) / prev);
      if (pc > 0) { cls = 'up'; sym = '▲'; txt = `+${pc}٪`; } else if (pc < 0) { cls = 'down'; sym = '▼'; txt = `−${Math.abs(pc)}٪`; }
    }
    return `<div class="cd-delta ${cls}"><span class="cd-arr">${sym}</span><b class="en-inline">${txt}</b><small>${what}</small></div>`;
  };
  const avgBlock = (S, deltaH, extra = '') => { const a = avgOf(S); return `<div class="cd-avg"><div class="cd-avg-top"><span>متوسط تحقيق الأهداف الأربعة</span><b class="en-inline">${a}٪</b></div><i class="cd-meter"><b style="width:${a}%"></b></i>${extra}${deltaH}</div>`; };
  const colsHtml = (S) => `<div class="cd-cols">${rows4(S).map((x) => `<div class="cd-col${x.pct >= 1 ? ' ok' : ''}"><b class="en-inline cd-v">${x.got}</b><i class="cd-tr"><b style="height:${Math.min(100, Math.round(100 * x.pct))}%"></b></i><span class="cd-n">${x.mt.label}</span><small class="tiny muted en-inline">${x.goal}</small></div>`).join('')}</div>`;
  const pairHtml = (S1, S2) => { const r1 = rows4(S1); const r2 = rows4(S2); return `<div class="cd-cols">${r1.map((x, i) => { const z = r2[i]; return `<div class="cd-col cd-pair"><div class="cd-vs"><b class="en-inline cd-v c1">${x.got}</b><b class="en-inline cd-v c2">${z.got}</b></div><div class="cd-trs"><i class="cd-tr c1"><b style="height:${Math.min(100, Math.round(100 * x.pct))}%"></b></i><i class="cd-tr c2"><b style="height:${Math.min(100, Math.round(100 * z.pct))}%"></b></i></div><span class="cd-n">${x.mt.label}</span><small class="tiny muted en-inline">${x.goal} · ${z.goal}</small></div>`; }).join('')}</div>`; };

  const dash = () => {
    if (!V.list.length) return '';
    if (V.cmp) {
      const S1 = summ([V.list[0]]); const S2 = summ([V.list[1]]);
      const a1 = avgOf(S1); const a2 = avgOf(S2);
      return `<div class="cal-dash"><div class="cd-head"><b>مقارنة</b></div>
        <div class="cd-legend"><span class="c1"><i></i>١ · ${esc(bTitle(V.list[0]))} <small>(${S1.days} يوم)</small></span><span class="c2"><i></i>٢ · ${esc(bTitle(V.list[1]))} <small>(${S2.days} يوم)</small></span></div>
        ${pairHtml(S1, S2)}
        ${avgBlock(S1, deltaHtml(a1, a2, 'الأول مقارنة بالثاني'), `<div class="cd-avg2"><span>١: <b class="en-inline">${a1}٪</b></span><span>٢: <b class="en-inline">${a2}٪</b></span></div>`)}
        <button type="button" class="btn cd-editbtn" data-editgoals>✏️ عدّل أهدافك</button></div>`;
    }
    const b = pick ? V.list.find((x) => x.id === pick) : null;
    const S1 = b ? summ([b]) : summ(V.list);
    const t1 = b ? bTitle(b) : `ملخص ${fTitle()}`;
    const chip = b ? (b.from <= now && b.to >= now ? `<span class="th-chip">${b.gran === 'day' ? 'اليوم' : 'الحالي'}</span>` : '') : `<span class="th-chip">${S1.days} يوم</span>`;
    const back = b ? '<button type="button" class="btn ghost sm cd-back" data-clearpick>ملخص الفترة كلها</button>' : '';
    const prev = before(S1);
    const nothing = Object.values(S1.t).every((v) => !v);
    const what = b ? (b.gran === 'day' ? 'عن اليوم السابق' : `عن ${GRAN[b.gran]} قبله (نفس المدة)`) : `عن الفترة السابقة (${S1.days} يوم قبلها)`;
    return `<div class="cal-dash"><div class="cd-head"><b>${esc(t1)}</b>${chip}${back}</div>
      ${colsHtml(S1)}
      ${nothing ? '<p class="tiny muted" style="margin:6px 0 0;text-align:center">ما فيه نشاط في هذي الفترة.</p>' : ''}
      ${avgBlock(S1, deltaHtml(avgOf(S1), avgOf(prev), what))}
      <button type="button" class="btn cd-editbtn" data-editgoals>✏️ عدّل أهدافك</button></div>`;
  };

  // 🎯 the goals editor lives here (it used to be in the settings page). Changing a goal never deletes what was done:
  // the days stay as they were counted, they are only compared with the new numbers.
  let editing = false;
  const drawGoals = () => {
    const sel = goalTypes(); const off = ls('goal.off', '0') === '1';
    const p = progress();
    box.innerHTML = `<div class="cal"><h3 style="margin:0 0 4px">🎯 عدّل أهدافك</h3>
      <p class="tiny muted" style="margin:0">اختر هدفًا واحدًا أو أكثر. لو اخترت أكثر من واحد يصير <b>هدفك مركّب</b>: يكتمل اليوم لما تحقق كلها، ولكل هدف عدده. <b>أداءك في الأيام الماضية ما ينحذف</b> — بس يتقارن بالأرقام الجديدة.</p>
      <div class="goal-rows" id="goalRows">${Object.entries(GOAL_TYPES).map(([k, g]) => `<div class="goal-row${sel.includes(k) ? ' on' : ''}" data-gt="${k}">
        <label class="goal-pick"><input type="checkbox" class="check" data-gc="${k}" ${sel.includes(k) ? 'checked' : ''}><span><b>${g.label}</b><span class="tiny muted">${g.note}</span></span></label>
        <span class="goal-num"><input class="input en-inline" data-gn="${k}" type="number" inputmode="numeric" min="${g.min}" max="${g.max}" value="${goalFor(k)}" ${sel.includes(k) ? '' : 'disabled'}> <span class="small">${g.unit}</span></span></div>`).join('')}</div>
      <label class="goal-pick" style="margin-top:10px"><input type="checkbox" class="check" id="goalAlert" ${off ? '' : 'checked'}><span><b>نبّهني لما أوصل هدفي</b></span></label>
      <span class="tiny muted" id="goalNow">${p.combo ? '<b>هدف مركّب</b> — ' : ''}اليوم: ${p.items.map((i) => `${i.short} <b class="en-inline">${i.count}/${i.n}</b>${i.done ? ' ✓' : ''}`).join(' · ')}</span>
      <div class="btn-row" style="justify-content:center;margin-top:12px"><button class="btn primary" data-donegoals>تم</button></div></div>`;
  };

  // ---- the filter panel: unit → mode → only the choices that mode needs ----
  const chip = (attr, val, label, on) => `<button type="button" class="rg-chip${on ? ' on' : ''}" ${attr}="${val}">${label}</button>`;
  const sel = (path, opts, cur) => `<select class="input rg-sel" data-ff="${path}">${opts.map(([v, l]) => `<option value="${v}" ${String(v) === String(cur) ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
  const yOpts = () => years().map((v) => [v, v]);
  const mOpts = (yy) => MONTHS.map((n, i) => [i, n]).filter(([i]) => new Date(yy, i, 1) <= now);
  const wSpan = (yy, mm, n) => `\u2066${(n - 1) * 7 + 1}–${Math.min(new Date(yy, mm + 1, 0).getDate(), n * 7)}\u2069`; // the days of week n inside its month, e.g. 8–14
  const wOpts = (yy, mm) => Array.from({ length: weeksIn(yy, mm) }, (_, i) => [i + 1, `${i + 1} · ${wSpan(yy, mm, i + 1)}`]);
  const date = (path, v) => `<input class="input en-inline" type="date" data-ff="${path}" value="${v}" max="${key(now)}">`;
  const lab = (t, inner) => `<label>${t}${inner}</label>`;
  const two = (a, b2) => `<div class="rg-two">${a}${b2}</div>`;
  const step = (t, inner) => `<div class="rg-step">${t ? `<b>${t}</b>` : ''}${inner}</div>`;
  const ctxMonth = () => two(lab('السنة', sel('y', yOpts(), F.y)), lab('الشهر', sel('m', mOpts(F.y), F.m)));
  const lastChips = (u, opts, word) => step(`آخر كم ${word}؟`, `<div class="rg-chips">${opts.map((n) => chip('data-fl', n, String(n), F.last[u] === n)).join('')}</div>`);
  const optionsHtml = () => {
    const { unit: u, mode } = F;
    if (u === 'day') {
      if (mode === 'last') return lastChips('day', [7, 14, 30, 90], 'يوم');
      if (mode === 'range') return step('نطاق من يوم إلى يوم', two(lab('من يوم', date('d.cf', F.d.cf)), lab('إلى يوم', date('d.ct', F.d.ct))));
      if (mode === 'set') { const len = new Date(F.y, F.m + 1, 0).getDate(); return step('١) اختر الشهر', ctxMonth()) + step('٢) اختر الأيام (أكثر من يوم)', `<div class="rg-chips rg-nums">${Array.from({ length: len }, (_, i) => i + 1).filter((n) => new Date(F.y, F.m, n, 12) <= now).map((n) => chip('data-ft', `d.set:${n}`, n, F.d.set.includes(n))).join('')}</div>`); }
      return step('قارن بين يومين', two(lab('اليوم الأول', date('d.A', F.d.A)), lab('اليوم الثاني', date('d.B', F.d.B))));
    }
    if (u === 'week') {
      if (mode === 'last') return lastChips('week', [1, 2, 4, 8], 'أسبوع');
      if (mode === 'range') return step('١) اختر الشهر', ctxMonth()) + step('٢) من أسبوع رقم … إلى أسبوع رقم', two(lab('من أسبوع', sel('w.from', wOpts(F.y, F.m), F.w.from)), lab('إلى أسبوع', sel('w.to', wOpts(F.y, F.m), F.w.to))));
      if (mode === 'set') return step('١) اختر الشهر', ctxMonth()) + step('٢) أسابيع هذا الشهر — رقم الأسبوع وأيامه (تقدر أكثر من أسبوع)', `<div class="rg-chips rg-nums">${wOpts(F.y, F.m).map(([n]) => chip('data-ft', `w.set:${n}`, `<b>${n}</b><small>${wSpan(F.y, F.m, n)}</small>`, F.w.set.includes(n))).join('')}</div>`);
      const one = (id, X, t) => step(t, two(lab('السنة', sel(`w.${id}.y`, yOpts(), X.y)), lab('الشهر', sel(`w.${id}.m`, mOpts(X.y), X.m))) + lab('رقم الأسبوع', sel(`w.${id}.w`, wOpts(X.y, X.m), X.w)));
      return one('A', F.w.A, 'الأسبوع الأول') + one('B', F.w.B, 'الأسبوع الثاني');
    }
    if (u === 'month') {
      if (mode === 'last') return lastChips('month', [1, 3, 6, 12], 'شهر');
      if (mode === 'range') return step('١) اختر السنة', lab('', sel('y', yOpts(), F.y))) + step('٢) من شهر … إلى شهر', two(lab('من شهر', sel('mo.from', mOpts(F.y), F.mo.from)), lab('إلى شهر', sel('mo.to', mOpts(F.y), F.mo.to))));
      if (mode === 'set') return step('١) اختر السنة', lab('', sel('y', yOpts(), F.y))) + step('٢) اختر الشهور (أكثر من شهر)', `<div class="rg-chips">${mOpts(F.y).map(([i, n]) => chip('data-ft', `mo.set:${i}`, n, F.mo.set.includes(i))).join('')}</div>`);
      const one = (id, X, t) => step(t, two(lab('السنة', sel(`mo.${id}.y`, yOpts(), X.y)), lab('الشهر', sel(`mo.${id}.m`, mOpts(X.y), X.m))));
      return one('A', F.mo.A, 'الشهر الأول') + one('B', F.mo.B, 'الشهر الثاني');
    }
    if (mode === 'last') return lastChips('year', [1, 2, 3, 5], 'سنة');
    if (mode === 'range') return step('نطاق من سنة إلى سنة', two(lab('من سنة', sel('yr.from', yOpts(), F.yr.from)), lab('إلى سنة', sel('yr.to', yOpts(), F.yr.to))));
    if (mode === 'set') return step('اختر السنوات (أكثر من سنة)', `<div class="rg-chips">${years().map((v) => chip('data-ft', `yr.set:${v}`, v, F.yr.set.includes(v))).join('')}</div>`);
    return step('قارن بين سنتين', two(lab('السنة الأولى', sel('yr.A', yOpts(), F.yr.A)), lab('السنة الثانية', sel('yr.B', yOpts(), F.yr.B))));
  };
  const panel = () => `<div class="rg-panel">
      <div class="rg-chips rg-modes">${Object.entries(MODES).map(([k, l]) => chip('data-fm', k, l, F.mode === k)).join('')}</div>
      <div class="rg-chips rg-units">${Object.entries(UNITS).map(([k, l]) => chip('data-fu', k, l, F.unit === k)).join('')}</div>
      ${optionsHtml()}</div>`;
  const RG_IC = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15" rx="3.5"/><path d="M8 3v4M16 3v4M3.5 10h17"/></svg>';
  const draw = () => {
    if (editing) return drawGoals();
    V = build();
    if (pick && (V.cmp || !V.list.some((b) => b.id === pick))) pick = '';
    box.innerHTML = `<div class="cal">
      <div class="cal-ctl">
        <div class="segmented seg4" id="calMetric">${Object.entries(METRICS).map(([k, mt]) => `<button type="button" data-cm="${k}" class="${metric === k ? 'active' : ''}">${mt.label}</button>`).join('')}</div>
        <div class="segmented" id="calShape">${[['squares', 'مربعات'], ['bars', 'أعمدة'], ['line', 'منحنى']].map(([k, l]) => `<button type="button" data-cs="${k}" class="${shape === k ? 'active' : ''}" aria-label="${l}" title="${l}"><span class="cs-i">${SHAPE_IC[k]}</span><span class="cs-t">${l}</span></button>`).join('')}<button type="button" class="rg-ic${open ? ' active' : ''}" data-rgtoggle aria-expanded="${open}" aria-label="الفترة والمقارنة" title="الفترة والمقارنة"><span class="cs-i">${RG_IC}</span></button></div>
        <p class="rg-cap tiny"><span class="cs-i">${RG_IC}</span> ${esc(fTitle())}</p>
        ${open ? panel() : ''}
      </div>
      <div class="cal-shape">${shapeHtml()}</div>
      <div class="cal-key tiny"><span>أقل</span><i class="l0"></i><i class="l1"></i><i class="l2"></i><i class="l3"></i><i class="l4"></i><span>أكثر</span><span class="muted">· ${METRICS[metric].key}</span><span class="cal-gkey"><i></i> الهدف ${goalTxt()}</span></div>
      ${dash()}
      <div class="btn-row" style="justify-content:center"><button class="btn ghost" data-close>إغلاق</button></div></div>`;
  };
  // keep every choice valid after any change (a week that does not exist, a month in the future, an empty set …)
  const normalize = () => {
    const capM = (yy) => (yy === ny ? nm : 11);
    if (F.m > capM(F.y)) F.m = capM(F.y);
    const nW = Math.max(1, weeksIn(F.y, F.m));
    F.w.from = Math.min(Math.max(1, F.w.from), nW); F.w.to = Math.min(Math.max(1, F.w.to), nW);
    F.w.set = F.w.set.filter((n) => n <= nW); if (!F.w.set.length) F.w.set = [nW];
    for (const X of [F.w.A, F.w.B]) { if (X.m > capM(X.y)) X.m = capM(X.y); X.w = Math.min(Math.max(1, X.w), Math.max(1, weeksIn(X.y, X.m))); }
    F.mo.from = Math.min(F.mo.from, capM(F.y)); F.mo.to = Math.min(F.mo.to, capM(F.y));
    F.mo.set = F.mo.set.filter((n) => n <= capM(F.y)); if (!F.mo.set.length) F.mo.set = [capM(F.y)];
    for (const X of [F.mo.A, F.mo.B]) if (X.m > capM(X.y)) X.m = capM(X.y);
    const len = new Date(F.y, F.m + 1, 0).getDate(); F.d.set = F.d.set.filter((n) => n <= len && new Date(F.y, F.m, n, 12) <= now);
    F.yr.set = F.yr.set.filter((v) => years().includes(v)); if (!F.yr.set.length) F.yr.set = [ny];
  };
  const getAt = (path) => path.split('.').reduce((o, k) => o[k], F);
  const setAt = (path, v) => { const ks = path.split('.'); const last = ks.pop(); ks.reduce((o, k) => o[k], F)[last] = v; };
  const saveF = () => lsSet('today.filter', JSON.stringify({ unit: F.unit, mode: F.mode, last: F.last }));
  box.addEventListener('change', (e) => {
    const ff = e.target.closest('[data-ff]');
    if (ff) { setAt(ff.dataset.ff, ff.type === 'date' ? ff.value : Number(ff.value)); normalize(); pick = ''; draw(); return; }
    if (!editing) return;
    const c = e.target.closest('[data-gc]'); const n = e.target.closest('[data-gn]');
    if (e.target.id === 'goalAlert') { lsSet('goal.off', e.target.checked ? '0' : '1'); return; }
    if (c) {
      const sl = new Set(goalTypes());
      if (c.checked) sl.add(c.dataset.gc); else sl.delete(c.dataset.gc);
      if (!sl.size) { toast('لازم يبقى هدف واحد على الأقل'); drawGoals(); return; }
      setGoalTypes([...sl]);
    }
    if (n) setGoalN(n.dataset.gn, Number(n.value));
    drawGoals();
  });
  box.addEventListener('click', (e) => {
    if (e.target.closest('[data-editgoals]')) { editing = true; draw(); return; }
    if (e.target.closest('[data-donegoals]')) { editing = false; draw(); return; }
    const cm = e.target.closest('[data-cm]');
    if (cm && METRICS[cm.dataset.cm]) { metric = cm.dataset.cm; lsSet('today.metric', metric); draw(); return; }
    const cs = e.target.closest('[data-cs]');
    if (cs) { shape = cs.dataset.cs; lsSet('today.shape', shape); draw(); return; }
    if (e.target.closest('[data-rgtoggle]')) { open = !open; draw(); return; }
    const fu = e.target.closest('[data-fu]');
    if (fu) { F.unit = fu.dataset.fu; pick = ''; saveF(); draw(); return; }
    const fm = e.target.closest('[data-fm]');
    if (fm) { F.mode = fm.dataset.fm; pick = ''; saveF(); draw(); return; }
    const fl = e.target.closest('[data-fl]');
    if (fl) { F.last[F.unit] = Number(fl.dataset.fl); pick = ''; saveF(); draw(); return; }
    const ft = e.target.closest('[data-ft]');
    if (ft) { // a chip in a multi-choice set: tap to add it, tap again to take it out (at least one stays, except days)
      const [path, v] = ft.dataset.ft.split(':'); const arr = getAt(path); const val = Number(v); const at = arr.indexOf(val);
      if (at >= 0) { if (arr.length > 1 || path === 'd.set') arr.splice(at, 1); } else arr.push(val);
      pick = ''; draw(); return;
    }
    if (e.target.closest('[data-clearpick]')) { pick = ''; draw(); return; }
    const d = e.target.closest('[data-d]');
    if (d && !V.cmp) { pick = pick === d.dataset.d ? '' : d.dataset.d; draw(); } // a tap picks that day/week/month; the same tap again goes back to the summary of the whole period
  });
  draw();
}
