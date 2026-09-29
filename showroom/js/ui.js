/* =====================================================================
   UI PRIMITIVES — drawer (with back stack), data table, info popover,
   dropdown popover, tooltip, toast, small SVG helpers.
   ===================================================================== */
const $ = (s, r=document)=>r.querySelector(s);
const $$ = (s, r=document)=>[...r.querySelectorAll(s)];
const icons = ()=>{ try{ window.lucide && lucide.createIcons({attrs:{'stroke-width':1.6}}); }catch(e){} };
const ic = name => `<i data-lucide="${name}"></i>`;

/* ---------- tooltip & toast ---------- */
(function(){
  const tip = document.createElement('div'); tip.className='tip'; document.body.appendChild(tip);
  document.addEventListener('mouseover', e=>{
    const t = e.target.closest('[data-tip]'); if(!t){ tip.classList.remove('show'); return; }
    const r = t.getBoundingClientRect(); tip.textContent = t.dataset.tip;
    tip.style.left = clamp(r.left+r.width/2, 150, innerWidth-150)+'px'; tip.style.top = r.top+'px'; tip.classList.add('show');
  });
  document.addEventListener('scroll', ()=>tip.classList.remove('show'), {passive:true, capture:true});
})();
function toast(msg){
  let t = $('#toast'); if(!t){ t=document.createElement('div'); t.id='toast'; t.className='toast'; document.body.appendChild(t); }
  t.innerHTML = `${ic('check')}<span>${esc(msg)}</span>`; icons(); t.classList.add('show');
  clearTimeout(t._t); t._t=setTimeout(()=>t.classList.remove('show'),2600);
}

/* ---------- anchored popover (dropdowns, info, menus) ---------- */
const Pop = (function(){
  const el = document.createElement('div'); el.className='popover'; document.body.appendChild(el);
  let anchor=null, owner=null;
  function place(){
    if(!anchor) return;
    const r = anchor.getBoundingClientRect(), w = el.offsetWidth, h = el.offsetHeight;
    let left = r.right - w;                          // RTL: align to the anchor's right edge
    left = clamp(left, 12, innerWidth-12-w);
    let top = r.bottom+8; if(top+h > innerHeight-12 && r.top-h-8>12) top = r.top-h-8;
    el.style.left = left+'px'; el.style.top = top+'px';
  }
  function open(a, html, key, cls=''){
    if(owner===key){ close(); return; }
    close(); el.className = 'popover '+cls; el.innerHTML = html; icons();
    el.style.minWidth = Math.max(200, a.getBoundingClientRect().width)+'px';
    anchor=a; owner=key; a.classList.add('open'); el.classList.add('show'); place();
  }
  function close(){ el.classList.remove('show'); if(anchor) anchor.classList.remove('open'); anchor=null; owner=null; }
  document.addEventListener('click', e=>{ if(!e.target.closest('.popover') && !e.target.closest('[data-pop]')) close(); });
  document.addEventListener('keydown', e=>{ if(e.key==='Escape') close(); });
  window.addEventListener('resize', close);
  window.addEventListener('scroll', place, {passive:true, capture:true});
  return {open, close, el, get owner(){return owner;}};
})();

/* ---------- metric transparency popover ---------- */
const Info = {
  show(anchor, metricId, ctx={}){
    const m = METRICS[metricId]; if(!m) return;
    const P = ctx.P || Periods.get(Store.state.period);
    const f = ctx.f || filtersOf();
    const applies = Q.APPLIES[m.src] || [];
    const on = Object.keys(f).filter(k=>applies.includes(k));
    const off = Object.keys(f).filter(k=>!applies.includes(k));
    const dims = list => list.length ? list.map(k=>`<span class="mini-chip">${DIM_LABEL[k]}: ${esc(dimValueLabel(k,f[k]))}</span>`).join('') : '<span class="muted">لا توجد فلاتر — كل البيانات</span>';
    const range = m.snapshot ? `لقطة كما في ${fmt.date(DB.isoOf(Math.min(P.end, DB.meta.todayDay)))}` : `${P.label} · ${Periods.rangeLabel(P)}`;
    const html = `<div class="info-pop">
      <h5>${ic('info')} ${m.label}</h5>
      <dl>
        <dt>ما هذا المؤشر؟</dt><dd>${m.what}</dd>
        <dt>طريقة الحساب</dt><dd>${m.how}</dd>
        <dt>البيانات المشمولة</dt><dd>${m.data}</dd>
        <dt>النطاق الزمني</dt><dd>${range}${P.prev && !m.snapshot?`<br><span class="muted">المقارنة مع: ${P.prev.label}${f.year?` · سنة الطراز ${f.year-1} (مقارنة مماثلة)`:''}</span>`:''}</dd>
        <dt>الفلاتر المطبقة</dt><dd>${dims(on)}</dd>
        ${off.length?`<dt>فلاتر لا تنطبق على هذا المؤشر</dt><dd>${dims(off)}</dd>`:''}
      </dl>
      <div class="info-foot">${DB.meta.mode==='demo'?'مصدر البيانات: بيانات تجريبية (Demo)':'مصدر البيانات: بيانات الإنتاج'}</div></div>`;
    Pop.open(anchor, html, 'info-'+metricId+(ctx.key||''), 'wide');
  }
};
document.addEventListener('click', e=>{
  const b = e.target.closest('[data-info]'); if(!b) return;
  e.stopPropagation(); Info.show(b, b.dataset.info);
});

