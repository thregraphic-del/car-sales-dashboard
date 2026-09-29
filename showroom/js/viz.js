/* =====================================================================
   VISUAL MODULES — each one answers a management question and every
   mark is clickable (→ Drill.slice / Records.*).
   ===================================================================== */
const C = {dark:'#151515', gold:'#B89B5E', goldSoft:'rgba(184,155,94,.35)', grey:'#D5D8DE', grey2:'#9CA3AF', neg:'#DC2626', pos:'#16A34A', warn:'#F59E0B', faint:'rgba(17,17,17,.05)'};
const Charts = {};
const hasChart = ()=>typeof window.Chart!=='undefined';
if(hasChart()){
  Chart.defaults.font.family = "'IBM Plex Sans Arabic', Inter, system-ui, sans-serif";
  Chart.defaults.font.size = 11; Chart.defaults.color = '#6B7280';
  Chart.defaults.plugins.legend.display = false;
  Object.assign(Chart.defaults.plugins.tooltip, {rtl:true, textDirection:'rtl', backgroundColor:'#151515', titleColor:'#fff', bodyColor:'rgba(255,255,255,.85)', padding:12, cornerRadius:12, titleFont:{weight:'500',size:12}, bodyFont:{size:11.5}, boxPadding:4, usePointStyle:true});
  Chart.defaults.animation.duration = 700;
}
function chart(id, cfg){
  const el = document.getElementById(id); if(!el) return null;
  if(!hasChart()){ const box=el.parentElement; if(!box.querySelector('.no-chart')) box.insertAdjacentHTML('beforeend','<div class="no-chart">تعذر تحميل مكتبة الرسوم (Chart.js) — الجداول والمؤشرات تعمل بشكل طبيعي.</div>'); return null; }
  Charts[id]?.destroy(); Charts[id] = new Chart(el, cfg); return Charts[id];
}
const pointer = (e,els)=>{ e.native.target.style.cursor = els.length?'pointer':'default'; };
// quadrant guide lines + labels for bubble matrices
const quadrantPlugin = {id:'quadrants', afterDraw(ch, a, o){
  if(!o || o.x==null) return; const {ctx, chartArea:ar, scales:{x,y}} = ch; const px=x.getPixelForValue(o.x), py=y.getPixelForValue(o.y);
  ctx.save(); ctx.strokeStyle='rgba(17,17,17,.18)'; ctx.setLineDash([4,4]); ctx.lineWidth=1;
  ctx.beginPath(); ctx.moveTo(px,ar.top); ctx.lineTo(px,ar.bottom); ctx.moveTo(ar.left,py); ctx.lineTo(ar.right,py); ctx.stroke(); ctx.setLineDash([]);
  ctx.font='500 10.5px "IBM Plex Sans Arabic", sans-serif'; ctx.fillStyle='rgba(107,114,128,.9)';
  const pad=8; ctx.textAlign='left'; ctx.fillText(o.labels[0], ar.left+pad, ar.top+14); ctx.textAlign='right'; ctx.fillText(o.labels[1], ar.right-pad, ar.top+14);
  ctx.textAlign='left'; ctx.fillText(o.labels[2], ar.left+pad, ar.bottom-8); ctx.textAlign='right'; ctx.fillText(o.labels[3], ar.right-pad, ar.bottom-8);
  ctx.restore();
}};
const median = arr => { const s=[...arr].sort((a,b)=>a-b); return s.length? s[Math.floor(s.length/2)] : 0; };
const ctx0 = ()=>({P:Periods.get(Store.state.period), f:filtersOf()});
const modelName = k => k.replace('|',' ');
const modelPatch = k => { const [brand,model]=k.split('|'); return {brand, model}; };
const card = (id, title, sub, extra='')=>`<div class="card-h"><div><h3>${title}</h3><p id="${id}-sub">${sub||''}</p></div>${extra}</div>`;

/* =====================================================================
   OVERVIEW
   ===================================================================== */
