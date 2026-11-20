// 🧠 Keep what ChatGPT answered (its summary of a video) under that video's name in «أفكار».
// A small window: pick the video (when not already known), paste the answer, save. Saved as one more text in the video's entry.
import { api } from './api.js';
import { esc, openModal, closeModal, toast } from './ui.js';

/** @param {{sourceId?: number, title?: string, current?: string, onSaved?: (note:any)=>void}} o  — without sourceId the learner picks the video. */
export async function openGptNote({ sourceId, title = '', current = '', onSaved } = {}) {
  let choices = [];
  if (!sourceId) {
    try { choices = (await api.sources()).filter((s) => s && s.id); } catch { choices = []; }
    if (!choices.length) { toast('أضف مقطعًا أو نصًا أول، وبعدها احفظ له ملخص ChatGPT.'); return; }
  }
  const box = openModal(`<div class="stack gpt-save">
      <h2 style="margin:0">احفظ ملخص ChatGPT</h2>
      ${sourceId
        ? `<p class="tiny muted en" dir="auto" style="margin:0">${esc(title)}</p>`
        : `<label class="field"><span class="tiny muted">اختر المقطع</span><select class="input" id="gnPick">${choices.map((s) => `<option value="${s.id}">${esc(s.title || '')}</option>`).join('')}</select></label>`}
      <label class="field"><span class="tiny muted">الصق هنا ردّ ChatGPT (المس مطوّلًا ← لصق)</span><textarea class="input" id="gnText" rows="9" dir="auto" placeholder="الصق الملخص هنا…">${esc(current)}</textarea></label>
      <div class="btn-row"><button type="button" class="btn primary" id="gnSave">احفظ باسم المقطع</button><button type="button" class="btn ghost" data-close>إلغاء</button></div>
      <p class="tiny muted" style="margin:0">يظهر في «أفكار» تحت اسم المقطع، وتقدر تعدّله أو تحذفه (بحفظ نص فاضي).</p>
    </div>`);
  const ta = box.querySelector('#gnText');
  setTimeout(() => ta?.focus(), 50);
  box.querySelector('#gnSave').addEventListener('click', async (e) => {
    const id = sourceId || Number(box.querySelector('#gnPick')?.value);
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
