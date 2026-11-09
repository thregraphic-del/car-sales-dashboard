// Shared UI helpers: escaping, icons, chips, modal, toast, formatting.

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const svg = (d, extra = '') =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" ${extra}>${d}</svg>`;

export const icon = {
  home: svg('<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>'),
  youtube: svg('<rect x="2.5" y="5" width="19" height="14" rx="4"/><path d="m10 9 5 3-5 3z" fill="currentColor"/>'),
  today: svg('<rect x="3" y="4.5" width="18" height="16.5" rx="3"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4"/><path d="m9 15 2 2 4-4"/>'),
  book: svg('<path d="M4 4.5A1.5 1.5 0 0 1 5.5 3H20v15H5.5A1.5 1.5 0 0 0 4 19.5z"/><path d="M4 19.5A1.5 1.5 0 0 0 5.5 21H20"/><path d="M8 7h8M8 11h6"/>'),
  cards: svg('<rect x="6" y="3" width="14" height="17" rx="2.5"/><path d="M4 7v12.5A1.5 1.5 0 0 0 5.5 21H15"/>'),
  game: svg('<rect x="2.5" y="7" width="19" height="11" rx="5"/><path d="M7 12.5h3M8.5 11v3"/><circle cx="15.5" cy="11.5" r=".9" fill="currentColor"/><circle cx="17.5" cy="13.8" r=".9" fill="currentColor"/>'),
  flag: svg('<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>'),
  headphones: svg('<path d="M3.5 14v-2a8.5 8.5 0 0 1 17 0v2"/><rect x="3" y="14" width="5" height="7" rx="2"/><rect x="16" y="14" width="5" height="7" rx="2"/>'),
  chart: svg('<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>'),
  settings: svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
  speaker: svg('<path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/>'),
  play: svg('<path d="M7 4.5v15l12-7.5z" fill="currentColor"/>'),
  pause: svg('<rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor"/><rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor"/>'),
  next: svg('<path d="m15 18-6-6 6-6"/>'),
  prev: svg('<path d="m9 18 6-6-6-6"/>'),
  repeat: svg('<path d="M17 2l3 3-3 3"/><path d="M4 11V9a4 4 0 0 1 4-4h12M7 22l-3-3 3-3"/><path d="M20 13v2a4 4 0 0 1-4 4H4"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  check: svg('<path d="m5 12.5 4.5 4.5L19 7.5"/>'),
  x: svg('<path d="M6 6l12 12M18 6 6 18"/>'),
  bookmark: svg('<path d="M6 3h12v18l-6-4-6 4z"/>'),
  trash: svg('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>'),
  search: svg('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>'),
  fire: svg('<path d="M12 22c4 0 7-2.7 7-7 0-3-2-5.5-3.5-7-.3 2-1.5 3-2.5 3 0-3-1.5-6-4-8 .2 3-1.6 5-3 6.6C4.6 11.2 5 13 5 15c0 4.3 3 7 7 7z"/>'),
  link: svg('<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>'),
  sparkle: svg('<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>'),
  users: svg('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6 6 0 0 1 3.5 6"/>'),
  puzzle: svg('<path d="M9 3h6v3a2 2 0 1 0 4 0h2v6h-3a2 2 0 1 0 0 4h3v5H3v-5h3a2 2 0 1 0 0-4H3V6h6z"/>'),
  shuffle: svg('<path d="M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5"/>'),
  translate: svg('<path d="M4 5h8M8 3v2c0 4-2 7-5 8M6 9c1 2 3 3.5 6 4"/><path d="m13 21 4-9 4 9M14.5 18h5"/>'),
  quote: svg('<path d="M7 7h4v4c0 3-1.5 5-4 6M15 7h4v4c0 3-1.5 5-4 6"/>'),
  pen: svg('<path d="M4 20h4L19 9l-4-4L4 16z"/>'),
  ear: svg('<path d="M7 9a5 5 0 1 1 10 0c0 3-3 4-3 7a3 3 0 0 1-6 .5"/><path d="M10 9.5a2 2 0 1 1 4 0"/>'),
  download: svg('<path d="M12 3v12M7 10l5 5 5-5M4 21h16"/>'),
  menu: svg('<path d="M4 7h16M4 12h16M4 17h16"/>'),
  doc: svg('<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5M9 12h7M9 16h7"/>'),
  folder: svg('<path d="M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>'),
  edit: svg('<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13 7 4 4"/>'),
  subtitles: svg('<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M7 12h4M13 12h4M7 15.5h10"/>'),
};

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export const USAGE_AR = { common: 'شائعة ومهمة', medium: 'أقل شيوعًا', rare: 'نادرة أو احترافية' };
/** Coloured dot for how common a word is: green common, orange less common, red rare. */
export const usageDot = (usage) => (usage && USAGE_AR[usage] ? `<span class="u-dot u-${usage}" title="${USAGE_AR[usage]}"></span>` : '');
export const usageLegend = () => `<span class="u-legend tiny muted"><span class="u-dot u-common"></span>شائعة <span class="u-dot u-medium"></span>أقل شيوعًا <span class="u-dot u-rare"></span>نادرة</span>`;
export const levelChip = (level) => (level ? `<span class="chip lvl-${esc(level)}" title="مستوى CEFR">${esc(level)}</span>` : '');

export const TYPE_AR = {
  word: 'كلمة',
  'phrasal verb': 'فعل مركّب',
  idiom: 'تعبير اصطلاحي',
  collocation: 'متلازمة لفظية',
  expression: 'عبارة',
};
export const POS_AR = {
  noun: 'اسم', verb: 'فعل', adjective: 'صفة', adverb: 'ظرف', 'verb phrase': 'عبارة فعلية', 'noun phrase': 'عبارة اسمية',
  'adjective phrase': 'عبارة وصفية', 'adverb phrase': 'عبارة ظرفية', preposition: 'حرف جر', conjunction: 'أداة ربط',
};
export const STATUS_AR = { new: 'جديدة', learning: 'قيد التعلّم', mastered: 'متقنة' };
export const TOPIC_AR = {
  business: 'الأعمال', work: 'العمل', academic: 'أكاديمي', daily: 'الحياة اليومية', media: 'الإعلام', tech: 'التقنية',
  emotions: 'المشاعر', health: 'الصحة', travel: 'السفر', society: 'المجتمع',
};
export const BUCKET_AR = { new: 'جديدة', review: 'مراجعة', difficult: 'صعبة', mistakes: 'أخطاء سابقة' };

/** One small, meaningful status — never a row of badges. */
export function statusChips(w) {
  if (w.difficult) return '<span class="chip ar-chip st-difficult">تحتاج تدريب</span>';
  if (w.due) return '<span class="chip ar-chip st-due">للمراجعة</span>';
  if (w.status === 'mastered') return '<span class="chip ar-chip st-mastered">متقنة ✓</span>';
  if (w.status === 'new') return '<span class="chip ar-chip st-new">جديدة</span>';
  return '';
}

export function typeLabel(w) {
  const pos = POS_AR[w.part_of_speech] || w.part_of_speech || '';
  const type = w.item_type && w.item_type !== 'word' ? TYPE_AR[w.item_type] : '';
  return [type, pos].filter(Boolean).join(' · ');
}

export function fmtTime(s) {
  if (s === null || s === undefined) return null;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  const mm = String(m).padStart(h ? 2 : 2, '0');
  return h ? `${h}:${mm}:${String(sec).padStart(2, '0')}` : `${mm}:${String(sec).padStart(2, '0')}`;
}

export function fmtDuration(s) {
  if (!s) return '';
  return fmtTime(s).replace(/^0(\d:)/, '$1');
}

const rtf = new Intl.RelativeTimeFormat('ar', { numeric: 'auto' });
export function relDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  const diff = (d.getTime() - Date.now()) / 1000;
  const abs = Math.abs(diff);
  if (abs < 60) return rtf.format(Math.round(diff), 'second');
  if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour');
  if (abs < 86400 * 30) return rtf.format(Math.round(diff / 86400), 'day');
  return d.toLocaleDateString('ar', { day: 'numeric', month: 'short', year: 'numeric' });
}
export const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString('ar', { day: 'numeric', month: 'short' }) : '—');
export const num = (n) => new Intl.NumberFormat('en').format(n ?? 0);

