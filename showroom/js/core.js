/* =====================================================================
   CORE — labels (Arabic UI), formatting, periods, filter store,
   query engine and metric registry.
   Code/data are English; everything the user reads goes through AR/fmt.
   ===================================================================== */
const AR = {
  branch: {RUH:'الرياض', JED:'جدة', DMM:'الدمام', KBR:'الخبر', AHB:'أبها'},
  source: {'Website':'الموقع الإلكتروني','Google':'جوجل','Instagram':'إنستغرام','TikTok':'تيك توك','Snapchat':'سناب شات','WhatsApp':'واتساب',
           'Facebook':'فيسبوك','Marketplace':'منصات السيارات','Walk-in':'زيارة المعرض','Phone':'الهاتف','Referral':'الإحالة','Campaign':'الفعاليات والحملات','Other':'أخرى'},
  payment: {'Cash':'نقدي','Bank Transfer':'تحويل بنكي','Finance':'تمويل بالأقساط','Mixed':'دفع مختلط'},
  payType: {'Cash':'دفعة نقدية','Transfer':'تحويل بنكي','Down Payment':'دفعة أولى','Installment':'قسط','Balance':'رصيد متبقٍ'},
  payStatus: {'Paid':'مدفوع','Paid Late':'مدفوع متأخراً','Overdue':'متأخر','Scheduled':'مجدول'},
  custType: {'Individual':'فرد','Corporate':'شركة','Fleet':'أسطول','Government':'جهة حكومية'},
  vStatus: {'Available':'متاح','Reserved':'محجوز','Sold':'مباع','In Service':'قيد التجهيز'},
  leadStatus: {'Won':'تم البيع','Open':'قيد المتابعة','Lost':'مفقود'},
  nextAction: {'Qualification call':'مكالمة تأهيل','Schedule test drive':'جدولة تجربة قيادة','Send offer':'إرسال عرض سعر','Follow up offer':'متابعة العرض','Complete paperwork':'استكمال إجراءات البيع'},
  lostReason: {'Price':'السعر','Chose competitor':'اختار منافساً','Financing declined':'رفض التمويل','No response':'عدم الرد','Vehicle unavailable':'المركبة غير متوفرة','Postponed':'تأجيل الشراء'},
  collection: {'Collected':'محصّل بالكامل','On Schedule':'منتظم','Overdue':'متأخر'},
  contract: {'Settled':'مسدد','Current':'منتظم','Late':'متأخر','Default':'متعثر'},
  delivery: {'Delivered':'تم التسليم','Scheduled':'بانتظار التسليم'},
  body: {'SUV':'دفع رباعي','Sedan':'سيدان','Coupe':'كوبيه','Wagon':'ستيشن'},
  fuel: {'Petrol':'بنزين','Petrol MHEV':'بنزين – هجين خفيف','Electric':'كهربائي','Plug-in Hybrid':'هجين قابل للشحن','Hybrid':'هجين'},
  segment: {'Luxury SUV':'دفع رباعي فاخر','Performance SUV':'دفع رباعي رياضي','Mid-size Luxury SUV':'دفع رباعي فاخر متوسط','Compact Luxury SUV':'دفع رباعي فاخر مدمج',
    'Off-Road SUV':'دفع رباعي للطرق الوعرة','8-Seat Off-Road SUV':'دفع رباعي 8 مقاعد','Luxury Off-Roader':'دفع رباعي فاخر للطرق الوعرة','Flagship Sedan':'سيدان رائدة',
    'Electric Sedan':'سيدان كهربائية','Full-size Luxury SUV':'دفع رباعي فاخر كبير','Luxury Sedan':'سيدان فاخرة','Electric Luxury Sedan':'سيدان فاخرة كهربائية',
    'Luxury Coupé SUV':'دفع رباعي كوبيه فاخر','Performance Avant':'ستيشن عالية الأداء','Electric Gran Turismo':'جران توريزمو كهربائية','Sports Coupé':'كوبيه رياضية',
    'Electric Sports Sedan':'سيدان رياضية كهربائية','Full-size SUV':'دفع رباعي كبير'},
  campaign: {'CMP-RMD25':'حملة رمضان 2025','CMP-ND25':'اليوم الوطني 2025','CMP-EOY25':'عروض نهاية العام 2025','CMP-RMD26':'حملة رمضان 2026',
    'CMP-PTR26':'إطلاق باترول الجديدة','CMP-SUM26':'عروض الصيف 2026','CMP-ND26':'اليوم الوطني 2026','EVT-SHOW':'فعاليات المعرض'},
  months: ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر']
};
const L = {
  branch: id => AR.branch[id] || id,
  source: s => AR.source[s] || s || '—',
  payment: s => AR.payment[s] || s || '—',
  custType: s => AR.custType[s] || s || '—',
  campaign: id => { if(!id) return '—'; if(AR.campaign[id]) return AR.campaign[id]; if(id.startsWith('AO-')){ const c=DB.idx.campaign.get(id); return 'دائم – '+L.source(c?c.sources[0]:id.slice(3)); } const c=DB.idx.campaign.get(id); return c?c.name:id; },
  color: id => { const c=DB.idx.color.get(id); return c?c.ar:id; },
  interior: id => { const c=DB.idx.interior.get(id); return c?c.ar:id; },
  sp: id => { const s=DB.idx.salesperson.get(id); return s?s.name:id; },
  vehicle: t => t ? `${t.brand} ${t.model} ${t.trim}` : '—',
  vehicleY: t => t ? `${t.brand} ${t.model} ${t.year} ${t.trim}` : '—',
  segment: s => AR.segment[s] || s,
  fuel: s => AR.fuel[s] || s
};

