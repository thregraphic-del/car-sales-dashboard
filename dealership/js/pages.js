/* =====================================================================
   الصفحات العشر
   ===================================================================== */
(function () {
  'use strict';
  const A = window.APP, D = window.DB, CH = window.CH, C = window.CONTENT;
  const { num, sar, pct, esc, short } = CH;
  const S = A.S;

  /* ---------- icons (mono line) ---------- */
  const IC = {
    money: '<path d="M3 7h18v10H3z"/><circle cx="12" cy="12" r="2.6"/><path d="M6 10v4M18 10v4"/>',
    car: '<path d="M4 16v-3l2-5h12l2 5v3"/><path d="M3 16h18v2H3z"/><circle cx="7.5" cy="16.5" r="1.5"/><circle cx="16.5" cy="16.5" r="1.5"/><path d="M6.5 10h11"/>',
    inbox: '<path d="M4 13l2.5-7h11L20 13v5H4z"/><path d="M4 13h5l1 2h4l1-2h5"/>',
    users: '<circle cx="9" cy="8" r="3"/><path d="M3 19c0-3.3 2.7-5 6-5s6 1.7 6 5"/><path d="M16 5.5a3 3 0 010 5.5M18 14c2 .6 3 2.2 3 5"/>',
    funnel: '<path d="M3 5h18l-7 8v5l-4 2v-7z"/>',
    tag: '<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1.4"/>',
    wallet: '<path d="M3 7h15a3 3 0 013 3v8H3z"/><path d="M3 7l12-3v3"/><circle cx="16.5" cy="13" r="1.2"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    cash: '<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M12 9v6M10 10.5c0-.8.9-1.5 2-1.5s2 .7 2 1.5-1 1.3-2 1.5-2 .7-2 1.5.9 1.5 2 1.5 2-.7 2-1.5"/>',
    bank: '<path d="M3 10l9-6 9 6"/><path d="M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18"/>',
    chart: '<path d="M4 20V4M4 20h16"/><path d="M7 15l4-4 3 3 5-6"/>',
    box: '<path d="M3 7l9-4 9 4v10l-9 4-9-4z"/><path d="M3 7l9 4 9-4M12 11v10"/>',
    alert: '<path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17h.01"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    percent: '<path d="M19 5L5 19"/><circle cx="7" cy="7" r="2.5"/><circle cx="17" cy="17" r="2.5"/>',
    lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/>',
    target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/>',
    megaphone: '<path d="M3 10v4h4l8 5V5L7 10z"/><path d="M18 9a4 4 0 010 6"/>',
    check: '<circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.8 2.8L16 9.5"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5h.01"/>',
    wrench: '<path d="M14.5 5.5a4 4 0 00-5 5L4 16l4 4 5.5-5.5a4 4 0 005-5l-2.5 2.5-2.5-.5-.5-2.5z"/>',
    book: '<path d="M4 5a2 2 0 012-2h13v16H6a2 2 0 00-2 2z"/><path d="M4 19V5M8 7h8"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
    layers: '<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>',
    bars: '<path d="M5 20V10M12 20V4M19 20v-7"/>',
    pie: '<path d="M12 3v9h9a9 9 0 11-9-9z"/><path d="M15 3.5A9 9 0 0120.5 9H15z"/>'
  };
  const icon = (k) => `<svg class="ic" viewBox="0 0 24 24">${IC[k] || IC.info}</svg>`;
  const info = (key) => `<button class="info" data-explain="${key}" aria-label="اشرح لي" title="اشرح لي">${icon('info')}</button>`;
  const ymd = (ms) => new Date(ms).toISOString().slice(0, 10);

  function panel(title, key, body, o = {}) {
    return `<section class="panel ${o.cls || ''}"${o.id ? ` id="${o.id}"` : ''}>
      <header class="p-head"><div><h3>${esc(title)}</h3>${o.sub ? `<p class="p-sub">${esc(o.sub)}</p>` : ''}</div><div class="p-tools">${o.tools || ''}${key ? info(key) : ''}</div></header>
      <div class="p-body">${body}</div></section>`;
  }
  const sw = (uiKey, options, cur) => `<div class="switch">${options.map(([v, l]) => `<span class="opt${cur === v ? ' active' : ''}" data-set="${uiKey}|${v}">${esc(l)}</span>`).join('')}</div>`;

  /* KPI card */
  function kpi(key, title, ic, cur, prev, fmt, o = {}) {
    let delta = `<span class="badge-mom ref">— ${esc(o.note || 'لا توجد فترة سابقة')}</span>`;
    if (prev != null && prev !== 0 && isFinite(prev)) {
      const g = ((cur - prev) / Math.abs(prev)) * 100;
      const up = g >= 0, good = o.inverse ? !up : up;
      delta = `<span class="badge-mom ${Math.abs(g) < 0.05 ? 'flat' : good ? 'up' : 'down'}"><svg viewBox="0 0 24 24"><path d="${up ? 'M7 14l5-5 5 5' : 'M7 10l5 5 5-5'}"/></svg>${(up ? '+' : '') + pct(g)}</span>`;
    }
    const v = fmt(cur);
    const [main, unit] = v.includes(' ر.س') ? [v.replace(' ر.س', ''), 'ر.س'] : v.endsWith('%') ? [v.slice(0, -1), '%'] : [v, o.unit || ''];
    return `<article class="kpi${o.cls ? ' ' + o.cls : ''}" data-explain="${key}" tabindex="0" role="button">
      <div class="k-top"><span class="k-ic">${icon(ic)}</span><span class="k-title">${esc(title)}</span><span class="info sm">${icon('info')}</span></div>
      <div class="k-val">${esc(main)}${unit ? `<span class="unit">${esc(unit)}</span>` : ''}</div>
      <div class="k-foot">${delta}<span class="k-prev">${prev != null ? 'السابق: ' + esc(fmt(prev)) : ''}</span></div>
      ${o.spark ? `<div class="k-spark">${CH.sparkline(o.spark, o.sparkCls)}</div>` : ''}
    </article>`;
  }
  const P = (M, k) => (M.p ? M.p[k] : null);
  const spark = (M, k) => M.series.map((s) => s[k]);

  const vName = (id) => D.byId[id].full;

  /* ===================================================================
     1) HOME
     =================================================================== */
  const FINAL_Q = ['وش نبيع؟', 'مين يشتري؟', 'من وين جابونا؟', 'كم بعنا؟', 'كم ربحنا؟', 'كيف دفعوا؟', 'كم حصلنا؟', 'كم باقي؟', 'وش الموجود بالمخزون؟', 'وش السيارات البطيئة؟', 'وش السيارات المطلوبة؟', 'وش الفرق بين الموديلات والفئات؟', 'وش قطع الغيار الأساسية؟', 'وش معنى كل رقم؟'];

  function kpiGrid(M) {
    const a = M.a;
    return `<div class="kpi-grid">
      ${kpi('kpi.revenue', 'إجمالي المبيعات', 'money', a.rev, P(M, 'rev'), sar, { spark: spark(M, 'rev'), cls: 'lead' })}
      ${kpi('kpi.units', 'عدد السيارات المباعة', 'car', a.units, P(M, 'units'), num, { spark: spark(M, 'units'), unit: 'سيارة' })}
      ${kpi('kpi.inquiries', 'عدد طلبات العملاء', 'inbox', a.inq, P(M, 'inq'), num, { spark: spark(M, 'inq'), unit: 'استفسار' })}
      ${kpi('kpi.leads', 'العملاء المحتملون Leads', 'users', a.leads, P(M, 'leads'), num, { spark: spark(M, 'leads'), unit: 'Lead' })}
      ${kpi('kpi.conv', 'نسبة التحويل إلى مبيعات', 'funnel', a.conv, P(M, 'conv'), (v) => pct(v), { spark: spark(M, 'conv') })}
      ${kpi('kpi.avg', 'متوسط قيمة السيارة', 'tag', a.avg, P(M, 'avg'), sar, { spark: spark(M, 'avg') })}
      ${kpi('kpi.collected', 'إجمالي التحصيل', 'wallet', a.collected, P(M, 'collected'), sar, { spark: spark(M, 'collected') })}
      ${kpi('kpi.remaining', 'المتبقي للتحصيل', 'clock', a.remaining, P(M, 'remaining'), sar, { spark: spark(M, 'remaining'), inverse: true, sparkCls: 'warm' })}
      ${kpi('kpi.cash', 'مبيعات الكاش', 'cash', a.cash, P(M, 'cash'), sar, { spark: spark(M, 'cash') })}
      ${kpi('kpi.finance', 'مبيعات التمويل', 'bank', a.fin, P(M, 'fin'), sar, { spark: spark(M, 'fin') })}
    </div>`;
  }

  function trendPanel(M) {
    const m = S.ui.trend;
    const map = { rev: ['المبيعات (ر.س)', 'rev', short, sar], profit: ['الأرباح (ر.س)', 'profit', short, sar], margin: ['الهامش %', 'margin', (v) => pct(v), (v) => pct(v)], units: ['عدد السيارات', 'units', num, num] };
    const [name, k, fmt, tipFmt] = map[m];
    const body = CH.line(M.series.map((s) => s.label), [{ name, cls: 's1', values: M.series.map((s) => s[k]) }], { fmt, tipFmt, min: m === 'margin' ? Math.max(0, Math.min(...M.series.map((s) => s.margin)) - 2) : 0 });
    return panel('اتجاه الأداء الشهري', 'chart.trend', body, { cls: 'span2', tools: sw('trend', [['rev', 'المبيعات'], ['profit', 'الأرباح'], ['margin', 'الهامش'], ['units', 'العدد']], m), sub: 'الأقدم يميناً ← الأحدث يساراً' });
  }

  function payDonut(M, title) {
    const ctx = A.computeWithout('pay');
    const by = A.groupBy(ctx.sales, (s) => s.pay);
    const items = D.PAYMENTS.map((p, i) => {
      const arr = by.get(p.id) || [];
      return { label: p.ar, value: arr.reduce((a, b) => a + b.price, 0), valueLabel: sar(arr.reduce((a, b) => a + b.price, 0)), cls: 's' + (i + 1), attrs: { 'data-pick': 'pay|' + p.id }, active: S.f.pay === p.id };
    });
    return panel(title || 'طريقة الدفع', 'chart.pay', CH.donut(items, { center: { value: num(ctx.sales.length), label: 'صفقة' } }));
  }

  function topModels(M, n) {
    const ctx = A.computeWithout('vid');
    const st = A.vehStats(ctx.inq, ctx.sales);
    const items = D.V.map((v) => ({ v, s: st[v.id] })).filter((x) => x.s.units).sort((a, b) => b.s.units - a.s.units).slice(0, n)
      .map((x) => ({ label: x.v.full, sub: x.v.ar, value: x.s.units, valueLabel: num(x.s.units) + ' سيارة', attrs: { 'data-pick': 'vid|' + x.v.id }, active: S.f.vid === x.v.id, tip: `${x.v.full}: ${num(x.s.units)} سيارة · ${sar(x.s.rev)}` }));
    return CH.hbars(items);
  }

  function channelBars(M, metric) {
    const cs = chStats(A.computeWithout('ch'));
    const conf = {
      leads: ['Leads', (c) => c.leads, (c) => num(c.leads)],
      units: ['المبيعات', (c) => c.units, (c) => num(c.units)],
      conv: ['نسبة التحويل', (c) => c.conv, (c) => pct(c.conv)],
      rev: ['الإيراد', (c) => c.rev, (c) => sar(c.rev)],
      cpl: ['تكلفة الـ Lead', (c) => c.cpl, (c) => sar(c.cpl)],
      cps: ['تكلفة البيعة', (c) => c.cps, (c) => sar(c.cps)]
    }[metric || 'leads'];
    const items = cs.slice().sort((a, b) => conf[1](b) - conf[1](a)).map((c) => ({
      label: c.ch.ar, sub: `${num(c.leads)} Lead · تحويل ${pct(c.conv)}`, value: conf[1](c), valueLabel: conf[2](c), attrs: { 'data-chan': c.ch.id }, active: S.f.ch === c.ch.id,
      tip: `${c.ch.ar}: ${num(c.leads)} Lead ← ${num(c.units)} بيع (${pct(c.conv)})`
    }));
    return CH.hbars(items);
  }

  function chStats(ctx) {
    const byI = A.groupBy(ctx.inq, (r) => r.ch), byS = A.groupBy(ctx.sales, (s) => s.ch);
    return D.CHANNELS.map((ch) => {
      const a = A.agg(byI.get(ch.id) || [], byS.get(ch.id) || []);
      return Object.assign(a, { ch });
    });
  }

  function home(M) {
    const a = M.a;
    const collG = A.judge('kpi.collRate', M);
    return `
    <div class="hero">
      <div class="hero-txt">
        <div class="kicker">نظرة تنفيذية · ${esc(M.label)}</div>
        <h1>وش صار في المعرض؟</h1>
        <p>اضغط أي رقم أو رسم لتعرف معناه وكيف يُحسب وما القرار الذي يمكن اتخاذه. <b>لا نعرض رقماً بدون تفسير.</b></p>
      </div>
      <div class="qchips">${FINAL_Q.map((q, i) => `<button class="qchip" data-q="final|${i}">${esc(q)}</button>`).join('')}</div>
    </div>
    ${kpiGrid(M)}
    <div class="grid g3">
      ${trendPanel(M)}
      ${payDonut(M)}
    </div>
    <div class="grid g3">
      ${panel('الأكثر مبيعاً', 'chart.model', topModels(M, 8), { sub: 'اضغط موديلاً لفلترة اللوحة' })}
      ${panel('من أين جاء العملاء؟', 'chart.channels', channelBars(M, 'leads'), { sub: 'اضغط قناة لقراءة تحليلها' })}
      ${panel('صحة التحصيل والمخزون', 'kpi.collRate', `
        <div class="gauge-box">${CH.gauge(a.collRate, { cls: collG ? collG.level : '' })}<div class="g-cap">نسبة التحصيل ${collG ? A.badge(collG.level) : ''}</div></div>
        <div class="mini-list">
          <div class="mini" data-explain="kpi.overdue" tabindex="0"><span>${icon('alert')} متأخر</span><b>${sar(a.overdue)}</b></div>
          <div class="mini" data-explain="kpi.due7" tabindex="0"><span>${icon('calendar')} مستحق خلال 7 أيام</span><b>${sar(a.due7)}</b></div>
          <div class="mini" data-explain="kpi.invDays" tabindex="0"><span>${icon('clock')} متوسط أيام المخزون</span><b>${num(M.inv.avgDays)} يوم</b></div>
          <div class="mini" data-explain="kpi.aged90" tabindex="0"><span>${icon('box')} مخزون راكد +90 يوم</span><b>${num(M.inv.aged90)} سيارة</b></div>
        </div>`)}
    </div>
    ${qaSection(M)}`;
  }

  /* ---------- Management Questions ---------- */
  function QA(M) {
    const a = M.a;
    const st = A.vehStats(M.inq, M.sales);
    const vs = D.V.map((v) => Object.assign({ v }, st[v.id]));
    const sold = vs.filter((x) => x.units > 0);
    const top = (arr, k) => arr.slice().sort((x, y) => y[k] - x[k])[0];
    const bottom = (arr, k) => arr.slice().sort((x, y) => x[k] - y[k])[0];
    const brandAgg = [...A.groupBy(M.sales, (s) => s.brand)].map(([b, arr]) => ({ b, units: arr.length, rev: arr.reduce((x, y) => x + y.price, 0), profit: arr.reduce((x, y) => x + y.profit, 0) }));
    const cs = chStats({ inq: M.inq, sales: M.sales }).filter((c) => c.leads > 0);
    const catAgg = [...A.groupBy(M.sales, (s) => s.body)].map(([b, arr]) => ({ b, profit: arr.reduce((x, y) => x + y.profit, 0), n: arr.length }));
    const inv = M.inv.list;
    const slowModels = vs.filter((x) => x.stock + x.reserved > 0).sort((x, y) => y.avgDays - x.avgDays).slice(0, 3);
    const none = 'لا توجد بيانات كافية ضمن الفلاتر الحالية.';
    const Q = [];
    const q = (cat, id, text, ans, page) => Q.push({ cat, id, text, ans, page });
    const tS = top(sold, 'units'), bS = bottom(sold, 'units'), tR = top(sold, 'rev'), tM = top(sold, 'margin'), tP = top(sold, 'profit');
    const tB = brandAgg.slice().sort((x, y) => y.rev - x.rev)[0];
    const bestCh = cs.slice().sort((x, y) => y.units - x.units)[0];
    const qualCh = cs.filter((c) => c.leads >= 20).sort((x, y) => y.conv - x.conv)[0];
    const cheapCh = cs.filter((c) => c.units >= 3 && c.mkt > 0).sort((x, y) => x.cps - y.cps)[0];
    const tCat = catAgg.slice().sort((x, y) => y.profit - x.profit)[0];

    q('المبيعات', 's1', 'كم بعنا؟', a.units ? `بعنا ${num(a.units)} سيارة بقيمة ${sar(a.rev)} خلال ${M.label}.` : none, 'sales');
    q('المبيعات', 's2', 'وش أكثر سيارة مبيعاً؟', tS ? `${tS.v.full} (${tS.v.ar}) بعدد ${num(tS.units)} سيارة وإيراد ${sar(tS.rev)}.` : none, 'sales');
    q('المبيعات', 's3', 'وش أقل سيارة مبيعاً؟', bS ? `${bS.v.full} بعدد ${num(bS.units)} سيارة. ${vs.filter((x) => !x.units).length ? `وهناك ${num(vs.filter((x) => !x.units).length)} موديل بدون أي مبيعات في الفترة.` : ''}` : none, 'sales');
    q('المبيعات', 's4', 'أي ماركة حققت أعلى مبيعات؟', tB ? `${D.BRANDS[tB.b].ar} (${tB.b}) بإيراد ${sar(tB.rev)} من ${num(tB.units)} سيارة = ${pct((tB.rev / Math.max(1, a.rev)) * 100)} من الإجمالي.` : none, 'sales');
    q('المبيعات', 's5', 'أي موديل حقق أعلى إيراد؟', tR ? `${tR.v.full} بإيراد ${sar(tR.rev)}${tS && tR.v.id !== tS.v.id ? ` — لاحظ أنه ليس الأكثر عدداً (${tS.v.full})، لأن سعره أعلى.` : '.'}` : none, 'sales');
    q('المبيعات', 's6', 'من أفضل مصدر للعملاء؟', bestCh ? `${bestCh.ch.ar} جلب أكبر عدد مبيعات (${num(bestCh.units)} سيارة من ${num(bestCh.leads)} Lead). ${qualCh && qualCh.ch.id !== bestCh.ch.id ? `لكن أعلى جودة تحويل كانت من ${qualCh.ch.ar} (${pct(qualCh.conv)}).` : ''}` : none, 'customers');

    q('العملاء', 'c1', 'من أين جاء العملاء؟', cs.length ? cs.slice().sort((x, y) => y.leads - x.leads).slice(0, 3).map((c) => `${c.ch.ar}: ${num(c.leads)} Lead`).join(' · ') + '. التفاصيل الكاملة في صفحة العملاء ومصادرهم.' : none, 'customers');
    q('العملاء', 'c2', 'كم Lead تحول إلى Sale؟', `${num(a.units)} من أصل ${num(a.leads)} Lead = نسبة تحويل ${pct(a.conv)}.`, 'customers');
    q('العملاء', 'c3', 'كم تكلفة الحصول على العميل؟', `تكلفة الـ Lead ${sar(a.cpl)}، وتكلفة البيعة الواحدة ${sar(a.cps)} (إجمالي تسويق ${sar(a.mkt)}).`, 'customers');
    q('العملاء', 'c4', 'أي قناة جلبت عملاء بجودة أعلى؟', qualCh ? `${qualCh.ch.ar} بنسبة تحويل ${pct(qualCh.conv)}${cheapCh ? `، وأقل تكلفة للبيعة كانت ${cheapCh.ch.ar} (${sar(cheapCh.cps)})` : ''}. الجودة = نسبة التحويل وليس عدد الرسائل.` : none, 'customers');

    q('المالية', 'f1', 'كم بعنا كاش؟', `${sar(a.cash)} من ${num(a.cashN)} سيارة (${pct((a.cash / Math.max(1, a.rev)) * 100)}).`, 'finance');
    q('المالية', 'f2', 'كم بعنا تمويل؟', `${sar(a.fin)} من ${num(a.finN)} سيارة (${pct((a.fin / Math.max(1, a.rev)) * 100)}).`, 'finance');
    q('المالية', 'f3', 'كم تم تحصيله؟', `${sar(a.collected)} = ${pct(a.collRate)} من قيمة المبيعات.`, 'collection');
    q('المالية', 'f4', 'كم المتبقي؟', `${sar(a.remaining)} لم يُحصّل بعد.`, 'collection');
    q('المالية', 'f5', 'كم المتأخر؟', `${sar(a.overdue)} متأخرة على ${num(a.overdueN)} فاتورة.`, 'collection');

    q('المخزون', 'i1', 'وش السيارات الموجودة؟', `${num(M.inv.avail)} سيارة متوفرة و ${num(M.inv.reserved)} محجوزة من ${num(new Set(inv.map((x) => x.vid)).size)} موديل.`, 'inventory');
    q('المخزون', 'i2', 'وش السيارات اللي جلست فترة طويلة؟', M.inv.aged90 ? `${num(M.inv.aged90)} سيارة تجاوزت 90 يوماً، أقدمها: ${inv.slice().sort((x, y) => y.days - x.days).slice(0, 3).map((x) => `${vName(x.vid)} (${num(x.days)} يوم)`).join('، ')}.` : `لا توجد سيارات تجاوزت 90 يوماً. ${num(M.inv.aged60)} سيارة تجاوزت 60 يوماً.`, 'inventory');
    q('المخزون', 'i3', 'كم قيمة المخزون؟', `${sar(M.inv.value)} بسعر التكلفة.`, 'inventory');
    q('المخزون', 'i4', 'أي موديلات بطيئة الحركة؟', slowModels.length ? slowModels.map((x) => `${x.v.full} (متوسط ${num(x.avgDays)} يوم، مبيعات ${num(x.units)})`).join('، ') + '.' : none, 'inventory');

    q('الربحية', 'p1', 'أي سيارة تحقق أعلى هامش؟', tM ? `${tM.v.full} بهامش ${pct(tM.margin)}.` : none, 'profit');
    q('الربحية', 'p2', 'هل السيارة الأكثر مبيعاً هي الأكثر ربحاً؟', tS && tP ? (tS.v.id === tP.v.id ? `نعم في هذه الفترة: ${tS.v.full} هي الأكثر مبيعاً والأكثر ربحاً (${sar(tP.profit)}).` : `لا. الأكثر مبيعاً ${tS.v.full} (${num(tS.units)} سيارة، ربح ${sar(tS.profit)})، أما الأكثر ربحاً فهي ${tP.v.full} (${num(tP.units)} سيارة، ربح ${sar(tP.profit)}).`) : none, 'profit');
    q('الربحية', 'p3', 'أي فئة تحقق أكبر ربح؟', tCat ? `${D.BODY_AR[tCat.b]} بإجمالي ربح ${sar(tCat.profit)} من ${num(tCat.n)} سيارة.` : none, 'profit');
    q('الربحية', 'p4', 'أي ماركة تحقق أكبر Revenue؟', tB ? `${D.BRANDS[tB.b].ar} بإيراد ${sar(tB.rev)} وربح ${sar(tB.profit)}.` : none, 'profit');
    return Q;
  }
  function qaSection(M) {
    const Q = QA(M);
    const cats = ['المبيعات', 'العملاء', 'المالية', 'المخزون', 'الربحية'];
    const cur = S.ui.qaOpen;
    return panel('أسئلة الإدارة', null, `
      <div class="switch qa-tabs">${cats.map((c) => `<span class="opt${cur === c ? ' active' : ''}" data-set="qaOpen|${c}">${c}</span>`).join('')}</div>
      <div class="qa-list">${Q.filter((x) => x.cat === cur).map((x) => `
        <div class="qa"><div class="qa-q">${icon('check')}${esc(x.text)}</div><div class="qa-a">${esc(x.ans)}</div>
        <button class="link" data-nav="${x.page}">عرض التفاصيل ←</button></div>`).join('')}</div>`, { sub: 'إجابات تلقائية محسوبة من البيانات حسب الفلاتر الحالية', cls: 'qa-panel' });
  }

  /* ===================================================================
     2) VEHICLES
     =================================================================== */
  function vehicles(M) {
    const st = A.vehStats(M.inq, M.sales);
    const q = (S.ui.vehSearch || '').trim().toLowerCase();
    let list = D.V.filter((v) => (!S.f.brand || v.brand === S.f.brand) && (!S.f.vid || v.id === S.f.vid) && (!S.f.body || v.body === S.f.body) && (!S.f.cat || v.cat === S.f.cat) && (!S.ui.vehBody || v.body === S.ui.vehBody));
    if (q) list = list.filter((v) => (v.full + ' ' + v.ar + ' ' + v.brandAr + ' ' + v.trim).toLowerCase().includes(q));
    const k = S.ui.vehSort;
    const key = { units: (v) => st[v.id].units, rev: (v) => st[v.id].rev, margin: (v) => st[v.id].margin, conv: (v) => st[v.id].conv, inq: (v) => st[v.id].inq, price: (v) => v.price };
    list.sort((a, b) => key[k](b) - key[k](a));
    const cards = list.map((v) => {
      const s = st[v.id];
      return `<article class="vcard" data-vehicle="${v.id}" tabindex="0" role="button">
        <div class="vimg" data-img-v="${v.id}" data-view="front"></div>
        <div class="vtags"><span>${esc(D.BODY_AR[v.body])}</span><span>${esc(v.fuel)}</span>${v.cat !== 'standard' ? `<span class="acc">${esc(D.CAT_AR[v.cat])}</span>` : ''}</div>
        <div class="vhead"><div class="vbrand">${esc(v.brandAr)} · ${esc(v.brand)}</div><h3>${esc(v.model)} <small>${esc(v.trim)}</small></h3><div class="vprice">${sar(v.price)}</div></div>
        <dl class="vspec">
          <div><dt>سنة الموديل</dt><dd>${v.year}</dd></div><div><dt>بلد الصنع</dt><dd>${esc(v.origin)}</dd></div>
          <div><dt>المحرك</dt><dd>${esc(v.engine)}</dd></div><div><dt>الدفع</dt><dd>${esc(v.drive)}</dd></div>
        </dl>
        <div class="vstats">
          <div><b>${num(s.inq)}</b><span>طلبات</span></div><div><b>${num(s.units)}</b><span>مبيعات</span></div>
          <div><b>${short(s.rev)}</b><span>إيراد</span></div><div><b>${pct(s.margin)}</b><span>هامش</span></div><div><b>${pct(s.conv)}</b><span>تحويل</span></div>
        </div>
      </article>`;
    }).join('');
    return `
      <div class="page-head"><div><div class="kicker">${icon('car')} مستكشف السيارات</div><h1>وش نبيع؟</h1><p>${num(list.length)} موديل من ${num(Object.keys(D.BRANDS).length)} ماركة. اضغط أي سيارة لفتح ملفها الكامل.</p></div></div>
      <div class="toolbar">
        <label class="search">${icon('search')}<input type="search" placeholder="ابحث: تويوتا، Camry، باترول…" value="${esc(S.ui.vehSearch)}" data-ui-live="vehSearch"></label>
        ${sw('vehBody', [['', 'الكل'], ['Sedan', 'سيدان'], ['SUV', 'SUV'], ['Pickup', 'بيك أب']], S.ui.vehBody)}
        <label class="flt inline"><span>ترتيب حسب</span><select data-ui="vehSort">${[['units', 'الأكثر مبيعاً'], ['rev', 'الأعلى إيراداً'], ['margin', 'الأعلى هامشاً'], ['conv', 'الأعلى تحويلاً'], ['inq', 'الأكثر طلباً'], ['price', 'الأعلى سعراً']].map(([v, l]) => `<option value="${v}"${k === v ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
      </div>
      <p class="fine img-disclaimer">الصور حقيقية من Wikimedia Commons وتُعرض كصور تمثيلية للموديل وقد تختلف عن الفئة أو سنة الموديل المعروضة. المواصفات مرجعية لفئة شائعة وقد تختلف حسب السوق — تحقق دائماً من الوكيل.</p>
      <div class="vgrid">${cards || CH.empty('لا توجد سيارات مطابقة')}</div>`;
  }

  /* ===================================================================
     3) SALES
     =================================================================== */
  function sales(M) {
    const a = M.a;
    const bm = S.ui.brandMetric;
    const ctxB = A.computeWithout('brand', 'vid');
    const brandItems = [...A.groupBy(ctxB.sales, (s) => s.brand)].map(([b, arr]) => ({ b, units: arr.length, rev: arr.reduce((x, y) => x + y.price, 0) }))
      .sort((x, y) => y[bm] - x[bm]).map((x) => ({ label: D.BRANDS[x.b].ar, sub: x.b, value: x[bm], valueLabel: bm === 'rev' ? sar(x.rev) : num(x.units) + ' سيارة', attrs: { 'data-pick': 'brand|' + x.b }, active: S.f.brand === x.b }));

    const ctxModel = A.computeWithout('vid');
    const stM = A.vehStats(ctxModel.inq, ctxModel.sales);
    const modelItems = D.V.filter((v) => stM[v.id].units).sort((x, y) => stM[y.id][bm] - stM[x.id][bm]).slice(0, 15)
      .map((v) => ({ label: v.full, sub: v.ar, value: stM[v.id][bm], valueLabel: bm === 'rev' ? sar(stM[v.id].rev) : num(stM[v.id].units) + ' سيارة', attrs: { 'data-pick': 'vid|' + v.id }, active: S.f.vid === v.id }));

    const ctxT = A.computeWithout('body', 'cat');
    const bodyItems = ['Sedan', 'SUV', 'Pickup'].map((b) => { const arr = ctxT.sales.filter((s) => s.body === b); return { label: D.BODY_AR[b], sub: b, value: arr.length, valueLabel: num(arr.length) + ' · ' + short(arr.reduce((x, y) => x + y.price, 0)), attrs: { 'data-pick': 'body|' + b }, active: S.f.body === b }; });
    const catItems = [['luxury', 'Luxury'], ['hybrid', 'Hybrid'], ['electric', 'Electric']].map(([c, en]) => { const arr = ctxT.sales.filter((s) => s.cat === c); return { label: D.CAT_AR[c], sub: en, value: arr.length, valueLabel: num(arr.length) + ' · ' + short(arr.reduce((x, y) => x + y.price, 0)), attrs: { 'data-pick': 'cat|' + c }, active: S.f.cat === c }; });

    const monthItems = [];
    for (let mi = M.f.from; mi <= M.f.to; mi++) {
      const arr = M.sales.filter((s) => s.mi === mi);
      const v = bm === 'rev' ? arr.reduce((x, y) => x + y.price, 0) : arr.length;
      monthItems.push({ label: A.monthLabel(mi), value: v, valueLabel: bm === 'rev' ? sar(v) : num(v) + ' سيارة', attrs: { 'data-month': mi } });
    }

    const ctxBr = A.computeWithout('branch', 'sp');
    const branchItems = D.BRANCHES.map((b) => { const arr = ctxBr.sales.filter((s) => s.branch === b.id); const leads = ctxBr.inq.filter((r) => r.branch === b.id && r.stage >= 1).length; const v = bm === 'rev' ? arr.reduce((x, y) => x + y.price, 0) : arr.length; return { label: b.ar, sub: `${num(leads)} Lead · تحويل ${pct(leads ? (arr.length / leads) * 100 : 0)}`, value: v, valueLabel: bm === 'rev' ? sar(v) : num(v) + ' سيارة', attrs: { 'data-pick': 'branch|' + b.id }, active: S.f.branch === b.id }; }).sort((x, y) => y.value - x.value);

    const spm = S.ui.spMetric;
    const ctxSp = A.computeWithout('sp');
    const spItems = D.TEAM.filter((t) => !S.f.branch || t.branch === S.f.branch).map((t) => {
      const arr = ctxSp.sales.filter((s) => s.sp === t.id); const leads = ctxSp.inq.filter((r) => r.sp === t.id && r.stage >= 1).length;
      const o = { units: arr.length, rev: arr.reduce((x, y) => x + y.price, 0), conv: leads ? (arr.length / leads) * 100 : 0 };
      return { label: t.ar, sub: D.brById[t.branch].ar.split(' — ')[0] + ` · ${num(leads)} Lead`, value: o[spm], valueLabel: spm === 'rev' ? sar(o.rev) : spm === 'conv' ? pct(o.conv) : num(o.units) + ' سيارة', attrs: { 'data-pick': 'sp|' + t.id }, active: S.f.sp === t.id };
    }).sort((x, y) => y.value - x.value);

    // heatmap model × branch (revenue), top 12 models by actual revenue
    const ctxH = A.computeWithout('branch', 'sp');
    const stH = A.vehStats(ctxH.inq, ctxH.sales);
    const topH = D.V.filter((v) => stH[v.id].rev > 0).sort((x, y) => stH[y.id].rev - stH[x.id].rev).slice(0, 12);
    const cell = {}; let hmax = 0;
    ctxH.sales.forEach((s) => { const k2 = s.vid + '|' + s.branch; cell[k2] = (cell[k2] || 0) + s.price; hmax = Math.max(hmax, cell[k2]); });
    const heat = topH.length ? `<div class="heat" style="grid-template-columns: 1.4fr repeat(${D.BRANCHES.length}, 1fr)">
      <div class="hm-h"></div>${D.BRANCHES.map((b) => `<div class="hm-h">${esc(b.ar.split(' — ')[0])}</div>`).join('')}
      ${topH.map((v) => `<div class="hm-row" data-vehicle="${v.id}">${esc(v.full)}</div>${D.BRANCHES.map((b) => { const val = cell[v.id + '|' + b.id] || 0; const r = hmax ? val / hmax : 0; return `<div class="hm-cell" style="background:rgba(45,212,191,${(0.06 + r * 0.74).toFixed(3)})" data-tip="${esc(v.full + ' · ' + b.ar + ': ' + sar(val))}">${val ? short(val) : '—'}</div>`; }).join('')}`).join('')}
    </div>` : CH.empty();

    return `
      <div class="page-head"><div><div class="kicker">${icon('chart')} تحليل المبيعات</div><h1>كم بعنا؟ ووش بعنا؟</h1><p>اضغط أي عمود أو شريط لفلترة اللوحة بالكامل. اضغطه مرة أخرى لإلغاء الفلتر.</p></div>
        <div class="p-tools">${sw('brandMetric', [['rev', 'بالإيراد'], ['units', 'بالعدد']], bm)}</div></div>
      <div class="kpi-grid k4">
        ${kpi('kpi.revenue', 'إجمالي المبيعات', 'money', a.rev, P(M, 'rev'), sar, { spark: spark(M, 'rev') })}
        ${kpi('kpi.units', 'السيارات المباعة', 'car', a.units, P(M, 'units'), num, { spark: spark(M, 'units'), unit: 'سيارة' })}
        ${kpi('kpi.avg', 'متوسط قيمة السيارة', 'tag', a.avg, P(M, 'avg'), sar, { spark: spark(M, 'avg') })}
        ${kpi('kpi.profit', 'إجمالي الربح', 'percent', a.profit, P(M, 'profit'), sar, { spark: spark(M, 'profit') })}
      </div>
      <div class="grid g2">
        ${panel('المبيعات حسب الماركة', 'chart.brand', CH.hbars(brandItems))}
        ${panel('المبيعات حسب الموديل (أعلى 15)', 'chart.model', CH.hbars(modelItems, { compact: true }))}
      </div>
      <div class="grid g3">
        ${panel('المبيعات حسب الشهر', 'chart.month', CH.columns(monthItems), { cls: 'span2', sub: 'اضغط شهراً لحصر اللوحة عليه' })}
        ${panel('المبيعات حسب نوع السيارة', 'chart.type', `<h5 class="grp">نوع الهيكل</h5>${CH.hbars(bodyItems)}<h5 class="grp">فئات خاصة <small>(السيارة قد تكون سيدان وهجينة معاً)</small></h5>${CH.hbars(catItems)}`)}
      </div>
      <div class="grid g2">
        ${panel('المبيعات حسب الفرع', 'chart.branch', CH.hbars(branchItems))}
        ${panel('المبيعات حسب المندوب', 'chart.sp', CH.hbars(spItems, { compact: true }), { tools: sw('spMetric', [['units', 'العدد'], ['rev', 'الإيراد'], ['conv', 'التحويل']], spm) })}
      </div>
      ${panel('مصفوفة الإيراد: الموديل × الفرع', 'chart.heat', heat, { sub: 'أعلى 12 موديل بالإيراد الفعلي — كلما كانت الخلية أغمق كان الإيراد أعلى' })}`;
  }

  /* ===================================================================
     4) CUSTOMERS & SOURCES
     =================================================================== */
  function funnelStages(inq, sales, prefix) {
    const a = A.agg(inq, sales);
    return [
      { label: 'مشاهدة الإعلان', value: a.adViews, attrs: { 'data-explain': 'chart.funnel' } },
      { label: 'استفسار', value: a.inq, attrs: { 'data-explain': 'kpi.inquiries' } },
      { label: 'عميل محتمل Lead', value: a.leads, attrs: { 'data-explain': 'kpi.leads' } },
      { label: 'زيارة المعرض', value: a.visits, attrs: { 'data-explain': 'chart.funnel' } },
      { label: 'تجربة قيادة', value: a.td, attrs: { 'data-explain': 'chart.funnel' } },
      { label: 'عرض سعر', value: a.quotes, attrs: { 'data-explain': 'chart.funnel' } },
      { label: 'اعتماد الدفع / التمويل', value: a.payok, attrs: { 'data-explain': 'chart.funnel' } },
      { label: 'بيع', value: a.units, attrs: { 'data-explain': 'kpi.conv' } },
      { label: 'تحصيل كامل', value: a.fullyCollected, attrs: { 'data-explain': 'kpi.collected' } }
    ];
  }
  function customers(M) {
    const a = M.a;
    const ctx = A.computeWithout('ch');
    const cs = chStats(ctx);
    const m = S.ui.chMetric;
    const lost = [...A.groupBy(M.inq.filter((r) => r.status === 'lost' && r.stage >= 1), (r) => r.lost)].map(([k, arr]) => ({ label: k, value: arr.length, valueLabel: num(arr.length) + ' عميل' })).sort((x, y) => y.value - x.value);
    const table = `<div class="table-wrap"><table class="tbl"><thead><tr><th>القناة</th><th>استفسارات</th><th>Leads</th><th>التكلفة</th><th>تكلفة Lead</th><th>مبيعات</th><th>التحويل</th><th>الإيراد</th><th>تكلفة البيعة</th></tr></thead><tbody>
      ${cs.sort((x, y) => y.units - x.units).map((c) => `<tr data-chan="${c.ch.id}" tabindex="0" class="${S.f.ch === c.ch.id ? 'active' : ''}"><td><b>${esc(c.ch.ar)}</b></td><td>${num(c.inq)}</td><td>${num(c.leads)}</td><td>${sar(c.mkt)}</td><td>${c.leads ? sar(c.cpl) : '—'}</td><td>${num(c.units)}</td><td>${pct(c.conv)}</td><td>${sar(c.rev)}</td><td>${c.units ? sar(c.cps) : '—'}</td></tr>`).join('')}
    </tbody></table></div>
    <p class="fine">الزيارة المباشرة لا تحمل تكلفة إعلانية مباشرة في هذا النموذج؛ التوصية تحمل مكافأة 1,500 ر.س لكل بيعة (قيم تجريبية).</p>`;
    return `
      <div class="page-head"><div><div class="kicker">${icon('users')} العملاء ومصادرهم</div><h1>من وين جابونا؟</h1><p>ارتفاع عدد العملاء لا يعني بالضرورة ارتفاع المبيعات. قارن العدد مع التحويل والإيراد والتكلفة.</p></div></div>
      <div class="kpi-grid k6">
        ${kpi('kpi.inquiries', 'الاستفسارات', 'inbox', a.inq, P(M, 'inq'), num, { spark: spark(M, 'inq') })}
        ${kpi('kpi.leads', 'Leads', 'users', a.leads, P(M, 'leads'), num, { spark: spark(M, 'leads') })}
        ${kpi('kpi.conv', 'نسبة التحويل', 'funnel', a.conv, P(M, 'conv'), (v) => pct(v), { spark: spark(M, 'conv') })}
        ${kpi('kpi.mkt', 'تكلفة التسويق', 'megaphone', a.mkt, P(M, 'mkt'), sar, { spark: spark(M, 'mkt'), inverse: true })}
        ${kpi('kpi.cpl', 'تكلفة الـ Lead', 'target', a.cpl, P(M, 'cpl'), sar, { spark: spark(M, 'cpl'), inverse: true })}
        ${kpi('kpi.cps', 'تكلفة البيعة', 'tag', a.cps, P(M, 'cps'), sar, { spark: spark(M, 'cps'), inverse: true })}
      </div>
      <div class="grid g2">
        ${panel('من أين جاء العملاء؟', 'chart.channels', channelBars(M, m), { tools: sw('chMetric', [['leads', 'Leads'], ['units', 'مبيعات'], ['conv', 'تحويل'], ['rev', 'إيراد'], ['cpl', 'تكلفة Lead'], ['cps', 'تكلفة بيعة']], m), sub: 'اضغط قناة لقراءة تحليلها' })}
        ${panel('قمع المبيعات', 'chart.funnel', CH.funnel(funnelStages(M.inq, M.sales)), { sub: 'النسبة يساراً = الانتقال من المرحلة السابقة' })}
      </div>
      ${panel('مقارنة القنوات', 'chart.channels', table)}
      ${panel('لماذا خسرنا عملاء؟', 'chart.lost', CH.hbars(lost))}`;
  }

  /* ===================================================================
     5) CASH vs FINANCE
     =================================================================== */
  function finance(M) {
    const a = M.a;
    const cashS = M.sales.filter((s) => s.pay === 'cash'), finS = M.sales.filter((s) => s.pay !== 'cash');
    const side = (arr) => ({ n: arr.length, v: arr.reduce((x, y) => x + y.price, 0), rem: arr.reduce((x, y) => x + y.remaining, 0), od: arr.filter((s) => s.coll === 'overdue').reduce((x, y) => x + y.remaining, 0) });
    const c = side(cashS), f = side(finS);
    const tot = c.v + f.v || 1;
    const split = `<div class="split" data-explain="chart.cashfin" tabindex="0">
        <div class="split-bar"><div class="sp-cash" style="flex:${c.v || 0.0001}"><b>${pct((c.v / tot) * 100)}</b> كاش</div><div class="sp-fin" style="flex:${f.v || 0.0001}"><b>${pct((f.v / tot) * 100)}</b> تمويل</div></div>
        <div class="split-cols">
          <div><h5><i class="sw s1"></i>كاش</h5><dl><dt>القيمة</dt><dd>${sar(c.v)}</dd><dt>عدد السيارات</dt><dd>${num(c.n)}</dd><dt>متوسط الصفقة</dt><dd>${sar(c.n ? c.v / c.n : 0)}</dd><dt>المتبقي</dt><dd>${sar(c.rem)}</dd><dt>المتأخر</dt><dd>${sar(c.od)}</dd></dl></div>
          <div><h5><i class="sw s2"></i>تمويل (بنكي + شركة + تأجير)</h5><dl><dt>القيمة</dt><dd>${sar(f.v)}</dd><dt>عدد السيارات</dt><dd>${num(f.n)}</dd><dt>متوسط الصفقة</dt><dd>${sar(f.n ? f.v / f.n : 0)}</dd><dt>المتبقي</dt><dd>${sar(f.rem)}</dd><dt>المتأخر</dt><dd>${sar(f.od)}</dd></dl></div>
        </div>
        <p class="callout">${icon('info')} مبيعات التمويل قد تزيد حجم المبيعات، لكن الإدارة تحتاج أيضاً إلى متابعة التحصيل والمبالغ المستحقة.</p>
      </div>`;
    const fin = [...A.groupBy(M.sales.filter((s) => s.financier), (s) => s.financier)].map(([k, arr]) => ({ label: k, sub: `${num(arr.length)} صفقة · متبقٍ ${sar(arr.reduce((x, y) => x + y.remaining, 0))}`, value: arr.reduce((x, y) => x + y.price, 0), valueLabel: sar(arr.reduce((x, y) => x + y.price, 0)) })).sort((x, y) => y.value - x.value);
    const avgBy = D.PAYMENTS.map((p) => { const arr = M.sales.filter((s) => s.pay === p.id); return { label: p.ar, value: arr.length ? arr.reduce((x, y) => x + y.price, 0) / arr.length : 0, valueLabel: sar(arr.length ? arr.reduce((x, y) => x + y.price, 0) / arr.length : 0), sub: num(arr.length) + ' صفقة', attrs: { 'data-pick': 'pay|' + p.id }, active: S.f.pay === p.id }; });
    const trend = CH.line(M.series.map((s) => s.label), [{ name: 'كاش', cls: 's1', values: M.series.map((s) => s.cash) }, { name: 'تمويل', cls: 's2', values: M.series.map((s) => s.fin) }], { area: false, tipFmt: sar });
    return `
      <div class="page-head"><div><div class="kicker">${icon('bank')} طريقة الدفع</div><h1>كيف دفعوا؟</h1><p>الكاش يعني سيولة فورية، والتمويل يعني حجم مبيعات أكبر مع تحصيل لاحق من جهة التمويل.</p></div></div>
      <div class="kpi-grid k4">
        ${kpi('kpi.cash', 'إجمالي مبيعات الكاش', 'cash', a.cash, P(M, 'cash'), sar, { spark: spark(M, 'cash') })}
        ${kpi('kpi.finance', 'إجمالي مبيعات التمويل', 'bank', a.fin, P(M, 'fin'), sar, { spark: spark(M, 'fin') })}
        ${kpi('kpi.cash', 'عدد سيارات الكاش', 'car', a.cashN, P(M, 'cashN'), num, { spark: spark(M, 'cashN'), unit: 'سيارة' })}
        ${kpi('kpi.finance', 'عدد سيارات التمويل', 'car', a.finN, P(M, 'finN'), num, { spark: spark(M, 'finN'), unit: 'سيارة' })}
        ${kpi('kpi.avg', 'متوسط قيمة الصفقة', 'tag', a.avg, P(M, 'avg'), sar, { spark: spark(M, 'avg') })}
        ${kpi('kpi.collected', 'إجمالي المبالغ المحصلة', 'wallet', a.collected, P(M, 'collected'), sar, { spark: spark(M, 'collected') })}
        ${kpi('kpi.remaining', 'المتبقي للتحصيل', 'clock', a.remaining, P(M, 'remaining'), sar, { spark: spark(M, 'remaining'), inverse: true, sparkCls: 'warm' })}
      </div>
      <div class="grid g3">
        ${panel('الكاش مقابل التمويل', 'chart.cashfin', split, { cls: 'span2' })}
        ${payDonut(M, 'توزيع طرق الدفع')}
      </div>
      <div class="grid g2">
        ${panel('اتجاه الكاش والتمويل شهرياً', 'chart.cashfin', trend)}
        ${panel('متوسط الصفقة حسب طريقة الدفع', 'chart.pay', CH.hbars(avgBy))}
      </div>
      ${panel('جهات التمويل', 'chart.banks', CH.hbars(fin, { compact: true }), { sub: 'أسماء البنوك للتوضيح فقط؛ كل الأرقام وهمية' })}`;
  }

  /* ===================================================================
     6) COLLECTION
     =================================================================== */
  const COLL_AR = { paid: 'محصّل بالكامل', pending: 'قيد التحصيل', overdue: 'متأخر' };
  const BUCKETS = [['0–7 أيام', 0, 7, 'b1'], ['8–30 يوم', 8, 30, 'b2'], ['31–60 يوم', 31, 60, 'b3'], ['61–90 يوم', 61, 90, 'b4'], ['+90 يوم', 91, 1e9, 'b5']];
  function collection(M) {
    const a = M.a;
    const credit = M.sales.filter((s) => s.upfront < s.price);
    const od = M.sales.filter((s) => s.coll === 'overdue');
    const bk = BUCKETS.map(([l, lo, hi, cls]) => { const arr = od.filter((s) => s.daysOverdue >= lo && s.daysOverdue <= hi); return { label: l, value: arr.reduce((x, y) => x + y.remaining, 0), valueLabel: sar(arr.reduce((x, y) => x + y.remaining, 0)), sub: num(arr.length) + ' فاتورة', cls, n: arr.length }; });
    const notDue = M.sales.filter((s) => s.coll === 'pending').reduce((x, y) => x + y.remaining, 0);
    const tab = S.ui.collTab;
    let rows = tab === 'open' ? M.sales.filter((s) => s.remaining > 0) : tab === 'all' ? credit : M.sales.filter((s) => s.coll === tab);
    const sk = S.ui.collSort;
    const sorter = { overdue: (x, y) => y.daysOverdue - x.daysOverdue || y.remaining - x.remaining, remaining: (x, y) => y.remaining - x.remaining, date: (x, y) => y.date - x.date, due: (x, y) => x.dueDate - y.dueDate };
    rows = rows.slice().sort(sorter[sk]);
    const shown = rows.slice(0, 80);
    const table = `<div class="tbl-tools">${sw('collTab', [['open', 'غير مكتمل التحصيل'], ['overdue', 'متأخر'], ['pending', 'قيد التحصيل'], ['paid', 'محصّل'], ['all', 'كل المبيعات الآجلة']], tab)}
      <label class="flt inline"><span>ترتيب</span><select data-ui="collSort">${[['overdue', 'الأكثر تأخيراً'], ['remaining', 'الأعلى متبقياً'], ['due', 'الأقرب استحقاقاً'], ['date', 'الأحدث بيعاً']].map(([v, l]) => `<option value="${v}"${sk === v ? ' selected' : ''}>${l}</option>`).join('')}</select></label></div>
      <div class="table-wrap"><table class="tbl"><thead><tr><th>العميل</th><th>الفاتورة</th><th>السيارة</th><th>تاريخ البيع</th><th>الإجمالي</th><th>المدفوع</th><th>المتبقي</th><th>الاستحقاق</th><th>أيام التأخير</th><th>الحالة</th></tr></thead><tbody>
      ${shown.map((s) => `<tr data-sale="${s.inv}" tabindex="0"><td>${esc(s.customer)}</td><td class="mono">${s.inv}</td><td>${esc(vName(s.vid))}</td><td class="mono">${ymd(s.date)}</td><td>${sar(s.price)}</td><td>${sar(s.paid)}</td><td><b>${sar(s.remaining)}</b></td><td class="mono">${ymd(s.dueDate)}</td><td>${s.daysOverdue ? num(s.daysOverdue) : '—'}</td><td><span class="pill ${s.coll}">${COLL_AR[s.coll]}</span></td></tr>`).join('') || `<tr><td colspan="10">${CH.empty('لا توجد فواتير في هذا التصنيف')}</td></tr>`}
      </tbody></table></div>${rows.length > shown.length ? `<p class="fine">يعرض أول ${num(shown.length)} من ${num(rows.length)} فاتورة حسب الترتيب المختار.</p>` : ''}`;
    return `
      <div class="page-head"><div><div class="kicker">${icon('wallet')} التحصيل</div><h1>كم حصلنا؟ وكم باقي؟</h1><p>تاريخ المرجع: ${ymd(D.TODAY)}. البيع لا يعني وصول المال؛ هذه الصفحة تتابع وصوله فعلاً.</p></div></div>
      <div class="kpi-grid k4">
        ${kpi('kpi.credit', 'إجمالي المبيعات الآجلة', 'calendar', a.credit, P(M, 'credit'), sar, { spark: spark(M, 'credit') })}
        ${kpi('kpi.collected', 'المبلغ المحصل', 'wallet', a.collected, P(M, 'collected'), sar, { spark: spark(M, 'collected') })}
        ${kpi('kpi.remaining', 'المبلغ المتبقي', 'clock', a.remaining, P(M, 'remaining'), sar, { inverse: true, spark: spark(M, 'remaining'), sparkCls: 'warm' })}
        ${kpi('kpi.overdue', 'المتأخر', 'alert', a.overdue, P(M, 'overdue'), sar, { inverse: true, cls: a.overdue ? 'alert' : '' })}
        ${kpi('kpi.due7', 'المستحق خلال 7 أيام', 'calendar', a.due7, null, sar, { note: 'رقم تخطيطي' })}
        ${kpi('kpi.due30', 'المستحق خلال 30 يوم', 'calendar', a.due30, null, sar, { note: 'رقم تخطيطي' })}
        ${kpi('kpi.collRate', 'نسبة التحصيل', 'percent', a.collRate, P(M, 'collRate'), (v) => pct(v), { spark: spark(M, 'collRate') })}
      </div>
      <div class="grid g2">
        ${panel('أعمار الذمم المتأخرة', 'chart.aging', CH.stack(bk.map((b) => ({ label: b.label, value: b.value, valueLabel: b.valueLabel, cls: b.cls })), { empty: 'لا توجد مبالغ متأخرة' }) + CH.hbars(bk.map((b) => Object.assign({}, b, { color: `var(--${b.cls})` }))), { sub: `إضافة إلى ${sar(notDue)} غير مستحقة بعد` })}
        ${panel('خطة التصعيد المقترحة', 'chart.aging', `<ol class="steps">
          <li><b>0–7 أيام</b><span>تذكير ودي برسالة/اتصال من المندوب.</span></li>
          <li><b>8–30 يوم</b><span>متابعة من قسم التحصيل مع جهة التمويل لاستكمال الأوراق.</span></li>
          <li><b>31–60 يوم</b><span>تصعيد لمدير الفرع واجتماع أسبوعي.</span></li>
          <li><b>61–90 يوم</b><span>إنذار رسمي ومراجعة الضمانات.</span></li>
          <li><b>أكثر من 90 يوم</b><span>قرار إداري: إجراء نظامي أو تسوية.</span></li></ol>`)}
      </div>
      ${panel('سجل الفواتير', null, table, { sub: 'اضغط أي صف لعرض تفاصيل الفاتورة' })}`;
  }

  /* ===================================================================
     7) INVENTORY
     =================================================================== */
  const STATUS_AR = { available: 'متوفر', reserved: 'محجوز', sold: 'مباع' };
  function inventory(M) {
    const I = M.inv, stock = I.list;
    const soldInRange = D.inventory.filter((x) => x.status === 'sold' && M.sales.some((s) => s.inv === x.saleInv));
    const invMode = S.ui.invMode || 'age';
    let items;
    if (invMode === 'age') items = [['1–30 يوم', 0, 30, 's1'], ['31–60 يوم', 31, 60, 's3'], ['61–90 يوم', 61, 90, 's4'], ['+90 يوم (راكد)', 91, 1e9, 's2']].map(([l, lo, hi, cls]) => { const n = stock.filter((x) => x.days >= lo && x.days <= hi).length; return { label: l, value: n, valueLabel: num(n) + ' سيارة', cls }; });
    else if (invMode === 'status') items = [['available', 's1'], ['reserved', 's4'], ['sold', 's3']].map(([k, cls]) => { const n = k === 'sold' ? soldInRange.length : stock.filter((x) => x.status === k).length; return { label: STATUS_AR[k], value: n, valueLabel: num(n) + ' سيارة', cls, attrs: { 'data-set': 'invTab|' + k } }; });
    else {
      const st = A.vehStats(M.inq, M.sales);
      items = D.V.filter((v) => st[v.id].inq).sort((x, y) => st[y.id].inq - st[x.id].inq).slice(0, 4).map((v, i) => ({ label: v.full, value: st[v.id].inq, valueLabel: num(st[v.id].inq) + ' طلب · مخزون ' + num(st[v.id].stock), cls: 's' + (i + 1), attrs: { 'data-vehicle': v.id } }));
    }
    const view = S.ui.invView;
    const chart = view === 'pie' ? CH.donut(items) : CH.hbars(items.map((x) => Object.assign({}, x, { color: `var(--${x.cls})` })));
    const controls = `<div class="inv-controls">
      <button class="inv-btn${invMode === 'age' ? ' active' : ''}" data-set="invMode|age">${icon('clock')}معدل دوران المخزون</button>
      <button class="inv-btn${invMode === 'status' ? ' active' : ''}" data-set="invMode|status">${icon('layers')}الحالة</button>
      <button class="inv-btn${invMode === 'demand' ? ' active' : ''}" data-set="invMode|demand">${icon('target')}الأكثر طلباً</button>
      <div class="inv-views"><button class="view-toggle${view === 'bars' ? ' active' : ''}" data-set="invView|bars" title="أعمدة">${icon('bars')}</button><button class="view-toggle${view === 'pie' ? ' active' : ''}" data-set="invView|pie" title="دائرة">${icon('pie')}</button></div></div>`;

    const st = A.vehStats(M.inq, M.sales);
    const byModel = D.V.filter((v) => (st[v.id].stock + st[v.id].reserved) && (!S.f.brand || v.brand === S.f.brand) && (!S.f.vid || v.id === S.f.vid) && (!S.f.body || v.body === S.f.body) && (!S.f.cat || v.cat === S.f.cat))
      .sort((x, y) => (st[y.id].stock + st[y.id].reserved) - (st[x.id].stock + st[x.id].reserved))
      .map((v) => ({ label: v.full, sub: `متوسط ${num(st[v.id].avgDays)} يوم · مبيعات الفترة ${num(st[v.id].units)}`, value: st[v.id].stock + st[v.id].reserved, valueLabel: num(st[v.id].stock + st[v.id].reserved) + ' سيارة', attrs: { 'data-vehicle': v.id }, color: st[v.id].avgDays > 75 ? 'var(--warn)' : '' }));

    const tab = S.ui.invTab;
    let rows = tab === 'sold' ? soldInRange : tab === 'all' ? stock.concat(soldInRange) : stock.filter((x) => x.status === tab);
    const sk = S.ui.invSort;
    rows = rows.slice().sort({ days: (x, y) => y.days - x.days, margin: (x, y) => (y.price - y.cost) / y.price - (x.price - x.cost) / x.price, price: (x, y) => y.price - x.price, cost: (x, y) => y.cost - x.cost }[sk]);
    const shown = rows.slice(0, 80);
    const ageCls = (d) => (d > 90 ? 'b5' : d > 60 ? 'b4' : d > 30 ? 'b3' : 'b1');
    const table = `<div class="tbl-tools">${sw('invTab', [['available', 'متوفر'], ['reserved', 'محجوز'], ['sold', 'مباع (الفترة)'], ['all', 'الكل']], tab)}
      <label class="flt inline"><span>ترتيب</span><select data-ui="invSort">${[['days', 'الأطول بقاءً'], ['margin', 'الأعلى هامشاً'], ['price', 'الأعلى سعراً'], ['cost', 'الأعلى تكلفة']].map(([v, l]) => `<option value="${v}"${sk === v ? ' selected' : ''}>${l}</option>`).join('')}</select></label></div>
      <div class="table-wrap"><table class="tbl"><thead><tr><th>السيارة</th><th>الموديل / الفئة</th><th>السنة</th><th>اللون</th><th>رقم المخزون</th><th>تكلفة الشراء</th><th>سعر البيع</th><th>الهامش</th><th>أيام المخزون</th><th>الحالة</th></tr></thead><tbody>
      ${shown.map((x) => { const v = D.byId[x.vid]; const mg = ((x.price - x.cost) / x.price) * 100; return `<tr data-stock="${x.stock}" tabindex="0"><td><b>${esc(v.brandAr)}</b> ${esc(v.brand)}</td><td>${esc(v.model)} <small>${esc(v.trim)}</small></td><td>${x.year}</td><td>${esc(x.color)}</td><td class="mono">${x.stock}</td><td>${sar(x.cost)}</td><td>${sar(x.price)}</td><td>${pct(mg)}</td><td><span class="age ${ageCls(x.days)}">${num(x.days)} يوم</span></td><td><span class="pill ${x.status}">${STATUS_AR[x.status]}</span></td></tr>`; }).join('') || `<tr><td colspan="10">${CH.empty()}</td></tr>`}
      </tbody></table></div>${rows.length > shown.length ? `<p class="fine">يعرض أول ${num(shown.length)} من ${num(rows.length)} سيارة.</p>` : ''}`;
    return `
      <div class="page-head"><div><div class="kicker">${icon('box')} مخزون السيارات</div><h1>وش الموجود بالمخزون؟</h1><p>المخزون لحظي كما في ${ymd(D.TODAY)} (لا يتأثر بفلتر التاريخ)، أما المبيعات فحسب الفترة المختارة.</p></div></div>
      <div class="kpi-grid k4">
        ${kpi('kpi.stock', 'السيارات المتوفرة', 'car', I.avail, null, num, { note: 'لقطة لحظية', unit: 'سيارة' })}
        ${kpi('kpi.units', 'السيارات المباعة (الفترة)', 'check', I.sold, P(M, 'units'), num, { unit: 'سيارة', spark: spark(M, 'units') })}
        ${kpi('kpi.reserved', 'السيارات المحجوزة', 'lock', I.reserved, null, num, { note: 'لقطة لحظية', unit: 'سيارة' })}
        ${kpi('kpi.invDays', 'متوسط أيام المخزون', 'clock', I.avgDays, null, num, { note: 'لقطة لحظية', unit: 'يوم' })}
        ${kpi('kpi.invValue', 'قيمة المخزون (بالتكلفة)', 'money', I.value, null, sar, { note: 'لقطة لحظية' })}
        ${kpi('kpi.aged30', 'تجاوزت 30 يوماً', 'calendar', I.aged30, null, num, { note: 'لقطة لحظية', unit: 'سيارة' })}
        ${kpi('kpi.aged60', 'تجاوزت 60 يوماً', 'alert', I.aged60, null, num, { note: 'لقطة لحظية', unit: 'سيارة' })}
        ${kpi('kpi.aged90', 'تجاوزت 90 يوماً', 'alert', I.aged90, null, num, { note: 'لقطة لحظية', unit: 'سيارة', cls: I.aged90 ? 'alert' : '' })}
      </div>
      <div class="grid g2">
        ${panel('مركز المخزون', invMode === 'status' ? 'chart.invStatus' : 'chart.invAge', controls + `<div class="inv-chart">${chart}</div>`)}
        ${panel('المخزون حسب الموديل', 'chart.stockModel', CH.hbars(byModel, { compact: true }), { sub: 'اللون البرتقالي = متوسط أيام أكثر من 75 يوماً', cls: 'scroll' })}
      </div>
      ${panel('جدول المخزون', null, table, { sub: 'اضغط أي سيارة لعرض تفاصيلها' })}`;
  }

  /* ===================================================================
     8) PROFITABILITY
     =================================================================== */
  function quadrantOf(x, y, xm, ym) { return (x >= xm ? 'h' : 'l') + (y >= ym ? 'h' : 'l'); }
  const QUAD = { hh: 'مبيعات عالية / هامش عالٍ', hl: 'مبيعات عالية / هامش منخفض', lh: 'مبيعات منخفضة / هامش عالٍ', ll: 'مبيعات منخفضة / هامش منخفض' };
  function quadData(M) {
    const st = A.vehStats(M.inq, M.sales);
    const pts = D.V.filter((v) => st[v.id].units > 0).map((v) => ({ v, s: st[v.id] }));
    const xm = pts.length ? pts.reduce((a, b) => a + b.s.units, 0) / pts.length : 0;
    const ym = pts.length ? pts.reduce((a, b) => a + b.s.margin, 0) / pts.length : 0;
    return { pts, xm, ym, st };
  }
  function profit(M) {
    const a = M.a;
    const { pts, xm, ym, st } = quadData(M);
    const bodyCls = { Sedan: 's1', SUV: 's2', Pickup: 's3' };
    const bubble = CH.bubbles(pts.map((p) => ({ x: p.s.units, y: p.s.margin, size: p.s.rev, label: p.v.full, short: ({ landcruiser: 'LC 300', prado: 'Prado', expedition: 'Expedition' })[p.v.id] || p.v.model, cls: bodyCls[p.v.body], attrs: { 'data-bubble': p.v.id }, active: S.f.vid === p.v.id, tip: `${p.v.full}: ${num(p.s.units)} سيارة · هامش ${pct(p.s.margin)} · ${sar(p.s.rev)}` })), { xMid: xm, yMid: ym, xLabel: 'عدد السيارات المباعة →', yLabel: 'هامش الربح % →', quadLabels: QUAD });
    const legend = `<div class="legend">${Object.entries(bodyCls).map(([b, c]) => `<span><i class="sw ${c}"></i>${D.BODY_AR[b]}</span>`).join('')}<span class="muted">حجم الفقاعة = الإيراد</span></div>`;
    const ctxT = A.computeWithout('body', 'cat');
    const catProfit = ['Sedan', 'SUV', 'Pickup'].map((b) => { const arr = ctxT.sales.filter((s) => s.body === b); const p = arr.reduce((x, y) => x + y.profit, 0), r = arr.reduce((x, y) => x + y.price, 0); return { label: D.BODY_AR[b], sub: `هامش ${pct(r ? (p / r) * 100 : 0)} · ${num(arr.length)} سيارة`, value: p, valueLabel: sar(p), attrs: { 'data-pick': 'body|' + b }, active: S.f.body === b }; })
      .concat(['luxury', 'hybrid', 'electric'].map((c) => { const arr = ctxT.sales.filter((s) => s.cat === c); const p = arr.reduce((x, y) => x + y.profit, 0), r = arr.reduce((x, y) => x + y.price, 0); return { label: D.CAT_AR[c], sub: `هامش ${pct(r ? (p / r) * 100 : 0)} · ${num(arr.length)} سيارة`, value: p, valueLabel: sar(p), attrs: { 'data-pick': 'cat|' + c }, active: S.f.cat === c }; }));
    const ctxB = A.computeWithout('brand', 'vid');
    const brands = [...A.groupBy(ctxB.sales, (s) => s.brand)].map(([b, arr]) => { const r = arr.reduce((x, y) => x + y.price, 0), p = arr.reduce((x, y) => x + y.profit, 0); return { b, r, p, m: r ? (p / r) * 100 : 0, n: arr.length }; });
    const brandRev = brands.slice().sort((x, y) => y.r - x.r).map((x) => ({ label: D.BRANDS[x.b].ar, sub: `ربح ${sar(x.p)} · هامش ${pct(x.m)}`, value: x.r, valueLabel: sar(x.r), attrs: { 'data-pick': 'brand|' + x.b }, active: S.f.brand === x.b }));
    const byUnits = pts.slice().sort((x, y) => y.s.units - x.s.units).slice(0, 8);
    const byProfit = pts.slice().sort((x, y) => y.s.profit - x.s.profit).slice(0, 8);
    const rankList = (arr, k) => `<ol class="rank">${arr.map((p, i) => { const other = (k === 'units' ? byProfit : byUnits).findIndex((x) => x.v.id === p.v.id); return `<li data-vehicle="${p.v.id}" tabindex="0"><span class="r-i">${i + 1}</span><span class="r-n">${esc(p.v.full)}</span><b>${k === 'units' ? num(p.s.units) + ' سيارة' : sar(p.s.profit)}</b><em class="${other === -1 ? 'out' : ''}">${other === -1 ? 'خارج القائمة الأخرى' : 'في الأخرى #' + (other + 1)}</em></li>`; }).join('')}</ol>`;
    const best = pts.slice().sort((x, y) => y.s.margin - x.s.margin)[0];
    return `
      <div class="page-head"><div><div class="kicker">${icon('percent')} الربحية ومزيج المنتجات</div><h1>كم ربحنا؟ ومن وين؟</h1><p>وش السيارات اللي تحقق حجم مبيعات كبير؟ ووش السيارات اللي تحقق ربح أعلى؟</p></div></div>
      <div class="kpi-grid k4">
        ${kpi('kpi.profit', 'إجمالي الربح', 'money', a.profit, P(M, 'profit'), sar, { spark: spark(M, 'profit') })}
        ${kpi('kpi.margin', 'هامش الربح', 'percent', a.margin, P(M, 'margin'), (v) => pct(v), { spark: spark(M, 'margin') })}
        ${kpi('kpi.profit', 'متوسط الربح للسيارة', 'tag', a.units ? a.profit / a.units : 0, M.p && M.p.units ? M.p.profit / M.p.units : null, sar)}
        ${kpi('kpi.margin', 'أعلى هامش: ' + (best ? best.v.full : '—'), 'target', best ? best.s.margin : 0, null, (v) => pct(v), { note: 'أفضل موديل في الفترة' })}
      </div>
      ${panel('مصفوفة مزيج المنتجات', 'chart.quadrant', legend + bubble, { sub: `الخطان = متوسط المبيعات (${num(xm)} سيارة) ومتوسط الهامش (${pct(ym)}). اضغط أي فقاعة لتفسير موقعها.` })}
      <div class="grid g2">
        ${panel('هل الأكثر مبيعاً هو الأكثر ربحاً؟', 'chart.bestVsProfit', `<div class="two-rank"><div><h5>الأكثر مبيعاً (عدد)</h5>${rankList(byUnits, 'units')}</div><div><h5>الأكثر ربحاً (ريال)</h5>${rankList(byProfit, 'profit')}</div></div>`)}
        ${panel('الربح حسب الفئة', 'chart.profitCat', CH.hbars(catProfit))}
      </div>
      ${panel('الإيراد والربح حسب الماركة', 'chart.brand', CH.hbars(brandRev, { compact: true }))}`;
  }

  /* ===================================================================
     9) SPARE PARTS & AFTER-SALES
     =================================================================== */
  function parts() {
    return `
      <div class="page-head"><div><div class="kicker">${icon('wrench')} قطع الغيار وخدمات ما بعد البيع</div><h1>وش قطع الغيار الأساسية؟</h1><p>قسم تعليمي. المعلومات عامة، وفترات الاستبدال تختلف حسب السيارة وظروف الاستخدام — المرجع دائماً كتيّب الصيانة.</p></div></div>
      <div class="grid g4 edu">${C.AFTERSALES.map((x) => `<div class="edu-card"><h4>${esc(x.t)}</h4><p>${esc(x.d)}</p></div>`).join('')}</div>
      <div class="pgrid">${C.PARTS.map((p) => `<article class="pcard" data-part="${p.id}" tabindex="0" role="button">
        <div class="pimg" data-img-part="${p.id}"></div>
        <div class="p-body"><div class="p-top"><h3>${esc(p.ar)}</h3><span class="ptype ${p.type === 'استهلاكية' ? 'cons' : 'major'}">${esc(p.type)}</span></div>
        <div class="p-en">${esc(p.en)}</div><p>${esc(p.fn)}</p><span class="link">اعرف أكثر ←</span></div></article>`).join('')}</div>`;
  }

  /* ===================================================================
     10) DICTIONARY & GLOSSARY
     =================================================================== */
  function dictionary() {
    const d = S.ui.dict;
    const brand = d.brand || 'Toyota';
    const models = D.V.filter((v) => v.brand === brand);
    const v = D.byId[d.model] && D.byId[d.model].brand === brand ? D.byId[d.model] : models[0];
    const grade = d.grade && v.grades.includes(d.grade) ? d.grade : v.grades[0];
    const col = (lv, items, cur) => `<div class="dcol"><div class="dcol-h"><b>${esc(lv.ar)}</b><span>${esc(lv.en)}</span></div>${items.map(([val, label, sub]) => `<button class="ditem${cur === val ? ' active' : ''}" data-dict="${lv.key}|${esc(val)}">${esc(label)}${sub ? `<small>${esc(sub)}</small>` : ''}</button>`).join('')}</div>`;
    const L = C.LEVELS;
    const cols = [
      col(L[0], Object.keys(D.BRANDS).map((b) => [b, b, D.BRANDS[b].ar]), brand),
      col(L[1], models.map((m) => [m.id, m.model, m.ar]), v.id),
      col(L[2], v.grades.map((g, i) => [g, g, i === 0 ? 'أساسية' : i === v.grades.length - 1 ? 'أعلى تجهيزاً' : 'متوسطة']), grade),
      col(L[3], [[v.engine, v.engine, v.cc ? num(v.cc) + ' سي سي · ' + v.hp + ' حصان' : v.hp + ' حصان']], v.engine),
      col(L[4], [[v.fuel, v.fuel, '']], v.fuel),
      col(L[5], [[v.drive, v.drive, C.DRIVE_NOTES[v.drive].split(':')[0]]], v.drive)
    ];
    const gi = v.grades.indexOf(grade);
    const path = `<div class="dpath">${[brand, v.model, grade, v.engine, v.fuel, v.drive].map((x) => `<span>${esc(x)}</span>`).join('<i>←</i>')}</div>
      <div class="dexp">
        <div><h5>${esc(L[0].ar)} · ${esc(brand)}</h5><p>${esc(L[0].d)} ${esc(brand)} (${esc(D.BRANDS[brand].ar)}) علامة من ${esc(D.BRANDS[brand].origin)}.</p></div>
        <div><h5>${esc(L[1].ar)} · ${esc(v.model)}</h5><p>${esc(L[1].d)} ${esc(v.model)} نوعها ${esc(D.BODY_AR[v.body])}، بسعر مرجعي يبدأ من حوالي ${sar(v.price)} (تجريبي).</p></div>
        <div><h5>${esc(L[2].ar)} · ${esc(grade)}</h5><p>${esc(L[2].d)} ${esc(grade)} هي ${gi === 0 ? 'الفئة الأساسية' : gi === v.grades.length - 1 ? 'الفئة الأعلى تجهيزاً' : 'فئة متوسطة'} من ${v.grades.length} فئات معروضة هنا للتوضيح. الفئة المعروضة في المستكشف: ${esc(v.trim)}.</p></div>
        <div><h5>${esc(L[3].ar)}</h5><p>${esc(L[3].d)} هنا: ${esc(v.engine)}${v.cc ? ` بسعة ${num(v.cc)} سي سي` : ''}، قوة ${num(v.hp)} حصان وعزم ${num(v.tq)} نيوتن.م، مع ${esc(v.trans)}.</p></div>
        <div><h5>${esc(L[4].ar)} · ${esc(v.fuel)}</h5><p>${esc(C.FUEL_NOTES[v.fuel])}</p></div>
        <div><h5>${esc(L[5].ar)} · ${esc(v.drive)}</h5><p>${esc(C.DRIVE_NOTES[v.drive])}</p></div>
      </div>`;
    const q = (S.ui.glossQ || '').trim().toLowerCase();
    const terms = C.GLOSSARY.filter((g) => !q || (g.t + ' ' + g.ar + ' ' + g.d).toLowerCase().includes(q));
    const groups = [...new Set(terms.map((t) => t.g))];
    return `
      <div class="page-head"><div><div class="kicker">${icon('book')} قاموس السيارات</div><h1>وش الفرق بين الموديلات والفئات؟</h1><p>تنقّل من الماركة إلى نظام الدفع وافهم معنى كل مستوى.</p></div></div>
      ${panel('مستكشف المصطلحات: Brand → Model → Grade → Engine → Fuel → Drive', null, `<div class="dcols">${cols.join('')}</div>${path}`)}
      ${panel('قاموس المصطلحات', null, `
        <label class="search wide">${icon('search')}<input type="search" placeholder="ابحث عن مصطلح: Trim، هامش، VIN…" value="${esc(S.ui.glossQ)}" data-ui-live="glossQ"></label>
        ${groups.map((g) => `<h5 class="grp">${esc(g)}</h5><div class="gloss">${terms.filter((t) => t.g === g).map((t) => `<button class="term" data-term="${esc(t.t)}"><b>${esc(t.t)}</b><span>${esc(t.ar)}</span><p>${esc(t.d)}</p></button>`).join('')}</div>`).join('') || CH.empty('لا يوجد مصطلح مطابق')}`, { sub: `${num(C.GLOSSARY.length)} مصطلحاً بشرح مبسط ومثال` })}`;
  }

  window.PAGES = { home, vehicles, sales, customers, finance, collection, inventory, profit, parts, dictionary };
  window.PAGE_HELPERS = { icon, info, panel, sw, kpi, P, spark, chStats, funnelStages, QA, FINAL_Q, quadData, quadrantOf, QUAD, ymd, COLL_AR, STATUS_AR, BUCKETS };
})();
