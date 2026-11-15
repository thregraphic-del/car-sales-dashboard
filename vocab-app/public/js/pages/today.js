// اليوم — a daily learning home, one clear task:
//   greeting + 🔔 (what's new · daily reminder) · 🔥 streak with this week's days
//   · «مراجعة كلمات آخر يوم» (the main task) · this week's progress.
import { api } from '../api.js';
import { maybeTour } from '../tour.js';
import { state } from '../state.js';
import { esc, icon, openModal, closeModal, toast } from '../ui.js';
import { dayStr } from '../goal.js';

const ls = (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch { /* storage off */ } };
const WD = ['ح', 'ن', 'ث', 'ر', 'خ', 'ج', 'س']; // Sun..Sat
const DAY_NAMES = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const shuffle = (a) => { const x = [...a]; for (let i = x.length - 1; i > 0; i -= 1) { const j = Math.floor(Math.random() * (i + 1)); [x[i], x[j]] = [x[j], x[i]]; } return x; };

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
  if (stats.streak.rescue) out.push(['🔥', `فاتك يوم — تدريب بسيط يرجّع شعلتك (${stats.streak.rescue.lost} ${stats.streak.rescue.lost === 1 ? 'يوم' : 'أيام'})`, 'rescue']);
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

  view.innerHTML = `<div class="th">
    <div class="th-top"><div><h1 class="th-hi">أهلًا بعودتك${name} 👋</h1><p class="th-sub">رحلة صغيرة اليوم، تقدّم أكبر غدًا.</p></div>
      <button type="button" class="th-bell${unseen ? ' dot' : ''}" id="bell" aria-label="الجديد والتذكير">${icon.bell}</button></div>
    <div class="th-streak${grey ? ' has-tip' : ''}">
      <button type="button" class="th-flame${grey ? ' grey' : ''}" id="flame" aria-label="الأيام المتتالية">
        ${grey ? '<span class="th-tip">ترجّع حماسك بتدريب بسيط ✨</span>' : ''}
        <span class="th-fl">🔥</span><b>${flameN}</b><span class="th-fl-t">أيام متتالية</span></button>
      <div class="th-week" id="week"></div>
    </div>
    ${task}
    <div class="card th-prog"><div class="row between"><b>تقدّمك هذا الأسبوع</b><span class="tiny muted">آخر ٧ أيام</span></div>
      <div class="th-pn"><b>${stats.week?.saved || 0}</b> <span>كلمة تعلّمتها</span></div>
      <div class="tiny muted">${icon.clock} ${weekMinutes()} دقيقة تعلّم</div></div>
  </div>`;

  // this week (Saturday → Friday): ✓ = something done, today ringed
  const drawWeek = (days = {}) => {
    const now = new Date(); now.setHours(12, 0, 0, 0);
    const sat = new Date(now); sat.setDate(now.getDate() - ((now.getDay() + 1) % 7));
    const out = [];
    for (let i = 0; i < 7; i += 1) {
      const d = new Date(sat); d.setDate(sat.getDate() + i);
      const key = d.toISOString().slice(0, 10);
      const x = days[key];
      const done = x && x.answers + x.saved + x.seen > 0;
      const isToday = d.toDateString() === now.toDateString();
      out.push(`<span class="th-d${done ? ' done' : ''}${isToday ? ' today' : ''}${d > now ? ' future' : ''}" title="${DAY_NAMES[d.getDay()]}">${done ? '✓' : WD[d.getDay()]}</span>`);
    }
    view.querySelector('#week').innerHTML = out.join('');
  };
  drawWeek();
  api.calendar().then((r) => drawWeek(r.days || {})).catch(() => {});
  view.querySelector('#week').addEventListener('click', openCalendar);

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
  view.querySelector('#bell').addEventListener('click', () => { lsSet('bell.seen', newsSig(items)); view.querySelector('#bell').classList.remove('dot'); openBell(items, act); });
  view.querySelector('#rvStart')?.addEventListener('click', () => openReviewSetup(ld.words));
  maybeTour('home');
}

/* 📅 A full calendar since the first day: colour = how much was done, tap a day for its numbers. */
async function openCalendar() {
  const box = openModal('<p class="tiny muted"><span class="spinner"></span></p>');
  let r;
  try { r = await api.calendar(); } catch (err) { box.innerHTML = `<p>${esc(err.message)}</p>`; return; }
  const days = r.days || {};
  const goal = r.goal || 10;
  const keys = Object.keys(days).sort();
  const first = keys[0] ? new Date(`${keys[0]}T12:00:00`) : new Date();
  const now = new Date();
  let y = now.getFullYear();
  let m = now.getMonth();
  const fmt = (d) => d.toISOString().slice(0, 10);
  const level = (d) => { const x = days[d]; if (!x) return 0; const n = x.answers + x.saved + x.seen; return n >= goal ? 2 : n ? 1 : 0; };
  const MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
  const draw = (pick = null) => {
    const start = new Date(y, m, 1, 12);
    const count = new Date(y, m + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < start.getDay(); i += 1) cells.push('<span></span>');
    for (let d = 1; d <= count; d += 1) {
      const key = fmt(new Date(y, m, d, 12));
      cells.push(`<button type="button" class="cal-d l${level(key)} ${pick === key ? 'pick' : ''} ${key === fmt(now) ? 'today' : ''}" data-d="${key}">${d}</button>`);
    }
    const x = pick && days[pick];
    const active = keys.length;
    box.innerHTML = `<div class="cal">
      <div class="row between"><button class="btn icon sm ghost" data-m="1" ${new Date(y, m + 1, 1) > now ? 'disabled' : ''}>${icon.next}</button><b>${MONTHS[m]} ${y}</b><button class="btn icon sm ghost" data-m="-1" ${new Date(y, m, 1) <= new Date(first.getFullYear(), first.getMonth(), 1) ? 'disabled' : ''}>${icon.prev}</button></div>
      <div class="cal-w">${['أحد', 'إثن', 'ثلا', 'أرب', 'خمي', 'جمع', 'سبت'].map((d) => `<span>${d}</span>`).join('')}</div>
      <div class="cal-g">${cells.join('')}</div>
      <div class="cal-key tiny"><i class="l0"></i> ما سويت شي <i class="l1"></i> شوي <i class="l2"></i> وصلت هدفك</div>
      <div class="cal-info">${pick ? (x ? `<b>${pick}</b> · مرّت ${x.seen} · حفظت ${x.saved} · ✅ ${x.right} · ❌ ${x.answers - x.right}` : `<b>${pick}</b> · ما فيه نشاط`) : `<span class="tiny muted">${active} يوم فيه نشاط منذ ${keys[0] || 'اليوم'} — اضغط أي يوم لأرقامه</span>`}</div>
      <div class="btn-row" style="justify-content:center"><button class="btn ghost" data-close>إغلاق</button></div></div>`;
  };
  box.addEventListener('click', (e) => {
    const nav = e.target.closest('[data-m]');
    if (nav && !nav.disabled) { m -= Number(nav.dataset.m) * -1; if (m < 0) { m = 11; y -= 1; } if (m > 11) { m = 0; y += 1; } draw(); return; }
    const d = e.target.closest('[data-d]');
    if (d) draw(d.dataset.d);
  });
  draw();
}
