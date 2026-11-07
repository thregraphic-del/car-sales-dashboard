// ❗ Guided tour: one icon at a time is lit (the rest dimmed), with a short card that explains it.
// «التالي / السابق / تخطّي». Runs by itself once (home, and the video page), then from the «!» button.
const HOME = [
  { t: '👋 أهلًا في 3Goal', d: 'تعلّم كلمات إنجليزية حقيقية من مقاطع يوتيوب. خلّنا نعرّفك على الموقع في دقيقة.' },
  { s: ['.today-go', '.hero-simple .btn.primary'], t: '▶ جلسة اليوم', d: 'كل يوم نجهّز لك كلمات تراجعها: الأخطاء أولًا ثم المستحقة ثم الجديدة. ضغطة وحدة وتبدأ.' },
  { s: ['#tabbar a[href="#/add"]', '#nav a[href="#/add"]'], t: '➕ أضف', d: 'الصق رابط يوتيوب أو أي نص. نجهّز لك الترجمة سطرًا بسطر والكلمات المفيدة. وفيها القنوات المقترحة و⭐ المفضلة ومقاطعك.' },
  { s: ['#tabbar a[href="#/words"]', '#nav a[href="#/words"]'], t: '📒 كلماتي', d: 'كل كلمة حفظتها مع معناها وأمثلتها ومستواها ومرادفاتها الأسهل. وتقدر تنزّلها ملف Excel.' },
  { s: ['#tabbar a[href="#/practice"]', '#nav a[href="#/practice"]'], t: '🎮 تدرّب', d: 'اختر الكلمات بـ٤ فلاتر بسيطة، ثم العب: اختبار، بطاقات، استماع، قصة، وألعاب كثيرة.' },
  { s: ['#menuBtn', '#nav a[href="#/friends"]'], t: '☰ القائمة', d: 'فيها 👥 أصدقائي (تحدَّ صديقك وشارك تقدمك) والإعدادات ورصيد الموقع.' },
  { s: ['#helpFab'], t: 'الشرح', d: 'زر «!» موجود في كل صفحة ولعبة: يشرح لك كل زر فيها. اسحبه لأي مكان، و✕ يصغّره. بالتوفيق!' },
];
const READER = [
  { t: 'صفحة المقطع', d: 'الفيديو فوق والنص تحته، وكل سطر مقابله ترجمته. اضغط أي كلمة لترى معناها وتحفظها.' },
  { s: ['.split'], t: 'كبّر أو صغّر الفيديو', d: 'اسحب هذا الخط لتحت يكبر الفيديو، ولفوق يصغر.' },
  { s: ['.float-bar'], t: 'الفيديو العائم', d: 'اسحب الشريط لتحرّكه لأي مكان، والزاوية ↘ أو قرّص بإصبعين لتكبيره وتصغيره.' },
  { s: ['#playBtn'], t: '▶ تشغيل / إيقاف', d: 'يوقف الفيديو ويبقى واقف حتى تضغطه مرة ثانية.' },
  { s: ['#againBtn'], t: '🔁 ×2', d: 'شغّله: كل جملة تنعاد مرتين تلقائيًا لتسمعها أكثر.' },
  { s: ['#shadowBtn'], t: '🗣 ردّد معي', d: 'يقف بعد كل جملة بنفس طولها لتقولها بصوتك، ثم يكمل.' },
  { s: ['#wordsBtn'], t: '📝 الكلمات الجديدة', d: 'قائمة الكلمات المفيدة في المقطع، ملوّنة حسب الشيوع: أخضر شائعة، أصفر أقل، أحمر نادرة.' },
  { s: ['#focusBtn'], t: '⛶ تكبير', d: 'يخفي كل شي غير الفيديو والنص للتركيز.' },
  { s: ['#goalChip'], t: '🎯 هدفك اليوم', d: 'كم كلمة جديدة مرّت عليك اليوم من هدفك.' },
  { s: ['#setBtn'], t: 'الإعدادات', d: 'السرعة، حجم الخط، الوقت، الترجمة، الملخص بالعامية، و«الفيديو»: فوق أو تحت أو عائم.' },
];
const ADD = [
  { s: ['#input'], t: 'الصق هنا', d: 'رابط يوتيوب، أو كلمات، أو أي نص إنجليزي. نفهم الصيغة لحالنا.' },
  { s: ['#go'], t: 'تحليل', d: 'يفتح المقطع مع الترجمة سطرًا بسطر، أو يطلع لك الكلمات لتحفظها.' },
  { s: ['#sources'], t: 'مقاطعي', d: 'كل مقاطعك. «تحديد» لترتيبها: مفضلة، أتقنته، مراجعة، أقسام، إخفاء، حذف.' },
  { s: ['.tile-row'], t: 'كلمات جاهزة', d: 'أشهر ١٠٠٠ كلمة، أشهر الأفعال المركّبة، أو اقترح لي كلمات في مجال تختاره.' },
  { s: ['#fdChips'], t: 'قنوات حسب المجال', d: 'اختر مجالًا ومستوى، واضغط شعار القناة لتفتحها في يوتيوب.' },
  { s: ['#favChip'], t: 'المفضلة', d: 'قنواتك، وقنوات وفيديوهات مشابهة لذوقك تتجدد كل يوم.' },
];
const WORDS = [
  { s: ['#q'], t: 'بحث', d: 'ابحث في كلماتك بالإنجليزي أو العربي.' },
  { s: ['#filters', '#level', '#sort'], t: 'الفلاتر والترتيب', d: 'حسب المستوى والمجموعة والمقطع والتاريخ.' },
  { s: ['#list'], t: 'كلماتك', d: 'اضغط أي كلمة لتفاصيلها: النطق، الصيغ، الأمثلة، المرادفات الأسهل.' },
  { s: ['#selectToggle'], t: 'تحديد', d: 'حدّد كلمات لتضعها في مجموعة أو تحذفها.' },
  { s: ['#exportBtn'], t: 'تنزيل', d: 'نزّل كلماتك ملف Excel مرتب وملوّن.' },
];
const PRACTICE = [
  { s: ['.dd-row'], t: 'اختر الكلمات', d: 'من أين، متى حفظتها، حالتها، وكم كلمة. كل زر يفتح قائمة قصيرة.' },
  { s: ['.pb-count'], t: 'جاهزة', d: 'عدد الكلمات المختارة، و«عرض» لتشيل أو تضيف كلمة بنفسك.' },
  { s: ['.pb-games'], t: 'العب', d: 'اضغط أي لعبة وتبدأ بالكلمات اللي اخترتها.' },
];
const GAME = [
  { s: ['.game-top'], t: 'اللعبة', d: 'اسم اللعبة ونتيجتك: صح ✅ وخطأ ❌.' },
  { s: ['.question', '.mem-grid', '.match-cols'], t: 'السؤال', d: 'اقرأ أو اسمع، واضغط 🔊 لتسمع الكلمة (مرتين = ببطء).' },
  { s: ['.options', '.kbd', '#sf', '#mf'], t: 'جاوب', d: 'اختر أو اكتب الإجابة.' },
  { s: ['#nextBtn:not(.hidden)', '.next-wrap'], t: 'التالي', d: 'بعد كل إجابة يطلع التصحيح والمثال، ثم التالي.' },
];
const CARDS = [
  { s: ['#fc'], t: 'البطاقة', d: 'تذكّر المعنى، ثم اقلبها.' },
  { s: ['#flipBtn'], t: 'اقلب', d: 'يظهر المعنى والمثال.' },
  { s: ['#grades'], t: 'قيّم نفسك', d: 'صعبة تتكرر قريبًا، سهلة تتباعد.' },
];
const LISTEN = [
  { s: ['#player'], t: 'الكلمة', d: 'الكلمة ونطقها ومعناها ومثال، بالترتيب.' },
  { s: ['#play'], t: 'تشغيل', d: 'يقرأ الكلمات وحدة وحدة بدون ما تلمس شي.' },
  { s: ['#rate'], t: 'السرعة', d: 'عادي أو بطيء.' },
  { s: ['.lt-toggles'], t: 'خيارات', d: 'انتقال تلقائي، ونطق المعنى العربي، ونطق ترجمة المثال. أخضر = شغال.' },
];
const STORY = [
  { s: ['#makeStory', '#storyPlay'], t: 'القصة', d: 'قصة قصيرة مناسبة للجميع فيها كلماتك، تُقرأ لك جملة جملة.' },
  { s: ['#storyLines'], t: 'الجمل', d: 'اضغط أي جملة لتسمعها، و🔊 لتعيدها.' },
];
const FRIENDS = [
  { s: ['.me-card'], t: 'بطاقتك', d: 'اسمك المستعار وخلفيتك، و«شارك اسمي» ليضيفك أصدقاؤك.' },
  { s: ['#shareBtn'], t: 'شارك تقدمك', d: 'رابط فيه أيامك وكلماتك يفتحه أي أحد.' },
  { s: ['#addF'], t: 'أضف صديق', d: 'اكتب اسم المستخدم حقه.' },
  { s: ['.lb'], t: 'الترتيب', d: 'نقاط الأسبوع، و«تحدَّ» لتحدّي بنفس العشر كلمات.' },
];
const SETTINGS = [
  { s: ['#name'], t: 'اسمك', d: 'يظهر في الترحيب.' },
  { s: ['#goal'], t: 'الهدف اليومي', d: 'كم كلمة تبي تراجع كل يوم.' },
  { s: ['#theme'], t: 'المظهر', d: 'فاتح أو داكن.' },
  { s: ['#emForm'], t: 'الإيميل', d: 'يوصلك عليه كود إذا نسيت كلمة المرور.' },
];
const TOURS = { home: HOME, reader: READER, add: ADD, words: WORDS, practice: PRACTICE, game: GAME, cards: CARDS, listen: LISTEN, story: STORY, friends: FRIENDS, settings: SETTINGS };

