// One icon style for the whole site: the colourful emoji used on buttons, titles and chips are shown as the
// same thin line icons as the rest of the interface (they take the colour of the text around them, so they follow
// the theme in light and dark). Done here once, as the page draws — no emoji is left to look different.
import { icon } from './ui.js';

const svg = (d, extra = '') => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" ${extra}>${d}</svg>`;

// emoji → icon (an existing one from ui.js, or drawn here in the same style)
const OWN = {
  summary: svg('<rect x="4" y="4" width="16" height="16" rx="3.5"/><path d="M8 9h8M8 13h8M8 17h5"/>'),
  bulb: svg('<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/>'),
  muted: svg('<path d="M11 5 6 9H2v6h4l5 4V5z"/><path d="m22 9-6 6M16 9l6 6"/>'),
  checkCircle: svg('<circle cx="12" cy="12" r="9"/><path d="m8 12.5 2.8 2.8L16 9.5"/>'),
  xCircle: svg('<circle cx="12" cy="12" r="9"/><path d="m9 9 6 6M15 9l-6 6"/>'),
  alertCircle: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16.5v.3"/>'),
  alertTri: svg('<path d="M12 3.5 2.5 20h19z"/><path d="M12 10v4.5M12 17.3v.2"/>'),
  party: svg('<path d="m4 21 4.5-12 7.5 7.5z"/><path d="M14 4l1 2.2M19 9l2.2 1M17.5 3v2.5M20 14l1.5-.5"/>'),
  user: svg('<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>'),
  pointer: svg('<path d="M9 11V5.5a2 2 0 0 1 4 0V11"/><path d="M13 11h4.5a2 2 0 0 1 2 2v3a5 5 0 0 1-5 5h-3a5 5 0 0 1-4-2l-3.3-4.4a1.7 1.7 0 0 1 2.7-2L9 15"/>'),
  clipboard: svg('<rect x="6" y="4" width="12" height="17" rx="2.5"/><path d="M9 4h6v3H9z"/><path d="M9 12h6M9 16h4"/>'),
  eraser: svg('<path d="m16 3 5 5-9 9H7l-4-4z"/><path d="m9 9 6 6"/>'),
  swords: svg('<path d="m14.5 14.5 6 6M3.5 3.5l8 8M20.5 3.5l-8 8M3.5 20.5l6-6"/><path d="m3 7 4 4M17 7l-4 4"/>'),
  tv: svg('<rect x="3" y="7" width="18" height="13" rx="2.5"/><path d="m8 3 4 4 4-4"/>'),
  type: svg('<path d="M3 18 8 6l5 12M5 14h6"/><path d="M16 10.5h2.5a2 2 0 0 1 0 4H16z"/>'),
  notebook: svg('<rect x="5" y="3" width="14" height="18" rx="2.5"/><path d="M9 3v18M12 8h4M12 12h4"/>'),
  dice: svg('<rect x="4" y="4" width="16" height="16" rx="3.5"/><circle cx="9" cy="9" r="1" fill="currentColor"/><circle cx="15" cy="9" r="1" fill="currentColor"/><circle cx="9" cy="15" r="1" fill="currentColor"/><circle cx="15" cy="15" r="1" fill="currentColor"/>'),
  eye: svg('<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'),
  eyeOff: svg('<path d="M3 3l18 18"/><path d="M10.7 5.1A9.7 9.7 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 3.9M6.6 7.5A16.5 16.5 0 0 0 2 12s3.6 7 10 7a9.6 9.6 0 0 0 4.2-1"/>'),
  trend: svg('<path d="m3 17 6-6 4 4 8-8"/><path d="M15 7h6v6"/>'),
  trophy: svg('<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M7 6H4v2a3 3 0 0 0 3 3M17 6h3v2a3 3 0 0 1-3 3"/>'),
  handshake: svg('<path d="m11 17 2 2a1.4 1.4 0 0 0 2-2"/><path d="m14 14 2.5 2.5a1.4 1.4 0 0 0 2-2L15 11"/><path d="M3 11l5-5 4 1 4-1 5 5"/><path d="m8 6 3 5"/>'),
  moon: svg('<path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5z"/>'),
  mail: svg('<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="m3 7 9 6 9-6"/>'),
  calendar: svg('<rect x="3" y="4.5" width="18" height="16.5" rx="3"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4"/>'),
  zap: svg('<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>'),
  turtle: svg('<path d="M3.5 16c0-5 3.7-8.5 8.5-8.5s8.5 3.5 8.5 8.5z"/><path d="M6 19h12M9 7.5 9 16M15 7.5V16"/>'),
  dumbbell: svg('<path d="M6.5 6.5v11M17.5 6.5v11M3 9.5v5M21 9.5v5M6.5 12h11"/>'),
  pin: svg('<path d="M12 17v5"/><path d="M8 3h8l-1 6 3 4H6l3-4z"/>'),
  rotate: svg('<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>'),
  checkSquare: svg('<rect x="4" y="4" width="16" height="16" rx="3.5"/><path d="m8.5 12 2.5 2.5 4.5-5"/>'),
  maximize: svg('<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>'),
  globe: svg('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>'),
  starFill: svg('<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>', 'fill="currentColor"'),
};

