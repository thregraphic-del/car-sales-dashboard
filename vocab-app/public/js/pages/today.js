// اليوم — a daily learning home, one clear task:
//   greeting + 🔔 (what's new · daily reminder) · 🔥 streak with this week's days
//   · «مراجعة كلمات آخر يوم» (the main task) · this week's progress.
import { api } from '../api.js';
import { maybeTour } from '../tour.js';
import { state } from '../state.js';
import { noteStatsFresh, takePreloadedToday } from '../app.js';
import { esc, icon, openModal, closeModal, toast } from '../ui.js';
import { dayStr, goalFor, dayCounts, GOAL_TYPES, goalTypes, setGoalTypes, setGoalN, progress, ADVANCED_GOALS } from '../goal.js';
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

const GOAL_ROW = { pass: ['📚', 'كلمات جديدة', 'words'], practice: ['🎮', 'أسئلة تدريب', 'practice'], watch: ['⏱', 'وقت في الموقع', 'time'], rules: ['📖', 'قواعد', 'rules'] };
/** Today's goals: one line each with a thin bar (only the goals that are on). */
function goalsToday() {
  const now = new Date(); now.setHours(12, 0, 0, 0);
  const a = dayAll(now, {});
  return `<div class="card th-goals">${goalTypes().map((g) => {
    const [ic, name, k] = GOAL_ROW[g]; const got = a[k]; const goal = goalFor(g);
    return `<div class="thg"><span class="thg-i">${ic}</span><div class="thg-m"><b>${name}</b><i class="thg-bar"><b style="width:${Math.min(100, Math.round((100 * got) / goal))}%"></b></i></div><span class="thg-v en-inline" dir="ltr">${got}<small> / ${goal}</small></span></div>`;
  }).join('')}</div>`;
}

