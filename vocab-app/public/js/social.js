// The contact icons (email, phone, WhatsApp, Instagram, TikTok): the owner sets them in the control panel (/admin.html),
// everyone sees them under the menu. A tap opens our account.
import { esc } from './ui.js';

const S = (d, fill) => `<svg viewBox="0 0 24 24" ${fill ? 'fill="currentColor"' : 'fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"'} aria-hidden="true">${d}</svg>`;
const ICONS = {
  mail: S('<rect x="3" y="5" width="18" height="14" rx="3"/><path d="m4 7 8 6 8-6"/>'),
  phone: S('<path d="M5 4h3.5l1.7 4.2-2 1.3a11 11 0 0 0 5.3 5.3l1.3-2L19 14.5V18a2 2 0 0 1-2 2A13 13 0 0 1 3 6a2 2 0 0 1 2-2z"/>'),
  whatsapp: S('<path d="M20 11.5a8 8 0 0 1-11.9 7L4 19.5l1.1-4A8 8 0 1 1 20 11.5z"/><path d="M9 8.5c0 3.5 3 6.5 6.5 6.5l1-1.4-2-1-1 .8a4.5 4.5 0 0 1-2-2l.8-1-1-2z"/>'),
  instagram: S('<rect x="3.5" y="3.5" width="17" height="17" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17" cy="7" r="1" fill="currentColor"/>'),
  youtube: S('<rect x="2.5" y="5.5" width="19" height="13" rx="4"/><path d="M10.2 9.4v5.2l4.6-2.6z" fill="currentColor"/>'),
  x: S('<path d="M4 4l16 16M20 4 4 20"/>'),
  snapchat: S('<path d="M12 3.5c2.6 0 4.2 1.9 4.2 4.4v1.8c.4.4 1.3.4 1.8.7-.3.9-1.4.9-1.7 1.2.4 1.4 1.6 2.3 3 2.7-.2.9-1.7.7-2.1 1.1-.4.8-.6 1.6-2 1.5-.9-.1-1.5.9-3.2.9s-2.3-1-3.2-.9c-1.4.1-1.6-.7-2-1.5-.4-.4-1.9-.2-2.1-1.1 1.4-.4 2.6-1.3 3-2.7-.3-.3-1.4-.3-1.7-1.2.5-.3 1.4-.3 1.8-.7V7.9c0-2.5 1.6-4.4 4.2-4.4z"/>'),
  telegram: S('<path d="M21 4 3.5 11.2l5.2 1.8L10 18.5l2.6-3.2 4.7 3.5L21 4z"/><path d="M8.7 13 17 7.6"/>'),
  facebook: S('<path d="M14 21v-8h2.8l.5-3.2H14V7.9c0-.9.4-1.6 1.7-1.6h1.7V3.4c-.4-.1-1.4-.2-2.5-.2-2.6 0-4.1 1.5-4.1 4.2v2.4H8v3.2h2.8v8z"/>'),
  tiktok: S('<path d="M16.6 5.8A4.3 4.3 0 0 1 15.6 3h-3.1v12.4a2.6 2.6 0 1 1-2.6-2.6c.3 0 .5 0 .8.1V9.7a5.8 5.8 0 1 0 5 5.7V9a7.4 7.4 0 0 0 4.3 1.4V7.3a4.3 4.3 0 0 1-3.4-1.5z"/>', true),
};
const LABEL = { mail: 'الإيميل', phone: 'اتصال', whatsapp: 'واتساب', instagram: 'انستقرام', tiktok: 'تيك توك', youtube: 'يوتيوب', x: 'إكس', snapchat: 'سناب شات', telegram: 'تيليجرام', facebook: 'فيسبوك' };

/** [{ key, label, href }] for every contact detail that is filled in. */
export function socialLinks(c = {}) {
  const out = [];
  if (c.whatsapp) out.push({ key: 'whatsapp', href: `https://wa.me/${encodeURIComponent(c.whatsapp)}` });
  if (c.instagram) out.push({ key: 'instagram', href: `https://instagram.com/${encodeURIComponent(c.instagram)}` });
  if (c.tiktok) out.push({ key: 'tiktok', href: `https://www.tiktok.com/@${encodeURIComponent(c.tiktok)}` });
  if (c.youtube) out.push({ key: 'youtube', href: `https://www.youtube.com/@${encodeURIComponent(c.youtube)}` });
  if (c.snapchat) out.push({ key: 'snapchat', href: `https://www.snapchat.com/add/${encodeURIComponent(c.snapchat)}` });
  if (c.x) out.push({ key: 'x', href: `https://x.com/${encodeURIComponent(c.x)}` });
  if (c.facebook) out.push({ key: 'facebook', href: `https://www.facebook.com/${encodeURIComponent(c.facebook)}` });
  if (c.telegram) out.push({ key: 'telegram', href: `https://t.me/${encodeURIComponent(c.telegram)}` });
  if (c.email) out.push({ key: 'mail', href: `mailto:${c.email}` });
  if (c.phone) out.push({ key: 'phone', href: `tel:+${c.phone}` });
  return out.map((l) => ({ ...l, label: LABEL[l.key] }));
}

/** The row of round icons ('' when nothing is set). */
export function socialRow(c) {
  const links = socialLinks(c);
  if (!links.length) return '';
  return `<div class="soc-row" aria-label="تواصل معنا">${links.map((l) => `<a class="soc-ic ${l.key}" href="${esc(l.href)}" ${l.href.startsWith('http') ? 'target="_blank" rel="noopener"' : ''} aria-label="${l.label}" title="${l.label}">${ICONS[l.key]}</a>`).join('')}</div>`;
}