/** Build a forgiving regex for a vocabulary term inside a sentence. */
export function termRegex(term) {
  const words = term.toLowerCase().split(/\s+/).filter((w) => !['something', 'someone', 'sth', 'sb'].includes(w));
  if (!words.length) return null;
  const parts = words.map((w) => {
    if (['your', 'my', 'his', 'her', 'their', 'our'].includes(w)) return "(?:my|your|his|her|our|their|its|one's)";
    const stem = w.length > 4 ? w.slice(0, w.endsWith('e') ? -1 : Math.max(4, w.length - 2)) : w;
    const irregular = { take: 'took|taken', come: 'came', get: 'got|gotten', give: 'gave|given', go: 'went|gone', bring: 'brought', keep: 'kept', make: 'made', run: 'ran', stand: 'stood', break: 'broke|broken', catch: 'caught', deal: 'dealt' }[w];
    const base = `${stem.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&')}[a-z]*`;
    return irregular ? `(?:${base}|${irregular})` : base;
  });
  return new RegExp(`\\b${parts.join("(?:\\s+[\\w'’]+){0,3}?\\s+")}\\b`, 'i');
}

export function highlight(sentence, term) {
  const s = String(sentence || '');
  const re = termRegex(term || '');
  const m = re && s.match(re);
  if (!m) return esc(s);
  return `${esc(s.slice(0, m.index))}<mark>${esc(m[0])}</mark>${esc(s.slice(m.index + m[0].length))}`;
}

