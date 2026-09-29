/* =====================================================================
   واجهات اللوحة الجانبية: ملف السيارة، الفاتورة، سيارة المخزون، القناة،
   الفقاعة، سؤال الإدارة، قطعة الغيار، المصطلح
   ===================================================================== */
(function () {
  'use strict';
  const A = window.APP, D = window.DB, CH = window.CH, C = window.CONTENT;
  const H = window.PAGE_HELPERS;
  const { num, sar, pct, esc } = CH;
  const { icon, ymd } = H;

  const row = (k, v, ex) => `<div class="kv${ex ? ' clickable' : ''}"${ex ? ` data-explain="${ex}" tabindex="0"` : ''}><dt>${esc(k)}${ex ? icon('info') : ''}</dt><dd>${v}</dd></div>`;

  /* -------- vehicle profile -------- */
  function vehicle(id, M) {
    const v = D.byId[id];
    if (!v) return CH.empty();
    const ctx = A.computeWithout('vid', 'brand', 'cat', 'body');
    const inq = ctx.inq.filter((r) => r.vid === id), sales = ctx.sales.filter((s) => s.vid === id);
    const a = A.agg(inq, sales);
    const stock = D.inventory.filter((x) => x.vid === id && x.status !== 'sold' && (!S().f.branch || x.branch === S().f.branch));
    const avail = stock.filter((x) => x.status === 'available').length;
    const avgDays = stock.length ? stock.reduce((x, y) => x + y.days, 0) / stock.length : 0;
    const chip = (label, val, ex, pos) => `<div class="orb ${pos}"${ex ? ` data-explain="${ex}" tabindex="0"` : ''}><span>${esc(label)}</span><b>${val}</b></div>`;
    const stage = `<div class="stage">
      <div class="orbs right">${chip('الماركة', esc(v.brandAr + ' · ' + v.brand))}${chip('الموديل', esc(v.model + ' ' + v.year))}${chip('الفئة Trim', esc(v.trim), null)}${chip('المحرك', esc(v.engine))}${chip('الوقود', esc(v.fuel))}${chip('الدفع', esc(v.drive))}</div>
      <div class="stage-c">
        <div class="stage-img" data-img-v="${v.id}" data-view="front" data-credit="1"></div>
        <div class="switch views">${[['front', 'أمامي'], ['side', 'جانبي'], ['rear', 'خلفي'], ['interior', 'داخلي']].map(([k, l], i) => `<span class="opt${i ? '' : ' active'}" data-view-btn="${k}">${l}</span>`).join('')}</div>
      </div>
      <div class="orbs left">${chip('السعر', sar(v.price), 'kpi.avg')}${chip('المبيعات', num(a.units) + ' سيارة', 'kpi.units')}${chip('الطلبات', num(a.inq), 'kpi.inquiries')}${chip('الهامش', pct(a.margin), 'kpi.margin')}${chip('المخزون', num(avail) + ' متوفرة', 'kpi.stock')}${chip('التحويل', pct(a.conv), 'kpi.conv')}</div>
    </div>`;

    const byCh = A.groupBy(inq, (r) => r.ch), bySCh = A.groupBy(sales, (s) => s.ch);
    const chItems = D.CHANNELS.map((c) => { const l = (byCh.get(c.id) || []).filter((r) => r.stage >= 1).length, u = (bySCh.get(c.id) || []).length; return { label: c.ar, sub: `${num(u)} بيع · تحويل ${pct(l ? (u / l) * 100 : 0)}`, value: l, valueLabel: num(l) + ' Lead' }; }).sort((x, y) => y.value - x.value);

    const I = (k) => ({ f: S().f, label: M.label, a, p: null, inv: { avail, reserved: stock.length - avail, avgDays, sumDays: stock.reduce((x, y) => x + y.days, 0), value: stock.reduce((x, y) => x + y.cost, 0), monthlyUnits: a.units / Math.max(1, M.months), aged30: 0, aged60: 0, aged90: 0 } });
    const perfMini = (label, val, ex) => `<div class="pm" data-explain="${ex}" tabindex="0"><span>${esc(label)}</span><b>${val}</b></div>`;
    const judgeConv = A.judge('kpi.conv', I()), judgeMargin = A.judge('kpi.margin', I()), judgeDays = A.judge('kpi.invDays', I());
    return `
      <div class="vd">
        <div class="vd-head"><div class="kicker">${esc(v.brandAr)} · ${esc(D.BODY_AR[v.body])} · ${esc(v.origin)}</div><h2>${esc(v.full)} <small>${esc(v.trim)} · ${v.year}</small></h2>
          <p class="fine">الأداء التجاري للفترة: ${esc(M.label)} (بيانات وهمية). المواصفات مرجعية لفئة شائعة في الخليج — تحقق من الوكيل.</p></div>
        ${stage}
        <div class="vd-grid">
          <section class="vd-sec"><h4>${icon('tag')} هوية السيارة</h4><dl class="kvs">
            ${row('الماركة', esc(v.brand + ' — ' + v.brandAr))}${row('الموديل', esc(v.model + ' — ' + v.ar))}${row('الفئة', esc(v.trim))}${row('سنة الموديل', v.year)}${row('بلد الصنع', esc(v.origin))}${row('نوع الهيكل', esc(D.BODY_AR[v.body]))}
          </dl></section>
          <section class="vd-sec"><h4>${icon('wrench')} المواصفات</h4><dl class="kvs">
            ${row('المحرك', esc(v.engine))}${row('سعة المحرك', v.cc ? num(v.cc) + ' سي سي' : 'لا ينطبق (كهربائي)')}${row('القوة', num(v.hp) + ' حصان')}${row('العزم', num(v.tq) + ' نيوتن.م')}${row('ناقل الحركة', esc(v.trans))}${row('الدفع', esc(v.drive) + ' — ' + esc(C.DRIVE_NOTES[v.drive].split(':')[0]))}${row('الوقود', esc(v.fuel))}${row('عدد المقاعد', v.seats)}
          </dl></section>
        </div>
        <section class="vd-sec"><h4>${icon('chart')} الأداء التجاري</h4>
          <div class="pm-grid">
            ${perfMini('عدد الطلبات', num(a.inq), 'kpi.inquiries')}${perfMini('العملاء المحتملون', num(a.leads), 'kpi.leads')}${perfMini('عدد المبيعات', num(a.units), 'kpi.units')}
            ${perfMini('نسبة التحويل', pct(a.conv) + (judgeConv ? ' ' + A.badge(judgeConv.level) : ''), 'kpi.conv')}${perfMini('إجمالي الإيرادات', sar(a.rev), 'kpi.revenue')}${perfMini('متوسط سعر البيع', sar(a.avg), 'kpi.avg')}
            ${perfMini('إجمالي الربح', sar(a.profit), 'kpi.profit')}${perfMini('هامش الربح', pct(a.margin) + (judgeMargin ? ' ' + A.badge(judgeMargin.level) : ''), 'kpi.margin')}${perfMini('المتوفر بالمخزون', num(avail) + ' + ' + num(stock.length - avail) + ' محجوزة', 'kpi.stock')}
            ${perfMini('متوسط أيام المخزون', num(avgDays) + ' يوم' + (judgeDays && stock.length ? ' ' + A.badge(judgeDays.level) : ''), 'kpi.invDays')}
          </div></section>
        <div class="vd-grid">
          <section class="vd-sec"><h4>${icon('users')} مصادر العملاء</h4>${CH.hbars(chItems, { compact: true })}</section>
          <section class="vd-sec"><h4>${icon('funnel')} رحلة العميل لهذا الموديل ${H.info('chart.funnel')}</h4>${CH.funnel(H.funnelStages(inq, sales))}</section>
        </div>
      </div>`;
  }
  const S = () => A.S;

  /* -------- invoice -------- */
  function sale(inv) {
    const s = D.sales.find((x) => x.inv === inv);
    if (!s) return CH.empty();
    const v = D.byId[s.vid];
    const bucket = s.coll !== 'overdue' ? null : H.BUCKETS.find(([, lo, hi]) => s.daysOverdue >= lo && s.daysOverdue <= hi);
    const action = s.coll === 'paid' ? 'لا إجراء مطلوب؛ الفاتورة محصلة بالكامل.'
      : s.coll === 'pending' ? `غير مستحقة بعد (تستحق خلال ${num(Math.max(0, (s.dueDate - D.TODAY) / D.DAY))} يوماً). أرسل تذكيراً قبل الموعد ${s.financier ? 'وتأكد من اكتمال أوراق ' + s.financier : ''}.`
        : s.daysOverdue <= 7 ? 'تذكير ودي من المندوب.' : s.daysOverdue <= 30 ? 'متابعة من قسم التحصيل مع جهة الدفع.' : s.daysOverdue <= 60 ? 'تصعيد لمدير الفرع.' : s.daysOverdue <= 90 ? 'إنذار رسمي ومراجعة الضمانات.' : 'قرار إداري: إجراء نظامي أو تسوية.';
    const pctPaid = (s.paid / s.price) * 100;
    return `<div class="ex">
      <div class="ex-head"><div class="ex-kicker">تفاصيل الفاتورة · بيانات وهمية</div><h3 class="mono">${s.inv}</h3><div class="ex-period"><span class="pill ${s.coll}">${H.COLL_AR[s.coll]}</span></div></div>
      <div class="paid-bar"><div style="width:${pctPaid}%"></div></div><p class="fine">تم تحصيل ${pct(pctPaid)} من قيمة الفاتورة.</p>
      <dl class="kvs">
        ${row('العميل (وهمي)', esc(s.customer))}${row('السيارة', esc(v.full + ' ' + v.trim))}${row('رقم المخزون', `<span class="mono">${s.stock}</span>`)}${row('اللون / السنة', esc(s.color) + ' · ' + s.year)}
        ${row('الفرع', esc(D.brById[s.branch].ar))}${row('المندوب', esc(D.spById[s.sp].ar))}${row('مصدر العميل', esc(D.chById[s.ch].ar))}
        ${row('تاريخ البيع', ymd(s.date))}${row('طريقة الدفع', esc(D.payById[s.pay].ar) + (s.financier ? ' — ' + esc(s.financier) : ''))}
        ${row('إجمالي الفاتورة', sar(s.price), 'kpi.revenue')}${row('المدفوع عند البيع', sar(s.upfront))}${row('إجمالي المدفوع', sar(s.paid), 'kpi.collected')}${row('المتبقي', `<b>${sar(s.remaining)}</b>`, 'kpi.remaining')}
        ${row('تاريخ الاستحقاق', ymd(s.dueDate))}${row('أيام التأخير', s.daysOverdue ? num(s.daysOverdue) + ' يوم' + (bucket ? ' (فئة ' + bucket[0] + ')' : '') : '—', s.daysOverdue ? 'chart.aging' : null)}
        ${row('إجمالي الربح', sar(s.profit) + ' (' + pct((s.profit / s.price) * 100) + ')', 'kpi.margin')}
      </dl>
      <section class="ex-sec hl"><h4>الإجراء المقترح</h4><p>${esc(action)}</p></section>
    </div>`;
  }

  /* -------- stock unit -------- */
  function stock(no) {
    const x = D.inventory.find((i) => i.stock === no);
    if (!x) return CH.empty();
    const v = D.byId[x.vid];
    const mg = ((x.price - x.cost) / x.price) * 100;
    const holding = Math.round(x.cost * 0.06 * (x.days / 365)); // تكلفة تمويل مخزون تقريبية 6% سنوياً (افتراض تعليمي)
    const rec = x.status === 'sold' ? `بيعت بعد ${num(x.days)} يوماً من وصولها (الفاتورة ${x.saleInv}).`
      : x.days > 90 ? 'مخزون راكد: عرض تصفية محسوب أو نقل لفرع عليه طلب قبل نزول موديل السنة الجديدة.'
        : x.days > 60 ? 'بدأت تكلفة الاحتفاظ تأكل الهامش: أدرجها في عرض موجه هذا الأسبوع.'
          : x.days > 30 ? 'تحت المراقبة: تأكد أنها معروضة جيداً ومتاحة لتجربة القيادة.'
            : 'مخزون حديث: لا إجراء خاص.';
    return `<div class="ex">
      <div class="ex-head"><div class="ex-kicker">سيارة في المخزون · بيانات وهمية</div><h3>${esc(v.full)} <small>${esc(v.trim)}</small></h3><div class="ex-period"><span class="pill ${x.status}">${H.STATUS_AR[x.status]}</span></div></div>
      <div class="stage-img small" data-img-v="${v.id}" data-view="front" data-credit="1"></div>
      <dl class="kvs">
        ${row('رقم المخزون', `<span class="mono">${x.stock}</span>`, null)}${row('رقم الهيكل VIN (وهمي)', `<span class="mono">${x.vin}</span>`)}${row('سنة الموديل', x.year)}${row('اللون', esc(x.color))}${row('الفرع', esc(D.brById[x.branch].ar))}
        ${row('تاريخ الوصول', ymd(x.arrival))}${row('أيام المخزون', num(x.days) + ' يوم', 'kpi.invDays')}
        ${row('تكلفة الشراء', sar(x.cost), 'kpi.invValue')}${row('سعر البيع', sar(x.price))}${row('الربح المتوقع', sar(x.price - x.cost))}${row('الهامش', pct(mg), 'kpi.margin')}
        ${x.status !== 'sold' ? row('تكلفة احتفاظ تقديرية', sar(holding) + ' <small>(بافتراض 6% سنوياً)</small>') : ''}
      </dl>
      <section class="ex-sec hl"><h4>التوصية</h4><p>${esc(rec)}</p></section>
      <button class="btn" data-vehicle="${v.id}">فتح ملف الموديل ←</button>
    </div>`;
  }

  /* -------- channel -------- */
  function channel(id, M) {
    const c = D.chById[id];
    const cs = H.chStats(A.computeWithout('ch'));
    const me = cs.find((x) => x.ch.id === id);
    const totL = cs.reduce((a, b) => a + b.leads, 0), totU = cs.reduce((a, b) => a + b.units, 0);
    const avgConv = totL ? (totU / totL) * 100 : 0;
    const rankL = cs.slice().sort((a, b) => b.leads - a.leads).findIndex((x) => x.ch.id === id) + 1;
    const rankC = cs.slice().sort((a, b) => b.conv - a.conv).findIndex((x) => x.ch.id === id) + 1;
    const verdict = me.conv >= avgConv * 1.1 ? 'جودة أعلى من المتوسط: كل Lead منها أكثر قيمة.' : me.conv <= avgConv * 0.9 ? 'جودة أقل من المتوسط: الحجم لا يعوّض ضعف التحويل بالضرورة.' : 'جودة قريبة من المتوسط.';
    return `<div class="ex">
      <div class="ex-head"><div class="ex-kicker">تحليل قناة · ${esc(M.label)}</div><h3>${esc(c.ar)}</h3></div>
      <div class="big-sentence">هذه القناة جلبت <b>${num(me.leads)}</b> Lead، تحول منهم <b>${num(me.units)}</b> إلى مبيعات.</div>
      <p class="callout">${icon('info')} ارتفاع عدد العملاء لا يعني بالضرورة ارتفاع المبيعات. يجب مقارنة عدد العملاء مع معدل التحويل والإيراد.</p>
      <dl class="kvs">
        ${row('الاستفسارات', num(me.inq), 'kpi.inquiries')}${row('Leads', num(me.leads) + ` <small>(الترتيب ${rankL} من ${cs.length})</small>`, 'kpi.leads')}
        ${row('المبيعات', num(me.units), 'kpi.units')}${row('نسبة التحويل', pct(me.conv) + ` <small>(المتوسط ${pct(avgConv)} · الترتيب ${rankC})</small>`, 'kpi.conv')}
        ${row('الإيراد', sar(me.rev), 'kpi.revenue')}${row('تكلفة القناة', sar(me.mkt), 'kpi.mkt')}
        ${row('تكلفة العميل (Lead)', me.leads ? sar(me.cpl) : '—', 'kpi.cpl')}${row('تكلفة البيعة', me.units ? sar(me.cps) : '—', 'kpi.cps')}
        ${row('حصة من الـ Leads', pct(totL ? (me.leads / totL) * 100 : 0))}${row('حصة من المبيعات', pct(totU ? (me.units / totU) * 100 : 0))}
      </dl>
      <section class="ex-sec hl"><h4>القراءة</h4><p>${esc(verdict)} ${me.ch.cpi === 0 ? 'لا توجد تكلفة إعلانية مباشرة لهذه القناة في النموذج؛ قيمتها في جودة العملاء.' : ''}</p></section>
      <div class="btn-row"><button class="btn" data-pick="ch|${id}">${S().f.ch === id ? 'إلغاء فلتر هذه القناة' : 'فلترة اللوحة على هذه القناة'}</button><button class="btn ghost" data-explain="chart.channels">كيف أقرأ القنوات؟</button></div>
    </div>`;
  }

  /* -------- bubble (product mix) -------- */
  function bubble(id, M) {
    const { pts, xm, ym } = H.quadData(M);
    const p = pts.find((x) => x.v.id === id);
    if (!p) return CH.empty();
    const q = H.quadrantOf(p.s.units, p.s.margin, xm, ym);
    const txt = {
      hh: ['نجم المعرض', 'يبيع أكثر من المتوسط وبهامش أعلى من المتوسط. هذا أفضل موقع.', 'احمِه من الخصومات غير الضرورية، وتأكد من توفر المخزون دائماً.'],
      hl: ['محرك الحجم', 'يبيع كثيراً لكن هامشه أقل من المتوسط. يجلب عملاء وحركة، لكن ربح السيارة الواحدة محدود.', 'راجع سياسة الخصم عليه، واستفد من عملائه لبيع خدمات إضافية (تأمين، حماية، صيانة).'],
      lh: ['فرصة نمو', 'هامشه أعلى من المتوسط لكن مبيعاته أقل. كل بيعة إضافية منه مربحة.', 'ركّز عليه في الحملات والعرض داخل المعرض وتدريب المندوبين.'],
      ll: ['يحتاج مراجعة', 'مبيعات وهامش أقل من المتوسط.', 'راجع التسعير والمخزون المطلوب منه، أو قلّل الطلب من الوكيل.']
    }[q];
    return `<div class="ex">
      <div class="ex-head"><div class="ex-kicker">موقع الموديل في مزيج المنتجات</div><h3>${esc(p.v.full)}</h3><div class="ex-period">${esc(H.QUAD[q])}</div></div>
      <div class="big-sentence"><b>${esc(txt[0])}</b> — ${esc(txt[1])}</div>
      <dl class="kvs">
        ${row('عدد المبيعات', num(p.s.units) + ` <small>(المتوسط ${num(xm)})</small>`, 'kpi.units')}
        ${row('هامش الربح', pct(p.s.margin) + ` <small>(المتوسط ${pct(ym)})</small>`, 'kpi.margin')}
        ${row('الإيراد (حجم الفقاعة)', sar(p.s.rev), 'kpi.revenue')}${row('إجمالي الربح', sar(p.s.profit), 'kpi.profit')}
      </dl>
      <section class="ex-sec hl"><h4>القرار المقترح</h4><p>${esc(txt[2])}</p></section>
      <div class="btn-row"><button class="btn" data-vehicle="${p.v.id}">فتح ملف السيارة</button><button class="btn ghost" data-explain="chart.quadrant">كيف أقرأ المصفوفة؟</button></div>
    </div>`;
  }

  /* -------- management / final questions -------- */
  function question(key, M) {
    const [kind, idx] = key.split('|');
    const Q = H.QA(M);
    const f = (id) => Q.find((x) => x.id === id);
    let title, parts = [], page;
    if (kind === 'final') {
      const map = [
        ['وش نبيع؟', ['s2', 's5'], 'vehicles', `نبيع ${D.V.length} موديلاً من ${Object.keys(D.BRANDS).length} ماركات: سيدان وSUV وبيك أب، منها هجينة وكهربائية وفاخرة.`],
        ['مين يشتري؟', [], 'customers', null],
        ['من وين جابونا؟', ['c1', 'c4'], 'customers'],
        ['كم بعنا؟', ['s1'], 'sales'],
        ['كم ربحنا؟', [], 'profit', `إجمالي الربح ${sar(M.a.profit)} بهامش ${pct(M.a.margin)}.`],
        ['كيف دفعوا؟', ['f1', 'f2'], 'finance'],
        ['كم حصلنا؟', ['f3'], 'collection'],
        ['كم باقي؟', ['f4', 'f5'], 'collection'],
        ['وش الموجود بالمخزون؟', ['i1', 'i3'], 'inventory'],
        ['وش السيارات البطيئة؟', ['i4', 'i2'], 'inventory'],
        ['وش السيارات المطلوبة؟', [], 'vehicles', null],
        ['وش الفرق بين الموديلات والفئات؟', [], 'dictionary', 'الموديل هو اسم السيارة (مثل كامري)، والفئة هي مستوى التجهيز داخل الموديل (مثل LE أو SE أو GLE). نفس الموديل قد يختلف سعره كثيراً بين الفئات. جرّب مستكشف المصطلحات في قاموس السيارات.'],
        ['وش قطع الغيار الأساسية؟', [], 'parts', 'أهمها الاستهلاكية: زيت المحرك وفلتره، فلتر الهواء، فلتر المكيف، البواجي، البطارية، الفحمات، الإطارات، المساحات. وأجزاء رئيسية تتآكل مع الوقت مثل المساعدات وأذرعة التعليق.'],
        ['وش معنى كل رقم؟', [], 'home', 'كل رقم في اللوحة قابل للضغط. اضغط أي بطاقة أو رسم أو أيقونة (i) لتظهر بطاقة "اشرح لي": ما هو، ماذا يعني، لماذا يهم، كيف يُحسب، كيف تفسره، القرار الممكن، وهل هو جيد بحدود واضحة.']
      ][+idx];
      title = map[0]; page = map[2];
      if (map[3]) parts.push(map[3]);
      map[1].forEach((id) => { const x = f(id); if (x) parts.push(`<b>${esc(x.text)}</b> ${esc(x.ans)}`); });
      if (title === 'مين يشتري؟') {
        const byBr = [...A.groupBy(M.sales, (s) => s.branch)].sort((x, y) => y[1].length - x[1].length);
        const byBody = [...A.groupBy(M.sales, (s) => s.body)].sort((x, y) => y[1].length - x[1].length);
        const n = Math.max(1, M.sales.length);
        parts.push(byBr.length ? `أكثر المشترين من فرع ${esc(D.brById[byBr[0][0]].ar)} (${pct((byBr[0][1].length / n) * 100)}). ${pct((M.a.finN / n) * 100)} منهم اشتروا عبر التمويل و ${pct((M.a.cashN / n) * 100)} كاش. النوع الأكثر طلباً: ${esc(D.BODY_AR[byBody[0][0]])} (${pct((byBody[0][1].length / n) * 100)}).` : 'لا توجد مبيعات ضمن الفلاتر.');
        parts.push('<small>النموذج لا يحتوي بيانات ديموغرافية شخصية؛ التحليل مبني على الفرع وطريقة الدفع ونوع السيارة.</small>');
      }
      if (title === 'وش السيارات المطلوبة؟') {
        const st = A.vehStats(M.inq, M.sales);
        const top = D.V.slice().sort((x, y) => st[y.id].inq - st[x.id].inq).slice(0, 5);
        parts.push('الأكثر طلباً (استفسارات): ' + top.map((v) => `${esc(v.full)} (${num(st[v.id].inq)} طلب، مخزون متوفر ${num(st[v.id].stock)})`).join('، ') + '.');
        const short = top.filter((v) => st[v.id].stock < 3);
        if (short.length) parts.push(`${icon('alert')} انتبه: ${short.map((v) => esc(v.full)).join('، ')} مطلوبة لكن مخزونها أقل من 3 سيارات.`);
      }
    }
    return `<div class="ex">
      <div class="ex-head"><div class="ex-kicker">سؤال · ${esc(M.label)}</div><h3>${esc(title)}</h3></div>
      ${parts.map((p) => `<section class="ex-sec hl"><p>${p}</p></section>`).join('')}
      <button class="btn" data-nav="${page}">الانتقال للتفاصيل ←</button>
    </div>`;
  }

  function part(id) {
    const p = C.PARTS.find((x) => x.id === id);
    return `<div class="ex">
      <div class="ex-head"><div class="ex-kicker">قطع الغيار · ${esc(p.en)}</div><h3>${esc(p.ar)}</h3><div class="ex-period"><span class="ptype ${p.type === 'استهلاكية' ? 'cons' : 'major'}">${esc(p.type)}</span></div></div>
      <div class="pimg big" data-img-part="${p.id}"></div>
      <section class="ex-sec"><h4>وظيفتها</h4><p>${esc(p.fn)}</p></section>
      <section class="ex-sec"><h4>متى تحتاج تغييرها؟</h4><p>${esc(p.when)}</p></section>
      <section class="ex-sec"><h4>علامات وجود مشكلة</h4><ul>${p.signs.map((s) => `<li>${esc(s)}</li>`).join('')}</ul></section>
      <section class="ex-sec"><h4>علاقتها بالصيانة</h4><p>${esc(p.maint)}</p></section>
      <section class="ex-sec"><h4>ما السيارات التي تستخدمها؟</h4><p>${esc(p.cars)}</p></section>
      <section class="ex-sec hl"><h4>استهلاكية أم جزء رئيسي؟</h4><p>${esc(p.type)}.</p></section>
      <p class="fine">معلومات عامة تعليمية. المدد الدقيقة تختلف حسب السيارة — المرجع كتيّب الصيانة الخاص بالموديل.</p>
    </div>`;
  }

  function term(t) {
    const g = C.GLOSSARY.find((x) => x.t === t);
    if (!g) return CH.empty();
    return `<div class="ex">
      <div class="ex-head"><div class="ex-kicker">قاموس · ${esc(g.g)}</div><h3>${esc(g.t)} <small>${esc(g.ar)}</small></h3></div>
      <section class="ex-sec"><h4>المعنى</h4><p>${esc(g.d)}</p></section>
      <section class="ex-sec hl"><h4>مثال</h4><p>${esc(g.ex)}</p></section>
    </div>`;
  }

  function dictPick(St, k, v) {
    const d = St.ui.dict;
    if (k === 'brand') { d.brand = v; d.model = ''; d.grade = ''; }
    if (k === 'model') { d.model = v; d.grade = ''; }
    if (k === 'grade') d.grade = v;
  }

  window.VIEWS = { vehicle, sale, stock, channel, bubble, question, part, term, dictPick };
})();