// the emoji (with or without the invisible variation mark) and the icon that replaces it
const MAP = {
  '🔊': icon.speaker, '🔉': icon.speaker, '🔇': OWN.muted, '📝': OWN.summary, '📄': icon.doc, '📃': icon.doc, '✨': icon.sparkle, '⭐': icon.star, '🌟': icon.star, '★': OWN.starFill,
  '💡': OWN.bulb, '📚': icon.library, '🔥': icon.fire, '🎯': icon.target, '✅': OWN.checkCircle, '❌': OWN.xCircle, '⚙': icon.settings, '🎬': icon.video,
  '📌': OWN.pin, '⏱': icon.clock, '🔔': icon.bell, '🎉': OWN.party, '🎊': OWN.party, '👤': OWN.user, '🎮': icon.game, '🌐': OWN.globe, '👆': OWN.pointer,
  '🔁': icon.repeat, '🔂': icon.repeat, '✎': icon.edit, '✏': icon.edit, '⚠': OWN.alertTri, '🗣': icon.speech, '📋': OWN.clipboard, '📁': icon.folder, '🎨': icon.palette,
  '🧹': OWN.eraser, '🎤': icon.mic, '✍': icon.pen, '⚔': OWN.swords, '🎧': icon.headphones, '🧩': icon.puzzle, '⚡': OWN.zap, '↺': OWN.rotate, '↻': OWN.rotate,
  '📺': OWN.tv, '🔤': OWN.type, '➕': icon.plus, '📒': OWN.notebook, '👥': icon.users, '🗑': icon.trash, '☑': OWN.checkSquare, '🐢': OWN.turtle, '🙈': OWN.eyeOff,
  '💪': OWN.dumbbell, '🏁': icon.flag, '⏸': icon.pause, '⬇': icon.download, '📖': icon.bookOpen, '🎲': OWN.dice, '👁': OWN.eye, '📈': OWN.trend, '🌱': icon.sprout,
  '🏆': OWN.trophy, '🤝': OWN.handshake, '🌙': OWN.moon, '✉': OWN.mail, '📅': OWN.calendar, '🔎': icon.search, '🔍': icon.search, '🎛': icon.sliders, '❗': OWN.alertCircle,
  '👋': icon.smile, '⛶': OWN.maximize, '✕': icon.x, '✖': icon.x, '🧠': icon.brain, '🔗': icon.link, '💬': icon.chat, '🎓': icon.cards,
};
for (const k of Object.keys(MAP)) if (!MAP[k]) delete MAP[k]; // an icon that does not exist is simply left as it was
const FILLED = new Set(['★']);
const KEYS = Object.keys(MAP).filter(Boolean).sort((a, b) => b.length - a.length).map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
const RE = new RegExp(`(?:${KEYS.join('|')})\\uFE0F?`, 'gu');
const SKIP = 'script,style,textarea,input,select,option,title,code,pre,svg,[contenteditable],.transcript,.no-ico';

const spanFor = (ch) => {
  const s = document.createElement('span');
  s.className = `ico${FILLED.has(ch) ? ' fill' : ''}`;
  s.setAttribute('aria-hidden', 'true');
  s.innerHTML = MAP[ch];
  return s;
};

function convertText(node) {
  const text = node.nodeValue;
  RE.lastIndex = 0;
  if (!text || !RE.test(text)) return;
  RE.lastIndex = 0;
  const frag = document.createDocumentFragment();
  let last = 0;
  for (const m of text.matchAll(RE)) {
    if (m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)));
    frag.appendChild(spanFor(m[0].replace(/️$/, '')));
    last = m.index + m[0].length;
  }
  if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
  node.parentNode?.replaceChild(frag, node);
}

/** Turn the emoji inside `root` into icons. */
export function iconize(root) {
  if (!root) return;
  if (root.nodeType === 3) { if (!root.parentElement?.closest(SKIP)) convertText(root); return; }
  if (root.nodeType !== 1 || root.matches?.(SKIP) || root.closest?.(SKIP)) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (n.parentElement?.closest(SKIP) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  const list = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) list.push(n);
  list.forEach(convertText);
}

/** Start once: the whole page now, then everything that is drawn later. */
export function startIcons() {
  iconize(document.body);
  let queue = new Set();
  let scheduled = false;
  const flush = () => { scheduled = false; const q = queue; queue = new Set(); q.forEach((n) => { if (n.isConnected) iconize(n); }); };
  new MutationObserver((muts) => {
    for (const m of muts) {
      if (m.type === 'characterData') queue.add(m.target);
      else m.addedNodes.forEach((n) => queue.add(n));
    }
    if (queue.size && !scheduled) { scheduled = true; requestAnimationFrame(flush); }
  }).observe(document.body, { childList: true, subtree: true, characterData: true });
}