/* ---------- formatting ---------- */
const fmt = {
  n: (v,d=0)=> v==null||isNaN(v) ? '—' : Number(v).toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d}),
  int: v => fmt.n(v,0),
  money: v => { if(v==null||isNaN(v)) return '—'; const a=Math.abs(v); if(a>=1e6) return (v/1e6).toFixed(a>=1e8?0:1)+' مليون'; if(a>=1e3) return Math.round(v/1e3)+' ألف'; return fmt.int(v); },
  sar: v => v==null||isNaN(v) ? '—' : fmt.int(v)+' ر.س',
  sarC: v => v==null||isNaN(v) ? '—' : fmt.money(v)+' ر.س',
  pct: (v,d=1) => v==null||isNaN(v)||!isFinite(v) ? '—' : (v*100).toFixed(d)+'%',
  x: v => v==null||!isFinite(v) ? '—' : v.toFixed(1)+'x',
  days: v => v==null||isNaN(v) ? '—' : Math.round(v)+' يوم',
  date: iso => { if(!iso) return '—'; const [y,m,d]=iso.split('-').map(Number); return `${d} ${AR.months[m-1]} ${y}`; },
  month: key => { const [y,m]=key.split('-').map(Number); return `${AR.months[m-1]} ${y}`; },
  monthShort: key => { const [y,m]=key.split('-').map(Number); return `${AR.months[m-1]} ${String(y).slice(2)}`; }
};
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const esc = s => String(s??'').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

/* =====================================================================
   PERIODS — every period has an equivalent comparison period
   ===================================================================== */
