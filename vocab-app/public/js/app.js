// App shell: four everyday destinations + settings, and a tiny hash router.
import { api } from './api.js';
import { state, loadGroups } from './state.js';
import { stop as stopAudio, speak } from './audio.js';
import { closeWordPanel } from './components.js';
import { icon, $, closeModal, esc, openModal, toast, applyTheme } from './ui.js';
import { openFeedback } from './feedback.js';

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
  '/words': 'words',
  '/practice': 'practice',
  '/settings': 'settings',
  '/friends': 'friends',
};
// Links from the previous version keep working.
const LEGACY = {
  '/today': '/', '/analyzer': '/add', '/vocabulary': '/words', '/campaigns': '/words', '/review': '/practice?mode=cards',
  '/games': '/practice', '/listening': '/practice?mode=listen', '/progress': '/words',
};

const pages = {
  today: () => import('./pages/today.js'),
  add: () => import('./pages/add.js'),
  reader: () => import('./pages/reader.js'),
  words: () => import('./pages/words.js'),
  practice: () => import('./pages/practice.js'),
  settings: () => import('./pages/settings.js'),
  friends: () => import('./pages/friends.js'),
};

function parseHash() {
  const raw = location.hash.replace(/^#/, '') || '/';
  const [pathPart, query = ''] = raw.split('?');
  const segments = pathPart.split('/').filter(Boolean);
  return { base: `/${segments[0] || ''}`, segments, params: Object.fromEntries(new URLSearchParams(query)) };
}

function renderNav(active) {
  const s = state.stats;
  const left = s ? Math.max(0, s.plan.total - s.plan.completed) : 0;
  const links = NAV.map((n) => `<a class="nav-link ${n.path === active ? 'active' : ''}" href="#${n.path}">${icon[n.icon]}<span>${n.label}</span>${n.badge && left ? `<span class="badge">${left}</span>` : ''}</a>`).join('');
  $('#nav').innerHTML = `${links}<div class="nav-sep"></div><a class="nav-link ${active === '/friends' ? 'active' : ''}" href="#/friends">${icon.users}<span>أصدقائي</span></a><a class="nav-link ${active === '/settings' ? 'active' : ''}" href="#/settings">${icon.settings}<span>الإعدادات</span></a>`;
  $('#tabbar').innerHTML = NAV.map((n) => `<a class="${n.path === active ? 'active' : ''}" href="#${n.path}">${icon[n.icon]}<span>${n.label}</span>${n.badge && left ? '<i class="dot"></i>' : ''}</a>`).join('')
    + `<a class="${['/settings', '/friends'].includes(active) ? 'active' : ''}" href="#/settings" id="moreTab">${icon.settings}<span>المزيد</span></a>`;
  const top = $('#topStreak');
  if (top && s) top.innerHTML = `🔥 <b class="en-inline">${s.streak.current}</b>`;
  const guestChip = state.user?.guest ? '<div class="guest-chip">👤 أنت ضيف — <a href="/register"><b>سجّل حسابك المجاني</b></a> وتنحفظ كلماتك. عندك حساب؟ <a href="/login"><b>ادخل</b></a></div>' : '';
  $('#sidebarFoot').innerHTML = s
    ? `${guestChip}<div class="row between"><span>🔥 أيام متتالية</span><b class="en-inline">${s.streak.current}</b></div>
       <div class="tiny muted" style="margin-top:6px">${state.config?.ai?.configured ? '✨ الذكاء الاصطناعي مفعّل' : '📘 القاموس المحلي'}</div>
       ${creditsBell()}
       <button type="button" class="link-btn small" id="feedbackLink" style="display:block;margin-top:8px">💡 اقتراحاتكم — ساعدنا نطوّر الموقع</button>
       <div class="tiny muted en-inline" style="margin-top:4px">3Goal v${esc(state.config?.app?.version || '?')}</div>`
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
export async function refreshStats({ lazy = false } = {}) {
  if (lazy && Date.now() - statsAt < 60000 && state.stats) return;
  statsAt = Date.now();
  try {
    state.stats = await api.stats();
    renderNav(activeNav(parseHash().base));
  } catch {
    /* non-fatal */
  }
}

const activeNav = (base) => (base === '/source' ? '/add' : base);

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
    const { renderPublic } = await import('./pages/friends.js');
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
  try {
    const mod = await pages[page]();
    if (my !== token) return;
    view.innerHTML = '';
    const out = await mod.render(view, { segments, params });
    if (my !== token) {
      if (typeof out === 'function') out();
      return;
    }
    if (typeof out === 'function') cleanup = out;
    guestReminder(base);
    if (!params.t && !params.line) window.scrollTo({ top: 0 });
  } catch (err) {
    if (err.status === 401) return; // the login screen takes over
    console.error(err);
    view.innerHTML = `<div class="card empty"><div class="icon">⚠️</div><h3>ما قدرنا نحمّل الصفحة</h3><p>${esc(err.message)}</p><div style="margin-top:16px"><button type="button" class="btn primary" id="retryPage">حاول مرة ثانية</button></div></div>`;
    $('#retryPage')?.addEventListener('click', route);
  }
  refreshStats({ lazy: true });
}

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
  document.body.classList.add('auth-mode');
  const { render } = await import('./pages/login.js');
  await render($('#view'), {
    status,
    mode: /^\/register\/?$/.test(location.pathname) ? 'register' : 'login',
    onDone: () => {
      document.body.classList.remove('auth-mode');
      start();
    },
  });
}

async function start() {
  try {
    state.config = await api.config();
    state.user = state.config.user;
    await loadGroups();
  } catch (err) {
    if (err.status === 401) return showAuth();
    $('#view').innerHTML = `<div class="card empty"><div class="icon">⚠️</div><h3>الخادم غير متاح</h3><p>${esc(err.message)}</p></div>`;
    return undefined;
  }
  if (!started) {
    started = true;
    window.addEventListener('hashchange', route);
    loadCredits(); // once per visit (owner only)
    import('./tour.js').then((m) => m.mountHelp()).catch(() => {});
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
  // «المزيد»: friends + settings, one tap away on phones
  $('#tabbar').addEventListener('click', (e) => {
    if (!e.target.closest('#moreTab')) return;
    e.preventDefault();
    openModal(`<h2 style="margin:0 0 10px">المزيد</h2><div class="more-list">
      <a class="more-item" href="#/friends" data-close>${icon.users}<span>أصدقائي</span></a>
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
  window.addEventListener('lexitube:guest-limit', (e) => askToRegister(e.detail));
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
    const { renderPublic } = await import('./pages/friends.js');
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
