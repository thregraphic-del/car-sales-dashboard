// 🧠 Keep what ChatGPT answered (its summary of a video) under that video's name in «أفكار».
// A small window: pick the video (when not already known), paste the answer, save. Saved as one more text in the video's entry.
import { api } from './api.js';
import { esc, openModal, closeModal, toast } from './ui.js';
import { filterBarHtml, filterBarClick, placeMenus } from './filter-bar.js';

const thumbOf = (s) => s.thumbnail_url || (s.youtube_id ? `https://i.ytimg.com/vi/${encodeURIComponent(s.youtube_id)}/mqdefault.jpg` : '');

/** @param {{sourceId?: number, title?: string, current?: string, onSaved?: (note:any)=>void}} o  — without sourceId the learner picks the video. */
export async function openGptNote({ sourceId, title = '', current = '', onSaved, own = false } = {}) {
  let choices = [];
  if (!sourceId) {
    try { choices = (await api.sources()).filter((s) => s && s.id); } catch { choices = []; }
    if (!choices.length) { toast('أضف مقطعًا أو نصًا أول، وبعدها احفظ له ملخص ChatGPT.'); return; }
  }
  const box = openModal(`<div class="stack gpt-save">
      <h2 style="margin:0">${own ? 'اكتب ملاحظة' : 'احفظ ملخص ChatGPT'}</h2>
      ${sourceId
        ? `<p class="tiny muted en" dir="auto" style="margin:0">${esc(title)}</p>`
        : '<div class="field"><span class="tiny muted">اختر المقطع</span><div id="gnBar"></div></div>'}
      <label class="field"><span class="tiny muted">${own ? 'اكتب فكرتك أو اللي أعجبك في المقطع' : 'الصق هنا ردّ ChatGPT (المس مطوّلًا ← لصق)'}</span><textarea class="input" id="gnText" rows="9" dir="auto" placeholder="${own ? 'اكتب ملاحظتك هنا…' : 'الصق الملخص هنا…'}">${esc(current)}</textarea></label>
      <div class="btn-row"><button type="button" class="btn primary" id="gnSave">${own ? 'احفظ الملاحظة' : 'احفظ باسم المقطع'}</button><button type="button" class="btn ghost" data-close>إلغاء</button></div>
      <p class="tiny muted" style="margin:0">يظهر في «أفكار» تحت اسم المقطع، وتقدر تعدّله أو تحذفه (بحفظ نص فاضي).</p>
    </div>`);
  // the clip picker: the same list as «تدرّب» — each clip with its picture and title, opening as a menu under the button
  let pick = choices[0]?.id || 0;
  let open = '';
  const defs = () => [{ k: 'from', t: 'المقطع', video: true, value: String(pick), opts: choices.map((s) => [String(s.id), s.title || 'بدون عنوان', null, thumbOf(s)]) }];
  const bar = box.querySelector('#gnBar');
  const drawBar = () => {
    if (!bar) return;
    bar.innerHTML = filterBarHtml(defs(), open);
    placeMenus(bar);
    bar.querySelectorAll('img').forEach((img) => img.addEventListener('error', () => { img.style.visibility = 'hidden'; }, { once: true }));
  };
  bar?.addEventListener('click', (e) => {
    const r = filterBarClick(e, defs(), open);
    if (!r) return;
    if ('open' in r) open = r.open;
    else { pick = Number(r.value); open = ''; }
    drawBar();
  });
  drawBar();
  const ta = box.querySelector('#gnText');
  setTimeout(() => ta?.focus(), 50);
  box.querySelector('#gnSave').addEventListener('click', async (e) => {
    const id = sourceId || pick;
    const text = ta.value.trim();
    if (!id) return;
    if (!text && !current) { toast('الصق الملخص أول.'); return; }
    e.target.disabled = true;
    try {
      const r = await api.keepGpt(id, text);
      closeModal();
      toast(text ? '✓ انحفظ في «أفكار» باسم المقطع' : 'انحذف الملخص');
      onSaved?.(r.note);
    } catch (err) { e.target.disabled = false; toast(err.message); }
  });
}
