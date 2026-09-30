/* =====================================================================
   APP — boot, filter bar, active-filter chips, section tabs and the
   render pipeline. Every Store change re-renders the visible modules,
   so every selection cross-filters the whole dashboard.
   ===================================================================== */
let DB = null;
const App = {
  ui: {tab:'overview', monthlyMetric:'revenue', rankMetric:'revenue', profitDim:'brand', specTab:'specs', viewColor:null, alertMode:'recs', modelPerfMode:'top', spMode:'flag'},
  sel: {},             // selected marks (month, funnel stage, aging bucket…) while their drawer is open
  clearChartSelection(){ if(Object.keys(App.sel).length){ App.sel={}; App.renderTab(); } },

  /* ---------------- filter bar ---------------- */
  FILTERS: [
    {key:'period', label:'الفترة', icon:'calendar', opts:()=>Periods.all().map(p=>({v:p.id, l:p.label, s:p.prev?`مقابل ${p.prev.label}`:''})), group:p=>p.kind==='month'?'أشهر':'فترات'},
    {key:'branch', label:'الفرع', icon:'map-pin', opts:()=>[{v:null,l:'جميع الفروع'},...DB.branches.map(b=>({v:b.branchId,l:L.branch(b.branchId)}))]},
    {key:'brand', label:'العلامة', icon:'award', opts:()=>[{v:null,l:'جميع العلامات'},...DB.brands.map(b=>({v:b.name,l:b.name,s:b.ar,brand:b.name}))]},
    {key:'model', label:'الطراز', icon:'car', dep:'brand', opts:()=>[{v:null,l:'جميع الطرازات'},...[...new Set(DB.trims.filter(t=>t.brand===Store.state.brand).map(t=>t.model))].map(m=>({v:m,l:m}))]},
    {key:'year', label:'السنة', icon:'calendar-range', dep:'model', opts:()=>[{v:null,l:'جميع السنوات'},...[...new Set(DB.trims.filter(t=>t.brand===Store.state.brand&&t.model===Store.state.model).map(t=>t.year))].sort((a,b)=>b-a).map(y=>({v:y,l:String(y)}))]},
    {key:'trim', label:'الفئة', icon:'layers', dep:'year', opts:()=>[{v:null,l:'جميع الفئات'},...DB.trims.filter(t=>t.brand===Store.state.brand&&t.model===Store.state.model&&t.year===Store.state.year).map(t=>({v:t.trim,l:t.trim,s:fmt.sar(t.msrp)}))]},
    {key:'bodyType', label:'نوع الهيكل', icon:'car-front', opts:()=>[{v:null,l:'جميع الأنواع'},...CATALOG_REFERENCE.bodyTypes.map(x=>({v:x,l:L.body(x)}))]},
    {key:'powertrain', label:'نوع المحرك', icon:'fuel', opts:()=>[{v:null,l:'الكل'},...CATALOG_REFERENCE.powertrains.map(x=>({v:x,l:L.pt(x)}))]},
    {key:'priceSegment', label:'الشريحة السعرية', icon:'tag', opts:()=>[{v:null,l:'جميع الشرائح'},...CATALOG_REFERENCE.priceSegments.map(x=>({v:x,l:L.priceSeg(x)}))]},
    {key:'source', label:'مصدر العميل', icon:'megaphone', opts:()=>[{v:null,l:'جميع المصادر'},...DATA_SCHEMA.enums.leadSource.filter(s=>DB.leads.some(l=>l.source===s)).map(s=>({v:s,l:L.source(s)}))]},
    {key:'payment', label:'طريقة الدفع', icon:'wallet', opts:()=>[{v:null,l:'جميع الطرق'},...DATA_SCHEMA.enums.paymentMethod.map(s=>({v:s,l:L.payment(s)}))]},
    {key:'custType', label:'شريحة العميل', icon:'users', opts:()=>[{v:null,l:'جميع الشرائح'},...DATA_SCHEMA.enums.customerType.map(s=>({v:s,l:L.custType(s)}))]}
  ],
  renderFilters(changed=[]){
    const s = Store.state;
    $('#filters').innerHTML = App.FILTERS.map(f=>{
      const disabled = f.dep && s[f.dep]==null;
      const v = s[f.key], o = f.opts().find(x=>x.v===v);
      const label = f.key==='period' ? Periods.get(v).label : o ? o.l : (v??'');
      return `<button class="filter ${v!=null&&f.key!=='period'?'active':''} ${changed.includes(f.key)?'flash':''}" data-key="${f.key}" data-pop ${disabled?'disabled':''}>
        <span><span class="f-l">${f.label}</span><span class="f-v">${f.key==='brand'&&v?brandMark(v,{size:'sm'}):v!=null&&f.key!=='period'?'<i></i>':''}<bdi>${esc(disabled?'—':label)}</bdi></span></span>${ic('chevron-down')}</button>`;
    }).join('');
    icons();
  },
  bindFilters(){
    $('#filters').addEventListener('click', e=>{
      const b = e.target.closest('.filter'); if(!b || b.disabled) return;
      const f = App.FILTERS.find(x=>x.key===b.dataset.key), cur = Store.state[f.key];
      let lastGroup = null;
      const html = f.opts().map(o=>{ const g = f.key==='period' ? (Periods.get(o.v).kind==='month'?'أشهر':'فترات') : null;
        const gh = g && g!==lastGroup ? `<div class="grp">${g}</div>` : ''; lastGroup = g;
        return `${gh}<button class="opt ${o.v===cur?'sel':''}" data-v='${esc(JSON.stringify(o.v))}'><span>${o.brand?brandMark(o.brand,{size:'sm'}):''}<bdi>${esc(o.l)}</bdi></span>${o.v===cur?ic('check'):o.s?`<small>${esc(o.s)}</small>`:''}</button>`; }).join('');
      Pop.open(b, html, 'f-'+f.key);
      Pop.el.onclick = ev=>{ const o=ev.target.closest('.opt'); if(!o) return; Store.set({[f.key]:JSON.parse(o.dataset.v)},'filter'); Pop.close(); };
    });
    $('#filters').addEventListener('scroll', ()=>Pop.close(), {passive:true});
  },
  renderChips(){
    const s = Store.state;
    const chips = Store.activeDims().map(k=>{
      if(['brand','model','year','trim'].includes(k) && Store.state[HIER[HIER.indexOf(k)+1]]!=null) return ''; // show only deepest vehicle level
      const label = ['brand','model','year','trim'].includes(k) ? HIER.slice(0,HIER.indexOf(k)+1).map(x=>s[x]).join(' › ') : dimValueLabel(k,s[k]);
      return `<span class="chip"><em>${DIM_LABEL[k]}</em><bdi>${esc(label)}</bdi><button data-rm="${k}" aria-label="إزالة">${ic('x')}</button></span>`;
    }).join('');
    const P = Periods.get(s.period);
    $('#chips').innerHTML = `<span class="chip period"><em>الفترة</em><bdi>${esc(P.label)}</bdi><small>${P.prev?`مقارنة: ${esc(P.prev.label)}`:'دون مقارنة'}</small></span>${chips}
      ${Store.activeDims().length?`<button class="clear-all" id="clearAll">${ic('filter-x')}مسح جميع عوامل التصفية</button>`:'<span class="muted chips-hint">جميع البيانات — انقر على أي عنصر في الرسوم البيانية لاستعراض تفاصيله، ثم اختر «تصفية اللوحة» لتطبيقه على جميع الأقسام.</span>'}`;
    icons();
  },
  bindChips(){
    $('#chips').addEventListener('click', e=>{
      const rm = e.target.closest('[data-rm]'); if(rm){ const k=rm.dataset.rm; Store.set({[k]:null},'chip'); return; }
      if(e.target.closest('#clearAll')){ Store.clearAll(); toast('مُسحت جميع عوامل التصفية، وتُعرض المحفظة كاملة'); }
    });
  },

  /* ---------------- section tabs ---------------- */
  TABS: [['overview','نظرة عامة','layout-dashboard'],['sales','المبيعات والفريق','receipt'],['marketing','العملاء والتسويق','megaphone'],['inventory','المخزون ورأس المال','warehouse'],['payments','التحصيل والتدفق النقدي','wallet'],['profit','الربحية','gem'],['vehicles','مستكشف المركبات','car-front']],
  bindTabs(){
    $('#tabs').innerHTML = App.TABS.map(([k,l,i])=>`<button data-tab="${k}" class="${k===App.ui.tab?'active':''}">${ic(i)}<span>${l}</span></button>`).join('');
    $('#tabs').addEventListener('click', e=>{ const b=e.target.closest('[data-tab]'); if(!b) return; App.showTab(b.dataset.tab); });
  },
  showTab(k){
    App.ui.tab = k;
    $$('#tabs [data-tab]').forEach(b=>b.classList.toggle('active', b.dataset.tab===k));
    $$('.tab-pane').forEach(p=>p.hidden = p.dataset.pane!==k);
    try{ history.replaceState(null,'','#'+k); }catch(e){}
    App.renderTab();
  },

  /* ---------------- render pipeline ---------------- */
  renderTab(){
    const k = App.ui.tab;
    const run = fn=>{ try{ fn(); }catch(err){ console.error('[render]', err); } };
    if(k==='overview'){ run(Exec.health); run(Overview.pulse); run(Overview.monthly); run(()=>Insights.render($('#insights'))); run(Exec.brandPerf); run(Exec.modelPerf); run(Exec.invRisk); run(()=>Exec.funnel('funnelMini', App.sel.funnelMini)); }
    if(k==='vehicles'){ run(Explorer.render); }
    else { window.Showroom && Showroom.setActive(false); }
    if(k==='sales'){ run(SalesViz.stats); run(SalesViz.ranking); run(SalesViz.volumeMargin); run(SalesViz.growth); run(Exec.branchScorecard); run(Exec.salesTeam); }
    if(k==='marketing'){ run(Marketing.funnel); run(Marketing.sourceTable); run(Marketing.sankey); run(Marketing.sourceBubble); run(Marketing.campaigns); run(Marketing.customers); }
    if(k==='inventory'){ run(Inventory.stats); run(Exec.capitalByBrand); run(Inventory.aging); run(Inventory.matrix); run(Exec.distributors); run(Inventory.heatmap); }
    if(k==='payments'){ run(Payments.stats); run(Payments.mix); run(Payments.collectedVsOutstanding); run(Payments.receivablesAging); run(Payments.cashflow); run(Payments.contracts); }
    if(k==='profit'){ run(Profit.waterfall); run(Profit.table); run(Profit.heatmap); }
    App.renderScopeLine();
    icons();
  },
  renderScopeLine(){
    const P = Periods.get(Store.state.period), f = filtersOf();
    $$('.scope-line').forEach(el=>el.innerHTML = `${ic('filter')} ${esc(P.label)}${Object.keys(f).map(k=>` · ${DIM_LABEL[k]}: ${esc(dimValueLabel(k,f[k]))}`).join('')}`);
  },
  render(changed=[]){
    App.renderFilters(changed); App.renderChips(); Explorer.crumbs();
    App.renderTab();
    $('#asOf').textContent = `البيانات حتى ${fmt.date(DB.meta.today)}`;
  },

  /* ---------------- global delegated clicks (marks → drill) ---------------- */
  bindDelegates(){
    document.addEventListener('click', e=>{
      if(e.target.closest('.drawer') || e.target.closest('.popover')) return;
      const m = e.target.closest('[data-m]'); if(m){ return Drill.slice({title:modelName(m.dataset.m), add:modelPatch(m.dataset.m), breakdown:'trim'}); }
      const inv = e.target.closest('[data-inv]'); if(inv){ return Drill.slice({title:`مخزون ${modelName(inv.dataset.inv)}`, add:modelPatch(inv.dataset.inv), tab:'stock'}); }
      const br = e.target.closest('.rk[data-branch]'); if(br){ return Drill.slice({title:`فرع ${L.branch(br.dataset.branch)}`, add:{branch:br.dataset.branch}, breakdown:'brand'}); }
      const ct = e.target.closest('[data-ct]'); if(ct){ return Drill.slice({title:L.custType(ct.dataset.ct), add:{custType:ct.dataset.ct}, breakdown:'payment'}); }
      const pm = e.target.closest('[data-pm]'); if(pm){ return Payments.openMethod(pm.dataset.pm); }
      const cs = e.target.closest('[data-cs]'); if(cs){ return Drill.slice({title:`عقود ${AR.contract[cs.dataset.cs]}`, tab:'contracts', contracts:{status:cs.dataset.cs, all:true}}); }
      const tm = e.target.closest('.tm[data-b]'); if(tm){ return Drill.slice({title:tm.dataset.b, add:{brand:tm.dataset.b}, breakdown:'model'}); }
    });
    $('#monthlyMetric').addEventListener('click', e=>{ const b=e.target.closest('[data-v]'); if(!b) return; App.ui.monthlyMetric=b.dataset.v; $$('#monthlyMetric button').forEach(x=>x.classList.toggle('active',x===b)); Overview.monthly(); });
    $('#rankMetric').addEventListener('click', e=>{ const b=e.target.closest('[data-v]'); if(!b) return; App.ui.rankMetric=b.dataset.v; $$('#rankMetric button').forEach(x=>x.classList.toggle('active',x===b)); SalesViz.ranking(); });
    $('#profitDim').innerHTML = ['brand','model','trim','bodyType','powertrain','priceSegment','branch','salesperson','source','custType','distributor','month'].map(k=>`<button data-v="${k}" class="${k===App.ui.profitDim?'active':''}">${Drill.BREAKDOWNS[k].label}</button>`).join('');
    $('#profitDim').addEventListener('click', e=>{ const b=e.target.closest('[data-v]'); if(!b) return; App.ui.profitDim=b.dataset.v; $$('#profitDim button').forEach(x=>x.classList.toggle('active',x===b)); Profit.table(); });
    const toggle = (id, key, fn)=>$(id).addEventListener('click', e=>{ const b=e.target.closest('[data-v]'); if(!b) return; App.ui[key]=b.dataset.v; $$(id+' button').forEach(x=>x.classList.toggle('active',x===b)); fn(); });
    toggle('#alertMode','alertMode',()=>Insights.render($('#insights')));
    toggle('#modelPerfMode','modelPerfMode',Exec.modelPerf);
    toggle('#spMode','spMode',Exec.salesTeam);
    document.addEventListener('click', e=>{ const tr=e.target.closest('.explore-link'); if(tr){ App.showTab('vehicles'); } });
    // viewer dock
    $('#views').addEventListener('click', e=>{
      const b = e.target.closest('.view-btn'); if(!b) return; const v = b.dataset.view;
      if(v==='spin'){ const on=!b.classList.contains('active'); b.classList.toggle('active',on); window.Showroom ? Showroom.spin(on) : Fallback.spin(on); return; }
      $$('#views .view-btn').forEach(x=>{ if(x.dataset.view!=='spin') x.classList.toggle('active', x===b && v!=='reset'); });
      if(v==='reset') $('#views [data-view="three"]').classList.add('active');
      window.markSpin(false);
      window.Showroom ? Showroom.view(v) : Fallback.view(v);
    });
    // alerts bell = the risk insights, each with a path to records
    $('#bell').addEventListener('click', e=>{
      const list = (App._insights||Insights.generate()).filter(x=>x.tone==='risk'||x.tone==='watch');
      const html = `<div class="notif"><h4>ما يتطلب انتباهك <small>${list.length} تنبيهات</small></h4>${list.map((x,i)=>`<button class="n" data-i="${i}"><span class="ic">${ic(x.icon)}</span><span><p>${esc(x.title)}</p><small>${esc(x.metric)}</small></span></button>`).join('')||'<p class="muted pad">لا توجد تنبيهات ضمن عوامل التصفية الحالية.</p>'}</div>`;
      Pop.open(e.currentTarget, html, 'bell', 'wide');
      Pop.el.onclick = ev=>{ const n=ev.target.closest('.n'); if(!n) return; Pop.close(); Drill.slice(JSON.parse(JSON.stringify(list[+n.dataset.i].drill))); };
    });
    $('#bell').setAttribute('data-pop','');
  },

  boot(){
    const t0 = performance.now();
    DB = DataSource.load();
    Periods.build();
    const badge = $('#dataBadge');
    badge.textContent = DB.meta.mode==='demo' ? 'بيانات تجريبية' : 'بيانات الإنتاج';
    badge.classList.toggle('demo', DB.meta.mode==='demo');
    badge.dataset.tip = DB.meta.mode==='demo'
      ? `بيانات تجريبية مولّدة (${fmt.count(DB.meta.counts.sales,NOUN.deal)}، ${fmt.int(DB.meta.counts.leads)} عميل محتمل، ${fmt.count(DB.meta.counts.vehicles,NOUN.veh)}). استبدلها ببيانات الإنتاج عبر DataSource.useProductionData().`
      : 'بيانات الإنتاج';
    if(DB.meta.validation.length) console.warn('[DataSource] validation:', DB.meta.validation);
    $('#today').textContent = fmt.date(DB.meta.today);
    App.bindFilters(); App.bindChips(); App.bindTabs(); App.bindDelegates(); Explorer.bind(); Overview.bindPulse();
    Store.subscribe(changed=>{ cancelAnimationFrame(App._raf); App._raf = requestAnimationFrame(()=>App.render(changed)); });
    const hashTab = location.hash.slice(1); if(App.TABS.some(t=>t[0]===hashTab)) App.ui.tab = hashTab;
    App.showTab(App.ui.tab);
    App.render();
    $('#footStamp').textContent = `${DB.meta.mode==='demo'?'بيانات تجريبية':'بيانات الإنتاج'} · ${fmt.count(DB.meta.counts.sales,NOUN.deal)} · ${fmt.int(DB.meta.counts.leads)} عميل محتمل · ${fmt.int(DB.meta.counts.payments)} دفعة · تحميل ${Math.round(performance.now()-t0)} ms`;
    document.body.classList.add('ready');
  }
};