const Periods = (function(){
  let list = [];
  const dayOfYMD=(y,m,d)=>DB.dayOf(`${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`);
  function build(){
    const T = DB.meta.todayDay, [ty,tm,td] = DB.meta.today.split('-').map(Number);
    const monthP = (y,m)=>{
      const start=dayOfYMD(y,m,1), full=dayOfYMD(y,m+1>11?y+1:y,(m+1)%12,1)-1, end=Math.min(full,T);
      const py = m===0?y-1:y, pm=(m+11)%12, pstart=dayOfYMD(py,pm,1), pfull=start-1;
      const pend = Math.min(pfull, pstart+(end-start));
      const partial = end<full;
      return {id:`m-${y}-${m+1}`, kind:'month', label:`${AR.months[m]} ${y}`+(partial?' (حتى تاريخه)':''), start, end,
              prev:{start:pstart, end:pend, label:`${AR.months[pm]} ${py}`+(partial?' (نفس الأيام)':'')}, monthKey:`${y}-${String(m+1).padStart(2,'0')}`};
    };
    list = [];
    const ytdS=dayOfYMD(ty,0,1), ytdPrevS=dayOfYMD(ty-1,0,1);
    list.push({id:'ytd', kind:'range', label:`منذ بداية ${ty}`, start:ytdS, end:T, prev:{start:ytdPrevS, end:ytdPrevS+(T-ytdS), label:`نفس الفترة ${ty-1}`}});
    list.push({id:'l12m', kind:'range', label:'آخر 12 شهراً', start:T-364, end:T, prev:{start:T-729, end:T-365, label:'الـ12 شهراً السابقة'}});
    const q = Math.floor((tm-1)/3), qs = dayOfYMD(ty,q*3,1), pqs = q? dayOfYMD(ty,(q-1)*3,1) : dayOfYMD(ty-1,9,1);
    list.push({id:'qtd', kind:'range', label:`الربع ${q+1} ${ty}`, start:qs, end:T, prev:{start:pqs, end:Math.min(qs-1, pqs+(T-qs)), label:`الربع ${q?q:4} (نفس الأيام)`}});
    for(let y=ty; y>=2025; y--) for(let m=(y===ty?tm-1:11); m>=0; m--) list.push(monthP(y,m));
    list.push({id:'fy2025', kind:'range', label:'عام 2025 كاملاً', start:dayOfYMD(2025,0,1), end:dayOfYMD(2025,11,31), prev:null});
    list.push({id:'all', kind:'range', label:'كل الفترة (منذ يناير 2025)', start:dayOfYMD(2025,0,1), end:T, prev:null});
  }
  return {
    build, all:()=>list,
    get:id=>list.find(p=>p.id===id) || list[0],
    month:(key)=>{ const [y,m]=key.split('-').map(Number); return list.find(p=>p.id===`m-${y}-${m}`); },
    rangeLabel:p=>`${fmt.date(DB.isoOf(p.start))} – ${fmt.date(DB.isoOf(p.end))}`
  };
})();
// month keys of the reporting window (for trend charts)
function monthKeys(fromKey='2025-01'){
  const out=[]; let [y,m]=fromKey.split('-').map(Number); const [ty,tm]=DB.meta.today.split('-').map(Number);
  while(y<ty || (y===ty && m<=tm)){ out.push(`${y}-${String(m).padStart(2,'0')}`); if(++m>12){m=1;y++;} }
  return out;
}
const monthRange = key => { const [y,m]=key.split('-').map(Number); const s=DB.dayOf(`${key}-01`); const e=DB.dayOf(m===12?`${y+1}-01-01`:`${y}-${String(m+1).padStart(2,'0')}-01`)-1; return {start:s, end:Math.min(e,DB.meta.todayDay)}; };

/* =====================================================================
   FILTER STORE — single source of truth for cross-filtering
   Vehicle hierarchy: brand → model → year → trim → vehicleId
   ===================================================================== */
