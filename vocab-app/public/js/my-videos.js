// 🎬 مقاطعي — first row only, «المزيد» opens ~3 rows (scrolls inside). A select mode to mark
// ⭐ favourite, move up/down, ✅ mastered / 🟡 needs review, put in sections, hide or delete.
// The choices are one small JSON per learner (saved only when something changes).
import { api } from './api.js';
import { state } from './state.js';
import { esc, toast, thumbHtml, relDate, fmtTime } from './ui.js';

const P0 = { fav: [], order: [], hidden: [], mark: {}, sec: {} };
const lsKey = () => `vidprefs.${state.user?.id || 'me'}`;

export function bindMyVideos(box, list) {
  let P = { ...P0 };
  try { P = { ...P0, ...JSON.parse(localStorage.getItem(lsKey()) || '{}') }; } catch { /* none */ }
  let open = false;
  let picking = false;
  let tab = ''; // '' all · section name · '__hidden'
  const sel = new Set();
  const save = () => {
    try { localStorage.setItem(lsKey(), JSON.stringify(P)); } catch { /* ignore */ }
    api.saveVidPrefs(P).catch(() => {});
  };
  api.vidPrefs().then((r) => { if (r?.prefs) { P = { ...P0, ...r.prefs }; try { localStorage.setItem(lsKey(), JSON.stringify(P)); } catch { /* ignore */ } draw(); } }).catch(() => {});

  const sorted = () => {
    const pos = new Map(P.order.map((id, i) => [id, i]));
    return [...list].sort((a, b) => (P.fav.includes(b.id) - P.fav.includes(a.id))
      || ((pos.get(a.id) ?? 1e9) - (pos.get(b.id) ?? 1e9))
      || String(b.analyzed_at).localeCompare(String(a.analyzed_at)));
  };
  const shown = () => sorted().filter((s) => (tab === '__hidden' ? P.hidden.includes(s.id) : !P.hidden.includes(s.id) && (!tab || P.sec[s.id] === tab)));
  const sections = () => [...new Set(Object.values(P.sec).filter(Boolean))];

  function draw() {
    if (!list.length) { box.innerHTML = ''; return; }
    const items = shown();
    const secs = sections();
    box.innerHTML = `<div class="section-title row between wrap" style="gap:8px"><h2>🎬 مقاطعي <span class="tiny muted en-inline">(${list.length})</span></h2>
        <button type="button" class="btn sm ${picking ? 'primary' : 'ghost'}" data-mv="pick">${picking ? '✓ تم' : '☑ تحديد'}</button></div>
      ${secs.length || P.hidden.length ? `<div class="chip-row">${[['', 'الكل'], ...secs.map((x) => [x, `📁 ${x}`]), ...(P.hidden.length ? [['__hidden', `🙈 المخفية (${P.hidden.length})`]] : [])].map(([k, l]) => `<button type="button" class="gchip ${tab === k ? 'on' : ''}" data-tab="${esc(k)}">${esc(l)}</button>`).join('')}</div>` : ''}
      ${picking ? `<div class="mv-bar"><span class="tiny">${sel.size} محدد</span>
        <button data-mv="fav">⭐</button><button data-mv="up">⬆️</button><button data-mv="down">⬇️</button><button data-mv="ok">✅ أتقنته</button><button data-mv="review">🟡 مراجعة</button><button data-mv="clear">↺</button>
        <button data-mv="sec">📁 قسم</button><button data-mv="hide">${tab === '__hidden' ? '👁 إظهار' : '🙈 إخفاء'}</button><button data-mv="del" class="bad">🗑</button></div>` : ''}
      <div class="mv-wrap ${open ? 'open' : ''}"><div class="grid cols-3 mv-grid">${items.map((s) => `
        <a class="video-mini mv ${sel.has(s.id) ? 'sel' : ''} mark-${P.mark[s.id] || 'none'}" href="#/source/${s.id}" data-id="${s.id}">${thumbHtml(s, { duration: s.duration_seconds })}
          <div style="min-width:0"><div class="en small clamp2" style="font-weight:600">${P.fav.includes(s.id) ? '⭐ ' : ''}${P.mark[s.id] === 'ok' ? '✅ ' : P.mark[s.id] === 'review' ? '🟡 ' : ''}${esc(s.title)}</div>
          <div class="tiny muted">${s.saved_count} محفوظة من ${s.item_count} · ${esc(relDate(s.analyzed_at))}${s.progress_seconds > 5 ? ` · <span class="resume-chip">▶ ${fmtTime(s.progress_seconds)}</span>` : ''}${P.sec[s.id] ? ` · 📁 ${esc(P.sec[s.id])}` : ''}</div></div></a>`).join('')}</div></div>
      ${items.length > 1 ? `<button type="button" class="link-btn mv-more" data-mv="more">${open ? 'أقل ▴' : `المزيد ▾ (${items.length})`}</button>` : ''}`;
    // collapsed: the first row only; open: about three rows, scrolling inside
    requestAnimationFrame(() => {
      const wrap = box.querySelector('.mv-wrap');
      const first = box.querySelector('.mv');
      if (!wrap || !first) return;
      const h = first.offsetHeight + 12;
      wrap.style.maxHeight = `${open ? h * 3 : h}px`;
    });
  }

  const act = async (k) => {
    const ids = [...sel];
    if (k === 'pick') { picking = !picking; sel.clear(); return draw(); }
    if (k === 'more') { open = !open; return draw(); }
    if (!ids.length) return toast('اختر مقطعًا أولًا');
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
    if (k === 'sec') {
      const name = prompt('اسم القسم (مثل: تحفيز، بودكاست) — اتركه فارغًا لإزالة القسم', sections()[0] || '');
      if (name === null) return undefined;
      ids.forEach((i) => { if (name.trim()) P.sec[i] = name.trim().slice(0, 30); else delete P.sec[i]; });
    }
    if (k === 'hide') P.hidden = tab === '__hidden' ? P.hidden.filter((i) => !ids.includes(i)) : [...new Set([...P.hidden, ...ids])];
    if (k === 'del') {
      if (!confirm(`حذف ${ids.length} مقطع نهائيًا؟ الكلمات المحفوظة تبقى في «كلماتي».`)) return undefined;
      for (const i of ids) { try { await api.deleteSource(i); } catch (err) { toast(err.message); } }
      list = list.filter((s) => !ids.includes(s.id));
    }
    sel.clear();
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
  return { update: (next) => { list = next; draw(); } };
}