export async function render(view) {
  const home = (await takePreloadedToday()) || await api.today();
  const { stats } = home;
  const words = home.brief || []; // uv_id · level · saved_at is all this page needs (the full words come only when a review starts)
  state.stats = stats;
  noteStatsFresh();
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
  const fresh = !ld && !(stats.total > 0); // nothing saved yet: no chart, just the invitation
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
      <button type="button" class="th-flame-btn${grey ? ' grey' : ''}" id="flame" aria-label="أيامك المتتالية"><span class="th-fl">🔥</span><b>${flameN}</b></button>
      <span class="th-spent2">قضيت ${todayMinutes().toLocaleString('ar-EG')} د في المقاطع</span>
    </div>
    ${lostCard}
    ${task}
    <div class="th-sec">إنجاز اليوم</div>
    ${goalsToday()}
    ${fresh ? '<div class="card th-act th-empty"><b>آخر ٧ أيام</b><p>أضف أول مقطع وتبدأ أعمدتك تطلع</p></div>' : '<div class="card th-act" id="actBox"></div>'}
  </div>`;
  if (!fresh) mountActivity(view.querySelector('#actBox'));

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
  view.querySelector('#flame').addEventListener('click', () => view.querySelector('#actBox')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  view.querySelector('#lostQuick')?.addEventListener('click', rescue);
  view.querySelector('#bell').addEventListener('click', () => { lsSet('bell.seen', newsSig(items)); view.querySelector('#bell').classList.remove('dot'); openBell(items, act); });
  view.querySelector('#rvStart')?.addEventListener('click', () => openReviewSetup(ld.words));
  maybeTour('home');
}

/* 📅 The dashboard: the days as squares, columns or a curve — filled by the time watched or the words learned
   (switch beside it) — and a tap on any day shows its numbers. */
/** The activity chart + totals, drawn inside the home page (it was a separate window before). */
function mountActivity(box) {
  let days = {}; // this device's counters first; the server's days (words saved, answers) join a moment later
  const now = new Date(); now.setHours(12, 0, 0, 0);
  let metric = metricPref();
  const MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
  const addD = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const key = (d) => d.toISOString().slice(0, 10);
  const ny = now.getFullYear(); const nm = now.getMonth();
  // ⚙️ one filter, three choices: days (the last 30) · weeks (the last 8) · months (the last 12) — nothing else
  const UNITS = [['d7', 'أيام', 'آخر ٧ أيام'], ['day', 'أيام', 'آخر ٣٠ يوم'], ['week', 'أسابيع', 'آخر ٨ أسابيع'], ['month', 'شهور', 'آخر ١٢ شهر']];
  let unitKey = 'd7';
  let open = false;
  let pick = '';
  let pickAuto = true; // the newest day / week / month is picked when the view changes
  const memo = new Map();
  const A = (d) => { const k = key(d); if (!memo.has(k)) memo.set(k, dayAll(d, days)); return memo.get(k); };
  const goalN = () => goalFor(METRICS[metric].goal); // the learner's own number for the chosen measure
  const lvl = (v, max) => { if (!v) return 0; const p = v / max; return p >= 0.75 ? 4 : p >= 0.5 ? 3 : p >= 0.25 ? 2 : 1; };

  // one bucket = a day, a week or a month: its totals for the measures and the days that have passed in it (the goal grows with them)
  const mkB = (from, to, gran, _x, label, sub, tl) => {
    const t = { time: 0, words: 0, practice: 0, rules: 0 };
    let n = 0;
    for (let d = new Date(from); d <= to && d <= now; d = addD(d, 1)) { const a = A(d); Object.keys(t).forEach((k) => { t[k] += a[k]; }); n += 1; }
    return { id: key(from), from, to, gran, span: n, label, sub, tl, t };
  };
  const dayB = (d) => mkB(d, d, 'day', 0, String(d.getDate()), WD[d.getDay()], `${d.getDate()}/${d.getMonth() + 1}`);
  const monB = (yy, mm) => mkB(new Date(yy, mm, 1, 12), new Date(yy, mm + 1, 0, 12), 'month', 0, String(mm + 1), MONTHS[mm].slice(0, 3), MONTHS[mm]);
  const build = () => {
    const list = [];
    if (unitKey === 'd7') for (let i = 6; i >= 0; i -= 1) list.push(dayB(addD(now, -i)));
    else if (unitKey === 'day') for (let i = 29; i >= 0; i -= 1) list.push(dayB(addD(now, -i)));
    else if (unitKey === 'week') for (let i = 7; i >= 0; i -= 1) { const to = addD(now, -7 * i); const f = addD(to, -6); list.push(mkB(f, to, 'week', 0, String(f.getDate()), String(f.getMonth() + 1), `${f.getDate()}/${f.getMonth() + 1}`)); }
    else for (let i = 11; i >= 0; i -= 1) { const d = new Date(ny, nm - i, 1, 12); list.push(monB(d.getFullYear(), d.getMonth())); }
    return { gran: unitKey === 'd7' ? 'day' : unitKey, list };
  };
  const GRAN = { day: 'يوم', week: 'أسبوع', month: 'شهر' };
  let V = build();
  const val = (b) => b.t[metric];
  const lineGoal = () => goalN() * Math.max(1, ...V.list.map((b) => b.span));
  const goalTxt = () => `${lineGoal()} ${METRICS[metric].unit} في ${{ day: 'اليوم', week: 'الأسبوع', month: 'الشهر' }[V.gran]}`;
  const hit = (b) => b.span > 0 && val(b) >= goalN() * b.span;

  // 📊 columns only; the goal line sits in the MIDDLE of the chart (a value of twice the goal fills the column)
  const bars = () => {
    const mx = lineGoal() * 2; const n = V.list.length; const step = Math.ceil(n / 12);
    return `<div class="cal-bars${n > 16 ? ' dense' : ''}" style="--g:.5"><div class="cb-goal" aria-hidden="true"><span>الهدف ${goalTxt()}</span></div>${V.list.map((b, i) => {
      const v = val(b);
      const pct = v ? Math.max(6, Math.min(100, Math.round((100 * v) / mx))) : 0;
      const showL = n <= 16 || i % step === 0 || i === n - 1;
      return `<button type="button" class="cb${pick === b.id ? ' pick' : ''}${b.from <= now && b.to >= now ? ' today' : ''}${hit(b) ? ' hit' : ''}" data-d="${b.id}"><em>${n > 16 ? '' : (v || '')}</em><i><b class="l${lvl(v, mx)}" style="height:${pct}%"></b></i><span>${showL ? b.label : ''}</span><small>${n > 16 ? '' : b.sub}</small></button>`;
    }).join('')}</div>`;
  };
  const bTitle = (b) => (b.gran === 'day' ? `${DAY_NAMES[b.from.getDay()]} ${b.from.getDate()}/${b.from.getMonth() + 1}` : b.gran === 'week' ? `من ${b.from.getDate()}/${b.from.getMonth() + 1} إلى ${b.to.getDate()}/${b.to.getMonth() + 1}` : `${MONTHS[b.from.getMonth()]} ${b.from.getFullYear()}`);

  // 🧮 a summary of buckets: totals of the measures and the days they cover — what the part below the chart shows
  const summ = (list) => ({ t: list.reduce((o, b) => { Object.keys(o).forEach((k) => { o[k] += b.t[k]; }); return o; }, { time: 0, words: 0, practice: 0, rules: 0 }), days: list.reduce((n, b) => n + b.span, 0), from: list[0]?.from, to: list[list.length - 1]?.to, n: list.length });
  const activeG = () => goalTypes();
  const rows4 = (S) => Object.entries(METRICS).map(([k, mt]) => { const goal = goalFor(mt.goal) * Math.max(1, S.days); return { k, mt, got: S.t[k], goal, pct: S.t[k] / goal, on: activeG().includes(mt.goal) }; }).filter((x) => x.on);
  const avgOf = (S) => { const rs = rows4(S); return rs.length ? Math.round((100 * rs.reduce((a, x) => a + Math.min(1, x.pct), 0)) / rs.length) : 0; };
  const before = (S) => { const len = Math.max(1, S.days); const f = addD(S.from, -len); return summ([mkB(f, addD(S.from, -1), 'x', 0, '', '', '')]); };
  const deltaHtml = (cur, prev, what) => {
    let cls = 'flat'; let sym = '＝'; let txt = '٠٪';
    if (!prev && !cur) { txt = '—'; } else if (!prev) { cls = 'up'; sym = '▲'; txt = 'أول نشاط'; } else {
      const pc = Math.round((100 * (cur - prev)) / prev);
      if (pc > 0) { cls = 'up'; sym = '▲'; txt = `+${pc}٪`; } else if (pc < 0) { cls = 'down'; sym = '▼'; txt = `−${Math.abs(pc)}٪`; }
    }
    return `<div class="cd-delta ${cls}"><span class="cd-arr">${sym}</span><b class="en-inline">${txt}</b><small>${what}</small></div>`;
  };
  const avgBlock = (S, deltaH) => `<div class="cd-avg cd-avg-s"><div class="cd-avg-top"><span>نسبة تحقيق الهدف</span><b class="en-inline">${avgOf(S)}٪</b></div>${deltaH}</div>`;
  const colsHtml = (S) => { const rs = rows4(S); return `<div class="cd-cols" style="--n:${rs.length}">${rs.map((x) => `<div class="cd-col${x.pct >= 1 ? ' ok' : ''}"><b class="en-inline cd-v">${x.got}</b><i class="cd-tr"><b style="height:${Math.min(100, Math.round(100 * x.pct))}%"></b></i><span class="cd-n">${x.mt.label}</span><small class="tiny muted en-inline">${x.goal}</small></div>`).join('')}</div>`; };

  const lineHtml = (S) => `<div class="det-line" dir="ltr">${rows4(S).map((x) => `<span>${x.mt.label.split(' ')[0]} <b class="en-inline">${x.got}</b></span>`).join('<i>·</i>')}</div>`;
  const dash = () => {
    if (!V.list.length) return '';
    const b = pick ? V.list.find((x) => x.id === pick) : null;
    const S1 = b ? summ([b]) : summ(V.list);
    const title = UNITS.find((u) => u[0] === unitKey)[2];
    const t1 = b ? (b.from <= now && b.to >= now && b.gran === 'day' ? 'اليوم' : bTitle(b)) : `الإجمالي · ${title}`;
    const back = b ? '<button type="button" class="cd-back" data-clearpick>الإجمالي</button>' : '';
    const prev = before(S1);
    const what = b ? ({ day: 'عن اليوم السابق', week: 'عن الأسبوع السابق', month: 'عن الشهر السابق' }[b.gran]) : ({ d7: 'عن الـ٧ أيام السابقة', day: 'عن الـ٣٠ يوم السابقة', week: 'عن الأسابيع الـ٨ السابقة', month: 'عن الشهور الـ١٢ السابقة' }[unitKey]);
    return `<div class="det"><div class="det-top"><b>${esc(t1)}</b>${back}${lineHtml(S1)}</div>${avgBlock(S1, deltaHtml(avgOf(S1), avgOf(prev), what))}</div>`;
  };

  // 🎯 the goals editor (two basics). Changing a goal never deletes what was done: the days stay as counted.
  let editing = false;
  const modeOf = (k) => (ls(`goal.mode.${k}`, 'day') === 'total' ? 'total' : 'day');
  const totalOf = (k) => { let o = null; try { o = JSON.parse(ls(`goal.total.${k}`, 'null')); } catch { /* none */ } return { n: Number(o?.n) || goalFor(k) * 30, per: Number(o?.per) || 1, u: [1, 7, 30].includes(Number(o?.u)) ? Number(o.u) : 30 }; };
  const drawGoals = () => {
    const off = ls('goal.off', '0') === '1';
    const ICO = { pass: '📚', practice: '🎮' }; const NAME = { pass: 'كلمات جديدة', practice: 'أسئلة تدريب' };
    box.innerHTML = `<div class="cal gl"><h3 class="gl-h">🎯 أهدافك</h3>
      ${['pass', 'practice'].map((k) => {
    const tot = totalOf(k); const mode = modeOf(k);
    return `<div class="gl-row" data-gt="${k}"><b class="gl-t">${ICO[k]} ${NAME[k]}</b>
        ${mode === 'day'
    ? `<div class="gl-in"><input class="input en-inline" data-gn="${k}" type="number" inputmode="numeric" min="1" value="${goalFor(k)}"><span>كل يوم</span></div><button type="button" class="gl-link" data-gm="${k}:total">أو عدد إجمالي</button>`
    : `<div class="gl-in"><input class="input en-inline" data-gtot="${k}" type="number" inputmode="numeric" min="1" value="${tot.n}"><select class="input" data-gper="${k}"><option value="7" ${tot.per * tot.u === 7 ? 'selected' : ''}>في أسبوع</option><option value="30" ${tot.per * tot.u === 30 ? 'selected' : ''}>في شهر</option><option value="90" ${tot.per * tot.u === 90 ? 'selected' : ''}>في ٣ شهور</option></select></div><span class="gl-eq">= <b class="en-inline">${goalFor(k)}</b> كل يوم</span><button type="button" class="gl-link" data-gm="${k}:day">يومي</button>`}
      </div>`; }).join('')}
      <label class="gl-alert"><input type="checkbox" class="check" id="goalAlert" ${off ? '' : 'checked'}><span>نبّهني لما أوصل هدفي</span></label>
      <div class="btn-row" style="justify-content:center"><button class="btn primary" data-donegoals>تم</button></div></div>`;
  };

  const FILTER_IC = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.5 5h17l-6.5 8v5.5L10 20v-7z"/></svg>';
  const draw = () => {
    if (editing) return drawGoals();
    if (!METRICS[metric] || !activeG().includes(METRICS[metric].goal)) metric = Object.keys(METRICS).find((k) => activeG().includes(METRICS[k].goal)) || 'words';
    V = build();
    if (pickAuto) { pick = V.list[V.list.length - 1]?.id || ''; pickAuto = false; }
    if (pick && !V.list.some((b) => b.id === pick)) pick = '';
    const title = UNITS.find((u) => u[0] === unitKey)[2];
    const mets = Object.entries(METRICS).filter(([, mt]) => activeG().includes(mt.goal));
    box.innerHTML = `<div class="cal act">
      <div class="ch"><b>${title}</b><span class="ch-tools">${mets.length > 1 ? `<span class="segmented seg-mini" id="calMetric">${mets.map(([k, mt]) => `<button type="button" data-cm="${k}" class="${metric === k ? 'active' : ''}" aria-label="${mt.label.replace(/^\S+\s/, '')}">${mt.label.split(' ')[0]}</button>`).join('')}</span>` : ''}<button type="button" class="flt${open ? ' on' : ''}" data-fltoggle aria-expanded="${open}" aria-label="فلتر الفترة">${FILTER_IC}</button></span></div>
      ${open ? `<div class="wz-list act-menu">${UNITS.map(([k, , d]) => `<button type="button" class="wz-opt${unitKey === k ? ' on' : ''}" data-unit="${k}"><span>${d}</span></button>`).join('')}</div>` : ''}
      <div class="cal-shape">${bars()}</div>
      ${dash()}
      <div class="cal-key tiny"><span class="cal-gkey"><i></i> الهدف ${goalTxt()}</span></div>
      <button type="button" class="act-edit" data-editgoals>✏️ عدّل أهدافك</button>
    </div>`;
  };
  box.addEventListener('change', (e) => {
    if (!editing) return;
    if (e.target.id === 'goalAlert') { lsSet('goal.off', e.target.checked ? '0' : '1'); return; }
    const n = e.target.closest('[data-gn]');
    if (n) setGoalN(n.dataset.gn, Number(n.value));
    const row = e.target.closest('[data-gt]');
    if (row && e.target.closest('[data-gtot],[data-gper]')) {
      // a total over a period → shared equally on the days (rounded up so the total is reached)
      const k = row.dataset.gt;
      const nTot = Math.max(1, Number(row.querySelector('[data-gtot]').value) || 1);
      const per = Number(row.querySelector('[data-gper]').value) || 30;
      lsSet(`goal.total.${k}`, JSON.stringify({ n: nTot, per, u: 1 }));
      setGoalN(k, Math.ceil(nTot / per));
    }
    drawGoals();
  });
  box.addEventListener('click', (e) => {
    if (e.target.closest('[data-editgoals]')) { editing = true; draw(); return; }
    if (e.target.closest('[data-donegoals]')) { editing = false; draw(); return; }
    const gm = e.target.closest('[data-gm]');
    if (gm) { const [k, m] = gm.dataset.gm.split(':'); lsSet(`goal.mode.${k}`, m); if (m === 'total') { const t = totalOf(k); setGoalN(k, Math.ceil(t.n / (t.per * t.u))); } drawGoals(); return; }
    const cm = e.target.closest('[data-cm]');
    if (cm && METRICS[cm.dataset.cm]) { metric = cm.dataset.cm; lsSet('today.metric', metric); draw(); return; }
    if (e.target.closest('[data-fltoggle]')) { open = !open; draw(); return; }
    const un = e.target.closest('[data-unit]');
    if (un) { unitKey = un.dataset.unit; open = false; pickAuto = true; draw(); return; }
    if (e.target.closest('[data-clearpick]')) { pick = ''; draw(); return; }
    const d = e.target.closest('[data-d]');
    if (d) { pick = pick === d.dataset.d ? '' : d.dataset.d; draw(); } // a tap picks that day/week/month; the same tap again goes back to the summary of the whole period
  });
  draw();
  api.calendar().then((r) => { days = r.days || {}; memo.clear(); if (!editing) draw(); }).catch(() => {});
}