/* ---------- data table ---------- */
function DataTable(host, {columns, rows, pageSize=25, onRow, empty='لا توجد سجلات مطابقة', exportName='records', searchable=true, initialSort=null}){
  const st = {q:'', sort:initialSort?initialSort.key:null, dir:initialSort?initialSort.dir:-1, shown:pageSize};
  host.innerHTML = `<div class="dt">
    <div class="dt-bar">
      ${searchable?`<label class="dt-search">${ic('search')}<input type="search" placeholder="بحث في السجلات…"></label>`:''}
      <span class="dt-count"></span>
      <button class="ghost-btn dt-csv" data-tip="تصدير السجلات المعروضة إلى CSV">${ic('download')}تصدير</button>
    </div>
    <div class="dt-scroll"><table><thead><tr>${columns.map((c,i)=>`<th data-i="${i}" class="${c.num?'num':''}">${c.label}<span class="sort"></span></th>`).join('')}</tr></thead><tbody></tbody></table></div>
    <button class="dt-more ghost-btn">عرض المزيد</button></div>`;
  const tb = $('tbody',host), cnt = $('.dt-count',host), more = $('.dt-more',host);
  const textOf = r => columns.map(c=>{ const v=c.text?c.text(r):c.get?c.get(r):''; return v==null?'':String(v); }).join(' ').toLowerCase();
  let view = rows;
  function compute(){
    view = st.q ? rows.filter(r=>textOf(r).includes(st.q)) : rows.slice();
    if(st.sort!=null){ const c=columns[st.sort]; view.sort((a,b)=>{ const x=c.get(a), y=c.get(b); return (x>y?1:x<y?-1:0)*st.dir; }); }
  }
  function draw(){
    const slice = view.slice(0, st.shown);
    tb.innerHTML = slice.length ? slice.map((r,i)=>`<tr data-i="${i}" class="${onRow?'click':''}">${columns.map(c=>`<td class="${c.num?'num':''}">${c.render?c.render(r):esc(c.get(r)??'—')}</td>`).join('')}</tr>`).join('')
      : `<tr><td colspan="${columns.length}" class="dt-empty">${empty}</td></tr>`;
    cnt.textContent = `${fmt.int(view.length)} سجل${view.length>slice.length?` · يُعرض ${fmt.int(slice.length)}`:''}`;
    more.style.display = view.length>slice.length ? '' : 'none';
    $$('th',host).forEach(th=>{ const i=+th.dataset.i; th.querySelector('.sort').textContent = i===st.sort ? (st.dir>0?' ▲':' ▼') : ''; });
    icons();
  }
  compute(); draw();
  $$('th',host).forEach(th=>th.addEventListener('click',()=>{ const i=+th.dataset.i; if(!columns[i].get) return; st.dir = st.sort===i ? -st.dir : -1; st.sort=i; compute(); draw(); }));
  const inp = $('input',host); if(inp) inp.addEventListener('input',()=>{ st.q=inp.value.trim().toLowerCase(); st.shown=pageSize; compute(); draw(); });
  more.addEventListener('click',()=>{ st.shown+=pageSize*2; draw(); });
  if(onRow) tb.addEventListener('click',e=>{ const tr=e.target.closest('tr[data-i]'); if(tr) onRow(view[+tr.dataset.i]); });
  $('.dt-csv',host).addEventListener('click',()=>{
    const csv = [columns.map(c=>c.label).join(','), ...view.map(r=>columns.map(c=>{ const v=c.csv?c.csv(r):c.get?c.get(r):''; return `"${String(v??'').replace(/"/g,'""')}"`; }).join(','))].join('\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿'+csv],{type:'text/csv;charset=utf-8'})); a.download = exportName+'.csv'; a.click();
    toast('تم تصدير '+fmt.int(view.length)+' سجل');
  });
}

