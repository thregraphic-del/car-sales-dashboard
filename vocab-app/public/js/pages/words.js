// كلماتي — everything saved, organised in learner-named groups.
import { api } from '../api.js';
import { state, loadGroups } from '../state.js';
import { esc, icon, emptyState, toast, openModal, closeModal, num, levelChip } from '../ui.js';
import { wordRowHtml, bindWordList, openWordCard, bindSpeech } from '../components.js';
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
  let all = await api.words();
  await loadGroups();
  const f = { filter: params.filter || 'all', group: params.group ? Number(params.group) : null, q: '', levels: [], when: params.when || '', source: params.source ? Number(params.source) : null, sort: 'new', count: 0, view: 'list' };
  let fbOpen = '';
  let groupsOpen = false;
  let clusters = null; // «الأوضح»: words with one meaning under the simplest one
  const DAY = 86400000;
  const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); };
  const WHEN = { today: () => [startOfToday(), Infinity], yesterday: () => [startOfToday() - DAY, startOfToday()], week: () => [startOfToday() - 6 * DAY, Infinity], month: () => [startOfToday() - 29 * DAY, Infinity] };
  let select = false;
  const selected = new Set();
  let shown = [];

  view.innerHTML = `
    <div class="page-head compact">
      <div><h1>كلماتي</h1><p id="summary"></p></div>
      <div class="btn-row"><button class="btn" id="exportBtn">${icon.download} تصدير</button></div>
    </div>
    <div class="words-search"><span class="search-ico">${icon.search}</span><input class="input" id="q" type="search" placeholder="ابحث بالإنجليزية أو العربية…"></div>
    <div class="chip-row" id="filters"></div>
    <div class="chip-row groups-row" id="groups"></div>
    <div id="groupHead"></div>
    <div id="list"></div>
    <div id="selectBar"></div>`;
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

  function draw() {
    const mastered = all.filter((w) => w.state === 'mastered').length;
    const practice = all.filter((w) => w.state === 'review' || w.state === 'hard').length;
    $('#summary').textContent = all.length ? `${num(all.length)} كلمة · ${num(mastered)} متقنة · ${num(practice)} تحتاج مراجعة` : 'ما حفظت كلمات للحين.';
    $('#filters').innerHTML = filterBarHtml(barDefs(), fbOpen);
    placeMenus($('#filters'));
    // 📁 groups: one closed button; tapping it shows every group + «مجموعة جديدة» + «إدارة المجموعات»
    const gSel = state.groups.find((x) => x.id === f.group);
    $('#groups').innerHTML = `<button type="button" class="grp-toggle${groupsOpen ? ' open' : ''}${gSel ? ' set' : ''}" id="grpToggle" aria-expanded="${groupsOpen}"><span class="fb-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg></span> <span>${gSel ? esc(gSel.name) : 'المجموعات'}</span> <span class="tiny en-inline">${gSel ? gSel.count : state.groups.length}</span> ▾</button>
      ${groupsOpen ? `<div class="grp-panel">${state.groups.map((g) => `<button class="gchip ${f.group === g.id ? 'on' : ''}" data-g="${g.id}">${esc(g.name)} <span class="en-inline tiny">${g.count}</span></button>`).join('') || '<span class="tiny muted">ما عندك مجموعات بعد.</span>'}
        <div class="grp-actions"><button class="gchip new" id="newGroup">+ مجموعة جديدة</button>${state.groups.length > 1 ? '<button class="gchip new" id="manageGroups">⚙ إدارة المجموعات</button>' : ''}</div></div>` : ''}`;
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
    shown = all.filter(matches);
    const sorters = { old: (a, b) => new Date(a.saved_at) - new Date(b.saved_at), az: (a, b) => a.term.localeCompare(b.term), hard: (a, b) => (b.difficulty || 0) - (a.difficulty || 0) || a.mastery - b.mastery };
    if (sorters[f.sort]) shown.sort(sorters[f.sort]);
    if (f.count) shown = shown.slice(0, f.count);
    $('#list').innerHTML = shown.length
      ? `<div class="row between" style="margin:4px 0 10px"><span class="small muted">${shown.length} كلمة</span><span class="btn-row">${select ? '' : `<button class="btn sm" id="selectAllQuick">☑ تحديد الكل</button>`}<button class="btn sm ${select ? 'primary' : ''}" id="selectToggle">${icon.check} ${select ? 'إنهاء التحديد' : 'تحديد'}</button></span></div>
         <div class="word-list">${shown.map((w) => wordRowHtml(w, { selectable: select, selected: selected.has(w.uv_id) })).join('')}</div>`
      : all.length
        ? emptyState('🔍', 'ما فيه كلمات هنا', f.group ? 'أضف كلمات إلى هذه المجموعة من بطاقة أي كلمة.' : 'جرّب بحثًا أو فلترًا آخر.')
        : emptyState('📚', 'ما حفظت كلمات للحين', 'أضف فيديو أو كلمات وبنساعدك تختار اللي يستاهل.', `<a class="btn primary" href="#/add">${icon.plus} أضف</a>`);
    const allShownSelected = shown.length > 0 && shown.every((w) => selected.has(w.uv_id));
    const inGroup = state.groups.find((x) => x.id === f.group);
    const none = selected.size ? '' : 'disabled';
    $('#selectBar').innerHTML = select ? `
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
    ];
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
    if (e.target.closest('#grpToggle')) { groupsOpen = !groupsOpen; return draw(); }
    const gb = e.target.closest('[data-g]');
    if (gb) {
      f.group = f.group === Number(gb.dataset.g) ? null : Number(gb.dataset.g);
      groupsOpen = false;
      return draw();
    }
    if (e.target.closest('#newGroup')) {
      const name = prompt('اسم المجموعة (مثال: Finance، Data Analysis، Work، University)');
      if (!name?.trim()) return;
      try {
        const g = await api.createGroup(name.trim());
        if (g.existed) toast('عندك مجموعة بهذا الاسم');
        await loadGroups();
        f.group = g.id;
        draw();
      } catch (err) {
        toast(err.message);
      }
      return;
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
    if (e.target.closest('#selectToggle')) {
      select = !select;
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
      if (!confirm(`حذف ${selected.size} ${selected.size === 1 ? 'كلمة' : 'كلمات'} من كلماتك؟ سيُحذف تقدّمك فيها أيضًا.`)) return;
      const r = await api.deleteWords([...selected]);
      toast(`حُذفت ${r.deleted} ${r.deleted === 1 ? 'كلمة' : 'كلمات'}`);
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

  // Older saved words move to their simplest form once (struggling → struggle), a slice at a time.
  (async () => {
    let changed = 0;
    try {
      for (let i = 0; i < 60; i++) {
        const r = await api.simplifyWords();
        changed += r.changed || 0;
        if (r.done) break;
      }
    } catch { /* try again next time */ }
    // multi-word items: real expressions stay, free combinations (senior years) become their one word
    if (state.config?.ai?.available) {
      try {
        for (let i = 0; i < 100 && view.isConnected; i++) {
          const r = await api.tidyWords();
          changed += r.changed || 0;
          if (r.done) break;
        }
      } catch { /* next visit */ }
    }
    // levels never checked: once, then saved for good
    let levelled = 0;
    try {
      for (let i = 0; i < 15 && view.isConnected && state.config?.ai?.available; i++) {
        const r = await api.ensureLevels();
        levelled += r.levelled || 0;
        if (!r.more) break;
      }
    } catch { /* next time */ }
    if (changed && view.isConnected) toast(`بسّطنا ${changed} كلمة إلى أبسط صيغة ✓`);
    if ((changed || levelled) && view.isConnected) await reload();
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
      <div class="btn-row"><button class="btn primary" type="submit">${icon.download} تنزيل Excel</button><button class="btn ghost" type="button" id="csv">CSV</button><button class="btn ghost" type="button" id="json">JSON</button></div>
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
  box.querySelector('#json').addEventListener('click', () => download('json'));
  box.querySelector('#csv').addEventListener('click', () => download('csv'));
}
