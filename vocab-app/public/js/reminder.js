// ⏰ Daily reminder: the learner picks a time and the days; then ONE clear page shows how to keep it in the phone's calendar (so it
// reminds even when the site is closed); and while the site is open a small banner named «3Goal — كمّل إنجازك» appears at the top
// when the time comes (and a system notification where the browser allows it). Everything is kept on this device; no server, no polling.
import { esc, openModal, closeModal, toast, icon } from './ui.js';
import { progress, dayStr } from './goal.js';

const DAYS = [['0', 'ح', 'الأحد', 'SU'], ['1', 'ن', 'الاثنين', 'MO'], ['2', 'ث', 'الثلاثاء', 'TU'], ['3', 'ر', 'الأربعاء', 'WE'], ['4', 'خ', 'الخميس', 'TH'], ['5', 'ج', 'الجمعة', 'FR'], ['6', 'س', 'السبت', 'SA']];
const get = (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
const put = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* storage off */ } };

export function getReminder() {
  const time = get('reminder.time', '');
  let days = [];
  try { days = JSON.parse(get('reminder.days', 'null')) || []; } catch { days = []; }
  days = days.map(String).filter((d) => DAYS.some((x) => x[0] === d));
  return { time, days: days.length ? days : DAYS.map((d) => d[0]) }; // no choice yet = every day
}
export const reminderSummary = (r = getReminder()) => (r.time ? `${r.time} · ${r.days.length === 7 ? 'كل يوم' : DAYS.filter((d) => r.days.includes(d[0])).map((d) => d[2]).join('، ')}` : '');

function saveReminder(time, days) {
  put('reminder.time', time);
  put('reminder.days', JSON.stringify(days));
  const [h, m] = time.split(':').map(Number);
  const now = new Date();
  put('reminder.shown', now.getHours() > h || (now.getHours() === h && now.getMinutes() >= m) ? dayStr() : null); // saved after the time today: no banner now, it starts the next chosen day
  scheduleReminder();
}
export function clearReminder() { put('reminder.time', null); put('reminder.days', null); scheduleReminder(); }

/** The calendar file: weekly on the chosen days, an alert at the time, named after the site. */
export function buildIcs({ time, days }) {
  const [h, m] = time.split(':');
  const by = DAYS.filter((d) => days.includes(d[0])).map((d) => d[3]);
  // the first day that really is one of the chosen days (today if the time has not passed yet)
  const now = new Date();
  const first = new Date(now);
  for (let i = 0; i < 8; i += 1) {
    const cand = new Date(now); cand.setDate(now.getDate() + i);
    const past = i === 0 && (now.getHours() > Number(h) || (now.getHours() === Number(h) && now.getMinutes() >= Number(m)));
    if (days.includes(String(cand.getDay())) && !past) { first.setTime(cand.getTime()); break; }
  }
  const ymd = dayStr(first).replace(/-/g, '');
  const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15);
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//3Goal//AR', 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT', `UID:3goal-reminder-${stamp}@lexitube`, `DTSTAMP:${stamp}Z`,
    `DTSTART:${ymd}T${h}${m}00`, 'DURATION:PT10M', `RRULE:FREQ=WEEKLY;BYDAY=${by.join(',')}`, 'SUMMARY:3Goal — كمّل إنجازك', `DESCRIPTION:كمّل إنجازك اليوم في 3Goal`, `URL:${location.origin}`,
    'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:3Goal — كمّل إنجازك', 'TRIGGER:PT0M', 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
}
// iPhone ignores a downloaded data: link, so the calendar file comes from a real address that answers with
// «text/calendar» — Safari then offers «Add to Calendar» by itself (other browsers download the .ics).
function openCalendarFile(r) {
  const [h, m] = r.time.split(':');
  const now = new Date();
  let first = new Date(now);
  for (let i = 0; i < 8; i += 1) {
    const cand = new Date(now); cand.setDate(now.getDate() + i);
    const past = i === 0 && (now.getHours() > Number(h) || (now.getHours() === Number(h) && now.getMinutes() >= Number(m)));
    if (r.days.includes(String(cand.getDay())) && !past) { first = cand; break; }
  }
  const q = new URLSearchParams({ time: r.time, days: r.days.join(','), start: dayStr(first).replace(/-/g, '') });
  window.location.href = `/api/reminder.ics?${q}`;
}

const chips = (sel) => DAYS.map(([v, short, name]) => `<button type="button" class="rem-day${sel.includes(v) ? ' on' : ''}" data-d="${v}" aria-pressed="${sel.includes(v)}" title="${name}">${short}</button>`).join('');

