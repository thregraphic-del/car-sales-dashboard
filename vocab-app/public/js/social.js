// The contact icons (email, phone, WhatsApp, Instagram, TikTok): the owner sets them in the control panel (/admin.html),
// everyone sees them under the menu. A tap opens our account.
import { esc } from './ui.js';

const S = (d, fill) => `<svg viewBox="0 0 24 24" ${fill ? 'fill="currentColor"' : 'fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"'} aria-hidden="true">${d}</svg>`;
const ICONS = {
  mail: S('<rect x="3" y="5" width="18" height="14" rx="3"/><path d="m4 7 8 6 8-6"/>'),
  phone: S('<path d="M5 4h3.5l1.7 4.2-2 1.3a11 11 0 0 0 5.3 5.3l1.3-2L19 14.5V18a2 2 0 0 1-2 2A13 13 0 0 1 3 6a2 2 0 0 1 2-2z"/>'),
  whatsapp: S('<path d="M20 11.5a8 8 0 0 1-11.9 7L4 19.5l1.1-4A8 8 0 1 1 20 11.5z"/><path d="M9 8.5c0 3.5 3 6.5 6.5 6.5l1-1.4-2-1-1 .8a4.5 4.5 0 0 1-2-2l.8-1-1-2z"/>'),
  instagram: S('<rect x="3.5" y="3.5" width="17" height="17" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17" cy="7" r="1" fill="currentColor"/>'),
  tiktok: S('<path d="M16.6 5.8A4.3 4.3 0 0 1 15.6 3h-3.1v12.4a2.6 2.6 0 1 1-2.6-2.6c.3 0 .5 0 .8.1V9.7a5.8 5.8 0 1 0 5 5.7V9a7.4 7.4 0 0 0 4.3 1.4V7.3a4.3 4.3 0 0 1-3.4-1.5z"/>', true),
};
const LABEL = { mail: 'الإيميل', phone: 'اتصال', whatsapp: 'واتساب', instagram: 'انستقرام', tiktok: 'تيك توك' };

/** [{ key, label, href }] for every contact detail that is filled in. */
export function socialLinks(c = {}) {
  const out = [];
  if (c.whatsapp) out.push({ key: 'whatsapp', href: `https://wa.me/${encodeURIComponent(c.whatsapp)}` });
  if (c.instagram) out.push({ key: 'instagram', href: `https://instagram.com/${encodeURIComponent(c.instagram)}` });
  if (c.tiktok) out.push({ key: 'tiktok', href: `https://www.tiktok.com/@${encodeURIComponent(c.tiktok)}` });
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