const FILTER_DIMS = ['branch','brand','model','year','trim','vehicleId','source','campaign','payment','custType','salesperson'];
const HIER = ['brand','model','year','trim','vehicleId'];
const Store = (function(){
  const state = {period:'ytd', branch:null, brand:null, model:null, year:null, trim:null, vehicleId:null,
                 source:null, campaign:null, payment:null, custType:null, salesperson:null};
  const subs = [];
  function set(patch, origin){
    const next = {...state};
    // hierarchy consistency: changing a level clears everything below it
    for(let i=0;i<HIER.length;i++){
      const k = HIER[i];
      if(k in patch && patch[k]!==state[k]){ for(let j=i+1;j<HIER.length;j++) if(!(HIER[j] in patch)) next[HIER[j]] = null; }
    }
    Object.assign(next, patch);
    // a specific vehicle implies its hierarchy
    if(patch.vehicleId){ const v=DB.idx.vehicle.get(patch.vehicleId); if(v){ Object.assign(next,{brand:v._t.brand, model:v._t.model, year:v._t.year, trim:v._t.trim, branch: next.branch}); } }
    if(patch.salesperson){ const sp=DB.idx.salesperson.get(patch.salesperson); if(sp && !patch.branch) next.branch = sp.branchId; }
    const changed = Object.keys(next).filter(k=>next[k]!==state[k]);
    if(!changed.length) return;
    Object.assign(state, next);
    subs.forEach(fn=>fn(changed, origin));
  }
  return {
    get:()=>({...state}), state,
    set, subscribe:fn=>subs.push(fn),
    clearAll(){ const p={}; FILTER_DIMS.forEach(k=>p[k]=null); set(p,'clear'); },
    activeDims(){ return FILTER_DIMS.filter(k=>state[k]!=null); },
    selectedTrim(){ if(!state.trim) return null; return DB.trims.find(t=>t.brand===state.brand && t.model===state.model && t.year===state.year && t.trim===state.trim) || null; },
    level(){ return state.vehicleId?'vehicle':state.trim?'trim':state.year?'year':state.model?'model':state.brand?'brand':'all'; }
  };
})();
const DIM_LABEL = {branch:'الفرع', brand:'العلامة', model:'الطراز', year:'سنة الطراز', trim:'الفئة', vehicleId:'المركبة', source:'مصدر العميل', campaign:'الحملة', payment:'طريقة الدفع', custType:'نوع العميل', salesperson:'مستشار المبيعات', period:'الفترة'};
function dimValueLabel(k, v){
  if(v==null) return '';
  return {branch:L.branch, source:L.source, campaign:L.campaign, payment:L.payment, custType:L.custType, salesperson:L.sp,
          vehicleId:id=>{ const x=DB.idx.vehicle.get(id); return x?x.vin.slice(-8):id; }}[k]?.(v) ?? String(v);
}

/* =====================================================================
   QUERY ENGINE — every metric is computed from records through these
   ===================================================================== */
