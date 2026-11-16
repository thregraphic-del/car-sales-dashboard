// 📚 «وضع القواعد» in the reader: instead of the words, each line shows the grammar it uses —
// a small Arabic label above the line (e.g. «الماضي البسيط»), the key words underlined.
// A tap on the label opens the rule: how it is built, what it is for, a sentence / negative /
// question, the line from the video, and «احفظ المثال» → the learner's grammar library.
// Spotting: patterns first (free, instant); lines they cannot place go to the AI once,
// 40 lines at a time and only around where the learner is (cached for everyone on the server,
// and on this device).
import { api } from './api.js';
import { esc, toast, openModal, closeModal } from './ui.js';
import { GRAMMAR, subInfo } from './shared/grammar-catalog.js';
import { detectGrammar, findPhrase, setCategories } from './shared/grammar-detect.js';
import { wordIndexByChar } from './shared/sync.js';

setCategories(GRAMMAR);
const BATCH = 40;
const MAX_TAGS = 2;

export function attachGrammar({ linesEl, getLines, source, isPlaying, pause, play }) {
  let on = false;
  let lastLines = null;
  let byIdMap = new Map();
  const byId = { get: (k) => { const ls = getLines(); if (ls !== lastLines) { lastLines = ls; byIdMap = new Map(ls.map((l, i) => [String(l.id), { line: l, i }])); local.clear(); } return byIdMap.get(String(k)); } };
  const local = new Map(); // line id → hits from the patterns
  const storeKey = `gram.ai.${source.id}`;
  let ai = { b: [], r: {} };
  try { ai = { b: [], r: {}, ...JSON.parse(localStorage.getItem(storeKey) || '{}') }; } catch { /* ignore */ }
  const asking = new Set();
  const keep = () => { try { localStorage.setItem(storeKey, JSON.stringify(ai)); } catch { /* ignore */ } };

  const localHits = (line) => {
    const k = String(line.id);
    if (!local.has(k)) local.set(k, detectGrammar(line.text));
    return local.get(k);
  };
  const hitsFor = (line) => {
    const own = localHits(line).filter((h) => h.p >= 1);
    const fromAi = (ai.r[line.id] || []).map((x) => ({ sub: x.sub, p: 2.5, ...(findPhrase(line.text, x.phrase) || { start: -1, end: -1 }) }));
    const all = [...own.filter((h) => h.p >= 3), ...fromAi, ...own.filter((h) => h.p < 3)];
    const seen = new Set();
    return all.filter((h) => subInfo(h.sub) && !seen.has(h.sub) && seen.add(h.sub)).slice(0, MAX_TAGS);
  };

  const clear = (el) => {
    el.querySelectorAll('.g-tags').forEach((x) => x.remove());
    el.querySelectorAll('.g-key').forEach((x) => x.classList.remove('g-key'));
    el.classList.remove('g-line');
    el.style.removeProperty('--g');
  };
  const decorate = (el) => {
    if (!el?.classList?.contains('line')) return;
    clear(el);
    if (!on) return;
    const rec = byId.get(el.dataset.id);
    if (!rec) return;
    const hits = hitsFor(rec.line);
    if (!hits.length) return;
    const first = subInfo(hits[0].sub);
    el.classList.add('g-line');
    el.dataset.ghue = first.cat.hue;
    const tags = document.createElement('div');
    tags.className = 'g-tags';
    tags.innerHTML = hits.map((h) => {
      const { sub, cat } = subInfo(h.sub);
      return `<button type="button" class="g-chip" data-gsub="${esc(h.sub)}" data-ghue="${cat.hue}" title="${esc(cat.ar)} › ${esc(sub.ar)}">${esc(sub.ar)}</button>`;
    }).join('');
    const body = el.querySelector('.line-body');
    (body || el).prepend(tags);
    // the words that make the first rule
    const h = hits.find((x) => x.start >= 0);
    if (h) {
      const map = wordIndexByChar(rec.line.text);
      const w0 = map[h.start];
      let w1 = map[Math.max(h.start, h.end - 1)];
      if (w1 < 0) w1 = w0;
      if (w0 >= 0) for (let w = w0; w <= w1; w += 1) el.querySelectorAll(`[data-wi="${w}"]`).forEach((x) => x.classList.add('g-key'));
    }
  };
  const decorateAll = () => linesEl.querySelectorAll('.line').forEach(decorate);

  // the reader redraws lines (new translation, a saved word…): label them again
  const mo = new MutationObserver((list) => {
    if (!on) return;
    for (const m of list) m.addedNodes.forEach((n) => (n.nodeType === 1 && n.classList.contains('line') ? decorate(n) : null));
  });
  mo.observe(linesEl, { childList: true });

  // 🤖 the 40 lines around a line: ask the AI about the ones the patterns could not place
  async function near(lineId) {
    if (!on || source.is_demo) return;
    const rec = byId.get(String(lineId));
    if (!rec) return;
    const b = Math.floor(rec.i / BATCH);
    if (ai.b.includes(b) || asking.has(b)) return;
    const lines = getLines().slice(b * BATCH, (b + 1) * BATCH)
      .filter((l) => l.text && l.text.split(/\s+/).length >= 3 && !localHits(l).some((x) => x.p >= 2));
    if (!lines.length) { ai.b.push(b); keep(); return; }
    asking.add(b);
    try {
      const idx = new Map(lines.map((l, k) => [k, l]));
      const res = await api.grammarDetect(lines.map((l, k) => ({ i: k, text: l.text })));
      if (res.ai === false) return; // AI unavailable now: try again another time
      for (const it of res.items || []) {
        const l = idx.get(it.i);
        if (!l) continue;
        (ai.r[l.id] ||= []).push({ sub: it.sub, phrase: it.phrase });
      }
      ai.b.push(b);
      keep();
      lines.forEach((l) => decorate(linesEl.querySelector(`.line[data-id="${l.id}"]`)));
    } catch { /* quiet: the patterns still work */ } finally {
      asking.delete(b);
    }
  }
  let scrollT = 0;
  linesEl.addEventListener('scroll', () => {
    if (!on) return;
    clearTimeout(scrollT);
    scrollT = setTimeout(() => {
      const top = linesEl.getBoundingClientRect().top;
      const first = [...linesEl.querySelectorAll('.line')].find((el) => el.getBoundingClientRect().bottom > top + 10);
      if (first) near(first.dataset.id);
    }, 700);
  }, { passive: true });

  // the rule card
  linesEl.addEventListener('click', (e) => {
    const chip = e.target.closest?.('.g-chip');
    if (!chip) return;
    e.stopPropagation();
    e.preventDefault();
    const lineEl = chip.closest('.line');
    openRule(chip.dataset.gsub, byId.get(lineEl?.dataset.id)?.line);
  }, true);

  function openRule(subId, line) {
    const info = subInfo(subId);
    if (!info) return;
    const { sub, cat } = info;
    const wasPlaying = isPlaying();
    if (wasPlaying) pause();
    api.grammarSeen(subId).catch(() => {});
    const ex = [['✅', 'جملة', sub.ex.pos], ['❌', 'نفي', sub.ex.neg], ['❓', 'سؤال', sub.ex.q]]
      .filter(([, , e]) => e && e[0] !== '—')
      .map(([i, label, [en, ar]]) => `<div class="g-ex"><span class="g-ex-k">${i} ${label}</span><p class="en" dir="ltr">${esc(en)}</p><p class="tiny muted">${esc(ar)}</p></div>`).join('');
    const ar = line?.text_ar || (line?.align || []).map((x) => x[2]).filter(Boolean).join(' ') || '';
    const box = openModal(`
      <div class="g-pop" data-ghue="${cat.hue}">
        <div class="g-pop-cat">${cat.n}. ${esc(cat.ar)} <span class="en">· ${esc(cat.en)}</span></div>
        <h2>${esc(sub.ar)}</h2>
        <p class="g-pop-en en" dir="ltr">${esc(sub.en)}</p>
        <div class="g-box"><b>🧩 التكوين</b><p>${esc(sub.form)}</p></div>
        <div class="g-box"><b>💡 وش تفيد</b><p>${esc(sub.use)}</p></div>
        <div class="g-exs">${ex}</div>
        ${line ? `<div class="g-box g-here"><b>🎬 من المقطع</b><p class="en" dir="ltr">${esc(line.text)}</p>${ar ? `<p class="tiny muted">${esc(ar)}</p>` : ''}</div>` : ''}
        <div class="g-pop-act">
          ${line ? '<button type="button" class="btn primary" id="gSave">🔖 احفظ المثال</button>' : ''}
          <a class="btn" href="#/words?tab=grammar&sub=${esc(subId)}" id="gLib">📚 مكتبة القواعد</a>
        </div>
      </div>`, { onClose: () => { if (wasPlaying) play(); } });
    box.querySelector('#gLib')?.addEventListener('click', () => closeModal(true));
    box.querySelector('#gSave')?.addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      btn.disabled = true;
      try {
        const r = await api.grammarSave({ sub: subId, en: line.text, ar, source_id: source.id, t: line.start_seconds ?? null });
        btn.textContent = r.duplicate ? '✓ محفوظ من قبل' : '✓ انحفظ';
        toast(`انحفظ في القواعد › ${cat.ar} › ${sub.ar}`);
      } catch (err) {
        btn.disabled = false;
        toast(err.message || 'ما قدرنا نحفظ');
      }
    });
  }

  return {
    set(v) {
      on = !!v;
      linesEl.classList.toggle('g-mode', on);
      decorateAll();
      if (on) {
        const cur = linesEl.querySelector('.line.current') || linesEl.querySelector('.line');
        if (cur) near(cur.dataset.id);
      }
    },
    near,
    destroy() { mo.disconnect(); },
  };
}
