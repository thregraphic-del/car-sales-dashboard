import { progress as goalProgress } from '../goal.js';
// اليوم — one screen, three things: greeting + streak (→ calendar), start today's session,
// and two small shortcuts (yesterday's words · continue watching).
import { api } from '../api.js';
import { maybeTour } from '../tour.js';
import { state } from '../state.js';
import { esc, icon, openModal } from '../ui.js';

export async function render(view) {
  const [{ plan, stats }, sources, yesterday] = await Promise.all([api.today(), api.sources(), api.words({ section: 'yesterday' }).catch(() => [])]);
  state.stats = stats;
  const left = plan.items.filter((i) => !i.completed);
  const hour = new Date().getHours();
  const greet = hour >= 4 && hour < 12 ? 'صباح الخير' : hour >= 12 && hour < 17 ? 'هلا' : 'مساء الخير';
  const name = state.user?.name && state.user.name !== 'Learner' ? `، ${esc(state.user.name)}` : '';
  const last = sources.find((x) => x.kind === 'youtube' && Number(x.progress_seconds) > 5) || sources.find((x) => x.kind === 'youtube');
  const parts = [
    plan.counts.difficult + plan.counts.mistakes ? `${plan.counts.difficult + plan.counts.mistakes} تحتاج تدريب` : '',
    plan.counts.review ? `${plan.counts.review} مراجعة` : '',
    plan.counts.new ? `${plan.counts.new} جديدة` : '',
  ].filter(Boolean).join(' · ');

  const main = !stats.total
    ? `<a class="card today-main" href="#/add"><span class="tm-ic">${icon.plus}</span><b>ابدأ بأول كلماتك</b><span class="small ink-2">الصق رابط يوتيوب أو كلمات</span></a>`
    : left.length
      ? `<a class="card today-main" href="#/practice?session=today"><span class="tm-ic">${icon.play}</span><b>ابدأ تدريب اليوم (${left.length})</b><span class="small ink-2">${parts}</span></a>
         ${left.length > 5 ? `<a class="quick-session" href="#/practice?mode=cards&ids=${left.slice(0, 5).map((i) => i.uv_id).join(',')}&exact=1&n=2">⏱ مستعجل؟ جلسة دقيقتين — ٥ كلمات بس</a>` : ''}`
      : `<div class="card today-main done"><span class="tm-ic">${icon.check}</span><b>أنهيت جلسة اليوم 🎉</b><button class="btn sm" id="more">${icon.plus} 5 كلمات إضافية</button></div>
         <div class="next-steps"><b class="small">وش بعد؟</b>
           ${last ? `<a class="ns" href="#/source/${last.id}">▶ كمّل «${esc(last.title.slice(0, 34))}»</a><a class="ns" href="#/practice?mode=quiz&source=${last.id}&size=5&n=3">🎯 اختبار سريع على كلمات آخر مقطع</a>` : ''}
           <a class="ns" href="#/add">＋ أضف مقطع جديد</a></div>`;

  view.innerHTML = `
    <button type="button" class="today-head" id="calBtn" title="تقويم أدائك">
      <span class="th-greet">${greet}${name}</span>
      <span class="streak-chip">🔥 ${stats.streak.current} ${stats.streak.current === 1 ? 'يوم' : 'أيام'} ${icon.today}</span>
    </button>
    <div class="week-strip" id="weekStrip" aria-label="آخر ٧ أيام"></div>
    ${(() => { const p = goalProgress(); return `<a class="card goal-bar" href="#/settings" title="غيّر هدفك من الإعدادات"><span class="row between"><b>🎯 هدف اليوم: ${p.short}</b><span class="en-inline">${p.count} / ${p.n} ${p.unit}${p.done ? ' ✓' : ''}</span></span><span class="gb-track"><span class="gb-fill" style="width:${p.pct}%"></span></span></a>`; })()}
    ${main}
    <div class="today-two">
      ${yesterday.length ? `<a class="card t2" href="#/practice?mode=cards&ids=${yesterday.slice(0, 60).map((w) => w.uv_id).join(',')}&yesterday=1&exact=1&n=1"><span class="t2-ic">${icon.sun}</span><b>كلمات أمس</b><span class="tiny muted">${yesterday.length}</span></a>` : `<a class="card t2" href="#/words"><span class="t2-ic">${icon.book}</span><b>كلماتي</b><span class="tiny muted">${stats.total}</span></a>`}
      ${last ? `<a class="card t2" href="#/source/${last.id}"><span class="t2-ic">${icon.play}</span><b>${Number(last.progress_seconds) > 5 ? 'أكمل المشاهدة' : 'آخر مقطع'}</b><span class="tiny muted en clamp1">${esc(last.title)}</span></a>` : `<a class="card t2" href="#/add"><span class="t2-ic">${icon.youtube}</span><b>أضف مقطع</b><span class="tiny muted">من يوتيوب</span></a>`}
    </div>`;

  view.querySelector('#calBtn').addEventListener('click', openCalendar);
  // 📅 the last 7 days, right on the page (tap = the full calendar)
  api.calendar().then((r) => {
    const strip = view.querySelector('#weekStrip');
    if (!strip) return;
    const goal = r.goal || 10;
    const D = ['أحد', 'إثن', 'ثلا', 'أرب', 'خمي', 'جمع', 'سبت'];
    const out = [];
    for (let i = 6; i >= 0; i -= 1) {
      const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() - i);
      const x = (r.days || {})[d.toISOString().slice(0, 10)];
      const n = x ? x.answers + x.saved + x.seen : 0;
      out.push(`<button type="button" class="ws-d l${n >= goal ? 2 : n ? 1 : 0}${i === 0 ? ' today' : ''}" title="${n} نشاط"><span>${D[d.getDay()]}</span><i>${n >= goal ? '✓' : n || ''}</i></button>`);
    }
    strip.innerHTML = out.join('');
    strip.addEventListener('click', openCalendar);
  }).catch(() => {});
  view.querySelector('#more')?.addEventListener('click', async () => { await api.extendToday(5); render(view); });
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
