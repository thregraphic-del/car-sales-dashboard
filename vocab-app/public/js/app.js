// App shell: four everyday destinations + settings, and a tiny hash router.
import { api } from './api.js';
import { state, loadGroups } from './state.js';
import { stop as stopAudio } from './audio.js';
import { closeWordPanel } from './components.js';
import { icon, $, closeModal, esc } from './ui.js';

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
  $('#nav').innerHTML = `${links}<div class="nav-sep"></div><a class="nav-link ${active === '/settings' ? 'active' : ''}" href="#/settings">${icon.settings}<span>الإعدادات</span></a>`;
  $('#tabbar').innerHTML = NAV.map((n) => `<a class="${n.path === active ? 'active' : ''}" href="#${n.path}">${icon[n.icon]}<span>${n.label}</span>${n.badge && left ? '<i class="dot"></i>' : ''}</a>`).join('');
  $('#sidebarFoot').innerHTML = s
    ? `<div class="row between"><span>🔥 أيام متتالية</span><b class="en-inline">${s.streak.current}</b></div>
       <div class="tiny muted" style="margin-top:6px">${state.config?.ai?.configured ? '✨ الذكاء الاصطناعي مفعّل' : '📘 بدون ذكاء اصطناعي'}</div>
       <div class="tiny muted en-inline" style="margin-top:4px" title="${esc(state.config?.app?.root || '')}">LexiTube v${esc(state.config?.app?.version || '?')}</div>`
    : '';
}

export async function refreshStats() {
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
  const { base, segments, params } = parseHash();
  if (LEGACY[base]) {
    location.replace(`#${LEGACY[base]}`);
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
    if (!params.t && !params.line) window.scrollTo({ top: 0 });
  } catch (err) {
    console.error(err);
    view.innerHTML = `<div class="card empty"><div class="icon">⚠️</div><h3>تعذّر تحميل الصفحة</h3><p>${esc(err.message)}</p></div>`;
  }
  refreshStats();
}

async function init() {
  try {
    const t = localStorage.getItem('theme');
    if (t && t !== 'system') document.documentElement.setAttribute('data-theme', t);
  } catch {
    /* storage unavailable */
  }
  $('#menuBtn').addEventListener('click', () => document.body.classList.add('nav-open'));
  $('#scrim').addEventListener('click', () => document.body.classList.remove('nav-open'));
  try {
    state.config = await api.config();
    state.user = state.config.user;
    await loadGroups();
  } catch (err) {
    $('#view').innerHTML = `<div class="card empty"><div class="icon">⚠️</div><h3>الخادم غير متاح</h3><p>${esc(err.message)}</p></div>`;
    return;
  }
  window.addEventListener('hashchange', route);
  await route();
}

init();
