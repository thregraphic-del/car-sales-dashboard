// اليوم — a daily learning home, one clear task:
//   greeting + 🔔 (what's new · daily reminder) · 🔥 streak with this week's days
//   · «مراجعة كلمات آخر يوم» (the main task) · this week's progress.
import { api } from '../api.js';
import { maybeTour } from '../tour.js';
import { state } from '../state.js';
import { esc, icon, openModal, closeModal, toast } from '../ui.js';
import { dayStr, goalFor, goalCfg } from '../goal.js';
import { setPending, checkDouble, doubleInfo } from '../streak-rescue.js';

const ls = (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch { /* storage off */ } };
const WD = ['ح', 'ن', 'ث', 'ر', 'خ', 'ج', 'س']; // Sun..Sat
const DAY_NAMES = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const shuffle = (a) => { const x = [...a]; for (let i = x.length - 1; i > 0; i -= 1) { const j = Math.floor(Math.random() * (i + 1)); [x[i], x[j]] = [x[j], x[i]]; } return x; };

/** Minutes watched today, counted on this device: «أقل من دقيقة» until a full minute. */
function todayMinutes() {
  const sec = Number(ls(`lt.watch.${dayStr()}`, 0)) || 0;
  return sec >= 60 ? `${Math.floor(sec / 60)} دقيقة` : sec > 0 ? 'أقل من دقيقة' : '٠ دقيقة';
}

