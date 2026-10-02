import { api } from '../api.js';
import { esc, icon, BUCKET_AR, emptyState, toast } from '../ui.js';
import { wordRowHtml, bindWordList } from '../components.js';
import { runFlashcards } from '../flashcards.js';

const BUCKET_INFO = {
  new: 'كلمات حفظتها ولم تراجعها بعد',
  review: 'حان موعد مراجعتها حسب التكرار المتباعد',
  difficult: 'كلمات أخطأت فيها كثيرًا',
  mistakes: 'أخطأت فيها في آخر مرة',
};

export async function render(view, { params }) {
  let cleanup = null;
  const plan = await api.today();

  if (!plan.total) {
    view.innerHTML = `<div class="page-head"><div><h1>تعلّم اليوم</h1></div></div>
      ${emptyState('🌱', 'لا توجد كلمات محفوظة بعد', 'حلّل فيديو واحفظ الكلمات المفيدة، وسنختار لك خطة يومية تلقائيًا.', `<a class="btn primary" href="#/analyzer">${icon.youtube} حلّل فيديو</a>`)}`;
    return;
  }

  const remaining = plan.items.filter((i) => !i.completed);
  const pct = Math.round((100 * plan.completed) / plan.total);

  function overview() {
    view.innerHTML = `
      <div class="page-head">
        <div><div class="eyebrow">${new Date().toLocaleDateString('ar', { weekday: 'long', day: 'numeric', month: 'long' })}</div><h1>تعلّم اليوم</h1>
        <p>${plan.total} كلمات اخترناها تلقائيًا لك اليوم.</p></div>
        <div class="btn-row">
          ${remaining.length ? `<button class="btn primary lg" id="start">${plan.completed ? 'تابع' : 'ابدأ'} (${remaining.length}) ←</button>` : ''}
          <button class="btn" id="more">${icon.plus} 5 كلمات إضافية</button>
        </div>
      </div>
      <div class="card" style="margin-bottom:18px">
        <div class="row between"><b>التقدّم</b><span class="en-inline">${plan.completed}/${plan.total}</span></div>
        <div class="bar" style="margin:10px 0 16px"><span style="width:${pct}%"></span></div>
        <div class="grid cols-4">${Object.entries(plan.counts).map(([b, n]) => `
          <div class="card soft stat"><div class="value">${n}</div><div class="label">${BUCKET_AR[b]}</div><div class="hint">${BUCKET_INFO[b]}</div></div>`).join('')}</div>
      </div>
      ${!remaining.length ? `<div class="alert info" style="margin-bottom:18px"><b>🎉 أنهيت خطة اليوم!</b><span>ثبّت ما تعلمته بلعبة سريعة أو أضف كلمات إضافية.</span>
        <div class="btn-row"><a class="btn sm" href="#/games?scope=today">${icon.game} ألعاب اليوم</a><a class="btn sm" href="#/listening?scope=today">${icon.headphones} استمع</a></div></div>` : ''}
      <div class="word-list" id="list">${plan.items.map((w) => wordRowHtml(w, { bucket: w.bucket }).replace('class="word-row', `class="word-row${w.completed ? ' dismissed' : ''}`)).join('')}</div>`;
    view.querySelector('#start')?.addEventListener('click', start);
    view.querySelector('#more').addEventListener('click', async () => {
      const next = await api.extendToday(5);
      if (next.total === plan.total) return toast('لا توجد كلمات إضافية متاحة الآن');
      toast(`أضفنا ${next.total - plan.total} كلمات`);
      render(view, { params });
    });
    bindWordList(view.querySelector('#list'), () => plan.items, { onChange: () => render(view, { params }) });
  }

  function start() {
    view.innerHTML = `<div class="page-head"><div><h1>تعلّم اليوم</h1><p>اقلب البطاقة ثم قيّم مدى سهولة الكلمة.</p></div>
      <button class="btn ghost" id="back">إنهاء الجلسة</button></div><div id="session"></div>`;
    view.querySelector('#back').addEventListener('click', () => render(view, { params }));
    cleanup = runFlashcards(view.querySelector('#session'), remaining, {
      source: 'today',
      doneActions: `<a class="btn primary" href="#/games?scope=today">${icon.game} العب بكلمات اليوم</a><a class="btn" href="#/">الرئيسية</a>`,
    });
  }

  if (params.start && remaining.length) start();
  else overview();
  return () => cleanup?.();
}
