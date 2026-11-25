// App shell: four everyday destinations + settings, and a tiny hash router.
import { api, warm } from './api.js';
import { state, loadGroups, applyGrammarMode } from './state.js';
import { stop as stopAudio, speak } from './audio.js';
import { closeWordPanel, openWordPanel } from './components.js';
import { icon, $, closeModal, esc, openModal, toast, applyTheme } from './ui.js';
import { startIcons } from './emoji-icons.js';
import { BUILD_ID } from './build-id.js';
import { watchForUpdates } from './update-check.js';
import { setPending, checkDouble, remindOnce } from './streak-rescue.js';
import { openFeedback } from './feedback.js';
import { goalText, noteActive, endSession } from './goal.js';
import { startReminder } from './reminder.js';
import { startTooltips } from './tooltips.js';
import { startInfo } from './info.js';
import { socialRow } from './social.js';

const NAV = [
  { path: '/', label: 'اليوم', icon: 'today', page: 'today', badge: true },
  { path: '/add', label: 'أضف', icon: 'plus', page: 'add' },
  { path: '/words', label: 'كلماتي', icon: 'book', page: 'words' },
  { path: '/practice', label: 'تدرّب', icon: 'game', page: 'practice' },
];
const ROUTES = {
  '/': 'today',
  '/add': 'add',
  '/source': 'reader',
  '/clip-settings': 'clipsettings',
  '/words': 'words',
  '/practice': 'practice',
  '/settings': 'settings',
  '/notes': 'notes',
};
// Links from the previous version keep working.
const LEGACY = {
  '/today': '/', '/analyzer': '/add', '/vocabulary': '/words', '/campaigns': '/words', '/review': '/practice?mode=cards',
  '/games': '/practice', '/listening': '/practice?mode=listen', '/progress': '/words',
};

const pages = {
  today: () => import(`./pages/today.js?v=${BUILD_ID}`),
  add: () => import(`./pages/add.js?v=${BUILD_ID}`),
  reader: () => import(`./pages/reader.js?v=${BUILD_ID}`),
  clipsettings: () => import(`./pages/clip-settings.js?v=${BUILD_ID}`),
  words: () => import(`./pages/words.js?v=${BUILD_ID}`),
  practice: () => import(`./pages/practice.js?v=${BUILD_ID}`),
  settings: () => import(`./pages/settings.js?v=${BUILD_ID}`),
  notes: () => import(`./pages/notes.js?v=${BUILD_ID}`),
};