const Q = (function(){
  // which filter dims apply to which record type
  const APPLIES = {
    sales:   ['branch','brand','model','year','trim','vehicleId','source','campaign','payment','custType','salesperson'],
    leads:   ['branch','brand','model','year','trim','source','campaign','custType','salesperson'],
    stock:   ['branch','brand','model','year','trim','vehicleId'],
    payments:['branch','brand','model','year','trim','vehicleId','source','campaign','payment','custType','salesperson'],
    spend:   ['source','campaign']
  };
  const vMatch = (t,f)=> (!f.brand||t.brand===f.brand) && (!f.model||t.model===f.model) && (!f.year||t.year===f.year) && (!f.trim||t.trim===f.trim);
  const saleMatch = (s,f)=> (!f.branch||s.branchId===f.branch) && vMatch(s._t,f) && (!f.vehicleId||s.vehicleId===f.vehicleId)
      && (!f.source||s.source===f.source) && (!f.campaign||s.campaignId===f.campaign) && (!f.payment||s.paymentMethod===f.payment)
      && (!f.custType||s.customerType===f.custType) && (!f.salesperson||s.salespersonId===f.salesperson);
  const leadMatch = (l,f)=> (!f.branch||l.branchId===f.branch) && vMatch(l._t,f) && (!f.source||l.source===f.source)
      && (!f.campaign||l.campaignId===f.campaign) && (!f.custType||l._cust.type===f.custType) && (!f.salesperson||l.salespersonId===f.salesperson);
  const stockMatch = (v,f)=> (!f.branch||v.branchId===f.branch) && vMatch(v._t,f) && (!f.vehicleId||v.vehicleId===f.vehicleId);
  const inP = (d,P)=> d!=null && d>=P.start && d<=P.end;

  function sales(f, P){ return DB.sales.filter(s=>(!P||inP(s._d,P)) && saleMatch(s,f)); }
  function leads(f, P, field='_d'){ return DB.leads.filter(l=>(!P||inP(l[field],P)) && leadMatch(l,f)); }
  // units physically in stock at the END of a day (historic reconstruction from arrival/sold dates)
  function stockAt(f, d){
    const T = DB.meta.todayDay;
    return DB.vehicles.filter(v=>v._arr<=d && (v._sold==null || v._sold>d) && stockMatch(v,f)).map(v=>{
      if(d>=T) return v;
      return Object.assign(Object.create(v), {status: v._sold!=null ? 'Available' : v.status, _ageAt: d-v._arr});
    });
  }
  const age = (v,d)=> d - v._arr;
  function payments(f, P, field='_paid'){ return DB.payments.filter(p=>(!P||inP(p[field],P)) && saleMatch(p._s,f)); }
  function spend(f, P){
    return DB.marketingSpend.filter(r=>(!P||(r._start<=P.end && r._start+27>=P.start)) && (!f.source||r.source===f.source) && (!f.campaign||r.campaignId===f.campaign))
      .reduce((a,r)=>{ // pro-rate monthly spend to the overlapping days
        if(!P) return a+r.amount;
        const ms=r._start, me=monthRange(r.month).end, ov=Math.max(0,Math.min(me,P.end)-Math.max(ms,P.start)+1), len=me-ms+1;
        return a + r.amount*ov/len;
      },0);
  }
  function summarize(rows){
    const n = rows.length, o = {units:n, revenue:0, listValue:0, discount:0, cost:0, gp:0, fi:0, other:0, acq:0, contribution:0, dtsSum:0, byMethod:{}};
    for(const s of rows){
      o.revenue+=s.sellingPrice; o.listValue+=s.listPrice; o.discount+=s.discount; o.cost+=s.cost; o.gp+=s.grossProfit;
      o.fi+=s.financeIncome; o.other+=s.otherIncome; o.acq+=s.acquisitionCost; o.contribution+=s.contribution; o.dtsSum+=s.daysInInventory;
      o.byMethod[s.paymentMethod]=(o.byMethod[s.paymentMethod]||0)+s.sellingPrice;
    }
    o.margin = o.revenue? o.gp/o.revenue : null;
    o.avgPrice = n? o.revenue/n : null;
    o.avgDiscount = n? o.discount/n : null;
    o.discountPct = o.listValue? o.discount/o.listValue : null;
    o.gpPerUnit = n? o.gp/n : null;
    o.avgDts = n? o.dtsSum/n : null;
    o.financeShare = o.revenue? (o.byMethod.Finance||0)/o.revenue : null;
    return o;
  }
  function group(rows, keyFn){ const m=new Map(); for(const r of rows){ const k=keyFn(r); if(k==null) continue; (m.get(k)||m.set(k,[]).get(k)).push(r); } return m; }
  function stockSummary(units, d){
    const o = {units:units.length, value:0, available:0, reserved:0, service:0, ageSum:0, aged90:0, aged90Value:0};
    for(const v of units){
      o.value += v.purchaseCost; const a = d - v._arr; o.ageSum += a;
      if(v.status==='Reserved') o.reserved++; else if(v.status==='In Service') o.service++; else o.available++;
      if(a>90){ o.aged90++; o.aged90Value += v.purchaseCost; }
    }
    o.avgAge = o.units? o.ageSum/o.units : null;
    return o;
  }
  // receivable position as of today for sales matching f, sold up to `endDay`
  function receivables(f, endDay){
    const rows = DB.sales.filter(s=>s._d<=endDay && saleMatch(s,f));
    const o = {outstanding:0, overdue:0, contracts:0, rows};
    rows.forEach(s=>{ o.outstanding+=s.outstanding; o.overdue+=s.overdueAmount; if(s.outstanding>0) o.contracts++; });
    return o;
  }
  return {APPLIES, sales, leads, stockAt, payments, spend, summarize, group, stockSummary, receivables, saleMatch, leadMatch, stockMatch, age, inP};
})();

/* ---------- common derived bundles ---------- */
function filtersOf(extra={}){ const s=Store.get(); const f={}; FILTER_DIMS.forEach(k=>{ const v = k in extra ? extra[k] : s[k]; if(v!=null) f[k]=v; }); return f; }
// Like-for-like comparison: when a model year is selected, the comparison period uses the previous model year
// (e.g. MY2026 sales this year vs MY2025 sales last year) — otherwise launch timing distorts every delta.
const prevF = f => f.year ? {...f, year:f.year-1} : f;
function change(cur, prev, kind='pct'){
  if(cur==null||prev==null||!isFinite(cur)||!isFinite(prev)) return null;
  if(kind==='pts') return (cur-prev)*100;
  if(!prev) return null;
  return (cur-prev)/Math.abs(prev)*100;
}

/* =====================================================================
   METRIC REGISTRY — definitions power the ⓘ transparency popovers
   ===================================================================== */
