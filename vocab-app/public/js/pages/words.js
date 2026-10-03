// كلماتي — everything saved, organised in learner-named groups.
import { api } from '../api.js';
import { state, loadGroups } from '../state.js';
import { esc, icon, emptyState, toast, openModal, closeModal, num } from '../ui.js';
import { wordRowHtml, bindWordList } from '../components.js';

const FILTERS = [
  ['all', 'الكل'],
  ['practice', 'تحتاج تدريب'],
  ['new', 'جديدة'],
  ['mastered', 'متقنة'],
];

export async function render(view, { params }) {
  let all = await api.words();
  await loadGroups();
  const f = { filter: params.filter || 'all', group: params.group ? Number(params.group) : null, q: '', level: '' };
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
    if (f.filter === 'practice' && !(w.difficult || w.due)) return false;
    if (f.filter === 'new' && w.status !== 'new') return false;
    if (f.filter === 'mastered' && w.status !== 'mastered') return false;
    if (f.level && w.level !== f.level) return false;
    const q = f.q.trim().toLowerCase();
    if (q && !`${w.term} ${w.arabic || ''} ${w.arabic_general || ''}`.toLowerCase().includes(q)) return false;
    return true;
  };

  function draw() {
    const mastered = all.filter((w) => w.status === 'mastered').length;
    const practice = all.filter((w) => w.difficult || w.due).length;
    $('#summary').textContent = all.length ? `${num(all.length)} كلمة · ${num(mastered)} متقنة · ${num(practice)} تحتاج تدريب` : 'لم تحفظ كلمات بعد.';
    $('#filters').innerHTML = FILTERS.map(([k, l]) => `<button class="tab ${f.filter === k ? 'active' : ''}" data-f="${k}">${l}</button>`).join('')
      + `<select class="input level-select" id="level" aria-label="المستوى"><option value="">كل المستويات</option>${['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].map((l) => `<option ${f.level === l ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
    $('#groups').innerHTML = `<span class="tiny muted">المجموعات:</span>${state.groups.map((g) => `<button class="gchip ${f.group === g.id ? 'on' : ''}" data-g="${g.id}">${esc(g.name)} <span class="en-inline tiny">${g.count}</span></button>`).join('')}<button class="gchip new" id="newGroup">+ مجموعة</button>`;
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
    shown = all.filter(matches);
    $('#list').innerHTML = shown.length
      ? `<div class="row between" style="margin:4px 0 10px"><span class="small muted">${shown.length} كلمة</span><button class="link-btn" id="selectToggle">${select ? 'إلغاء التحديد' : 'تحديد كلمات'}</button></div>
         <div class="word-list">${shown.map((w) => wordRowHtml(w, { selectable: select, selected: selected.has(w.uv_id) })).join('')}</div>`
      : all.length
        ? emptyState('🔍', 'لا توجد كلمات هنا', f.group ? 'أضف كلمات إلى هذه المجموعة من بطاقة أي كلمة.' : 'جرّب بحثًا أو فلترًا آخر.')
        : emptyState('📚', 'لم تحفظ كلمات بعد', 'أضف فيديو أو كلمات وسنساعدك على اختيار ما يستحق.', `<a class="btn primary" href="#/add">${icon.plus} أضف</a>`);
    $('#selectBar').innerHTML = select ? `
      <div class="select-bar"><span>${selected.size} محددة</span>
        <div class="btn-row">
          <select class="input sm-select" id="toGroup"><option value="">أضف إلى مجموعة…</option>${state.groups.map((x) => `<option value="${x.id}">${esc(x.name)}</option>`).join('')}<option value="new">+ مجموعة جديدة</option></select>
          <a class="btn sm" href="#/practice?ids=${[...selected].join(',')}" ${selected.size ? '' : 'style="pointer-events:none;opacity:.5"'}>${icon.game} تدرّب</a>
        </div></div>` : '';
  }

  const reload = async () => {
    all = await api.words();
    await loadGroups();
    draw();
  };

  view.addEventListener('click', async (e) => {
    const fb = e.target.closest('[data-f]');
    if (fb) {
      f.filter = fb.dataset.f;
      return draw();
    }
    const gb = e.target.closest('[data-g]');
    if (gb) {
      f.group = f.group === Number(gb.dataset.g) ? null : Number(gb.dataset.g);
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
    if (e.target.id === 'level') {
      f.level = e.target.value;
      return draw();
    }
    if (e.target.id === 'toGroup' && e.target.value) {
      let gid = e.target.value;
      if (gid === 'new') {
        const name = prompt('اسم المجموعة');
        if (!name?.trim()) return draw();
        gid = (await api.createGroup(name.trim())).id;
      }
      if (!selected.size) return toast('حدد كلمات أولًا');
      await api.addToGroup(Number(gid), [...selected]);
      toast(`أُضيفت ${selected.size} كلمات إلى المجموعة ✓`);
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
  draw();
}

function openExport(groupId) {
  const box = openModal(`
    <h2 style="margin-bottom:4px">تصدير كلماتك</h2><p class="small ink-2" style="margin-bottom:16px">ملف CSV يفتح في Excel و Google Sheets (يدعم العربية).</p>
    <form id="ex" class="stack">
      <label class="field">الفترة
        <select class="input" name="range"><option value="all">كل الكلمات</option><option value="week">آخر أسبوع</option><option value="month">آخر شهر</option><option value="3m">آخر 3 أشهر</option><option value="custom">تواريخ محددة…</option></select></label>
      <div class="row hidden" id="dates" style="gap:8px"><input class="input" type="date" name="from" aria-label="من"><input class="input" type="date" name="to" aria-label="إلى"></div>
      <label class="field">المجموعة
        <select class="input" name="group_id"><option value="">كل المجموعات</option>${state.groups.map((g) => `<option value="${g.id}" ${g.id === groupId ? 'selected' : ''}>${esc(g.name)}</option>`).join('')}</select></label>
      <label class="field">المستوى
        <select class="input" name="level"><option value="">كل المستويات</option>${['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].map((l) => `<option>${l}</option>`).join('')}</select></label>
      <label class="row small" style="gap:8px"><input type="checkbox" class="check" name="difficult" value="1"> الكلمات التي تحتاج تدريب فقط</label>
      <div class="btn-row"><button class="btn primary" type="submit">${icon.download} تنزيل CSV</button><button class="btn ghost" type="button" id="json">JSON</button></div>
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
    download('csv');
  });
  box.querySelector('#json').addEventListener('click', () => download('json'));
}
