// The green «i»: a short explanation of what is new, and an «explain mode» — while it is on, tapping any icon or
// option tells you what it means instead of doing it. Nothing runs in the background.
import { openModal, closeModal } from './ui.js';
import { setInfoMode, isInfoMode } from './tooltips.js';

const NEW = [
  ['➕', 'صفحة «أضف»', 'الصق رابطًا أو نصًا أو ملفًا وإحنا نستخرج الكلمات. مصادر التعلّم بفلتر واحد للمستوى والمجال.'],
  ['⚙', 'إعدادات المقطع', 'صارت صفحة مستقلة: السرعة، حجم الخط، مكان الفيديو، قف للترديد، تكرار الجملة، قائمة الكلمات، شريط الوقت.'],
  ['💡', 'أفكار', 'اسأل ChatGPT، احفظ ملخصه، اكتب ملاحظة. كلها في صفحة «أفكار».'],
  ['☑', 'التحديد في «نشاطي»', 'اختر مقاطع ثم: مفضلة، تصنيف (متقن/مراجعة)، ترتيب، إخفاء وإظهار، قسم، حذف.'],
  ['👆', 'شرح تحت الأيقونات', 'ثبّت إصبعك نصف ثانية على أي أيقونة (أو مرّر المؤشر) وتطلع رسالة صغيرة بمعناها.'],
  ['🤝', 'انضم لفريقنا', 'من الإعدادات: احصل على كودك واربح عمولة، وتابع من سجّل به وارسل طلب التحويل.'],
  ['🎨', 'تصميم أنعم', 'زوايا دائرية أوضح وألوان ثابتة ومريحة في كل الصفحات.'],
];

let banner = null;
function showBanner() {
  if (!banner) {
    banner = document.createElement('div');
    banner.className = 'info-banner';
    banner.setAttribute('role', 'status');
    banner.innerHTML = '<span>وضع الشرح شغّال: اضغط أي أيقونة أو خيار تعرف معناه</span><button type="button" class="info-stop">إيقاف</button>';
    banner.querySelector('.info-stop').addEventListener('click', stop);
    document.body.appendChild(banner);
  }
  banner.hidden = false;
}
function start() { setInfoMode(true); showBanner(); document.querySelectorAll('#infoBtn, #infoBtnSide').forEach((b) => b.classList.add('on')); }
function stop() { setInfoMode(false); if (banner) banner.hidden = true; document.querySelectorAll('#infoBtn, #infoBtnSide').forEach((b) => b.classList.remove('on')); }

function openPanel() {
  const box = openModal(`<div class="stack info-box"><h2 style="margin:0"><span class="info-i">i</span> شرح الموقع</h2>
    <button type="button" class="btn primary lg info-go" id="infoGo">شغّل وضع الشرح</button>
    <p class="tiny muted" style="margin:0">بعد ما تشغّله، اضغط أي أيقونة أو خيار في أي صفحة وتطلع لك رسالة تشرح معناه (بدون ما ينفّذ شيئًا). واضغط «إيقاف» لما تخلص.</p>
    <h3 style="margin:8px 0 0;font-size:15px">الجديد</h3>
    <ul class="info-list">${NEW.map(([e, t, d]) => `<li><span class="e" aria-hidden="true">${e}</span><span><b>${t}</b><span class="tiny muted">${d}</span></span></li>`).join('')}</ul></div>`);
  box.querySelector('#infoGo').addEventListener('click', () => { closeModal(true); start(); });
}

export function startInfo() {
  document.querySelectorAll('#infoBtn, #infoBtnSide').forEach((b) => b.addEventListener('click', () => (isInfoMode() ? stop() : openPanel())));
}
