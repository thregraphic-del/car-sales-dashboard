// 📒 «أفكار» — the summaries the learner kept from videos, with their own notes.
// ✎ edit the note; type @ then a minute (e.g. @3 or @3:20) to pick the sentence said at that
// moment and write about it (it is kept with the note and opens the video right there).
import { api } from '../api.js';
import { esc, icon, toast, emptyState } from '../ui.js';
import { summaryHtml } from '../summary-view.js';
import { openGptNote } from '../gpt-note.js';
import { askChatGpt } from '../chatgpt-ask.js';

const fmt = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
const TOKEN = /@(\d{1,3})(?::(\d{1,2}))?/g;
const secOf = (m, s) => Number(m) * 60 + (s ? Number(s) : 0);
const thumbOf = (n) => n.thumbnail_url || (n.youtube_id ? `https://i.ytimg.com/vi/${encodeURIComponent(n.youtube_id)}/mqdefault.jpg` : '');

// the note with each @minute shown as a small time chip that opens the video there
function noteHtml(n) {
  if (!n.note) return '';
  const text = esc(n.note).replace(TOKEN, (all, m, s) => `<a class="nt-at en-inline" href="#/source/${n.source_id}?t=${secOf(m, s)}">⏱ ${fmt(secOf(m, s))}</a>`);
  const refs = (n.refs || []).map((r) => `<a class="nt-ref" href="#/source/${n.source_id}?t=${r.t}"><span class="nt-t en-inline">⏱ ${fmt(r.t)}</span><span class="en" dir="ltr">${esc(r.en)}</span>${r.ar ? `<span class="tiny muted">${esc(r.ar)}</span>` : ''}</a>`).join('');
  return `<div class="nt-note"><b>✍️ ملاحظتي</b><p>${text.replace(/\n/g, '<br>')}</p>${refs ? `<div class="nt-refs">${refs}</div>` : ''}</div>`;
}

// 📌 passages highlighted while watching — tap one to go back to that moment in the video
const clipsHtml = (n) => (n.clips?.length ? `<div class="nt-clips"><b>📌 مقتطفاتي</b>${n.clips.map((c, i) => `
  <div class="nt-clip"><a class="nt-clip-go" href="#/source/${n.source_id}?t=${c.t}"><span class="nt-t en-inline">⏱ ${fmt(c.t)}</span><mark class="en" dir="ltr">${esc(c.en)}</mark>${c.ar ? `<span class="tiny muted">${esc(c.ar)}</span>` : ''}</a>
  <button type="button" class="btn icon sm ghost" data-delclip="${i}" aria-label="احذف المقتطف">✕</button></div>`).join('')}</div>` : '');

// 🧠 the summary pasted from ChatGPT, kept under the video's name
const gptHtml = (n) => (n.gpt ? `<div class="nt-gpt"><div class="row between"><b><span class="gpt-mark" aria-hidden="true"></span> ملخص ChatGPT</b><button type="button" class="btn sm ghost" data-gpt>تعديل</button></div><div class="nt-gpt-t" dir="auto">${esc(n.gpt).replace(/\n/g, '<br>')}</div></div>` : '');

// one short line about the video: the summary's first sentence, else the first passage or the note
const blurbOf = (n) => {
  const first = (t) => String(t || '').split(/(?<=[.!؟?])\s/)[0].slice(0, 140);
  return first(n.summary?.idea) || first(n.gpt) || (n.clips?.[0] ? `“${n.clips[0].en.slice(0, 120)}”` : '') || first(n.note);
};
// closed: cover + name + one line (tap to open); open: the note, passages and summary
const cardHtml = (n) => `
  <article class="card nt-card" data-src="${n.source_id}">
    <header class="nt-head" data-toggle role="button" tabindex="0" aria-expanded="false">
      ${thumbOf(n) ? `<img class="nt-thumb" src="${esc(thumbOf(n))}" alt="" loading="lazy" onerror="this.remove()">` : '<span class="nt-thumb nt-noimg">📄</span>'}
      <div class="nt-meta"><b class="nt-title en clamp2">${esc(n.title || '')}</b>
        <span class="tiny muted clamp2 nt-blurb">${esc(blurbOf(n))}</span>
        <span class="tiny nt-counts">${n.summary ? '<span>📝 ملخص</span>' : ''}${n.gpt ? '<span><span class="gpt-mark" aria-hidden="true"></span> ChatGPT</span>' : ''}${n.clips?.length ? `<span>📌 ${n.clips.length}</span>` : ''}${n.note ? '<span>✍️ ملاحظة</span>' : ''}<span class="en-inline muted">${esc(n.channel || '')}</span></span></div>
      <span class="nt-caret" aria-hidden="true">▾</span>
    </header>
    <div class="nt-body">
      <div class="nt-tools"><a class="btn sm" href="#/source/${n.source_id}" ${n.exists ? '' : 'aria-disabled="true"'}>▶ افتح المقطع</a><button type="button" class="btn sm ghost" data-edit>${icon.edit} ملاحظة</button><button type="button" class="btn icon sm ghost" data-del title="احذف من «أفكار»" aria-label="احذف">${icon.trash}</button></div>
      ${gptHtml(n)}${noteHtml(n)}${clipsHtml(n)}${n.summary ? summaryHtml(n.summary) : ''}</div>
  </article>`;