const PULSE = [
  {id:'revenue', icon:'banknote', cls:'hero-kpi dark', go:{tab:'overview'}},
  {id:'units', icon:'car', go:{tab:'sales'}},
  {id:'gp', icon:'gem', go:{tab:'overview', breakdown:'brand'}},
  {id:'margin', icon:'percent', go:{tab:'overview', breakdown:'model'}},
  {id:'collected', icon:'wallet', go:{tab:'payments'}},
  {id:'overdue', icon:'alarm-clock', go:{tab:'payments', pay:{status:'Overdue'}}},
  {id:'inventoryValue', icon:'warehouse', go:{tab:'stock'}},
  {id:'aged90', icon:'hourglass', go:{tab:'stock', stock:{ageMin:91, label:'أكثر من 90 يوماً'}}}
];
function pulseValues(f, P){
  const S = Q.summarize(Q.sales(f,P));
  const d = Math.min(P.end, DB.meta.todayDay);
  const St = Q.stockSummary(Q.stockAt(f,d), d);
  const rec = Q.receivables(f, P.end);
  return {revenue:S.revenue, units:S.units, gp:S.gp, margin:S.margin, collected:Q.payments(f,P,'_paid').reduce((a,p)=>a+p.paidAmount,0),
          overdue:rec.overdue, inventoryValue:St.value, aged90:St.aged90};
}
const Overview = {
  pulse(){
    const {P,f} = ctx0(), cur = pulseValues(f,P);
    const prev = P.prev ? pulseValues(prevF(f),P.prev) : {};
    // monthly spark (last 12 months)
    const keys = monthKeys().slice(-12);
    const byM = Q.group(Q.sales(f), s=>DB.isoOf(s._d).slice(0,7));
    const series = k => keys.map(m=>{ const rs=byM.get(m)||[]; const S=Q.summarize(rs); return k==='margin'?S.margin:k==='units'?S.units:k==='gp'?S.gp:S.revenue; });
    const host = $('#pulse');
    if(!host.children.length) host.innerHTML = PULSE.map(k=>`<div class="card kpi lift ${k.cls||''}" data-k="${k.id}" role="button" tabindex="0">
        <div class="k-h"><span class="k-l">${METRICS[k.id].label}</span><span class="k-tools"><button class="info-btn" data-info="${k.id}" aria-label="كيف يُحسب؟">${ic('info')}</button><i class="k-ic" data-lucide="${k.icon}"></i></span></div>
        <div class="k-v num"><bdi class="val">—</bdi></div><div class="k-t"><span class="tr"></span><span class="vs"></span></div><div class="k-viz"></div></div>`).join('');
    PULSE.forEach(k=>{
      const el = host.querySelector(`[data-k="${k.id}"]`), m = METRICS[k.id];
      animateValue(el.querySelector('.val'), cur[k.id], unitFmt[m.unit]);
      el.querySelector('.tr').innerHTML = m.snapshot && k.id!=='inventoryValue' && k.id!=='aged90' ? '' : trendHTML(change(cur[k.id],prev[k.id],m.kind||'pct'), m.better, m.kind||'pct');
      el.querySelector('.vs').textContent = m.snapshot ? (k.id==='overdue'?'كما في اليوم':'في نهاية الفترة') + (P.prev&&(k.id==='inventoryValue'||k.id==='aged90')?` · مقابل ${P.prev.label}`:'') : (P.prev?`مقابل ${P.prev.label}`:'');
      const viz = el.querySelector('.k-viz');
      if(['revenue','units','gp','margin'].includes(k.id)) viz.innerHTML = sparkSVG(series(k.id), {h:k.cls?44:30, stroke:k.cls?C.gold:C.dark, fill:k.cls?'rgba(184,155,94,.16)':C.faint});
      else if(k.id==='overdue'){ const r = Q.receivables(f,P.end); viz.innerHTML = `<div class="prog"><i style="width:${r.outstanding?clamp(r.overdue/r.outstanding,0,1)*100:0}%;background:${C.neg}"></i></div><div class="prog-l"><span>${fmt.pct(r.outstanding?r.overdue/r.outstanding:0,0)} من الذمم القائمة</span><span>${fmt.sarC(r.outstanding)}</span></div>`; }
      else if(k.id==='collected'){ const due = Q.payments(f,P,'_due').filter(p=>p._due<=DB.meta.todayDay); const rate = due.reduce((a,p)=>a+p.amount,0) ? due.reduce((a,p)=>a+p.paidAmount,0)/due.reduce((a,p)=>a+p.amount,0) : null; viz.innerHTML = `<div class="prog"><i style="width:${(rate||0)*100}%"></i></div><div class="prog-l"><span>نسبة التحصيل ${fmt.pct(rate,0)}</span><span data-info="collectionRate" class="link">ⓘ</span></div>`; }
      else if(k.id==='inventoryValue'){ const d=Math.min(P.end,DB.meta.todayDay); const St=Q.stockSummary(Q.stockAt(f,d),d); viz.innerHTML = `<div class="prog-l"><span>${fmt.int(St.units)} مركبة · ${fmt.int(St.available)} متاحة</span><span>متوسط العمر ${fmt.days(St.avgAge)}</span></div>`; }
      else if(k.id==='aged90'){ const d=Math.min(P.end,DB.meta.todayDay); const St=Q.stockSummary(Q.stockAt(f,d),d); viz.innerHTML = `<div class="prog"><i style="width:${St.units?St.aged90/St.units*100:0}%;background:${C.warn}"></i></div><div class="prog-l"><span>${fmt.sarC(St.aged90Value)} مجمدة</span><span>${fmt.pct(St.units?St.aged90/St.units:0,0)} من المخزون</span></div>`; }
    });
    icons();
  },
  bindPulse(){
    $('#pulse').addEventListener('click', e=>{
      if(e.target.closest('[data-info]')) return;
      const el = e.target.closest('[data-k]'); if(!el) return;
      const k = PULSE.find(x=>x.id===el.dataset.k);
      Drill.slice({title:METRICS[k.id].label, ...JSON.parse(JSON.stringify(k.go))});
    });
  },

  // Q: How are we trending month by month, and how does it compare with last year?
  monthly(){
    const {P,f} = ctx0(), metric = App.ui.monthlyMetric;
    const keys = monthKeys('2025-01'); const [ty] = DB.meta.today.split('-').map(Number);
    const cur = Array.from({length:12},(_,i)=>`${ty}-${String(i+1).padStart(2,'0')}`), prv = cur.map(k=>`${ty-1}${k.slice(4)}`);
    const byM = Q.group(Q.sales(f), s=>DB.isoOf(s._d).slice(0,7)), byMp = f.year ? Q.group(Q.sales(prevF(f)), s=>DB.isoOf(s._d).slice(0,7)) : byM;
    const val = (k, prior) => { if(!keys.includes(k)) return null; const S=Q.summarize((prior?byMp:byM).get(k)||[]); return metric==='units'?S.units:metric==='gp'?S.gp:metric==='margin'?(S.margin==null?null:S.margin*100):S.revenue; };
    const inPeriod = k => { const r=monthRange(k); return r.start<=P.end && r.end>=P.start; };
    const sel = App.sel.monthly;
    const fmtV = v => metric==='units'?fmt.int(v)+' مركبة':metric==='margin'?v.toFixed(1)+'%':fmt.sarC(v);
    $('#monthly-sub').textContent = `${{revenue:'الإيرادات',units:'الوحدات المباعة',gp:'إجمالي الربح',margin:'هامش الربح'}[metric]} الشهرية ${ty} مقابل ${ty-1} — اضغط أي شهر لعرض تفاصيله`;
    chart('monthlyChart', {data:{labels:AR.months, datasets:[
      {type:'bar', label:String(ty), data:cur.map(k=>val(k)), order:2, borderRadius:6, borderSkipped:false, barPercentage:.62,
        backgroundColor:cur.map(k=>k===sel?C.gold:inPeriod(k)?C.dark:C.grey), hoverBackgroundColor:cur.map(k=>k===sel?C.gold:'#000')},
      {type:'line', label:f.year?`${ty-1} (سنة طراز ${f.year-1})`:String(ty-1), data:prv.map(k=>val(k,true)), order:1, borderColor:C.grey2, borderWidth:1.5, borderDash:[4,4], pointRadius:0, pointHoverRadius:4, tension:.35}
    ]}, options:{maintainAspectRatio:false, interaction:{mode:'index',intersect:false},
      scales:{x:{grid:{display:false},border:{display:false}}, y:{grid:{color:C.faint},border:{display:false},ticks:{maxTicksLimit:5,callback:v=>metric==='units'?v:metric==='margin'?v+'%':fmt.money(v)}}},
      plugins:{tooltip:{callbacks:{label:c=>` ${c.dataset.label}: ${c.raw==null?'—':fmtV(c.raw)}`, footer:items=>{ const a=items.find(i=>i.datasetIndex===0)?.raw, b=items.find(i=>i.datasetIndex===1)?.raw; return a!=null&&b?`التغير السنوي: ${((a-b)/b*100).toFixed(1)}%`:''; }}}},
      onHover:pointer,
      onClick:(e,els)=>{ if(!els.length) return; const k=cur[els[0].index]; if(!keys.includes(k)) return toast('لا توجد بيانات لهذا الشهر بعد');
        App.sel.monthly=k; setTimeout(()=>{ Overview.monthly(); Drill.slice({title:`أداء ${fmt.month(k)}`, crumb:fmt.month(k), P:Periods.month(k), tab:'overview'}); }); }
    }});
  },

  // Q: Where does revenue come from, and is it profitable? (area = revenue, shade = margin)
  treemap(){
    const {P,f} = ctx0(), ff={...f}; delete ff.brand; delete ff.model; delete ff.year; delete ff.trim; delete ff.vehicleId;
    const rows = [...Q.group(Q.sales(ff,P), s=>s._t.brand)].map(([b,rs])=>({key:b, ...Q.summarize(rs)})).filter(x=>x.revenue>0).sort((a,b)=>b.revenue-a.revenue);
    const host = $('#treemap');
    const W = host.clientWidth||600, H = host.clientHeight||300;
    const ms = rows.map(r=>r.margin), lo=Math.min(...ms), hi=Math.max(...ms);
    const rects = squarify(rows.map(r=>({...r, value:r.revenue})), 0,0,W,H);
    host.innerHTML = rects.map(r=>{
      const t = hi>lo ? (r.margin-lo)/(hi-lo) : .5; const light = t<.45;
      const bg = `color-mix(in srgb, #151515 ${Math.round(18+t*82)}%, #E9EBEF)`;
      const selected = f.brand===r.key;
      return `<button class="tm ${light?'light':''} ${selected?'sel':''}" style="right:${r.x}px;top:${r.y}px;width:${r.w}px;height:${r.h}px;background:${bg}" data-b="${esc(r.key)}" data-tip="${esc(r.key)} · ${fmt.sarC(r.revenue)} · هامش ${fmt.pct(r.margin)} · ${r.units} مركبة">
        ${r.w>70&&r.h>40?`<b>${esc(r.key)}</b><span>${fmt.sarC(r.revenue)}</span>${r.h>64?`<em>هامش ${fmt.pct(r.margin)}</em>`:''}`:''}</button>`;
    }).join('');
    $('#treemap-sub').textContent = `المساحة = الإيرادات · اللون الأغمق = هامش أعلى · ${P.label}`;
  },

  // Q: What changed? biggest revenue movers vs comparison period
  movers(){
    const {P,f} = ctx0(), host=$('#movers');
    if(!P.prev){ host.innerHTML = '<p class="muted">لا توجد فترة مقارنة لهذا النطاق الزمني.</p>'; return; }
    const g = (rows)=>{ const m=new Map(); rows.forEach(s=>{ const k=s._t.brand+'|'+s._t.model; m.set(k,(m.get(k)||0)+s.sellingPrice); }); return m; };
    const a = g(Q.sales(f,P)), b = g(Q.sales(prevF(f),P.prev));
    const all = [...new Set([...a.keys(),...b.keys()])].map(k=>({k, cur:a.get(k)||0, prev:b.get(k)||0})).map(x=>({...x, d:x.cur-x.prev}));
    const up = all.filter(x=>x.d>0).sort((x,y)=>y.d-x.d).slice(0,4), down = all.filter(x=>x.d<0).sort((x,y)=>x.d-y.d).slice(0,4);
    const max = Math.max(...all.map(x=>Math.abs(x.d)),1);
    const row = x=>`<button class="mv" data-m="${esc(x.k)}"><span>${esc(modelName(x.k))}</span><span class="mv-bar ${x.d>0?'up':'down'}"><i style="width:${Math.abs(x.d)/max*100}%"></i></span><b class="num ${x.d>0?'pos-t':'neg-t'}">${x.d>0?'+':'−'}${fmt.sarC(Math.abs(x.d))}</b></button>`;
    host.innerHTML = `<h6>${ic('trending-up')} الأكثر نمواً</h6>${up.map(row).join('')||'<p class="muted">—</p>'}<h6>${ic('trending-down')} الأكثر تراجعاً</h6>${down.map(row).join('')||'<p class="muted">—</p>'}`;
    $('#movers-sub').textContent = `تغير الإيرادات حسب الطراز: ${P.label} مقابل ${P.prev.label}`;
    icons();
  }
};
// squarified treemap (x measured from the right edge for RTL)
function squarify(items, x, y, w, h){
  const out=[]; const total = items.reduce((a,i)=>a+i.value,0)||1; const scale = (w*h)/total;
  let rest = items.map(i=>({...i, area:i.value*scale}));
  const worst = (row, side)=>{ const s=row.reduce((a,r)=>a+r.area,0); const mx=Math.max(...row.map(r=>r.area)), mn=Math.min(...row.map(r=>r.area)); return Math.max(side*side*mx/(s*s), (s*s)/(side*side*mn)); };
  while(rest.length){
    const side = Math.min(w,h); let row=[rest[0]], i=1;
    while(i<rest.length && worst([...row,rest[i]],side) <= worst(row,side)){ row.push(rest[i]); i++; }
    const s = row.reduce((a,r)=>a+r.area,0);
    if(w>=h){ const cw = s/h; let cy=y; row.forEach(r=>{ const rh=r.area/cw; out.push({...r, x, y:cy, w:cw, h:rh}); cy+=rh; }); x+=cw; w-=cw; }
    else { const ch = s/w; let cx=x; row.forEach(r=>{ const rw=r.area/ch; out.push({...r, x:cx, y, w:rw, h:ch}); cx+=rw; }); y+=ch; h-=ch; }
    rest = rest.slice(i);
  }
  return out;
}

/* =====================================================================
   SALES
   ===================================================================== */