/** Which tour fits the screen that is open now. */
export function currentTour() {
  const h = location.hash;
  if (h.startsWith('#/source')) return 'reader';
  if (h.startsWith('#/add')) return 'add';
  if (h.startsWith('#/words')) return 'words';
  if (h.startsWith('#/friends')) return 'friends';
  if (h.startsWith('#/settings')) return 'settings';
  if (h.startsWith('#/practice')) {
    if (document.querySelector('#fc')) return 'cards';
    if (document.querySelector('.lt-toggles')) return 'listen';
    if (document.querySelector('#makeStory, #storyLines')) return 'story';
    if (document.querySelector('.game-stage')) return 'game';
    return 'practice';
  }
  return 'home';
}

/** ❗ The floating help button: on every screen, draggable, ✕ makes it a tiny dot. */
export function mountHelp() {
  if (document.querySelector('#helpFab')) return;
  const b = document.createElement('div');
  b.id = 'helpFab';
  b.className = 'help-fab';
  b.innerHTML = '<button type="button" class="hf-go" aria-label="شرح هذه الصفحة">!</button><button type="button" class="hf-x" aria-label="تصغير">✕</button>';
  document.body.appendChild(b);
  let pos = null;
  try { pos = JSON.parse(localStorage.getItem('help.pos') || 'null'); } catch { /* none */ }
  const mini = () => { try { return localStorage.getItem('help.mini') === '1'; } catch { return false; } };
  const place = () => {
    b.classList.toggle('mini', mini());
    if (pos && !mini()) { b.style.left = `${Math.min(innerWidth - 50, Math.max(4, pos.x * innerWidth))}px`; b.style.top = `${Math.min(innerHeight - 120, Math.max(60, pos.y * innerHeight))}px`; b.style.right = 'auto'; b.style.bottom = 'auto'; } else { ['left', 'top', 'right', 'bottom'].forEach((k) => b.style.removeProperty(k)); }
  };
  place();
  let drag = null;
  b.addEventListener('pointerdown', (e) => {
    if (mini() || e.target.closest('.hf-x')) return;
    drag = { x: e.clientX, y: e.clientY, r: b.getBoundingClientRect(), moved: false };
    b.setPointerCapture(e.pointerId);
  });
  b.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x; const dy = e.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 6) drag.moved = true;
    if (!drag.moved) return;
    b.style.left = `${drag.r.left + dx}px`; b.style.top = `${drag.r.top + dy}px`; b.style.right = 'auto'; b.style.bottom = 'auto';
  });
  b.addEventListener('pointerup', () => {
    if (!drag) return;
    if (drag.moved) {
      const r = b.getBoundingClientRect();
      pos = { x: r.left / innerWidth, y: r.top / innerHeight };
      try { localStorage.setItem('help.pos', JSON.stringify(pos)); } catch { /* ignore */ }
      b.dataset.dragged = '1';
      setTimeout(() => { delete b.dataset.dragged; }, 50);
    }
    drag = null;
  });
  b.addEventListener('click', (e) => {
    if (b.dataset.dragged) return;
    if (e.target.closest('.hf-x')) { try { localStorage.setItem('help.mini', '1'); } catch { /* ignore */ } place(); return; }
    if (mini()) { try { localStorage.setItem('help.mini', '0'); } catch { /* ignore */ } place(); return; }
    startTour(currentTour());
  });
  window.addEventListener('resize', place);
}

const done = (k) => { try { return localStorage.getItem(`tour.${k}`) === '1'; } catch { return true; } };
const mark = (k) => { try { localStorage.setItem(`tour.${k}`, '1'); } catch { /* ignore */ } };
const visible = (el) => el && el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden';

export function startTour(kind = 'home') {
  const steps = (TOURS[kind] || HOME).filter((st) => !st.s || st.s.some((q) => visible(document.querySelector(q))));
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