export async function render(view, { params } = {}) {
  const only = Number(params?.source) || 0;
  if (only) return renderOne(view, only);
  view.innerHTML = `<div class="page-head"><div><div class="eyebrow">Insights</div><h1>أفكار</h1><p class="muted small">ملخصات المقاطع والمقاطع اللي ظلّلتها، مع ملاحظاتك عليها.</p></div>
      <button type="button" class="btn sm" id="ntAddGpt"><span class="gpt-mark" aria-hidden="true"></span> أضف ملخص ChatGPT</button></div>
    <div class="stack" id="ntList"><p class="tiny muted"><span class="spinner"></span></p></div>`;
  const listEl = view.querySelector('#ntList');
  let notes = [];
  const draw = () => {
    listEl.innerHTML = notes.length ? notes.map(cardHtml).join('')
      : emptyState?.('📒', 'ما حفظت خلاصات للحين', 'افتح «📝 ملخص المقطع» في أي فيديو واضغط «احفظ في «أفكار»»، أو اضغط «أضف ملخص ChatGPT» فوق والصق ملخصك.') || '<div class="card empty"><h3>ما حفظت خلاصات للحين</h3><p>افتح «📝 ملخص المقطع» في أي فيديو واضغط «احفظ في «أفكار»».</p></div>';
  };
  try { notes = (await api.notes()).notes; } catch (err) { listEl.innerHTML = `<div class="alert">${esc(err.message)}</div>`; return; }
  draw();

  const linesOf = new Map(); // source → its transcript lines (loaded when a note is edited)
  const getLines = async (id) => {
    if (!linesOf.has(id)) linesOf.set(id, api.source(id).then((d) => d.lines.filter((l) => l.start_seconds != null)).catch(() => []));
    return linesOf.get(id);
  };
  const lineAt = (lines, t) => {
    let best = null;
    for (const l of lines) { if (Number(l.start_seconds) <= t + 0.5) best = l; else break; }
    return best || lines[0] || null;
  };

  const edit = async (card, n) => {
    const body = card.querySelector('.nt-body');
    body.querySelector('.nt-tools').insertAdjacentHTML('afterend', `<div class="nt-edit">
      <textarea class="input" rows="4" placeholder="اكتب ملاحظتك… واكتب @ ثم الدقيقة (مثل @3 أو @3:20) عشان تختار الجملة اللي انقالت فيها">${esc(n.note || '')}</textarea>
      <div class="nt-pick" hidden></div>
      <div class="btn-row"><button type="button" class="btn primary sm" data-save>حفظ</button><button type="button" class="btn sm ghost" data-cancel>إلغاء</button></div></div>`);
    card.querySelector('.nt-note')?.remove();
    const ta = body.querySelector('textarea');
    const pick = body.querySelector('.nt-pick');
    ta.focus();
    const refs = new Map((n.refs || []).map((r) => [r.t, r]));
    // while typing @minute: the sentences around that moment, one tap picks the exact one
    ta.addEventListener('input', async () => {
      const before = ta.value.slice(0, ta.selectionStart);
      const m = before.match(/@(\d{1,3})(?::(\d{0,2}))?$/);
      if (!m) { pick.hidden = true; return; }
      const lines = await getLines(n.source_id);
      if (!lines.length) { pick.hidden = false; pick.innerHTML = '<span class="tiny muted">هذا المقطع ما فيه أوقات للجمل.</span>'; return; }
      const t = secOf(m[1], m[2] || 0);
      const i = Math.max(0, lines.indexOf(lineAt(lines, t)));
      const near = lines.slice(Math.max(0, i - 1), i + 3);
      pick.hidden = false;
      pick.innerHTML = near.map((l) => `<button type="button" class="nt-cand" data-t="${Math.floor(l.start_seconds)}"><span class="nt-t en-inline">${fmt(l.start_seconds)}</span><span class="en" dir="ltr">${esc(l.text)}</span>${l.text_ar ? `<span class="tiny muted">${esc(l.text_ar)}</span>` : ''}</button>`).join('');
      pick.onclick = (e) => {
        const b = e.target.closest('[data-t]');
        if (!b) return;
        const tt = Number(b.dataset.t);
        const l = lines.find((x) => Math.floor(x.start_seconds) === tt);
        refs.set(tt, { t: tt, en: l?.text || '', ar: l?.text_ar || '' });
        const pos = ta.selectionStart;
        const start = before.length - m[0].length;
        ta.value = `${ta.value.slice(0, start)}@${fmt(tt)} ${ta.value.slice(pos)}`;
        ta.focus();
        ta.selectionStart = ta.selectionEnd = start + fmt(tt).length + 2;
        pick.hidden = true;
      };
    });
    body.querySelector('[data-cancel]').addEventListener('click', () => { body.querySelector('.nt-edit').remove(); body.querySelector('.nt-tools').insertAdjacentHTML('afterend', noteHtml(n)); });
    body.querySelector('[data-save]').addEventListener('click', async () => {
      const note = ta.value.trim();
      // keep only the sentences the note still points at (typed @minutes are found too)
      const used = [];
      const lines = note.includes('@') ? await getLines(n.source_id) : [];
      for (const m of note.matchAll(TOKEN)) {
        const t = secOf(m[1], m[2]);
        if (used.some((r) => r.t === t)) continue;
        const known = refs.get(t);
        const l = known ? null : lineAt(lines, t);
        if (known) used.push(known);
        else if (l) used.push({ t, en: l.text, ar: l.text_ar || '' });
      }
      try {
        const r = await api.editNote(n.source_id, note, used);
        Object.assign(n, r.note);
        body.querySelector('.nt-edit').remove();
        body.querySelector('.nt-tools').insertAdjacentHTML('afterend', noteHtml(n));
        toast('تم الحفظ ✓');
      } catch (err) { toast(err.message); }
    });
  };

  const reload = async () => { try { notes = (await api.notes()).notes; draw(); } catch (err) { toast(err.message); } };
  view.querySelector('#ntAddGpt').addEventListener('click', () => openGptNote({ onSaved: reload }));

  listEl.addEventListener('click', async (e) => {
    const card = e.target.closest('[data-src]');
    if (!card) return;
    const n = notes.find((x) => String(x.source_id) === card.dataset.src);
    const dc = e.target.closest('[data-delclip]');
    if (dc) {
      const c = n.clips[Number(dc.dataset.delclip)];
      try { await api.dropClip(n.source_id, c.t, c.en); n.clips = n.clips.filter((x) => x !== c); if (!n.summary && !n.note && !n.clips.length) notes = notes.filter((x) => x !== n); draw(); } catch (err) { toast(err.message); }
      return;
    }
    const tg = e.target.closest('[data-toggle]');
    if (tg) { const on = !card.classList.contains('open'); card.classList.toggle('open', on); tg.setAttribute('aria-expanded', String(on)); return; }
    if (e.target.closest('[data-gpt]')) { openGptNote({ sourceId: n.source_id, title: n.title, current: n.gpt || '', onSaved: reload }); return; }
    if (e.target.closest('[data-edit]')) { if (!card.querySelector('.nt-edit')) edit(card, n); return; }
    if (e.target.closest('[data-del]')) {
      if (!confirm('تحذف هذي الخلاصة من «أفكار»؟')) return;
      try { await api.dropNote(n.source_id); notes = notes.filter((x) => x !== n); draw(); } catch (err) { toast(err.message); }
    }
  });
}