/* ------------------------------------------------------------ toast */
/** light / dark / auto (follows the device). Also colours the browser bar. */
export function applyTheme(t) {
  const dark = t === 'dark' || (t === 'auto' && window.matchMedia?.('(prefers-color-scheme: dark)').matches);
  if (dark) document.documentElement.setAttribute('data-theme', 'dark');
  else document.documentElement.removeAttribute('data-theme');
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0E1522' : '#F5F3EF');
}

export function toast(msg, ms = 0) {
  // stays long enough to read: short notes ~2.6 s, long ones up to 8 s
  if (!ms) ms = Math.max(2600, Math.min(8000, String(msg).split(/\s+/).length * 380 + 1200));
  const root = $('#toastRoot');
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  root.appendChild(el);
  setTimeout(() => {
    el.style.transition = 'opacity .3s';
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 300);
  }, ms);
}

/* ------------------------------------------------------------ modal */
let modalCleanup = null;
export function openModal(html, { wide = false, onClose } = {}) {
  closeModal(true);
  const root = $('#modalRoot');
  const box = document.createElement('div');
  box.className = `modal${wide ? ' wide' : ''}`;
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-modal', 'true');
  box.innerHTML = `<button class="btn icon sm ghost modal-close" data-close aria-label="إغلاق">${icon.x}</button>${html}`;
  root.appendChild(box);
  requestAnimationFrame(() => root.classList.add('open'));
  const onKey = (e) => e.key === 'Escape' && closeModal();
  const onClick = (e) => {
    if (e.target.closest('[data-close]') || e.target.classList.contains('modal-backdrop')) closeModal();
  };
  document.addEventListener('keydown', onKey);
  root.addEventListener('click', onClick);
  modalCleanup = () => {
    document.removeEventListener('keydown', onKey);
    root.removeEventListener('click', onClick);
    onClose?.();
  };
  return box;
}

