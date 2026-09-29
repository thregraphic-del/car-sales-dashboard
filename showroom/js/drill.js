/* =====================================================================
   DRILL-DOWN ENGINE — "WHAT → WHERE → WHY → WHICH RECORDS"
   ---------------------------------------------------------------------
   Drill.slice(spec) opens a drawer for any slice of the business:
     spec = { title, add:{dim:value}, P:period, tab, stock:{ageMin,ageMax},
              leadStage:'_td'|'_of'|..., pay:{status, odMin, odMax, field},
              delivered:true, contracts:{status} }
   The drawer shows KPIs for the slice, clickable breakdowns (each row
   drills one level deeper), and the underlying records. Every record
   opens its own detail view.
   ===================================================================== */
const Drill = (function(){
  const BREAKDOWNS = {
    branch:     {label:'الفرع', key:s=>s.branchId, name:L.branch, dim:'branch'},
    brand:      {label:'العلامة', key:s=>s._t.brand, name:x=>x, dim:'brand'},
    model:      {label:'الطراز', key:s=>s._t.brand+'|'+s._t.model, name:k=>k.replace('|',' '), dim:'model'},
    trim:       {label:'الفئة', key:s=>s.trimId, name:id=>L.vehicleY(DB.idx.trim.get(id)), dim:'trim'},
    salesperson:{label:'مستشار المبيعات', key:s=>s.salespersonId, name:L.sp, dim:'salesperson'},
    source:     {label:'مصدر العميل', key:s=>s.source, name:L.source, dim:'source'},
    payment:    {label:'طريقة الدفع', key:s=>s.paymentMethod, name:L.payment, dim:'payment'},
    custType:   {label:'نوع العميل', key:s=>s.customerType, name:L.custType, dim:'custType'},
    month:      {label:'الشهر', key:s=>DB.isoOf(s._d).slice(0,7), name:fmt.month, dim:'month'}
  };
  // translate a breakdown key into a filter patch
  function patchFor(dim, key){
    if(dim==='model'){ const [brand,model]=key.split('|'); return {brand, model}; }
    if(dim==='trim'){ const t=DB.idx.trim.get(key); return {brand:t.brand, model:t.model, year:t.year, trim:t.trim}; }
    if(dim==='month') return {__month:key};
    return {[dim]:key};
  }
  const nextBreakdown = add => add.trim ? 'branch' : add.model ? 'trim' : add.brand ? 'model' : add.branch ? 'brand' : 'branch';

  function ctxOf(spec){
    const P = spec.P || Periods.get(Store.state.period);
    const f = filtersOf(spec.add||{});
    return {P, f};
  }
  function chipLine(P, f){
    return `<span class="mini-chip">${ic('calendar')} ${esc(P.label)}</span>` + Object.keys(f).map(k=>`<span class="mini-chip">${DIM_LABEL[k]}: ${esc(dimValueLabel(k,f[k]))}</span>`).join('');
  }
  function applyAsFilter(spec){
    const patch = {...(spec.add||{})};
    if(spec.P && spec.P.id) patch.period = spec.P.id;
    Store.set(patch, 'drawer'); Drawer.close(); toast('تم تطبيق الاختيار كفلتر على اللوحة');
    document.getElementById('top')?.scrollIntoView({behavior:'smooth'});
  }

  /* ---------------- SLICE VIEW ---------------- */
  function slice(spec, push=false){
    const view = {
      title: spec.title, crumb: spec.crumb || spec.title,
      subtitle: '', actions: [
        {label:'تصفية اللوحة بهذا الاختيار', icon:'filter', primary:true, fn:()=>applyAsFilter(spec)}
      ],
      render(body){
        const {P, f} = ctxOf(spec);
        view.subtitle = chipLine(P, f);
        body.closest('.drawer').querySelector('.drawer-titles p').innerHTML = view.subtitle;
        const tabs = [['overview','الملخص','layout-dashboard'],['sales','المبيعات','receipt'],['leads','العملاء المحتملون','users'],['stock','المخزون','warehouse'],['payments','المدفوعات','wallet'],['contracts','عقود التمويل','file-text']];
        const cur = spec.tab || 'overview';
        body.innerHTML = `<div class="d-tabs">${tabs.map(t=>`<button class="${t[0]===cur?'active':''}" data-t="${t[0]}">${ic(t[2])}${t[1]}</button>`).join('')}</div><div class="d-pane"></div>`;
        body.querySelector('.d-tabs').addEventListener('click',e=>{ const b=e.target.closest('button'); if(!b) return; spec.tab=b.dataset.t; view.render(body); icons(); });
        const pane = body.querySelector('.d-pane');
        ({overview:paneOverview, sales:paneSales, leads:paneLeads, stock:paneStock, payments:panePayments, contracts:paneContracts})[cur](pane, spec, P, f);
      }
    };
    push ? Drawer.push(view) : Drawer.open(view);
  }
  function drillTo(spec, patch, title){
    if(patch.__month){ const mp = Periods.month(patch.__month); return slice({title, add:{...spec.add}, P:mp, tab:'overview'}, true); }
    slice({title, add:{...(spec.add||{}), ...patch}, P:spec.P, tab:'overview'}, true);
  }

  function kpiGrid(items){
    return `<div class="d-kpis">${items.map(k=>`<div class="d-kpi ${k.click?'click':''}" ${k.click?`data-go="${k.click}"`:''}>
      <span class="l">${k.label}${k.info?` <button class="info-btn" data-info="${k.info}" aria-label="تعريف">${ic('info')}</button>`:''}</span>
      <b class="num">${k.value}</b>${k.delta!=null?`<span class="d">${k.delta}</span>`:''}</div>`).join('')}</div>`;
  }

  function paneOverview(pane, spec, P, f){
    const rows = Q.sales(f, P), S = Q.summarize(rows);
    const prev = P.prev ? Q.summarize(Q.sales(prevF(f), P.prev)) : null;
    const collected = Q.payments(f, P, '_paid').reduce((a,p)=>a+p.paidAmount,0);
    const rec = Q.receivables(f, P.end);
    const leads = Q.leads(f, P).length;
    const cashShare = S.revenue ? ((S.byMethod.Cash||0)+(S.byMethod['Bank Transfer']||0)+(S.byMethod.Mixed||0))/S.revenue : null;
    const d = (k,kind='pct',better='up')=> prev ? trendHTML(change(S[k],prev[k],kind),better,kind) : null;
    pane.innerHTML = kpiGrid([
      {label:'المركبات المباعة', value:fmt.int(S.units), delta:d('units'), info:'units', click:'sales'},
      {label:'الإيرادات', value:fmt.sarC(S.revenue), delta:d('revenue'), info:'revenue', click:'sales'},
      {label:'إجمالي الربح', value:fmt.sarC(S.gp), delta:d('gp'), info:'gp'},
      {label:'هامش الربح', value:fmt.pct(S.margin), delta:d('margin','pts'), info:'margin'},
      {label:'متوسط السعر', value:fmt.sarC(S.avgPrice), delta:d('avgPrice'), info:'avgPrice'},
      {label:'متوسط الخصم', value:fmt.sarC(S.avgDiscount), delta:d('avgDiscount','pct','down'), info:'avgDiscount'},
      {label:'مبيعات نقدية / تحويل', value:fmt.pct(cashShare,0), click:'sales'},
      {label:'مبيعات بالتمويل', value:fmt.pct(S.financeShare,0), click:'contracts'},
      {label:'المحصّل في الفترة', value:fmt.sarC(collected), info:'collected', click:'payments'},
      {label:'متأخرات (اليوم)', value:fmt.sarC(rec.overdue), info:'overdue', click:'payments'},
      {label:'العملاء المحتملون', value:fmt.int(leads), info:'leads', click:'leads'},
      {label:'المساهمة التقديرية', value:fmt.sarC(S.contribution), info:'contribution'}
    ]) + `<div class="d-tops"></div><div class="d-breakdown"></div>`;
    pane.querySelectorAll('[data-go]').forEach(x=>x.addEventListener('click',e=>{ if(e.target.closest('[data-info]')) return; spec.tab=x.dataset.go; Drawer.rerender(); }));

    // top lists (vehicles / brands / branches / sources)
    const tops = [['model','أعلى المركبات'],['brand','أعلى العلامات'],['branch','أعلى الفروع'],['source','أعلى مصادر العملاء']].filter(([k])=>!(k==='brand'&&f.brand&&f.model) && !(k==='branch'&&f.branch) && !(k==='source'&&f.source));
    pane.querySelector('.d-tops').innerHTML = tops.map(([k,label])=>{
      const B = BREAKDOWNS[k]; const g=[...Q.group(rows,B.key)].map(([key,rs])=>({key, rev:rs.reduce((a,s)=>a+s.sellingPrice,0), n:rs.length})).sort((a,b)=>b.rev-a.rev).slice(0,5);
      const max = g[0]?.rev||1;
      return `<div class="d-top"><h6>${label}</h6>${g.map(x=>`<button class="d-top-row" data-dim="${k}" data-key="${esc(x.key)}"><span>${esc(B.name(x.key))}</span><em class="num">${fmt.sarC(x.rev)}</em>${barCell(x.rev,max)}</button>`).join('')||'<p class="muted">—</p>'}</div>`;
    }).join('');
    pane.querySelector('.d-tops').addEventListener('click',e=>{ const b=e.target.closest('.d-top-row'); if(!b) return; drillTo(spec, patchFor(b.dataset.dim,b.dataset.key), BREAKDOWNS[b.dataset.dim].name(b.dataset.key)); });

    // full breakdown with selectable dimension — the drill path
    let dim = spec.breakdown || nextBreakdown(spec.add||{});
    const drawBreakdown = ()=>{
      const B = BREAKDOWNS[dim];
      const g = [...Q.group(rows,B.key)].map(([key,rs])=>{ const s=Q.summarize(rs); return {key, name:B.name(key), ...s}; });
      const host = pane.querySelector('.d-breakdown');
      host.innerHTML = `<div class="d-sec-h"><h5>تحليل حسب</h5><div class="seg sm">${Object.entries(BREAKDOWNS).map(([k,b])=>`<button class="${k===dim?'active':''}" data-b="${k}">${b.label}</button>`).join('')}</div></div><div class="d-table"></div>`;
      host.querySelector('.seg').addEventListener('click',e=>{ const b=e.target.closest('button'); if(!b) return; dim=spec.breakdown=b.dataset.b; drawBreakdown(); });
      const maxRev = Math.max(...g.map(x=>x.revenue),1);
      DataTable(host.querySelector('.d-table'), {rows:g, pageSize:15, exportName:'breakdown-'+dim, searchable:false,
        initialSort: dim==='month'?{key:0,dir:1}:{key:2,dir:-1},
        columns:[
          {label:B.label, get:r=>dim==='month'?r.key:r.name, render:r=>`<b>${esc(r.name)}</b>`},
          {label:'الوحدات', num:true, get:r=>r.units, render:r=>fmt.int(r.units)},
          {label:'الإيرادات', num:true, get:r=>r.revenue, render:r=>`${fmt.sarC(r.revenue)}${barCell(r.revenue,maxRev)}`},
          {label:'إجمالي الربح', num:true, get:r=>r.gp, render:r=>fmt.sarC(r.gp)},
          {label:'الهامش', num:true, get:r=>r.margin, render:r=>fmt.pct(r.margin)},
          {label:'متوسط الخصم', num:true, get:r=>r.avgDiscount, render:r=>fmt.sarC(r.avgDiscount)},
          {label:'المساهمة', num:true, get:r=>r.contribution, render:r=>fmt.sarC(r.contribution)}
        ],
        onRow:r=>drillTo(spec, patchFor(dim, r.key), r.name)});
      icons();
    };
    drawBreakdown();
  }

  /* ---------- records: sales ---------- */
  const saleCols = [
    {label:'التاريخ', get:s=>s._d, render:s=>fmt.date(s.date), csv:s=>s.date},
    {label:'المركبة', get:s=>L.vehicleY(s._t), render:s=>`<b>${esc(L.vehicle(s._t))}</b><small>${s._t.year} · ${esc(s._v?.vin||'')}</small>`},
    {label:'الفرع', get:s=>L.branch(s.branchId)},
    {label:'المستشار', get:s=>L.sp(s.salespersonId)},
    {label:'العميل', get:s=>s._cust?.name, render:s=>`${esc(s._cust?.name)}<small>${L.custType(s.customerType)}</small>`},
    {label:'المصدر', get:s=>L.source(s.source)},
    {label:'الدفع', get:s=>L.payment(s.paymentMethod)},
    {label:'سعر البيع', num:true, get:s=>s.sellingPrice, render:s=>fmt.sar(s.sellingPrice)},
    {label:'الخصم', num:true, get:s=>s.discount, render:s=>fmt.sar(s.discount)},
    {label:'الربح', num:true, get:s=>s.grossProfit, render:s=>fmt.sar(s.grossProfit)},
    {label:'الهامش', num:true, get:s=>s.margin, render:s=>fmt.pct(s.margin)},
    {label:'التحصيل', get:s=>s.collectionStatus, render:s=>statusPill(AR.collection[s.collectionStatus], s.collectionStatus==='Overdue'?'neg':s.collectionStatus==='Collected'?'pos':'')}
  ];
  function paneSales(pane, spec, P, f){
    let rows = Q.sales(f, P);
    if(spec.delivered) rows = DB.sales.filter(s=>Q.inP(s._delivered,P) && s.deliveryStatus==='Delivered' && Q.saleMatch(s,f));
    pane.innerHTML = `<div class="d-note">${ic('receipt')} ${spec.delivered?'المركبات المسلّمة للعملاء خلال الفترة':'صفقات البيع التي يقع تاريخها ضمن الفترة'} — اضغط أي صف لعرض تفاصيل الصفقة والتحصيل.</div><div class="d-table"></div>`;
    DataTable(pane.querySelector('.d-table'), {rows, columns:saleCols, exportName:'sales', initialSort:{key:0,dir:-1}, onRow:s=>Records.sale(s.saleId)});
  }

  /* ---------- records: leads ---------- */
  const STAGES = {_d:'عميل محتمل', _q:'مؤهل', _td:'تجربة قيادة', _of:'عرض سعر', _rs:'حجز'};
  const stageOf = l => l.saleId ? 'تم البيع' : l._rs!=null ? 'حجز' : l._of!=null ? 'عرض سعر' : l._td!=null ? 'تجربة قيادة' : l._q!=null ? 'مؤهل' : 'عميل محتمل';
  function paneLeads(pane, spec, P, f){
    const field = spec.leadStage || '_d';
    const rows = Q.leads(f, P, field);
    const dateOf = l => DB.isoOf(l[field]);
    pane.innerHTML = `<div class="d-note">${ic('users')} ${field==='_d'?'العملاء المحتملون المسجلون خلال الفترة':`العملاء الذين وصلوا إلى مرحلة «${STAGES[field]}» خلال الفترة`}.</div><div class="d-table"></div>`;
    DataTable(pane.querySelector('.d-table'), {rows, exportName:'leads', initialSort:{key:0,dir:-1}, onRow:l=>Records.lead(l.leadId), columns:[
      {label:'التاريخ', get:l=>l[field], render:l=>fmt.date(dateOf(l)), csv:dateOf},
      {label:'العميل', get:l=>l._cust.name, render:l=>`${esc(l._cust.name)}<small>${L.custType(l._cust.type)}</small>`},
      {label:'المركبة المطلوبة', get:l=>L.vehicleY(l._t), render:l=>`${esc(L.vehicle(l._t))}<small>${l._t.year}</small>`},
      {label:'الفرع', get:l=>L.branch(l.branchId)},
      {label:'المستشار', get:l=>L.sp(l.salespersonId)},
      {label:'المصدر', get:l=>L.source(l.source), render:l=>`${esc(L.source(l.source))}${l.campaignId&&!l.campaignId.startsWith('AO-')?`<small>${esc(L.campaign(l.campaignId))}</small>`:''}`},
      {label:'المرحلة', get:l=>stageOf(l)},
      {label:'الحالة', get:l=>l.status, render:l=>statusPill(AR.leadStatus[l.status], l.status==='Won'?'pos':l.status==='Lost'?'muted':'gold')},
      {label:'الإجراء التالي', get:l=>l.nextAction||l.lostReason||'', render:l=>l.nextAction?esc(AR.nextAction[l.nextAction]):l.lostReason?`<span class="muted">${esc(AR.lostReason[l.lostReason])}</span>`:'—'}
    ]});
  }

  /* ---------- records: stock ---------- */
  function demandIndex(){ // leads (last 90 days) per unit in stock, by model — cached per render cycle
    if(demandIndex._c && demandIndex._at===DB.meta.todayDay) return demandIndex._c;
    const T=DB.meta.todayDay, m={};
    DB.leads.forEach(l=>{ if(l._d>T-90){ const k=l._t._modelKey; m[k]=(m[k]||0)+1; } });
    demandIndex._c=m; demandIndex._at=T; return m;
  }
  function recommend(v, age){
    if(v.status==='Reserved') return {t:'متابعة إتمام البيع', tone:'gold'};
    const leads90 = demandIndex()[v._t._modelKey]||0;
    if(age>120) return {t:'خصم تصفية أو نقل لفرع أعلى طلباً', tone:'neg'};
    if(age>90) return {t:'حملة موجهة + مراجعة السعر', tone:'warn'};
    if(age>60 && leads90<40) return {t:'مراجعة التسعير مبكراً', tone:'warn'};
    return {t:'لا إجراء', tone:''};
  }
  function paneStock(pane, spec, P, f){
    const d = Math.min(P.end, DB.meta.todayDay);
    let rows = Q.stockAt(f, d);
    const a = spec.stock||{};
    if(a.ageMin!=null) rows = rows.filter(v=>d-v._arr>=a.ageMin);
    if(a.ageMax!=null) rows = rows.filter(v=>d-v._arr<=a.ageMax);
    if(a.status) rows = rows.filter(v=>v.status===a.status);
    const S = Q.stockSummary(rows, d);
    pane.innerHTML = kpiGrid([
      {label:'المركبات', value:fmt.int(S.units)}, {label:'قيمة المخزون', value:fmt.sarC(S.value), info:'inventoryValue'},
      {label:'متوسط العمر', value:fmt.days(S.avgAge), info:'avgAge'}, {label:'تجاوز 90 يوماً', value:fmt.int(S.aged90), info:'aged90'}
    ]) + (!rows.length && Object.keys(f).length ? `<div class="d-note warn">${ic('info')} لا توجد مركبات${a.label?` ${a.label}`:''} ضمن الفلاتر الحالية (${Object.keys(f).map(k=>esc(dimValueLabel(k,f[k]))).join(' · ')}). <button class="link widen">عرضها على مستوى المجموعة</button></div>` : '')
      + `<div class="d-note">${ic('warehouse')} المخزون كما في ${fmt.date(DB.isoOf(d))}${a.label?` · ${a.label}`:''} — الإجراء المقترح مبني على عمر المركبة والطلب خلال آخر 90 يوماً.</div><div class="d-table"></div>`;
    pane.querySelector('.widen')?.addEventListener('click',()=>{ const none={}; FILTER_DIMS.forEach(k=>none[k]=null); slice({...spec, title:spec.title+' · كل المجموعة', crumb:'كل المجموعة', add:none}, true); });
    DataTable(pane.querySelector('.d-table'), {rows, exportName:'inventory', initialSort:{key:6,dir:-1}, onRow:v=>Records.vehicle(v.vehicleId), columns:[
      {label:'رقم الهيكل (VIN)', get:v=>v.vin, render:v=>`<code>${v.vin}</code><small>${v.vehicleId}</small>`},
      {label:'المركبة', get:v=>L.vehicleY(v._t), render:v=>`<b>${esc(L.vehicle(v._t))}</b><small>${v._t.year}</small>`},
      {label:'الفرع', get:v=>L.branch(v.branchId)},
      {label:'اللون', get:v=>L.color(v.exteriorColor)},
      {label:'تكلفة الشراء', num:true, get:v=>v.purchaseCost, render:v=>fmt.sar(v.purchaseCost)},
      {label:'السعر الحالي', num:true, get:v=>v.listPrice, render:v=>fmt.sar(v.listPrice)},
      {label:'الأيام في المخزون', num:true, get:v=>d-v._arr, render:v=>{ const x=d-v._arr; return `<b class="${x>90?'neg-t':x>60?'warn-t':''}">${x}</b>`; }},
      {label:'الخصم المتوقع', num:true, get:v=>d-v._arr, render:v=>{ const x=d-v._arr; return fmt.pct(clamp(.012+(x>60?.015:0)+(x>90?.02:0)+(x>120?.02:0),0,.1)); }},
      {label:'الهامش المتوقع', num:true, get:v=>1-v.purchaseCost/v.listPrice, render:v=>{ const x=d-v._arr, disc=clamp(.012+(x>60?.015:0)+(x>90?.02:0)+(x>120?.02:0),0,.1), p=v.listPrice*(1-disc); return fmt.pct((p-v.purchaseCost)/p); }},
      {label:'الحالة', get:v=>v.status, render:v=>statusPill(AR.vStatus[v.status], v.status==='Reserved'?'gold':'')},
      {label:'الإجراء المقترح', get:v=>recommend(v,d-v._arr).t, render:v=>{ const r=recommend(v,d-v._arr); return statusPill(r.t, r.tone); }}
    ]});
  }

  /* ---------- records: payments ---------- */
  function panePayments(pane, spec, P, f){
    const o = spec.pay||{};
    let rows;
    if(o.status==='Overdue') rows = DB.payments.filter(p=>p.status==='Overdue' && p._s._d<=P.end && Q.saleMatch(p._s,f) && (o.odMin==null||p._daysOverdue>=o.odMin) && (o.odMax==null||p._daysOverdue<=o.odMax));
    else if(o.field==='_due') rows = Q.payments(f, P, '_due');
    else rows = Q.payments(f, P, '_paid');
    const paid = rows.reduce((a,p)=>a+p.paidAmount,0), due = rows.reduce((a,p)=>a+p.amount,0), od = rows.filter(p=>p.status==='Overdue').reduce((a,p)=>a+p.amount,0);
    pane.innerHTML = kpiGrid([
      {label:'عدد الدفعات', value:fmt.int(rows.length)}, {label:'المبلغ المستحق', value:fmt.sarC(due)},
      {label:'المحصّل', value:fmt.sarC(paid), info:'collected'}, {label:'المتأخر', value:fmt.sarC(od), info:'overdue'}
    ]) + `<div class="d-note">${ic('wallet')} ${o.status==='Overdue'?`دفعات متأخرة غير مسددة كما في اليوم${o.label?` · ${o.label}`:''}`:o.field==='_due'?'الدفعات المستحقة خلال الفترة (مدفوعة أو غير مدفوعة)':'الدفعات المستلمة فعلياً خلال الفترة'}.</div><div class="d-table"></div>`;
    DataTable(pane.querySelector('.d-table'), {rows, exportName:'payments', initialSort:{key:0,dir:-1}, onRow:p=>Records.sale(p.saleId), columns:[
      {label:o.field==='_paid'||!o.field&&o.status!=='Overdue'?'تاريخ الدفع':'تاريخ الاستحقاق', get:p=>o.field==='_paid'||(!o.field&&o.status!=='Overdue')?p._paid:p._due, render:p=>fmt.date(o.field==='_paid'||(!o.field&&o.status!=='Overdue')?p.paidDate:p.dueDate)},
      {label:'العميل', get:p=>p._s._cust.name, render:p=>`${esc(p._s._cust.name)}<small>${L.custType(p._s.customerType)}</small>`},
      {label:'المركبة', get:p=>L.vehicle(p._s._t)},
      {label:'الفرع', get:p=>L.branch(p._s.branchId)},
      {label:'نوع الدفعة', get:p=>AR.payType[p.type]+(p.type==='Installment'?` ${p.seq}/${p._s.installments}`:'')},
      {label:'المبلغ', num:true, get:p=>p.amount, render:p=>fmt.sar(p.amount)},
      {label:'الاستحقاق', get:p=>p._due, render:p=>fmt.date(p.dueDate)},
      {label:'الحالة', get:p=>p.status, render:p=>statusPill(AR.payStatus[p.status], p.status==='Overdue'?'neg':p.status==='Paid'?'pos':p.status==='Paid Late'?'warn':'')},
      {label:'أيام التأخير', num:true, get:p=>p._daysOverdue, render:p=>p._daysOverdue?`<b class="neg-t">${p._daysOverdue}</b>`:'—'}
    ]});
  }

  /* ---------- records: finance contracts ---------- */
  function paneContracts(pane, spec, P, f){
    const fc = {...f}; delete fc.payment;
    let rows = DB.financeContracts.filter(s=>s._d<=P.end && Q.saleMatch(s,fc));
    if(!spec.contracts?.all) rows = rows.filter(s=>Q.inP(s._d,P) || s.outstanding>0);
    if(spec.contracts?.status) rows = rows.filter(s=>s.contractStatus===spec.contracts.status);
    const fin = rows.reduce((a,s)=>a+s.financedAmount,0), out = rows.reduce((a,s)=>a+s.outstanding,0), od = rows.reduce((a,s)=>a+s.overdueAmount,0), paid = rows.reduce((a,s)=>a+s.collected,0);
    pane.innerHTML = kpiGrid([
      {label:'عقود التمويل', value:fmt.int(rows.length)}, {label:'المبالغ الممولة', value:fmt.sarC(fin)},
      {label:'المحصّل حتى اليوم', value:fmt.sarC(paid), info:'collected'}, {label:'المتبقي', value:fmt.sarC(out), info:'outstanding'}, {label:'المتأخر', value:fmt.sarC(od), info:'overdue'}
    ]) + `<div class="d-note">${ic('file-text')} عقود التمويل بالأقساط (المبرمة حتى نهاية الفترة والنشطة أو المبرمة خلالها)${spec.contracts?.status?` · الحالة: ${AR.contract[spec.contracts.status]}`:''}.</div><div class="d-table"></div>`;
    DataTable(pane.querySelector('.d-table'), {rows, exportName:'finance-contracts', initialSort:{key:9,dir:-1}, onRow:s=>Records.sale(s.saleId), columns:[
      {label:'العميل', get:s=>s._cust.name, render:s=>`<b>${esc(s._cust.name)}</b><small>${fmt.date(s.date)}</small>`},
      {label:'المركبة', get:s=>L.vehicle(s._t)},
      {label:'سعر البيع', num:true, get:s=>s.sellingPrice, render:s=>fmt.sar(s.sellingPrice)},
      {label:'الدفعة الأولى', num:true, get:s=>s.downPayment, render:s=>fmt.sar(s.downPayment)},
      {label:'المبلغ الممول', num:true, get:s=>s.financedAmount, render:s=>fmt.sar(s.financedAmount)},
      {label:'القسط الشهري', num:true, get:s=>s.installmentAmount, render:s=>fmt.sar(s.installmentAmount)},
      {label:'الأقساط', num:true, get:s=>s.installments, render:s=>`${s.installmentsPaid}/${s.installments}`},
      {label:'المدفوع', num:true, get:s=>s.collected, render:s=>fmt.sar(s.collected)},
      {label:'المتبقي', num:true, get:s=>s.outstanding, render:s=>fmt.sar(s.outstanding)},
      {label:'المتأخر', num:true, get:s=>s.overdueAmount, render:s=>s.overdueAmount?`<b class="neg-t">${fmt.sar(s.overdueAmount)}</b>`:'—'},
      {label:'الدفعة القادمة', get:s=>s.nextDueDate||'', render:s=>fmt.date(s.nextDueDate)},
      {label:'الحالة', get:s=>s.contractStatus, render:s=>statusPill(AR.contract[s.contractStatus], {Default:'neg',Late:'warn',Settled:'pos'}[s.contractStatus])}
    ]});
  }

  return {slice, BREAKDOWNS, patchFor, stageOf, recommend, demandIndex};
})();

