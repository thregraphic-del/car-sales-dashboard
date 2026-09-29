/* =====================================================================
   التطبيق: الحالة، الفلاتر، الحسابات، الأحداث، اللوحة الجانبية (Drawer)
   ===================================================================== */
(function () {
  'use strict';
  const D = window.DB, CH = window.CH, EX = window.EXPLAIN;
  const { num, sar, pct, esc } = CH;
  const DAY = D.DAY, TODAY = D.TODAY;

  const monthLabel = (mi) => D.MONTH_AR[D.MONTHS[mi].m] + ' ' + String(D.MONTHS[mi].y).slice(2);
  const LAST = D.MONTHS.length - 1;

  const DEFAULT_F = { period: '12m', from: LAST - 11, to: LAST, brand: '', vid: '', cat: '', body: '', year: '', branch: '', sp: '', ch: '', pay: '', deal: '', coll: '' };
  const S = {
    page: 'home',
    f: Object.assign({}, DEFAULT_F),
    ui: { trend: 'rev', spMetric: 'units', chMetric: 'leads', vehSort: 'units', vehSearch: '', vehBody: '', invTab: 'available', invSort: 'days', invView: 'bars', collTab: 'open', collSort: 'overdue', brandMetric: 'rev', glossQ: '', dict: {}, qaOpen: 'المبيعات' }
  };
  try { const p = localStorage.getItem('dealer-page'); if (p) S.page = p; } catch (e) { /* ignore */ }

  const PERIODS = [
    { id: '1m', ar: 'آخر شهر', n: 1 }, { id: '3m', ar: 'آخر 3 أشهر', n: 3 }, { id: '6m', ar: 'آخر 6 أشهر', n: 6 },
    { id: '12m', ar: 'آخر 12 شهراً', n: 12 }, { id: 'ytd', ar: 'منذ بداية 2026' }, { id: 'custom', ar: 'مخصص (من/إلى)' }
  ];
  function applyPeriod(id) {
    const f = S.f; f.period = id;
    const p = PERIODS.find((x) => x.id === id);
    if (id === 'ytd') { f.from = D.MONTHS.findIndex((m) => m.key === '2026-01'); f.to = LAST; }
    else if (p && p.n) { f.to = LAST; f.from = LAST - p.n + 1; }
  }

  /* ---------------- filtering ---------------- */
  const vehOk = (r, f) => (!f.brand || r.brand === f.brand) && (!f.vid || r.vid === f.vid) && (!f.cat || r.cat === f.cat) && (!f.body || r.body === f.body) && (!f.year || String(r.year) === f.year);
  const orgOk = (r, f) => (!f.branch || r.branch === f.branch) && (!f.sp || r.sp === f.sp);

  function sets(f, from, to) {
    const inR = (mi) => mi >= from && mi <= to;
    const inq = D.inquiries.filter((r) => inR(r.mi) && vehOk(r, f) && orgOk(r, f) && (!f.ch || r.ch === f.ch) && (!f.deal || r.status === f.deal));
    const sales = (f.deal && f.deal !== 'won') ? [] : D.sales.filter((s) => inR(s.mi) && vehOk(s, f) && orgOk(s, f) && (!f.ch || s.ch === f.ch) && (!f.pay || s.pay === f.pay) && (!f.coll || s.coll === f.coll));
    return { inq, sales };
  }

  /* asOf: the collection metrics are measured at this moment (default: today).
     The previous period is measured at the same distance from its own end, so the
     comparison is like-for-like (not "old invoices had more time to be collected"). */
  function agg(inq, sales, asOf) {
    asOf = asOf || TODAY;
    const a = { inq: inq.length, leads: 0, visits: 0, td: 0, quotes: 0, payok: 0, adViews: 0, mkt: 0 };
    for (const r of inq) {
      if (r.stage >= 1) a.leads++; if (r.stage >= 2) a.visits++; if (r.stage >= 3) a.td++; if (r.stage >= 4) a.quotes++; if (r.stage >= 5) a.payok++;
      a.adViews += Math.max(1, D.chById[r.ch].adViews); a.mkt += r.cost;
    }
    Object.assign(a, { units: sales.length, rev: 0, profit: 0, collected: 0, remaining: 0, cash: 0, fin: 0, cashN: 0, finN: 0, overdue: 0, overdueN: 0, due7: 0, due30: 0, credit: 0, creditN: 0, fullyCollected: 0 });
    for (const s of sales) {
      let paid = 0;
      for (const p of s.pays) if (p.d <= asOf) paid += p.a;
      const rem = s.price - paid;
      a.rev += s.price; a.profit += s.profit; a.collected += paid; a.remaining += rem; a.mkt += s.referralCost;
      if (s.pay === 'cash') { a.cash += s.price; a.cashN++; } else { a.fin += s.price; a.finN++; }
      if (s.upfront < s.price) { a.credit += s.price; a.creditN++; }
      if (rem === 0) a.fullyCollected++;
      else if (s.dueDate < asOf - DAY + 1) { a.overdue += rem; a.overdueN++; }
      else {
        const dd = (s.dueDate - asOf) / DAY;
        if (dd <= 7) a.due7 += rem;
        if (dd <= 30) a.due30 += rem;
      }
    }
    a.conv = a.leads ? (a.units / a.leads) * 100 : 0;
    a.avg = a.units ? a.rev / a.units : 0;
    a.margin = a.rev ? (a.profit / a.rev) * 100 : 0;
    a.collRate = a.rev ? (a.collected / a.rev) * 100 : 0;
    a.cpl = a.leads ? a.mkt / a.leads : 0;
    a.cps = a.units ? a.mkt / a.units : 0;
    return a;
  }

  function invAgg(f, salesInRange, months) {
    const stock = D.inventory.filter((x) => x.status !== 'sold' && vehOk(x, f) && (!f.branch || x.branch === f.branch));
    const i = { list: stock, avail: 0, reserved: 0, value: 0, sumDays: 0, aged30: 0, aged60: 0, aged90: 0, aged90Value: 0 };
    for (const x of stock) {
      if (x.status === 'available') i.avail++; else i.reserved++;
      i.value += x.cost; i.sumDays += x.days;
      if (x.days > 30) i.aged30++; if (x.days > 60) i.aged60++; if (x.days > 90) { i.aged90++; i.aged90Value += x.cost; }
    }
    i.avgDays = stock.length ? i.sumDays / stock.length : 0;
    i.sold = salesInRange.length;
    i.monthlyUnits = salesInRange.length / Math.max(1, months);
    return i;
  }

  function without(f, ...keys) { const g = Object.assign({}, f); keys.forEach((k) => { g[k] = ''; }); return g; }

  const monthEnd = (mi) => Date.UTC(D.MONTHS[mi].y, D.MONTHS[mi].m + 1, 1) - 1;
  function prevAsOf(f, L) {
    const lag = Math.max(0, TODAY - Math.min(TODAY, monthEnd(f.to)));
    return Math.min(TODAY, monthEnd(f.from - 1) + lag);
  }

  let MEMO = null, MEMO_KEY = '';
  function compute() {
    const key = JSON.stringify(S.f);
    if (MEMO && MEMO_KEY === key) return MEMO;
    const f = S.f, L = f.to - f.from + 1;
    const cur = sets(f, f.from, f.to);
    const hasPrev = f.from - L >= 0;
    const prev = hasPrev ? sets(f, f.from - L, f.from - 1) : null;
    const M = {
      f, months: L, hasPrev,
      label: f.from === f.to ? monthLabel(f.from) : monthLabel(f.from) + ' — ' + monthLabel(f.to),
      prevLabel: hasPrev ? (L === 1 ? monthLabel(f.from - 1) : monthLabel(f.from - L) + ' — ' + monthLabel(f.from - 1)) : '',
      inq: cur.inq, sales: cur.sales,
      a: agg(cur.inq, cur.sales, TODAY), p: prev ? agg(prev.inq, prev.sales, prevAsOf(f, L)) : null
    };
    M.inv = invAgg(f, cur.sales, L);
    // monthly series (at least 6 months for sparklines)
    const sFrom = Math.max(0, Math.min(f.from, f.to - 5));
    M.series = [];
    for (let mi = sFrom; mi <= f.to; mi++) {
      const inq = cur.inq.filter((r) => r.mi === mi), sa = cur.sales.filter((s) => s.mi === mi);
      const extra = mi < f.from ? sets(f, mi, mi) : null;
      M.series.push(Object.assign({ mi, label: monthLabel(mi), inRange: mi >= f.from }, agg(extra ? extra.inq : inq, extra ? extra.sales : sa)));
    }
    MEMO = M; MEMO_KEY = key;
    return M;
  }
  /* compute a sub-context ignoring some filter keys (for cross-filter highlight) */
  const SUB = {};
  function computeWithout(...keys) {
    const f = without(S.f, ...keys);
    const k = JSON.stringify(f);
    if (SUB[k]) return SUB[k];
    const cur = sets(f, f.from, f.to);
    const r = { inq: cur.inq, sales: cur.sales, f };
    SUB[k] = r;
    return r;
  }

  function groupBy(arr, fn) { const m = new Map(); for (const x of arr) { const k = fn(x); if (!m.has(k)) m.set(k, []); m.get(k).push(x); } return m; }

  /* per-vehicle stats */
  function vehStats(inq, sales) {
    const out = {};
    D.V.forEach((v) => { out[v.id] = { inq: 0, leads: 0, units: 0, rev: 0, profit: 0 }; });
    inq.forEach((r) => { const o = out[r.vid]; o.inq++; if (r.stage >= 1) o.leads++; });
    sales.forEach((s) => { const o = out[s.vid]; o.units++; o.rev += s.price; o.profit += s.profit; });
    Object.values(out).forEach((o) => { o.conv = o.leads ? (o.units / o.leads) * 100 : 0; o.margin = o.rev ? (o.profit / o.rev) * 100 : 0; });
    const stock = groupBy(D.inventory.filter((x) => x.status !== 'sold' && (!S.f.branch || x.branch === S.f.branch)), (x) => x.vid);
    D.V.forEach((v) => {
      const st = stock.get(v.id) || [];
      out[v.id].stock = st.filter((x) => x.status === 'available').length;
      out[v.id].reserved = st.filter((x) => x.status === 'reserved').length;
      out[v.id].avgDays = st.length ? st.reduce((a, b) => a + b.days, 0) / st.length : 0;
    });
    return out;
  }

  /* ---------------- judge / status ---------------- */
  const LEVEL = {
    good: { ar: 'جيد', icon: '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.2 4.2L19 7"/></svg>' },
    ok: { ar: 'مقبول — يحتاج متابعة', icon: '<svg viewBox="0 0 24 24"><path d="M12 7v6M12 17h.01"/><circle cx="12" cy="12" r="9"/></svg>' },
    warn: { ar: 'يحتاج انتباه', icon: '<svg viewBox="0 0 24 24"><path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17h.01"/></svg>' },
    na: { ar: 'لا يمكن الحكم', icon: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M8 12h8"/></svg>' }
  };
  function judge(key, M) {
    const e = EX[key];
    if (!e || !e.judge) return null;
    const j = e.judge(M);
    let level = 'na';
    if (j.value != null && isFinite(j.value)) { const r = j.rules.find((x) => x.test(j.value)); if (r) level = r.level; }
    return Object.assign({ level }, j);
  }
  const badge = (level) => `<span class="status ${level}">${LEVEL[level].icon}${LEVEL[level].ar}</span>`;

  /* ---------------- drawer ---------------- */
  const drawer = () => document.getElementById('drawer');
  function openDrawer(html, wide) {
    const d = drawer();
    d.querySelector('.drawer-body').innerHTML = html;
    d.classList.toggle('wide', !!wide);
    d.classList.add('open');
    document.getElementById('scrim').classList.add('open');
    d.querySelector('.drawer-body').scrollTop = 0;
    hydrate(d);
  }
  function closeDrawer() { drawer().classList.remove('open'); document.getElementById('scrim').classList.remove('open'); }

  function explainHTML(key, M, extra) {
    const e = EX[key];
    if (!e) return '';
    const j = judge(key, M);
    const sec = (t, body, cls) => body ? `<section class="ex-sec ${cls || ''}"><h4>${t}</h4>${body}</section>` : '';
    const val = (fnOrStr) => (typeof fnOrStr === 'function' ? fnOrStr(M) : fnOrStr) || '';
    let jHTML = '';
    if (j) {
      jHTML = `<div class="judge">${badge(j.level)}<div class="judge-val">${esc(j.shown)}</div></div>
        <table class="rules"><tbody>${j.rules.map((r) => `<tr class="${j.level === r.level && r.test(j.value) ? 'hit' : ''}"><td>${badge(r.level)}</td><td>${esc(r.text)}</td></tr>`).join('')}</tbody></table>
        <p class="fine">أساس الحكم: ${esc(j.basis)}. هذه حدود مرجعية تدريبية يمكن للإدارة تعديلها حسب سياسة المعرض.</p>`;
    } else {
      jHTML = '<p class="muted-p">هذا رقم وصفي/تخطيطي وليس مؤشر أداء له حد جيد أو سيئ بذاته؛ يُقرأ مقارنة بالمؤشرات الأخرى.</p>';
    }
    return `<div class="ex">
      <div class="ex-head"><div class="ex-kicker">اشرح لي${e.en ? ' · ' + esc(e.en) : ''}</div><h3>${esc(e.title)}</h3>${M.label ? `<div class="ex-period">الفترة: ${esc(M.label)}</div>` : ''}</div>
      ${extra || ''}
      ${sec('ما هذا المؤشر؟', `<p>${esc(val(e.what))}</p>`)}
      ${sec('ماذا يعني؟', `<p>${esc(val(e.means))}</p>`, 'hl')}
      ${sec('لماذا يهم الإدارة؟', `<p>${esc(val(e.why))}</p>`)}
      ${sec('كيف يتم حسابه؟', `<div class="formula">${esc(val(e.formula))}</div>${e.calc ? `<div class="calc">${esc(val(e.calc))}</div>` : ''}${e.example ? `<div class="example"><b>مثال:</b><pre>${esc(e.example)}</pre></div>` : ''}`)}
      ${sec('كيف أفسر الرقم؟', `<p>${esc(val(e.read))}</p>`)}
      ${sec('ما القرار الإداري الممكن؟', `<p>${esc(val(e.decision))}</p>`)}
      ${sec('هل الرقم جيد أم يحتاج انتباه؟', jHTML)}
    </div>`;
  }

  /* ---------------- image hydration ---------------- */
  function hydrate(root) {
    (root || document).querySelectorAll('[data-img-v]:not([data-hyd])').forEach((el) => {
      el.setAttribute('data-hyd', '1');
      const v = D.byId[el.getAttribute('data-img-v')];
      const view = el.getAttribute('data-view') || 'front';
      if (!v) return;
      el.classList.add('loading');
      const fallback = () => {
        el.classList.remove('loading'); el.classList.add('fallback');
        el.innerHTML = window.IMG.silhouette(v.body) + `<span class="img-note">صورة ${view === 'front' ? '' : 'هذه الزاوية '}غير متاحة حالياً — رسم تمثيلي</span>`;
      };
      window.IMG.vehicleView(v, view).then((r) => {
        if (!r) return fallback();
        const img = new Image();
        img.alt = v.full + ' — صورة تمثيلية';
        img.loading = 'lazy'; img.referrerPolicy = 'no-referrer';
        img.onload = () => { el.classList.remove('loading'); el.classList.add('loaded'); };
        img.onerror = fallback;
        img.src = r.src;
        el.innerHTML = '';
        el.appendChild(img);
        if (el.hasAttribute('data-credit')) {
          const c = document.createElement('a');
          c.className = 'img-credit'; c.href = r.page || r.article || '#'; c.target = '_blank'; c.rel = 'noopener';
          c.textContent = 'صورة تمثيلية للموديل · Wikimedia Commons';
          el.appendChild(c);
        }
      });
    });
    (root || document).querySelectorAll('[data-img-part]:not([data-hyd])').forEach((el) => {
      el.setAttribute('data-hyd', '1');
      const p = window.CONTENT.PARTS.find((x) => x.id === el.getAttribute('data-img-part'));
      el.classList.add('loading');
      window.IMG.partImage(p).then((r) => {
        el.classList.remove('loading');
        if (!r) { el.classList.add('fallback'); el.innerHTML = '<svg class="silhouette" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/></svg><span class="img-note">الصورة غير متاحة حالياً</span>'; return; }
        el.innerHTML = `<img alt="${esc(p.ar)}" loading="lazy" referrerpolicy="no-referrer" src="${esc(r.src)}"><a class="img-credit" target="_blank" rel="noopener" href="${esc(r.page || r.article)}">Wikimedia Commons</a>`;
        el.querySelector('img').onerror = () => { el.classList.add('fallback'); el.innerHTML = '<span class="img-note">الصورة غير متاحة حالياً</span>'; };
      });
    });
  }

  /* ---------------- render loop ---------------- */
  function render() {
    MEMO = null; for (const k in SUB) delete SUB[k];
    const M = compute();
    renderFilters(M);
    document.querySelectorAll('[data-nav]').forEach((a) => a.classList.toggle('active', a.getAttribute('data-nav') === S.page));
    const main = document.getElementById('page');
    const P = window.PAGES[S.page] || window.PAGES.home;
    try { main.innerHTML = P(M); } catch (err) { console.error(err); main.innerHTML = CH.empty('حدث خطأ أثناء عرض الصفحة'); }
    hydrate(main);
    const syncEl = document.getElementById('sync');
    if (syncEl) syncEl.innerHTML = '<i class="live"></i> تم التحديث ✓ · ' + esc(M.label);
  }

  /* ---------------- filters UI ---------------- */
  function opts(list, cur, all) {
    return `<option value="">${esc(all)}</option>` + list.map(([v, l]) => `<option value="${esc(v)}"${String(cur) === String(v) ? ' selected' : ''}>${esc(l)}</option>`).join('');
  }
  function renderFilters(M) {
    const f = S.f;
    const brands = Object.keys(D.BRANDS).map((b) => [b, D.BRANDS[b].ar + ' · ' + b]);
    const models = D.V.filter((v) => !f.brand || v.brand === f.brand).map((v) => [v.id, v.full]);
    const sps = D.TEAM.filter((t) => !f.branch || t.branch === f.branch).map((t) => [t.id, t.ar]);
    const monthOpts = (cur) => D.MONTHS.map((m, i) => `<option value="${i}"${cur === i ? ' selected' : ''}>${esc(monthLabel(i))}</option>`).join('');
    const sel = (key, label, list, all, note) => `<label class="flt${f[key] ? ' on' : ''}"><span>${esc(label)}${note ? `<em title="${esc(note)}">*</em>` : ''}</span><select data-f="${key}">${opts(list, f[key], all)}</select></label>`;
    const html = `
      <label class="flt on"><span>التاريخ</span><select data-f="period">${PERIODS.map((p) => `<option value="${p.id}"${f.period === p.id ? ' selected' : ''}>${esc(p.ar)}</option>`).join('')}</select></label>
      ${f.period === 'custom' ? `<label class="flt on"><span>من</span><select data-f="from">${monthOpts(f.from)}</select></label><label class="flt on"><span>إلى</span><select data-f="to">${monthOpts(f.to)}</select></label>` : ''}
      ${sel('branch', 'الفرع', D.BRANCHES.map((b) => [b.id, b.ar]), 'جميع الفروع')}
      ${sel('brand', 'الماركة', brands, 'جميع الماركات')}
      ${sel('vid', 'الموديل', models, 'جميع الموديلات')}
      ${sel('sp', 'المندوب', sps, 'جميع المندوبين')}
      ${sel('ch', 'مصدر العميل', D.CHANNELS.map((c) => [c.id, c.ar]), 'جميع المصادر')}
      <div class="flt-more${S.ui.moreFilters ? ' open' : ''}">
        ${sel('cat', 'الفئة', Object.entries(D.CAT_AR), 'جميع الفئات')}
        ${sel('body', 'نوع السيارة', Object.entries(D.BODY_AR), 'جميع الأنواع')}
        ${sel('year', 'سنة الموديل', [['2025', '2025'], ['2026', '2026']], 'كل السنوات')}
        ${sel('pay', 'طريقة الدفع', D.PAYMENTS.map((p) => [p.id, p.ar]), 'كل طرق الدفع', 'يطبق على المبيعات فقط')}
        ${sel('deal', 'حالة الصفقة', [['won', 'مباعة'], ['open', 'مفتوحة'], ['lost', 'مفقودة']], 'كل الحالات')}
        ${sel('coll', 'حالة التحصيل', [['paid', 'محصّل بالكامل'], ['pending', 'قيد التحصيل (غير مستحق)'], ['overdue', 'متأخر']], 'كل الحالات', 'يطبق على المبيعات فقط')}
      </div>
      <button class="btn ghost sm" data-act="more">${S.ui.moreFilters ? 'فلاتر أقل' : 'المزيد من الفلاتر'}<svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg></button>`;
    document.getElementById('filters').innerHTML = html;
    // active chips
    const chips = [];
    const nm = {
      brand: (v) => D.BRANDS[v].ar, vid: (v) => D.byId[v].full, cat: (v) => D.CAT_AR[v], body: (v) => D.BODY_AR[v], year: (v) => v,
      branch: (v) => D.brById[v].ar, sp: (v) => D.spById[v].ar, ch: (v) => D.chById[v].ar, pay: (v) => D.payById[v].ar,
      deal: (v) => ({ won: 'مباعة', open: 'مفتوحة', lost: 'مفقودة' }[v]), coll: (v) => ({ paid: 'محصّل', pending: 'قيد التحصيل', overdue: 'متأخر' }[v])
    };
    Object.keys(nm).forEach((k) => { if (f[k]) chips.push(`<button class="chip" data-clear="${k}">${esc(nm[k](f[k]))}<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button>`); });
    const note = (f.pay || f.coll) ? '<span class="chip-note">* فلاتر طريقة الدفع وحالة التحصيل تطبق على المبيعات فقط؛ الاستفسارات والـ Leads تبقى كما هي.</span>' : '';
    document.getElementById('chips').innerHTML = chips.length ? `<span class="chips-t">فلاتر نشطة:</span>${chips.join('')}<button class="chip reset" data-act="reset">مسح الكل</button>${note}` : '';
    document.getElementById('period-label').textContent = M.label + (M.hasPrev ? ' · مقارنة مع ' + M.prevLabel : '');
  }

  /* ---------------- pick (cross-filter) ---------------- */
  function pick(key, value) {
    if (S.f[key] === value) S.f[key] = '';
    else {
      S.f[key] = value;
      if (key === 'vid') S.f.brand = D.byId[value].brand;
      if (key === 'sp') S.f.branch = D.spById[value].branch;
      if (key === 'brand' && S.f.vid && D.byId[S.f.vid].brand !== value) S.f.vid = '';
      if (key === 'branch' && S.f.sp && D.spById[S.f.sp].branch !== value) S.f.sp = '';
    }
    render();
    toast(S.f[key] ? 'تم تطبيق الفلتر على كامل اللوحة' : 'تم إلغاء الفلتر');
  }
  let toastT;
  function toast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 1800);
  }

  /* ---------------- events ---------------- */
  document.addEventListener('change', (e) => {
    const el = e.target;
    if (el.matches('[data-f]')) {
      const k = el.getAttribute('data-f');
      if (k === 'period') applyPeriod(el.value);
      else if (k === 'from' || k === 'to') { S.f[k] = +el.value; if (S.f.from > S.f.to) { const t = S.f.from; S.f.from = S.f.to; S.f.to = t; } }
      else {
        S.f[k] = el.value;
        if (k === 'brand' && S.f.vid && D.byId[S.f.vid].brand !== el.value) S.f.vid = '';
        if (k === 'vid' && el.value) S.f.brand = D.byId[el.value].brand;
        if (k === 'branch' && S.f.sp && D.spById[S.f.sp].branch !== el.value) S.f.sp = '';
        if (k === 'sp' && el.value) S.f.branch = D.spById[el.value].branch;
      }
      render();
    }
    if (el.matches('[data-ui]')) { S.ui[el.getAttribute('data-ui')] = el.value; render(); }
  });
  document.addEventListener('input', (e) => {
    const el = e.target;
    if (el.matches('[data-ui-live]')) {
      S.ui[el.getAttribute('data-ui-live')] = el.value;
      const pos = el.selectionStart;
      render();
      const again = document.querySelector(`[data-ui-live="${el.getAttribute('data-ui-live')}"]`);
      if (again) { again.focus(); try { again.setSelectionRange(pos, pos); } catch (err) { /* ignore */ } }
    }
  });

  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-nav],[data-explain],[data-pick],[data-vehicle],[data-sale],[data-stock],[data-part],[data-term],[data-q],[data-chan],[data-bubble],[data-set],[data-act],[data-clear],[data-view-btn],[data-dict],[data-month],[data-close]');
    if (!t) return;
    const M = compute();
    if (t.hasAttribute('data-close')) { closeDrawer(); return; }
    if (t.hasAttribute('data-nav')) {
      e.preventDefault();
      S.page = t.getAttribute('data-nav');
      try { localStorage.setItem('dealer-page', S.page); } catch (err) { /* ignore */ }
      closeDrawer(); render(); window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    if (t.hasAttribute('data-explain')) { e.stopPropagation(); openDrawer(explainHTML(t.getAttribute('data-explain'), M)); return; }
    if (t.hasAttribute('data-pick')) { const [k, v] = t.getAttribute('data-pick').split('|'); pick(k, v); return; }
    if (t.hasAttribute('data-vehicle')) { openDrawer(window.VIEWS.vehicle(t.getAttribute('data-vehicle'), M), true); return; }
    if (t.hasAttribute('data-sale')) { openDrawer(window.VIEWS.sale(t.getAttribute('data-sale'), M)); return; }
    if (t.hasAttribute('data-stock')) { openDrawer(window.VIEWS.stock(t.getAttribute('data-stock'), M)); return; }
    if (t.hasAttribute('data-part')) { openDrawer(window.VIEWS.part(t.getAttribute('data-part'))); return; }
    if (t.hasAttribute('data-term')) { openDrawer(window.VIEWS.term(t.getAttribute('data-term'))); return; }
    if (t.hasAttribute('data-q')) { openDrawer(window.VIEWS.question(t.getAttribute('data-q'), M)); return; }
    if (t.hasAttribute('data-chan')) { openDrawer(window.VIEWS.channel(t.getAttribute('data-chan'), M)); return; }
    if (t.hasAttribute('data-bubble')) { openDrawer(window.VIEWS.bubble(t.getAttribute('data-bubble'), M)); return; }
    if (t.hasAttribute('data-month')) {
      const mi = +t.getAttribute('data-month');
      if (S.f.period === 'custom' && S.f.from === mi && S.f.to === mi) applyPeriod('12m');
      else { S.f.period = 'custom'; S.f.from = mi; S.f.to = mi; }
      render(); toast(S.f.period === 'custom' ? 'تم حصر اللوحة على ' + monthLabel(mi) : 'تمت العودة لآخر 12 شهراً');
      return;
    }
    if (t.hasAttribute('data-dict')) { const [k, v] = t.getAttribute('data-dict').split('|'); window.VIEWS.dictPick(S, k, v); render(); return; }
    if (t.hasAttribute('data-view-btn')) {
      const box = t.closest('.stage'); const img = box.querySelector('[data-img-v]');
      box.querySelectorAll('[data-view-btn]').forEach((b) => b.classList.toggle('active', b === t));
      img.setAttribute('data-view', t.getAttribute('data-view-btn')); img.removeAttribute('data-hyd');
      hydrate(box); return;
    }
    if (t.hasAttribute('data-set')) { const [k, v] = t.getAttribute('data-set').split('|'); S.ui[k] = v; render(); return; }
    if (t.hasAttribute('data-clear')) { S.f[t.getAttribute('data-clear')] = ''; render(); return; }
    if (t.hasAttribute('data-act')) {
      const a = t.getAttribute('data-act');
      if (a === 'reset') { S.f = Object.assign({}, DEFAULT_F); render(); toast('تمت إعادة تعيين الفلاتر'); }
      if (a === 'more') { S.ui.moreFilters = !S.ui.moreFilters; render(); }
      if (a === 'refresh') {
        const s = document.getElementById('sync'); s.innerHTML = '<i class="live busy"></i> جارٍ التحديث…';
        document.querySelectorAll('[data-hyd]').forEach((x) => x.removeAttribute('data-hyd'));
        setTimeout(render, 450);
      }
      if (a === 'menu') document.body.classList.toggle('nav-open');
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeDrawer();
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[tabindex="0"]')) { e.preventDefault(); e.target.click(); }
  });
  document.getElementById('scrim').addEventListener('click', closeDrawer);

  /* mini tooltip: a small clean number */
  const tip = document.getElementById('tip');
  document.addEventListener('mousemove', (e) => {
    const el = e.target.closest && e.target.closest('[data-tip]');
    if (!el) { tip.classList.remove('show'); return; }
    tip.textContent = el.getAttribute('data-tip');
    tip.style.left = e.clientX + 'px'; tip.style.top = e.clientY + 'px';
    tip.classList.add('show');
  });

  window.APP = { S, D, compute, computeWithout, groupBy, vehStats, judge, badge, explainHTML, monthLabel, render, hydrate, LEVEL, agg, sets };
  document.addEventListener('DOMContentLoaded', render);
  if (document.readyState !== 'loading') render();
})();