const SalesViz = {
  stats(){
    const {P,f}=ctx0(), S=Q.summarize(Q.sales(f,P)), B=P.prev?Q.summarize(Q.sales(prevF(f),P.prev)):null;
    const items=[['avgPrice',S.avgPrice],['avgDiscount',S.avgDiscount,`${fmt.pct(S.discountPct)} من سعر القائمة`],['gpPerUnit',S.gpPerUnit],['avgDts',S.avgDts],['contribution',S.contribution]];
    $('#sales-stats').innerHTML = items.map(([k,v,extra])=>{ const m=METRICS[k]; return `<div class="stat"><span class="l">${m.label} <button class="info-btn" data-info="${k}">${ic('info')}</button></span><b class="num">${unitFmt[m.unit](v)}</b><span class="c">${B?trendHTML(change(v,B[k],m.kind||'pct'),m.better,m.kind||'pct'):''}${extra?`<em>${extra}</em>`:''}</span></div>`; }).join('');
    icons();
  },
  // Q: Which vehicles sell the most / earn the most?
  ranking(){
    const {P,f}=ctx0(), metric=App.ui.rankMetric;
    const g=[...Q.group(Q.sales(f,P), s=>s._t._modelKey)].map(([k,rs])=>({k, ...Q.summarize(rs)}));
    const key = {units:'units',revenue:'revenue',gp:'gp'}[metric];
    g.sort((a,b)=>b[key]-a[key]); const top=g.slice(0,10), max=top[0]?.[key]||1;
    const fv = v=>metric==='units'?fmt.int(v):fmt.sarC(v);
    $('#ranking').innerHTML = top.map((r,i)=>`<button class="rk" data-m="${esc(r.k)}"><span class="rk-i">${i+1}</span><span class="rk-n">${esc(modelName(r.k))}<small>${fmt.int(r.units)} مركبة · هامش ${fmt.pct(r.margin)}</small></span><span class="rk-bar"><i style="width:${r[key]/max*100}%;background:${r.margin<(Q.summarize(Q.sales(f,P)).margin||0)-.02?C.warn:C.dark}"></i></span><b class="num">${fv(r[key])}</b></button>`).join('') || '<p class="muted">لا توجد مبيعات مطابقة.</p>';
  },
  // Q: Which vehicles are high-volume but low-margin?
  volumeMargin(){
    const {P,f}=ctx0();
    const g=[...Q.group(Q.sales(f,P), s=>s._t._modelKey)].map(([k,rs])=>({k, ...Q.summarize(rs)})).filter(x=>x.units>0);
    const mx=median(g.map(x=>x.units)), my=median(g.map(x=>x.margin*100)), rmax=Math.max(...g.map(x=>x.revenue),1);
    const col = x => x.units>=mx && x.margin*100<my ? C.warn : x.units>=mx ? C.dark : x.margin*100>=my ? C.gold : C.grey2;
    chart('vmChart',{type:'bubble', data:{datasets:[{data:g.map(x=>({x:x.units, y:x.margin*100, r:5+Math.sqrt(x.revenue/rmax)*22, k:x.k, rev:x.revenue})),
      backgroundColor:g.map(x=>col(x)+'CC'), borderColor:'#fff', borderWidth:1.5, hoverBorderColor:C.gold, hoverBorderWidth:2}]},
      plugins:[quadrantPlugin],
      options:{maintainAspectRatio:false, layout:{padding:8},
        scales:{x:{title:{display:true,text:'حجم المبيعات (وحدات)'},grid:{color:C.faint},border:{display:false}}, y:{title:{display:true,text:'هامش الربح %'},grid:{color:C.faint},border:{display:false},ticks:{callback:v=>v+'%'}}},
        plugins:{quadrants:{x:mx,y:my,labels:['حجم منخفض · هامش مرتفع','حجم مرتفع · هامش مرتفع','حجم منخفض · هامش منخفض','حجم مرتفع · هامش منخفض ⚠']},
          tooltip:{callbacks:{title:i=>modelName(i[0].raw.k), label:c=>[` الوحدات: ${c.raw.x}`,` الهامش: ${c.raw.y.toFixed(1)}%`,` الإيرادات: ${fmt.sarC(c.raw.rev)}`]}}},
        onHover:pointer, onClick:(e,els)=>{ if(!els.length) return; const k=Charts.vmChart.data.datasets[0].data[els[0].index].k; Drill.slice({title:modelName(k), add:modelPatch(k), breakdown:'trim'}); }}});
    const flagged = g.filter(x=>x.units>=mx && x.margin*100<my).sort((a,b)=>b.units-a.units);
    $('#vm-flag').innerHTML = flagged.length ? `${ic('triangle-alert')} حجم مرتفع وهامش منخفض: ${flagged.slice(0,4).map(x=>`<button class="link" data-m="${esc(x.k)}">${esc(modelName(x.k))} (${fmt.pct(x.margin)})</button>`).join('، ')}` : '';
    icons();
  },
  // Q: Which brands are growing, which models are declining?
  growth(){
    const {P,f}=ctx0(), host=$('#growth');
    const ff={...f}; delete ff.brand; delete ff.model; delete ff.year; delete ff.trim; delete ff.vehicleId;
    const cur = Q.group(Q.sales(ff,P), s=>s._t.brand), prev = P.prev?Q.group(Q.sales(ff,P.prev), s=>s._t.brand):new Map();
    const keys = monthKeys().slice(-12), byBM = Q.group(Q.sales(ff), s=>s._t.brand+'|'+DB.isoOf(s._d).slice(0,7));
    const rows = [...new Set([...cur.keys(),...prev.keys()])].map(b=>{ const a=Q.summarize(cur.get(b)||[]), p=Q.summarize(prev.get(b)||[]);
      return {b, units:a.units, revenue:a.revenue, margin:a.margin, gU:change(a.units,p.units), gR:change(a.revenue,p.revenue), spark:keys.map(k=>(byBM.get(b+'|'+k)||[]).length)}; });
    DataTable(host, {rows, searchable:false, pageSize:12, exportName:'brand-growth', initialSort:{key:2,dir:-1}, onRow:r=>Drill.slice({title:r.b, add:{brand:r.b}, breakdown:'model'}), columns:[
      {label:'العلامة', get:r=>r.b, render:r=>`<b>${esc(r.b)}</b>`},
      {label:'الوحدات', num:true, get:r=>r.units, render:r=>fmt.int(r.units)},
      {label:'الإيرادات', num:true, get:r=>r.revenue, render:r=>fmt.sarC(r.revenue)},
      {label:'نمو الوحدات', num:true, get:r=>r.gU??-999, render:r=>trendHTML(r.gU)},
      {label:'نمو الإيرادات', num:true, get:r=>r.gR??-999, render:r=>trendHTML(r.gR)},
      {label:'الهامش', num:true, get:r=>r.margin, render:r=>fmt.pct(r.margin)},
      {label:'آخر 12 شهراً', get:r=>0, render:r=>`<span class="tspark">${sparkSVG(r.spark,{w:90,h:22})}</span>`}
    ]});
    // declining models
    const cm = Q.group(Q.sales(f,P), s=>s._t._modelKey), pm = P.prev?Q.group(Q.sales(prevF(f),P.prev), s=>s._t._modelKey):new Map();
    const dec = [...pm.keys()].map(k=>({k, c:(cm.get(k)||[]).length, p:pm.get(k).length})).filter(x=>x.p>=6 && x.c<x.p).map(x=>({...x, g:(x.c-x.p)/x.p})).sort((a,b)=>a.g-b.g).slice(0,5);
    $('#declining').innerHTML = dec.length ? dec.map(x=>`<button class="mv" data-m="${esc(x.k)}"><span>${esc(modelName(x.k))}</span><span class="muted num">${x.p} ← ${x.c}</span><b class="neg-t num">${(x.g*100).toFixed(0)}%</b></button>`).join('') : '<p class="muted">لا توجد طرازات متراجعة بشكل ملحوظ في هذه الفترة.</p>';
  },
  // Q: Which branch / salesperson sells the most — and at what margin?
  people(){
    const {P,f}=ctx0();
    const fb={...f}; delete fb.branch; delete fb.salesperson;
    const br=[...Q.group(Q.sales(fb,P), s=>s.branchId)].map(([k,rs])=>({k, ...Q.summarize(rs)})).sort((a,b)=>b.revenue-a.revenue);
    const max=br[0]?.revenue||1;
    $('#branches').innerHTML = br.map(r=>`<button class="rk ${f.branch===r.k?'sel':''}" data-branch="${r.k}"><span class="rk-n">${L.branch(r.k)}<small>${fmt.int(r.units)} مركبة · هامش ${fmt.pct(r.margin)} · ${fmt.days(r.avgDts)} للبيع</small></span><span class="rk-bar"><i style="width:${r.revenue/max*100}%;background:${f.branch===r.k?C.gold:C.dark}"></i></span><b class="num">${fmt.sarC(r.revenue)}</b></button>`).join('');
    const fs={...f}; delete fs.salesperson;
    const sal = Q.group(Q.sales(fs,P), s=>s.salespersonId), lds = Q.group(Q.leads(fs,P), l=>l.salespersonId);
    const rows = DB.salespeople.filter(sp=>!f.branch||sp.branchId===f.branch).map(sp=>{ const S=Q.summarize(sal.get(sp.salespersonId)||[]); const n=(lds.get(sp.salespersonId)||[]).length; return {sp, ...S, leads:n, conv:n?S.units/n:null}; });
    DataTable($('#salespeople'), {rows, searchable:false, pageSize:8, exportName:'salespeople', initialSort:{key:2,dir:-1}, onRow:r=>Drill.slice({title:r.sp.name, add:{salesperson:r.sp.salespersonId}, breakdown:'model'}), columns:[
      {label:'المستشار', get:r=>r.sp.name, render:r=>`<b>${esc(r.sp.name)}</b><small>${L.branch(r.sp.branchId)}</small>`},
      {label:'الوحدات', num:true, get:r=>r.units, render:r=>fmt.int(r.units)},
      {label:'الإيرادات', num:true, get:r=>r.revenue, render:r=>fmt.sarC(r.revenue)},
      {label:'الربح', num:true, get:r=>r.gp, render:r=>fmt.sarC(r.gp)},
      {label:'الهامش', num:true, get:r=>r.margin, render:r=>fmt.pct(r.margin)},
      {label:'متوسط الخصم', num:true, get:r=>r.avgDiscount, render:r=>fmt.sarC(r.avgDiscount)},
      {label:'التحويل', num:true, get:r=>r.conv, render:r=>fmt.pct(r.conv)}
    ]});
  }
};

