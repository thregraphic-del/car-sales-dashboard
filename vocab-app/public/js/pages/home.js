import { api } from '../api.js';
import { state } from '../state.js';
import { esc, icon, num, thumbHtml, relDate, BUCKET_AR, emptyState } from '../ui.js';
import { wordRowHtml, bindWordList } from '../components.js';
import { GAMES } from './games.js';

export async function render(view) {
  const [stats, plan, campaigns, videos] = await Promise.all([api.stats(), api.today(), api.campaigns(), api.videos()]);
  const pct = plan.total ? Math.round((100 * plan.completed) / plan.total) : 0;
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'صباح الخير' : hour < 18 ? 'مساء الخير' : 'مساء النور';
  const dateStr = new Date().toLocaleDateString('ar', { weekday: 'long', day: 'numeric', month: 'long' });
  const remaining = plan.items.filter((i) => !i.completed);
  const lastVideo = videos[0];
  const todayGames = ['choose-meaning', 'connections', 'listen-choose', 'fill-blank'].map((id) => GAMES.find((g) => g.id === id));

  const splitChips = Object.entries(plan.counts)
    .filter(([, n]) => n)
    .map(([b, n]) => `<span class="chip ar-chip">${n} ${BUCKET_AR[b]}</span>`)
    .join('');

  view.innerHTML = `
    <div class="page-head">
      <div><div class="eyebrow">${esc(dateStr)}</div><h1>${greet}، ${esc(state.user?.name || '')} 👋</h1>
      <p>${stats.due ? `لديك ${stats.due} كلمة مستحقة للمراجعة اليوم.` : 'لا توجد مراجعات متأخرة — عمل رائع.'}</p></div>
      <a class="btn" href="#/analyzer">${icon.youtube} تحليل فيديو جديد</a>
    </div>

    <div class="card hero">
      <div class="ring" style="--p:${pct}"><div><div class="num">${plan.completed}<span class="muted" style="font-size:16px">/${plan.total}</span></div><div class="tiny muted">تقدّم اليوم</div></div></div>
      <div>
        <h2>${plan.total === 0 ? 'احفظ كلماتك الأولى لتبدأ' : pct >= 100 ? 'أنهيت خطة اليوم 🎉' : `${plan.total} كلمات لليوم`}</h2>
        <p class="ink-2" style="margin-top:6px">${plan.total === 0 ? 'حلّل فيديو يوتيوب واحفظ الكلمات المفيدة، وسنبني لك خطة يومية تلقائيًا.' : 'اخترنا لك مزيجًا من الكلمات الجديدة والمراجعة والصعبة — لا داعي للتفكير فيما تذاكره.'}</p>
        <div class="split">${splitChips}</div>
      </div>
      <div class="btn-row">
        ${plan.total === 0 ? `<a class="btn primary lg" href="#/analyzer">ابدأ بتحليل فيديو</a>`
          : pct >= 100 ? `<a class="btn lg" href="#/games?scope=today">${icon.game} العب بكلمات اليوم</a>`
          : `<a class="btn primary lg" href="#/today">${plan.completed ? 'تابع التعلّم' : 'ابدأ تعلّم اليوم'}</a>`}
      </div>
    </div>

    <div class="grid cols-5" style="margin-top:16px">
      <a class="card stat link" href="#/progress"><div class="value">🔥 ${stats.streak.current}</div><div class="label">سلسلة الأيام</div><div class="hint">الأفضل: ${stats.streak.best} يوم</div></a>
      <a class="card stat link" href="#/vocabulary"><div class="value">${num(stats.total)}</div><div class="label">إجمالي المفردات</div><div class="hint">+${stats.saved_today} اليوم</div></a>
      <a class="card stat link" href="#/vocabulary?status=mastered"><div class="value" style="color:var(--good)">${num(stats.mastered)}</div><div class="label">كلمات متقنة</div><div class="hint">${stats.learning} قيد التعلّم</div></a>
      <a class="card stat link" href="#/review"><div class="value">${num(stats.due)}</div><div class="label">مستحقة للمراجعة</div><div class="hint">${stats.difficult} كلمات صعبة</div></a>
      <a class="card stat link" href="#/today"><div class="value">${pct}%</div><div class="label">إنجاز اليوم</div><div class="hint">${stats.reviews_today} إجابة اليوم</div></a>
    </div>

    <div class="section-title"><h2>كلمات اليوم</h2><a href="#/today">عرض الكل ←</a></div>
    <div id="todayWords" class="word-list">${remaining.length || plan.items.length
      ? (remaining.length ? remaining : plan.items).slice(0, 5).map((w) => wordRowHtml(w, { bucket: w.bucket })).join('')
      : emptyState('📭', 'لا توجد كلمات بعد', 'احفظ كلمات من فيديو لتظهر هنا.')}</div>

    <div class="section-title"><h2>ألعاب اليوم</h2><a href="#/games">كل الألعاب ←</a></div>
    <div class="game-grid">${todayGames.map((g) => `
      <a class="card game-card" href="#/games/${g.id}?scope=today" style="text-decoration:none">
        <div class="game-icon">${icon[g.icon]}</div><h3 style="font-size:16px">${g.name}</h3><p class="small muted">${g.desc}</p>
      </a>`).join('')}</div>

    <div class="section-title"><h2>تابع التعلّم</h2><a href="#/campaigns">الحملات ←</a></div>
    <div class="grid cols-3">
      ${campaigns.slice(0, 2).map((c) => `
        <a class="card camp-card camp-${esc(c.color || 'teal')}" href="#/campaigns/${c.id}" style="text-decoration:none">
          <div><div class="tiny muted">حملة</div><h3>${esc(c.name)}</h3></div>
          <div class="bar"><span style="width:${c.progress}%"></span></div>
          <div class="row between small"><span>${c.completed} / ${c.total} مكتملة</span><span class="muted">${c.due} للمراجعة</span></div>
        </a>`).join('')}
      ${lastVideo ? `
        <a class="card" href="#/analyzer?video=${lastVideo.id}" style="text-decoration:none;display:grid;gap:10px">
          ${thumbHtml(lastVideo, { duration: lastVideo.duration_seconds })}
          <div class="en" style="font-weight:600">${esc(lastVideo.title)}</div>
          <div class="small muted">${lastVideo.saved_count} محفوظة من ${lastVideo.item_count} · ${esc(relDate(lastVideo.analyzed_at))}</div>
        </a>` : ''}
    </div>`;

  const words = plan.items;
  bindWordList(view.querySelector('#todayWords'), () => words, { onChange: () => render(view) });
}
