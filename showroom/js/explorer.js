/* =====================================================================
   VEHICLE EXPLORER — selection hierarchy, breadcrumb, catalog, compare,
   and the data-driven panels around the 3D viewer.
   All Vehicles → Brand → Model → Year → Trim → Specific vehicle (VIN)
   The 3D viewer is shown ONLY when a trim (or a specific unit) is selected.
   ===================================================================== */
const Explorer = (function(){
  const compare = new Set();
  let viewMode = 'exterior';
  let search = '';
  let bodyFilter = null;

  /* ---------- breadcrumb (global, always visible) ---------- */
  function crumbs(){
    const s = Store.state, parts = [{label:'كل المركبات', patch:{brand:null}, icon:'layout-grid'}];
    if(s.brand) parts.push({label:s.brand, patch:{brand:s.brand, model:null}});
    if(s.model) parts.push({label:s.model, patch:{model:s.model, year:null}});
    if(s.year) parts.push({label:String(s.year), patch:{year:s.year, trim:null}});
    if(s.trim) parts.push({label:s.trim, patch:{trim:s.trim, vehicleId:null}});
    if(s.vehicleId){ const v=DB.idx.vehicle.get(s.vehicleId); parts.push({label:'VIN …'+v.vin.slice(-6), patch:{}}); }
    $('#crumbs').innerHTML = parts.map((p,i)=>`<button class="crumb ${i===parts.length-1?'cur':''}" data-i="${i}">${p.icon?ic(p.icon):''}<bdi>${esc(p.label)}</bdi></button>`).join(`<span class="sep">${ic('chevron-left')}</span>`);
    $('#crumbs').onclick = e=>{ const b=e.target.closest('.crumb'); if(!b) return; const p=parts[+b.dataset.i]; Store.set(p.patch,'crumb'); };
    $('#crumbBack').disabled = Store.level()==='all';
    $('#crumbClear').disabled = Store.level()==='all';
    $('#cmpCount').textContent = compare.size; $('#cmpBtn').classList.toggle('has', compare.size>0);
    icons();
  }
  function back(){
    const lv = Store.level();
    const up = {vehicle:{vehicleId:null}, trim:{trim:null}, year:{year:null}, model:{model:null}, brand:{brand:null}}[lv];
    if(up) Store.set(up,'back');
  }

  /* ---------- search ---------- */
  function searchResults(q){
    q = q.trim().toLowerCase(); if(q.length<1) return [];
    const res = [], seen = new Set();
    DB.trims.forEach(t=>{
      const hay = `${t.brand} ${t.model} ${t.trim} ${t.year} ${t.segment} ${L.segment(t.segment)} ${t.bodyType}`.toLowerCase();
      if(!q.split(/\s+/).every(w=>hay.includes(w))) return;
      const kB=t.brand, kM=t.brand+'|'+t.model;
      if(!seen.has(kB) && t.brand.toLowerCase().includes(q)){ seen.add(kB); res.push({type:'brand', label:t.brand, patch:{brand:t.brand}}); }
      if(!seen.has(kM) && `${t.brand} ${t.model}`.toLowerCase().includes(q.split(/\s+/)[0])){ seen.add(kM); res.push({type:'model', label:`${t.brand} ${t.model}`, sub:L.segment(t.segment), patch:{brand:t.brand, model:t.model}}); }
      res.push({type:'trim', label:`${t.brand} ${t.model} ${t.trim}`, sub:`${t.year} · ${fmt.sar(t.msrp)}`, patch:{brand:t.brand, model:t.model, year:t.year, trim:t.trim}});
    });
    return res.slice(0,14);
  }
  function bindSearch(){
    const inp = $('#vsearch');
    const show = ()=>{
      const r = searchResults(inp.value);
      if(!inp.value.trim()){ Pop.close(); return; }
      const html = r.length ? r.map((x,i)=>`<button class="opt" data-i="${i}"><span>${ic(x.type==='brand'?'award':x.type==='model'?'car':'tag')}<bdi>${esc(x.label)}</bdi></span><small>${esc(x.sub||({brand:'علامة',model:'طراز'}[x.type]||''))}</small></button>`).join('') : '<p class="muted pad">لا توجد نتائج</p>';
      if(Pop.owner!=='vsearch'){ Pop.open(inp.parentElement, html, 'vsearch','search-pop'); }
      else { Pop.el.innerHTML = html; icons(); }
      Pop.el.onclick = e=>{ const b=e.target.closest('.opt'); if(!b) return; Store.set(r[+b.dataset.i].patch,'search'); inp.value=''; Pop.close(); };
    };
    inp.addEventListener('input', show);
    inp.addEventListener('focus', ()=>{ if(inp.value) show(); });
    inp.addEventListener('keydown', e=>{ if(e.key==='Enter'){ const r=searchResults(inp.value); if(r[0]){ Store.set(r[0].patch,'search'); inp.value=''; Pop.close(); } } });
    inp.parentElement.setAttribute('data-pop','');
  }

  /* ---------- portfolio / catalog levels ---------- */
  function statsBy(keyFn, extraF={}){
    const P = Periods.get(Store.state.period), f = filtersOf(extraF); ['brand','model','year','trim','vehicleId'].forEach(k=>{ if(!(k in extraF)) delete f[k]; });
    const d = Math.min(P.end, DB.meta.todayDay);
    const sales = Q.group(Q.sales(f,P), s=>keyFn(s._t)), stock = Q.group(Q.stockAt(f,d), v=>keyFn(v._t));
    return {get(k){ const S=Q.summarize(sales.get(k)||[]); const St=Q.stockSummary(stock.get(k)||[], d); return {...S, stock:St.units, available:St.available, stockValue:St.value, avgAge:St.avgAge}; }, P};
  }
  function tile(o){
    return `<button class="vt ${o.sel?'sel':''}" data-patch='${esc(JSON.stringify(o.patch))}'>
      <div class="vt-h"><span class="vt-eyebrow">${esc(o.eyebrow||'')}</span>${o.compare?`<label class="cmp-ck" data-tip="أضف للمقارنة"><input type="checkbox" data-cmp="${o.compare}" ${compare.has(o.compare)?'checked':''}>${ic('git-compare')}</label>`:''}</div>
      <b class="vt-t"><bdi>${esc(o.title)}</bdi></b><span class="vt-s">${esc(o.sub||'')}</span>
      <div class="vt-m">${o.metrics.map(m=>`<span><em>${m[0]}</em><b class="num">${m[1]}</b></span>`).join('')}</div>
      ${o.share!=null?`<span class="vt-share"><i style="width:${clamp(o.share,0,1)*100}%"></i></span>`:''}</button>`;
  }
  function renderCatalog(){
    const s = Store.state, lv = Store.level(), host = $('#catalog');
    let head='', tiles='', sub='';
    const bodyChips = `<div class="chips-row">${['SUV','Sedan','Coupe','Wagon'].map(b=>`<button class="chip-f ${bodyFilter===b?'on':''}" data-body="${b}">${AR.body[b]}</button>`).join('')}</div>`;
    if(lv==='all'){
      const st = statsBy(t=>t.brand); const brands=[...new Set(DB.trims.map(t=>t.brand))];
      const rows = brands.map(b=>({b, ...st.get(b), models:new Set(DB.trims.filter(t=>t.brand===b).map(t=>t.model)).size}))
        .filter(r=>!bodyFilter || DB.trims.some(t=>t.brand===r.b && t.bodyType===bodyFilter)).sort((a,b)=>b.revenue-a.revenue);
      const tot = rows.reduce((a,r)=>a+r.revenue,0)||1;
      head = `<h2>محفظة المركبات</h2><p>${brands.length} علامات · ${new Set(DB.trims.map(t=>t._modelKey)).size} طرازاً · ${DB.trims.length} فئة · اختر علامة للبدء، أو ابحث مباشرة عن مركبة.</p>`;
      sub = bodyChips;
      tiles = rows.map(r=>tile({eyebrow:`${r.models} طرازات`, title:r.b, sub:`حصة الإيرادات ${fmt.pct(r.revenue/tot,0)}`, patch:{brand:r.b}, share:r.revenue/tot,
        metrics:[['مباع',fmt.int(r.units)],['الإيرادات',fmt.money(r.revenue)],['الهامش',fmt.pct(r.margin)],['بالمخزون',fmt.int(r.stock)]]})).join('');
    } else if(lv==='brand'){
      const st = statsBy(t=>t.model,{brand:s.brand}); const models=[...new Set(DB.trims.filter(t=>t.brand===s.brand && (!bodyFilter||t.bodyType===bodyFilter)).map(t=>t.model))];
      const rows = models.map(m=>{ const ts=DB.trims.filter(t=>t.brand===s.brand&&t.model===m); return {m, t:ts[0], lo:Math.min(...ts.map(t=>t.msrp)), hi:Math.max(...ts.map(t=>t.msrp)), ...st.get(m)}; }).sort((a,b)=>b.revenue-a.revenue);
      const tot = rows.reduce((a,r)=>a+r.units,0)||1;
      head = `<h2>${esc(s.brand)}</h2><p>${models.length} طرازات — اختر طرازاً لعرض سنوات الطراز والفئات.</p>`; sub = bodyChips;
      tiles = rows.map(r=>tile({eyebrow:`${r.t.generation} · ${L.segment(r.t.segment)}`, title:r.m, sub:`${fmt.money(r.lo)} – ${fmt.money(r.hi)} ر.س`, patch:{brand:s.brand, model:r.m}, share:r.units/tot,
        metrics:[['مباع',fmt.int(r.units)],['الهامش',fmt.pct(r.margin)],['بالمخزون',fmt.int(r.stock)],['أيام البيع',r.avgDts?Math.round(r.avgDts):'—']]})).join('');
    } else if(lv==='model'){
      const st = statsBy(t=>t.year,{brand:s.brand, model:s.model}); const years=[...new Set(DB.trims.filter(t=>t.brand===s.brand&&t.model===s.model).map(t=>t.year))].sort((a,b)=>b-a);
      const t0 = DB.trims.find(t=>t.brand===s.brand&&t.model===s.model);
      head = `<h2>${esc(s.brand)} ${esc(s.model)}</h2><p>الجيل ${esc(t0.generation)} · ${L.segment(t0.segment)} — اختر سنة الطراز.</p>`;
      tiles = years.map(y=>{ const r=st.get(y); const ts=DB.trims.filter(t=>t.brand===s.brand&&t.model===s.model&&t.year===y);
        return tile({eyebrow:`${ts.length} فئات`, title:String(y), sub:ts.map(t=>t.trim).join(' · '), patch:{brand:s.brand, model:s.model, year:y},
          metrics:[['مباع',fmt.int(r.units)],['الإيرادات',fmt.money(r.revenue)],['بالمخزون',fmt.int(r.stock)],['متوسط العمر',r.avgAge?Math.round(r.avgAge)+' يوم':'—']]}); }).join('');
    } else if(lv==='year'){
      const st = statsBy(t=>t.trim,{brand:s.brand, model:s.model, year:s.year});
      const ts = DB.trims.filter(t=>t.brand===s.brand&&t.model===s.model&&t.year===s.year);
      head = `<h2>${esc(s.brand)} ${esc(s.model)} ${s.year}</h2><p>اختر الفئة لعرض المركبة في صالة العرض. يمكنك تحديد فئات للمقارنة.</p>`;
      tiles = ts.map(t=>{ const r=st.get(t.trim);
        return tile({eyebrow:`${t.engine} · ${t.hp} حصان`, title:t.trim, sub:fmt.sar(t.msrp), patch:{brand:t.brand, model:t.model, year:t.year, trim:t.trim}, compare:t.trimId,
          metrics:[['مباع',fmt.int(r.units)],['الهامش',fmt.pct(r.margin)],['متاح',fmt.int(r.available)],['أيام البيع',r.avgDts?Math.round(r.avgDts):'—']]}); }).join('');
    }
    host.innerHTML = `<div class="cat-h">${head}</div>${sub}<div class="vt-grid">${tiles||'<p class="muted">لا توجد مركبات مطابقة.</p>'}</div>
      <p class="cat-note">${ic('info')} الأرقام في البطاقات للفترة «${esc(Periods.get(s.period).label)}»${s.branch?` وفرع ${L.branch(s.branch)}`:''}. المخزون كما في نهاية الفترة.</p>`;
    host.onclick = e=>{
      const ck = e.target.closest('[data-cmp]'); if(ck){ e.stopPropagation(); toggleCompare(ck.dataset.cmp, ck.checked); return; }
      if(e.target.closest('.cmp-ck')) return;
      const bf = e.target.closest('[data-body]'); if(bf){ bodyFilter = bodyFilter===bf.dataset.body?null:bf.dataset.body; renderCatalog(); return; }
      const t = e.target.closest('.vt'); if(t) Store.set(JSON.parse(t.dataset.patch),'catalog');
    };
    icons();
  }

  /* ---------- compare ---------- */
  function toggleCompare(trimId, on){
    if(on && compare.size>=3){ toast('يمكن مقارنة 3 فئات كحد أقصى'); renderCatalog(); return; }
    on ? compare.add(trimId) : compare.delete(trimId); crumbs();
    if(Store.level()==='trim'||Store.level()==='vehicle') renderPanels();
  }
  function openCompare(){
    if(!compare.size){
      const t = Store.selectedTrim();
      if(t){ compare.add(t.trimId); crumbs(); toast('أُضيفت الفئة الحالية — اختر فئات أخرى من الكتالوج للمقارنة'); return; }
      return toast('حدد فئات من الكتالوج (مربع المقارنة) أو اختر مركبة ثم «أضف للمقارنة»');
    }
    const P = Periods.get(Store.state.period), T = DB.meta.todayDay;
    const cols = [...compare].map(id=>{ const t=DB.idx.trim.get(id); const f={brand:t.brand, model:t.model, year:t.year, trim:t.trim};
      const S=Q.summarize(Q.sales(f,P)), St=Q.stockSummary(Q.stockAt(f,T),T), dem=Q.leads({brand:t.brand,model:t.model,trim:t.trim},{start:T-89,end:T}).length;
      return {t, S, St, dem}; });
    const rows = [
      ['السعر الرسمي', c=>c.t.msrp, fmt.sar, 'min'], ['المحرك', c=>c.t.engine], ['القوة (حصان)', c=>c.t.hp, fmt.int, 'max'], ['العزم (نيوتن.م)', c=>c.t.torque, fmt.int, 'max'],
      ['0–100 كم/س (ث)', c=>c.t.accel, v=>v.toFixed(1), 'min'], ['نوع الوقود', c=>L.fuel(c.t.fuelType)], ['الاستهلاك', c=>c.t.efficiency], ['ناقل الحركة', c=>c.t.transmission], ['الدفع', c=>c.t.drivetrain],
      ['— الأداء التجاري ('+P.label+')', null], ['المبيعات', c=>c.S.units, fmt.int, 'max'], ['الإيرادات', c=>c.S.revenue, fmt.sarC, 'max'], ['هامش الربح', c=>c.S.margin, v=>fmt.pct(v), 'max'],
      ['متوسط الخصم', c=>c.S.avgDiscount, fmt.sarC, 'min'], ['متوسط أيام البيع', c=>c.S.avgDts, fmt.days, 'min'], ['بالمخزون اليوم', c=>c.St.units, fmt.int], ['متوسط عمر المخزون', c=>c.St.avgAge, fmt.days, 'min'], ['الطلب (عملاء آخر 90 يوماً)', c=>c.dem, fmt.int, 'max']
    ];
    Drawer.open({title:'مقارنة المركبات', subtitle:`${cols.length} فئات · الأفضل في كل صف مميز بالذهبي`, actions:[{label:'مسح المقارنة', icon:'trash-2', fn:()=>{ compare.clear(); crumbs(); Drawer.close(); renderCatalogIfVisible(); }}],
      render(body){
        body.innerHTML = `<div class="cmp-wrap"><table class="cmp"><thead><tr><th></th>${cols.map(c=>`<th><b>${esc(c.t.brand)} ${esc(c.t.model)}</b><small>${c.t.year} · ${esc(c.t.trim)}</small><button class="link" data-rm="${c.t.trimId}">إزالة</button></th>`).join('')}</tr></thead><tbody>
          ${rows.map(([label,get,f,best])=>{ if(!get) return `<tr class="grp"><td colspan="${cols.length+1}">${label}</td></tr>`;
            const vals = cols.map(get); const nums = vals.filter(v=>typeof v==='number' && isFinite(v));
            const b = best==='max'?Math.max(...nums):best==='min'?Math.min(...nums):null;
            return `<tr><th>${label}</th>${vals.map(v=>`<td class="${best&&v===b&&cols.length>1?'best':''}">${f?f(v):esc(v)}</td>`).join('')}</tr>`; }).join('')}</tbody></table></div>`;
        body.onclick = e=>{ const b=e.target.closest('[data-rm]'); if(!b) return; compare.delete(b.dataset.rm); crumbs(); compare.size?openCompare():Drawer.close(); };
      }});
  }
  const renderCatalogIfVisible = ()=>{ if(['all','brand','model','year'].includes(Store.level())) renderCatalog(); };

  /* ---------- 3D panels (trim / vehicle level) ---------- */
  function vehicleColor(){
    const s = Store.state; if(s.vehicleId) return DB.idx.vehicle.get(s.vehicleId).exteriorColor;
    return App.ui.viewColor || 'black';
  }
  function renderPanels(){
    const s = Store.state, t = Store.selectedTrim(); if(!t) return;
    const P = Periods.get(s.period), T = DB.meta.todayDay, d = Math.min(P.end,T);
    const fT = {brand:t.brand, model:t.model, year:t.year, trim:t.trim}; if(s.branch) fT.branch=s.branch;
    const S = Q.summarize(Q.sales({...filtersOf(), vehicleId:undefined},P)), Sp = P.prev?Q.summarize(Q.sales(prevF({...filtersOf(), vehicleId:undefined}),P.prev)):null;
    const stockAll = Q.stockAt({brand:t.brand, model:t.model, year:t.year, trim:t.trim}, d);
    const stock = s.branch ? stockAll.filter(v=>v.branchId===s.branch) : stockAll;
    const St = Q.stockSummary(stock, d);
    const dem = Q.leads({brand:t.brand, model:t.model, trim:t.trim, ...(s.branch?{branch:s.branch}:{})},{start:T-89,end:T}).length/3;
    const segDem = (()=>{ const ms=DB.trims.filter(x=>x.segment===t.segment && x.year===2026); return ms.length ? Q.leads({...(s.branch?{branch:s.branch}:{})},{start:T-89,end:T}).filter(l=>l._t.segment===t.segment).length/3/new Set(ms.map(x=>x.trimId)).size : dem; })();
    const idx = segDem ? dem/segDem : 1; const lvl = idx>1.25?5:idx>1.05?4:idx>.85?3:idx>.6?2:1;
    // hero identity
    $('#heroBrand').textContent = t.brand.toUpperCase();
    $('#heroModel').textContent = `${t.model} ${t.trim}`;
    const col = DB.idx.color.get(vehicleColor());
    $('#heroSub').innerHTML = `<span>${t.year}</span><span class="sep"></span><span>${esc(t.generation)}</span><span class="sep"></span><span>${esc(L.segment(t.segment))}</span><span class="sep"></span><span><span class="sw" style="background:${col.hex}"></span>${col.ar}</span>`;
    // intelligence panel (left)
    const v = s.vehicleId ? DB.idx.vehicle.get(s.vehicleId) : null;
    const rows = v ? unitRows(v, t, d) : [
      {ic:'circle-dollar-sign', l:'السعر الرسمي', v:fmt.sar(t.msrp), m:`<span class="muted">${fmt.sarC(S.avgPrice)} متوسط البيع</span>`, go:{title:`مبيعات ${L.vehicleY(t)}`, add:fT, tab:'sales'}},
      {ic:'warehouse', l:'المخزون', v:`${fmt.int(St.available)}<small> متاح</small>`, m:`<span class="muted">${St.reserved} محجوز · ${St.service} تجهيز</span>`, go:{title:`مخزون ${L.vehicleY(t)}`, add:fT, tab:'stock'}},
      {ic:'receipt', l:`المبيعات · ${P.label}`, v:fmt.int(S.units), m:Sp?trendHTML(change(S.units,Sp.units)):'', go:{title:`مبيعات ${L.vehicleY(t)}`, add:fT, tab:'sales'}},
      {ic:'gem', l:'إجمالي الربح / الهامش', v:`${fmt.sarC(S.gp)}`, m:`<b>${fmt.pct(S.margin)}</b>`, go:{title:`ربحية ${L.vehicleY(t)}`, add:fT, breakdown:'branch'}},
      {ic:'flame', l:'الطلب', v:`${['','منخفض','ضعيف','متوسط','مرتفع','مرتفع جداً'][lvl]}`, m:`<span class="meter">${[1,2,3,4,5].map(i=>`<i class="${i<=lvl?'on':''}" style="height:${4+i*2.4}px"></i>`).join('')}</span>`, tip:`${dem.toFixed(0)} عميل محتمل شهرياً (آخر 90 يوماً) مقابل ${segDem.toFixed(0)} لمتوسط الفئة السوقية`, go:{title:`العملاء المهتمون · ${L.vehicle(t)}`, add:{brand:t.brand, model:t.model, trim:t.trim}, tab:'leads', P:{id:null,label:'آخر 90 يوماً',start:T-89,end:T,prev:null}}},
      {ic:'hourglass', l:'الأيام في المخزون', v:`${St.avgAge?Math.round(St.avgAge):'—'}<small> يوم</small>`, m:`<span class="muted">البيع خلال ${S.avgDts?Math.round(S.avgDts):'—'} يوم</span>`, go:{title:`مخزون ${L.vehicleY(t)}`, add:fT, tab:'stock'}}
    ];
    $('#intel').innerHTML = rows.map((r,i)=>`<li class="${r.go?'click':''}" data-i="${i}" ${r.tip?`data-tip="${esc(r.tip)}"`:''}><div class="ic">${ic(r.ic)}</div><div><div class="l">${r.l}</div><div class="v num">${r.v}</div></div><div class="meta">${r.m||''}</div></li>`).join('');
    $('#intel').onclick = e=>{ const li=e.target.closest('li.click'); if(!li) return; const r=rows[+li.dataset.i]; r.fn ? r.fn() : Drill.slice(r.go); };
    $('#intelScope').textContent = `${s.branch?L.branch(s.branch):'كل الفروع'} · ${P.label}`;
    // branch availability
    const byBr = Q.group(stockAll.filter(x=>x.status!=='In Service'), x=>x.branchId), mx = Math.max(...DB.branches.map(b=>(byBr.get(b.branchId)||[]).length),1);
    $('#intelFoot').innerHTML = `<div class="avail-h">${ic('map-pin')} التوفر حسب الفرع</div>${DB.branches.map(b=>{ const n=(byBr.get(b.branchId)||[]).length; return `<button class="avail ${s.branch===b.branchId?'sel':''}" data-br="${b.branchId}"><span>${L.branch(b.branchId)}</span><span class="bar"><i style="width:${n/mx*100}%"></i></span><b class="num">${n}</b></button>`; }).join('')}`;
    $('#intelFoot').onclick = e=>{ const b=e.target.closest('.avail'); if(b) Drill.slice({title:`${L.vehicleY(t)} · ${L.branch(b.dataset.br)}`, add:{...fT, branch:b.dataset.br}, tab:'stock'}); };
    renderSpec(t);
    renderDock(t, stockAll);
    icons();
  }
  function unitRows(v, t, d){
    const age = v._sold!=null ? v._sold-v._arr : d-v._arr; const s = v.saleId?DB.idx.sale.get(v.saleId):null; const r = !s && Drill.recommend(v, age);
    return [
      {ic:'scan-line', l:'رقم الهيكل', v:`<code>${v.vin}</code>`, m:statusPill(AR.vStatus[v.status], v.status==='Sold'?'pos':v.status==='Reserved'?'gold':''), fn:()=>Records.vehicle(v.vehicleId)},
      {ic:'map-pin', l:'الفرع', v:L.branch(v.branchId), m:`<span class="muted">وصلت ${fmt.date(v.arrivalDate)}</span>`},
      {ic:'hourglass', l:s?'أيام حتى البيع':'الأيام في المخزون', v:`${age}<small> يوم</small>`, m:age>90?statusPill('متقادمة','neg'):age>60?statusPill('مراقبة','warn'):''},
      {ic:'circle-dollar-sign', l:'سعر القائمة', v:fmt.sar(v.listPrice), m:`<span class="muted">التكلفة ${fmt.sarC(v.purchaseCost)}</span>`},
      s ? {ic:'receipt', l:'بيعت بـ', v:fmt.sar(s.sellingPrice), m:`<b>${fmt.pct(s.margin)}</b>`, fn:()=>Records.sale(s.saleId)}
        : {ic:'lightbulb', l:'الإجراء المقترح', v:`<span class="sm-v">${r.t}</span>`, m:''},
      {ic:'clipboard-list', l:'السجل الكامل', v:'<span class="sm-v">عرض جميع حقول المركبة</span>', m:ic('arrow-left'), fn:()=>Records.vehicle(v.vehicleId)}
    ];
  }
  function renderSpec(t){
    const tab = App.ui.specTab;
    const tabs = [['specs','المواصفات'],['perf','الأداء'],['asset','أصل 3D']];
    const T = DB.meta.todayDay;
    let html='';
    if(tab==='specs'){
      const rows=[['المحرك',t.engine],['القوة',t.hp+' حصان'],['العزم',t.torque+' نيوتن.م'],['ناقل الحركة',t.transmission],['نظام الدفع',t.drivetrain],['0–100 كم/س',t.accel.toFixed(1)+' ث'],['الوقود',L.fuel(t.fuelType)],['الاستهلاك',t.efficiency],['الهيكل',AR.body[t.bodyType]||t.bodyType],['الجيل',t.generation]];
      html = `<ul class="spec">${rows.map(r=>`<li><span class="l">${r[0]}</span><span class="v"><bdi>${esc(r[1])}</bdi></span></li>`).join('')}</ul>`;
    } else if(tab==='perf'){
      const items=[[t.hp,'حصان','القوة',t.hp/850],[t.torque,'نيوتن.م','العزم',t.torque/1050],[t.accel.toFixed(1),'ث','0–100 كم/س',(8-t.accel)/5.5],[t.topSpeed,'كم/س','السرعة القصوى',t.topSpeed/330]];
      html = `<div class="perf">${items.map(i=>`<div><b class="num">${i[0]}<small>${i[1]}</small></b><span>${i[2]}</span><em><i style="width:${clamp(i[3],.06,1)*100}%"></i></em></div>`).join('')}</div>`;
    } else {
      const a = t.asset;
      html = `<ul class="spec"><li><span class="l">النموذج ثلاثي الأبعاد</span><span class="v">${a.model3d?'<span class="pos-t">GLB مرخّص</span>':'غير متوفر'}</span></li>
        <li><span class="l">العرض الحالي</span><span class="v">${a.model3d?'نموذج حقيقي':'تمثيل استوديو إجرائي'}</span></li><li><span class="l">نمط الهيكل</span><span class="v">${esc(a.studioStyle)}</span></li>
        <li><span class="l">الصورة</span><span class="v">${a.image?'متوفرة':'غير متوفرة'}</span></li><li><span class="l">المصدر / الترخيص</span><span class="v">${esc(a.license||'—')}</span></li></ul>
        <p class="asset-note">${ic('info')} لا يوجد أصل ثلاثي الأبعاد مرخّص لهذه الفئة؛ المعروض تمثيل استوديو مبسّط بأبعاد الفئة ولونها، وليس نموذجاً مطابقاً للمركبة. يمكن ربط ملف GLB عبر الحقل <code>asset.model3d</code> في الكتالوج.</p>`;
    }
    $('#specTabs').innerHTML = tabs.map(x=>`<button class="${x[0]===tab?'active':''}" data-st="${x[0]}">${x[1]}</button>`).join('');
    $('#specTabs').onclick = e=>{ const b=e.target.closest('[data-st]'); if(!b) return; App.ui.specTab=b.dataset.st; renderSpec(t); icons(); };
    $('#specBody').innerHTML = `<div class="fade-in">${html}</div>`;
    const inCmp = compare.has(t.trimId);
    $('#specFoot').innerHTML = `<button class="ghost-btn" id="addCmp">${ic('git-compare')}${inCmp?'في المقارنة':'أضف للمقارنة'}</button><button class="ghost-btn" id="unitsBtn">${ic('list')}الوحدات (${Q.stockAt({brand:t.brand,model:t.model,year:t.year,trim:t.trim},T).length})</button>`;
    $('#addCmp').onclick = ()=>{ toggleCompare(t.trimId, !inCmp); renderSpec(t); icons(); };
    $('#unitsBtn').onclick = ()=>Drill.slice({title:`وحدات ${L.vehicleY(t)}`, add:{brand:t.brand,model:t.model,year:t.year,trim:t.trim}, tab:'stock'});
  }
  function renderDock(t, stock){
    const s = Store.state;
    // colours actually present in stock for this trim (with counts); the specific unit forces its own colour
    const counts = {}; stock.forEach(v=>counts[v.exteriorColor]=(counts[v.exteriorColor]||0)+1);
    const colors = DB.colors.filter(c=>counts[c.id] || c.id===vehicleColor());
    $('#dockColors').innerHTML = colors.map(c=>`<button class="swatch ${c.id===vehicleColor()?'sel':''}" data-c="${c.id}" style="background:${c.hex}" data-tip="${c.ar} · ${counts[c.id]||0} بالمخزون" ${s.vehicleId?'disabled':''}></button>`).join('');
    $('#dockColors').onclick = e=>{ const b=e.target.closest('[data-c]'); if(!b||s.vehicleId) return; App.ui.viewColor=b.dataset.c; renderPanels(); syncViewer(); };
    // sibling trims
    const sib = DB.trims.filter(x=>x.brand===t.brand&&x.model===t.model&&x.year===t.year);
    $('#dockTrims').innerHTML = sib.length>1 ? sib.map(x=>`<button class="trim-chip ${x.trimId===t.trimId?'sel':''}" data-tr="${esc(x.trim)}">${esc(x.trim)}</button>`).join('') : '';
    $('#dockTrims').onclick = e=>{ const b=e.target.closest('[data-tr]'); if(b) Store.set({trim:b.dataset.tr},'trim'); };
    $('#viewMode').innerHTML = `<button class="${viewMode==='exterior'?'active':''}" data-vm="exterior">خارجي</button><button class="${viewMode==='interior'?'active':''}" data-vm="interior">داخلي</button>`;
  }
  function renderInterior(t){
    const T=DB.meta.todayDay; const units = Q.stockAt({brand:t.brand,model:t.model,year:t.year,trim:t.trim},T);
    const ic_ = {}; units.forEach(v=>ic_[v.interiorColor]=(ic_[v.interiorColor]||0)+1);
    const v = Store.state.vehicleId ? DB.idx.vehicle.get(Store.state.vehicleId) : null;
    $('#interior').innerHTML = `<div class="int-card"><h4>المقصورة الداخلية</h4>
      <div class="int-sw">${DB.interiors.map(x=>`<div class="${v&&v.interiorColor===x.id?'sel':''}"><span style="background:${x.hex}"></span><b>${x.ar}</b><small>${v? (v.interiorColor===x.id?'هذه المركبة':'') : `${ic_[x.id]||0} بالمخزون`}</small></div>`).join('')}</div>
      <p class="asset-note">${ic('info')} لا يتوفر نموذج داخلي ثلاثي الأبعاد لهذه المركبة. تُعرض خيارات المقصورة المتوفرة فعلياً في المخزون بدلاً من صورة توحي بعرض حقيقي.</p></div>`;
    icons();
  }
  function syncViewer(){
    const t = Store.selectedTrim(); if(!t || !window.Showroom) return;
    const c = DB.idx.color.get(vehicleColor());
    Showroom.apply({style:t.asset.studioStyle, brand:t.brand, color:c.paint, colorId:c.id, wheel:22, pkg:/SV|Autobiography|AMG|M60i|Turbo|GTS|Nismo|RS|Platinum|Royal/.test(t.trim)?'top':'dyn', model3d:t.asset.model3d});
  }

  /* ---------- main render ---------- */
  function render(){
    crumbs();
    const lv = Store.level(), stage = $('#stage');
    const showViewer = lv==='trim' || lv==='vehicle';
    stage.classList.toggle('mode-catalog', !showViewer);
    stage.classList.toggle('mode-viewer', showViewer);
    stage.classList.toggle('mode-interior', showViewer && viewMode==='interior');
    window.Showroom && Showroom.setActive(showViewer && viewMode==='exterior');
    if(!showViewer){ renderCatalog(); return; }
    renderPanels(); syncViewer();
    if(viewMode==='interior') renderInterior(Store.selectedTrim());
  }
  function bind(){
    $('#crumbBack').addEventListener('click', back);
    $('#crumbClear').addEventListener('click', ()=>Store.set({brand:null},'clear-vehicle'));
    $('#cmpBtn').addEventListener('click', openCompare);
    $('#searchBtn').addEventListener('click', ()=>$('#vsearch').focus());
    bindSearch();
    $('#viewMode').addEventListener('click', e=>{ const b=e.target.closest('[data-vm]'); if(!b) return; viewMode=b.dataset.vm; render(); });
    window.addEventListener('showroom:ready', ()=>{ render(); });
  }
  return {render, bind, crumbs, openCompare, get compare(){ return compare; }};
})();
