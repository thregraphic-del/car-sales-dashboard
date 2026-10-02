import { api } from '../api.js';
import { esc, icon, emptyState } from '../ui.js';
import { runFlashcards } from '../flashcards.js';

const SCOPES = [
  ['due', 'المستحقة'],
  ['difficult', 'الصعبة'],
  ['today', 'كلمات اليوم'],
  ['yesterday', 'الأمس'],
  ['week', 'هذا الأسبوع'],
  ['all', 'الكل'],
];

export async function render(view, { params }) {
  let words;
  let title = 'المراجعة';
  const scope = params.scope || (params.ids || params.campaign ? null : 'due');
  if (params.ids) {
    words = await api.words({ ids: params.ids });
    title = 'بطاقة';
  } else if (params.campaign) {
    const c = await api.campaign(params.campaign);
    title = `بطاقات: ${c.name}`;
    // Due first, then weakest.
    words = [...c.words].sort((a, b) => Number(b.due) - Number(a.due) || a.mastery - b.mastery);
  } else if (scope === 'due') {
    words = await api.words({ status: 'due' });
  } else if (scope === 'difficult') {
    words = await api.words({ section: 'difficult' });
  } else if (scope === 'today') {
    words = (await api.gamePool('today')).words;
  } else {
    words = await api.words({ section: scope });
  }
  if (scope && scope !== 'due') words = words.sort(() => Math.random() - 0.5);
  words = words.slice(0, 30);

  view.innerHTML = `
    <div class="page-head"><div><div class="eyebrow">Flashcards · Spaced repetition</div><h1>${esc(title)}</h1>
      <p>أجب بصدق: ❌ صعبة تعيد الكلمة قريبًا، ✅ سهلة تباعد موعدها.</p></div></div>
    ${scope ? `<div class="tabs">${SCOPES.map(([k, l]) => `<a class="tab ${k === scope ? 'active' : ''}" href="#/review?scope=${k}">${l}</a>`).join('')}</div>` : ''}
    <div id="session"></div>`;
  const session = view.querySelector('#session');
  if (!words.length) {
    session.innerHTML = emptyState('✨', scope === 'due' ? 'لا توجد مراجعات مستحقة الآن' : 'لا توجد كلمات هنا', 'ستظهر الكلمات تلقائيًا عندما يحين موعد مراجعتها.',
      `<div class="btn-row" style="justify-content:center"><a class="btn" href="#/review?scope=difficult">راجع الكلمات الصعبة</a><a class="btn" href="#/games">${icon.game} العب</a></div>`);
    return;
  }
  return runFlashcards(session, words, {
    source: 'flashcard',
    doneActions: `<a class="btn primary" href="#/games">${icon.game} ألعاب</a><button class="btn" onclick="location.reload()">جلسة أخرى</button>`,
  });
}