/* ------------------------------------------------ one clip's ideas (opened from the 💡 in the clip) */
const IC_GPT = '<span class="gpt-mark" aria-hidden="true"></span>';
const IC_PASTE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" width="26" height="26" aria-hidden="true"><path d="M6 3h12v18l-6-4-6 4z"/></svg>';

async function renderOne(view, id) {
  let data;
  try { data = await api.source(id); } catch (err) { view.innerHTML = emptyState('🔎', 'ما لقينا هذا المقطع', err.message, '<a class="btn" href="#/notes">كل الأفكار</a>'); return; }
  const src = data.source;
  const lines = (data.lines || []).map((l) => l.text).filter(Boolean);
  view.innerHTML = `<div class="nt-one">
    <header class="cs-head"><a class="btn icon ghost cs-x" href="#/source/${id}" aria-label="رجوع للمقطع" title="رجوع للمقطع">✕</a><h1>أفكاري عن المقطع</h1></header>
    <p class="tiny muted en clamp2" dir="auto" style="margin:0">${esc(src.title || '')}</p>
    <div class="nt-actions" role="group" aria-label="أدوات الأفكار">
      <button type="button" class="nt-act" id="ntAsk" title="اسأل ChatGPT: يجهّز رسالة تلخيص جاهزة ويفتح ChatGPT">${IC_GPT}<span>اسأل ChatGPT</span></button>
      <button type="button" class="nt-act" id="ntPaste" title="الصق تلخيص ChatGPT واحفظه هنا">${IC_PASTE}<span>الصق تلخيص ChatGPT</span></button>
    </div>
    <p class="tiny muted nt-hint">وهنا تنحفظ أفكارك: الجمل اللي ظلّلتها من المقطع، وملاحظتك، وملخص ChatGPT.</p>
    <div class="stack" id="ntList"><p class="tiny muted"><span class="spinner"></span></p></div></div>`;
  const listEl = view.querySelector('#ntList');
  let notes = [];
  const blank = () => ({ source_id: id, title: src.title, youtube_id: src.youtube_id || null, thumbnail_url: src.thumbnail_url || null, exists: true, summary: null, gpt: '', note: '', refs: [], clips: [], blank: true });
  const mine = (all) => { const n = all.find((x) => Number(x.source_id) === id); return n ? [n] : [blank()]; };
  const draw = () => {
    listEl.innerHTML = notes.map(cardHtml).join('');
    listEl.querySelectorAll('.nt-card').forEach((c) => { c.classList.add('open'); c.querySelector('[data-toggle]')?.setAttribute('aria-expanded', 'true'); });
  };
  const reload = async () => { try { notes = mine((await api.notes()).notes); draw(); } catch (err) { toast(err.message); } };
  try { notes = mine((await api.notes()).notes); } catch (err) { listEl.innerHTML = `<div class="alert">${esc(err.message)}</div>`; return; }
  draw();
  view.querySelector('#ntAsk').addEventListener('click', () => askChatGpt(lines));
  view.querySelector('#ntPaste').addEventListener('click', () => openGptNote({ sourceId: id, title: src.title, current: notes[0]?.gpt || '', onSaved: reload }));
  const linesOf = lines.length ? Promise.resolve((data.lines || []).filter((l) => l.start_seconds != null)) : Promise.resolve([]);
  listEl.addEventListener('click', async (e) => {
    const card = e.target.closest('[data-src]');
    if (!card) return;
    const n = notes[0];
    const dc = e.target.closest('[data-delclip]');
    if (dc) { const c = n.clips[Number(dc.dataset.delclip)]; try { await api.dropClip(id, c.t, c.en); n.clips = n.clips.filter((x) => x !== c); draw(); } catch (err) { toast(err.message); } return; }
    if (e.target.closest('[data-gpt]')) { openGptNote({ sourceId: id, title: src.title, current: n.gpt || '', onSaved: reload }); return; }
    if (e.target.closest('[data-edit]')) { if (!card.querySelector('.nt-edit')) await editOne(card, n, linesOf); return; }
    if (e.target.closest('[data-del]')) {
      if (!confirm('تحذف أفكار هذا المقطع من «أفكار»؟')) return;
      try { await api.dropNote(id); notes = [blank()]; draw(); } catch (err) { toast(err.message); }
    }
  });
}

