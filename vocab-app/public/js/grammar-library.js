// 📚 «كلماتي › القواعد»: the learner's grammar library, always in the fixed tree
//   30 categories → their sub-rules → the examples saved from videos.
// Filters work together: category, sub-rule, learning status, video, search (rule names or
// examples), and sorting (recent · most met · progress). Nothing is ever shown unclassified.
import { api } from './api.js';
import { esc, toast, emptyState } from './ui.js';
import { GRAMMAR, subInfo } from './shared/grammar-catalog.js';

const STATUS = [['new', 'ما تعلمتها', '⚪'], ['learning', 'أتعلمها', '🟡'], ['mastered', 'أتقنتها', '🟢']];
const STATUS_AR = Object.fromEntries(STATUS.map(([k, l, i]) => [k, `${i} ${l}`]));
const fmtT = (t) => (t == null ? '' : `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`);
const norm = (s) => String(s || '').toLowerCase().replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي');

export function libTabs(active) {
  return `<div class="lib-tabs segmented" role="tablist">
    <a href="#/words" role="tab" class="${active === 'words' ? 'active' : ''}">🔤 الكلمات</a>
    <a href="#/words?tab=grammar" role="tab" class="${active === 'grammar' ? 'active' : ''}">📚 القواعد</a></div>`;
}

