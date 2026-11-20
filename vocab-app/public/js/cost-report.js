// 📊 The owner's month: what the AI cost, how much was added (clips · minutes), what one clip costs, and what the same use
// would cost for 100 / 1000 learners at lighter or heavier use. Read once, when the owner opens it (nothing runs by itself).
import { api } from './api.js';
import { esc, openModal, toast } from './ui.js';

const usd = (n) => `${n < 1 ? n.toFixed(3) : n.toFixed(2)}$`;
const ar = (n) => Number(n).toLocaleString('en-US');

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
      <p class="tiny muted" style="margin:0">أرقام تقريبية: المقاطع المشتركة بين الناس تُحسب مرة وحدة (فالواقع أقل). الكلفة هنا محسوبة من تسجيل الموقع نفسه، وقد تختلف قليلًا عن صفحة OpenRouter. كلفة Netlify (الكردت) تُقرأ من صفحة Usage في حسابك هناك.</p>
    </div>`;
}

export const costReportHtml = () => '<div class="card stack" style="grid-column:1/-1"><b>📊 كلفة الموقع علي</b><p class="tiny muted" style="margin:0">كم صرفت هذا الشهر على الذكاء الاصطناعي، وكم مقطع ودقيقة حلّلت، وتقدير لو استخدم الناس مثلك.</p><button type="button" class="btn ghost" id="costRep" style="justify-self:start">اعرض استهلاكي</button></div>';
export const bindCostReport = (root) => root.querySelector('#costRep')?.addEventListener('click', () => openCostReport().catch((e) => toast(e.message)));
