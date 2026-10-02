import { api } from '../api.js';
import { esc, icon, emptyState, toast, openModal, closeModal, TOPIC_AR, relDate } from '../ui.js';
import { wordRowHtml, bindWordList } from '../components.js';

const COLORS = ['teal', 'indigo', 'amber', 'rose', 'slate'];
const SOURCE_AR = { video: 'فيديو واحد', videos: 'عدة فيديوهات', selection: 'كلمات مختارة', topic: 'موضوع' };

export async function render(view, { segments }) {
  if (segments[1]) return renderDetail(view, Number(segments[1]));
  const campaigns = await api.campaigns();
  view.innerHTML = `
    <div class="page-head"><div><div class="eyebrow">Learning Campaigns</div><h1>حملات التعلّم</h1>
      <p>اجمع كلماتك في حملات حسب الفيديو أو الموضوع، وتعلّمها ببطاقات وألعاب واستماع.</p></div>
      <button class="btn primary" id="new">${icon.plus} حملة جديدة</button></div>
    ${campaigns.length ? `<div class="grid cols-3">${campaigns.map(campCard).join('')}</div>`
      : emptyState('🚩', 'لا توجد حملات بعد', 'أنشئ حملة من فيديو أو موضوع مثل Business English.', `<button class="btn primary" data-new>${icon.plus} حملة جديدة</button>`)}`;
  view.querySelectorAll('#new, [data-new]').forEach((b) => b.addEventListener('click', () => openCreate()));
}

function campCard(c) {
  return `
    <a class="card camp-card camp-${esc(c.color || 'teal')}" href="#/campaigns/${c.id}" style="text-decoration:none">
      <div><div class="tiny muted">${SOURCE_AR[c.source_type] || ''}${c.source_type === 'topic' && c.source_ref ? ` · ${esc(TOPIC_AR[c.source_ref] || c.source_ref)}` : ''}</div>
        <h3 dir="auto">${esc(c.name)}</h3>${c.description ? `<p class="small ink-2" dir="auto" style="margin-top:4px">${esc(c.description)}</p>` : ''}</div>
      <div><div class="row between small" style="margin-bottom:6px"><span>التقدّم</span><b class="en-inline">${c.progress}%</b></div><div class="bar"><span style="width:${c.progress}%"></span></div></div>
      <div class="camp-nums"><div><b>${c.total}</b><span>كلمة</span></div><div><b style="color:var(--good)">${c.completed}</b><span>مكتملة</span></div><div><b>${c.remaining}</b><span>متبقية</span></div></div>
    </a>`;
}

async function openCreate() {
  const [videos, topics, words] = await Promise.all([api.videos(), api.topics(), api.words()]);
  let source = 'videos';
  const box = openModal(`
    <h2 style="margin-bottom:4px">حملة جديدة</h2><p class="small muted" style="margin-bottom:18px">اختر مصدر الكلمات.</p>
    <form id="cf" class="stack">
      <label class="field">الاسم<input class="input" name="name" required placeholder="مثال: Business English"></label>
      <label class="field">وصف (اختياري)<input class="input" name="description"></label>
      <div class="segmented" id="src">${Object.entries(SOURCE_AR).map(([k, l]) => `<button type="button" data-s="${k}" class="${k === source ? 'active' : ''}">${l}</button>`).join('')}</div>
      <div id="srcBody"></div>
      <div class="row" style="gap:8px">${COLORS.map((c, i) => `<label class="camp-${c}" style="cursor:pointer"><input type="radio" name="color" value="${c}" ${i === 0 ? 'checked' : ''} style="accent-color:var(--camp)"> <span style="display:inline-block;width:18px;height:18px;border-radius:6px;background:var(--camp);vertical-align:middle"></span></label>`).join('')}</div>
      <button class="btn primary lg" type="submit">إنشاء الحملة</button>
    </form>`);

  const body = box.querySelector('#srcBody');
  const drawBody = () => {
    if (source === 'video' || source === 'videos') {
      const type = source === 'video' ? 'radio' : 'checkbox';
      body.innerHTML = `<div class="stack" style="gap:6px;max-height:240px;overflow:auto">${videos.map((v, i) => `
        <label class="row" style="gap:10px;padding:8px 10px;border:1px solid var(--line);border-radius:12px;cursor:pointer">
          <input type="${type}" name="video" value="${v.id}" class="check" ${i === 0 && type === 'radio' ? 'checked' : ''}>
          <span class="en small" style="flex:1">${esc(v.title)}</span><span class="tiny muted">${v.saved_count}/${v.item_count}</span></label>`).join('') || '<p class="muted small">لا توجد فيديوهات بعد.</p>'}</div>
        <label class="row small" style="gap:8px;margin-top:10px"><input type="checkbox" name="include_unsaved" class="check"> احفظ أيضًا كل الكلمات المقترحة من الفيديو (غير المرفوضة)</label>`;
    } else if (source === 'topic') {
      body.innerHTML = `<select class="input" name="topic">${topics.map((t) => `<option value="${esc(t.topic)}">${esc(TOPIC_AR[t.topic] || t.topic)} (${t.n})</option>`).join('')}</select>`;
    } else {
      body.innerHTML = `<div class="stack" style="gap:4px;max-height:260px;overflow:auto">${words.map((w) => `
        <label class="row" style="gap:10px;padding:6px 8px;border-radius:10px;cursor:pointer"><input type="checkbox" name="uv" value="${w.uv_id}" class="check">
          <span class="en" style="font-weight:600">${esc(w.term)}</span><span class="small muted">${esc(w.arabic)}</span></label>`).join('')}</div>`;
    }
  };
  drawBody();
  box.querySelector('#src').addEventListener('click', (e) => {
    const b = e.target.closest('[data-s]');
    if (!b) return;
    source = b.dataset.s;
    box.querySelectorAll('#src button').forEach((x) => x.classList.toggle('active', x === b));
    drawBody();
  });
  box.querySelector('#cf').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const payload = {
      name: fd.get('name'),
      description: fd.get('description'),
      color: fd.get('color'),
      source_type: source,
      video_ids: fd.getAll('video').map(Number),
      include_unsaved: fd.get('include_unsaved') === 'on',
      topic: fd.get('topic'),
      uv_ids: fd.getAll('uv').map(Number),
    };
    try {
      const c = await api.createCampaign(payload);
      closeModal();
      toast('تم إنشاء الحملة');
      location.hash = `#/campaigns/${c.id}`;
    } catch (err) {
      toast(err.message);
    }
  });
}

