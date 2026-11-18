// 📄 نصوص — every pasted text: 3 lines visible, tap to open it. Inside: the text, or its extracted words
// (new ones ticked → save them fast; a tap on a word opens its details). Both stay in a 3-line box that scrolls.
import { api } from './api.js';
import { esc, toast, relDate } from './ui.js';
import { openWordPanel } from './components.js';

export function bindMyTexts(box, list, { isFav, toggleFav } = {}) {
  let texts = list;
  let favOnly = false;
  const open = new Set();
  const mode = new Map(); // id -> 'text' | 'words'
  const data = new Map(); // id -> { source, lines, items } | 'loading' | 'error'
  const ticked = new Map(); // id -> Set of vocabulary_id
  const busy = new Set();
  const settling = new Set(); // texts whose words are being moved to their simplest form

  const isOld = (it) => it.user_state === 'saved' || it.user_state === 'dismissed';
  const newOnes = (id) => (data.get(id)?.items || []).filter((it) => !isOld(it));

  function bodyHtml(s) {
    const d = data.get(s.id);
    if (d === 'loading' || !d) return '<p class="tiny muted"><span class="spinner"></span> نجهّز النص…</p>';
    if (d === 'error') return '<p class="tiny muted">تعذّر فتح النص — جرّب مرة ثانية.</p>';
    const m = mode.get(s.id) || 'text';
    const fresh = newOnes(s.id);
    const seg = `<div class="segmented tx-seg"><button type="button" data-tx="text" data-id="${s.id}" class="${m === 'text' ? 'active' : ''}">📄 النص</button><button type="button" data-tx="words" data-id="${s.id}" class="${m === 'words' ? 'active' : ''}">🔤 الكلمات المستخرجة (${d.items.length})</button></div>`;
    if (m === 'text') {
      return `${seg}<div class="tx-box en" dir="auto">${esc(d.lines.map((l) => l.text).join(' '))}</div>
        <div class="row between wrap" style="margin-top:8px;gap:8px"><a class="btn sm ghost" href="#/source/${s.id}">📖 اقرأه كامل</a><button type="button" class="btn sm ghost bad" data-tx="del" data-id="${s.id}">🗑</button></div>`;
    }
    const set = ticked.get(s.id) || new Set();
    const chips = [...d.items].sort((a, b) => isOld(a) - isOld(b)).map((it) => { // new words first
      const old = isOld(it);
      return `<span class="tx-chip ${old ? 'old' : ''}">${old ? '' : `<input type="checkbox" class="check" data-tx="tick" data-id="${s.id}" data-v="${it.vocabulary_id}" aria-label="تحديد" ${set.has(it.vocabulary_id) ? 'checked' : ''}>`}<button type="button" class="tx-w en" data-tx="word" data-id="${s.id}" data-v="${it.vocabulary_id}" data-l="${it.line_id || ''}">${esc(it.term)}</button>${old ? '<span class="tiny muted">موجودة عندك ✓</span>' : '<span class="chip st-new">جديد</span>'}</span>`;
    }).join('');
    return `${seg}
      <div class="tx-box words">${chips || '<span class="tiny muted">ما لقينا كلمات في هذا النص.</span>'}</div>
      ${settling.has(s.id) ? '<p class="tiny muted" style="margin:6px 0 0"><span class="spinner"></span> نرتّب الكلمات بأبسط صيغة…</p>' : ''}
      ${fresh.length ? `<div class="row between wrap" style="margin-top:8px;gap:8px">
        <button type="button" class="btn sm ghost" data-tx="all" data-id="${s.id}">${set.size === fresh.length ? '☐ ألغِ التحديد' : `☑ حدّد كل الجديد (${fresh.length})`}</button>
        <button type="button" class="btn primary sm" data-tx="save" data-id="${s.id}" ${set.size && !busy.has(s.id) ? '' : 'disabled'}>🔖 حفظ المحدد (${set.size})</button></div>` : ''}`;
  }

  function draw() {
    const shown = favOnly ? texts.filter((s) => isFav?.(s.id)) : texts;
    if (!shown.length) {
      box.innerHTML = `<p class="tiny muted" style="text-align:center;margin:10px 0">${favOnly ? 'ما عندك نصوص مفضلة — اضغط ⭐ على أي نص.' : 'ما عندك نصوص بعد — الصق نصًا إنجليزيًا في المربع فوق وبينحفظ هنا.'}</p>`;
      return;
    }
    // keep each 3-line box where the learner scrolled it (ticking a word redraws the card)
    const keep = new Map([...box.querySelectorAll('[data-card]')].map((c) => [c.dataset.card, c.querySelector('.tx-box')?.scrollTop || 0]));
    box.innerHTML = `${shown.map((s) => `<div class="card tx-card" data-card="${s.id}">
        <div class="tx-top"><button type="button" class="tx-head" data-tx="toggle" data-id="${s.id}" aria-expanded="${open.has(s.id)}">
          <b class="en" dir="auto">${esc(s.title)}</b><span class="tiny muted">${esc(relDate(s.analyzed_at))}</span><span aria-hidden="true">${open.has(s.id) ? '▴' : '▾'}</span></button>
          <button type="button" class="tx-star${isFav?.(s.id) ? ' on' : ''}" data-tx="fav" data-id="${s.id}" aria-pressed="${Boolean(isFav?.(s.id))}" title="${isFav?.(s.id) ? 'إزالة من المفضلة' : 'أضف للمفضلة'}">${isFav?.(s.id) ? '★' : '☆'}</button></div>
        ${open.has(s.id) ? bodyHtml(s) : `<p class="tx-prev en small ink-2" dir="auto">${esc(s.preview || '')}</p>`}
      </div>`).join('')}`;
    box.querySelectorAll('[data-card]').forEach((c) => {
      const tb = c.querySelector('.tx-box');
      if (tb) tb.scrollTop = keep.get(c.dataset.card) || 0;
    });
  }

  // the words move to their simplest form once per text (the same step the reader runs), then the card refreshes
  async function settle(id) {
    const d = data.get(id);
    if (!d || d === 'loading' || d === 'error' || d.source.is_demo || settling.has(id)) return;
    if (String(d.source.dict_words_at || '').startsWith('v2:') && d.source.simplified) return;
    settling.add(id);
    draw();
    try {
      let changed = 0;
      for (let i = 0; box.isConnected && i < 8; i++) {
        const r = await api.dictionaryWords(id);
        changed += (r.added || 0) + (r.simplified || 0);
        if (!r.more) break;
      }
      if (changed) await load(id, true);
    } catch { /* the words stay as they are */ }
    settling.delete(id);
    if (box.isConnected) draw();
  }

  async function load(id, again = false) {
    if (!again) { data.set(id, 'loading'); draw(); }
    try {
      const r = await api.source(id);
      data.set(id, { source: r.source, lines: r.lines, items: r.items });
      ticked.set(id, new Set(r.items.filter((it) => !isOld(it)).map((it) => it.vocabulary_id)));
    } catch {
      data.set(id, 'error');
    }
    if (box.isConnected) draw();
    if (!again) settle(id);
  }

  box.onclick = async (e) => {
    const b = e.target.closest('[data-tx]');
    if (!b) return;
    const id = Number(b.dataset.id);
    const k = b.dataset.tx;
    if (k === 'tick') {
      const set = ticked.get(id) || new Set();
      const v = Number(b.dataset.v);
      if (b.checked) set.add(v); else set.delete(v);
      ticked.set(id, set);
      draw();
      return;
    }
    if (k === 'fav') { toggleFav?.(id); draw(); return; }
    if (k === 'toggle') {
      if (open.has(id)) open.delete(id); else { open.add(id); if (!data.has(id)) load(id); }
      draw();
      return;
    }
    if (k === 'text' || k === 'words') { mode.set(id, k); draw(); return; }
    if (k === 'all') {
      const fresh = newOnes(id);
      const set = ticked.get(id) || new Set();
      ticked.set(id, set.size === fresh.length ? new Set() : new Set(fresh.map((it) => it.vocabulary_id)));
      draw();
      return;
    }
    if (k === 'word') {
      openWordPanel(b, { vocabulary_id: b.dataset.v, line_id: b.dataset.l || undefined }, {
        onChange: () => load(id, true),
      });
      return;
    }
    if (k === 'save') {
      const d = data.get(id);
      const set = ticked.get(id) || new Set();
      const chosen = d.items.filter((it) => set.has(it.vocabulary_id) && !isOld(it));
      if (!chosen.length || busy.has(id)) return;
      busy.add(id);
      draw();
      try {
        const r = await api.saveWordsBulk(chosen.map((it) => ({ vocabulary_id: it.vocabulary_id, occurrence_id: it.occurrence_id })));
        chosen.forEach((it) => { it.user_state = 'saved'; });
        ticked.set(id, new Set());
        toast(`حُفظت ${r.saved ?? chosen.length} كلمة في «كلماتي» ✓`);
        api.simplifyWords().catch(() => {}); // saved in the simplest form
      } catch (err) {
        toast(err.message);
      }
      busy.delete(id);
      draw();
      return;
    }
    if (k === 'del') {
      if (!confirm('حذف هذا النص نهائيًا؟ الكلمات المحفوظة تبقى في «كلماتي».')) return;
      try { await api.deleteSource(id); } catch (err) { toast(err.message); return; }
      texts = texts.filter((s) => s.id !== id);
      open.delete(id);
      draw();
    }
  };
  draw();
  return { update: (next) => { texts = next; draw(); }, redraw: draw, setFavOnly: (on) => { favOnly = on; draw(); } };
}
