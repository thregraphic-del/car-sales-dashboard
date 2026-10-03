// اليوم — "What should I learn today?" One clear next action, nothing to configure.
import { api } from '../api.js';
import { state } from '../state.js';
import { esc, icon, thumbHtml, relDate, levelChip } from '../ui.js';

export async function render(view) {
  const [{ plan, stats }, sources] = await Promise.all([api.today(), api.sources()]);
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
        <a class="btn primary lg" href="#/practice?session=today">ابدأ ←</a>
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
      ${stats.streak.current ? `<span class="streak-chip">🔥 ${stats.streak.current} ${stats.streak.current === 1 ? 'يوم' : 'أيام'}</span>` : ''}
    </div>
    ${main}

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
      </div>` : ''}`;

  view.querySelector('#more')?.addEventListener('click', async () => {
    await api.extendToday(5);
    render(view);
  });
}