/* ---------- side drawer with navigation stack ---------- */
const Drawer = (function(){
  const root = document.createElement('div'); root.className='drawer-root';
  root.innerHTML = `<div class="drawer-scrim"></div><aside class="drawer" role="dialog" aria-modal="true" aria-label="تفاصيل">
    <header class="drawer-h">
      <div class="drawer-nav"><button class="icon-btn d-back" aria-label="رجوع" data-tip="رجوع">${ic('arrow-right')}</button><button class="icon-btn d-close" aria-label="إغلاق">${ic('x')}</button></div>
      <div class="drawer-titles"><div class="drawer-crumbs"></div><h3></h3><p></p></div>
      <div class="drawer-actions"></div>
    </header>
    <div class="drawer-body"></div></aside>`;
  document.body.appendChild(root);
  const stack = [];
  const body = $('.drawer-body',root);
  function render(){
    const v = stack[stack.length-1]; if(!v) return;
    $('h3',root).textContent = v.title; $('p',root).innerHTML = v.subtitle||'';
    $('.drawer-crumbs',root).innerHTML = stack.map((x,i)=>`<button data-i="${i}" class="${i===stack.length-1?'cur':''}">${esc(x.crumb||x.title)}</button>`).join('<span>‹</span>');
    $('.d-back',root).style.visibility = stack.length>1?'visible':'hidden';
    $('.drawer-actions',root).innerHTML = (v.actions||[]).map((a,i)=>`<button class="${a.primary?'cta sm':'ghost-btn'}" data-a="${i}">${a.icon?ic(a.icon):''}${a.label}</button>`).join('');
    body.innerHTML = ''; body.scrollTop = 0;
    v.render(body);
    icons();
  }
  function open(view){ stack.length=0; stack.push(view); root.classList.add('open'); document.body.classList.add('drawer-open'); render(); }
  function push(view){ if(!root.classList.contains('open')) return open(view); stack.push(view); render(); }
  function back(){ if(stack.length>1){ stack.pop(); render(); } }
  function close(){ root.classList.remove('open'); document.body.classList.remove('drawer-open'); stack.length=0; $$('.is-selected').forEach(x=>x.classList.remove('is-selected')); window.App?.clearChartSelection?.(); }
  $('.d-back',root).addEventListener('click',back);
  $('.d-close',root).addEventListener('click',close);
  $('.drawer-scrim',root).addEventListener('click',close);
  $('.drawer-crumbs',root).addEventListener('click',e=>{ const b=e.target.closest('button[data-i]'); if(!b) return; stack.length=+b.dataset.i+1; render(); });
  $('.drawer-actions',root).addEventListener('click',e=>{ const b=e.target.closest('[data-a]'); if(b) stack[stack.length-1].actions[+b.dataset.a].fn(); });
  document.addEventListener('keydown',e=>{ if(e.key==='Escape' && root.classList.contains('open') && !Pop.owner) close(); });
  return {open, push, back, close, rerender:render, get isOpen(){ return root.classList.contains('open'); }};
})();

