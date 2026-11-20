// 📊 The owner's month: what the AI cost, how much was added (clips · minutes), what one clip costs, and what the same use
// would cost for 100 / 1000 learners at lighter or heavier use. Read once, when the owner opens it (nothing runs by itself).
import { api } from './api.js';
import { esc, openModal, toast } from './ui.js';

const usd = (n) => `${n < 1 ? n.toFixed(3) : n.toFixed(2)}$`;
const ar = (n) => Number(n).toLocaleString('en-US');

const STEP = [
  [/^translate/, 'الترجمة'], [/^video_summary/, 'ملخص المقطع'], [/^recap/, 'السوالف باختصار'], [/^extract_(chunk|vocabulary)/, 'استخراج الكلمات'],
  [/^align/, 'ضبط توقيت الجمل'], [/^(word_forms|forms_batch)/, 'أشكال الكلمات'], [/^dictionary_batch/, 'شرح الكلمات'], [/^cefr/, 'مستويات الكلمات'],
  [/^(easy_synonyms|synonym_check)/, 'المرادفات'], [/^simple_example/, 'أمثلة بسيطة'], [/^say_ar/, 'نطق الكلمات بالعربي'], [/^tidy_terms/, 'ترتيب الكلمات'],
  [/^(word_in_context|explain_selection)/, 'شرح كلمة أو جملة'], [/^suggest|^more_channels/, 'الاقتراحات'], [/^story/, 'القصص'], [/^meaning_ladder/, 'سلّم المعنى'],
  [/^grammar/, 'القواعد'], [/^extract_file/, 'قراءة ملف'], [/^enrich/, 'إكمال الكلمات'], [/^transcript/, 'جلب نص يوتيوب (Supadata)'],
];
const stepName = (task) => STEP.find(([re]) => re.test(task))?.[1] || task;
const thumbOf = (c) => c.thumbnail_url || (c.youtube_id ? `https://i.ytimg.com/vi/${encodeURIComponent(c.youtube_id)}/mqdefault.jpg` : '');

/** 🧾 every clip with what it cost; tap one to see each step (translation, summary, words…). */
export async function openClipCosts() {
  const box = openModal('<h2>🧾 كلفة كل مقطع</h2><p class="muted"><span class="spinner"></span> نقرأ التفاصيل…</p>', { wide: true });
  let r;
  try { r = await api.clipCosts(); } catch (err) { box.insertAdjacentHTML('beforeend', `<div class="alert">${esc(err.message)}</div>`); return; }
  const card = (c) => `<article class="cc-card" data-cc>
      <button type="button" class="cc-head" aria-expanded="false">
        ${c.source_id && thumbOf(c) ? `<img class="cc-thumb" src="${esc(thumbOf(c))}" alt="" loading="lazy">` : `<span class="cc-thumb cc-noimg">${c.source_id ? '📄' : '⚙'}</span>`}
        <span class="cc-meta"><b class="en clamp2" dir="auto">${esc(c.source_id ? (c.title || (c.deleted ? 'مقطع محذوف' : 'مقطع')) : 'طلبات عامة (اقتراحات، شرح كلمات…)')}</b>
          <span class="tiny muted">${c.minutes ? `${ar(c.minutes)} دقيقة · ` : ''}${ar(c.calls)} طلب${c.transcripts ? ' · نص مجلوب' : ''}</span></span>
        <b class="cc-cost en-inline">${usd(c.cost)}</b></button>
      <div class="cc-steps" hidden>${c.steps.length ? c.steps.map((s) => `<div class="row between small"><span>${esc(stepName(s.task))} <span class="tiny muted en-inline">×${ar(s.calls)}</span></span><b class="en-inline">${usd(s.cost)}</b></div>`).join('') : ''}
        ${c.transcripts ? '<div class="row between small"><span>جلب نص يوتيوب (Supadata)</span><span class="tiny muted">يُحسب في اشتراك Supadata</span></div>' : ''}</div>
    </article>`;
  box.innerHTML = `<button class="btn icon sm ghost modal-close" data-close aria-label="إغلاق">✕</button>
    <div class="stack cost-rep"><h2 style="margin:0">🧾 كلفة كل مقطع</h2>
      <p class="tiny muted" style="margin:0">آخر ٩٠ يوم، من تاريخ تفعيل هذه الميزة فقط (ما قبلها غير مسجّل). المجموع: <b class="en-inline">${usd(r.total)}</b></p>
      ${r.clips.length ? r.clips.map(card).join('') : '<p class="muted">ما فيه استهلاك مسجّل بعد — حلّل مقطعًا جديدًا وبيظهر هنا.</p>'}
    </div>`;
  // a picture that does not load becomes the plain placeholder (no inline handlers allowed on this site)
  box.querySelectorAll('img.cc-thumb').forEach((img) => img.addEventListener('error', () => { const s = document.createElement('span'); s.className = 'cc-thumb cc-noimg'; s.textContent = '📄'; img.replaceWith(s); }, { once: true }));
  box.addEventListener('click', (e) => {
    const h = e.target.closest('.cc-head');
    if (!h) return;
    const steps = h.parentElement.querySelector('.cc-steps');
    const on = steps.hidden;
    steps.hidden = !on;
    h.setAttribute('aria-expanded', String(on));
  });
}