window.App = App;

/* ---------- viewer dock state helpers (called by the 3D module) ---------- */
window.markView = v=>$$('#views .view-btn').forEach(x=>{ if(x.dataset.view!=='spin') x.classList.toggle('active', x.dataset.view===v); });
window.markSpin = on=>$('#views [data-view="spin"]')?.classList.toggle('active', on);

/* ---------- honest 2D fallback when WebGL / CDN is unavailable ---------- */
const Fallback = (()=>{
  let on=false, flip=1, zoom=1, spinT=null;
  const el = ()=>$('#fallback');
  const svg = c=>`<svg viewBox="0 0 820 330" xmlns="http://www.w3.org/2000/svg">
    <ellipse cx="410" cy="292" rx="400" ry="26" fill="#E3E5E9"/>
    <path id="fbPaint" fill="${c}" d="M58 238 L58 186 Q60 160 96 152 L196 138 L282 80 Q296 70 318 70 L612 68 Q640 68 656 84 L716 140 L752 150 Q770 156 772 180 L772 238 Q772 248 760 248 L704 248 A66 66 0 0 0 572 248 L258 248 A66 66 0 0 0 126 248 L70 248 Q58 248 58 238 Z"/>
    <path fill="#0d0f12" d="M296 86 L606 84 Q624 84 634 96 L684 140 L236 142 Z"/>
    ${[192,638].map(x=>`<g><circle cx="${x}" cy="248" r="56" fill="#141414"/><circle cx="${x}" cy="248" r="36" fill="#c9ccd1"/><circle cx="${x}" cy="248" r="8" fill="#6b6f75"/></g>`).join('')}
  </svg><div class="fb-note">عرض بديل ثنائي الأبعاد — تعذّر تشغيل العرض ثلاثي الأبعاد في هذا المتصفح</div>`;
  const draw = ()=>{ const s=el()?.querySelector('svg'); if(s) s.style.transform=`scale(${flip*zoom},${zoom})`; };
  return {
    show(){ if(on) return; on=true; const t=Store.selectedTrim(); const c=DB?DB.idx.color.get(App.ui.viewColor||'black').paint:'#111';
      el().innerHTML = svg(c); el().classList.add('show'); $('#loader').classList.add('hide');
      el().addEventListener('wheel',e=>{ e.preventDefault(); zoom=clamp(zoom-e.deltaY*.001,.8,1.25); draw(); },{passive:false});
      el().addEventListener('dblclick',()=>{ flip=1; zoom=1; draw(); }); },
    view(v){ if(!on) return; flip = v==='rear'?-1:1; if(v==='reset') zoom=1; draw(); },
    spin(v){ if(!on) return; clearInterval(spinT); if(v) spinT=setInterval(()=>{flip*=-1; draw();},1600); }
  };
})();
window.showFallback = reason=>{ console.info('[Showroom] fallback:', reason); Fallback.show(); };
setTimeout(()=>{ if(!window.Showroom) window.showFallback('timeout'); }, 15000);
