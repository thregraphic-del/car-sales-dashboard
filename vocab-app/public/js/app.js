// App shell: navigation + hash router. Every page renders from the shared API.
import { api } from './api.js';
import { state } from './state.js';
import { stop as stopAudio } from './audio.js';
import { icon, $, closeModal, esc } from './ui.js';

const NAV = [
  { path: '/', label: 'الرئيسية', icon: 'home', page: 'home' },
  { path: '/analyzer', label: 'محلّل يوتيوب', icon: 'youtube', page: 'analyzer' },
  { path: '/today', label: 'تعلّم اليوم', icon: 'today', page: 'today', badge: 'plan' },
  { path: '/vocabulary', label: 'مفرداتي', icon: 'book', page: 'vocabulary' },
  { path: '/review', label: 'المراجعة', icon: 'cards', page: 'review', badge: 'due' },
  { path: '/games', label: 'الألعاب', icon: 'game', page: 'games' },
  { path: '/campaigns', label: 'الحملات', icon: 'flag', page: 'campaigns' },
  { path: '/listening', label: 'استمع وتعلّم', icon: 'headphones', page: 'listening' },
  { path: '/progress', label: 'التقدّم', icon: 'chart', page: 'progress' },
  { path: '/settings', label: 'الإعدادات', icon: 'settings', page: 'settings' },
];
const TABS = ['/', '/today', '/analyzer', '/review', '/games'];

const pages = {
  home: () => import('./pages/home.js'),
  analyzer: () => import('./pages/analyzer.js'),
  today: () => import('./pages/today.js'),
  vocabulary: () => import('./pages/vocabulary.js'),
  review: () => import('./pages/review.js'),
  games: () => import('./pages/games.js'),
  campaigns: () => import('./pages/campaigns.js'),
  listening: () => import('./pages/listening.js'),
  progress: () => import('./pages/progress.js'),
  settings: () => import('./pages/settings.js'),
};

function parseHash() {
  const raw = location.hash.replace(/^#/, '') || '/';
  const [pathPart, query = ''] = raw.split('?');
  const segments = pathPart.split('/').filter(Boolean);
  const base = `/${segments[0] || ''}`;
  return { base, segments, params: Object.fromEntries(new URLSearchParams(query)) };
}

function renderNav(active) {
  const s = state.stats;
  const badgeFor = (b) => {
    if (!s) return '';
    if (b === 'due' && s.due) return `<span class="badge">${s.due}</span>`;
    if (b === 'plan' && s.plan.total - s.plan.completed > 0) return `<span class="badge">${s.plan.total - s.plan.completed}</span>`;
    return '';
  };
  $('#nav').innerHTML = NAV.map((n, i) => `
    ${i === 1 || i === 5 || i === 8 ? '<div class="nav-sep"></div>' : ''}
    <a class="nav-link ${n.path === active ? 'active' : ''}" href="#${n.path}">${icon[n.icon]}<span>${n.label}</span>${n.badge ? badgeFor(n.badge) : ''}</a>`).join('');
  $('#tabbar').innerHTML = TABS.map((p) => {
    const n = NAV.find((x) => x.path === p);
    return `<a class="${p === active ? 'active' : ''}" href="#${p}">${icon[n.icon]}<span>${n.label.split(' ')[0]}</span></a>`;
  }).join('');
  const streak = s?.streak?.current ?? 0;
  $('#sidebarFoot').innerHTML = s
    ? `<div class="row between"><span>🔥 سلسلة التعلّم</span><b class="en-inline">${streak} ${streak === 1 ? 'يوم' : 'أيام'}</b></div>
       <div class="bar" style="margin-top:8px"><span style="width:${s.plan.total ? Math.round((100 * s.plan.completed) / s.plan.total) : 0}%"></span></div>
       <div class="tiny muted" style="margin-top:6px">خطة اليوم: ${s.plan.completed} / ${s.plan.total}</div>
       <div class="tiny muted" style="margin-top:6px">${state.config?.ai?.configured ? '✨ تحليل بالذكاء الاصطناعي مفعّل' : '📘 وضع القاموس (بدون ذكاء اصطناعي)'}</div>`
    : '';
}

export async function refreshStats() {
  try {
    state.stats = await api.stats();
    renderNav(parseHash().base);
  } catch {
    /* non-fatal */
  }
}

let cleanup = null;
let renderToken = 0;

async function route() {
  const { base, segments, params } = parseHash();
  const entry = NAV.find((n) => n.path === base) || NAV[0];
  const token = ++renderToken;
  cleanup?.();
  cleanup = null;
  stopAudio();
  closeModal(true);
  document.body.classList.remove('nav-open');
  renderNav(entry.path);
  const view = $('#view');
  view.style.animation = 'none';
  void view.offsetWidth;
  view.style.animation = '';
  try {
    const mod = await pages[entry.page]();
    if (token !== renderToken) return;
    view.innerHTML = '';
    const out = await mod.render(view, { segments, params });
    if (token !== renderToken) {
      if (typeof out === 'function') out();
      return;
    }
    if (typeof out === 'function') cleanup = out;
    window.scrollTo({ top: 0 });
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
  } catch (err) {
    $('#view').innerHTML = `<div class="card empty"><div class="icon">⚠️</div><h3>الخادم غير متاح</h3><p>${esc(err.message)}</p></div>`;
    return;
  }
  window.addEventListener('hashchange', route);
  await route();
}

init();
