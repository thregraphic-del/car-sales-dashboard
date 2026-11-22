// 🎬 مقاطعي — first row only, «المزيد» opens ~3 rows (scrolls inside). A select mode to mark
// ⭐ favourite, 📌 mark (mastered / review / clear), ↕ order, 👁 hide / show, 📁 sections, 🗑 delete — each icon opens its own small choices.
// The choices are one small JSON per learner (saved only when something changes).
import { api } from './api.js';
import { state } from './state.js';
import { esc, toast, thumbHtml, relDate, fmtTime } from './ui.js';

const sv = (d) => `<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const IC = {
  star: sv('<path d="m12 2.8 2.8 5.8 6.3.9-4.6 4.4 1.1 6.3L12 17.2l-5.6 3 1.1-6.3L2.9 9.5l6.3-.9z"/>'),
  pin: sv('<path d="M9 3h6l-1 6 3 3v2H7v-2l3-3zM12 14v7"/>'),
  sort: sv('<path d="M8 4v16M8 4 4.5 7.5M8 4l3.5 3.5M16 20V4M16 20l-3.5-3.5M16 20l3.5-3.5"/>'),
  eye: sv('<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'),
  eyeOff: sv('<path d="M3 3l18 18M10.6 5.2A9.8 9.8 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4M6.5 6.6A17 17 0 0 0 2 12s3.6 7 10 7a9.6 9.6 0 0 0 4.1-.9M9.9 9.9a3 3 0 0 0 4.2 4.2"/>'),
  folder: sv('<path d="M3 6a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>'),
  trash: sv('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>'),
};
const P0 = { fav: [], order: [], hidden: [], mark: {}, sec: {} };
const lsKey = () => `vidprefs.${state.user?.id || 'me'}`;

export function bindMyVideos(box, list, { onPrefs, onPick } = {}) {
  let P = { ...P0 };
  try { P = { ...P0, ...JSON.parse(localStorage.getItem(lsKey()) || '{}') }; } catch { /* none */ }
  let open = false;
  let picking = false;
  let tab = ''; // '' all · a section name
  let sub = ''; // the open choices row: '' · 'mark' · 'order' · 'sec'
  let favOnly = false; // the shared «المفضلة» button of the tab bar
  const sel = new Set();
  const save = () => {
    try { localStorage.setItem(lsKey(), JSON.stringify(P)); } catch { /* ignore */ }
    api.saveVidPrefs(P).catch(() => {});
  };
  api.vidPrefs().then((r) => { if (r?.prefs) { P = { ...P0, ...r.prefs }; try { localStorage.setItem(lsKey(), JSON.stringify(P)); } catch { /* ignore */ } draw(); onPrefs?.(); } }).catch(() => {});

  const sorted = () => {
    const pos = new Map(P.order.map((id, i) => [id, i]));
    return [...list].sort((a, b) => (P.fav.includes(b.id) - P.fav.includes(a.id))
      || ((pos.get(a.id) ?? 1e9) - (pos.get(b.id) ?? 1e9))
      || String(b.analyzed_at).localeCompare(String(a.analyzed_at)));
  };
  const shown = () => sorted().filter((s) => (picking || !P.hidden.includes(s.id)) && (!tab || P.sec[s.id] === tab) && (!favOnly || P.fav.includes(s.id)));
  const sections = () => [...new Set(Object.values(P.sec).filter(Boolean))];

  function draw() {
    if (!list.length) { box.innerHTML = ''; return; }
    const items = shown();
    const secs = sections();
    const allHidden = sel.size > 0 && [...sel].every((id) => P.hidden.includes(id));
    const SUB = {
      mark: [['ok', '✅ متقن'], ['review', '🟡 مراجعة'], ['clear', '↺ إلغاء العلامة']],
      order: [['up', '⬆ لفوق'], ['down', '⬇ لتحت']],
      sec: [...secs.map((x) => [`secset:${x}`, `📁 ${x}`]), ['secnew', '＋ قسم جديد'], ['secclear', '✕ إزالة من القسم']],
    };
    box.innerHTML = `${secs.length ? `<div class="chip-row">${[['', 'الكل'], ...secs.map((x) => [x, `📁 ${x}`])].map(([k, l]) => `<button type="button" class="gchip ${tab === k ? 'on' : ''}" data-tab="${esc(k)}">${esc(l)}</button>`).join('')}</div>` : ''}
      ${picking ? `<div class="mv-bar2"><span class="mv-count tiny">${sel.size} محدد</span>
        <button type="button" data-mv="fav" title="مفضلة">${IC.star}</button>
        <button type="button" data-mv="sub:mark" class="${sub === 'mark' ? 'on' : ''}" title="تصنيف: متقن أو مراجعة أو إلغاء العلامة">${IC.pin}</button>
        <button type="button" data-mv="sub:order" class="${sub === 'order' ? 'on' : ''}" title="ترتيب: حرّك المقطع لفوق أو لتحت">${IC.sort}</button>
        <button type="button" data-mv="hide" title="${allHidden ? 'إظهار المقاطع المحددة' : 'إخفاء المقاطع المحددة'}">${allHidden ? IC.eye : IC.eyeOff}</button>
        <button type="button" data-mv="sub:sec" class="${sub === 'sec' ? 'on' : ''}" title="قسم: ضع المقاطع في قسم">${IC.folder}</button>
        <button type="button" data-mv="del" class="bad" title="حذف">${IC.trash}</button></div>
        ${sub ? `<div class="mv-sub">${SUB[sub].map(([k, l]) => `<button type="button" data-mv="${esc(k)}">${esc(l)}</button>`).join('')}</div>` : ''}` : ''}
      <div class="mv-wrap ${open ? 'open' : ''}"><div class="grid cols-3 mv-grid">${items.map((s) => `
        <a class="video-mini mv ${sel.has(s.id) ? 'sel' : ''} mark-${P.mark[s.id] || 'none'}${P.hidden.includes(s.id) ? ' mv-hid' : ''}" href="#/source/${s.id}" data-id="${s.id}">${thumbHtml(s, { duration: s.duration_seconds })}
          <div style="min-width:0"><div class="en small clamp2" style="font-weight:600">${P.hidden.includes(s.id) ? '🙈 ' : ''}${P.fav.includes(s.id) ? '⭐ ' : ''}${P.mark[s.id] === 'ok' ? '✅ ' : P.mark[s.id] === 'review' ? '🟡 ' : ''}${esc(s.title)}</div>
          <div class="tiny muted">${s.saved_count} محفوظة من ${s.item_count} · ${esc(relDate(s.analyzed_at))}${s.progress_seconds > 5 ? ` · <span class="resume-chip">▶ ${fmtTime(s.progress_seconds)}</span>` : ''}${P.sec[s.id] ? ` · 📁 ${esc(P.sec[s.id])}` : ''}</div></div></a>`).join('')}</div></div>
      ${favOnly && !items.length ? '<p class="tiny muted" style="text-align:center">ما عندك مقاطع مفضلة — اضغط «تحديد» ثم ⭐ على المقطع.</p>' : ''}
      ${items.length > 1 ? `<button type="button" class="link-btn mv-more" data-mv="more">${open ? 'أقل ▴' : `المزيد ▾ (${items.length})`}</button>` : ''}`;
    onPick?.(picking);
    // collapsed: the first row only; open: about three rows, scrolling inside
    requestAnimationFrame(() => {
      const wrap = box.querySelector('.mv-wrap');
      const first = box.querySelector('.mv');
      if (!wrap || !first) return;
      const h = first.offsetHeight + 12;
      const grid = box.querySelector('.mv-grid');
      const cols = Math.max(1, getComputedStyle(grid).gridTemplateColumns.split(' ').length);
      // two full rows first; «المزيد» opens three (the box scrolls for the rest)
      wrap.style.maxHeight = `${Math.round(h * (open ? 3 : 2) + 14)}px`;
      const more = box.querySelector('.mv-more');
      if (more) more.hidden = items.length <= 2 * cols;
    });
  }

  const act = async (k) => {
    const ids = [...sel];
    if (k === 'pick') { picking = !picking; sel.clear(); sub = ''; return draw(); }
    if (k === 'more') { open = !open; return draw(); }
    if (!ids.length) return toast('اختر مقطعًا أولًا');
    if (k.startsWith('sub:')) { const n = k.slice(4); sub = sub === n ? '' : n; return draw(); }
    sub = '';
    if (k === 'fav') { const all = ids.every((i) => P.fav.includes(i)); P.fav = all ? P.fav.filter((i) => !ids.includes(i)) : [...new Set([...P.fav, ...ids])]; }
    if (k === 'up' || k === 'down') {
      const cur = sorted().map((s) => s.id);
      for (const id of k === 'up' ? ids : [...ids].reverse()) {
        const i = cur.indexOf(id);
        const j = k === 'up' ? i - 1 : i + 1;
        if (i < 0 || j < 0 || j >= cur.length) continue;
        [cur[i], cur[j]] = [cur[j], cur[i]];
      }
      P.order = cur;
    }
    if (k === 'ok' || k === 'review') ids.forEach((i) => { P.mark[i] = k; });
    if (k === 'clear') ids.forEach((i) => { delete P.mark[i]; });
    if (k.startsWith('secset:')) { const name = k.slice(7).slice(0, 30); ids.forEach((i) => { P.sec[i] = name; }); }
    if (k === 'secclear') ids.forEach((i) => { delete P.sec[i]; });
    if (k === 'secnew') {
      const name = prompt('اسم القسم الجديد (مثل: تحفيز، بودكاست)', '');
      if (!name?.trim()) return draw();
      ids.forEach((i) => { P.sec[i] = name.trim().slice(0, 30); });
    }
    // 👁 one button: hides the selected clips; pressed again on them it shows them again (they stay in this same list while selecting)
    if (k === 'hide') {
      const allHidden = ids.every((i) => P.hidden.includes(i));
      P.hidden = allHidden ? P.hidden.filter((i) => !ids.includes(i)) : [...new Set([...P.hidden, ...ids])];
    }
    if (k === 'del') {
      if (!confirm(`حذف ${ids.length} مقطع نهائيًا؟ الكلمات المحفوظة تبقى في «كلماتي».`)) return undefined;
      for (const i of ids) { try { await api.deleteSource(i); } catch (err) { toast(err.message); } }
      list = list.filter((s) => !ids.includes(s.id));
    }
    if (k === 'hide' || k === 'fav' || k === 'up' || k === 'down' || k.startsWith('sec') || k === 'ok' || k === 'review' || k === 'clear') { /* keep the selection so several actions can follow */ } else sel.clear();
    save();
    return draw();
  };

  box.onclick = (e) => {
    const b = e.target.closest('[data-mv]');
    if (b) { e.preventDefault(); act(b.dataset.mv); return; }
    const t = e.target.closest('[data-tab]');
    if (t) { tab = t.dataset.tab; sel.clear(); draw(); return; }
    const card = e.target.closest('.mv');
    if (card && picking) {
      e.preventDefault();
      const id = Number(card.dataset.id);
      if (sel.has(id)) sel.delete(id); else sel.add(id);
      draw();
    }
  };
  draw();
  return {
    update: (next) => { list = next; draw(); },
    setFavOnly: (on) => { favOnly = on; draw(); },
    setPicking: (on) => { picking = !!on; sel.clear(); sub = ''; draw(); },
    isPicking: () => picking,
    isFav: (id) => P.fav.includes(id),
    toggleFav: (id) => { P.fav = P.fav.includes(id) ? P.fav.filter((i) => i !== id) : [...P.fav, id]; save(); draw(); },
  };
}
