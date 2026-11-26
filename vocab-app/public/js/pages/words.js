// كلماتي — everything saved, organised in learner-named groups.
import { api } from '../api.js';
import { state, loadGroups, grammarOn } from '../state.js';
import { esc, icon, emptyState, toast, openModal, closeModal, num, levelChip } from '../ui.js';
import { wordRowHtml, bindWordList, openWordCard, bindSpeech } from '../components.js';
import { libTabs } from '../grammar-library.js';
import { TYPES, GAME_ORDER } from '../quiz.js';
import { filterBarHtml, filterBarClick, placeMenus, closeOnOutside, ytThumb, LEVELS, WHEN_OPTS } from '../filter-bar.js';

// ✅ states from the quiz answers (see answerState on the server)
const FILTERS = [
  ['all', 'الكل'],
  ['new', 'جديدة'],
  ['review', 'تحتاج مراجعة'],
  ['hard', 'صعبة'],
  ['mastered', 'متقنة'],
];

export async function render(view, { params }) {
  // 📚 «القواعد» lives beside the words in the same library
  if (params.tab === 'grammar' && grammarOn()) return (await import('../grammar-library.js')).render(view, { params });
  let [all] = await Promise.all([api.words(), loadGroups()]); // both at once
  const f = { filter: params.filter || 'all', group: params.group ? Number(params.group) : null, q: '', levels: [], when: params.when || '', source: params.source ? Number(params.source) : null, sort: 'new', count: 0, view: 'list' };
  let tab = params.tab === 'practice' ? 'practice' : 'words'; // كلماتي = الكلمات | تدرّب (| القواعد when the grammar mode is on)
  let fbOpen = '';
  let groupsOpen = false;
  let clusters = null; // «الأوضح»: words with one meaning under the simplest one
  const DAY = 86400000;
  const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); };
  const WHEN = { today: () => [startOfToday(), Infinity], yesterday: () => [startOfToday() - DAY, startOfToday()], week: () => [startOfToday() - 6 * DAY, Infinity], month: () => [startOfToday() - 29 * DAY, Infinity] };
  let select = false;
  let pendingGroup = null; // a group just created: pick its words (by level, one by one, or all) then add them
  if (window.__pg) { pendingGroup = window.__pg; window.__pg = null; select = true; } // created from the «تدرّب» section: continue here
  const selected = new Set();
  let shown = [];

  // a short page: the title, one stats card, Words | Grammar, a row of icons (each opens its own panel), then the words
  const WI = {
    filter: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 5h17l-6.5 7.8V19l-4 2v-8.2z"/></svg>',
    grid: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="3.5" width="7" height="7" rx="2"/><rect x="13.5" y="3.5" width="7" height="7" rx="2"/><rect x="3.5" y="13.5" width="7" height="7" rx="2"/><rect x="13.5" y="13.5" width="7" height="7" rx="2"/></svg>',
    sort: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M8 20V5M4.5 8.5 8 5l3.5 3.5M16 4v15M12.5 15.5 16 19l3.5-3.5"/></svg>',
  };
  let renderLimit = 60; let listSig = ''; let moreObs = null;
  let panel = ''; // which icon's panel is open: search · filter · sort · groups
  view.innerHTML = `
    <div class="page-head compact"><div><h1>كلماتي</h1></div><div class="wd-corner"><button type="button" class="wd-t wd-sm" data-wt="search" aria-label="بحث" title="بحث">${icon.search}</button><button type="button" class="wd-t wd-sm" id="exportBtn" aria-label="تنزيل" title="تنزيل">${icon.download}</button></div></div>
    <div class="card wd-stats" id="summary"></div>
    <div class="lib-tabs segmented wd-seg" role="tablist"><a href="#/words" role="tab" class="${tab === 'words' ? 'active' : ''}">الكلمات <b id="wCount"></b></a><a href="#/words?tab=practice" role="tab" class="${tab === 'practice' ? 'active' : ''}">تدرّب</a><a href="#/words?tab=grammar" role="tab" data-grammar-only>القواعد <b id="gCount"></b></a></div>
    <div class="wd-tools" id="wdTools">
      <button type="button" class="wd-t" data-wt="filter" aria-label="فلاتر" title="فلاتر">${WI.filter}<span>فلاتر</span></button>
      <button type="button" class="wd-t" id="selectToggle" aria-label="تحديد" title="تحديد">${icon.check}<span>تحديد</span></button>
      <button type="button" class="wd-t" data-wt="groups" aria-label="المجموعات" title="المجموعات">${icon.folder}<span>مجموعات</span></button>
    </div>
    <div id="selectBar"></div>
    <div class="words-search hidden" id="wsearch"><span class="search-ico">${icon.search}</span><input class="input" id="q" type="search" placeholder="ابحث بالإنجليزية أو العربية…"></div>
    <div class="chip-row" id="filters"></div>
    <div class="chip-row groups-row" id="groups"></div>
    <div id="groupHead"></div>
    <div id="list"></div>`;
  const $ = (s) => view.querySelector(s);

  const matches = (w) => {
    if (f.group && !w.group_ids.includes(f.group)) return false;
    if (f.filter === 'practice' && !(w.state === 'review' || w.state === 'hard')) return false;
    if (['new', 'review', 'hard', 'mastered'].includes(f.filter) && w.state !== f.filter) return false;
    if (f.levels.length && !f.levels.includes(w.level)) return false;
    if (f.when && WHEN[f.when]) {
      const t = new Date(w.saved_at).getTime();
      const [from, to] = WHEN[f.when]();
      if (!(t >= from && t < to)) return false;
    }
    if (f.source && w.source?.id !== f.source) return false;
    const q = f.q.trim().toLowerCase();
    if (q && !`${w.term} ${w.arabic || ''} ${w.arabic_general || ''}`.toLowerCase().includes(q)) return false;
    return true;
  };

  // 🎮 «تدرّب»: the same filters as the list — the words you see (or the ones you ticked) are the ones you train on
  const GAME_TILES = [
    { mode: 'quiz', icon: icon.check, name: 'اختبار' },
    { mode: 'cards', icon: icon.cards, name: 'البطاقات' },
    { mode: 'listen', icon: icon.headphones, name: 'استماع' },
    { mode: 'story', icon: icon.bookOpen, name: 'قصة' },
    { mode: 'twins', icon: icon.search, name: 'المتشابهة' },
    ...GAME_ORDER.map((k) => ({ mode: 'games', type: k, icon: icon[TYPES[k].icon] || '🎮', name: TYPES[k].name })),
  ];
  const practiceSet = () => shown;
  function drawPractice() {
    $('#selectBar').innerHTML = '';
    const set = practiceSet();
    const n = set.length;
    const filtered = f.filter !== 'all' || f.group || f.levels.length || f.when || f.source || f.q || f.count;
    $('#list').innerHTML = !all.length ? emptyState('📚', 'ما حفظت كلمات للحين', 'أضف فيديو أو كلمات، ثم ارجع هنا للتدريب.', `<a class="btn primary" href="#/add">${icon.plus} أضف</a>`)
      : `<div class="wd-prac">
        <div class="card pb-start wd-prac-top"><div class="wd-prac-n"><b class="en-inline">${n.toLocaleString('en-US')}</b> كلمة للتدريب<small>${filtered ? 'حسب الفلاتر فوق' : 'كل كلماتك — استخدم الفلاتر والمجموعات فوق لتختار'}</small></div>
          <button type="button" class="btn primary pb-go" data-pg="quiz:" ${n ? '' : 'disabled'}>تدرّب ${icon.play}</button></div>
        <div class="pb-grid">${GAME_TILES.map((g) => `<button type="button" class="pb-game pb-tile" data-pg="${g.mode}:${g.type || ''}" ${n || g.mode === 'twins' ? '' : 'disabled'}><span class="pb-gi">${g.icon}</span><b>${g.name}</b></button>`).join('')}</div>
        ${n ? '' : '<p class="small muted" style="text-align:center;margin-top:10px">ما فيه كلمات بهذي الفلاتر — جرّب تغيّر الفلتر.</p>'}
        <a class="btn sm ghost wd-prac-gram" href="#/practice?area=grammar" data-grammar-only>📚 تدرّب على القواعد</a>
      </div>`;
    $('#wCount').textContent = shown.length ? `(${shown.length.toLocaleString('en-US')})` : '';
  }

  function draw() {
    const mastered = all.filter((w) => w.state === 'mastered').length;
    const practice = all.filter((w) => w.state === 'review' || w.state === 'hard').length;
    $('#summary').innerHTML = all.length
      ? `<span class="wd-sl">إجمالي الكلمات</span><b class="wd-sn en-inline">${all.length.toLocaleString('en-US')}</b><span class="wd-ss">${num(mastered)} متقنة · ${num(practice)} مراجعة</span>`
      : '<span class="wd-sl">ما حفظت كلمات للحين</span>';
    // which icon is lit, and which panel is open under the row
    view.querySelectorAll('[data-wt]').forEach((b) => {
      const k = b.dataset.wt;
      b.classList.toggle('on', k === 'view' ? f.view === 'clear' : panel === k || (k === 'filter' && fbOpen && panel === 'filter'));
    });
    if (tab === 'practice') { select = false; selected.clear(); } // no ticking in «تدرّب»: only the filters and the groups
    $('#selectToggle').classList.toggle('on', select);
    $('#selectToggle').classList.toggle('hidden', tab === 'practice');
    $('#wsearch').classList.toggle('hidden', panel !== 'search' && !f.q);
    const defs = barDefs();
    $('#filters').innerHTML = panel === 'filter' ? `<div class="pb-filters wd-fl">${filterBarHtml(defs, fbOpen)}</div>` : '';
    placeMenus($('#filters'));
    // 📁 groups: the panel of every group + «مجموعة جديدة» + «إدارة المجموعات» (opened by the folder icon)
    const gSel = state.groups.find((x) => x.id === f.group);
    groupsOpen = panel === 'groups';
    $('#groups').innerHTML = groupsOpen ? `<div class="grp-panel">${state.groups.map((g) => `<button class="gchip ${f.group === g.id ? 'on' : ''}" data-g="${g.id}">${esc(g.name)} <span class="en-inline tiny">${g.count}</span></button>`).join('') || '<span class="tiny muted">ما عندك مجموعات بعد.</span>'}
        <div class="grp-actions"><button class="gchip new" id="newGroup">+ مجموعة جديدة</button>${state.groups.length > 1 ? '<button class="gchip new" id="manageGroups">⚙ إدارة المجموعات</button>' : ''}</div></div>` : (gSel ? `<button type="button" class="gchip on" data-ungroup title="إلغاء المجموعة والرجوع للكل" aria-label="إلغاء المجموعة">${esc(gSel.name)}</button>` : '');
    const g = state.groups.find((x) => x.id === f.group);
    $('#groupHead').innerHTML = g ? `
      <div class="card group-head">
        <div><b style="font-size:17px">${esc(g.name)}</b><div class="small ink-2">${g.count} كلمة · ${g.due} للمراجعة · ${g.difficult} تحتاج تدريب · التقدّم ${g.progress}%</div></div>
        <div class="btn-row">
          <a class="btn primary sm" href="#/practice?group=${g.id}">${icon.game} تدرّب على المجموعة</a>
          <button class="btn sm ghost" data-gact="rename">${icon.edit} تسمية</button>
          <button class="btn sm ghost" data-gact="delete" style="color:var(--bad)">${icon.trash}</button>
        </div>
      </div>` : '';
    if (f.view === 'clear') {
      drawClear();
      $('#selectBar').innerHTML = '';
      return;
    }
    // the list is drawn in slices (60 first, more as you scroll): thousands of rows at once make a phone slow
    const sig = JSON.stringify([f.filter, f.group, f.q, f.levels, f.when, f.source, f.sort, f.count, f.view]);
    if (sig !== listSig) { listSig = sig; renderLimit = 60; }
    shown = all.filter(matches);
    const sorters = { old: (a, b) => new Date(a.saved_at) - new Date(b.saved_at), az: (a, b) => a.term.localeCompare(b.term), hard: (a, b) => (b.difficulty || 0) - (a.difficulty || 0) || a.mastery - b.mastery };
    if (sorters[f.sort]) shown.sort(sorters[f.sort]);
    if (f.count) shown = shown.slice(0, f.count);
    if (tab === 'practice') { drawPractice(); return; }
    $('#list').innerHTML = shown.length
      ? `<div class="word-list">${shown.slice(0, renderLimit).map((w) => wordRowHtml(w, { selectable: select, selected: selected.has(w.uv_id), compact: true })).join('')}</div>${shown.length > renderLimit ? `<button type="button" class="btn ghost wd-more" id="wdMore">عرض المزيد · ${(shown.length - renderLimit).toLocaleString('en-US')} كلمة</button>` : ''}`
      : all.length
        ? emptyState('🔍', 'ما فيه كلمات هنا', f.group ? 'أضف كلمات إلى هذه المجموعة من بطاقة أي كلمة.' : 'جرّب بحثًا أو فلترًا آخر.')
        : emptyState('📚', 'ما حفظت كلمات للحين', 'أضف فيديو أو كلمات وبنساعدك تختار اللي يستاهل.', `<a class="btn primary" href="#/add">${icon.plus} أضف</a>`);
    $('#wCount').textContent = shown.length ? `(${shown.length.toLocaleString('en-US')})` : '';
    moreObs?.disconnect();
    const moreBtn = $('#wdMore');
    if (moreBtn && 'IntersectionObserver' in window) {
      moreObs = new IntersectionObserver((en) => { if (en.some((x) => x.isIntersecting)) { moreObs.disconnect(); renderLimit += 80; draw(); } }, { rootMargin: '700px' });
      moreObs.observe(moreBtn);
    }
    const allShownSelected = shown.length > 0 && shown.every((w) => selected.has(w.uv_id));
    const inGroup = state.groups.find((x) => x.id === f.group);
    const none = selected.size ? '' : 'disabled';
    const lvOf = (l) => shown.filter((w) => w.level === l);
    $('#selectBar').innerHTML = pendingGroup ? `
      <div class="select-bar pg-bar">
        <div class="pg-title">📁 «${esc(pendingGroup.name)}» — حدّد كلماتها</div>
        <div class="pg-lv">
          <button type="button" class="gchip${shown.length && shown.every((w) => selected.has(w.uv_id)) ? ' on' : ''}" data-pgall>الكل (${shown.length})</button>
          ${LEVELS.filter((l) => lvOf(l).length).map((l) => `<button type="button" class="gchip${lvOf(l).every((w) => selected.has(w.uv_id)) ? ' on' : ''}" data-pglv="${l}">${l} <span class="en-inline tiny">${lvOf(l).length}</span></button>`).join('')}
        </div>
        <p class="tiny muted" style="margin:0">اختر مستوى أو «الكل»، أو اضغط الكلمات وحدّد بيدك.</p>
        <div class="row between"><span><b class="en-inline">${selected.size}</b> محددة</span>
          <span class="btn-row"><button type="button" class="btn ghost sm" id="pgCancel">تخطّي</button><button type="button" class="btn primary" id="pgAdd" ${selected.size ? '' : 'disabled'}>أضفها إلى المجموعة</button></span></div>
      </div>` : select ? `
      <div class="select-bar">
        <div class="row" style="gap:10px">
          <button class="btn sm" id="selAll">${allShownSelected ? 'إلغاء تحديد الكل' : `تحديد الكل (${shown.length})`}</button>
          <span>${selected.size} محددة</span>
        </div>
        <div class="btn-row">
          <select class="input sm-select" id="toGroup" ${none}>
            <option value="">${inGroup ? 'نقل إلى مجموعة…' : 'أضف إلى مجموعة…'}</option>
            ${state.groups.filter((x) => x.id !== f.group).map((x) => `<option value="${x.id}">${esc(x.name)}</option>`).join('')}
            <option value="new">+ مجموعة جديدة</option></select>
          ${inGroup ? `<button class="btn sm" id="removeFromGroup" ${none}>إخراج من "${esc(inGroup.name)}"</button>` : ''}
          <a class="btn sm" href="#/practice?ids=${[...selected].join(',')}" ${selected.size ? '' : 'style="pointer-events:none;opacity:.5"'}>${icon.game} تدرّب</a>
          <button class="btn sm bad" id="deleteSelected" ${none}>${icon.trash} حذف</button>
        </div></div>` : '';
  }

  // 🎯 «الأوضح»: one simple, common word per meaning; tap it to see the same meaning at every level.
  async function drawClear() {
    const box = $('#list');
    if (!clusters) {
      box.innerHTML = '<p class="muted small"><span class="spinner"></span> نجمع الكلمات المتشابهة في المعنى…</p>';
      try {
        clusters = (await api.wordClusters()).clusters;
      } catch (err) {
        box.innerHTML = `<p class="muted">${esc(err.message)}</p>`;
        return;
      }
      if (f.view !== 'clear') return;
    }
    const ok = (c) => c.members.some((m) => matches(all.find((w) => w.uv_id === m.uv_id) || m));
    const list = clusters.filter(ok);
    const multi = list.filter((c) => c.members.length > 1).length;
    box.innerHTML = list.length ? `<p class="small muted" style="margin:4px 0 10px">${list.length} كلمة أساسية${multi ? ` · ${multi} منها لها كلمات بنفس المعنى بمستويات أخرى` : ''} — اضغط أي كلمة لترى كل مستوياتها.</p>
      <div class="clear-list">${list.map((c, i) => `<button class="clear-item" data-cl="${clusters.indexOf(c)}">
        ${levelChip(c.head.level)}
        <b class="en" dir="ltr">${esc(c.head.term)}</b>
        <span class="small ink-2 clear-ar">${esc(c.head.arabic || '')}</span>
        ${c.members.length > 1 ? `<span class="clear-more">+${c.members.length - 1} <span class="tiny">${c.members.filter((m) => m.uv_id !== c.head.uv_id).map((m) => esc(m.term)).slice(0, 3).join('، ')}</span></span>` : ''}
      </button>`).join('')}</div>` : emptyState('🔍', 'ما فيه كلمات هنا', 'جرّب بحثًا أو فلترًا آخر.');
  }

  function openLadder(c) {
    const lvl = (l) => levelChip(l) || '<span class="chip">–</span>';
    const box = openModal(`<div class="ladder">
      <div class="row between"><div><span class="tiny muted">الكلمة الأوضح للحفظ</span><h2 class="en" dir="ltr" style="margin:2px 0">${esc(c.head.term)} <button class="btn icon sm ghost" data-say="${esc(c.head.term)}" aria-label="استمع">${icon.speaker}</button></h2>
        <div class="ink-2">${esc(c.head.arabic || '')}</div></div>${lvl(c.head.level)}</div>
      <div class="wd-label" style="margin-top:14px">كلماتك بنفس المعنى (من الأبسط إلى الأصعب)</div>
      <div class="ladder-list">${c.members.map((m) => `<div class="ladder-row ${m.uv_id === c.head.uv_id ? 'is-head' : ''}">${lvl(m.level)}<b class="en" dir="ltr">${esc(m.term)}</b>
        <button class="btn icon sm ghost" data-say="${esc(m.term)}" aria-label="استمع">${icon.speaker}</button><span class="small ink-2">${esc(m.arabic || '')}</span>
        <button class="btn sm ghost" data-open="${m.uv_id}">البطاقة</button></div>`).join('')}</div>
      <div id="ladderAi" style="margin-top:12px"><button class="btn" id="ladderGo">✨ كل المستويات لهذا المعنى (البسيط والاحترافي)</button></div>
      <div class="btn-row" style="margin-top:12px"><button class="btn ghost" data-close>إغلاق</button></div></div>`);
    bindSpeech(box);
    box.addEventListener('click', async (e) => {
      const o = e.target.closest('[data-open]');
      if (o) { closeModal(); openWordCard(Number(o.dataset.open), { onChange: reload }); return; }
      if (e.target.closest('#ladderGo')) {
        const ai = box.querySelector('#ladderAi');
        ai.innerHTML = '<p class="small muted"><span class="spinner"></span> نرتّب الكلمات من الأبسط إلى الأصعب…</p>';
        try {
          const r = await api.ladder(c.head.term, c.head.arabic || '');
          ai.innerHTML = `<div class="wd-label">نفس المعنى في كل المستويات</div><div class="ladder-list">${r.items.map((it, k) => `<div class="ladder-row">${lvl(it.level)}<b class="en" dir="ltr">${esc(it.term)}</b>
            <button class="btn icon sm ghost" data-say="${esc(it.term)}" aria-label="استمع">${icon.speaker}</button><span class="small ink-2">${esc(it.arabic)}${it.note_ar ? ` · <span class="muted">${esc(it.note_ar)}</span>` : ''}</span>
            ${it.saved ? `<span class="btn icon sm saved" title="محفوظة">${icon.check}</span>` : `<button class="btn icon sm ghost" data-lsave="${k}" title="احفظ" aria-label="احفظ">${icon.bookmark}</button>`}</div>`).join('')}</div>`;
          ai.addEventListener('click', async (ev) => {
            const b = ev.target.closest('[data-lsave]');
            if (!b) return;
            const it = r.items[Number(b.dataset.lsave)];
            b.disabled = true;
            try {
              await api.importSave([{ term: it.term, arabic: it.arabic, level: it.level, meaning_from: 'ai', examples: it.example ? [{ sentence: it.example }] : [] }]);
              b.outerHTML = `<span class="btn icon sm saved" title="محفوظة">${icon.check}</span>`;
              toast(`تم الحفظ ✓ ${it.term}`);
              clusters = null;
              all = await api.words();
            } catch (err) {
              b.disabled = false;
              toast(err.message);
            }
          });
        } catch (err) {
          ai.innerHTML = `<p class="small muted">${esc(err.message)}</p>`;
        }
      }
    });
  }

  // 🧩 the shared filter bar: العدد · المستوى · الحالة · المقطع · الوقت · الترتيب
  function barDefs() {
    const n = (fn) => all.filter(fn).length;
    return [
      { k: 'count', t: 'العدد', value: String(f.count), opts: [['0', 'الكل'], ['10', '10'], ['20', '20'], ['30', '30']] },
      { k: 'levels', t: 'المستوى', multi: true, all: 'كل المستويات', value: f.levels,
        opts: [['', 'كل المستويات', all.length], ...LEVELS.map((l) => [l, l, n((w) => w.level === l)])] },
      { k: 'filter', t: 'الحالة', value: f.filter, opts: FILTERS.map(([k, l]) => [k, l, k === 'all' ? all.length : n((w) => w.state === k)]) },
      { k: 'source', t: 'المقطع', video: true, value: String(f.source || ''),
        opts: [['', 'كل المقاطع', all.length], ...sourcesOf().map((x) => [String(x.id), x.title, n((w) => w.source?.id === x.id), ytThumb(x)])] },
      { k: 'when', t: 'الوقت', value: f.when, opts: WHEN_OPTS },
      { k: 'sort', t: 'الترتيب', value: f.sort, opts: [['new', 'الأحدث'], ['old', 'الأقدم'], ['az', 'أبجدي']] },
    ].filter((d) => !(tab === 'practice' && d.k === 'sort')); // the order matters for the list only: «تدرّب» shows five filters
  }

  // Videos the learner's words come from (for the filter).
  function sourcesOf() {
    const m = new Map();
    for (const w of all) if (w.source?.id && w.source.title) m.set(w.source.id, w.source);
    return [...m.values()];
  }

  // Merge or delete several groups at once.
  function openGroupManager() {
    const box = openModal(`<h2 style="margin-bottom:4px">إدارة المجموعات</h2>
      <p class="small ink-2" style="margin-bottom:12px">حدّد مجموعتين أو أكثر لدمجها في واحدة، أو حدّد ما تريد حذفه (الكلمات نفسها لا تُحذف).</p>
      <div class="gm-list">${state.groups.map((g) => `<label class="gm-item"><input type="checkbox" class="check" value="${g.id}"> <b>${esc(g.name)}</b> <span class="tiny muted en-inline">${g.count}</span></label>`).join('')}</div>
      <div class="row wrap" style="gap:8px;margin-top:10px"><button class="btn sm" id="gmAll">تحديد الكل</button></div>
      <label class="field" style="margin-top:12px">اسم المجموعة بعد الدمج<input class="input" id="gmName" placeholder="مثلًا: مفردات العمل"></label>
      <div class="btn-row" style="margin-top:12px"><button class="btn primary" id="gmMerge">دمج المحدد</button><button class="btn bad" id="gmDelete">حذف المحدد</button><button class="btn ghost" data-close>إغلاق</button></div>`);
    const picked = () => [...box.querySelectorAll('.gm-item input:checked')].map((x) => Number(x.value));
    box.querySelector('#gmAll').addEventListener('click', () => {
      const boxes = [...box.querySelectorAll('.gm-item input')];
      const allOn = boxes.every((x) => x.checked);
      boxes.forEach((x) => { x.checked = !allOn; });
    });
    box.querySelector('#gmMerge').addEventListener('click', async () => {
      const ids = picked();
      if (ids.length < 2) return toast('حدّد مجموعتين على الأقل');
      const first = state.groups.find((g) => g.id === ids[0]);
      const name = box.querySelector('#gmName').value.trim() || first.name;
      try {
        const target = name === first.name ? first : await api.createGroup(name);
        const uv = all.filter((w) => w.group_ids.some((g) => ids.includes(g))).map((w) => w.uv_id);
        if (uv.length) await api.addToGroup(target.id, uv);
        for (const g of ids) if (g !== target.id) await api.deleteGroup(g);
        closeModal();
        toast(`دُمجت ${ids.length} مجموعات في «${name}» ✓`);
        f.group = target.id;
        await reload();
      } catch (err) {
        toast(err.message);
      }
    });
    box.querySelector('#gmDelete').addEventListener('click', async () => {
      const ids = picked();
      if (!ids.length) return toast('حدّد مجموعة واحدة على الأقل');
      if (!confirm(`حذف ${ids.length} ${ids.length === 1 ? 'مجموعة' : 'مجموعات'}؟ الكلمات نفسها لن تُحذف.`)) return;
      for (const g of ids) await api.deleteGroup(g);
      closeModal();
      toast('حُذفت المجموعات ✓');
      if (ids.includes(f.group)) f.group = null;
      await reload();
    });
  }

  const reload = async () => {
    clusters = null;
    all = await api.words();
    await loadGroups();
    draw();
  };

  view.addEventListener('click', async (e) => {
    if (!document.getElementById('summary')) return; // left «كلماتي» (the page area is reused)
    const sv = e.target.closest('[data-sortv]');
    if (sv) { f.sort = sv.dataset.sortv; panel = ''; return draw(); }
    const fb = filterBarClick(e, barDefs(), fbOpen);
    if (fb) {
      if ('open' in fb) fbOpen = fb.open;
      else {
        if (fb.k === 'count') f.count = Number(fb.value) || 0;
        else if (fb.k === 'source') f.source = Number(fb.value) || null;
        else f[fb.k] = fb.value;
        if (fb.k === 'filter') f.view = 'list';
        if (fb.close) fbOpen = '';
      }
      return draw();
    }
    const cl = e.target.closest('[data-cl]');
    if (cl) return openLadder(clusters[Number(cl.dataset.cl)]);
    const wt = e.target.closest('[data-wt]');
    if (wt) {
      const k = wt.dataset.wt;
      if (k === 'view') { f.view = f.view === 'clear' ? 'list' : 'clear'; return draw(); }
      panel = panel === k ? '' : k;
      fbOpen = '';
      draw();
      if (panel === 'search') $('#q').focus();
      return undefined;
    }
    const gb = e.target.closest('[data-g]');
    if (gb) {
      f.group = f.group === Number(gb.dataset.g) ? null : Number(gb.dataset.g);
      panel = ''; groupsOpen = false;
      return draw();
    }
    if (e.target.closest('[data-ungroup]')) { f.group = null; return draw(); } // × beside the group name: back to all the words
    if (e.target.closest('#newGroup')) {
      const box = openModal(`<h2 style="margin:0 0 6px">مجموعة جديدة</h2>
        <p class="small muted" style="margin:0 0 12px">اكتب اسمها، وبعدها تحدّد كلماتها: حسب المستوى، أو بيدك، أو الكل.</p>
        <input class="input" id="ngName" maxlength="60" placeholder="مثال: Work، University، Finance" autocomplete="off">
        <div class="btn-row" style="margin-top:14px"><button type="button" class="btn primary" id="ngGo">التالي ← تحديد الكلمات</button></div>`);
      const input = box.querySelector('#ngName');
      setTimeout(() => input.focus(), 150);
      const go = async () => {
        const name = input.value.trim();
        if (!name) { input.focus(); return; }
        try {
          const g = await api.createGroup(name);
          if (g.existed) toast('عندك مجموعة بهذا الاسم — نضيف لها');
          await loadGroups();
          closeModal();
          if (tab === 'practice') { window.__pg = { id: g.id, name: g.name || name }; location.hash = '#/words'; return; }
          f.group = null; f.filter = 'all'; panel = '';
          pendingGroup = { id: g.id, name: g.name || name };
          select = true; selected.clear();
          draw();
          window.scrollTo({ top: 0, behavior: 'smooth' });
        } catch (err) { toast(err.message); }
      };
      box.querySelector('#ngGo').addEventListener('click', go);
      input.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); go(); } });
      return;
    }
    if (e.target.closest('[data-pgall]')) {
      const allSel = shown.length > 0 && shown.every((w) => selected.has(w.uv_id));
      shown.forEach((w) => (allSel ? selected.delete(w.uv_id) : selected.add(w.uv_id)));
      return draw();
    }
    const pgl = e.target.closest('[data-pglv]');
    if (pgl) {
      const list = shown.filter((w) => w.level === pgl.dataset.pglv);
      const allSel = list.every((w) => selected.has(w.uv_id));
      list.forEach((w) => (allSel ? selected.delete(w.uv_id) : selected.add(w.uv_id)));
      return draw();
    }
    if (e.target.closest('#pgCancel')) { pendingGroup = null; select = false; selected.clear(); return draw(); }
    if (e.target.closest('#pgAdd')) {
      if (!pendingGroup || !selected.size) return undefined;
      const n = selected.size;
      const g = pendingGroup;
      await api.addToGroup(g.id, [...selected]);
      toast(`أضفنا ${n} ${n === 1 ? 'كلمة' : 'كلمات'} إلى «${g.name}» ✓`);
      pendingGroup = null; select = false; selected.clear(); f.group = g.id;
      return reload();
    }
    const gact = e.target.closest('[data-gact]')?.dataset.gact;
    if (gact === 'rename') {
      const g = state.groups.find((x) => x.id === f.group);
      const name = prompt('الاسم الجديد', g.name);
      if (!name?.trim()) return;
      try {
        await api.renameGroup(g.id, name.trim());
        await reload();
      } catch (err) {
        toast(err.message);
      }
      return;
    }
    if (gact === 'delete') {
      const g = state.groups.find((x) => x.id === f.group);
      if (!confirm(`حذف المجموعة "${g.name}"؟ الكلمات نفسها لن تُحذف.`)) return;
      await api.deleteGroup(g.id);
      f.group = null;
      await reload();
      return;
    }
    const pg = e.target.closest('[data-pg]');
    if (pg) {
      const [mode, type] = pg.dataset.pg.split(':');
      if (mode === 'twins') { location.hash = '#/practice?mode=twins'; return undefined; }
      const ids = practiceSet().map((w) => w.uv_id).slice(0, mode === 'story' ? 30 : 1000).join(',');
      if (!ids) return undefined;
      const q = new URLSearchParams({ mode, ...(type ? { type } : {}), ids, exact: 1, n: Date.now() });
      location.hash = `#/practice?${q}`;
      return undefined;
    }
    if (e.target.closest('#selectToggle')) {
      select = !select;
      pendingGroup = null;
      selected.clear();
      return draw();
    }
    if (e.target.closest('#exportBtn')) openExport(f.group);
    if (e.target.closest('#manageGroups')) return openGroupManager();
    if (e.target.closest('#selectAllQuick')) {
      select = true;
      shown.forEach((w) => selected.add(w.uv_id));
      return draw();
    }
    if (e.target.closest('#selAll')) {
      const allSel = shown.every((w) => selected.has(w.uv_id));
      shown.forEach((w) => (allSel ? selected.delete(w.uv_id) : selected.add(w.uv_id)));
      return draw();
    }
    if (e.target.closest('#deleteSelected')) {
      if (!selected.size) return;
      if (!confirm(`حذف ${selected.size} ${selected.size === 1 ? 'كلمة' : 'كلمات'}؟ تنتقل إلى «المحذوفات» في الإعدادات وتقدرين تسترجعينها.`)) return;
      const r = await api.deleteWords([...selected]);
      toast(`نُقلت ${r.deleted === 1 ? 'كلمة وحدة' : r.deleted === 2 ? 'كلمتان' : `${r.deleted} كلمة`} إلى «المحذوفات» — الإعدادات ← المظهر والتفضيلات`, 4500);
      selected.clear();
      select = false;
      return reload();
    }
    if (e.target.closest('#removeFromGroup')) {
      const n = selected.size;
      await api.removeFromGroup(f.group, [...selected]);
      toast(`أُخرجت ${n} من المجموعة — الكلمات نفسها باقية`);
      selected.clear();
      select = false;
      return reload();
    }
  });

  // Row click in select mode toggles selection instead of opening the card.
  $('#list').addEventListener('click', (e) => {
    if (e.target.closest('#wdMore')) { renderLimit += 80; draw(); return; }
    if (!select) return;
    const row = e.target.closest('.word-row');
    if (!row) return;
    e.stopPropagation();
    const id = Number(row.dataset.id);
    if (selected.has(id)) selected.delete(id);
    else selected.add(id);
    draw();
  }, true);

  view.addEventListener('change', async (e) => {
    if (e.target.id === 'toGroup' && e.target.value) {
      let gid = e.target.value;
      if (gid === 'new') {
        const name = prompt('اسم المجموعة');
        if (!name?.trim()) return draw();
        gid = (await api.createGroup(name.trim())).id;
      }
      if (!selected.size) return toast('حدد كلمات أولًا');
      const ids = [...selected];
      await api.addToGroup(Number(gid), ids);
      if (f.group) {
        // Move = add to the new group + leave the current one.
        await api.removeFromGroup(f.group, ids);
        toast(`نُقلت ${ids.length} ${ids.length === 1 ? 'كلمة' : 'كلمات'} ✓`);
      } else toast(`أُضيفت ${ids.length} ${ids.length === 1 ? 'كلمة' : 'كلمات'} إلى المجموعة ✓`);
      select = false;
      selected.clear();
      await reload();
    }
  });
  $('#q').addEventListener('input', (e) => {
    f.q = e.target.value;
    draw();
  });

  bindWordList($('#list'), () => shown, { onChange: reload });
  const unOutside = closeOnOutside(view, () => fbOpen, () => { fbOpen = ''; draw(); });
  window.addEventListener('hashchange', unOutside, { once: true });
  draw();
  api.grammar().then((lib) => {
    const n = Object.values(lib.subs || {}).filter((e) => (e.examples?.length || 0) || e.seen || (e.status && e.status !== 'new')).length;
    const el = $('#gCount');
    if (el && n) el.textContent = String(n);
  }).catch(() => {});

  // 🧹 «كلماتي» tidy-up (runs in the background while the site is open, even after leaving this page):
  // 1) multi-word items first — real expressions stay, free combinations become their one word;
  // 2) every word to its simplest form (struggling → struggle, delusional → delusion).
  // New words are tidied the moment they are saved (see api.js), so opening «كلماتي» does not re-check them. This pass only catches
  // what an older version left (or what was saved while the AI was away): at most once a week, and quiet when it finds nothing.
  const tidyKey = 'tidy3.at'; // v3: once more, so every multi-word item (phrasal verbs, idioms, compounds) becomes single words
  const tidyRecent = () => { try { return Date.now() - Number(localStorage.getItem(tidyKey) || 0) < 7 * 86400000; } catch { return false; } };
  (async () => {
    let changed = 0;
    if (window.__tidyRunning || tidyRecent()) return;
    let clean = true; // every step finished without a failure
    window.__tidyRunning = true;
    const note = (n) => { if (n) toast(`🧹 نرتّب كلماتك… اتعدّلت ${n} حتى الحين`, 2500); };
    if (state.config?.ai?.available) {
      try {
        for (let i = 0; i < 200; i++) {
          // light on the site: a short rest between steps, and none while the tab is hidden
          await new Promise((res) => setTimeout(res, 1500));
          while (document.visibilityState === 'hidden') await new Promise((res) => setTimeout(res, 3000));
          const r = await api.tidyWords();
          if (r.changed) { changed += r.changed; note(changed); }
          if (r.done) break;
        }
      } catch { clean = false; /* next visit */ }
    } else clean = false; // no AI right now: try again later
    try {
      for (let i = 0; i < 80; i++) {
        const r = await api.simplifyWords();
        changed += r.changed || 0;
        if (r.done) break;
      }
    } catch { clean = false; /* try again next time */ }
    window.__tidyRunning = false;
    // levels never checked: once, then saved for good
    let levelled = 0;
    try {
      for (let i = 0; i < 15 && view.isConnected && state.config?.ai?.available; i++) {
        const r = await api.ensureLevels();
        levelled += r.levelled || 0;
        if (!r.more) break;
      }
    } catch { clean = false; /* next time */ }
    if (changed && view.isConnected) toast(`بسّطنا ${changed} كلمة إلى أبسط صيغة ✓`);
    if ((changed || levelled) && view.isConnected) await reload();
    if (clean) { try { localStorage.setItem(tidyKey, String(Date.now())); } catch { /* storage off */ } }
  })();
}