/* ---------- small visual helpers ---------- */
function trendHTML(delta, better='up', kind='pct'){
  if(delta==null) return '<span class="trend flat">—</span>';
  const flat = Math.abs(delta) < .05;
  const good = better==='neutral' ? 'flat' : flat ? 'flat' : ((delta>0)===(better==='up') ? 'up' : 'down');
  const icon = flat ? 'minus' : delta>0 ? 'arrow-up-left' : 'arrow-down-left';
  const txt = kind==='pts' ? Math.abs(delta).toFixed(1)+' نقطة' : Math.abs(delta).toFixed(1)+'%';
  return `<span class="trend ${good}">${ic(icon)}<bdi>${txt}</bdi></span>`;
}
function sparkSVG(vals, {w=200,h=36,stroke='#151515',fill='rgba(17,17,17,.05)',hl=-1}={}){
  const v = vals.map(x=>x??0); if(v.length<2) return '';
  const max=Math.max(...v), min=Math.min(...v), span=(max-min)||1;
  const X=i=>w-i*(w/(v.length-1)), Y=x=>h-3-((x-min)/span)*(h-8);          // RTL: time flows right → left
  const pts=v.map((x,i)=>[X(i),Y(x)]); let d=`M${pts[0][0]},${pts[0][1]}`;
  for(let i=1;i<pts.length;i++){ const [x0,y0]=pts[i-1],[x1,y1]=pts[i],cx=(x0+x1)/2; d+=` C${cx},${y0} ${cx},${y1} ${x1},${y1}`; }
  const hp = pts[hl>=0?hl:pts.length-1];
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><path class="ar" d="${d} L0,${h} L${w},${h} Z" fill="${fill}"/><path class="ln" d="${d}" fill="none" stroke="${stroke}" stroke-width="1.6" pathLength="1" vector-effect="non-scaling-stroke"/><circle cx="${hp[0]}" cy="${hp[1]}" r="3" fill="#B89B5E" class="ar"/></svg>`;
}
function animateValue(el, to, format, dur=800){
  if(!el) return;
  if(to==null||!isFinite(to)){ el.textContent=format(null); el._v=null; return; }
  const from = el._v ?? to*0.7; el._v = to; const t0=performance.now(); cancelAnimationFrame(el._raf);
  const step = now=>{ const p=Math.min(1,(now-t0)/dur), e=1-Math.pow(1-p,3); el.textContent=format(from+(to-from)*e); if(p<1) el._raf=requestAnimationFrame(step); };
  el._raf=requestAnimationFrame(step);
}
function barCell(v, max, color='var(--dark)'){ const w = max? clamp(v/max,0,1)*100 : 0; return `<span class="barcell"><i style="width:${w}%;background:${color}"></i></span>`; }
function statusPill(text, tone){ return `<span class="pill ${tone||''}">${esc(text)}</span>`; }

/* ---------- brand identity (never substitutes another brand's mark) ---------- */
function brandMark(name, {size='md', mono=false}={}){
  const b = (typeof DB!=='undefined' && DB && DB.idx.brand && DB.idx.brand.get(name)) || (window.BRANDS||[]).find(x=>x.name===name);
  if(!b) return `<span class="bm bm-${size} bm-text" title="${esc(name)}"><b>${esc(name)}</b></span>`;
  if(b.logoFile) return `<span class="bm bm-${size}" title="${esc(b.name)}"><img src="${esc(b.logoFile)}" alt="${esc(b.name)}" onerror="this.parentNode.classList.add('bm-text');this.replaceWith(Object.assign(document.createElement('b'),{textContent:'${esc(b.word||b.name.toUpperCase())}'}))"></span>`;
  const L = b.logo && window.BRAND_LOGOS && BRAND_LOGOS[b.logo];
  if(L) return `<span class="bm bm-${size}" title="${esc(b.name)}"><svg viewBox="0 0 24 24" role="img" aria-label="${esc(b.name)}"><path fill="${mono?'currentColor':L.hex}" d="${L.path}"/></svg></span>`;
  return `<span class="bm bm-${size} bm-text" title="${esc(b.name)} — لا يتوفر شعار رسمي معتمد في هذا الإصدار"><b>${esc(b.word||b.name.toUpperCase())}</b></span>`;
}
function brandCell(name){ return `<span class="bcell">${brandMark(name,{size:'sm'})}<span><b>${esc(name)}</b><small>${esc(L.brandAr(name))}</small></span></span>`; }
function vehicleIdentity(t, {unit=null}={}){
  return `<div class="vid">${brandMark(t.brand,{size:'lg'})}<div class="vid-t"><span class="vid-b">${esc(t.brand)} · ${esc(L.brandAr(t.brand))}</span>
    <b class="vid-m"><bdi>${esc(t.model)}</bdi></b><span class="vid-y">${t.year} · <bdi>${esc(t.trim)}</bdi>${unit?` · <code>${unit.vin}</code>`:''}</span>
    <span class="vid-tags"><em>${L.body(t.bodyType)}</em><em>${L.pt(t.powertrain)}</em><em>${L.priceSeg(t.priceSegment)}</em><em>${esc(t.generation)}</em></span></div></div>`;
}