/** Step 1: time and days → «التالي». Step 2: how to keep it in the calendar. */
export function openReminderFlow({ onDone } = {}) {
  const cur = getReminder();
  let days = [...cur.days];
  const box = openModal('');
  const step1 = () => {
    box.innerHTML = `<button class="btn icon sm ghost modal-close" data-close aria-label="إغلاق">${icon.x}</button><div class="rem-flow stack">
      <div class="rem-steps tiny muted">الخطوة ١ من ٢</div>
      <h2 style="margin:0">⏰ منبّه كمّل إنجازك</h2>
      <label class="field"><span class="small">الساعة</span><input class="input en-inline" id="remT" type="time" value="${esc(cur.time || '20:00')}" style="max-width:150px"></label>
      <div class="field"><span class="small">الأيام اللي يذكّرك فيها</span><div class="rem-days" id="remDays">${chips(days)}</div></div>
      <div class="btn-row"><button type="button" class="btn primary" id="remNext">التالي ←</button>${cur.time ? '<button type="button" class="btn ghost bad" id="remOff">إيقاف المنبّه</button>' : ''}</div></div>`;
    box.querySelector('#remDays').addEventListener('click', (e) => {
      const b = e.target.closest('[data-d]');
      if (!b) return;
      days = days.includes(b.dataset.d) ? days.filter((x) => x !== b.dataset.d) : [...days, b.dataset.d];
      box.querySelector('#remDays').innerHTML = chips(days);
    });
    box.querySelector('#remNext').addEventListener('click', () => {
      const time = box.querySelector('#remT').value;
      if (!time) { toast('اختر الساعة أولًا'); return; }
      if (!days.length) { toast('اختر يومًا واحدًا على الأقل'); return; }
      saveReminder(time, days);
      step2({ time, days });
    });
    box.querySelector('#remOff')?.addEventListener('click', () => { clearReminder(); toast('أوقفنا المنبّه'); closeModal(); onDone?.(); });
  };
  const step2 = (r) => {
    box.innerHTML = `<button class="btn icon sm ghost modal-close" data-close aria-label="إغلاق">${icon.x}</button><div class="rem-flow stack">
      <div class="rem-steps tiny muted">الخطوة ٢ من ٢</div>
      <h2 style="margin:0">احفظه في التقويم</h2>
      <p class="small ink-2" style="margin:0">عشان يذكّرك التقويم باسم <b>«3Goal — كمّل إنجازك»</b> في <b>${esc(reminderSummary(r))}</b> — حتى والموقع مقفل:</p>
      <ol class="rem-how">
        <li><span class="rem-n">١</span><span>اضغط الزر الأزرق <b>«افتح التقويم»</b> تحت.</span></li>
        <li><span class="rem-n">٢</span><span>تطلع شاشة التقويم: اضغط <b>«إضافة»</b> (أو <b>Add All</b>) فوق.</span></li>
        <li><span class="rem-n">٣</span><span>خلاص ✓ يتكرر التذكير كل أسبوع في الأيام اللي اخترتها.</span></li>
      </ol>
      <button type="button" class="btn primary rem-cal" id="remCal"><span class="ico" aria-hidden="true">${icon.calendar || '📅'}</span> افتح التقويم</button>
      <p class="tiny muted" style="margin:0">وكمان: لما تفتح الموقع بعد الوقت يطلع لك إشعار فوق باسم «3Goal — كمّل إنجازك».</p>
      <div class="btn-row"><button type="button" class="btn" id="remDone">تم ✓</button><button type="button" class="btn ghost" id="remSkip">تخطّي — إشعار الموقع فقط</button></div></div>`;
    box.querySelector('#remCal').addEventListener('click', () => openCalendarFile(r));
    const finish = (msg) => { toast(msg); closeModal(); onDone?.(); };
    box.querySelector('#remDone').addEventListener('click', () => finish('⏰ تم — نذكّرك بإذن الله'));
    box.querySelector('#remSkip').addEventListener('click', () => finish('⏰ المنبّه شغّال داخل الموقع'));
    try { if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission().catch(() => {}); } catch { /* ignore */ }
  };
  step1();
}

/** The top banner: the site's name and «كمّل إنجازك». */
export function showReminderBanner() {
  document.querySelector('.rem-banner')?.remove();
  const el = document.createElement('div');
  el.className = 'rem-banner';
  el.setAttribute('role', 'status');
  el.innerHTML = `<img src="/img/3goal-mark-64.png" alt="" width="28" height="28"><span class="rem-b-t"><b>3Goal</b><span>كمّل إنجازك</span></span><a class="btn sm primary" href="#/">كمّل ←</a><button type="button" class="btn icon sm ghost" aria-label="إغلاق">${icon.x}</button>`;
  el.querySelector('button').addEventListener('click', () => el.remove());
  el.querySelector('a').addEventListener('click', () => el.remove());
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 20000);
}

function fire() {
  const r = getReminder();
  if (!r.time || !r.days.includes(String(new Date().getDay())) || get('reminder.shown', '') === dayStr()) return;
  if (progress().done) return; // the goal is already reached today
  put('reminder.shown', dayStr());
  showReminderBanner();
  try {
    if (document.visibilityState === 'hidden' && 'Notification' in window && Notification.permission === 'granted') {
      new Notification('3Goal', { body: 'كمّل إنجازك', icon: '/img/3goal-mark-192.png', tag: '3goal-reminder' });
    }
  } catch { /* the browser does not allow it */ }
}

let timer = 0;
/** While the site is open: show the banner at the time (or right away if the site is opened after it). One local timer, nothing is asked from the server. */
export function scheduleReminder() {
  clearTimeout(timer);
  const r = getReminder();
  if (!r.time) return;
  const [h, m] = r.time.split(':').map(Number);
  const now = new Date();
  const at = new Date(now); at.setHours(h, m, 0, 0);
  if (at <= now) { fire(); at.setDate(at.getDate() + 1); } // opened after the time: tell now (once a day)
  timer = setTimeout(() => { fire(); scheduleReminder(); }, Math.min(at - now, 2 ** 31 - 1));
}
export function startReminder() {
  scheduleReminder();
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') scheduleReminder(); });
}