function openExport(groupId) {
  const box = openModal(`
    <h2 style="margin-bottom:4px">تصدير كلماتك</h2><p class="small ink-2" style="margin-bottom:16px">ملف Excel: عمود للإنجليزي، وعمود للعربي، وعمود للمثال، وعمود لترجمته — كلٌّ في خانته.</p>
    <form id="ex" class="stack">
      <label class="field">الفترة
        <select class="input" name="range"><option value="all">كل الكلمات</option><option value="week">آخر أسبوع</option><option value="month">آخر شهر</option><option value="3m">آخر 3 أشهر</option><option value="custom">تواريخ محددة…</option></select></label>
      <div class="row hidden" id="dates" style="gap:8px"><input class="input" type="date" name="from" aria-label="من"><input class="input" type="date" name="to" aria-label="إلى"></div>
      <label class="field">المجموعة
        <select class="input" name="group_id"><option value="">كل المجموعات</option>${state.groups.map((g) => `<option value="${g.id}" ${g.id === groupId ? 'selected' : ''}>${esc(g.name)}</option>`).join('')}</select></label>
      <label class="field">المستوى
        <select class="input" name="level"><option value="">كل المستويات</option>${['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].map((l) => `<option>${l}</option>`).join('')}</select></label>
      <label class="row small" style="gap:8px"><input type="checkbox" class="check" name="difficult" value="1"> الكلمات التي تحتاج تدريب فقط</label>
      <div class="field">الشكل<div class="segmented" id="exKind"><button type="button" class="active" data-k="full">كامل</button><button type="button" data-k="short">مختصر للطباعة</button></div></div>
      <div class="field hidden" id="exColorRow">الألوان<div class="segmented" id="exColor"><button type="button" class="active" data-c="0">بدون ألوان</button><button type="button" data-c="1">بألوان حسب المستوى</button></div>
        <span class="tiny muted">المختصر: الكلمة وترجمتها في نفس الخانة، ٤ أعمدة على ورق A4 — PDF من نافذة الطباعة.</span></div>
      <div class="btn-row" id="exFull"><button class="btn primary" type="submit">${icon.download} تنزيل Excel</button><button class="btn ghost" type="button" id="csv">CSV</button><button class="btn ghost" type="button" id="json">JSON</button></div>
      <div class="btn-row hidden" id="exShort"><button class="btn primary" type="button" id="pdf">${icon.download} PDF مختصر</button></div>
    </form>`);
  const form = box.querySelector('#ex');
  form.range.addEventListener('change', () => box.querySelector('#dates').classList.toggle('hidden', form.range.value !== 'custom'));
  const download = (format) => {
    const fd = new FormData(form);
    const params = { format, range: fd.get('range'), from: fd.get('from'), to: fd.get('to'), group_id: fd.get('group_id'), level: fd.get('level'), difficult: fd.get('difficult') };
    const a = document.createElement('a');
    a.href = api.exportUrl(params);
    a.download = '';
    document.body.appendChild(a);
    a.click();
    a.remove();
    closeModal();
  };
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    download('xlsx');
  });
  // 🖨 short sheet: word + Arabic in one cell, 4 columns on A4, coloured by level or not → PDF from the print window
  let kind = 'full';
  let colored = false;
  box.querySelector('#exKind').addEventListener('click', (e) => {
    const b = e.target.closest('[data-k]');
    if (!b) return;
    kind = b.dataset.k;
    box.querySelectorAll('#exKind [data-k]').forEach((x) => x.classList.toggle('active', x === b));
    ['#exColorRow', '#exShort'].forEach((sel) => box.querySelector(sel).classList.toggle('hidden', kind !== 'short'));
    box.querySelector('#exFull').classList.toggle('hidden', kind === 'short');
  });
  box.querySelector('#exColor').addEventListener('click', (e) => {
    const b = e.target.closest('[data-c]');
    if (!b) return;
    colored = b.dataset.c === '1';
    box.querySelectorAll('#exColor [data-c]').forEach((x) => x.classList.toggle('active', x === b));
  });
  box.querySelector('#pdf').addEventListener('click', async () => {
    const w = window.open('', '_blank'); // opened inside the tap (popup blockers), filled when the words arrive
    if (!w) { toast('اسمح بالنوافذ المنبثقة عشان يطلع الملف'); return; }
    w.document.write('<p style="font-family:sans-serif;padding:20px">…</p>');
    try {
      const fd = new FormData(form);
      const params = { format: 'json', range: fd.get('range'), from: fd.get('from'), to: fd.get('to'), group_id: fd.get('group_id'), level: fd.get('level'), difficult: fd.get('difficult') };
      const data = await (await fetch(api.exportUrl(params), { credentials: 'same-origin' })).json();
      const tone = (lv) => (/^A/.test(lv) ? 'a' : /^B/.test(lv) ? 'b' : /^C/.test(lv) ? 'c' : 'x');
      const cells = (data.words || []).map((r) => `<div class="c ${colored ? `l-${tone(r['CEFR Level'])}` : ''}"><b dir="ltr">${esc(r.Word)}</b><span>${esc(r.Arabic)}</span></div>`).join('');
      const legend = colored ? '<div class="lg"><i class="l-a">A1–A2 سهل</i><i class="l-b">B1–B2 متوسط</i><i class="l-c">C1–C2 متقدم</i></div>' : '';
      w.document.open();
      w.document.write(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>كلماتي — ${data.count || 0} كلمة</title>
        <style>@page{size:A4;margin:10mm}body{font-family:'IBM Plex Sans Arabic',Tahoma,sans-serif;margin:0;color:#111}
        h1{font-size:14px;margin:0 0 6px}.lg{display:flex;gap:6px;margin:0 0 6px;font-size:10px}.lg i{font-style:normal;padding:1px 8px;border-radius:9px}
        .g{display:grid;grid-template-columns:repeat(4,1fr);gap:3px}.c{border:1px solid #ccc;border-radius:4px;padding:3px 5px;display:flex;justify-content:space-between;gap:6px;font-size:10.5px;line-height:1.3;break-inside:avoid}
        .c b{font-weight:700}.c span{color:#333;text-align:start}
        .l-a{background:#e3f1e8;border-color:#8cc7a1}.l-b{background:#f7eddc;border-color:#e0b46b}.l-c{background:#f7e3e0;border-color:#df9a90}
        *{-webkit-print-color-adjust:exact;print-color-adjust:exact}</style></head>
        <body><h1>كلماتي — ${data.count || 0} كلمة</h1>${legend}<div class="g">${cells}</div></body></html>`);
      w.document.close();
      closeModal();
      setTimeout(() => { try { w.focus(); w.print(); } catch { /* the learner prints from the page */ } }, 400);
    } catch (err) { w.close(); toast(err.message || 'ما قدرنا نجهّز الملف'); }
  });
  box.querySelector('#json').addEventListener('click', () => download('json'));
  box.querySelector('#csv').addEventListener('click', () => download('csv'));
}