function parseHash() {
  const raw = location.hash.replace(/^#/, '') || '/';
  const [pathPart, query = ''] = raw.split('?');
  const segments = pathPart.split('/').filter(Boolean);
  return { base: `/${segments[0] || ''}`, segments, params: Object.fromEntries(new URLSearchParams(query)) };
}

// a small sad face on the «اليوم» icon (and on the flame chip) while yesterday can still be given back — a quiet reminder every time the learner comes in
const SAD_BADGE = '<span class="sad-badge" title="شعلتك طفت — ضاعف هدف اليوم وأمس يتصحح" aria-label="شعلتك طفت"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9.5"/><circle cx="8.8" cy="10" r=".9" fill="currentColor" stroke="none"/><circle cx="15.2" cy="10" r=".9" fill="currentColor" stroke="none"/><path d="M8 16.4c1.2-2.2 6.8-2.2 8 0"/></svg></span>';
function renderNav(active) {
  const s = state.stats;
  const left = s ? Math.max(0, s.plan.total - s.plan.completed) : 0;
  const links = NAV.map((n) => `<a class="nav-link ${n.path === active ? 'active' : ''}${['/add', '/words', '/practice'].includes(n.path) ? ' tab-dup' : ''}" href="#${n.path}">${icon[n.icon]}<span>${n.label}</span>${n.badge && left ? `<span class="badge">${left}</span>` : ''}${n.path === '/' && s?.streak?.rescue ? SAD_BADGE : ''}</a>`).join('');
  $('#nav').innerHTML = `${links}<div class="nav-sep"></div><a class="nav-link ${active === '/notes' ? 'active' : ''}" href="#/notes">${icon.bookOpen}<span>أفكار</span></a><a class="nav-link ${active === '/settings' ? 'active' : ''}" href="#/settings">${icon.settings}<span>الإعدادات</span></a>`;
  // bottom bar on phones: only the three working pages (اليوم · الإعدادات · أصدقائي live in the ☰ menu)
  // «أضف» sits in the middle of the bar, in its own colour (inside the bar, not floating above it)
  const tabs = ['/words', '/add', '/practice'].map((pa) => NAV.find((n) => n.path === pa));
  $('#tabbar').innerHTML = tabs.map((n) => `<a class="${n.path === active ? 'active' : ''}" href="#${n.path}" ${n.path === active ? 'aria-current="page"' : ''}>${icon[n.icon]}<span>${n.label}</span></a>`).join('');
  const top = $('#topStreak');
  if (top && s) top.innerHTML = `🔥 <b class="en-inline">${s.streak.current}</b>${s.streak.rescue ? SAD_BADGE : ''}`;
  const guestChip = state.user?.guest ? '<div class="guest-chip">👤 أنت ضيف — <a href="/register"><b>سجّل حسابك المجاني</b></a> وتنحفظ كلماتك. عندك حساب؟ <a href="/login"><b>ادخل</b></a></div>' : '';
  $('#sidebarFoot').innerHTML = s
    ? `${guestChip}${socialRow(state.config?.contact)}
       ${creditsBell()}`
    : '';
}

/* 🔔 Netlify credits (owner only): an estimate from the deploys, read once when the site opens. */
const creditLevel = (c) => (c.pct >= 90 ? 'bad' : c.pct >= 70 ? 'warn' : 'ok');
function creditsBell() {
  const c = state.credits;
  if (!c) return '';
  return `<button type="button" class="credit-bell ${creditLevel(c)}" id="creditBell" title="رصيد Netlify (تقديري)">🔔 رصيد Netlify <b class="en-inline">${c.left}</b> <span class="tiny">باقي · ${c.pct}%</span></button>`;
}
async function loadCredits() {
  if (state.config?.auth?.required && state.user?.role !== 'admin') return; // the site owner only
  try {
    state.credits = await api.credits();
  } catch { return; }
  renderNav(activeNav(parseHash().base));
  // a reminder at most once a day when 70% is used
  const c = state.credits;
  const key = `credits.warned.${new Date().toISOString().slice(0, 10)}`;
  if (c.pct >= 70 && !localStorage.getItem(key)) {
    try { localStorage.setItem(key, '1'); } catch { /* ignore */ }
    toast(c.pct >= 90 ? `⚠️ رصيد Netlify قارب يخلص: باقي ${c.left} (تقريبًا ${Math.floor(c.left / c.deploy_cost)} رفعات)` : `🔔 استخدمت ${c.pct}% من رصيد Netlify — باقي ${c.left}`);
  }
}
function openCredits() {
  const c = state.credits;
  if (!c) return;
  const box = openModal(`<div class="credits">
    <div class="rset-title">🔔 رصيد Netlify</div>
    <div class="credit-meter ${creditLevel(c)}"><span style="width:${c.pct}%"></span></div>
    <p><b class="en-inline" style="font-size:22px">${c.left}</b> باقي من <b class="en-inline">${c.plan}</b> · استخدمت <b class="en-inline">${c.pct}%</b></p>
    <p class="small ink-2">منذ ${esc(c.since.slice(0, 10))}: ${c.deploys} رفعة × ${c.deploy_cost} = ${c.deploys * c.deploy_cost} رصيد. باقي يكفي تقريبًا <b>${Math.floor(c.left / c.deploy_cost)}</b> رفعة.</p>
    <p class="tiny muted">رقم تقديري من الرفعات (أكبر استهلاك). للرقم الدقيق: <a href="https://app.netlify.com/teams/thregraphic/usage" target="_blank" rel="noopener">صفحة الاستهلاك في Netlify ↗</a> — واكتب الباقي هنا مرة، ونحسب منه.</p>
    <div class="srow"><span class="slabel">رصيد الخطة</span><div class="sopts"><input class="input sopt-num" id="crPlan" type="number" min="1" value="${c.plan}"> <span class="tiny">بالشهر</span></div></div>
    <div class="srow"><span class="slabel">الباقي الحين</span><div class="sopts"><input class="input sopt-num" id="crLeft" type="number" min="0" placeholder="من Netlify"> <span class="tiny">اختياري</span></div></div>
    <div class="srow"><span class="slabel">يتجدد يوم</span><div class="sopts"><input class="input sopt-num" id="crDay" type="number" min="1" max="28" value="${c.cycle_day}"> <span class="tiny">من الشهر</span></div></div>
    <div class="btn-row" style="margin-top:10px"><button class="btn primary" id="crSave">حفظ</button><button class="btn ghost" data-close>إغلاق</button></div></div>`);
  box.querySelector('#crSave').addEventListener('click', async () => {
    try {
      state.credits = await api.saveCredits({ plan: box.querySelector('#crPlan').value, left: box.querySelector('#crLeft').value, cycle_day: box.querySelector('#crDay').value });
      closeModal();
      renderNav(activeNav(parseHash().base));
      toast('تم الحفظ ✓');
    } catch (err) { toast(err.message); }
  });
}

// The counters in the menu: read after practice, and at most once a minute while moving between pages
// (fewer server calls = faster pages and fewer Netlify credits).
let statsAt = 0;
/** The home page already got the counters inside /api/today — don't ask again right after. */
export const noteStatsFresh = () => { statsAt = Date.now(); };
export async function refreshStats({ lazy = false } = {}) {
  if (lazy && Date.now() - statsAt < 180000 && state.stats) return; // asked again at most every 3 minutes (each ask is a server round trip)
  statsAt = Date.now();
  try {
    state.stats = await api.stats();
    setPending(state.stats.streak);
    checkDouble();
    remindOnce(state.stats.streak);
    renderNav(activeNav(parseHash().base));
  } catch {
    /* non-fatal */
  }
}

const activeNav = (base) => (base === '/source' || base === '/clip-settings' ? '/add' : base);

let cleanup = null;
let token = 0;

async function route() {
  window.__navCount = (window.__navCount || 0) + 1; // pages opened inside the app (for «رجوع»)
  const { base, segments, params } = parseHash();
  if (LEGACY[base]) {
    location.replace(`#${LEGACY[base]}`);
    return;
  }
  if (base === '/p' && segments[1]) {
    const { renderPublic } = await import(`./pages/friends.js?v=${BUILD_ID}`);
    return renderPublic($('#view'), segments[1].replace(/[^a-f0-9]/g, ''));
  }
  if (base !== '/' && !ROUTES[base]) {
    renderNav('');
    $('#view').className = 'view';
    $('#view').innerHTML = '<div class="card empty"><div class="icon">🧭</div><h3>الصفحة غير موجودة</h3><p>الرابط غلط أو الصفحة انحذفت.</p><div style="margin-top:16px"><a class="btn primary" href="#/">الرجوع للرئيسية</a></div></div>';
    return;
  }
  const page = ROUTES[base] || 'today';
  const my = ++token;
  cleanup?.();
  cleanup = null;
  stopAudio();
  closeModal(true);
  closeWordPanel();
  document.body.classList.remove('nav-open');
  renderNav(activeNav(base));
  const view = $('#view');
  view.style.animation = 'none';
  void view.offsetWidth;
  view.style.animation = '';
  view.className = `view page-${page}`;
  // ⚡ if the page takes more than a blink, show its outline at once (the tap feels answered) instead of the old page hanging
  let phase = 0; // 0: the page's code is loading (the old page still shows) · 1: the page is drawing itself
  const skel = setTimeout(() => { if (my === token && (phase === 0 || !view.firstElementChild)) view.innerHTML = '<div class="skel" aria-hidden="true"><i class="w1"></i><i></i><i></i><i></i><i class="h"></i></div>'; }, 120);
  try {
    const mod = await pages[page]();
    if (my !== token) return;
    phase = 1;
    view.innerHTML = '';
    const out = await mod.render(view, { segments, params });
    clearTimeout(skel);
    if (my !== token) {
      if (typeof out === 'function') out();
      return;
    }
    if (typeof out === 'function') cleanup = out;
    guestReminder(base);
    if (!params.t && !params.line) window.scrollTo({ top: 0 });
  } catch (err) {
    clearTimeout(skel);
    if (err.status === 401) return; // the login screen takes over
    console.error(err);
    // a tab left open across an update still holds the OLD scripts in memory while the new page asks for newer ones:
    // reload once by itself (never in a loop) so the person never sees this
    const stale = /is not a function|is not a constructor|does not provide an export|importing a module script failed|error loading dynamically imported module|failed to fetch dynamically imported/i.test(String(err?.message || ''));
    if (stale) {
      let last = 0;
      try { last = Number(sessionStorage.getItem('lx.autoReload') || 0); } catch { /* ignore */ }
      if (Date.now() - last > 60000) {
        try { sessionStorage.setItem('lx.autoReload', String(Date.now())); } catch { /* ignore */ }
        location.reload();
        return;
      }
    }
    view.innerHTML = `<div class="card empty"><div class="icon">⚠️</div><h3>ما قدرنا نحمّل الصفحة</h3><p>${esc(err.message)}</p><div style="margin-top:16px"><button type="button" class="btn primary" id="retryPage">حاول مرة ثانية</button></div></div>`;
    $('#retryPage')?.addEventListener('click', () => (stale ? location.reload() : route()));
  }
  refreshStats({ lazy: true });
}

watchForUpdates();
// ⚡ a tap is coming: start the page's code and its lists the moment a finger / pointer reaches a link (no wasted request otherwise)
const WARM = { '/words': ['words', ['/api/words', '/api/groups']], '/practice': ['practice', ['/api/words', '/api/groups']], '/add': ['add', []], '/settings': ['settings', []] };
const warmLink = (e) => {
  const a = e.target.closest?.('a[href^="#/"]');
  if (!a) return;
  const base = a.getAttribute('href').slice(1).split('?')[0];
  const w = WARM[base];
  if (!w) return;
  pages[w[0]]().catch(() => {});
  w[1].forEach((u) => warm(u));
};
document.addEventListener('pointerdown', warmLink, { passive: true });
document.addEventListener('pointerover', (e) => { if (e.pointerType === 'mouse') warmLink(e); }, { passive: true });
// the pages' code (small static files) is fetched quietly a few seconds after the first page: the first tap on any tab has nothing to download
setTimeout(() => { ['words', 'practice', 'add', 'settings'].forEach((k) => pages[k]().catch(() => {})); }, 3000);
// a link with ?ref=CODE (from a team member) is remembered until the visitor registers
try { const r = new URLSearchParams(location.search).get('ref'); if (r) localStorage.setItem('lt.ref', r.trim().toUpperCase().slice(0, 20)); } catch { /* ignore */ }
startReminder();
startTooltips();
startInfo();

// ⏱ time on the site: every tap, key, scroll counts as activity (at most once a second); a hidden page ends the session
(() => {
  let last = 0;
  const act = () => { const n = Date.now(); if (n - last < 1000) return; last = n; noteActive(); };
  for (const ev of ['pointerdown', 'keydown', 'touchstart', 'wheel', 'scroll']) window.addEventListener(ev, act, { capture: true, passive: true });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') endSession(); });
})();
window.addEventListener('lexitube:goal-progress', () => checkDouble()); // doubling the goal anywhere gives yesterday back
startIcons(); // every emoji on buttons and titles becomes a line icon in the site's style
let started = false;

/** 👤 Kind invitation for guests: register (same data, nothing lost) or later. */
function askToRegister(text) {
  const box = openModal(`<div class="guest-card">
    <div class="guest-ic">✨</div>
    <h2>احفظ تقدّمك في حسابك</h2>
    <p>${esc(text || 'أنت تستخدم الموقع كضيف. سجّل حسابك المجاني عشان تنحفظ كلماتك ومقاطعك وتقدّمك، وتوصل لها من أي جهاز.')}</p>
    <ul class="guest-list"><li>✓ مجاني ويأخذ دقيقة</li><li>✓ كل اللي سويته الحين ينتقل لحسابك</li><li>✓ تدخل بالإيميل أو الجوال أو اسم المستخدم</li></ul>
    <div class="btn-row" style="justify-content:center"><a class="btn primary" href="/register">سجّل حسابي</a><button type="button" class="btn ghost" data-close>بعدين</button></div></div>`);
  return box;
}

/** A gentle reminder for guests, at most once per visit, after they have used the site a bit. */
function guestReminder(base) {
  if (!state.user?.guest || !['/words', '/practice', '/source'].includes(base)) return;
  try {
    if (sessionStorage.getItem('guest.reminded')) return;
    sessionStorage.setItem('guest.reminded', '1');
  } catch { return; }
  setTimeout(() => {
    if (!state.user?.guest || document.querySelector('.modal')) return;
    const n = document.createElement('div');
    n.className = 'guest-toast';
    n.innerHTML = '<span>💾 كلماتك محفوظة على هالجهاز بس. <a href="/register">سجّل حسابك المجاني</a> عشان تنحفظ في حسابك.</span><button type="button" aria-label="إغلاق">✕</button>';
    document.body.appendChild(n);
    n.querySelector('button').addEventListener('click', () => n.remove());
    setTimeout(() => n.remove(), 12000);
  }, 20000);
}

/** Login / registration, shown instead of the app when needed (also at /login and /register). */
async function showAuth(status) {
  try { localStorage.removeItem('lt.seen'); } catch { /* ignore */ }
  document.body.classList.add('auth-mode');
  const { render } = await import(`./pages/login.js?v=${BUILD_ID}`);
  await render($('#view'), {
    status,
    mode: /^\/register\/?$/.test(location.pathname) ? 'register' : 'login',
    onDone: () => {
      document.body.classList.remove('auth-mode');
      start();
    },
  });
}

// 🏁 opening the site lands on «اليوم» (today's progress); «أضف» is one tap away in the bar
applyGrammarMode();

// ⚡ a returning visitor (the browser remembers they were signed in): ask for the settings, the groups and the home page
// at the SAME moment as the sign-in check, instead of one trip after another. If it turns out they are not signed in, the
// answers are simply dropped and the normal path runs.
let pre = null;
try {
  const home = location.hash === '' || location.hash === '#/' || location.hash === '#';
  if (localStorage.getItem('lt.seen') === '1' && !/^\/(login|register)\/?$/.test(location.pathname) && !location.hash.startsWith('#/p/')) {
    const q = (p) => p.catch(() => null);
    pre = { config: q(api.config()), groups: q(api.groups()), today: home ? q(api.today()) : null };
  }
} catch { pre = null; }
/** The home page's data, if it was asked for early (used once). */
export const takePreloadedToday = () => { const t = pre?.today || null; if (pre) pre.today = null; return t; };

async function start() {
  try {
    // the settings and the groups don't depend on each other: ask together (one trip instead of two in a row)
    const early = pre; pre = pre && { ...pre, config: null, groups: null }; // keep only the early home data for later
    const [config] = await Promise.all([
      (early?.config && early.config.then((c) => c || api.config())) || api.config(),
      (early?.groups && early.groups.then((g) => (g ? (state.groups = g) : loadGroups()))) || loadGroups(),
    ]);
    try { localStorage.setItem('lt.seen', '1'); } catch { /* ignore */ }
    state.config = config;
    state.user = state.config.user;
    import('./tour.js').then((m) => m.syncTours(state.config.tours || [])).catch(() => {});
  } catch (err) {
    if (err.status === 401) return showAuth();
    $('#view').innerHTML = `<div class="card empty"><div class="icon">⚠️</div><h3>الخادم غير متاح</h3><p>${esc(err.message)}</p></div>`;
    return undefined;
  }
  if (!started) {
    started = true;
    // ‹ the side menu folds into icons (wide screens), remembered
    const navMini = (on) => { document.body.classList.toggle('nav-mini', on); const b = document.getElementById('navMini'); if (b) { b.textContent = on ? '‹' : '›'; b.title = on ? 'افتح القائمة' : 'تصغير القائمة'; } };
    try { navMini(localStorage.getItem('app.navMini') === '1'); } catch { /* ignore */ }
    document.getElementById('navMini')?.addEventListener('click', () => { const on = !document.body.classList.contains('nav-mini'); navMini(on); try { localStorage.setItem('app.navMini', on ? '1' : '0'); } catch { /* ignore */ } });
    // ⏰ daily reminder (🔔 on «اليوم»): fires once a day at the chosen time while the site is open
    setInterval(() => {
      try {
        const t = localStorage.getItem('reminder.time'); if (!t) return;
        const now = new Date(); const day = now.toDateString();
        const [h, m] = t.split(':').map(Number);
        if (now.getHours() * 60 + now.getMinutes() < h * 60 + m || localStorage.getItem('reminder.fired') === day) return;
        localStorage.setItem('reminder.fired', day);
        const msg = 'وقت مراجعة كلماتك 🔥';
        if ('Notification' in window && Notification.permission === 'granted') new Notification('3Goal', { body: msg });
        else toast(`⏰ ${msg}`);
      } catch { /* ignore */ }
    }, 30000);
    window.addEventListener('hashchange', route);
    loadCredits(); // once per visit (owner only)
    if (state.config?.ai?.configured) import('./say-ar.js').then((m) => m.watchSayAr()).catch(() => {});
  }
  return route();
}

let lastSay = { text: '', at: 0, slow: false };

async function init() {
  try {
    const t = localStorage.getItem('theme') || 'light';
    applyTheme(t);
    window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', () => { if ((localStorage.getItem('theme') || 'light') === 'auto') applyTheme('auto'); });
  } catch {
    /* storage unavailable */
  }
  // 👆 Any English word anywhere (examples, games, summaries, notes…): tap it for its meaning,
  // forms and an example, and save it. The video text has its own word marks, so it is left out;
  // so are buttons, links, fields and the word a game question is asking about.
  const wordAt = (x, y) => {
    let node; let off;
    if (document.caretPositionFromPoint) { const p = document.caretPositionFromPoint(x, y); node = p?.offsetNode; off = p?.offset; }
    else if (document.caretRangeFromPoint) { const r = document.caretRangeFromPoint(x, y); node = r?.startContainer; off = r?.startOffset; }
    if (!node || node.nodeType !== 3) return null;
    const t = node.textContent;
    let a = off; let b = off;
    while (a > 0 && /[A-Za-z'’-]/.test(t[a - 1])) a -= 1;
    while (b < t.length && /[A-Za-z'’-]/.test(t[b])) b += 1;
    const w = t.slice(a, b).replace(/^['’-]+|['’-]+$/g, '');
    return /^[A-Za-z][A-Za-z'’-]{1,30}$/.test(w) ? { word: w, sentence: t.trim().slice(0, 300) } : null;
  };
  // 🔊 the big English word of a game question: each tap says it again
  document.addEventListener('click', (e) => {
    const big = e.target.closest?.('.q-big.en, .question .q-big');
    if (!big || !/[A-Za-z]/.test(big.textContent) || /_/.test(big.textContent)) return;
    speak(big.textContent.trim()).catch(() => {});
  });
  document.addEventListener('click', (e) => {
    if (e.defaultPrevented || window.getSelection()?.toString().trim()) return;
    const el = e.target;
    if (!el.closest?.('.en, .en-inline, [dir="ltr"], .q-sentence, .fb-ex, .hint-box, .sum-quote, .nt-clip, .nt-ref')) return;
    if (el.closest('#lines, .word-pop, a, button, label, input, textarea, select, [contenteditable], [data-say], .mark, .option, .key, .q-big, .question mark, .question .hl, .question .hit, .tg-switch, .fc-wrap')) return;
    const hit = wordAt(e.clientX, e.clientY);
    if (!hit) return;
    openWordPanel(el, { word: hit.word, context: '1' });
  });
  // 🔊 Every listen button on every page works, as many times as you like (pages that
  // handle their own buttons stop the click before it gets here).
  document.addEventListener('click', (e) => {
    const b = e.target.closest?.('[data-say]');
    if (!b || b.disabled) return;
    e.preventDefault();
    // the same 🔊 tapped again within 4 s = slowly
    const again = lastSay.text === b.dataset.say && Date.now() - lastSay.at < 4000 && !lastSay.slow;
    lastSay = { text: b.dataset.say, at: Date.now(), slow: again };
    speak(b.dataset.say, { rate: again ? 0.6 : Number(b.dataset.rate) || 1, lang: b.dataset.lang || 'en' }).catch(() => {});
  });
  // «المزيد»: notes + settings, one tap away on phones
  $('#tabbar').addEventListener('click', (e) => {
    if (!e.target.closest('#moreTab')) return;
    e.preventDefault();
    openModal(`<h2 style="margin:0 0 10px">المزيد</h2><div class="more-list">
      <a class="more-item" href="#/notes" data-close>${icon.bookOpen}<span>أفكار</span></a>
      <a class="more-item" href="#/settings" data-close>${icon.settings}<span>الإعدادات</span></a>
      ${state.user?.guest ? '<a class="more-item" href="/register">✨<span>سجّل حسابك المجاني</span></a>' : ''}</div>`);
  });
  $('#menuBtn').addEventListener('click', () => document.body.classList.add('nav-open'));
  $('#scrim').addEventListener('click', () => document.body.classList.remove('nav-open'));
  $('#sidebarFoot').addEventListener('click', (e) => {
    if (e.target.closest('#creditBell')) { document.body.classList.remove('nav-open'); openCredits(); return; }
    if (!e.target.closest('#feedbackLink')) return;
    document.body.classList.remove('nav-open');
    openFeedback();
  });
  // 👤 a guest went past the free trial → one kind card: create the free account (everything moves with them)
  // 👤 guest limit reached: the invitation shows at most once every 10 minutes, and again when a video ends
  // (not on every blocked save — that was every few seconds)
  let guestText = '';
  const guestAsk = (force = false) => {
    if (!guestText || document.querySelector('.guest-card')) return;
    let last = 0; try { last = Number(localStorage.getItem('guest.askedAt')) || 0; } catch { /* ignore */ }
    if (!force && Date.now() - last < 10 * 60 * 1000) return;
    if (force && Date.now() - last < 60 * 1000) return;
    try { localStorage.setItem('guest.askedAt', String(Date.now())); } catch { /* ignore */ }
    askToRegister(guestText);
  };
  window.addEventListener('lexitube:guest-limit', (e) => { guestText = e.detail || guestText || ' '; guestAsk(); });
  window.addEventListener('lexitube:ended', () => guestAsk(true));
  // 🎯 the chosen daily goal reached outside a video (the video page celebrates by itself)
  window.addEventListener('lexitube:goal-reached', (e) => { if (!location.hash.startsWith('#/source/') && localStorage.getItem('goal.off') !== '1') toast(`🎉 وصلت هدف اليوم — ${goalText(e.detail)}`); });
  window.addEventListener('offline', () => toast('انقطع الإنترنت — بنكمل أول ما يرجع'));
  window.addEventListener('online', () => toast('رجع الإنترنت ✓'));
  window.addEventListener('lexitube:auth', () => {
    if (!document.body.classList.contains('auth-mode')) showAuth();
  });
  if (/^\/logout\/?$/.test(location.pathname)) {
    await api.logout().catch(() => {});
    location.replace('/login');
    return;
  }
  // a shared progress link opens without login
  const pub = location.hash.match(/^#\/p\/([a-f0-9]+)/);
  if (pub) {
    const { renderPublic } = await import(`./pages/friends.js?v=${BUILD_ID}`);
    document.body.classList.add('auth-mode');
    await renderPublic($('#view'), pub[1]);
    return;
  }
  let auth;
  try {
    auth = await api.authStatus();
  } catch (err) {
    $('#view').innerHTML = `<div class="card empty"><div class="icon">⚠️</div><h3>الخادم غير متاح</h3><p>${esc(err.message)}</p></div>`;
    return;
  }
  // 👤 no account yet: try the site as a guest (the login page stays at /login and /register)
  if (!auth.logged_in && auth.guest_allowed && !/^\/(login|register)\/?$/.test(location.pathname)) {
    try {
      await api.guest();
      auth.logged_in = true;
    } catch { /* too many guests from this address, or sign-ups closed: the login page */ }
  }
  if (!auth.logged_in) await showAuth(auth);
  else if (/^\/(login|register)\/?$/.test(location.pathname) && auth.guest) await showAuth(auth);
  else {
    if (/^\/(login|register)\/?$/.test(location.pathname)) history.replaceState(null, '', `/${location.hash}`);
    await start();
  }
}

init();
