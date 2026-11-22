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
  let y = now.getFullYear();
  let m = now.getMonth();
  let metric = metricPref();
  let shape = ['squares', 'bars', 'line'].includes(ls('today.shape', 'squares')) ? ls('today.shape', 'squares') : 'squares';
  let pick = now.toISOString().slice(0, 10);
  const MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
  const at = (n) => { const d = new Date(now); d.setDate(now.getDate() - n); return d; };
  const key = (d) => d.toISOString().slice(0, 10);
  const val = (d) => dayValue(d, days, metric);
  const unit = () => METRICS[metric].unit;
  const lvl = (v, max) => { if (!v) return 0; const p = v / max; return p >= 0.75 ? 4 : p >= 0.5 ? 3 : p >= 0.25 ? 2 : 1; };
  const goalN = () => goalFor(METRICS[metric].goal); // the learner's own number (or the default) for the chosen measure
  const goalTxt = () => `${goalN()} ${unit()}`;
  const maxOf = (list) => Math.max(metric === 'time' ? 10 : 5, goalN(), ...list.map(val));
  const rangeDays = (n) => Array.from({ length: n }, (_, i) => at(n - 1 - i));

  const squares = () => {
    const start = new Date(y, m, 1, 12);
    const count = new Date(y, m + 1, 0).getDate();
    const list = Array.from({ length: count }, (_, i) => new Date(y, m, i + 1, 12));
    const mx = maxOf(list);
    const cells = [];
    for (let i = 0; i < start.getDay(); i += 1) cells.push('<span></span>');
    list.forEach((d) => {
      const v = val(d);
      const k = key(d);
      cells.push(`<button type="button" class="cal-d l${lvl(v, mx)}${dayActive(d, days) && !v ? ' act' : ''}${v >= goalN() ? ' hit' : ''} ${pick === k ? 'pick' : ''} ${k === key(now) ? 'today' : ''}" data-d="${k}"><b>${d.getDate()}</b><small>${v || ''}</small></button>`);
    });
    return `<div class="row between"><button class="btn icon sm ghost" data-m="1" ${new Date(y, m + 1, 1) > now ? 'disabled' : ''} aria-label="الشهر التالي">${icon.next}</button><b>${MONTHS[m]} ${y}</b><button class="btn icon sm ghost" data-m="-1" ${new Date(y, m, 1) <= new Date(first.getFullYear(), first.getMonth(), 1) ? 'disabled' : ''} aria-label="الشهر السابق">${icon.prev}</button></div>
      <div class="cal-w">${['أحد', 'إثن', 'ثلا', 'أرب', 'خمي', 'جمع', 'سبت'].map((d) => `<span>${d}</span>`).join('')}</div>
      <div class="cal-g">${cells.join('')}</div>`;
  };
  const bars = () => {
    const list = rangeDays(14);
    const mx = maxOf(list);
    return `<div class="cal-bars" style="--g:${(goalN() / mx).toFixed(3)}"><div class="cb-goal" aria-hidden="true"><span>الهدف ${goalTxt()}</span></div>${list.map((d) => {
      const v = val(d); const k = key(d);
      const pct = v ? Math.max(8, Math.round((100 * v) / mx)) : 0;
      return `<button type="button" class="cb${pick === k ? ' pick' : ''}${k === key(now) ? ' today' : ''}${v >= goalN() ? ' hit' : ''}" data-d="${k}"><em>${v || ''}</em><i><b class="l${lvl(v, mx)}" style="height:${pct}%"></b></i><span>${d.getDate()}</span><small>${WD[d.getDay()]}</small></button>`;
    }).join('')}</div>`;
  };
  const line = () => {
    const list = rangeDays(30);
    const mx = maxOf(list);
    const W = 320; const H = 130; const px = 14; const py = 14;
    const X = (i) => W - px - (i * (W - 2 * px)) / 29; // oldest at the right, like the columns and the week (Arabic reads right to left)
    const Y = (v) => H - py - ((H - 2 * py) * v) / mx;
    const pts = list.map((d, i) => [X(i), Y(val(d))]);
    const path = pts.map((q, i) => `${i ? 'L' : 'M'}${q[0].toFixed(1)} ${q[1].toFixed(1)}`).join(' ');
    const area = `${path} L${X(29).toFixed(1)} ${H - py} L${X(0).toFixed(1)} ${H - py} Z`;
    const lab = (i) => `${list[i].getDate()}/${list[i].getMonth() + 1}`;
    return `<svg class="cal-line" viewBox="0 0 ${W} ${H + 16}" role="img" aria-label="منحنى آخر ٣٠ يوم">
      <path d="M${px} ${H - py} H${W - px}" class="cl-axis"/><path class="cl-area" d="${area}"/>
      <path class="cl-goal" d="M${px} ${Y(goalN()).toFixed(1)} H${W - px}"/><text class="cl-gt" x="${px}" y="${(Y(goalN()) - 4).toFixed(1)}" text-anchor="start">الهدف ${goalTxt()}</text>
      <path class="cl-path" d="${path}"/>
      ${list.map((d, i) => `<circle class="cl-dot${key(d) === pick ? ' pick' : ''}${val(d) ? ' on' : ''}${val(d) >= goalN() ? ' hit' : ''}" cx="${pts[i][0].toFixed(1)}" cy="${pts[i][1].toFixed(1)}" r="${key(d) === pick ? 5 : 3}"/><circle class="cl-hit" data-d="${key(d)}" cx="${pts[i][0].toFixed(1)}" cy="${pts[i][1].toFixed(1)}" r="9"/>`).join('')}
      <text class="cl-t" x="${X(0)}" y="${H + 12}" text-anchor="end">${lab(0)}</text><text class="cl-t" x="${X(15)}" y="${H + 12}" text-anchor="middle">${lab(15)}</text><text class="cl-t" x="${X(29)}" y="${H + 12}" text-anchor="start">${lab(29)}</text></svg>`;
  };
  const shapeHtml = () => (shape === 'bars' ? bars() : shape === 'line' ? line() : squares());
  const rangeNote = () => {
    const list = shape === 'bars' ? rangeDays(14) : shape === 'line' ? rangeDays(30) : Array.from({ length: new Date(y, m + 1, 0).getDate() }, (_, i) => new Date(y, m, i + 1, 12));
    const sum = (k) => list.reduce((s, d) => s + dayAll(d, days)[k], 0);
    const act = list.filter((d) => dayActive(d, days)).length;
    return `${shape === 'bars' ? 'آخر ١٤ يوم' : shape === 'line' ? 'آخر ٣٠ يوم' : `${MONTHS[m]}`} · ${act} يوم نشاط · ${sum('time')} دقيقة · ${sum('words')} كلمة · ${sum('practice')} تدريب · ${sum('rules')} قاعدة`;
  };
  const dash = () => {
    const d = new Date(`${pick}T12:00:00`);
    const x = days[pick] || { answers: 0, right: 0, saved: 0, seen: 0 };
    const a = dayAll(d, days);
    const rate = x.answers ? Math.round((100 * x.right) / x.answers) : 0;
    const nothing = !a.time && !a.words && !a.practice && !a.rules && !x.saved && !x.seen;
    // the four goals of the day, each against its own number: the learner sees every side of the day at a glance
    const rows = Object.entries(METRICS).map(([k, mt]) => {
      const got = a[k]; const gl = goalFor(mt.goal);
      const pct = Math.min(100, Math.round((100 * got) / gl));
      return `<div class="cd-g${got >= gl ? ' ok' : ''}"><span class="cd-gl">${mt.label}</span><span class="cd-gs"><b class="en-inline">${got}</b><span class="tiny muted"> / ${gl} ${mt.unit}</span>${got >= gl ? ' ✓' : ''}</span><i class="cd-meter"><b style="width:${pct}%"></b></i></div>`;
    }).join('');
    return `<div class="cal-dash"><div class="cd-head"><b>${DAY_NAMES[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}</b>${pick === key(now) ? '<span class="th-chip">اليوم</span>' : ''}<button type="button" class="btn ghost sm cd-edit" data-editgoals>✏️ عدّل أهدافك</button></div>
      <div class="cd-goals">${rows}</div>
      ${nothing ? '<p class="tiny muted" style="margin:6px 0 0">ما فيه نشاط هذا اليوم.</p>' : ''}
      <div class="cd-grid">
        <div class="cd-card"><span class="cd-i">📚</span><b>${x.saved}</b><small>كلمة تعلّمتها (حفظتها)</small></div>
        <div class="cd-card"><span class="cd-i">🎯</span><b>${x.answers ? `${rate}٪` : '—'}</b><small>دقة التدريب${x.answers ? ` · ${x.answers} إجابة` : ''}</small>${x.answers ? `<i class="cd-meter"><b style="width:${rate}%"></b></i>` : ''}</div>
      </div></div>`;
  };
  // 🎯 the goals editor lives here (it used to be in the settings page)
  let editing = false;
  const drawGoals = () => {
    const sel = goalTypes(); const off = ls('goal.off', '0') === '1';
    const p = progress();
    box.innerHTML = `<div class="cal"><h3 style="margin:0 0 4px">🎯 عدّل أهدافك</h3>
      <p class="tiny muted" style="margin:0">اختر هدفًا واحدًا أو أكثر. لو اخترت أكثر من واحد يصير <b>هدفك مركّب</b>: يكتمل اليوم لما تحقق كلها، ولكل هدف عدده.</p>
      <div class="goal-rows" id="goalRows">${Object.entries(GOAL_TYPES).map(([k, g]) => `<div class="goal-row${sel.includes(k) ? ' on' : ''}" data-gt="${k}">
        <label class="goal-pick"><input type="checkbox" class="check" data-gc="${k}" ${sel.includes(k) ? 'checked' : ''}><span><b>${g.label}</b><span class="tiny muted">${g.note}</span></span></label>
        <span class="goal-num"><input class="input en-inline" data-gn="${k}" type="number" inputmode="numeric" min="${g.min}" max="${g.max}" value="${goalFor(k)}" ${sel.includes(k) ? '' : 'disabled'}> <span class="small">${g.unit}</span></span></div>`).join('')}</div>
      <label class="goal-pick" style="margin-top:10px"><input type="checkbox" class="check" id="goalAlert" ${off ? '' : 'checked'}><span><b>نبّهني لما أوصل هدفي</b></span></label>
      <span class="tiny muted" id="goalNow">${p.combo ? '<b>هدف مركّب</b> — ' : ''}اليوم: ${p.items.map((i) => `${i.short} <b class="en-inline">${i.count}/${i.n}</b>${i.done ? ' ✓' : ''}`).join(' · ')}</span>
      <div class="btn-row" style="justify-content:center;margin-top:12px"><button class="btn primary" data-donegoals>تم</button></div></div>`;
  };
  const draw = () => {
    if (editing) return drawGoals();
    box.innerHTML = `<div class="cal">
      <div class="cal-ctl">
        <div class="segmented seg4" id="calMetric">${Object.entries(METRICS).map(([k, mt]) => `<button type="button" data-cm="${k}" class="${metric === k ? 'active' : ''}">${mt.label}</button>`).join('')}</div>
        <div class="segmented" id="calShape">${[['squares', 'مربعات'], ['bars', 'أعمدة'], ['line', 'منحنى']].map(([k, l]) => `<button type="button" data-cs="${k}" class="${shape === k ? 'active' : ''}" aria-label="${l}" title="${l}"><span class="cs-i">${SHAPE_IC[k]}</span><span class="cs-t">${l}</span></button>`).join('')}</div>
      </div>
      <div class="cal-shape">${shapeHtml()}</div>
      <div class="cal-key tiny"><span>أقل</span><i class="l0"></i><i class="l1"></i><i class="l2"></i><i class="l3"></i><i class="l4"></i><span>أكثر</span><span class="muted">· ${METRICS[metric].key}</span><span class="cal-gkey"><i></i> الهدف ${goalTxt()}</span></div>
      ${dash()}
      <p class="cal-range tiny muted">${rangeNote()}</p>
      <div class="btn-row" style="justify-content:center"><button class="btn ghost" data-close>إغلاق</button></div></div>`;
  };
  box.addEventListener('change', (e) => {
    if (!editing) return;
    const c = e.target.closest('[data-gc]'); const n = e.target.closest('[data-gn]');
    if (e.target.id === 'goalAlert') { lsSet('goal.off', e.target.checked ? '0' : '1'); return; }
    if (c) {
      const now = new Set(goalTypes());
      if (c.checked) now.add(c.dataset.gc); else now.delete(c.dataset.gc);
      if (!now.size) { toast('لازم يبقى هدف واحد على الأقل'); drawGoals(); return; }
      setGoalTypes([...now]);
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
    const nav = e.target.closest('[data-m]');
    if (nav && !nav.disabled) { m -= Number(nav.dataset.m) * -1; if (m < 0) { m = 11; y -= 1; } if (m > 11) { m = 0; y += 1; } draw(); return; }
    const d = e.target.closest('[data-d]');
    if (d) { pick = d.dataset.d; draw(); }
  });
  draw();
}