export async function render(view, { params = {} } = {}) {
  let lib = { subs: {} };
  try { lib = await api.grammar(); } catch (err) { toast(err.message); }
  const f = { cat: '', sub: '', status: '', source: '', q: '', sort: 'recent', show: 'tree' };
  const want = subInfo(params.sub || '') ? params.sub : '';
  const open = new Set(want ? [subInfo(want).cat.id] : []);
  const openSub = new Set(want ? [want] : []);
  let filtersOpen = false;

  const E = (id) => lib.subs[id] || { status: 'new', seen: 0, examples: [] };
  const sources = () => {
    const m = new Map();
    Object.values(lib.subs).forEach((e) => (e.examples || []).forEach((x) => { if (x.source_id) m.set(String(x.source_id), x.title || `مقطع ${x.source_id}`); }));
    return [...m.entries()];
  };
  const totalEx = () => Object.values(lib.subs).reduce((a, e) => a + (e.examples?.length || 0), 0);

  view.innerHTML = `
    <div class="page-head compact"><div><h1>القواعد</h1><p id="gSummary"></p></div></div>
    ${libTabs('grammar')}
    <div class="g-lib-bar">
      <div class="words-search g-search"><input class="input" id="gQ" type="search" placeholder="ابحث باسم القاعدة (عربي/إنجليزي) أو داخل الأمثلة…"></div>
      <button type="button" class="btn" id="gFiltersBtn" aria-expanded="false">⚙︎ فلاتر <b id="gFcount"></b></button>
    </div>
    <div class="g-filters hidden" id="gFilters"></div>
    <div class="segmented g-show" id="gShow"><button data-show="tree" class="active">🗂 التصنيفات</button><button data-show="examples">🔖 الأمثلة المحفوظة</button></div>
    <div id="gList"></div>`;
  const $ = (s) => view.querySelector(s);

  const subMatches = (cat, sub) => {
    const e = E(sub.id);
    if (f.cat && cat.id !== f.cat) return false;
    if (f.sub && sub.id !== f.sub) return false;
    if (f.status && e.status !== f.status) return false;
    if (f.source && !(e.examples || []).some((x) => String(x.source_id) === f.source)) return false;
    return true;
  };
  const exMatches = (x) => (!f.source || String(x.source_id) === f.source);
  const qMatch = (cat, sub) => {
    const q = norm(f.q.trim());
    if (!q) return { name: true, ex: null };
    const name = norm(`${cat.ar} ${cat.en} ${sub.ar} ${sub.en}`).includes(q);
    const ex = (E(sub.id).examples || []).filter((x) => norm(`${x.en} ${x.ar} ${x.title}`).includes(q));
    return { name, ex };
  };
  const progressOf = (sub) => ({ new: 0, learning: 1, mastered: 2 }[E(sub.id).status] ?? 0);
  const lastAt = (sub) => (E(sub.id).examples?.[0]?.at || '');
  const sorter = (a, b) => {
    if (f.sort === 'seen') return (E(b.id).seen || 0) - (E(a.id).seen || 0) || (E(b.id).examples?.length || 0) - (E(a.id).examples?.length || 0);
    if (f.sort === 'progress') return progressOf(b) - progressOf(a) || lastAt(b).localeCompare(lastAt(a));
    return lastAt(b).localeCompare(lastAt(a));
  };
  const anyFilter = () => f.cat || f.sub || f.status || f.source || f.q.trim();

  function drawFilters() {
    const subsOf = f.cat ? GRAMMAR.find((c) => c.id === f.cat).subs : GRAMMAR.flatMap((c) => c.subs);
    const opt = (v, l, cur) => `<option value="${esc(v)}"${v === cur ? ' selected' : ''}>${esc(l)}</option>`;
    $('#gFilters').innerHTML = `
      <label><span>التصنيف الرئيسي</span><select class="input" id="fCat">${opt('', 'الكل', f.cat)}${GRAMMAR.map((c) => opt(c.id, `${c.n}. ${c.ar}`, f.cat)).join('')}</select></label>
      <label><span>القاعدة الفرعية</span><select class="input" id="fSub">${opt('', 'الكل', f.sub)}${subsOf.map((s) => opt(s.id, s.ar, f.sub)).join('')}</select></label>
      <label><span>حالة التعلم</span><select class="input" id="fStatus">${opt('', 'الكل', f.status)}${STATUS.map(([k, l, i]) => opt(k, `${i} ${l}`, f.status)).join('')}</select></label>
      <label><span>المقطع</span><select class="input" id="fSource">${opt('', 'كل المقاطع', f.source)}${sources().map(([id, t]) => opt(id, t.length > 50 ? `${t.slice(0, 50)}…` : t, f.source)).join('')}</select></label>
      <label><span>الترتيب</span><select class="input" id="fSort">${opt('recent', 'الأحدث حفظًا', f.sort)}${opt('seen', 'الأكثر تكرارًا', f.sort)}${opt('progress', 'حسب التقدّم', f.sort)}</select></label>
      ${anyFilter() ? '<button type="button" class="btn sm ghost" id="fReset">↺ مسح الفلاتر</button>' : ''}`;
    const n = [f.cat, f.sub, f.status, f.source].filter(Boolean).length;
    $('#gFcount').textContent = n ? `(${n})` : '';
  }

  const ruleCard = (sub, cat) => {
    const ex = [['✅', 'جملة', sub.ex.pos], ['❌', 'نفي', sub.ex.neg], ['❓', 'سؤال', sub.ex.q]].filter(([, , e]) => e && e[0] !== '—');
    return `<div class="g-rule">
      <div class="g-box"><b>🧩 التكوين</b><p>${esc(sub.form)}</p></div>
      <div class="g-box"><b>💡 وش تفيد</b><p>${esc(sub.use)}</p></div>
      <div class="g-exs">${ex.map(([i, l, [en, ar]]) => `<div class="g-ex"><span class="g-ex-k">${i} ${l}</span><p class="en" dir="ltr">${esc(en)}</p><p class="tiny muted">${esc(ar)}</p></div>`).join('')}</div>
    </div>`;
  };
  const exampleHtml = (x, subId) => `<li class="g-saved">
      <p class="en" dir="ltr">${esc(x.en)}</p>${x.ar ? `<p class="tiny muted">${esc(x.ar)}</p>` : ''}
      <div class="g-saved-meta tiny">
        ${x.source_id ? `<a href="#/source/${x.source_id}${x.t != null ? `?t=${x.t}` : ''}">🎬 ${esc(x.title || 'المقطع')}${x.t != null ? ` · <span class="en-inline">${fmtT(x.t)}</span>` : ''}</a>` : ''}
        ${x.url ? `<a href="${esc(x.url)}" target="_blank" rel="noopener" class="muted">يوتيوب ↗</a>` : ''}
        <span class="muted">${new Date(x.at).toLocaleDateString('ar')}</span>
        <button type="button" class="btn icon sm ghost g-del" data-gdel="${esc(x.id)}" data-gsub="${esc(subId)}" title="حذف المثال" aria-label="حذف المثال">🗑</button>
      </div></li>`;

  function drawTree() {
    const cats = GRAMMAR.map((cat) => {
      const subs = cat.subs.map((sub) => ({ sub, q: qMatch(cat, sub) }))
        .filter(({ sub, q }) => subMatches(cat, sub) && (!f.q.trim() || q.name || q.ex.length))
        .sort((a, b) => sorter(a.sub, b.sub));
      return { cat, subs };
    }).filter(({ subs, cat }) => subs.length || (!anyFilter() && cat));
    if (!cats.some((c) => c.subs.length)) return emptyState('🔎', 'ما فيه نتائج', 'جرّب فلتر ثاني أو امسح البحث.');
    return `<div class="g-tree">${cats.map(({ cat, subs }) => {
      const n = cat.subs.reduce((a, s) => a + (E(s.id).examples?.length || 0), 0);
      const isOpen = open.has(cat.id) || !!anyFilter();
      return `<details class="g-cat${n ? '' : ' g-none'}" data-gcat="${cat.id}" data-ghue="${cat.hue}"${isOpen ? ' open' : ''}>
        <summary><span class="g-cat-n">${cat.n}</span><span class="g-cat-t"><b>${esc(cat.ar)}</b><span class="en tiny muted">${esc(cat.en)}</span></span><span class="g-count${n ? '' : ' zero'}">${n}</span></summary>
        <div class="g-subs">${subs.map(({ sub, q }) => {
          const e = E(sub.id);
          const exs = (q.ex ?? (e.examples || [])).filter(exMatches);
          const subOpen = openSub.has(sub.id);
          return `<details class="g-sub${exs.length ? '' : ' g-none'}" data-gs="${sub.id}"${subOpen ? ' open' : ''}>
            <summary><span class="g-sub-t"><b>${esc(sub.ar)}</b><span class="en tiny muted">${esc(sub.en)}</span></span><span class="g-st g-st-${e.status}" title="${STATUS_AR[e.status]}">${STATUS_AR[e.status].split(' ')[0]}</span><span class="g-count${exs.length ? '' : ' zero'}">${exs.length}</span></summary>
            <div class="g-sub-body">
              <div class="segmented g-status" data-gsub="${sub.id}">${STATUS.map(([k, l, i]) => `<button type="button" data-gst="${k}" class="${e.status === k ? 'active' : ''}">${i} ${l}</button>`).join('')}</div>
              ${ruleCard(sub, cat)}
              <h4 class="g-saved-h">🔖 الأمثلة المحفوظة (${exs.length})${e.seen ? ` <span class="tiny muted">· صادفتها ${e.seen} مرة</span>` : ''}</h4>
              ${exs.length ? `<ul class="g-saved-list">${exs.map((x) => exampleHtml(x, sub.id)).join('')}</ul>` : '<p class="g-empty tiny muted">ما فيه أمثلة محفوظة بعد — شغّل «📚 وضع القواعد» من ⚙ داخل أي مقطع، واضغط اسم القاعدة فوق السطر ثم «احفظ المثال».</p>'}
            </div></details>`;
        }).join('') || '<p class="g-empty tiny muted">ما فيه قواعد تطابق الفلاتر هنا.</p>'}</div></details>`;
    }).join('')}</div>`;
  }

  function drawExamples() {
    // every saved example, still under its category › sub-rule
    const rows = [];
    GRAMMAR.forEach((cat) => cat.subs.forEach((sub) => {
      if (!subMatches(cat, sub)) return;
      const q = qMatch(cat, sub);
      if (f.q.trim() && !q.name && !q.ex.length) return;
      (q.ex ?? E(sub.id).examples ?? []).filter(exMatches).forEach((x) => rows.push({ x, sub, cat }));
    }));
    if (!rows.length) return emptyState('🔖', 'ما فيه أمثلة محفوظة', 'شغّل «📚 وضع القواعد» من ⚙ داخل أي مقطع، واضغط اسم القاعدة فوق السطر ثم «احفظ المثال».');
    if (f.sort === 'seen') rows.sort((a, b) => (E(b.sub.id).seen || 0) - (E(a.sub.id).seen || 0));
    else if (f.sort === 'progress') rows.sort((a, b) => progressOf(b.sub) - progressOf(a.sub) || b.x.at.localeCompare(a.x.at));
    else rows.sort((a, b) => b.x.at.localeCompare(a.x.at));
    return `<ul class="g-saved-list g-all">${rows.map(({ x, sub, cat }) => `<li class="g-saved-wrap" data-ghue="${cat.hue}"><div class="g-path tiny"><button type="button" class="g-path-btn" data-gopen="${sub.id}">${esc(cat.ar)} › <b>${esc(sub.ar)}</b></button></div>${exampleHtml(x, sub.id).replace(/^<li class="g-saved">|<\/li>$/g, '')}</li>`).join('')}</ul>`;
  }

  function draw() {
    const n = totalEx();
    const learnt = Object.values(lib.subs).filter((e) => e.status === 'mastered').length;
    $('#gSummary').textContent = n ? `${n} مثال محفوظ · ${learnt} قاعدة أتقنتها من ${GRAMMAR.reduce((a, c) => a + c.subs.length, 0)}` : '٣٠ قاعدة مرتبة — أمثلتك من المقاطع تنحفظ تحت قاعدتها تلقائيًا';
    drawFilters();
    $('#gShow').querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.show === f.show));
    $('#gList').innerHTML = f.show === 'examples' ? drawExamples() : drawTree();
  }

  $('#gQ').addEventListener('input', (e) => { f.q = e.target.value; draw(); });
  $('#gFiltersBtn').addEventListener('click', () => {
    filtersOpen = !filtersOpen;
    $('#gFilters').classList.toggle('hidden', !filtersOpen);
    $('#gFiltersBtn').setAttribute('aria-expanded', String(filtersOpen));
  });
  $('#gFilters').addEventListener('change', (e) => {
    const id = e.target.id;
    if (id === 'fCat') { f.cat = e.target.value; if (f.sub && subInfo(f.sub)?.cat.id !== f.cat) f.sub = ''; }
    if (id === 'fSub') { f.sub = e.target.value; if (f.sub) f.cat = subInfo(f.sub).cat.id; }
    if (id === 'fStatus') f.status = e.target.value;
    if (id === 'fSource') f.source = e.target.value;
    if (id === 'fSort') f.sort = e.target.value;
    draw();
  });
  $('#gFilters').addEventListener('click', (e) => {
    if (e.target.id !== 'fReset') return;
    Object.assign(f, { cat: '', sub: '', status: '', source: '', q: '' });
    $('#gQ').value = '';
    draw();
  });
  $('#gShow').addEventListener('click', (e) => {
    const b = e.target.closest('[data-show]');
    if (!b) return;
    f.show = b.dataset.show;
    draw();
  });
  // remember which branches are open while filtering / redrawing
  $('#gList').addEventListener('toggle', (e) => {
    const d = e.target;
    if (d.dataset.gcat) (d.open ? open.add(d.dataset.gcat) : open.delete(d.dataset.gcat));
    if (d.dataset.gs) (d.open ? openSub.add(d.dataset.gs) : openSub.delete(d.dataset.gs));
  }, true);
  $('#gList').addEventListener('click', async (e) => {
    const st = e.target.closest('[data-gst]');
    if (st) {
      const sub = st.closest('[data-gsub]').dataset.gsub;
      const status = st.dataset.gst;
      try {
        await api.grammarStatus(sub, status);
        (lib.subs[sub] ||= { status: 'new', seen: 0, examples: [] }).status = status;
        openSub.add(sub);
        draw();
      } catch (err) { toast(err.message); }
      return;
    }
    const del = e.target.closest('[data-gdel]');
    if (del) {
      const { gsub, gdel } = del.dataset;
      try {
        await api.grammarDrop(gsub, gdel);
        if (lib.subs[gsub]) lib.subs[gsub].examples = lib.subs[gsub].examples.filter((x) => x.id !== gdel);
        openSub.add(gsub);
        draw();
        toast('انحذف المثال');
      } catch (err) { toast(err.message); }
      return;
    }
    const go = e.target.closest('[data-gopen]');
    if (go) {
      const id = go.dataset.gopen;
      f.show = 'tree';
      open.add(subInfo(id).cat.id);
      openSub.add(id);
      draw();
      view.querySelector(`[data-gs="${id}"]`)?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }
  });

  draw();
  if (want) setTimeout(() => view.querySelector(`[data-gs="${want}"]`)?.scrollIntoView({ block: 'start' }), 50);
}