export function closeModal(immediate = false) {
  const root = $('#modalRoot');
  const boxes = $$('.modal', root);
  if (!boxes.length) return;
  modalCleanup?.();
  modalCleanup = null;
  root.classList.remove('open');
  if (immediate) boxes.forEach((b) => b.remove());
  else setTimeout(() => boxes.forEach((b) => b.remove()), 250);
}

export function emptyState(emoji, title, text, action = '') {
  return `<div class="card empty"><div class="icon">${emoji}</div><h3>${esc(title)}</h3><p>${esc(text)}</p>${action ? `<div style="margin-top:16px">${action}</div>` : ''}</div>`;
}

export function skeleton(n = 4, h = 72) {
  return `<div class="stack">${Array.from({ length: n }, () => `<div class="skeleton" style="height:${h}px"></div>`).join('')}</div>`;
}

export function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function thumbHtml(source, { duration } = {}) {
  if (source?.kind === 'text') return `<div class="thumb text-thumb"><div class="play">${icon.doc}</div></div>`;
  const img = source?.thumbnail_url && !source.is_demo ? `<img src="${esc(source.thumbnail_url)}" alt="" loading="lazy">` : `<div class="play">${icon.play}</div>`;
  return `<div class="thumb">${img}${source?.is_demo ? '<span class="demo-tag">تجريبي</span>' : ''}${duration ? `<span class="dur">${esc(fmtDuration(duration))}</span>` : ''}</div>`;
}