/* =====================================================================
   RECORD DETAIL VIEWS
   ===================================================================== */
const Records = (function(){
  const kv = rows => `<dl class="kv">${rows.filter(Boolean).map(([k,v])=>`<dt>${k}</dt><dd>${v??'—'}</dd>`).join('')}</dl>`;
  const sec = (title, html, iconName='circle') => `<section class="rec-sec"><h5>${ic(iconName)}${title}</h5>${html}</section>`;

  function sale(saleId){
    const s = DB.idx.sale.get(saleId); if(!s) return;
    const t=s._t, v=s._v, l=s._lead, pays = DB.idx.paymentsBySale.get(saleId)||[];
    Drawer.push({title:`صفقة ${s.saleId}`, crumb:s.saleId, subtitle:`${esc(L.vehicleY(t))} · ${fmt.date(s.date)}`,
      actions:[{label:'عرض المركبة', icon:'car', fn:()=>vehicle(s.vehicleId)}, {label:'سجل العميل', icon:'user', fn:()=>customer(s.customerId)}],
      render(body){
        const wf = [['سعر القائمة (السعر الرسمي + الإضافات)', s.listPrice],['− الخصم', -s.discount],['= سعر البيع', s.sellingPrice],['− تكلفة المركبة', -s.cost],['= إجمالي الربح', s.grossProfit],
                    ['+ إيراد التمويل', s.financeIncome],['+ إيرادات أخرى (إكسسوارات/ضمان)', s.otherIncome],['− تكلفة الاستحواذ التسويقية', -s.acquisitionCost],['= المساهمة التقديرية', s.contribution]];
        const steps = [['عميل محتمل', l?.date],['تأهيل', l?.qualifiedDate],['تجربة قيادة', l?.testDriveDate],['عرض سعر', l?.offerDate],['حجز', l?.reservationDate],['بيع', s.date],['تسليم', s.deliveryStatus==='Delivered'?s.deliveryDate:null]];
        body.innerHTML = `<div class="rec-grid">
          ${sec('ملخص الصفقة', kv([['المركبة', `<b>${esc(L.vehicleY(t))}</b>`],['رقم الهيكل', `<code>${v?.vin}</code>`],['اللون', `${L.color(v?.exteriorColor)} / ${L.interior(v?.interiorColor)}`],
            ['الفرع', L.branch(s.branchId)],['مستشار المبيعات', esc(L.sp(s.salespersonId))],['العميل', `${esc(s._cust.name)} · ${L.custType(s.customerType)}`],
            ['مصدر العميل', L.source(s.source)],['الحملة', esc(L.campaign(s.campaignId))],['أيام في المخزون قبل البيع', fmt.days(s.daysInInventory)],['حالة التسليم', `${AR.delivery[s.deliveryStatus]} · ${fmt.date(s.deliveryDate)}`]]),'receipt')}
          ${sec('ربحية الصفقة', `<div class="wf">${wf.map(([k,val])=>`<div class="${k.startsWith('=')?'tot':''}"><span>${k}</span><b class="num ${val<0?'neg-t':''}">${fmt.sar(val)}</b></div>`).join('')}</div><p class="muted sm">هامش الربح الإجمالي: <b>${fmt.pct(s.margin)}</b></p>`,'calculator')}
          ${sec('رحلة العميل', `<ol class="timeline">${steps.map(([k,d])=>`<li class="${d?'done':''}"><span>${k}</span><em>${d?fmt.date(d):'—'}</em></li>`).join('')}</ol>`,'route')}
          ${sec('الدفع والتحصيل', kv([['طريقة الدفع', L.payment(s.paymentMethod)],['المبلغ النقدي / المحوّل', fmt.sar(s.cashAmount)],
            s.paymentMethod==='Finance'&&['الدفعة الأولى', fmt.sar(s.downPayment)], s.paymentMethod==='Finance'&&['المبلغ الممول', fmt.sar(s.financedAmount)],
            s.paymentMethod==='Finance'&&['القسط الشهري', `${fmt.sar(s.installmentAmount)} × ${s.installments}`], s.paymentMethod==='Finance'&&['حالة العقد', statusPill(AR.contract[s.contractStatus],{Default:'neg',Late:'warn',Settled:'pos'}[s.contractStatus])],
            ['إجمالي قيمة العقد', fmt.sar(s.contractTotal)],['المحصّل', fmt.sar(s.collected)],['المتبقي', fmt.sar(s.outstanding)],['المتأخر', s.overdueAmount?`<b class="neg-t">${fmt.sar(s.overdueAmount)}</b> · ${s.maxDaysOverdue} يوم`:'—'],
            ['الدفعة القادمة', fmt.date(s.nextDueDate)],['حالة التحصيل', statusPill(AR.collection[s.collectionStatus], s.collectionStatus==='Overdue'?'neg':s.collectionStatus==='Collected'?'pos':'')]]),'wallet')}
        </div><h5 class="rec-h">جدول الدفعات</h5><div class="d-table"></div>`;
        DataTable(body.querySelector('.d-table'), {rows:pays, pageSize:12, searchable:false, exportName:'schedule-'+s.saleId, columns:[
          {label:'الدفعة', get:p=>p.seq, render:p=>AR.payType[p.type]+(p.type==='Installment'?` ${p.seq}`:'')},
          {label:'الاستحقاق', get:p=>p._due, render:p=>fmt.date(p.dueDate)},
          {label:'المبلغ', num:true, get:p=>p.amount, render:p=>fmt.sar(p.amount)},
          {label:'تاريخ الدفع', get:p=>p._paid??Infinity, render:p=>fmt.date(p.paidDate)},
          {label:'الحالة', get:p=>p.status, render:p=>statusPill(AR.payStatus[p.status], p.status==='Overdue'?'neg':p.status==='Paid'?'pos':p.status==='Paid Late'?'warn':'')}
        ]});
      }});
  }

  function vehicle(vehicleId){
    const v = DB.idx.vehicle.get(vehicleId); if(!v) return;
    const rec = DB.vehicleRecord(vehicleId), t=v._t, T=DB.meta.todayDay;
    const AR_F = {'Vehicle ID':'معرّف المركبة','VIN':'رقم الهيكل','Brand':'العلامة','Model':'الطراز','Generation':'الجيل','Year':'سنة الطراز','Trim':'الفئة','Body Type':'نوع الهيكل','Segment':'الفئة السوقية',
      'Fuel Type':'نوع الوقود','Engine':'المحرك','Transmission':'ناقل الحركة','Exterior Color':'اللون الخارجي','Interior Color':'اللون الداخلي','MSRP':'السعر الرسمي','Selling Price':'سعر البيع','Discount':'الخصم',
      'Cost':'التكلفة','Gross Profit':'إجمالي الربح','Margin':'الهامش','Stock':'متاح (نفس الفئة)','Reserved':'محجوز (نفس الفئة)','Sold':'مباع (نفس الفئة)','Days in Inventory':'الأيام في المخزون',
      'Average Days to Sell':'متوسط أيام البيع (نفس الفئة)','Branch':'الفرع','Salesperson':'مستشار المبيعات','Lead Source':'مصدر العميل','Campaign':'الحملة','Customer Type':'نوع العميل','Payment Method':'طريقة الدفع',
      'Cash Amount':'المبلغ النقدي','Financed Amount':'المبلغ الممول','Down Payment':'الدفعة الأولى','Installment Amount':'القسط','Outstanding Amount':'المتبقي','Collection Status':'حالة التحصيل',
      'Delivery Status':'حالة التسليم','Image':'الصورة','3D Asset':'النموذج ثلاثي الأبعاد','Source URL':'رابط المصدر','Asset License / Source Metadata':'ترخيص/مصدر الأصل'};
    const val = (k,x)=>{ if(x==null) return '—';
      if(['MSRP','Selling Price','Discount','Cost','Gross Profit','Cash Amount','Financed Amount','Down Payment','Installment Amount','Outstanding Amount'].includes(k)) return fmt.sar(x);
      if(k==='Margin') return fmt.pct(x); if(k==='Branch') return L.branch(x); if(k==='Exterior Color') return L.color(x); if(k==='Interior Color') return L.interior(x);
      if(k==='Lead Source') return L.source(x); if(k==='Customer Type') return L.custType(x); if(k==='Payment Method') return L.payment(x);
      if(k==='Collection Status') return AR.collection[x]; if(k==='Delivery Status') return AR.delivery[x]; if(k==='Fuel Type') return L.fuel(x); if(k==='Segment') return L.segment(x);
      if(k==='Days in Inventory'||k==='Average Days to Sell') return fmt.days(x); if(k==='VIN') return `<code>${x}</code>`;
      return esc(x); };
    const r = v.saleId ? null : Drill.recommend(v, T-v._arr);
    Drawer.push({title:L.vehicleY(t), crumb:v.vin.slice(-8), subtitle:`<code>${v.vin}</code> · ${statusPill(AR.vStatus[v.status], v.status==='Sold'?'pos':v.status==='Reserved'?'gold':'')}`,
      actions:[...(v.saleId?[{label:'عرض صفقة البيع', icon:'receipt', fn:()=>sale(v.saleId)}]:[]),
               {label:'عرضها في صالة العرض', icon:'box', primary:true, fn:()=>{ Store.set({vehicleId:v.vehicleId},'drawer'); Drawer.close(); document.getElementById('stage')?.scrollIntoView({behavior:'smooth',block:'center'}); }}],
      render(body){
        body.innerHTML = `${r?`<div class="d-note ${r.tone}">${ic('lightbulb')} الإجراء المقترح: <b>${r.t}</b> — ${T-v._arr} يوماً في المخزون، تكلفة ${fmt.sar(v.purchaseCost)}.</div>`:''}
          ${sec('سجل المركبة الموحد', kv(DATA_SCHEMA.vehicleRecordFields.map(k=>[AR_F[k]||k, val(k, rec[k])])),'clipboard-list')}
          <p class="muted sm">${ic('info')} الحقول الفارغة تعني أن البيانات غير متوفرة لهذه المركبة (مثل تفاصيل البيع لمركبة غير مباعة، أو عدم توفر نموذج ثلاثي الأبعاد مرخّص).</p>`;
      }});
  }

  function lead(leadId){
    const l = DB.idx.lead.get(leadId); if(!l) return;
    const steps = [['عميل محتمل', l.date],['تأهيل', l.qualifiedDate],['تجربة قيادة', l.testDriveDate],['عرض سعر', l.offerDate],['حجز', l.reservationDate],['بيع', l.saleId?DB.idx.sale.get(l.saleId).date:null]];
    Drawer.push({title:`عميل محتمل ${l.leadId}`, crumb:l.leadId, subtitle:`${esc(l._cust.name)} · ${L.source(l.source)}`,
      actions:[...(l.saleId?[{label:'عرض الصفقة', icon:'receipt', fn:()=>sale(l.saleId)}]:[]), {label:'سجل العميل', icon:'user', fn:()=>customer(l.customerId)}],
      render(body){
        body.innerHTML = `<div class="rec-grid">${sec('التفاصيل', kv([['العميل', `${esc(l._cust.name)} · ${L.custType(l._cust.type)}`],['المدينة', esc(l._cust.city)],['المركبة المطلوبة', esc(L.vehicleY(l._t))],
            ['الفرع', L.branch(l.branchId)],['المستشار', esc(L.sp(l.salespersonId))],['المصدر', L.source(l.source)],['الحملة', esc(L.campaign(l.campaignId))],
            ['الحالة', statusPill(AR.leadStatus[l.status], l.status==='Won'?'pos':l.status==='Lost'?'muted':'gold')],['الإجراء التالي', l.nextAction?AR.nextAction[l.nextAction]:'—'],['سبب الفقد', l.lostReason?AR.lostReason[l.lostReason]:'—']]),'user')}
          ${sec('مراحل الرحلة', `<ol class="timeline">${steps.map(([k,d])=>`<li class="${d?'done':''}"><span>${k}</span><em>${d?fmt.date(d):'—'}</em></li>`).join('')}</ol>`,'route')}</div>`;
      }});
  }

  function customer(customerId){
    const c = DB.idx.customer.get(customerId); if(!c) return;
    const ls = DB.leads.filter(l=>l.customerId===customerId), ss = DB.sales.filter(s=>s.customerId===customerId);
    Drawer.push({title:c.name, crumb:c.name, subtitle:`${L.custType(c.type)} · ${esc(c.city)} · ${c.customerId}`,
      render(body){
        const out = ss.reduce((a,s)=>a+s.outstanding,0), od = ss.reduce((a,s)=>a+s.overdueAmount,0);
        body.innerHTML = `<div class="d-kpis"><div class="d-kpi"><span class="l">المشتريات</span><b>${ss.length}</b></div><div class="d-kpi"><span class="l">قيمة المشتريات</span><b>${fmt.sarC(ss.reduce((a,s)=>a+s.sellingPrice,0))}</b></div><div class="d-kpi"><span class="l">المتبقي</span><b>${fmt.sarC(out)}</b></div><div class="d-kpi"><span class="l">المتأخر</span><b class="${od?'neg-t':''}">${fmt.sarC(od)}</b></div></div>
          <h5 class="rec-h">الصفقات</h5><div class="t1"></div><h5 class="rec-h">التفاعلات</h5><div class="t2"></div>`;
        DataTable(body.querySelector('.t1'), {rows:ss, searchable:false, exportName:'customer-sales', onRow:s=>sale(s.saleId), columns:[
          {label:'التاريخ', get:s=>s._d, render:s=>fmt.date(s.date)},{label:'المركبة', get:s=>L.vehicleY(s._t)},{label:'السعر', num:true, get:s=>s.sellingPrice, render:s=>fmt.sar(s.sellingPrice)},
          {label:'الدفع', get:s=>L.payment(s.paymentMethod)},{label:'التحصيل', get:s=>AR.collection[s.collectionStatus]}]});
        DataTable(body.querySelector('.t2'), {rows:ls, searchable:false, exportName:'customer-leads', onRow:l=>lead(l.leadId), columns:[
          {label:'التاريخ', get:l=>l._d, render:l=>fmt.date(l.date)},{label:'المركبة', get:l=>L.vehicleY(l._t)},{label:'المصدر', get:l=>L.source(l.source)},{label:'الحالة', get:l=>AR.leadStatus[l.status]}]});
      }});
  }
  return {sale, vehicle, lead, customer};
})();