export async function openCostReport() {
  const box = openModal('<h2>📊 استهلاكي هذا الشهر</h2><p class="muted"><span class="spinner"></span> نقرأ استهلاكك…</p>', { wide: true });
  let r;
  try { r = await api.myMonth(); } catch (err) { box.insertAdjacentHTML('beforeend', `<div class="alert">${esc(err.message)}</div>`); return; }
  if (!r.admin) { box.innerHTML = '<button class="btn icon sm ghost modal-close" data-close aria-label="إغلاق">✕</button><h2>📊 استهلاكي</h2><p class="muted">هذا التقرير لصاحب الموقع فقط.</p>'; return; }
  const clips = r.videos + r.texts;
  const perClip = clips ? r.cost / clips : 0;
  const perMin = r.minutes ? r.cost / r.minutes : 0;
  const month = r.day_of_month ? (r.cost / r.day_of_month) * r.days_in_month : 0;
  const row = (label, factor) => {
    const one = month * factor;
    return `<tr><td>${label}</td><td class="en-inline">${usd(one)}</td><td class="en-inline">${usd(one * 100)}</td><td class="en-inline">${usd(one * 1000)}</td></tr>`;
  };
  box.innerHTML = `<button class="btn icon sm ghost modal-close" data-close aria-label="إغلاق">✕</button>
    <div class="stack cost-rep">
      <h2 style="margin:0">📊 استهلاكي هذا الشهر <span class="tiny muted en-inline">${esc(r.month)}</span></h2>
      <div class="cr-grid">
        <div><b class="en-inline">${ar(r.videos)}</b><span>مقطع يوتيوب</span></div>
        <div><b class="en-inline">${ar(r.texts)}</b><span>نص / مقال</span></div>
        <div><b class="en-inline">${ar(r.minutes)}</b><span>دقيقة محلَّلة</span></div>
        <div><b class="en-inline">${ar(r.calls)}</b><span>طلب ذكاء اصطناعي</span></div>
        <div><b class="en-inline">${ar(r.transcripts)}</b><span>نص يوتيوب مجلوب</span></div>
        <div><b class="en-inline">${ar(r.active_days)}</b><span>يوم نشاط</span></div>
      </div>
      <div class="cr-cost"><span>كلفة الذكاء الاصطناعي حتى الآن</span><b class="en-inline">${usd(r.cost)}</b></div>
      <div class="row between small"><span>كلفة المقطع الواحد (تقريبًا)</span><b class="en-inline">${clips ? usd(perClip) : '—'}</b></div>
      <div class="row between small"><span>كلفة الدقيقة المحلَّلة</span><b class="en-inline">${r.minutes ? usd(perMin) : '—'}</b></div>
      <div class="row between small"><span>لو استمر نفس المعدل لآخر الشهر</span><b class="en-inline">${usd(month)}</b></div>
      <b class="small">وإذا استخدم الناس مثلك؟ (الكلفة الشهرية)</b>
      <table class="cr-tbl"><thead><tr><th></th><th>مستخدم</th><th>١٠٠</th><th>١٠٠٠</th></tr></thead><tbody>
        ${row('خفيف (ربع نشاطك)', 0.25)}${row('متوسط (نصف نشاطك)', 0.5)}${row('مكثّف (مثلك)', 1)}
      </tbody></table>
      <button type="button" class="btn" id="crClips">🧾 تفاصيل كل مقطع</button>
      <p class="tiny muted" style="margin:0">أرقام تقريبية: المقاطع المشتركة بين الناس تُحسب مرة وحدة (فالواقع أقل). الكلفة هنا محسوبة من تسجيل الموقع نفسه، وقد تختلف قليلًا عن صفحة OpenRouter. كلفة Netlify (الكردت) تُقرأ من صفحة Usage في حسابك هناك.</p>
    </div>`;
  box.querySelector('#crClips')?.addEventListener('click', () => openClipCosts());
}

export const costReportHtml = () => '<div class="card stack" style="grid-column:1/-1"><b>📊 كلفة الموقع علي</b><p class="tiny muted" style="margin:0">كم صرفت هذا الشهر على الذكاء الاصطناعي، وكم مقطع ودقيقة حلّلت، وتقدير لو استخدم الناس مثلك.</p><button type="button" class="btn ghost" id="costRep" style="justify-self:start">اعرض استهلاكي</button></div>';
export const bindCostReport = (root) => root.querySelector('#costRep')?.addEventListener('click', () => openCostReport().catch((e) => toast(e.message)));
