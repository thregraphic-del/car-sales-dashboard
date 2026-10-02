import { api } from '../api.js';
import { esc, icon, emptyState, toast, num } from '../ui.js';
import { wordRowHtml, bindWordList } from '../components.js';

const SECTIONS = [
  ['today', 'كلمات اليوم'],
  ['yesterday', 'الأمس'],
  ['week', 'هذا الأسبوع'],
  ['month', 'الشهر الماضي'],
  ['all', 'كل المفردات'],
  ['review', 'للمراجعة'],
  ['difficult', 'الكلمات الصعبة'],
];

function startOfDay(offset) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - offset);
  return d.toISOString();
}

function inSection(w, s) {
  if (s === 'today') return w.saved_at >= startOfDay(0);
  if (s === 'yesterday') return w.saved_at >= startOfDay(1) && w.saved_at < startOfDay(0);
  if (s === 'week') return w.saved_at >= startOfDay(6);
  if (s === 'month') return w.saved_at >= startOfDay(30);
  if (s === 'review') return w.due;
  if (s === 'difficult') return w.difficult;
  return true;
}

export async function render(view, { params }) {
  const [all, videos] = await Promise.all([api.words(), api.videos()]);
  let words = all;
  const f = {
    section: params.section || (params.status ? 'all' : 'all'),
    q: '',
    level: params.level || '',
    status: params.status || '',
    video: params.video || '',
    from: '',
    to: '',
  };
  let selectMode = false;
  const selected = new Set();

  const counts = {
    total: all.length,
    new: all.filter((w) => w.status === 'new').length,
    learning: all.filter((w) => w.status === 'learning').length,
    mastered: all.filter((w) => w.status === 'mastered').length,
    due: all.filter((w) => w.due).length,
  };

  view.innerHTML = `
    <div class="page-head">
      <div><div class="eyebrow">My Vocabulary</div><h1>مفرداتي</h1><p>كل ما حفظته محفوظ في قاعدة البيانات ويبقى بعد إعادة التحميل.</p></div>
      <div class="btn-row"><button class="btn" id="selectBtn">${icon.check} تحديد لحملة</button><a class="btn primary" href="#/review">${icon.cards} راجع الآن</a></div>
    </div>
    <div class="grid cols-5" style="margin-bottom:22px">
      ${[['total', 'الإجمالي', ''], ['new', 'جديدة', 'new'], ['learning', 'قيد التعلّم', 'learning'], ['mastered', 'متقنة', 'mastered'], ['due', 'مستحقة للمراجعة', 'due']]
        .map(([k, l, st]) => `<button class="card stat link" data-status="${st}" style="text-align:start;border:1px solid var(--line)"><div class="value">${num(counts[k])}</div><div class="label">${l}</div></button>`).join('')}
    </div>
    <div class="tabs" id="sections"></div>
    <div class="filters">
      <div class="search" style="position:relative"><input class="input" id="q" placeholder="ابحث بالإنجليزية أو العربية…" style="padding-inline-start:40px">
        <span style="position:absolute;inset-inline-start:12px;top:50%;transform:translateY(-50%);width:18px;color:var(--muted)">${icon.search}</span></div>
      <select class="input" id="level"><option value="">كل المستويات</option><option>B1</option><option>B2</option><option>C1</option></select>
      <select class="input" id="status"><option value="">كل الحالات</option><option value="new">جديدة</option><option value="learning">قيد التعلّم</option><option value="mastered">متقنة</option><option value="due">مستحقة</option><option value="difficult">صعبة</option></select>
      <select class="input" id="video"><option value="">كل الفيديوهات</option>${videos.map((v) => `<option value="${v.id}">${esc(v.title.slice(0, 48))}</option>`).join('')}</select>
      <div class="dates"><input class="input" type="date" id="from" title="من تاريخ" style="padding:9px 8px"><input class="input" type="date" id="to" title="إلى تاريخ" style="padding:9px 8px"></div>
    </div>
    <div id="list"></div>
    <div id="selectBar"></div>`;

  const $ = (s) => view.querySelector(s);
  $('#level').value = f.level;
  $('#status').value = f.status;
  $('#video').value = f.video;

  function filtered() {
    const q = f.q.trim().toLowerCase();
    return all.filter((w) => {
      if (!inSection(w, f.section)) return false;
      if (f.level && w.level !== f.level) return false;
      if (f.status === 'due' && !w.due) return false;
      if (f.status === 'difficult' && !w.difficult) return false;
      if (['new', 'learning', 'mastered'].includes(f.status) && w.status !== f.status) return false;
      if (f.video && String(w.video?.id) !== String(f.video)) return false;
      if (f.from && w.saved_at < new Date(`${f.from}T00:00:00`).toISOString()) return false;
      if (f.to) {
        const end = new Date(`${f.to}T00:00:00`);
        end.setDate(end.getDate() + 1);
        if (w.saved_at >= end.toISOString()) return false;
      }
      if (q && !(`${w.term} ${w.arabic} ${w.arabic_general} ${w.simple_english}`.toLowerCase().includes(q))) return false;
      return true;
    });
  }

  function draw() {
    $('#sections').innerHTML = SECTIONS.map(([k, l]) => `<button class="tab ${k === f.section ? 'active' : ''}" data-s="${k}">${l} <span class="count">${all.filter((w) => inSection(w, k)).length}</span></button>`).join('');
    words = filtered();
    $('#list').innerHTML = words.length
      ? `<p class="small muted" style="margin-bottom:10px">${words.length} عنصرًا</p><div class="word-list">${words.map((w) => wordRowHtml(w, { selectable: selectMode, selected: selected.has(w.uv_id) })).join('')}</div>`
      : emptyState('🔍', 'لا توجد نتائج', all.length ? 'جرّب تغيير الفلاتر أو القسم.' : 'احفظ كلمات من فيديو يوتيوب لتظهر هنا.', all.length ? '' : `<a class="btn primary" href="#/analyzer">حلّل فيديو</a>`);
    $('#selectBar').innerHTML = selectMode
      ? `<div class="select-bar"><span>${selected.size} محددة</span><div class="btn-row">
          <button class="btn sm" id="selAll">تحديد الظاهر</button>
          <button class="btn sm primary" id="mkCamp" ${selected.size ? '' : 'disabled'}>${icon.flag} إنشاء حملة</button>
          <button class="btn sm ghost" id="selCancel" style="color:inherit">إلغاء</button></div></div>`
      : '';
    $('#selAll')?.addEventListener('click', () => {
      words.forEach((w) => selected.add(w.uv_id));
      draw();
    });
    $('#selCancel')?.addEventListener('click', () => {
      selectMode = false;
      selected.clear();
      draw();
    });
    $('#mkCamp')?.addEventListener('click', async () => {
      const name = prompt('اسم الحملة', 'كلماتي المختارة');
      if (!name) return;
      try {
        const c = await api.createCampaign({ name, source_type: 'selection', uv_ids: [...selected] });
        toast('تم إنشاء الحملة');
        location.hash = `#/campaigns/${c.id}`;
      } catch (err) {
        toast(err.message);
      }
    });
  }

  $('#sections').addEventListener('click', (e) => {
    const b = e.target.closest('[data-s]');
    if (!b) return;
    f.section = b.dataset.s;
    draw();
  });
  view.querySelectorAll('[data-status]').forEach((b) =>
    b.addEventListener('click', () => {
      f.status = b.dataset.status;
      f.section = 'all';
      $('#status').value = f.status;
      draw();
    }),
  );
  $('#q').addEventListener('input', (e) => {
    f.q = e.target.value;
    draw();
  });
  for (const k of ['level', 'status', 'video', 'from', 'to']) {
    $(`#${k}`).addEventListener('change', (e) => {
      f[k] = e.target.value;
      draw();
    });
  }
  $('#selectBtn').addEventListener('click', () => {
    selectMode = !selectMode;
    draw();
  });
  $('#list').addEventListener('change', (e) => {
    if (!e.target.matches('[data-act="select"]')) return;
    const id = Number(e.target.closest('.word-row').dataset.id);
    if (e.target.checked) selected.add(id);
    else selected.delete(id);
    draw();
  });
  // In select mode a row click toggles its checkbox instead of opening the card.
  $('#list').addEventListener('click', (e) => {
    if (!selectMode) return;
    const row = e.target.closest('.word-row');
    if (!row || e.target.matches('.check')) return;
    e.stopPropagation();
    const cb = row.querySelector('.check');
    cb.checked = !cb.checked;
    cb.dispatchEvent(new Event('change', { bubbles: true }));
  }, true);
  bindWordList($('#list'), () => words, {
    onChange: (updated) => {
      if (!updated) render(view, { params });
    },
  });
  draw();
}
