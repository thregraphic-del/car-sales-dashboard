// 🧩 One filter bar for «تدرّب» and «كلماتي» — same component, same look.
// Each filter is a small button (title + current choice); one tap opens a narrow list right
// under it, one tap picks. «المستوى» allows several choices (the list stays open).
// «المقطع» shows each video's picture with its title.
//
//   defs: [{ k, t, value, opts: [[value, label, count?, thumbUrl?]], multi?, video?, all? }]
//   value: a string, or an array when multi ('' / [] = everything)
import { esc } from './ui.js';

// one small icon per filter (same keys on «كلماتي» and «تدرّب»)
const ICONS = { count: '🔢', levels: '🎚', filter: '🏷', perf: '🏷', source: '🎬', from: '🎬', when: '🕒', sort: '↕' };

const isOn = (d, v) => (d.multi ? (v === '' ? !d.value.length : d.value.includes(v)) : String(d.value) === v);

function current(d) {
  if (d.multi) {
    if (!d.value.length) return 'الكل';
    return d.value.length > 2 ? `${d.value.slice(0, 2).join(' ')} +${d.value.length - 2}` : d.value.join(' · ');
  }
  const o = d.opts.find(([v]) => String(v) === String(d.value)) || d.opts[0];
  // «كل المقاطع» / «أي وقت» … read as a short «الكل» on the button (the list keeps the full words)
  return o ? (/^(كل |أي )/.test(o[1]) ? 'الكل' : o[1]) : '';
}

const optHtml = (d, [v, label, count, thumb]) => {
  const on = isOn(d, String(v));
  const pic = d.video && thumb !== undefined ? (thumb ? `<img src="${esc(thumb)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">` : '<span class="fb-noimg">🎬</span>') : '';
  const tick = d.multi && v !== '' ? `<span class="fb-tick" aria-hidden="true">${on ? '✓' : ''}</span>` : '';
  return `<button type="button" class="dd-opt fb-opt${on ? ' on' : ''}${d.video ? ' fb-vid' : ''}" data-fbv="${d.k}|${esc(String(v))}" role="option" aria-selected="${on}">
    ${tick}${pic}<span class="fb-l${d.video ? ' en clamp2' : ''}">${esc(label)}</span>${count != null ? `<span class="fb-c en-inline">${count}</span>` : ''}</button>`;
};

export function filterBarHtml(defs, open = '') {
  return `<div class="fbar" role="toolbar" aria-label="الفلاتر">${defs.map((d) => {
    const active = d.multi ? d.value.length > 0 : String(d.value) !== String(d.opts[0]?.[0] ?? '');
    return `<div class="dd fb${open === d.k ? ' open' : ''}">
      <button type="button" class="dd-btn fb-btn${active ? ' set' : ''}" data-fb="${d.k}" aria-expanded="${open === d.k}" title="${esc(d.t)}"><span class="fb-ic" aria-hidden="true">${ICONS[d.k] || '⚙'}</span><span class="fb-txt"><span class="dd-t">${esc(d.t)}</span><span class="dd-v">${esc(current(d))} ▾</span></span></button>
      ${open === d.k ? `<div class="dd-menu fb-menu${d.video ? ' fb-menu-vid' : ''}" role="listbox"${d.multi ? ' aria-multiselectable="true"' : ''}>${d.opts.map((o) => optHtml(d, o)).join('') || '<span class="tiny muted" style="padding:10px">لا يوجد</span>'}</div>` : ''}
    </div>`;
  }).join('')}</div>`;
}

/**
 * Read a click on the bar. Returns { open } to toggle a menu, { k, value, close } after a pick,
 * or null if the click wasn't on the bar.
 */
export function filterBarClick(e, defs, open) {
  const btn = e.target.closest('[data-fb]');
  if (btn) return { open: open === btn.dataset.fb ? '' : btn.dataset.fb };
  const opt = e.target.closest('[data-fbv]');
  if (!opt) return null;
  const i = opt.dataset.fbv.indexOf('|');
  const k = opt.dataset.fbv.slice(0, i);
  const v = opt.dataset.fbv.slice(i + 1);
  const d = defs.find((x) => x.k === k);
  if (!d) return null;
  if (!d.multi) return { k, value: v, close: true };
  if (v === '') return { k, value: [], close: false };
  return { k, value: d.value.includes(v) ? d.value.filter((x) => x !== v) : [...d.value, v], close: false };
}

/** Keep an open menu inside the screen (the bar wraps, so a menu may sit near an edge). */
export function placeMenus(root) {
  const m = root.querySelector('.fb-menu');
  if (!m) return;
  m.style.transform = '';
  const r = m.getBoundingClientRect();
  const vw = document.documentElement.clientWidth;
  let dx = 0;
  if (r.left < 8) dx = 8 - r.left;
  else if (r.right > vw - 8) dx = vw - 8 - r.right;
  if (dx) m.style.transform = `translateX(${dx}px)`;
}

/** Close an open menu when tapping elsewhere on the page. */
export function closeOnOutside(root, isOpen, close) {
  const h = (e) => { if (isOpen() && root.isConnected && !e.target.closest('.fbar')) close(); };
  document.addEventListener('click', h, true);
  return () => document.removeEventListener('click', h, true);
}

export const ytThumb = (s) => (s?.youtube_id && !s.is_demo ? `https://i.ytimg.com/vi/${s.youtube_id}/default.jpg` : s?.thumbnail_url || '');
export const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
export const WHEN_OPTS = [['', 'كل الأوقات'], ['today', 'اليوم'], ['yesterday', 'أمس'], ['week', 'آخر أسبوع'], ['month', 'آخر شهر']];