/* =====================================================================
   CUSTOMER ACQUISITION & MARKETING
   ===================================================================== */
// spend allocated to a slice: source/campaign spend × (slice leads ÷ all leads of that source) when other filters are active
function spendFor(f, P, source){
  const base = {source}; if(f.campaign) base.campaign=f.campaign;
  const total = Q.spend(base, P);
  const others = Object.keys(f).filter(k=>!['source','campaign','payment'].includes(k));
  if(!others.length || !total) return total;
  const all = Q.leads(base, P).length, part = Q.leads({...f, source}, P).length;
  return all ? total*part/all : 0;
}
function sourceStats(f, P){
  const fs = {...f}; delete fs.source;
  const leads = Q.leads(fs,P), q=Q.leads(fs,P,'_q'), td=Q.leads(fs,P,'_td'), of=Q.leads(fs,P,'_of'), rs=Q.leads(fs,P,'_rs'), sales=Q.sales(fs,P);
  const cnt = arr=>{ const m={}; arr.forEach(x=>m[x.source]=(m[x.source]||0)+1); return m; };
  const L0=cnt(leads), Lq=cnt(q), Ltd=cnt(td), Lof=cnt(of), Lrs=cnt(rs), Sg=Q.group(sales,s=>s.source);
  return DATA_SCHEMA.enums.leadSource.filter(s=>L0[s]||Sg.get(s)).map(s=>{
    const S=Q.summarize(Sg.get(s)||[]), spend=spendFor(fs,P,s), leadsN=L0[s]||0;
    return {s, leads:leadsN, qualified:Lq[s]||0, td:Ltd[s]||0, offers:Lof[s]||0, res:Lrs[s]||0, sales:S.units, revenue:S.revenue, gp:S.gp, spend,
            conv: leadsN? S.units/leadsN : null, qRate: leadsN? (Lq[s]||0)/leadsN : null, cpl: leadsN&&spend? spend/leadsN : null, cac: S.units&&spend? spend/S.units : null, roas: spend? S.revenue/spend : null};
  });
}
const Marketing = {
  // Q: Where does the pipeline leak?
  funnel(){
    const {P,f}=ctx0();
    const stages = [
      ['العملاء المحتملون', Q.leads(f,P).length, {tab:'leads', leadStage:'_d'}],
      ['عملاء مؤهلون', Q.leads(f,P,'_q').length, {tab:'leads', leadStage:'_q'}],
      ['تجارب القيادة', Q.leads(f,P,'_td').length, {tab:'leads', leadStage:'_td'}],
      ['عروض الأسعار', Q.leads(f,P,'_of').length, {tab:'leads', leadStage:'_of'}],
      ['الحجوزات', Q.leads(f,P,'_rs').length, {tab:'leads', leadStage:'_rs'}],
      ['المبيعات', Q.sales(f,P).length, {tab:'sales'}],
      ['المركبات المسلّمة', DB.sales.filter(s=>s.deliveryStatus==='Delivered' && Q.inP(s._delivered,P) && Q.saleMatch(s,f)).length, {tab:'sales', delivered:true}]
    ];
    const max = stages[0][1]||1;
    $('#funnel').innerHTML = stages.map((s,i)=>`<button class="fs ${App.sel.funnel===i?'sel':''}" data-i="${i}">
      <span class="fl">${s[0]}</span><span class="fb"><i style="width:${Math.max(3,s[1]/max*100)}%"></i><b class="num ${s[1]/max<.22?'out':''}" style="${s[1]/max<.22?`inset-inline-start:calc(${Math.max(3,s[1]/max*100)}% + 8px)`:''}">${fmt.int(s[1])}</b></span>
      <span class="fr">${i?`<b>${fmt.pct(stages[i-1][1]?s[1]/stages[i-1][1]:null,0)}</b>من المرحلة السابقة`:'<b>100%</b>'}</span></button>`).join('');
    $('#funnel').onclick = e=>{ const b=e.target.closest('.fs'); if(!b) return; const s=stages[+b.dataset.i]; App.sel.funnel=+b.dataset.i; Marketing.funnel(); Drill.slice({title:s[0], ...s[2]}); };
    $('#funnel-foot').innerHTML = `<span>التحويل من عميل محتمل إلى بيع: <b>${fmt.pct(stages[0][1]?stages[5][1]/stages[0][1]:null)}</b> <button class="info-btn" data-info="leadConv">${ic('info')}</button></span><span class="muted">المراحل تُحسب بتاريخ حدوثها ضمن الفترة</span>`;
    icons();
  },
  // Q: Which sources actually produce sales? (Sankey: source → outcome)
  sankey(){
    const {P,f}=ctx0(); const fs={...f}; delete fs.source;
    const leads = Q.leads(fs,P);
    const src = [...Q.group(leads,l=>l.source)].map(([s,ls])=>({s, n:ls.length, won:ls.filter(l=>l.status==='Won').length, open:ls.filter(l=>l.status==='Open').length})).map(x=>({...x, lost:x.n-x.won-x.open})).sort((a,b)=>b.n-a.n);
    const host = $('#sankey'); const W = host.clientWidth||700, H = 380, nodeW = 10, gap = 5, labelW = 205, labelL = 110;
    const total = src.reduce((a,x)=>a+x.n,0)||1;
    const avail = H - gap*(src.length-1);
    let y=0; const left = src.map(x=>{ const h=Math.max(2,x.n/total*avail); const o={...x, y, h}; y+=h+gap; return o; });
    const outs = [['won','تم البيع',C.gold],['open','قيد المتابعة',C.grey2],['lost','مفقود','#E5E7EB']];
    const outTot = outs.map(([k])=>left.reduce((a,x)=>a+x[k],0));
    const avail2 = H - gap*2*3; let y2=0;
    const right = outs.map(([k,label,color],i)=>{ const h=Math.max(4,outTot[i]/total*avail2); const o={k,label,color,y:y2,h,n:outTot[i]}; y2+=h+gap*3; return o; });
    const xR = W - labelW - nodeW, xL = labelL;            // RTL: sources on the right, outcomes on the left
    const cursorR = {}; right.forEach(r=>cursorR[r.k]=r.y);
    let paths='';
    left.forEach(s=>{ let sy=s.y; outs.forEach(([k,,color])=>{ const v=s[k]; if(!v) return; const h=v/s.n*s.h; const r=right.find(x=>x.k===k); const ty=cursorR[k], th=v/r.n*r.h; cursorR[k]+=th;
      const x0=xR, x1=xL+nodeW, mx=(x0+x1)/2;
      paths += `<path class="lk lk-${k}" data-s="${esc(s.s)}" d="M${x0},${sy} C${mx},${sy} ${mx},${ty} ${x1},${ty} L${x1},${ty+th} C${mx},${ty+th} ${mx},${sy+h} ${x0},${sy+h} Z" fill="${color}" fill-opacity="${k==='won'?.55:.28}"><title>${esc(L.source(s.s))} → ${outs.find(o=>o[0]===k)[1]}: ${fmt.int(v)}</title></path>`; sy+=h; }); });
    host.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" direction="ltr" style="direction:ltr">${paths}
      ${left.map(s=>`<g class="sk-node" data-s="${esc(s.s)}"><rect x="${xR}" y="${s.y}" width="${nodeW}" height="${s.h}" rx="2" fill="${C.dark}"/><text x="${xR+nodeW+8}" y="${s.y+s.h/2+4}" text-anchor="start">${esc(L.source(s.s))} · ${fmt.int(s.n)} · <tspan class="${s.won/s.n>.08?'good':''}">${fmt.pct(s.won/s.n)}</tspan></text></g>`).join('')}
      ${right.map(r=>`<g class="sk-out" data-o="${r.k}"><rect x="${xL}" y="${r.y}" width="${nodeW}" height="${r.h}" rx="2" fill="${r.k==='lost'?'#C9CDD4':r.color}"/><text x="${xL-8}" y="${r.y+r.h/2+4}" text-anchor="end">${r.label}<tspan x="${xL-8}" dy="15" class="sub">${fmt.int(r.n)} · ${fmt.pct(r.n/total,0)}</tspan></text></g>`).join('')}</svg>`;
    host.onclick = e=>{ const g=e.target.closest('[data-s]'); if(g) return Drill.slice({title:L.source(g.dataset.s), add:{source:g.dataset.s}, breakdown:'model'}); };
    $('#sankey-sub').textContent = `مآل العملاء المحتملين المسجلين في ${P.label} حسب المصدر · النسبة = التحويل إلى بيع`;
  },
  // Q: Which source is efficient, not just loud? (bubble: leads vs conversion, size revenue)
  sourceBubble(){
    const {P,f}=ctx0(), st=sourceStats(f,P).filter(x=>x.leads>0);
    const mx=median(st.map(x=>x.leads)), my=median(st.map(x=>(x.conv||0)*100)), rmax=Math.max(...st.map(x=>x.revenue),1);
    chart('srcChart',{type:'bubble', data:{datasets:[{data:st.map(x=>({x:x.leads, y:(x.conv||0)*100, r:5+Math.sqrt(x.revenue/rmax)*22, s:x.s, rev:x.revenue, roas:x.roas})),
      backgroundColor:st.map(x=>(f.source===x.s?C.gold:(x.conv||0)*100>=my?C.dark:C.grey2)+'CC'), borderColor:'#fff', borderWidth:1.5}]},
      plugins:[quadrantPlugin, {id:'srcLabels', afterDatasetsDraw(ch){ const {ctx}=ch; ctx.save(); ctx.font='500 10.5px "IBM Plex Sans Arabic"'; ctx.fillStyle='#374151'; ctx.textAlign='center';
        ch.getDatasetMeta(0).data.forEach((pt,i)=>{ const d=ch.data.datasets[0].data[i]; ctx.fillText(L.source(d.s), pt.x, pt.y-pt.options.radius-5); }); ctx.restore(); }}],
      options:{maintainAspectRatio:false, layout:{padding:{top:18,left:8,right:8}},
        scales:{x:{type:'logarithmic', title:{display:true,text:'عدد العملاء المحتملين (مقياس لوغاريتمي)'},grid:{color:C.faint},border:{display:false},ticks:{callback:v=>[100,300,1000,3000,10000].includes(v)?fmt.int(v):''}},
                y:{title:{display:true,text:'التحويل إلى بيع %'},grid:{color:C.faint},border:{display:false},ticks:{callback:v=>v+'%'}}},
        plugins:{quadrants:{x:mx,y:my,labels:['حجم قليل · تحويل مرتفع','حجم كبير · تحويل مرتفع','حجم قليل · تحويل ضعيف','حجم كبير · تحويل ضعيف']},
          tooltip:{callbacks:{title:i=>L.source(i[0].raw.s), label:c=>[` العملاء المحتملون: ${fmt.int(c.raw.x)}`,` التحويل: ${c.raw.y.toFixed(1)}%`,` الإيرادات: ${fmt.sarC(c.raw.rev)}`,` العائد على الإنفاق: ${fmt.x(c.raw.roas)}`]}}},
        onHover:pointer, onClick:(e,els)=>{ if(!els.length) return; const s=Charts.srcChart.data.datasets[0].data[els[0].index].s; Drill.slice({title:L.source(s), add:{source:s}, breakdown:'model'}); }}});
  },
  // Q: Full source economics — volume, conversion, revenue, profit, cost, CAC, ROAS
  sourceTable(){
    const {P,f}=ctx0(), st=sourceStats(f,P); const maxL=Math.max(...st.map(x=>x.leads),1);
    DataTable($('#srcTable'), {rows:st, searchable:false, pageSize:15, exportName:'lead-sources', initialSort:{key:7,dir:-1}, onRow:r=>Drill.slice({title:L.source(r.s), add:{source:r.s}, breakdown:'model'}), columns:[
      {label:'المصدر', get:r=>L.source(r.s), render:r=>`<b>${esc(L.source(r.s))}</b>`},
      {label:'العملاء المحتملون', num:true, get:r=>r.leads, render:r=>`${fmt.int(r.leads)}${barCell(r.leads,maxL,C.grey2)}`},
      {label:'مؤهلون', num:true, get:r=>r.qRate, render:r=>fmt.pct(r.qRate,0)},
      {label:'تجارب قيادة', num:true, get:r=>r.td, render:r=>fmt.int(r.td)},
      {label:'عروض', num:true, get:r=>r.offers, render:r=>fmt.int(r.offers)},
      {label:'حجوزات', num:true, get:r=>r.res, render:r=>fmt.int(r.res)},
      {label:'مبيعات', num:true, get:r=>r.sales, render:r=>`<b>${fmt.int(r.sales)}</b>`},
      {label:'الإيرادات', num:true, get:r=>r.revenue, render:r=>fmt.sarC(r.revenue)},
      {label:'إجمالي الربح', num:true, get:r=>r.gp, render:r=>fmt.sarC(r.gp)},
      {label:'التحويل', num:true, get:r=>r.conv, render:r=>`<b class="${r.conv>.08?'pos-t':r.conv<.03?'neg-t':''}">${fmt.pct(r.conv)}</b>`},
      {label:'الإنفاق', num:true, get:r=>r.spend, render:r=>r.spend?fmt.sarC(r.spend):'<span class="muted">عضوي</span>'},
      {label:'تكلفة العميل', num:true, get:r=>r.cpl??-1, render:r=>r.cpl?fmt.sar(r.cpl):'—'},
      {label:'تكلفة الاستحواذ', num:true, get:r=>r.cac??-1, render:r=>r.cac?fmt.sar(r.cac):'—'},
      {label:'العائد على الإنفاق', num:true, get:r=>r.roas??-1, render:r=>r.roas?`<b>${fmt.x(r.roas)}</b>`:'—'}
    ]});
    const tot = st.reduce((a,x)=>({l:a.l+x.leads, s:a.s+x.sales, sp:a.sp+x.spend, r:a.r+x.revenue}),{l:0,s:0,sp:0,r:0});
    $('#mkt-stats').innerHTML = [['leads',tot.l],['spend',tot.sp],['cpl',tot.l?tot.sp/tot.l:null],['cac',tot.s?tot.sp/tot.s:null],['roas',tot.sp?tot.r/tot.sp:null]]
      .map(([k,v])=>`<div class="stat"><span class="l">${METRICS[k].label} <button class="info-btn" data-info="${k}">${ic('info')}</button></span><b class="num">${unitFmt[METRICS[k].unit](v)}</b></div>`).join('');
    icons();
  },
  // Q: Which campaigns actually generate revenue?
  campaigns(){
    const {P,f}=ctx0(); const fc={...f}; delete fc.campaign;
    const leads = Q.group(Q.leads(fc,P), l=>l.campaignId||'—'), sales = Q.group(Q.sales(fc,P), s=>s.campaignId||'—');
    const rows = DB.campaigns.map(c=>{ const S=Q.summarize(sales.get(c.campaignId)||[]); const n=(leads.get(c.campaignId)||[]).length;
      const spend = DB.marketingSpend.filter(r=>r.campaignId===c.campaignId).reduce((a,r)=>{ const mr=monthRange(r.month); const ov=Math.max(0,Math.min(mr.end,P.end)-Math.max(mr.start,P.start)+1); return a+r.amount*ov/(mr.end-mr.start+1); },0);
      return {c, leads:n, units:S.units, revenue:S.revenue, gp:S.gp, spend, roas:spend?S.revenue/spend:null, cac:S.units&&spend?spend/S.units:null}; }).filter(r=>r.leads||r.units);
    DataTable($('#campaigns'), {rows, searchable:false, pageSize:10, exportName:'campaigns', initialSort:{key:3,dir:-1}, onRow:r=>Drill.slice({title:L.campaign(r.c.campaignId), add:{campaign:r.c.campaignId}, breakdown:'model'}), columns:[
      {label:'الحملة', get:r=>L.campaign(r.c.campaignId), render:r=>`<b>${esc(L.campaign(r.c.campaignId))}</b><small>${r.c.alwaysOn?'دائمة':`${fmt.date(r.c.start)} – ${fmt.date(r.c.end)}`}</small>`},
      {label:'العملاء المحتملون', num:true, get:r=>r.leads, render:r=>fmt.int(r.leads)},
      {label:'المبيعات', num:true, get:r=>r.units, render:r=>fmt.int(r.units)},
      {label:'الإيرادات', num:true, get:r=>r.revenue, render:r=>fmt.sarC(r.revenue)},
      {label:'الإنفاق', num:true, get:r=>r.spend, render:r=>r.spend?fmt.sarC(r.spend):'—'},
      {label:'تكلفة الاستحواذ', num:true, get:r=>r.cac??-1, render:r=>r.cac?fmt.sar(r.cac):'—'},
      {label:'العائد', num:true, get:r=>r.roas??-1, render:r=>r.roas?`<b>${fmt.x(r.roas)}</b>`:'—'}
    ]});
  },
  customers(){
    const {P,f}=ctx0(); const fc={...f}; delete fc.custType;
    const g=[...Q.group(Q.sales(fc,P), s=>s.customerType)].map(([k,rs])=>({k,...Q.summarize(rs)})).sort((a,b)=>b.revenue-a.revenue);
    const tot=g.reduce((a,x)=>a+x.revenue,0)||1;
    $('#custTypes').innerHTML = g.map(x=>`<button class="rk" data-ct="${x.k}"><span class="rk-n">${L.custType(x.k)}<small>${fmt.int(x.units)} مركبة · هامش ${fmt.pct(x.margin)} · خصم ${fmt.pct(x.discountPct)}</small></span><span class="rk-bar"><i style="width:${x.revenue/tot*100}%"></i></span><b class="num">${fmt.pct(x.revenue/tot,0)}</b></button>`).join('');
  }
};

/* =====================================================================
   INVENTORY
   ===================================================================== */
const AGING = [[0,30,'0–30 يوم'],[31,60,'31–60 يوم'],[61,90,'61–90 يوم'],[91,120,'91–120 يوم'],[121,9999,'أكثر من 120 يوم']];
function modelInventory(f, d){
  // velocity & demand over the 90 days before `d`; stock at `d`
  const W = {start:d-89, end:d};
  const sales = Q.group(Q.sales(f,W), s=>s._t._modelKey), leads = Q.group(Q.leads(f,W), l=>l._t._modelKey);
  const stock = Q.group(Q.stockAt(f,d), v=>v._t._modelKey), gp = Q.group(Q.sales(f,{start:d-364,end:d}), s=>s._t._modelKey);
  const keys = new Set([...sales.keys(),...stock.keys()]);
  return [...keys].map(k=>{ const st=stock.get(k)||[]; const S=Q.stockSummary(st,d); const vel=(sales.get(k)||[]).length/3; const dem=(leads.get(k)||[]).length/3;
    const m = Q.summarize(gp.get(k)||[]).margin;
    return {k, stock:S.units, available:S.available, value:S.value, avgAge:S.avgAge, aged90:S.aged90, vel, dem, margin:m, dos: vel? S.units/(vel/30) : (S.units?999:0)}; });
}
const Inventory = {
  stats(){
    const {P,f}=ctx0(), d=Math.min(P.end,DB.meta.todayDay), S=Q.stockSummary(Q.stockAt(f,d),d);
    const sales = Q.summarize(Q.sales(f,P)); const days = P.end-P.start+1;
    const startV = Q.stockSummary(Q.stockAt(f,P.start),P.start).value; const turnover = (startV+S.value)/2 ? (sales.revenue-sales.gp)*(365/days)/((startV+S.value)/2) : null;
    const items = [['available',S.available],['inventoryValue',S.value],['avgAge',S.avgAge],['aged90',S.aged90],['turnover',turnover]];
    $('#inv-stats').innerHTML = items.map(([k,v])=>`<div class="stat"><span class="l">${METRICS[k].label} <button class="info-btn" data-info="${k}">${ic('info')}</button></span><b class="num">${unitFmt[METRICS[k].unit](v)}</b></div>`).join('')
      + `<div class="stat"><span class="l">محجوز / قيد التجهيز</span><b class="num">${fmt.int(S.reserved)} / ${fmt.int(S.service)}</b></div>`;
    icons();
  },
  // Q: How old is our stock and how much money is sitting in each age band?
  aging(){
    const {P,f}=ctx0(), d=Math.min(P.end,DB.meta.todayDay), units=Q.stockAt(f,d);
    const b = AGING.map(([lo,hi,label])=>{ const u=units.filter(v=>{ const a=d-v._arr; return a>=lo && a<=hi; }); return {lo,hi,label,n:u.length,value:u.reduce((a,v)=>a+v.purchaseCost,0)}; });
    const max = Math.max(...b.map(x=>x.n),1);
    $('#aging').innerHTML = b.map((x,i)=>`<button class="ag ${i>=3?'risk':i===2?'watch':''} ${App.sel.aging===i?'sel':''}" data-i="${i}">
      <span class="ag-bar"><i style="height:${Math.max(4,x.n/max*100)}%"></i></span><b class="num">${fmt.int(x.n)}</b><span>${x.label}</span><em class="num">${fmt.sarC(x.value)}</em></button>`).join('');
    $('#aging').onclick = e=>{ const el=e.target.closest('.ag'); if(!el) return; const x=b[+el.dataset.i]; App.sel.aging=+el.dataset.i; Inventory.aging();
      Drill.slice({title:`مخزون ${x.label}`, tab:'stock', stock:{ageMin:x.lo, ageMax:x.hi, label:x.label}}); };
  },
  // Q: Where is demand vs supply out of balance? X velocity, Y demand, size inventory value, colour margin
  matrix(){
    const {P,f}=ctx0(), d=Math.min(P.end,DB.meta.todayDay), rows=modelInventory(f,d).filter(x=>x.stock||x.vel);
    const mx=median(rows.map(x=>x.vel)), my=median(rows.map(x=>x.dem)), vmax=Math.max(...rows.map(x=>x.value),1);
    const ms=rows.map(x=>x.margin||0), lo=Math.min(...ms), hi=Math.max(...ms);
    const col = m => { const t=hi>lo?((m||0)-lo)/(hi-lo):.5; return `rgba(${Math.round(210-t*189)},${Math.round(213-t*192)},${Math.round(219-t*198)},.85)`; };
    chart('matrixChart',{type:'bubble', data:{datasets:[{data:rows.map(x=>({x:x.vel, y:x.dem, r:4+Math.sqrt(x.value/vmax)*24, ...x})),
      backgroundColor:rows.map(x=>x.dos>150&&x.stock>=3?'rgba(245,158,11,.85)':x.dos<25&&x.dem>=my?'rgba(184,155,94,.95)':col(x.margin)), borderColor:'#fff', borderWidth:1.5}]},
      plugins:[quadrantPlugin],
      options:{maintainAspectRatio:false, layout:{padding:8},
        scales:{x:{title:{display:true,text:'سرعة البيع (وحدة/شهر، آخر 90 يوماً)'},grid:{color:C.faint},border:{display:false}}, y:{title:{display:true,text:'الطلب (عملاء محتملون/شهر)'},grid:{color:C.faint},border:{display:false}}},
        plugins:{quadrants:{x:mx,y:my,labels:['طلب مرتفع · بيع بطيء','طلب مرتفع · بيع سريع','طلب منخفض · بيع بطيء','طلب منخفض · بيع سريع']},
          tooltip:{callbacks:{title:i=>modelName(i[0].raw.k), label:c=>{ const r=c.raw; return [` سرعة البيع: ${r.vel.toFixed(1)} / شهر`,` الطلب: ${r.dem.toFixed(0)} عميل / شهر`,` المخزون: ${r.stock} (${fmt.sarC(r.value)})`,` أيام التغطية: ${r.dos>=999?'∞':Math.round(r.dos)}`,` الهامش: ${fmt.pct(r.margin)}`]; }}}},
        onHover:pointer, onClick:(e,els)=>{ if(!els.length) return; const r=Charts.matrixChart.data.datasets[0].data[els[0].index]; Drill.slice({title:`مخزون ${modelName(r.k)}`, add:modelPatch(r.k), tab:'stock'}); }}});
    // risk lists
    const under = rows.filter(x=>x.dem>=my && x.dos<30).sort((a,b)=>a.dos-b.dos).slice(0,6);
    const over = rows.filter(x=>x.dem<my && x.dos>90 && x.stock>=2).sort((a,b)=>b.value-a.value).slice(0,6);
    const risk = rows.filter(x=>x.aged90>0).sort((a,b)=>b.aged90-a.aged90).slice(0,6);
    const li = (x,meta)=>`<button class="mv" data-inv="${esc(x.k)}"><span>${esc(modelName(x.k))}</span><span class="muted num">${meta}</span></button>`;
    $('#under').innerHTML = under.map(x=>li(x,`${x.stock} بالمخزون · ${x.dem.toFixed(0)} طلب/شهر · تغطية ${Math.round(x.dos)} يوم`)).join('') || '<p class="muted">لا توجد حالات نقص واضحة.</p>';
    $('#over').innerHTML = over.map(x=>li(x,`${x.stock} بالمخزون · ${fmt.sarC(x.value)} · تغطية ${x.dos>=999?'∞':Math.round(x.dos)} يوم`)).join('') || '<p class="muted">لا يوجد فائض واضح.</p>';
    $('#discountRisk').innerHTML = risk.map(x=>li(x,`${x.aged90} مركبة > 90 يوماً · متوسط العمر ${Math.round(x.avgAge)} يوم`)).join('') || '<p class="muted">لا توجد مركبات معرضة لخطر الخصم.</p>';
  },
  // Q: What is available where? branch × brand units (click → units)
  heatmap(){
    const {P,f}=ctx0(), d=Math.min(P.end,DB.meta.todayDay); const ff={...f}; delete ff.branch;
    const units = Q.stockAt(ff,d).filter(v=>v.status!=='In Service');
    const brands = [...new Set(units.map(v=>v._t.brand))].sort(), br = DB.branches.map(b=>b.branchId);
    const cnt = {}; units.forEach(v=>{ const k=v.branchId+'|'+v._t.brand; cnt[k]=(cnt[k]||0)+1; });
    const max = Math.max(...Object.values(cnt),1);
    $('#heat').innerHTML = `<table class="heat"><thead><tr><th></th>${br.map(b=>`<th>${L.branch(b)}</th>`).join('')}<th>الإجمالي</th></tr></thead><tbody>${brands.map(b=>`<tr><th>${esc(b)}</th>${br.map(x=>{ const n=cnt[x+'|'+b]||0; const t=n/max;
      return `<td data-b="${esc(b)}" data-br="${x}" class="${f.branch===x?'selcol':''}" style="background:rgba(21,21,21,${(t*.85).toFixed(2)});color:${t>.45?'#fff':'#111'}">${n||'·'}</td>`; }).join('')}<td class="tot">${br.reduce((a,x)=>a+(cnt[x+'|'+b]||0),0)}</td></tr>`).join('')}</tbody></table>`;
    $('#heat').onclick = e=>{ const td=e.target.closest('td[data-b]'); if(!td) return; Drill.slice({title:`${td.dataset.b} · ${L.branch(td.dataset.br)}`, add:{brand:td.dataset.b, branch:td.dataset.br}, tab:'stock'}); };
  }
};

/* =====================================================================
   PAYMENTS, COLLECTIONS & CASH FLOW
   ===================================================================== */
const Payments = {
  stats(){
    const {P,f}=ctx0(), S=Q.summarize(Q.sales(f,P)), paid=Q.payments(f,P,'_paid').reduce((a,p)=>a+p.paidAmount,0);
    const due=Q.payments(f,P,'_due').filter(p=>p._due<=DB.meta.todayDay), dueAmt=due.reduce((a,p)=>a+p.amount,0), duePaid=due.reduce((a,p)=>a+p.paidAmount,0);
    const rec=Q.receivables(f,P.end);
    const items=[['revenue',S.revenue,'قيمة المبيعات'],['collected',paid],['outstanding',rec.outstanding],['overdue',rec.overdue],['collectionRate',dueAmt?duePaid/dueAmt:null]];
    $('#pay-stats').innerHTML = items.map(([k,v,lab])=>`<div class="stat ${k==='overdue'?'neg':''}"><span class="l">${lab||METRICS[k].label} <button class="info-btn" data-info="${k}">${ic('info')}</button></span><b class="num">${unitFmt[METRICS[k].unit](v)}</b></div>`).join('');
    icons();
  },
  // Q: How do customers pay? (value share by method)
  mix(){
    const {P,f}=ctx0(); const fp={...f}; delete fp.payment;
    const S=Q.summarize(Q.sales(fp,P)), keys=DATA_SCHEMA.enums.paymentMethod, vals=keys.map(k=>S.byMethod[k]||0), tot=vals.reduce((a,b)=>a+b,0)||1;
    const colors=[C.dark,'#4B5563',C.gold,C.grey];
    chart('mixChart',{type:'doughnut', data:{labels:keys.map(L.payment), datasets:[{data:vals, backgroundColor:colors, borderWidth:0, spacing:2, offset:keys.map(k=>k===f.payment||k===App.sel.mix?10:0), hoverOffset:6}]},
      options:{maintainAspectRatio:false, cutout:'72%', layout:{padding:10}, onHover:pointer,
        plugins:{tooltip:{callbacks:{label:c=>` ${c.label}: ${fmt.sarC(c.raw)} (${Math.round(c.raw/tot*100)}%)`}}},
        onClick:(e,els)=>{ if(els.length){ const k=keys[els[0].index]; setTimeout(()=>Payments.openMethod(k)); } }}});
    $('#mixCenter').innerHTML = `<div><b>${fmt.money(S.revenue)}</b><small>ر.س · قيمة المبيعات</small></div>`;
    $('#mixLegend').innerHTML = keys.map((k,i)=>`<li data-pm="${k}" class="${f.payment===k?'hl':''}"><span><i style="background:${colors[i]}"></i>${L.payment(k)}</span><span><b class="num">${fmt.sarC(vals[i])}</b><em>${Math.round(vals[i]/tot*100)}%</em></span></li>`).join('');
  },
  openMethod(k){ App.sel.mix=k; Payments.mix(); Drill.slice({title:L.payment(k), add:{payment:k}, tab:k==='Finance'?'contracts':'overview', breakdown:'custType'}); },
  // Q: Collected vs outstanding, by payment method
  collectedVsOutstanding(){
    const {P,f}=ctx0(); const fp={...f}; delete fp.payment;
    const rows = DATA_SCHEMA.enums.paymentMethod.map(k=>{ const r=Q.receivables({...fp,payment:k},P.end); const coll=r.rows.reduce((a,s)=>a+s.collected,0); return {k, coll, out:r.outstanding, od:r.overdue}; });
    const max = Math.max(...rows.map(r=>r.coll+r.out),1);
    $('#cvo').innerHTML = rows.map(r=>`<button class="cvo" data-pm="${r.k}"><span class="n">${L.payment(r.k)}</span><span class="st"><i class="c" style="width:${r.coll/max*100}%"></i><i class="o" style="width:${(r.out-r.od)/max*100}%"></i><i class="d" style="width:${r.od/max*100}%"></i></span><span class="v num">${fmt.pct((r.coll)/((r.coll+r.out)||1),0)} محصّل</span></button>`).join('')
      + `<div class="legend"><span><i style="background:${C.dark}"></i>محصّل</span><span><i style="background:${C.grey}"></i>قائم غير متأخر</span><span><i style="background:${C.neg}"></i>متأخر</span></div>`;
  },
  // Q: How old are our unpaid receivables?
  receivablesAging(){
    const {P,f}=ctx0(), r=Q.receivables(f,P.end);
    const od = DB.payments.filter(p=>p.status==='Overdue' && p._s._d<=P.end && Q.saleMatch(p._s,f));
    const buckets=[['غير مستحق بعد',null,null],['1–30 يوم',1,30],['31–60 يوم',31,60],['61–90 يوم',61,90],['أكثر من 90 يوم',91,99999]];
    const vals = buckets.map(([l,a,b],i)=> i===0 ? r.outstanding-r.overdue : od.filter(p=>p._daysOverdue>=a&&p._daysOverdue<=b).reduce((s,p)=>s+p.amount,0));
    const max=Math.max(...vals,1);
    $('#recAging').innerHTML = buckets.map(([l,a,b],i)=>`<button class="ra ${i?'late':''} ${i>=3?'risk':''}" data-i="${i}"><span class="n">${l}</span><span class="bar"><i style="width:${vals[i]/max*100}%"></i></span><b class="num">${fmt.sarC(vals[i])}</b></button>`).join('');
    $('#recAging').onclick = e=>{ const el=e.target.closest('.ra'); if(!el) return; const i=+el.dataset.i, [l,a,b]=buckets[i];
      if(i===0) return Drill.slice({title:'ذمم غير مستحقة بعد', tab:'contracts'});
      Drill.slice({title:`متأخرات ${l}`, tab:'payments', pay:{status:'Overdue', odMin:a, odMax:b, label:l}}); };
  },
  // Q: Cash in (actual) vs expected vs overdue, and cash tied up in stock — past 12 and next 6 months
  cashflow(){
    const {f}=ctx0(), T=DB.meta.todayDay, [ty,tm]=DB.meta.today.split('-').map(Number);
    const keys=[]; for(let i=-11;i<=6;i++){ const d=new Date(Date.UTC(ty,tm-1+i,1)); keys.push(d.toISOString().slice(0,7)); }
    const pays = DB.payments.filter(p=>Q.saleMatch(p._s,f));
    const bucket = k=>{ const [y,m]=k.split('-').map(Number); const s=DB.dayOf(`${k}-01`); const e=DB.dayOf(m===12?`${y+1}-01-01`:`${y}-${String(m+1).padStart(2,'0')}-01`)-1; return {s,e}; };
    const rows = keys.map(k=>{ const {s,e}=bucket(k); let sale=0, inst=0, exp=0, od=0;
      pays.forEach(p=>{ if(p._paid!=null && p._paid>=s && p._paid<=e){ if(p.type==='Installment') inst+=p.paidAmount; else sale+=p.paidAmount; }
        if(p._due>=s && p._due<=e && p._paid==null){ if(p.status==='Overdue') od+=p.amount; else exp+=p.amount; } });
      const stock = e<=T ? Q.stockSummary(Q.stockAt(f,Math.min(e,T)),e).value : s<=T ? Q.stockSummary(Q.stockAt(f,T),T).value : null;
      return {k,s,e,sale,inst,exp,od,stock}; });
    const sel = App.sel.cash;
    chart('cashChart',{data:{labels:keys.map(fmt.monthShort), datasets:[
      {type:'bar', label:'محصّل من المبيعات', data:rows.map(r=>r.sale), backgroundColor:rows.map(r=>r.k===sel?C.gold:C.dark), stack:'c', borderRadius:4, order:2},
      {type:'bar', label:'محصّل من الأقساط', data:rows.map(r=>r.inst), backgroundColor:rows.map(r=>r.k===sel?C.gold:'#6B7280'), stack:'c', borderRadius:4, order:2},
      {type:'bar', label:'متوقع (مجدول)', data:rows.map(r=>r.exp), backgroundColor:C.goldSoft, stack:'c', borderRadius:4, order:2},
      {type:'bar', label:'متأخر غير محصّل', data:rows.map(r=>r.od), backgroundColor:'rgba(220,38,38,.75)', stack:'c', borderRadius:4, order:2},
      {type:'line', label:'نقد مجمّد في المخزون', data:rows.map(r=>r.stock), yAxisID:'y1', borderColor:C.gold, borderWidth:1.6, pointRadius:0, tension:.35, order:1}
    ]}, options:{maintainAspectRatio:false, interaction:{mode:'index',intersect:false},
      scales:{x:{stacked:true,grid:{display:false},border:{display:false}}, y:{stacked:true,grid:{color:C.faint},border:{display:false},ticks:{maxTicksLimit:5,callback:v=>fmt.money(v)}},
              y1:{position:'right',grid:{display:false},border:{display:false},ticks:{maxTicksLimit:4,callback:v=>fmt.money(v)}}},
      plugins:{tooltip:{callbacks:{label:c=>` ${c.dataset.label}: ${fmt.sarC(c.raw)}`}}}, onHover:pointer,
      onClick:(e,els)=>{ if(!els.length) return; const r=rows[els[0].index]; App.sel.cash=r.k;
        const P={id:null, label:fmt.month(r.k), start:r.s, end:Math.max(r.s,r.e), prev:null};
        setTimeout(()=>{ Payments.cashflow(); Drill.slice({title:`التدفق النقدي · ${fmt.month(r.k)}`, crumb:fmt.month(r.k), P, tab:'payments', pay:r.s>T?{field:'_due'}:{field:'_paid'}}); }); }}});
    const past = rows.filter(r=>r.e<=T||r.s<=T), fut = rows.filter(r=>r.s>T);
    $('#cash-sub').textContent = `آخر 12 شهراً فعلي: ${fmt.sarC(past.reduce((a,r)=>a+r.sale+r.inst,0))} · متوقع خلال 6 أشهر: ${fmt.sarC(fut.reduce((a,r)=>a+r.exp,0))} · متأخر: ${fmt.sarC(rows.reduce((a,r)=>a+r.od,0))}`;
  },
  contracts(){
    const {P,f}=ctx0(); const fc={...f}; delete fc.payment;
    const all = DB.financeContracts.filter(s=>s._d<=P.end && Q.saleMatch(s,fc) && s.outstanding>0);
    const st = ['Current','Late','Default'].map(k=>({k, n:all.filter(s=>s.contractStatus===k).length, out:all.filter(s=>s.contractStatus===k).reduce((a,s)=>a+s.outstanding,0)}));
    $('#contractStatus').innerHTML = st.map(x=>`<button class="cs ${x.k.toLowerCase()}" data-cs="${x.k}"><span>${AR.contract[x.k]}</span><b class="num">${fmt.int(x.n)}</b><em class="num">${fmt.sarC(x.out)}</em></button>`).join('');
    const top = all.filter(s=>s.overdueAmount>0).sort((a,b)=>b.overdueAmount-a.overdueAmount);
    DataTable($('#contractsTable'), {rows:top, searchable:true, pageSize:8, exportName:'overdue-contracts', onRow:s=>Records.sale(s.saleId), empty:'لا توجد عقود متأخرة ضمن الفلاتر الحالية', columns:[
      {label:'العميل', get:s=>s._cust.name, render:s=>`<b>${esc(s._cust.name)}</b><small>${L.branch(s.branchId)}</small>`},
      {label:'المركبة', get:s=>L.vehicle(s._t)},
      {label:'القسط', num:true, get:s=>s.installmentAmount, render:s=>fmt.sar(s.installmentAmount)},
      {label:'المدفوع', num:true, get:s=>s.installmentsPaid, render:s=>`${s.installmentsPaid}/${s.installments}`},
      {label:'المتبقي', num:true, get:s=>s.outstanding, render:s=>fmt.sarC(s.outstanding)},
      {label:'المتأخر', num:true, get:s=>s.overdueAmount, render:s=>`<b class="neg-t">${fmt.sar(s.overdueAmount)}</b>`},
      {label:'أقصى تأخير', num:true, get:s=>s.maxDaysOverdue, render:s=>`${s.maxDaysOverdue} يوم`},
      {label:'الحالة', get:s=>s.contractStatus, render:s=>statusPill(AR.contract[s.contractStatus], s.contractStatus==='Default'?'neg':'warn')}
    ]});
  }
};

/* =====================================================================
   PROFITABILITY
   ===================================================================== */
const Profit = {
  // Q: Where does list value leak before it becomes contribution?
  waterfall(){
    const {P,f}=ctx0(), S=Q.summarize(Q.sales(f,P));
    const steps=[['سعر القائمة',S.listValue,'total'],['الخصومات',-S.discount],['الإيرادات',S.revenue,'total'],['تكلفة المركبات',-S.cost],['إجمالي الربح',S.gp,'total'],['إيراد التمويل',S.fi],['إيرادات أخرى',S.other],['تكلفة الاستحواذ',-S.acq],['المساهمة',S.contribution,'total']];
    let run=0; const bars=steps.map(([l,v,t])=>{ if(t){ run=v; return [0,v]; } const a=run; run+=v; return [a,run]; });
    chart('wfChart',{type:'bar', data:{labels:steps.map(s=>s[0]), datasets:[{data:bars, borderRadius:5, borderSkipped:false, barPercentage:.62,
      backgroundColor:steps.map(([l,v,t])=>t?(l==='المساهمة'?C.gold:C.dark):v<0?'rgba(220,38,38,.75)':'rgba(22,163,74,.75)')}]},
      options:{maintainAspectRatio:false, scales:{x:{grid:{display:false},border:{display:false},ticks:{font:{size:10.5}}}, y:{grid:{color:C.faint},border:{display:false},ticks:{maxTicksLimit:5,callback:v=>fmt.money(v)}}},
        plugins:{tooltip:{callbacks:{label:c=>{ const [l,v]=steps[c.dataIndex]; return ` ${l}: ${fmt.sar(v)} (${fmt.pct(S.listValue?Math.abs(v)/S.listValue:null)} من سعر القائمة)`; }}}}, onHover:pointer,
        onClick:(e,els)=>{ if(!els.length) return; Drill.slice({title:'تفاصيل الربحية', tab:'overview', breakdown:'model'}); }}});
    $('#wf-sub').textContent = `${P.label} · الهامش الإجمالي ${fmt.pct(S.margin)} · المساهمة ${fmt.pct(S.revenue?S.contribution/S.revenue:null)} من الإيرادات`;
  },
  // Q: Profitability by any dimension
  table(){
    const {P,f}=ctx0(), dim=App.ui.profitDim, B=Drill.BREAKDOWNS[dim];
    const g=[...Q.group(Q.sales(f,P),B.key)].map(([k,rs])=>({k, name:B.name(k), ...Q.summarize(rs)}));
    const tot=Q.summarize(Q.sales(f,P)); const ms=g.map(x=>x.margin||0), lo=Math.min(...ms), hi=Math.max(...ms);
    const heat = m => { const t=hi>lo?((m||0)-lo)/(hi-lo):.5; return `background:rgba(184,155,94,${(t*.45).toFixed(2)})`; };
    DataTable($('#profitTable'), {rows:g, pageSize:12, exportName:'profitability-'+dim, initialSort:dim==='month'?{key:0,dir:1}:{key:4,dir:-1}, onRow:r=>Drill.slice({title:r.name, add:dim==='month'?{}:Drill.patchFor(dim,r.k), P:dim==='month'?Periods.month(r.k):undefined, breakdown:dim==='model'?'trim':'model'}), columns:[
      {label:B.label, get:r=>dim==='month'?r.k:r.name, render:r=>`<b>${esc(r.name)}</b>`},
      {label:'الوحدات', num:true, get:r=>r.units, render:r=>fmt.int(r.units)},
      {label:'الإيرادات', num:true, get:r=>r.revenue, render:r=>fmt.sarC(r.revenue)},
      {label:'الخصومات', num:true, get:r=>r.discount, render:r=>fmt.sarC(r.discount)},
      {label:'إجمالي الربح', num:true, get:r=>r.gp, render:r=>fmt.sarC(r.gp)},
      {label:'الهامش', num:true, get:r=>r.margin, render:r=>`<span class="heatcell" style="${heat(r.margin)}">${fmt.pct(r.margin)}</span>${r.margin<(tot.margin||0)-.02?' <span class="warn-t">▼</span>':''}`},
      {label:'إيراد التمويل', num:true, get:r=>r.fi, render:r=>fmt.sarC(r.fi)},
      {label:'تكلفة الاستحواذ', num:true, get:r=>r.acq, render:r=>fmt.sarC(r.acq)},
      {label:'المساهمة', num:true, get:r=>r.contribution, render:r=>`<b>${fmt.sarC(r.contribution)}</b>`},
      {label:'المساهمة/مركبة', num:true, get:r=>r.units?r.contribution/r.units:0, render:r=>fmt.sarC(r.units?r.contribution/r.units:null)}
    ]});
  },
  // Q: Where (brand × branch) do we make or lose margin?
  heatmap(){
    const {P,f}=ctx0(); const ff={...f}; delete ff.branch; delete ff.brand; delete ff.model; delete ff.year; delete ff.trim; delete ff.vehicleId;
    const g=Q.group(Q.sales(ff,P), s=>s._t.brand+'|'+s.branchId);
    const brands=[...new Set(DB.trims.map(t=>t.brand))], br=DB.branches.map(b=>b.branchId);
    const cells={}; g.forEach((rs,k)=>cells[k]=Q.summarize(rs));
    const ms=Object.values(cells).filter(x=>x.units>=3).map(x=>x.margin), lo=Math.min(...ms), hi=Math.max(...ms);
    $('#marginHeat').innerHTML = `<table class="heat"><thead><tr><th></th>${br.map(b=>`<th>${L.branch(b)}</th>`).join('')}</tr></thead><tbody>${brands.map(b=>`<tr><th>${esc(b)}</th>${br.map(x=>{ const c=cells[b+'|'+x];
      if(!c||!c.units) return '<td class="empty">·</td>'; const t=hi>lo?(c.margin-lo)/(hi-lo):.5;
      return `<td data-b="${esc(b)}" data-br="${x}" class="${f.brand===b||f.branch===x?'selcol':''}" style="background:rgba(21,21,21,${(.08+t*.8).toFixed(2)});color:${t>.4?'#fff':'#111'}" data-tip="${esc(b)} · ${L.branch(x)} · ${c.units} مركبة · ${fmt.sarC(c.gp)} ربح">${fmt.pct(c.margin)}</td>`; }).join('')}</tr>`).join('')}</tbody></table>`;
    $('#marginHeat').onclick = e=>{ const td=e.target.closest('td[data-b]'); if(!td) return; Drill.slice({title:`${td.dataset.b} · ${L.branch(td.dataset.br)}`, add:{brand:td.dataset.b, branch:td.dataset.br}, breakdown:'model'}); };
  }
};
