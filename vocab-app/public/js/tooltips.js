// One small explanation under any icon: hover it (computer) or hold a finger on it for half a second (phone).
// The text comes from the button's title / aria-label (a button that already shows a word needs none).
// short label -> what the button is for
const HELP = {
  'القائمة': 'القائمة: تنقّل بين صفحات الموقع',
  'أيامك المتتالية': 'الشعلة: أيامك المتتالية في التعلّم، اضغطها لترى التفاصيل',
  'الجديد والتذكير': 'الجرس: الجديد في الموقع والتذكير اليومي',
  'بحث': 'بحث: ابحث عن كلمة',
  'فلاتر': 'فلاتر: صفِّ الكلمات حسب المستوى والحالة وغيرها',
  'الفلاتر': 'فلاتر: صفِّ الكلمات حسب المستوى والحالة وغيرها',
  'فلاتر ': 'فلاتر: صفِّ الكلمات حسب المستوى والحالة وغيرها',
  'الفلتر': 'فلتر: اختر المستوى والمجال',
  'الفلتر (المستوى والمجال)': 'فلتر: اختر المستوى والمجال وتُطبَّق فورًا',
  'ترتيب': 'ترتيب: غيّر ترتيب الكلمات',
  'تحديد': 'تحديد: اختر عدة عناصر ونفّذ عليها إجراءً دفعة واحدة',
  'المجموعات': 'المجموعات: رتّب كلماتك في مجموعات',
  'تصدير': 'تنزيل: احفظ كلماتك في ملف',
  'المفضلة': 'المفضلة: اعرض المفضلة فقط',
  'مفضلة': 'أضفه إلى المفضلة أو أزِله منها',
  'أضف للمفضلة': 'أضفه إلى المفضلة',
  'استمع': 'استمع إلى النطق',
  'احفظ': 'احفظ الكلمة في «كلماتي»',
  'محفوظة': 'محفوظة في «كلماتي»',
  'تصغير القائمة': 'تصغير القائمة الجانبية',
  'إغلاق': 'إغلاق النافذة',
  'السؤال السابق': 'العودة إلى السؤال السابق',
  'الشهر السابق': 'الشهر السابق',
  'الشهر التالي': 'الشهر التالي',
};
const say = (t) => HELP[t.trim()] || t;
let bubble = null;
let timer = 0;
let hideTimer = 0;
let shownAt = 0;
let cur = null;

const tipOf = (el) => {
  if (!el) return '';
  if (el.dataset.tip) return say(el.dataset.tip);
  const t = el.getAttribute('title');
  if (t) { el.dataset.tip = t; el.removeAttribute('title'); return say(t); } // our bubble replaces the slow native one
  const a = el.getAttribute('aria-label');
  const word = (el.textContent || '').replace(/[\s‏‎]/g, '');
  return a && word.length < 2 ? say(a) : '';
};
const findTarget = (n) => {
  for (let el = n instanceof Element ? n : n?.parentElement; el && el !== document.body; el = el.parentElement) {
    if (el.matches?.('button, a, [role="button"], label, .tile, .fd-sq, [data-tip], [title]') && tipOf(el)) return el;
  }
  return null;
};
function hide() {
  clearTimeout(timer); clearTimeout(hideTimer);
  bubble?.classList.remove('on');
  cur = null;
}
function show(el) {
  const text = tipOf(el);
  if (!text) return;
  if (!bubble) {
    bubble = document.createElement('div');
    bubble.className = 'tip-bubble';
    bubble.setAttribute('role', 'tooltip');
    document.body.appendChild(bubble);
  }
  bubble.textContent = text;
  const r = el.getBoundingClientRect();
  bubble.classList.add('on');
  const w = bubble.offsetWidth;
  const left = Math.max(8, Math.min(window.innerWidth - w - 8, r.left + r.width / 2 - w / 2));
  const below = r.bottom + 10;
  const top = below + bubble.offsetHeight > window.innerHeight - 8 ? r.top - bubble.offsetHeight - 10 : below;
  bubble.style.left = `${Math.round(left)}px`;
  bubble.style.top = `${Math.round(top)}px`;
  cur = el;
  shownAt = Date.now();
}

export function startTooltips() {
  const fine = window.matchMedia?.('(hover: hover) and (pointer: fine)').matches;
  // computer: appears under the icon shortly after the mouse rests on it
  document.addEventListener('pointerover', (e) => {
    if (e.pointerType === 'touch') return;
    const el = findTarget(e.target);
    if (!el || el === cur) return;
    hide();
    timer = setTimeout(() => show(el), 350);
  });
  document.addEventListener('pointerout', (e) => { if (e.pointerType !== 'touch') hide(); });
  document.addEventListener('focusin', (e) => { if (fine && e.target.matches?.(':focus-visible')) { const el = findTarget(e.target); if (el) show(el); } });
  document.addEventListener('focusout', hide);
  // phone: hold ~0.5 s; the tap that follows the hold is swallowed so the button does not fire
  document.addEventListener('touchstart', (e) => {
    hide();
    const el = findTarget(e.target);
    if (!el || e.touches.length !== 1) return;
    timer = setTimeout(() => { show(el); hideTimer = setTimeout(hide, 3500); }, 480);
  }, { passive: true });
  const cancel = () => clearTimeout(timer);
  document.addEventListener('touchmove', cancel, { passive: true });
  document.addEventListener('touchend', () => { cancel(); }, { passive: true });
  document.addEventListener('touchcancel', cancel, { passive: true });
  document.addEventListener('click', (e) => {
    if (Date.now() - shownAt < 700 && cur && cur.contains(e.target) && !fine) { e.preventDefault(); e.stopPropagation(); }
  }, true);
  window.addEventListener('scroll', hide, { passive: true, capture: true });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hide(); });
}