/** What the dashboard measures: time watched on this device, or words learned (saved). */
const metricPref = () => (ls('today.metric', 'time') === 'words' ? 'words' : 'time');
const watchMin = (d) => Math.round((Number(ls(`lt.watch.${dayStr(d)}`, 0)) || 0) / 60);
const dayValue = (d, days, metric) => (metric === 'time' ? watchMin(d) : Number(days[d.toISOString().slice(0, 10)]?.saved || 0));
const dayActive = (d, days) => { const x = days[d.toISOString().slice(0, 10)]; return watchMin(d) > 0 || !!(x && x.answers + x.saved + x.seen > 0); };

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
  const t = ls('reminder.time', '');
  box.innerHTML = `<div class="bell-sheet stack">
    <h3 style="margin:0">${icon.bell} الجديد</h3>
    ${items.length ? `<div class="bell-list">${items.map(([ic, txt, act], i) => `<button type="button" class="bell-item" data-i="${i}"><span>${ic}</span><span>${esc(txt)}</span><span class="muted">‹</span></button>`).join('')}</div>` : '<p class="small muted">ما فيه شي جديد الحين 👌</p>'}
    <div class="divider"></div>
    <b>⏰ منبّه يومي</b>
    <div class="row" style="gap:8px;align-items:center;flex-wrap:wrap"><span class="small">ذكّرني الساعة</span><input class="input en-inline" id="remT" type="time" value="${esc(t)}" style="width:130px">
      <button class="btn sm primary" id="remSave">حفظ</button>${t ? '<button class="btn sm ghost" id="remOff">إيقاف</button>' : ''}</div>
    <p class="tiny muted" id="remNote">${t ? `المنبّه مضبوط على <b class="en-inline">${esc(t)}</b>.` : 'اختر ساعة، ونذكّرك كل يوم.'} للتنبيه حتى والموقع مقفل: <button type="button" class="link-btn" id="remCal">أضفه لتقويم جوالك 📅</button></p>
  </div>`;
  box.addEventListener('click', async (e) => {
    const it = e.target.closest('[data-i]');
    if (it) { closeModal(); onAct(items[Number(it.dataset.i)][2]); return; }
    if (e.target.closest('#remSave')) {
      const v = box.querySelector('#remT').value;
      if (!v) { toast('اختر الساعة أولًا'); return; }
      lsSet('reminder.time', v);
      try { if ('Notification' in window && Notification.permission === 'default') await Notification.requestPermission(); } catch { /* ignore */ }
      toast(`⏰ نذكّرك كل يوم الساعة ${v}`);
      closeModal();
    }
    if (e.target.closest('#remOff')) { try { localStorage.removeItem('reminder.time'); } catch { /* ignore */ } toast('أوقفنا المنبّه'); closeModal(); }
    if (e.target.closest('#remCal')) {
      const v = box.querySelector('#remT').value || t || '20:00';
      const [h, m] = v.split(':');
      const d = new Date(); const ymd = dayStr(d).replace(/-/g, '');
      const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//3Goal//AR', 'BEGIN:VEVENT', `UID:3goal-reminder-${Date.now()}@lexitube`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`,
        `DTSTART:${ymd}T${h}${m}00`, 'DURATION:PT10M', 'RRULE:FREQ=DAILY', 'SUMMARY:3Goal — راجع كلماتك 🔥', `URL:${location.origin}`,
        'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:وقت مراجعة كلماتك', 'TRIGGER:PT0M', 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
      a.download = '3goal-reminder.ics';
      document.body.appendChild(a); a.click(); a.remove();
    }
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
  const name = state.user?.name && state.user.name !== 'Learner' ? ` ${esc(state.user.name)}` : '';

  const task = ld
    ? `<div class="card th-task">
        <span class="th-chip" style="justify-self:start">مهمتك اليوم</span><b class="th-task-t th-big">مراجعة كلمات آخر يوم</b>
        <p class="ink-2 small">${ld.yesterday ? 'اختبر ذاكرتك واسترجع الكلمات اللي تعلمتها أمس.' : `ما تعلمت أمس — نقترح كلمات آخر يوم تعلمت فيه (${ld.name}).`}</p>
        <button class="btn th-go" id="rvStart">ابدأ المراجعة ←</button></div>`
    : `<a class="card th-task" href="#/add"><b class="th-task-t">ابدأ بأول كلماتك</b><div class="th-big">أضف مقطع</div><p class="ink-2 small">الصق رابط يوتيوب، ونجهّز لك كلماته — وبكرة تراجعها هنا.</p><span class="btn th-go">أضف ←</span></a>`;

  const dbl = doubleInfo();
  const sadFace = '<svg class="lost-svg" viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><g class="lost-head"><circle cx="30" cy="34" r="21"/><path d="M19.5 30.5l5.5-2.6M40.5 30.5l-5.5-2.6" stroke-width="2.2"/><circle cx="23" cy="34" r="1.7" fill="currentColor" stroke="none"/><circle cx="37" cy="34" r="1.7" fill="currentColor" stroke="none"/><path d="M22.5 46c2.2-3.6 12.8-3.6 15 0"/></g><path class="lost-tear" d="M42 38c-2 2.6-2.2 4.4-.6 5.3 1.6.9 3-.9 .6-5.3z" fill="currentColor" stroke="none"/><g class="lost-wave" stroke-width="2.2"><path d="M6 25c-2 3.2-2 7.8 0 11"/><path d="M1 21c-3.4 5.4-3.4 13.6 0 19"/></g></svg>';
  const lostCard = grey ? `<div class="card th-lost" id="lostCard"><div class="lost-row"><span class="lost-face">${sadFace}</span>
      <div class="lost-bubble"><b>شعلتك طفت — بس عادي!</b><span>يمكنك مضاعفة هدف اليوم ليتعدّل أمس</span></div></div>
      <div class="th-lost-m"><span>هدفك <b class="en-inline">${dbl.n}</b> ${esc(dbl.unit)} — المطلوب اليوم <b class="en-inline">${dbl.target}</b></span><span class="en-inline th-lost-c">${dbl.count}/${dbl.target}</span></div>
      <i class="th-lost-bar"><b style="width:${dbl.pct}%"></b></i>
      <button type="button" class="btn sm ghost" id="lostQuick">أو سوّ تدريب سريع (٥ كلمات) ←</button></div>` : '';
  view.innerHTML = `<div class="th">
    <div class="th-top"><div><h1 class="th-hi">أهلًا بعودتك${name} 👋</h1><p class="th-sub">رحلة صغيرة اليوم، تقدّم أكبر غدًا.</p></div>
      <button type="button" class="th-bell${unseen ? ' dot' : ''}" id="bell" aria-label="الجديد والتذكير">${icon.bell}</button></div>
    ${lostCard}
    <div class="th-streak${grey ? ' has-tip' : ''}">
      <button type="button" class="th-flame${grey ? ' grey' : ''}" id="flame" aria-label="الأيام المتتالية">
        ${grey ? '<span class="th-tip">ضاعف الهدف أو تدريب سريع ✨</span>' : ''}
        <span class="th-fl">🔥</span><b>${flameN}</b><span class="th-fl-t">أيام متتالية</span></button>
      <div class="th-weekwrap"><div class="th-week" id="week" role="button" tabindex="0" aria-label="تفاصيل الأسبوع"></div></div>
    </div>
    ${task}
    <div class="card th-prog"><div class="row between"><b>تقدّمك هذا الأسبوع</b><span class="tiny muted">آخر ٧ أيام</span></div>
      <div class="th-pn"><b>${stats.week?.saved || 0}</b> <span>كلمة تعلّمتها</span></div>
      <div class="tiny muted">${icon.clock} ${weekMinutes()} دقيقة تعلّم</div>
      <div class="th-today">اليوم <b class="en-inline">${todayMinutes()}</b> 💪</div></div>
  </div>`;

  // this week (Saturday → Friday): from the outside only one answer per day — did the learner reach the goal?
  // A coloured box with a spark = yes; a plain box with the day's letter = not yet. Tap = the full dashboard.
  let weekDays = {};
  const reachedOn = (d, days) => {
    const cfg = goalCfg();
    const k = dayStr(d);
    let n = 0;
    if (cfg.type === 'watch') n = Math.floor((Number(ls(`lt.watch.${k}`, 0)) || 0) / 60);
    else if (cfg.type === 'practice') n = Math.max(Number(ls(`lt.answers.${k}`, 0)) || 0, Number(days[d.toISOString().slice(0, 10)]?.answers || 0));
    else { try { n = JSON.parse(ls(`lt.passed.${k}`, '[]')).length; } catch { n = 0; } }
    return n >= cfg.n;
  };
  const drawWeek = (days = weekDays) => {
    weekDays = days;
    const now = new Date(); now.setHours(12, 0, 0, 0);
    const sat = new Date(now); sat.setDate(now.getDate() - ((now.getDay() + 1) % 7));
    const out = [];
    for (let i = 0; i < 7; i += 1) {
      const d = new Date(sat); d.setDate(sat.getDate() + i);
      const done = d <= now && reachedOn(d, days);
      const isToday = d.toDateString() === now.toDateString();
      out.push(`<span class="th-box${done ? ' done' : ''}${isToday ? ' today' : ''}${d > now ? ' future' : ''}" title="${DAY_NAMES[d.getDay()]}${done ? ' · حققت هدفك' : ''}">${done ? icon.sparkle : WD[d.getDay()]}</span>`);
    }
    view.querySelector('#week').innerHTML = out.join('');
  };
  drawWeek();
  api.calendar().then((r) => drawWeek(r.days || {})).catch(() => {});
  view.querySelector('#week').addEventListener('click', openCalendar);
  view.querySelector('#week').addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openCalendar(); } });

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
  view.querySelector('#flame').addEventListener('click', () => (grey ? rescue() : openCalendar()));
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
  const unit = () => (metric === 'time' ? 'دقيقة' : 'كلمة');
  const lvl = (v, max) => { if (!v) return 0; const p = v / max; return p >= 0.75 ? 4 : p >= 0.5 ? 3 : p >= 0.25 ? 2 : 1; };
  const goalN = () => goalFor(metric === 'time' ? 'watch' : 'pass'); // the learner's own number (or the default)
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
    const mins = list.reduce((s, d) => s + watchMin(d), 0);
    const words = list.reduce((s, d) => s + Number(days[key(d)]?.saved || 0), 0);
    const act = list.filter((d) => dayActive(d, days)).length;
    return `${shape === 'bars' ? 'آخر ١٤ يوم' : shape === 'line' ? 'آخر ٣٠ يوم' : `${MONTHS[m]}`} · ${act} يوم نشاط · ${mins} دقيقة · ${words} كلمة`;
  };
  const dash = () => {
    const d = new Date(`${pick}T12:00:00`);
    const x = days[pick] || { answers: 0, right: 0, saved: 0, seen: 0 };
    const min = watchMin(d);
    const rate = x.answers ? Math.round((100 * x.right) / x.answers) : 0;
    const nothing = !min && !x.answers && !x.saved && !x.seen;
    const got = val(d);
    const gl = goalN();
    const goalLine = `<div class="cd-goal${got >= gl ? ' ok' : ''}"><span>🎯 الهدف <b class="en-inline">${gl}</b> ${unit()} · ${metric === 'time' ? 'مشاهدة' : 'كلمات'}</span><span class="cd-goal-s">${got >= gl ? `✓ حققته (${got})` : `${got} — باقي ${gl - got}`}</span><i class="cd-meter"><b style="width:${Math.min(100, Math.round((100 * got) / gl))}%"></b></i></div>`;
    return `<div class="cal-dash"><div class="cd-head"><b>${DAY_NAMES[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}</b>${pick === key(now) ? '<span class="th-chip">اليوم</span>' : ''}</div>
      ${goalLine}
      ${nothing ? '<p class="tiny muted" style="margin:6px 0 0">ما فيه نشاط هذا اليوم.</p>' : ''}
      <div class="cd-grid">
        <div class="cd-card"><span class="cd-i">⏱</span><b>${min}</b><small>دقيقة مشاهدة</small></div>
        <div class="cd-card"><span class="cd-i">📚</span><b>${x.saved}</b><small>كلمة تعلّمتها</small></div>
        <div class="cd-card"><span class="cd-i">👁</span><b>${x.seen}</b><small>كلمة مرّت عليك</small></div>
        <div class="cd-card"><span class="cd-i">🎮</span><b>${x.answers}</b><small>إجابة تدريب${x.answers ? ` · ${rate}٪ صح` : ''}</small>${x.answers ? `<i class="cd-meter"><b style="width:${rate}%"></b></i>` : ''}</div>
      </div></div>`;
  };
  const draw = () => {
    box.innerHTML = `<div class="cal">
      <div class="cal-ctl">
        <div class="segmented" id="calMetric"><button type="button" data-cm="time" class="${metric === 'time' ? 'active' : ''}">⏱ الوقت</button><button type="button" data-cm="words" class="${metric === 'words' ? 'active' : ''}">📚 الكلمات</button></div>
        <div class="segmented" id="calShape">${[['squares', 'مربعات'], ['bars', 'أعمدة'], ['line', 'منحنى']].map(([k, l]) => `<button type="button" data-cs="${k}" class="${shape === k ? 'active' : ''}" aria-label="${l}" title="${l}"><span class="cs-i">${SHAPE_IC[k]}</span><span class="cs-t">${l}</span></button>`).join('')}</div>
      </div>
      <div class="cal-shape">${shapeHtml()}</div>
      <div class="cal-key tiny"><span>أقل</span><i class="l0"></i><i class="l1"></i><i class="l2"></i><i class="l3"></i><i class="l4"></i><span>أكثر</span><span class="muted">· ${metric === 'time' ? 'دقائق مشاهدة (على هذا الجهاز)' : 'كلمات تعلّمتها'}</span><span class="cal-gkey"><i></i> الهدف ${goalTxt()}</span></div>
      ${dash()}
      <p class="cal-range tiny muted">${rangeNote()}</p>
      <div class="btn-row" style="justify-content:center"><button class="btn ghost" data-close>إغلاق</button></div></div>`;
  };
  box.addEventListener('click', (e) => {
    const cm = e.target.closest('[data-cm]');
    if (cm) { metric = cm.dataset.cm; lsSet('today.metric', metric); draw(); return; }
    const cs = e.target.closest('[data-cs]');
    if (cs) { shape = cs.dataset.cs; lsSet('today.shape', shape); draw(); return; }
    const nav = e.target.closest('[data-m]');
    if (nav && !nav.disabled) { m -= Number(nav.dataset.m) * -1; if (m < 0) { m = 11; y -= 1; } if (m > 11) { m = 0; y += 1; } draw(); return; }
    const d = e.target.closest('[data-d]');
    if (d) { pick = d.dataset.d; draw(); }
  });
  draw();
}