// ---- 3Goal line icons (one style everywhere, instead of chat emojis)
Object.assign(icon, {
  bookOpen: svg('<path d="M2 4.5h6a4 4 0 0 1 4 4V21a3 3 0 0 0-3-3H2z"/><path d="M22 4.5h-6a4 4 0 0 0-4 4V21a3 3 0 0 1 3-3h7z"/>'),
  library: svg('<path d="M4 4v16M8 4v16"/><path d="m12.5 4.6 4.2-1.1 4 15.4-4.2 1.1z"/>'),
  chat: svg('<path d="M21 12a8 8 0 0 1-11.6 7.1L3 21l1.9-6.2A8 8 0 1 1 21 12z"/><path d="M8.5 12h.01M12 12h.01M15.5 12h.01"/>'),
  sprout: svg('<path d="M12 21v-9"/><path d="M12 12C12 7 8 5 4 5c0 4 3 7 8 7z"/><path d="M12 10c0-4 3-6 8-6 0 4-3 6-8 6z"/>'),
  flask: svg('<path d="M9 3h6M10 3v6L4.5 18.5A1.7 1.7 0 0 0 6 21h12a1.7 1.7 0 0 0 1.5-2.5L14 9V3"/><path d="M7 15h10"/>'),
  brain: svg('<path d="M12 5a3 3 0 0 0-5.8-1A3 3 0 0 0 4 9a3.5 3.5 0 0 0 1 6.5A3 3 0 0 0 12 19z"/><path d="M12 5a3 3 0 0 1 5.8-1A3 3 0 0 1 20 9a3.5 3.5 0 0 1-1 6.5A3 3 0 0 1 12 19z"/>'),
  heart: svg('<path d="M20.8 5.6a5 5 0 0 0-7.6-.6L12 6.2 10.8 5a5 5 0 0 0-7.1 7.1L12 20.5l8.3-8.4a5 5 0 0 0 .5-6.5z"/>'),
  palette: svg('<circle cx="12" cy="12" r="9"/><circle cx="8" cy="10" r="1.2" fill="currentColor"/><circle cx="12" cy="7.5" r="1.2" fill="currentColor"/><circle cx="16" cy="10" r="1.2" fill="currentColor"/><path d="M12 21a2.5 2.5 0 0 1 0-5h2a3 3 0 0 0 3-3"/>'),
  smile: svg('<circle cx="12" cy="12" r="9"/><path d="M8 14a5 5 0 0 0 8 0M9 9.5h.01M15 9.5h.01"/>'),
  video: svg('<rect x="2.5" y="6" width="13" height="12" rx="2.5"/><path d="m15.5 10 6-3.5v11l-6-3.5"/>'),
  cpu: svg('<rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4"/>'),
  chef: svg('<path d="M6 13.9V21h12v-7.1"/><path d="M6 14a4 4 0 1 1 1.2-7.8 5 5 0 0 1 9.6 0A4 4 0 1 1 18 14z"/><path d="M6 17h12"/>'),
  ball: svg('<circle cx="12" cy="12" r="9"/><path d="m12 7 4 3-1.5 4.5h-5L8 10z"/><path d="M12 3v4M3.5 9.5 8 10M20.5 9.5 16 10M7 19.5l2.5-5M17 19.5l-2.5-5"/>'),
  landmark: svg('<path d="M3 21h18M5 21V10M19 21V10M9.5 21V10M14.5 21V10M2 10l10-6 10 6z"/>'),
  pulse: svg('<path d="M3 12h4l2-5 4 10 2-5h6"/>'),
  stars: svg('<path d="m12 3 1.8 4.6L18.5 9l-4.7 1.4L12 15l-1.8-4.6L5.5 9l4.7-1.4z"/><path d="M19 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"/>'),
  mic: svg('<rect x="9" y="2.5" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3.5M8.5 21.5h7"/>'),
  podcast: svg('<circle cx="12" cy="10" r="2.5"/><path d="M8 14.5a5.5 5.5 0 1 1 8 0M5.2 17.3a9.5 9.5 0 1 1 13.6 0"/><path d="M12 13v8.5"/>'),
  star: svg('<path d="m12 2.8 2.8 5.8 6.3.9-4.6 4.4 1.1 6.3L12 17.2l-5.6 3 1.1-6.3L2.9 9.5l6.3-.9z"/>'),
  news: svg('<rect x="3" y="4" width="15" height="16" rx="2"/><path d="M18 8h3v10a2 2 0 0 1-2 2H5M7 8h7M7 12h7M7 16h4"/>'),
  briefcase: svg('<rect x="3" y="7" width="18" height="13" rx="2.5"/><path d="M8.5 7V5a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v2M3 12.5h18"/>'),
  child: svg('<circle cx="12" cy="6" r="3"/><path d="M8.5 21v-6l-2.5-2.5M15.5 21v-6l2.5-2.5M8.5 12.5h7"/>'),
  compass: svg('<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5z"/>'),
  plane: svg('<path d="M10.5 13.5 3 11l1.5-1.5 8 .5 4.5-5a2.1 2.1 0 0 1 3 3l-5 4.5.5 8L14 22l-2.5-7.5L8 18v2.5L6.5 22 5 19l-3-1.5L3.5 16H6z"/>'),
  target: svg('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/>'),
  expand: svg('<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>'),
  list: svg('<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1" fill="currentColor"/><circle cx="4.5" cy="12" r="1" fill="currentColor"/><circle cx="4.5" cy="18" r="1" fill="currentColor"/>'),
  speech: svg('<path d="M4 12a7 7 0 0 1 12.2-4.7"/><circle cx="9" cy="12" r="3"/><path d="M17.5 9.5a4 4 0 0 1 0 5M20 7a7.5 7.5 0 0 1 0 10"/>'),
  save: svg('<path d="M5 3h11l3 3v15H5z"/><path d="M8 3v5h7V3M8 21v-6h8v6"/>'),
  sliders: svg('<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>'),
  clock: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
  layers: svg('<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/>'),
  hash: svg('<path d="M5 9h14M5 15h14M10 4 8 20M16 4l-2 16"/>'),
  sun: svg('<circle cx="12" cy="12" r="4"/><path d="M12 2v2.5M12 19.5V22M4.2 4.2 6 6M18 18l1.8 1.8M2 12h2.5M19.5 12H22M4.2 19.8 6 18M18 6l1.8-1.8"/>'),
  help: svg('<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14M12 17.5h.01"/>'),
});