// writing a note (with @minute sentences) for the clip shown on this page
async function editOne(card, n, linesP) {
  const lines = await linesP;
  const body = card.querySelector('.nt-body');
  body.querySelector('.nt-tools').insertAdjacentHTML('afterend', `<div class="nt-edit">
    <textarea class="input" rows="5" placeholder="اكتب ملاحظتك… واكتب @ ثم الدقيقة (مثل @3 أو @3:20) عشان تربطها بجملة من المقطع">${esc(n.note || '')}</textarea>
    <div class="btn-row"><button type="button" class="btn primary sm" data-save>حفظ</button><button type="button" class="btn sm ghost" data-cancel>إلغاء</button></div></div>`);
  card.querySelector('.nt-note')?.remove();
  const ta = body.querySelector('textarea');
  ta.focus();
  const lineAt = (t) => { let best = null; for (const l of lines) { if (Number(l.start_seconds) <= t + 0.5) best = l; else break; } return best || lines[0] || null; };
  body.querySelector('[data-cancel]').addEventListener('click', () => { body.querySelector('.nt-edit').remove(); body.querySelector('.nt-tools').insertAdjacentHTML('afterend', noteHtml(n)); });
  body.querySelector('[data-save]').addEventListener('click', async () => {
    const note = ta.value.trim();
    const used = [];
    for (const m of note.matchAll(TOKEN)) {
      const t = secOf(m[1], m[2]);
      if (used.some((r) => r.t === t)) continue;
      const known = (n.refs || []).find((r) => r.t === t);
      const l = known ? null : lineAt(t);
      if (known) used.push(known);
      else if (l) used.push({ t, en: l.text, ar: l.text_ar || '' });
    }
    try {
      const r = await api.editNote(n.source_id, note, used);
      if (r.note) { Object.assign(n, r.note); delete n.blank; } else { n.note = ''; n.refs = []; }
      body.querySelector('.nt-edit').remove();
      body.querySelector('.nt-tools').insertAdjacentHTML('afterend', noteHtml(n));
      toast('تم الحفظ ✓');
    } catch (err) { toast(err.message); }
  });
}
