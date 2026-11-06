// اليوم — "What should I learn today?" One clear next action, nothing to configure.
import { api } from '../api.js';
import { startTour, maybeTour } from '../tour.js';
import { state } from '../state.js';
import { esc, icon, thumbHtml, relDate, levelChip } from '../ui.js';

export async function render(view) {
  const [{ plan, stats, watch_goal: wg }, sources, yesterday] = await Promise.all([api.today(), api.sources(), api.words({ section: 'yesterday' }).catch(() => [])]);
  state.stats = stats;
  const left = plan.items.filter((i) => !i.completed);
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'صباح الخير' : 'مساء الخير';
  const minutes = Math.max(2, Math.round(left.length * 0.5));

  let main;
  if (!stats.total) {
    main = `
      <div class="card hero-simple">
        <div class="hero-emoji">🌱</div>
        <h2>ابدأ بأول كلماتك</h2>
        <p class="ink-2">الصق رابط فيديو يوتيوب إنجليزي، أو كلمات، أو أي نص — وسنحوّله إلى كلمات تتعلمها وتراجعها تلقائيًا.</p>
        <a class="btn primary lg" href="#/add">${icon.plus} أضف فيديو أو نصًا</a>
        <p class="small muted" style="margin-top:14px">عندك كلمات في النسخة المحلية؟ <a href="#/settings">انقلها من الإعدادات ← بياناتك</a></p>
      </div>`;
  } else if (left.length) {
    const parts = [
      plan.counts.difficult + plan.counts.mistakes ? `${plan.counts.difficult + plan.counts.mistakes} تحتاج تدريب` : '',
      plan.counts.review ? `${plan.counts.review} مراجعة` : '',
      plan.counts.new ? `${plan.counts.new} جديدة` : '',
    ].filter(Boolean).join(' · ');
    main = `
      <div class="card hero-simple">
        <div class="ring sm" style="--p:${plan.total ? Math.round((100 * plan.completed) / plan.total) : 0}"><div><div class="num">${left.length}</div><div class="tiny muted">كلمات</div></div></div>
        <div style="flex:1;min-width:220px">
          <h2>${plan.completed ? 'تابع جلسة اليوم' : 'جلسة اليوم جاهزة'}</h2>
          <p class="ink-2">${parts} · حوالي ${minutes} دقائق</p>
          <div class="word-peek en">${left.slice(0, 6).map((w) => `<span>${esc(w.term)}</span>`).join('')}${left.length > 6 ? '<span class="muted">…</span>' : ''}</div>
        </div>
        <a class="btn primary lg today-go" href="#/practice?session=today">▶ ابدأ تدريب اليوم</a>
      </div>`;
  } else {
    main = `
      <div class="card hero-simple">
        <div class="hero-emoji">🎉</div>
        <div style="flex:1;min-width:220px"><h2>أنهيت جلسة اليوم</h2>
        <p class="ink-2">${stats.due ? `ما زالت ${stats.due} كلمة جاهزة للمراجعة.` : 'كل شيء مراجَع. أضف كلمات جديدة أو العب اختبارًا سريعًا.'}</p></div>
        <div class="btn-row">
          <a class="btn primary" href="#/practice?mode=quiz">${icon.game} اختبار سريع</a>
          <button class="btn" id="more">${icon.plus} 5 كلمات إضافية</button>
        </div>
      </div>`;
  }

  view.innerHTML = `
    <div class="page-head compact">
      <div><h1>${greet}${state.user?.name && state.user.name !== 'Learner' ? `، ${esc(state.user.name)}` : ''}</h1></div>
      <span class="row" style="gap:8px"><button type="button" class="tour-btn" id="tourBtn" title="شرح الموقع">!</button>
      ${stats.streak.current ? `<span class="streak-chip">🔥 ${stats.streak.current} ${stats.streak.current === 1 ? 'يوم' : 'أيام'}</span>` : ''}</span>
    </div>
    ${main}
    ${(() => {
      // Start of the day: yesterday's words as quick cards; the watching goal; the video to continue.
      const last = sources.find((x) => x.kind === 'youtube' && Number(x.progress_seconds) > 5) || sources.find((x) => x.kind === 'youtube');
      const pct = wg ? Math.min(100, Math.round((100 * wg.count) / Math.max(1, wg.goal))) : 0;
      const tiles = [
        yesterday.length ? `<a class="card day-tile" href="#/practice?mode=cards&ids=${yesterday.slice(0, 60).map((w) => w.uv_id).join(',')}&yesterday=1">
          <div class="day-ico">☀️</div><div><b>راجع كلمات أمس</b><div class="small ink-2">${yesterday.length} ${yesterday.length === 1 ? 'كلمة' : 'كلمات'} · بطاقات سريعة</div></div></a>` : '',
        wg ? `<div class="card day-tile"><div class="day-ico">🎯</div><div style="flex:1"><b>هدف المشاهدة اليوم</b>
          <div class="small ink-2">مررت على <b class="en-inline">${Math.min(wg.count, wg.goal)}/${wg.goal}</b> كلمة${wg.count >= wg.goal ? ' — أحسنت ✓' : ''}</div>
          <div class="bar" style="margin-top:6px"><span style="width:${pct}%"></span></div></div></div>` : '',
        last ? `<a class="card day-tile" href="#/source/${last.id}"><div class="day-ico">▶</div><div style="min-width:0"><b>${Number(last.progress_seconds) > 5 ? 'أكمل المشاهدة' : 'آخر مقطع'}</b>
          <div class="small ink-2 en clamp1">${esc(last.title)}</div></div></a>` : '',
      ].filter(Boolean);
      const wk = stats.week;
      const weekLine = wk && (wk.saved || wk.reviews || wk.seen)
        ? `<p class="small ink-2 week-line">📅 هذا الأسبوع: <b class="en-inline">${wk.seen}</b> كلمة مررت عليها · <b class="en-inline">${wk.saved}</b> حفظتها · <b class="en-inline">${wk.reviews}</b> إجابة تدريب${wk.reviews ? ` (${Math.round((100 * wk.correct) / wk.reviews)}% صحيحة)` : ''}</p>` : '';
      return (tiles.length ? `<div class="day-tiles">${tiles.join('')}</div>` : '') + weekLine;
    })()}

    <details class="more-box"><summary>المزيد ▾</summary>
    ${stats.attention.length ? `
      <div class="section-title"><h2>تحتاج انتباهك</h2><a href="#/practice?focus=difficult">تدرّب عليها ←</a></div>
      <div class="attention">${stats.attention.map((w) => `
        <a class="attn" href="#/practice?ids=${w.uv_id}&mode=cards"><span class="en">${esc(w.term)}</span>${levelChip(w.level)}<span class="small ink-2">${esc(w.arabic || '')}</span></a>`).join('')}
      </div>` : ''}

    ${sources.length ? `
      <div class="section-title"><h2>تابع القراءة والمشاهدة</h2><a href="#/add">أضف جديدًا ←</a></div>
      <div class="grid cols-3">${sources.slice(0, 3).map((s) => `
        <a class="video-mini" href="#/source/${s.id}">${thumbHtml(s, { duration: s.duration_seconds })}
          <div style="min-width:0"><div class="en small clamp2" style="font-weight:600">${esc(s.title)}</div>
          <div class="tiny muted">${s.saved_count} محفوظة · ${esc(relDate(s.analyzed_at))}</div></div></a>`).join('')}
      </div>` : ''}
    <a class="card day-tile" href="#/friends" style="margin-top:12px"><div class="day-ico">👥</div><div><b>أصدقائي</b><div class="small ink-2">تحدَّ صديق وشارك تقدمك</div></div></a>
    </details>`;

  view.querySelector('#tourBtn')?.addEventListener('click', () => startTour('home'));
  maybeTour('home');
  view.querySelector('#more')?.addEventListener('click', async () => {
    await api.extendToday(5);
    render(view);
  });
}
