// ❗ Guided tour: one icon at a time is lit (the rest dimmed), with a short card that explains it.
// «التالي / السابق / تخطّي». Runs by itself once (home, and the video page), then from the «!» button.
const HOME = [
  { t: '👋 أهلًا في LexiTube', d: 'تعلّم كلمات إنجليزية حقيقية من مقاطع يوتيوب. خلّنا نعرّفك على الموقع في دقيقة.' },
  { s: ['.today-go', '.hero-simple .btn.primary'], t: '▶ جلسة اليوم', d: 'كل يوم نجهّز لك كلمات تراجعها: الأخطاء أولًا ثم المستحقة ثم الجديدة. ضغطة وحدة وتبدأ.' },
  { s: ['#tabbar a[href="#/add"]', '#nav a[href="#/add"]'], t: '➕ أضف', d: 'الصق رابط يوتيوب أو أي نص. نجهّز لك الترجمة سطرًا بسطر والكلمات المفيدة. وفيها القنوات المقترحة و⭐ المفضلة ومقاطعك.' },
  { s: ['#tabbar a[href="#/words"]', '#nav a[href="#/words"]'], t: '📒 كلماتي', d: 'كل كلمة حفظتها مع معناها وأمثلتها ومستواها ومرادفاتها الأسهل. وتقدر تنزّلها ملف Excel.' },
  { s: ['#tabbar a[href="#/practice"]', '#nav a[href="#/practice"]'], t: '🎮 تدرّب', d: 'اختر الكلمات بـ٤ فلاتر بسيطة، ثم العب: اختبار، بطاقات، استماع، قصة، وألعاب كثيرة.' },
  { s: ['#menuBtn', '#nav a[href="#/friends"]'], t: '☰ القائمة', d: 'فيها 👥 أصدقائي (تحدَّ صديقك وشارك تقدمك) والإعدادات ورصيد الموقع.' },
  { s: ['#tourBtn'], t: '❗ الشرح', d: 'ارجع لهذا الشرح متى ما بغيت من هذي العلامة. بالتوفيق! 🚀' },
];
const READER = [
  { t: '🎬 صفحة المقطع', d: 'الفيديو فوق والنص تحته، وكل سطر مقابله ترجمته. اضغط أي كلمة لترى معناها وتحفظها.' },
  { s: ['#playBtn'], t: '▶ تشغيل / إيقاف', d: 'يوقف الفيديو ويبقى واقف حتى تضغطه مرة ثانية.' },
  { s: ['#againBtn'], t: '🔁 ×2', d: 'شغّله: كل جملة تنعاد مرتين تلقائيًا لتسمعها أكثر.' },
  { s: ['#shadowBtn'], t: '🗣 ردّد معي', d: 'يقف بعد كل جملة بنفس طولها لتقولها بصوتك، ثم يكمل.' },
  { s: ['#wordsBtn'], t: '📝 الكلمات الجديدة', d: 'قائمة الكلمات المفيدة في المقطع، ملوّنة حسب الشيوع: أخضر شائعة، أصفر أقل، أحمر نادرة.' },
  { s: ['#focusBtn'], t: '⛶ تكبير', d: 'يخفي كل شي غير الفيديو والنص للتركيز.' },
  { s: ['#goalChip'], t: '🎯 هدفك اليوم', d: 'كم كلمة جديدة مرّت عليك اليوم من هدفك.' },
  { s: ['#setBtn'], t: '⚙ الإعدادات', d: 'السرعة، حجم الخط، مكان الفيديو (فوق/تحت/عائم)، الترجمة، الملخص بالعامية، وغيرها.' },
];

const done = (k) => { try { return localStorage.getItem(`tour.${k}`) === '1'; } catch { return true; } };
const mark = (k) => { try { localStorage.setItem(`tour.${k}`, '1'); } catch { /* ignore */ } };
const visible = (el) => el && el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden';

export function startTour(kind = 'home') {
  const steps = (kind === 'reader' ? READER : HOME).filter((st) => !st.s || st.s.some((q) => visible(document.querySelector(q))));
  if (!steps.length) return;
  mark(kind);
  document.querySelector('.tour')?.remove();
  const root = document.createElement('div');
  root.className = 'tour';
  root.innerHTML = '<div class="tour-spot"></div><div class="tour-card" role="dialog" aria-live="polite"></div>';
  document.body.appendChild(root);
  const spot = root.querySelector('.tour-spot');
  const card = root.querySelector('.tour-card');
  let i = 0;
  const close = () => { root.classList.add('out'); setTimeout(() => root.remove(), 250); window.removeEventListener('resize', place); };
  function place() {
    const st = steps[i];
    const el = st.s?.map((q) => document.querySelector(q)).find(visible);
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    if (el) {
      el.scrollIntoView({ block: 'nearest' });
      const r = el.getBoundingClientRect();
      const pad = 6;
      Object.assign(spot.style, { left: `${r.left - pad}px`, top: `${r.top - pad}px`, width: `${r.width + pad * 2}px`, height: `${r.height + pad * 2}px`, borderRadius: '14px' });
      const below = r.bottom + 190 < vh;
      card.style.top = below ? `${Math.min(vh - 180, r.bottom + 14)}px` : 'auto';
      card.style.bottom = below ? 'auto' : `${Math.max(12, vh - r.top + 14)}px`;
    } else {
      Object.assign(spot.style, { left: `${vw / 2}px`, top: `${vh / 2}px`, width: '0px', height: '0px', borderRadius: '50%' });
      card.style.top = `${Math.max(20, vh / 2 - 110)}px`;
      card.style.bottom = 'auto';
    }
  }
  function draw() {
    const st = steps[i];
    card.classList.remove('pop');
    void card.offsetWidth;
    card.classList.add('pop');
    card.innerHTML = `<div class="tour-t">${st.t}</div><p>${st.d}</p>
      <div class="tour-dots">${steps.map((_, k) => `<i class="${k === i ? 'on' : ''}"></i>`).join('')}</div>
      <div class="tour-btns"><button type="button" data-t="skip" class="tour-skip">تخطّي</button>
        <span>${i ? '<button type="button" data-t="prev">السابق</button>' : ''}<button type="button" data-t="next" class="tour-next">${i === steps.length - 1 ? 'تم ✓' : 'التالي ←'}</button></span></div>`;
    place();
  }
  root.addEventListener('click', (e) => {
    const b = e.target.closest('[data-t]')?.dataset.t;
    if (b === 'skip') return close();
    if (b === 'prev') { i = Math.max(0, i - 1); return draw(); }
    if (b === 'next' || e.target === root || e.target === spot) { if (i >= steps.length - 1) return close(); i += 1; return draw(); }
    return undefined;
  });
  window.addEventListener('resize', place);
  draw();
}

/** First visit: the tour starts by itself once. */
export function maybeTour(kind) {
  if (!done(kind)) setTimeout(() => startTour(kind), 900);
}