async function renderDetail(view, id) {
  let c;
  try {
    c = await api.campaign(id);
  } catch (err) {
    view.innerHTML = emptyState('🚩', 'الحملة غير موجودة', err.message, '<a class="btn" href="#/campaigns">كل الحملات</a>');
    return;
  }
  view.innerHTML = `
    <div class="page-head">
      <div><a href="#/campaigns" class="small muted" style="text-decoration:none">← الحملات</a>
        <h1 style="margin-top:6px" dir="auto">${esc(c.name)}</h1>${c.description ? `<p dir="auto">${esc(c.description)}</p>` : ''}
        <p class="tiny muted">${SOURCE_AR[c.source_type]} · أُنشئت ${esc(relDate(c.created_at))}</p></div>
      <button class="btn ghost sm" id="del" style="color:var(--bad)">${icon.trash} حذف الحملة</button>
    </div>
    <div class="card camp-card camp-${esc(c.color || 'teal')}" style="padding:24px">
      <div class="grid cols-4">
        <div class="stat" style="padding:0"><div class="value">${c.total}</div><div class="label">عدد الكلمات</div></div>
        <div class="stat" style="padding:0"><div class="value">${c.progress}%</div><div class="label">التقدّم</div></div>
        <div class="stat" style="padding:0"><div class="value" style="color:var(--good)">${c.completed}</div><div class="label">مكتملة</div></div>
        <div class="stat" style="padding:0"><div class="value">${c.remaining}</div><div class="label">متبقية · ${c.due} للمراجعة</div></div>
      </div>
      <div class="bar"><span style="width:${c.progress}%"></span></div>
      <div class="btn-row">
        <a class="btn primary" href="#/review?campaign=${c.id}">${icon.cards} البطاقات</a>
        <a class="btn" href="#/games?campaign=${c.id}&scope=mixed">${icon.game} الألعاب</a>
        <a class="btn" href="#/listening?campaign=${c.id}">${icon.headphones} الاستماع</a>
      </div>
    </div>
    <div class="section-title"><h2>كلمات الحملة</h2><span class="small muted">B1 ${c.levels[0]} · B2 ${c.levels[1]} · C1 ${c.levels[2]}</span></div>
    <div class="word-list" id="list">${c.words.map((w) => wordRowHtml(w)).join('') || '<p class="muted">لا توجد كلمات.</p>'}</div>`;
  view.querySelector('#del').addEventListener('click', async () => {
    if (!confirm('حذف هذه الحملة؟ (لن تُحذف الكلمات من مفرداتك)')) return;
    await api.deleteCampaign(c.id);
    location.hash = '#/campaigns';
  });
  bindWordList(view.querySelector('#list'), () => c.words, { onChange: () => renderDetail(view, id) });
}