const METRICS = {
  revenue:     {label:'الإيرادات', unit:'money', better:'up', src:'sales', what:'قيمة البيع الفعلية للمركبات المباعة بعد الخصومات (شاملة الضريبة).', how:'مجموع «سعر البيع» لكل صفقة بيع تاريخها ضمن الفترة.', data:'جدول المبيعات (Sales) — صفقة واحدة لكل مركبة مباعة.'},
  units:       {label:'المركبات المباعة', unit:'int', better:'up', src:'sales', what:'عدد صفقات البيع المكتملة.', how:'عدد سجلات المبيعات التي يقع تاريخ بيعها ضمن الفترة.', data:'جدول المبيعات (Sales).'},
  gp:          {label:'إجمالي الربح', unit:'money', better:'up', src:'sales', what:'الربح الإجمالي من بيع المركبات.', how:'Σ (سعر البيع − تكلفة شراء المركبة) للصفقات ضمن الفترة.', data:'المبيعات + تكلفة المركبة من سجل المخزون.'},
  margin:      {label:'هامش الربح الإجمالي', unit:'pct', kind:'pts', better:'up', src:'sales', what:'نسبة الربح الإجمالي إلى الإيرادات.', how:'إجمالي الربح ÷ الإيرادات.', data:'المبيعات.'},
  avgPrice:    {label:'متوسط سعر البيع', unit:'money', better:'up', src:'sales', what:'متوسط سعر البيع الفعلي للمركبة.', how:'الإيرادات ÷ عدد المركبات المباعة.', data:'المبيعات.'},
  avgDiscount: {label:'متوسط الخصم', unit:'money', better:'down', src:'sales', what:'متوسط الخصم الممنوح لكل مركبة عن سعر القائمة (السعر الرسمي + الإضافات).', how:'Σ (سعر القائمة − سعر البيع) ÷ عدد المركبات.', data:'المبيعات.'},
  gpPerUnit:   {label:'الربح لكل مركبة', unit:'money', better:'up', src:'sales', what:'متوسط الربح الإجمالي لكل مركبة مباعة.', how:'إجمالي الربح ÷ عدد المركبات المباعة.', data:'المبيعات.'},
  contribution:{label:'المساهمة التقديرية', unit:'money', better:'up', src:'sales', what:'الربح بعد إيرادات التمويل والإيرادات الأخرى وتكلفة الاستحواذ التسويقية.', how:'إجمالي الربح + إيراد التمويل + الإيرادات الأخرى − تكلفة الاستحواذ الموزعة.', data:'المبيعات + الإنفاق التسويقي موزعاً على الصفقات حسب المصدر والشهر.'},
  collected:   {label:'النقد المحصّل', unit:'money', better:'up', src:'payments', what:'المبالغ التي استلمتها الشركة فعلياً خلال الفترة (نقد، تحويلات، دفعات أولى، أقساط).', how:'Σ المبالغ المدفوعة التي يقع تاريخ دفعها ضمن الفترة.', data:'جدول المدفوعات (Payments).'},
  outstanding: {label:'الذمم القائمة', unit:'money', better:'down', src:'payments', snapshot:true, what:'المبالغ المستحقة على العملاء ولم تُحصّل بعد (حالية ومستقبلية).', how:'Σ (قيمة العقد − المحصّل) لكل صفقة حتى نهاية الفترة، محسوبة كما في تاريخ اليوم.', data:'المبيعات + المدفوعات.'},
  overdue:     {label:'المبالغ المتأخرة', unit:'money', better:'down', src:'payments', snapshot:true, what:'دفعات تجاوزت تاريخ استحقاقها ولم تُسدد.', how:'Σ الدفعات غير المسددة التي تاريخ استحقاقها قبل اليوم.', data:'جدول المدفوعات.'},
  collectionRate:{label:'نسبة التحصيل', unit:'pct', kind:'pts', better:'up', src:'payments', what:'نسبة ما حُصّل من المبالغ المستحقة خلال الفترة.', how:'المحصّل من الدفعات المستحقة خلال الفترة ÷ إجمالي المستحق خلال الفترة.', data:'جدول المدفوعات.'},
  inventoryValue:{label:'قيمة المخزون', unit:'money', better:'neutral', src:'stock', snapshot:true, what:'تكلفة شراء المركبات الموجودة في المخزون في نهاية الفترة.', how:'Σ تكلفة الشراء للمركبات التي وصلت ولم تُبع حتى نهاية الفترة.', data:'سجل المركبات (Vehicles) — تاريخ الوصول وتاريخ البيع.'},
  available:   {label:'المركبات المتاحة', unit:'int', better:'neutral', src:'stock', snapshot:true, what:'المركبات الجاهزة للبيع وغير المحجوزة.', how:'عدد المركبات في المخزون بحالة «متاح».', data:'سجل المركبات.'},
  aged90:      {label:'مخزون تجاوز 90 يوماً', unit:'int', better:'down', src:'stock', snapshot:true, what:'مركبات مضى على وجودها في المخزون أكثر من 90 يوماً.', how:'عدد المركبات في المخزون التي (تاريخ نهاية الفترة − تاريخ الوصول) > 90.', data:'سجل المركبات.'},
  avgAge:      {label:'متوسط عمر المخزون', unit:'days', better:'down', src:'stock', snapshot:true, what:'متوسط عدد الأيام منذ وصول المركبات الموجودة حالياً.', how:'متوسط (نهاية الفترة − تاريخ الوصول) للمركبات في المخزون.', data:'سجل المركبات.'},
  turnover:    {label:'دوران المخزون', unit:'x', better:'up', src:'stock', what:'عدد مرات تجدد المخزون سنوياً.', how:'تكلفة المبيعات السنوية (محسوبة للفترة) ÷ متوسط قيمة المخزون في بداية ونهاية الفترة.', data:'المبيعات + سجل المركبات.'},
  avgDts:      {label:'متوسط أيام البيع', unit:'days', better:'down', src:'sales', what:'متوسط الأيام بين وصول المركبة وبيعها.', how:'متوسط (تاريخ البيع − تاريخ الوصول) للمركبات المباعة في الفترة.', data:'المبيعات + سجل المركبات.'},
  leads:       {label:'العملاء المحتملون', unit:'int', better:'up', src:'leads', what:'عدد العملاء المحتملين الجدد المسجلين.', how:'عدد سجلات العملاء المحتملين التي تاريخ إنشائها ضمن الفترة.', data:'جدول العملاء المحتملين (Leads).'},
  leadConv:    {label:'تحويل العميل إلى بيع', unit:'pct', kind:'pts', better:'up', src:'leads', what:'نسبة المبيعات إلى العملاء المحتملين في الفترة.', how:'عدد المبيعات ضمن الفترة ÷ عدد العملاء المحتملين الجدد ضمن الفترة (قياس نشاط الفترة).', data:'العملاء المحتملون + المبيعات.'},
  spend:       {label:'الإنفاق التسويقي', unit:'money', better:'neutral', src:'spend', what:'تكلفة الحملات والإعلانات.', how:'Σ الإنفاق الشهري حسب المصدر والحملة، موزعاً نسبياً على أيام الفترة.', data:'جدول الإنفاق التسويقي (Marketing Spend).'},
  cpl:         {label:'تكلفة العميل المحتمل', unit:'money', better:'down', src:'spend', what:'متوسط تكلفة الحصول على عميل محتمل واحد.', how:'الإنفاق التسويقي ÷ عدد العملاء المحتملين.', data:'الإنفاق + العملاء المحتملون.'},
  cac:         {label:'تكلفة الاستحواذ', unit:'money', better:'down', src:'spend', what:'تكلفة التسويق لكل عملية بيع.', how:'الإنفاق التسويقي ÷ عدد المبيعات.', data:'الإنفاق + المبيعات.'},
  roas:        {label:'العائد على الإنفاق', unit:'x', better:'up', src:'spend', what:'الإيرادات المحققة مقابل كل ريال إنفاق تسويقي.', how:'الإيرادات ÷ الإنفاق التسويقي.', data:'المبيعات + الإنفاق.'}
};
const unitFmt = {money:fmt.sarC, int:fmt.int, pct:v=>fmt.pct(v), x:fmt.x, days:fmt.days};
