// ❗ Guided tour: one icon at a time is lit (the rest dimmed), with a short card that explains it.
// «التالي / السابق / تخطّي». Runs by itself once (home, and the video page), then from the «!» button.
const HOME = [
  { t: '👋 أهلًا في 3Goal', d: 'تعلّم كلمات إنجليزية حقيقية من مقاطع يوتيوب. خلّنا نعرّفك على الموقع في دقيقة.' },
  { s: ['.th-task'], t: '📚 مهمتك اليوم', d: 'كل يوم نراجع كلمات آخر يوم تعلّمت فيه — بألعاب مختلفة عشوائية. اختر العدد والمستوى وابدأ.' },
  { s: ['#bell'], t: '🔔 الجديد والتذكير', d: 'كل شي جديد يطلع هنا، ومنه تضبط منبّه يومي لساعة تختارها.' },
  { s: ['#tabbar a[href="#/add"]', '#nav a[href="#/add"]'], t: '➕ أضف', d: 'الصق رابط يوتيوب أو أي نص. نجهّز لك الترجمة سطرًا بسطر والكلمات المفيدة. وفيها القنوات المقترحة و⭐ المفضلة ومقاطعك.' },
  { s: ['#tabbar a[href="#/words"]', '#nav a[href="#/words"]'], t: '📒 كلماتي', d: 'كل كلمة حفظتها مع معناها وأمثلتها ومستواها ومرادفاتها الأسهل. وتقدر تنزّلها ملف Excel.' },
  { s: ['#tabbar a[href="#/practice"]', '#nav a[href="#/practice"]'], t: '🎮 تدرّب', d: 'اختر الكلمات بـ٤ فلاتر بسيطة، ثم العب: اختبار، بطاقات، استماع، قصة، وألعاب كثيرة.' },
  { s: ['#menuBtn', '#nav a[href="#/friends"]'], t: '☰ القائمة', d: 'فيها 👥 أصدقائي (تحدَّ صديقك وشارك تقدمك) والإعدادات ورصيد الموقع.' },
  { s: ['#infoBtn', '#infoBtnDesk'], t: 'الشرح', d: 'أيقونة «i» موجودة في كل صفحة: تضغطها ويشرح لك أزرار الصفحة زرًّا زرًّا. بالتوفيق!' },
];
const READER = [
  { t: 'صفحة المقطع', d: 'الفيديو فوق والنص تحته وكل جملة معها ترجمتها. اضغط أي كلمة تشوف معناها وتحفظها.' },
  { s: ['#backLink'], t: 'رجوع', d: 'يرجعك لصفحة «أضف».' },
  { s: ['#setBtn'], t: 'الإعدادات', d: 'تفتح صفحة: السرعة، حجم الخط، مكان الفيديو، الترديد، الأوقات.' },
  { s: ['#focusBtn'], t: 'توسيع الشاشة', d: 'يخفي كل شي غير الفيديو والنص للتركيز.' },
  { s: ['#wordsBtn'], t: 'الكلمات', d: 'قائمة الكلمات الجديدة في المقطع، تحفظها منها.' },
  { s: ['#gptTop'], t: 'ChatGPT', d: 'يجهّز رسالة تلخيص جاهزة ويفتح ChatGPT.' },
  { s: ['#playBtn'], t: 'تشغيل / إيقاف', d: 'يوقف الفيديو أو يكمّله.' },
  { s: ['.split'], t: '١) كبّر أو صغّر الفيديو', d: 'اسحب هذا الخط لتحت يكبر الفيديو، ولفوق يصغر — على مقاسك.' },
  { s: ['#lines'], t: '٢) ظلّل واحفظ في «أفكاري»', d: 'ظلّل جملة أو جزء من النص بإصبعك، تطلع «📌 احفظ في أفكاري» وتلقاه بعدها في صفحة أفكاري.' },
  { s: ['#timeStrip'], t: 'شريط الوقت', d: 'يوريك وين وصلت في المقطع، وتسحبه للتنقل.' },
  { s: ['#goalChip'], t: 'هدفك اليوم', d: 'كم كلمة جديدة مرّت عليك اليوم من هدفك.' },
];
const ADD = [
  { s: ['#input'], t: 'الصق هنا', d: 'رابط يوتيوب أو تيك توك أو مقال، أو نص عربي أو إنجليزي أو متداخل.' },
  { s: ['.ph-file'], t: 'ملف', d: 'ارفق صورة لصفحة كلمات أو PDF أو Word ونستخرج منها الكلمات.' },
  { s: ['#attachMenu'], t: 'مشبك', d: 'استورد ملفًا أو صورة، أو التقط صورة بالكاميرا، ونستخرج منها الكلمات.' },
  { s: ['#go'], t: 'استخرج', d: 'يحلّل اللي لصقته ويفتح المقطع أو يطلع لك الكلمات.' },
  { s: ['#srcKind'], t: 'مقاطعي ونصوص', d: 'بدّل بين مقاطع يوتيوب اللي أضفتها والنصوص.' },
  { s: ['#srcPick'], t: 'تحديد', d: 'اختر عدة مقاطع ونفّذ عليها: مفضلة، تصنيف، ترتيب، إخفاء، قسم، حذف.' },
  { s: ['#srcFav'], t: 'المفضلة', d: 'يعرض مقاطعك المفضلة فقط.' },
  { s: ['#fdKind'], t: 'قنوات ومواقع', d: 'مصادر مناسبة لتعلّم الإنجليزي: قنوات يوتيوب أو مواقع.' },
  { s: ['#lvBtn'], t: 'الفلتر', d: 'اختر المستوى والمجال وتُطبّق مباشرة.' },
  { s: ['#favChip'], t: 'مفضلة المصادر', d: 'قنواتك ومواقعك المفضلة.' },
  { s: ['.tile-row'], t: 'اختصارات', d: 'أشهر ١٠٠٠ كلمة، أشهر الأفعال المركّبة، أو «اقترح لي».' },
];
const WORDS = [
  { s: ['#summary'], t: 'إجمالي كلماتك', d: 'عدد كلماتك، كم متقنة، وكم تحتاج مراجعة.' },
  { s: ['.wd-seg'], t: 'الكلمات والقواعد', d: 'بدّل بين كلماتك وقواعدك.' },
  { s: ['#wdTools [aria-label="بحث"]'], t: 'بحث', d: 'ابحث في كلماتك بالإنجليزي أو العربي.' },
  { s: ['#wdTools [aria-label="فلاتر"]'], t: 'فلاتر', d: 'صفِّ الكلمات حسب المستوى والمقطع والحالة والتاريخ.' },
  { s: ['#wdTools [aria-label="ترتيب"]'], t: 'ترتيب', d: 'غيّر ترتيب الكلمات.' },
  { s: ['#selectToggle'], t: 'تحديد', d: 'حدّد كلمات لتضعها في مجموعة أو تحذفها.' },
  { s: ['#wdTools [aria-label="المجموعات"]'], t: 'المجموعات', d: 'رتّب كلماتك في مجموعات.' },
  { s: ['#exportBtn'], t: 'تنزيل', d: 'نزّل كلماتك ملف Excel مرتب وملوّن.' },
  { s: ['#list'], t: 'كلماتك', d: 'اضغط أي كلمة لتفاصيلها: النطق والأمثلة والمرادفات.' },
];
const PRACTICE = [
  { s: ['.pb-fbtn'], t: 'الفلتر', d: 'اختر أي كلمات تتدرب عليها: المستوى والحالة والمقطع والوقت.' },
  { s: ['.pb-start'], t: 'ابدأ', d: 'عدد الكلمات المختارة، و«تدرّب» يبدأ اختبارًا متنوعًا بها.' },
  { s: ['.pb-seg', '.wd-seg'], t: 'الكلمات والقواعد', d: 'تدرّب على كلماتك أو على القواعد.' },
  { s: ['.pb-grid'], t: 'الألعاب', d: 'اضغط أي لعبة وتبدأ بكلماتك: اختبار، بطاقات، استماع، قصة وغيرها.' },
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
  { s: ['.tm-contacts'], t: 'تواصل معنا', d: 'واتساب أو إيميل مباشرة.' },
  { s: ['#joinTeam'], t: 'انضم لفريقنا', d: 'احصل على كودك الخاص واربح عمولة عن كل من يسجّل به.' },
  { s: ['#name'], t: 'اسمك', d: 'يظهر في الترحيب.' },
  { s: ['#goalTypes'], t: 'الهدف اليومي', d: 'اختر وش يُحسب: كلمات، دقائق، أسئلة، قواعد — وكم العدد.' },
  { s: ['#theme'], t: 'المظهر', d: 'فاتح أو داكن.' },
  { s: ['#emForm'], t: 'الإيميل', d: 'يوصلك عليه كود إذا نسيت كلمة المرور.' },
];
const CLIPSET = [
  { s: ['.cs-x'], t: 'إغلاق', d: 'يقفل الصفحة ويرجعك للمقطع.' },
  { s: ['a[aria-label="نسخ النص"]'], t: 'نسخ', d: 'ينسخ كل نص المقطع لتلصقه في ChatGPT أو أي مكان.' },
  { s: ['.cs-ideas'], t: 'أفكار', d: 'صفحة أفكارك عن المقطع: اسأل ChatGPT، الصق ملخصه، اكتب ملاحظة.' },
  { s: ['#csRate'], t: 'السرعة', d: 'سرعة الفيديو: أبطأ تفهم أوضح، وأسرع توفّر وقتك.' },
  { s: ['.cs-row:has(#csShadow)'], t: 'قف للترديد', d: 'يقف بعد كل جملة لتعيدها بصوتك.' },
  { s: ['.cs-row:has(#csRepeat)'], t: 'تكرار الجملة', d: 'كل جملة تنعاد مرتين.' },
  { s: ['.cs-row:has(#csWords)'], t: 'قائمة الكلمات', d: 'تطلع الكلمات الجديدة وأنت تشاهد.' },
  { s: ['.cs-font'], t: 'حجم الخط', d: 'اضغط − أو + وتشوف التغيير في المقطع.' },
  { s: ['#csVp'], t: 'مكان الفيديو', d: 'فوق النص أو تحته.' },
  { s: ['.cs-row:has(#csStrip)'], t: 'شريط الوقت', d: 'شريط يوريك وين وصلت في المقطع.' },
  { s: ['.cs-row:has(#csTimes)'], t: 'وقت كل جملة', d: 'يظهر وقت كل جملة بجنبها.' },
  { s: ['.cs-legend'], t: 'الألوان', d: 'البرتقالي كلمة جديدة عليك، والتيفاني كلمة كانت في كلماتك.' },
  { s: ['.cs-tip'], t: 'تكبير وتظليل', d: 'كبّر الفيديو أو صغّره بسحب الخط تحته، وظلّل أي جزء من النص واحفظه في «أفكاري».' },
];
const NOTES = [
  { s: ['#ntAddGpt'], t: 'أضف ملخص ChatGPT', d: 'الصق ملخصًا من ChatGPT واحفظه باسم المقطع.' },
  { s: ['.nt-card'], t: 'أفكارك', d: 'كل مقطع له بطاقة: ملخصاته وملاحظاتك وجمله المظلّلة. اضغطها تنفتح.' },
];
const NOTE1 = [
  { s: ['.cs-x'], t: 'رجوع', d: 'يرجعك للمقطع.' },
  { s: ['#ntAsk'], t: 'اسأل ChatGPT', d: 'يجهّز رسالة تلخيص جاهزة ويفتح ChatGPT.' },
  { s: ['#ntPaste'], t: 'الصق تلخيص ChatGPT', d: 'الصق ملخصه هنا ويتحفظ تحت هذا المقطع.' },
  { s: ['.nt-card'], t: 'أفكارك محفوظة هنا', d: 'ملخصاتك وملاحظتك والجمل اللي ظلّلتها من المقطع.' },
];
const TOURS = { home: HOME, clipset: CLIPSET, notes: NOTES, note1: NOTE1, reader: READER, add: ADD, words: WORDS, practice: PRACTICE, game: GAME, cards: CARDS, listen: LISTEN, story: STORY, friends: FRIENDS, settings: SETTINGS };

