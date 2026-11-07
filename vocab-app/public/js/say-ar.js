// 🔤 Next to every 🔊 of a word (any page): its pronunciation in Arabic letters, small and grey.
// Words already known come from this device; the rest are asked in one batch (saved on the server
// for everyone, made by AI only once per word).
import { api } from './api.js';

const KEY = 'sayar.v1';
let cache = {};
try { cache = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { cache = {}; }
const norm = (t) => String(t || '').toLowerCase().replace(/[^a-z' -]/g, '').replace(/\s+/g, ' ').trim();
const isWord = (t) => t && t.split(' ').length <= 3 && t.length <= 40;
const asked = new Set();
let timer = 0;

function fill(root = document) {
  const btns = root.querySelectorAll('button[data-say]:not([data-sayar])');
  const need = new Set();
  for (const b of btns) {
    b.dataset.sayar = '1';
    const t = norm(b.dataset.say);
    if (!isWord(t) || b.dataset.lang === 'ar') continue;
    if (b.nextElementSibling?.classList.contains('say-ar')) continue;
    const s = document.createElement('span');
    s.className = 'say-ar';
    s.dataset.t = t;
    if (cache[t]) s.textContent = cache[t]; else need.add(t);
    b.after(s);
  }
  const ask = [...need].filter((t) => !asked.has(t)).slice(0, 60);
  if (!ask.length) return;
  ask.forEach((t) => asked.add(t));
  api.sayArabic(ask).then((r) => {
    Object.assign(cache, r.say || {});
    try { localStorage.setItem(KEY, JSON.stringify(cache)); } catch { /* storage full */ }
    document.querySelectorAll('.say-ar:empty').forEach((el) => { if (cache[el.dataset.t]) el.textContent = cache[el.dataset.t]; });
  }).catch(() => {});
}

export function watchSayAr() {
  const run = () => { timer = 0; fill(); };
  new MutationObserver(() => { if (!timer) timer = setTimeout(run, 400); }).observe(document.body, { childList: true, subtree: true });
  run();
}