/** Which tour fits the screen that is open now. */
export function currentTour() {
  const h = location.hash;
  if (h.startsWith('#/clip-settings')) return 'clipset';
  if (h.startsWith('#/notes')) return /source=/.test(h) ? 'note1' : 'notes';
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
const mark = (k) => {
  try { localStorage.setItem(`tour.${k}`, '1'); } catch { /* ignore */ }
  import('./api.js').then(({ api }) => api.tourSeen(k)).catch(() => {}); // remembered on the account too
};
/** Explanations already seen on the account (any device): marked here so they never show again. */
export function syncTours(list = []) {
  for (const k of list) { try { localStorage.setItem(`tour.${k}`, '1'); } catch { /* ignore */ } }
}
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
  function place(scroll = false) {
    if (!root.isConnected) return;
    const st = steps[i];
    const el = st.s?.map((q) => document.querySelector(q)).find(visible);
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    if (el) {
      if (scroll === true) el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
      const r = el.getBoundingClientRect();
      const pad = 6;
      Object.assign(spot.style, { left: `${r.left - pad}px`, top: `${r.top - pad}px`, width: `${r.width + pad * 2}px`, height: `${r.height + pad * 2}px`, borderRadius: '14px' });
      // the card always stays inside the screen: under the lit element, else above it, else pinned to the bottom
      const h = card.offsetHeight || 190;
      let top = r.bottom + 14;
      if (top + h > vh - 8) top = r.top - h - 14;
      if (top < 8) top = vh - h - 12;
      card.style.top = `${Math.max(8, Math.min(vh - h - 8, top))}px`;
      card.style.bottom = 'auto';
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
    place(true);
    // the page can settle a moment after the step starts: measure again so the frame is exact
    setTimeout(place, 120);
    setTimeout(place, 450);
  }
  root.addEventListener('click', (e) => {
    const b = e.target.closest('[data-t]')?.dataset.t;
    if (b === 'skip') return close();
    if (b === 'prev') { i = Math.max(0, i - 1); return draw(); }
    if (b === 'next' || e.target === root || e.target === spot) { if (i >= steps.length - 1) return close(); i += 1; return draw(); }
    return undefined;
  });
  window.addEventListener('resize', place);
  window.addEventListener('scroll', () => place(), { passive: true, capture: true });
  draw();
}

/** First visit: the tour starts by itself once. */
export function maybeTour(kind) {
  if (!done(kind)) setTimeout(() => startTour(kind), 900);
}
