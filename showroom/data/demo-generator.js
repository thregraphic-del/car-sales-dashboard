/* =====================================================================
   DEMO DATA GENERATOR  (dataClass: 'demo') — Saudi multi-brand dealership
   ---------------------------------------------------------------------
   Deterministic, record-level, schema-conformant data:
   leads → qualified → test drive → quote → reservation → sale → delivery,
   VIN-level vehicles (Available / Reserved / In Transit / Sold / Delivered),
   payment schedules, campaigns and marketing spend.
   Saudi context: salary-cycle demand (25th–3rd), Ramadan & Eid, Founding
   Day, National Day, year-end, regional brand/body mix, fleet, corporate
   and government customers, financing, branch transfers.
   Nothing here is real — it exists so the dashboard can be built and
   tested against the exact structure production data will have.
   ===================================================================== */
window.generateDemoData = function generateDemoData(ref, opts = {}){
  const TODAY_ISO = opts.today || '2026-09-29';
  const START = {y:2024, m:10};              // pipeline warm-up; reporting starts Jan 2025
  const seed = opts.seed || 20260929;

  /* ---------- deterministic RNG & date helpers ---------- */
  let a = seed;
  const rng = ()=>{ a|=0; a=a+0x6D2B79F5|0; let t=Math.imul(a^a>>>15,1|a); t=t+Math.imul(t^t>>>7,61|t)^t; return((t^t>>>14)>>>0)/4294967296; };
  const pick = arr => arr[Math.floor(rng()*arr.length)];
  const pickW = (items, weights)=>{ const tot=weights.reduce((s,x)=>s+x,0); let r=rng()*tot; for(let i=0;i<items.length;i++){ r-=weights[i]; if(r<=0) return items[i]; } return items[items.length-1]; };
  const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
  const EPOCH = Date.UTC(2024,0,1);
  const dayOf = iso => { const [y,m,d]=iso.split('-').map(Number); return Math.round((Date.UTC(y,m-1,d)-EPOCH)/864e5); };
  const iso = day => new Date(EPOCH+day*864e5).toISOString().slice(0,10);
  const dateOf = day => new Date(EPOCH+day*864e5);
  const addMonths = (day,k)=>{ const d=dateOf(day); return Math.round((Date.UTC(d.getUTCFullYear(), d.getUTCMonth()+k, Math.min(d.getUTCDate(),28))-EPOCH)/864e5); };
  const TODAY = dayOf(TODAY_ISO), todayDate = dateOf(TODAY);
  const MONTHS = [];
  for(let y=START.y, m=START.m;;){
    const start = Math.round((Date.UTC(y,m,1)-EPOCH)/864e5);
    const end = Math.min(TODAY, Math.round((Date.UTC(y,m+1,1)-EPOCH)/864e5)-1);
    MONTHS.push({y, m, start, end, key:`${y}-${String(m+1).padStart(2,'0')}`});
    if(y===todayDate.getUTCFullYear() && m===todayDate.getUTCMonth()) break;
    if(++m>11){ m=0; y++; }
  }

  /* ---------- Saudi calendar: day-level demand weights ---------- */
  const R = (s,e)=>[dayOf(s),dayOf(e)];
  const RAMADAN = [R('2025-03-01','2025-03-29'), R('2026-02-18','2026-03-19')];
  const EID_FITR = [R('2025-03-30','2025-04-08'), R('2026-03-20','2026-03-29')];
  const EID_ADHA = [R('2025-06-05','2025-06-10'), R('2026-05-26','2026-05-31')];
  const NATIONAL = [R('2025-09-10','2025-09-26'), R('2026-09-10','2026-09-26')];
  const FOUNDING = [R('2025-02-18','2025-02-24'), R('2026-02-18','2026-02-24')];
  const inAny = (d, list)=>list.some(([s,e])=>d>=s && d<=e);
  const MONTH_BASE = [1.0,1.0,1.0,1.02,1.0,.95,.86,.88,1.02,1.03,1.08,1.18]; // summer travel dip, year-end push
  function dayWeight(d){
    const dt = dateOf(d), dom = dt.getUTCDate();
    let w = MONTH_BASE[dt.getUTCMonth()];
    if(dom>=25 || dom<=3) w *= 1.35;                // salary cycle (27th)
    if(inAny(d,RAMADAN)) w *= .78;
    if(inAny(d,EID_FITR)) w *= 1.35;
    if(inAny(d,EID_ADHA)) w *= .7;
    if(inAny(d,NATIONAL)) w *= 1.3;
    if(inAny(d,FOUNDING)) w *= 1.18;
    return w;
  }
  const DW = {}; MONTHS.forEach(M=>{ const ws=[]; for(let d=M.start; d<=M.end; d++) ws.push(dayWeight(d)); DW[M.key]={ws, sum:ws.reduce((s,x)=>s+x,0)}; });
  const sampleDay = M => { const {ws,sum}=DW[M.key]; let r=rng()*sum; for(let i=0;i<ws.length;i++){ r-=ws[i]; if(r<=0) return M.start+i; } return M.end; };

  /* ---------- branches & regional mix ---------- */
  const BR = [
    {branchId:'RUH', name:'Riyadh',  city:'Riyadh',  region:'Central', w:.29, dts:.95, sp:8},
    {branchId:'JED', name:'Jeddah',  city:'Jeddah',  region:'Western', w:.22, dts:1.0, sp:7},
    {branchId:'DMM', name:'Dammam',  city:'Dammam',  region:'Eastern', w:.12, dts:1.02, sp:5},
    {branchId:'KBR', name:'Khobar',  city:'Khobar',  region:'Eastern', w:.11, dts:1.0, sp:4},
    {branchId:'MAK', name:'Makkah',  city:'Makkah',  region:'Western', w:.10, dts:1.05, sp:4},
    {branchId:'MED', name:'Madinah', city:'Madinah', region:'Western', w:.08, dts:1.08, sp:3},
    {branchId:'AHB', name:'Abha',    city:'Abha',    region:'Southern',w:.08, dts:1.12, sp:3}
  ];
  function affinity(b, t){
    let x = 1; const body=t.bodyType, br=t.brand, m=t.model, ev=t.powertrain==='Full Electric';
    if(b==='RUH'){ if(['Land Cruiser','LX','GX','Tahoe','Yukon','Patrol'].includes(m)) x*=1.25; if(br==='Lexus'||br==='GMC') x*=1.15; }
    if(b==='JED'){ if(body==='Sedan') x*=1.12; if(['MG','Geely','Changan','Jetour','GAC','Haval'].includes(br)) x*=1.15; }
    if(b==='DMM'||b==='KBR'){ if(body==='Pickup') x*=1.3; if(['Chevrolet','GMC','Ford'].includes(br)) x*=1.2; if(m==='Patrol') x*=1.2; }
    if(b==='MAK'||b==='MED'){ if(body==='MPV') x*=1.8; if(t.priceSegment==='Economy') x*=1.2; if(t.priceSegment==='Luxury') x*=.6; }
    if(b==='AHB'){ if(body==='Pickup'||['Land Cruiser Prado','Land Cruiser','Fortuner','Hilux'].includes(m)) x*=1.5; if(body==='Sports Car'||ev) x*=.3; }
    if(ev) x *= (b==='RUH'||b==='JED'||b==='KBR') ? 1 : .5;
    return x;
  }

  /* ---------- lead sources & campaigns ---------- */
  const SRC = {
    'Website':    {w:.13,q:.66,td:.58,of:.72,rs:.66,sl:.9, cpl:260, digital:true},
    'Google':     {w:.12,q:.6, td:.52,of:.68,rs:.62,sl:.9, cpl:380, digital:true},
    'Instagram':  {w:.12,q:.44,td:.42,of:.62,rs:.58,sl:.86,cpl:210, digital:true},
    'TikTok':     {w:.09,q:.3, td:.32,of:.55,rs:.52,sl:.84,cpl:120, digital:true},
    'Snapchat':   {w:.13,q:.4, td:.4, of:.6, rs:.56,sl:.86,cpl:160, digital:true},
    'WhatsApp':   {w:.1, q:.7, td:.6, of:.72,rs:.66,sl:.9, cpl:150, digital:true},
    'Facebook':   {w:.03,q:.34,td:.36,of:.58,rs:.54,sl:.85,cpl:230, digital:true},
    'Marketplace':{w:.08,q:.58,td:.52,of:.68,rs:.62,sl:.88,cpl:420, digital:true},
    'Walk-in':    {w:.08,q:.93,td:.8, of:.78,rs:.7, sl:.93,cpl:0},
    'Phone':      {w:.05,q:.74,td:.6, of:.7, rs:.64,sl:.9, cpl:0},
    'Referral':   {w:.04,q:.9, td:.74,of:.78,rs:.72,sl:.93,cpl:0},
    'Campaign':   {w:.02,q:.62,td:.55,of:.66,rs:.6, sl:.88,cpl:750},
    'Other':      {w:.01,q:.46,td:.4, of:.6, rs:.55,sl:.86,cpl:0}
  };
  const SRC_KEYS = Object.keys(SRC);
  const CAMPAIGNS = [
    {campaignId:'CMP-FD25',  name:'Founding Day 2025', sources:['Snapchat','Instagram','Website'], start:'2025-02-15', end:'2025-02-25', alwaysOn:false},
    {campaignId:'CMP-RMD25', name:'Ramadan & Eid 2025', sources:['Instagram','Snapchat','TikTok','Google'], start:'2025-02-25', end:'2025-04-06', alwaysOn:false},
    {campaignId:'CMP-ND25',  name:'Saudi National Day 2025', sources:['Instagram','Snapchat','TikTok','Website','Campaign'], start:'2025-09-08', end:'2025-09-27', alwaysOn:false},
    {campaignId:'CMP-EOY25', name:'Year-End Clearance 2025', sources:['Google','Instagram','Marketplace','Facebook'], start:'2025-11-15', end:'2025-12-31', alwaysOn:false},
    {campaignId:'CMP-FD26',  name:'Founding Day 2026', sources:['Snapchat','Instagram','Website'], start:'2026-02-12', end:'2026-02-24', alwaysOn:false},
    {campaignId:'CMP-RMD26', name:'Ramadan & Eid 2026', sources:['Instagram','Snapchat','TikTok','Google'], start:'2026-02-13', end:'2026-03-27', alwaysOn:false},
    {campaignId:'CMP-PTR26', name:'All-new Patrol Launch', sources:['Snapchat','TikTok','Instagram','Campaign'], start:'2026-04-05', end:'2026-05-20', alwaysOn:false, brand:'Nissan'},
    {campaignId:'CMP-SUM26', name:'Summer Finance Offers 2026', sources:['Google','Website','Marketplace'], start:'2026-07-01', end:'2026-08-31', alwaysOn:false},
    {campaignId:'CMP-ND26',  name:'Saudi National Day 2026', sources:['Instagram','Snapchat','TikTok','Website','Campaign'], start:'2026-09-08', end:'2026-09-27', alwaysOn:false},
    {campaignId:'EVT-SHOW',  name:'Showroom & Mall Events', sources:['Campaign'], start:'2024-11-01', end:'2026-12-31', alwaysOn:true}
  ];
  SRC_KEYS.filter(s=>SRC[s].digital).forEach(s=>CAMPAIGNS.push({campaignId:'AO-'+s.toUpperCase(), name:`${s} Always-on`, sources:[s], start:'2024-11-01', end:'2026-12-31', alwaysOn:true}));
  CAMPAIGNS.forEach(c=>{ c._s=dayOf(c.start); c._e=dayOf(c.end); });
  const activeCampaign = (source, day, brand)=>CAMPAIGNS.find(c=>!c.alwaysOn && c.sources.includes(source) && day>=c._s && day<=c._e && (!c.brand||c.brand===brand));

  /* ---------- people ---------- */
  const MALE = ['محمد','عبدالله','فهد','خالد','سعود','فيصل','عبدالرحمن','سلطان','ناصر','تركي','ماجد','بندر','يزيد','راكان','عمر','أحمد','سلمان','مشعل','نواف','زياد','حمد','عبدالعزيز'];
  const FEMALE = ['نورة','سارة','ريم','لمى','هيفاء','الجوهرة','شهد','دانة','رهف','منيرة'];
  const FAMILY = ['العتيبي','القحطاني','الشهري','الغامدي','الدوسري','الحربي','الزهراني','المطيري','الشمري','العنزي','السبيعي','العمري','الأحمدي','البقمي','الأسمري','الخالدي','التميمي','الرشيدي','الجهني','السهلي','المالكي','الشهراني'];
  const CO_A = ['شركة','مؤسسة','مجموعة'], CO_B = ['الأفق','الرواسي','النخبة','سدير','المدار','الوفاء','الريادة','البيان','الأصالة','المستقبل','الصفوة','الجزيرة'], CO_C = ['للتجارة','القابضة','للمقاولات','للاستثمار','للخدمات اللوجستية'];
  const GOV = ['إدارة الخدمات المساندة','إدارة النقل','إدارة المشاريع','إدارة المرافق'];
  const personName = ()=> (rng()<.82?pick(MALE):pick(FEMALE))+' '+pick(FAMILY);
  const salespeople = [];
  BR.forEach(b=>{ for(let i=0;i<b.sp;i++) salespeople.push({salespersonId:`SP-${b.branchId}-${i+1}`, name:personName(), branchId:b.branchId, _skill:.8+rng()*.38, _disc:rng()<.18?1.9:1}); });
  const spByBranch = Object.fromEntries(BR.map(b=>[b.branchId, salespeople.filter(s=>s.branchId===b.branchId)]));

  /* ---------- catalog-derived demand model ---------- */
  const trims = ref.trims.map(t=>{ const {_demo, ...rest} = t; return rest; });
  const demo = Object.fromEntries(ref.trims.map(t=>[t.trimId, t._demo]));
  const byModelTrim = {}; // modelKey|trim -> {year: trim}
  ref.trims.forEach(t=>{ (byModelTrim[t.modelKey+'|'+t.trim] ??= {})[t.year] = t; });
  const byModelYear = {}; ref.trims.forEach(t=>{ (byModelYear[t.modelKey+'|'+t.year] ??= []).push(t); });
  const modelYears = {}; ref.trims.forEach(t=>{ (modelYears[t.modelKey] ??= new Set()).add(t.year); });
  // one demand "slot" per model+trim-name (latest year), so each trim is simulated once per month
  const slots = []; const seen = new Set();
  [...ref.trims].sort((x,y)=>y.year-x.year).forEach(t=>{ const k=t.modelKey+'|'+t.trim; if(!seen.has(k)){ seen.add(k); slots.push(t); } });
  const OVERSTOCK = {'kia-k5':2.1,'nissan-altima':2.0,'chevrolet-captiva':2.2,'gmc-acadia':1.9,'byd-han':2.4,'byd-tang':2.3,'mg-mg-zs-ev':2.6,'lexus-ls':1.9,'gac-empow':2.0,'hyundai-sonata':1.8,'ford-mustang':1.8,'chevrolet-corvette':1.7,'geely-preface':1.8,
                     'toyota-land-cruiser':.35,'nissan-patrol':.5,'toyota-hilux':.55,'toyota-land-cruiser-prado':.5,'lexus-lx':.55,'toyota-camry':.7,'jetour-t2':.6};
  const GROWTH = {MG:1.18, Geely:1.22, Changan:1.25, Jetour:1.4, GAC:1.2, Haval:1.2, BYD:1.35};
  // model year of the vehicle for a given calendar month (only years the model actually has)
  function modelYearFor(t, M){
    // MY(n+1) launches from September of year n; MY(n-1) run-out stock sells through the first half of year n
    const pNext = M.m>=8 ? (M.m-7)/5*.65 : 0, pPrev = M.m<=5 ? (6-M.m)/6*.35 : .03;
    const r = rng(), target = r<pNext ? M.y+1 : r<pNext+pPrev ? M.y-1 : M.y;
    const ys = [...modelYears[t.modelKey]].sort((x,y)=>x-y);
    const y = ys.filter(v=>v<=target).pop() ?? ys[0];
    return byModelTrim[t.modelKey+'|'+t.trim]?.[y] || (byModelYear[t.modelKey+'|'+y]||[])[0] || t;
  }
  const colorWeights = t => ref.colors.map(c=>{
    let w=c.w; const body=t.bodyType;
    if((body==='SUV'||body==='Pickup') && (c.id==='white'||c.id==='sand')) w*=1.3;
    if(t.priceSegment==='Luxury' && c.id==='black') w*=1.8;
    if(body==='Sports Car' && (c.id==='red'||c.id==='grey')) w*=2.5;
    return w;
  });
  const funnelFor = (s, conv)=>{ const f=Math.sqrt(conv); const r=SRC[s]; return {q:r.q, td:clamp(r.td*f,0,.95), of:r.of, rs:r.rs, sl:clamp(r.sl*f,0,.97)}; };
  const pAvgCache = {};
  const pAvg = conv => pAvgCache[conv] ??= SRC_KEYS.reduce((acc,s)=>{ const f=funnelFor(s,conv); return acc+SRC[s].w*f.q*f.td*f.of*f.rs*f.sl; },0)/SRC_KEYS.reduce((acc,s)=>acc+SRC[s].w,0);
  const VIN_CH = 'ABCDEFGHJKLMNPRSTUVWXYZ0123456789';
  const WMI = {Toyota:'JTM',Lexus:'JTJ',Nissan:'JN1',Hyundai:'KMH',Kia:'KNA',Chevrolet:'1GN',GMC:'1GK',Ford:'1FM',MG:'LSJ',Geely:'L6T',Changan:'LS5',Jetour:'LVV',GAC:'LMG',Haval:'LGW',BYD:'LGX'};
  const vin = brand => (WMI[brand]||'XXX') + Array.from({length:14},()=>VIN_CH[Math.floor(rng()*VIN_CH.length)]).join('');

  function customerSegment(source, t){
    const digital = SRC[source].digital;
    const lux = t.priceSegment==='Premium'||t.priceSegment==='Luxury', family = t.bodyType==='MPV' || (t.bodyType==='SUV' && /largeSUV|boxy/.test(t.asset.studioStyle));
    const fleety = t.bodyType==='Pickup' || t.model==='Hiace' || (t.priceSegment==='Economy' && t.bodyType==='Sedan');
    const w = {Individual:digital?.52:.36, Family:family?.3:.1, Executive:lux?.22:.02, Fleet:fleety&&!digital?.14:fleety?.03:0, Corporate:digital?.03:.09, Government:!digital&&(t.bodyType==='Pickup'||t.bodyType==='SUV')?.05:0};
    return pickW(Object.keys(w), Object.values(w));
  }

  /* ---------- output tables ---------- */
  const customers=[], leads=[], sales=[], vehicles=[], payments=[];
  const spend = {};
  let nC=0, nL=0, nS=0, nV=0, nP=0;
  const id = (p,n,w)=>p+String(n).padStart(w,'0');
  function newCustomer(type, b){
    let name;
    if(type==='Individual'||type==='Family'||type==='Executive') name = personName();
    else if(type==='Government') name = 'جهة حكومية – '+pick(GOV);
    else name = `${pick(CO_A)} ${pick(CO_B)} ${type==='Fleet'?'لتأجير السيارات':pick(CO_C)}`;
    const c = {customerId:id('C-',++nC,6), name, type, city:b.city, region:b.region};
    customers.push(c); return c;
  }
  const HORIZON = TODAY+180;

  function createSale(lead, t, saleDay, cust, sp, branch){
    const d = demo[t.trimId];
    const base = d.dts*branch.dts*(dayWeight(saleDay)<.85?1.1:1);
    // same realistic long tail as current stock: ~8% of units sit 75–220 days before selling
    const dts = Math.round(clamp(rng()<.08 ? 75+rng()*145 : base*.3 + (-Math.log(1-rng()))*base*.75, 2, 280));
    const color = pickW(ref.colors, colorWeights(t)), interior = pickW(ref.interiors,[.62,.3,.08]);
    const options = color.prem + interior.prem;
    const listPrice = t.msrp + options;
    const cost = Math.round(t.msrp*(1-d.baseMargin)*(.992+rng()*.016) + options*.55);
    const campaignOn = lead.campaignId && !lead.campaignId.startsWith('AO-') && lead.campaignId!=='EVT-SHOW';
    let disc = .01 + (dts>60?.012:0) + (dts>90?.018:0) + (dts>120?.02:0)
      + ({Fleet:.035,Corporate:.015,Government:.02,Executive:-.004}[cust.type]||0)
      + (inAny(saleDay,NATIONAL)||campaignOn?.006:0) + (t.year < (dateOf(saleDay).getUTCFullYear()) ? .02 : 0)
      + rng()*.012 - (d.vol>=15?.008:0);
    disc = clamp(disc*sp._disc, 0, .12);
    const sellingPrice = Math.round(listPrice*(1-disc)/100)*100;
    const vehicleId = id('V-',++nV,6), saleId = id('INV-',++nS,6);
    const transfer = rng()<.05 ? pick(BR.filter(x=>x.branchId!==branch.branchId)).branchId : null;
    const method = ({
      Individual:()=>pickW(['Cash','Bank Transfer','Finance','Mixed'],[.2,.15,.52,.13]),
      Family:()=>pickW(['Cash','Bank Transfer','Finance','Mixed'],[.16,.14,.56,.14]),
      Executive:()=>pickW(['Cash','Bank Transfer','Finance','Mixed'],[.25,.3,.35,.1]),
      Corporate:()=>pickW(['Bank Transfer','Finance','Mixed'],[.6,.25,.15]),
      Fleet:()=>pickW(['Bank Transfer','Finance'],[.7,.3]),
      Government:()=>'Bank Transfer'})[cust.type]();
    const lag = 2+Math.floor(rng()*12)+(cust.type==='Government'?18:cust.type==='Fleet'?8:0);
    const delivered = saleDay+lag<=TODAY;
    vehicles.push({vehicleId, vin:vin(t.brand), trimId:t.trimId, distributorId:t.distributorId, exteriorColor:color.id, interiorColor:interior.id, branchId:branch.branchId,
      arrivalDate:iso(saleDay-dts), purchaseCost:cost, listPrice, status: delivered?'Delivered':'Sold', soldDate:iso(saleDay), saleId,
      reservedLeadId:null, reservationDate:lead.reservationDate, transferFrom:transfer, transferDate: transfer ? iso(saleDay-Math.floor(dts*rng())) : null});
    const s = {saleId, date:iso(saleDay), vehicleId, trimId:t.trimId, leadId:lead.leadId, customerId:cust.customerId,
      salespersonId:sp.salespersonId, branchId:branch.branchId, source:lead.source, campaignId:lead.campaignId, customerType:cust.type,
      msrp:t.msrp, optionsPrice:options, listPrice, sellingPrice, discount:listPrice-sellingPrice, cost,
      financeIncome:0, otherIncome: rng()<.7 ? Math.round(sellingPrice*(.005+rng()*.012)) : 0, acquisitionCost:0,
      paymentMethod:method, cashAmount:0, financedAmount:0, downPayment:0, installmentAmount:0, installments:0, financeCharge:0,
      deliveryStatus: delivered?'Delivered':'Scheduled', deliveryDate:iso(saleDay+lag)};
    const pay = (type, seq, due, amount, paidDay)=>payments.push({paymentId:id('P-',++nP,6), saleId, type, seq, dueDate:iso(due), amount,
      paidDate: paidDay!=null && paidDay<=TODAY ? iso(paidDay) : null, paidAmount: paidDay!=null && paidDay<=TODAY ? amount : 0});
    const P = sellingPrice;
    if(method==='Cash'){ s.cashAmount=P; pay('Cash',1,saleDay,P,saleDay); }
    else if(method==='Bank Transfer'){
      s.cashAmount=P;
      const l = cust.type==='Government' ? 20+Math.floor(rng()*170) : cust.type==='Fleet' && rng()<.2 ? 20+Math.floor(rng()*70) : cust.type==='Corporate' && rng()<.1 ? 15+Math.floor(rng()*50) : Math.floor(rng()*5);
      pay('Transfer',1,saleDay+7,P, saleDay+l);
    } else if(method==='Mixed'){
      const cashPart = Math.round(P*(.4+rng()*.3)/100)*100; s.cashAmount=P;
      pay('Cash',1,saleDay,cashPart,saleDay);
      const r=rng(), due=saleDay+30;
      pay('Balance',2,due,P-cashPart, r<.82 ? due-5+Math.floor(rng()*7) : r<.95 ? due+10+Math.floor(rng()*80) : null);
    } else {
      const down = Math.round(P*(.1+rng()*.2)/100)*100, financed = P-down;
      const n = pickW([24,36,48,60],[.15,.3,.3,.25]);
      const charge = Math.round(financed*.042*n/12);            // flat-rate Murabaha-style profit
      const inst = Math.round((financed+charge)/n);
      Object.assign(s,{cashAmount:down, downPayment:down, financedAmount:financed, installments:n, installmentAmount:inst, financeCharge:charge, financeIncome:Math.round(charge*.35)});
      pay('Down Payment',0,saleDay,down,saleDay);
      const r=rng(), cls = r<.85?'good':r<.955?'late':'default', stopAfter = 2+Math.floor(rng()*9);
      for(let k=1;k<=n;k++){
        const due = addMonths(saleDay,k); if(due>HORIZON) break;
        let paid = due-3+Math.floor(rng()*6);
        if(cls==='late' && rng()<.35) paid = due+8+Math.floor(rng()*45);
        if(cls==='default' && k>stopAfter) paid = null;
        pay('Installment',k,due,inst,paid);
      }
    }
    sales.push(s);
    return s;
  }

  const NEXT = {lead:'Qualification call', qualified:'Schedule test drive', testDrive:'Send quote', offer:'Follow up quote', reservation:'Complete paperwork'};
  const LOST = ['Price','Chose competitor','Financing declined','No response','Vehicle unavailable','Postponed'];

  /* ---------- simulate the funnel month by month ---------- */
  MONTHS.forEach(M=>{
    const monthsFromStart = (M.y-2025)*12+M.m;
    const avgW = DW[M.key].sum/(M.end-M.start+1);
    const fullDays = new Date(Date.UTC(M.y,M.m+1,0)).getUTCDate();
    for(const b of BR){
      for(const t of slots){
        const d = demo[t.trimId];
        let exp = d.vol*.36*d.mix*avgW*b.w*affinity(b.branchId,t)*(1+.004*monthsFromStart);
        exp *= Math.pow(GROWTH[t.brand]||1, monthsFromStart/12);
        if(t.powertrain==='Full Electric') exp *= 1+.02*Math.max(0,monthsFromStart);
        if(t.model==='Patrol' && (M.y>2026 || (M.y===2026 && M.m>=3))) exp*=1.25;
        exp *= (M.end-M.start+1)/fullDays;
        const nLeads = Math.floor(exp/pAvg(d.conv) + rng());
        for(let k=0;k<nLeads;k++){
          const day = sampleDay(M);
          const ws = SRC_KEYS.map(s=>SRC[s].w*(activeCampaign(s,day,t.brand)?1.4:1)*((b.branchId==='AHB'||b.branchId==='MED')&&(s==='Walk-in'||s==='WhatsApp')?1.5:1));
          const source = pickW(SRC_KEYS, ws);
          let campaignId = null;
          if(SRC[source].digital){ const c=activeCampaign(source,day,t.brand); campaignId = c && rng()<.75 ? c.campaignId : 'AO-'+source.toUpperCase(); }
          if(source==='Campaign'){ const c=activeCampaign('Campaign',day,t.brand); campaignId = c ? c.campaignId : 'EVT-SHOW'; }
          const cost = SRC[source].cpl*(.8+rng()*.4)*(campaignId && !campaignId.startsWith('AO-') ? 1.25 : 1);
          if(cost){ const key=`${M.key}|${source}|${campaignId||''}`; spend[key]=(spend[key]||0)+cost; }
          const tMY = modelYearFor(t, M);
          const cust = newCustomer(customerSegment(source, tMY), b);
          const sp = pickW(spByBranch[b.branchId], spByBranch[b.branchId].map(x=>x._skill));
          const L = {leadId:id('L-',++nL,6), date:iso(day), source, campaignId, branchId:b.branchId, trimId:tMY.trimId, customerId:cust.customerId,
            salespersonId:sp.salespersonId, qualified:false, qualifiedDate:null, testDriveDate:null, offerDate:null, reservationDate:null,
            saleId:null, status:'Open', nextAction:null, lostReason:null};
          const f = funnelFor(source, d.conv);
          let stage='lead', last=day, stalled=false;
          const step = (p, gap, field, name)=>{
            if(stalled) return false;
            if(rng()>=p){ stalled=true; return false; }
            const dd = last + gap; if(dd>TODAY){ stalled=true; return false; }
            L[field]=iso(dd); last=dd; stage=name; return true;
          };
          if(step(f.q, rng()<.6?0:1, 'qualifiedDate','qualified')) L.qualified=true;
          step(f.td, 1+Math.floor(rng()*7), 'testDriveDate','testDrive');
          step(f.of, 1+Math.floor(rng()*5), 'offerDate','offer');
          step(f.rs, 1+Math.floor(rng()*4), 'reservationDate','reservation');
          if(!stalled && rng()<f.sl*sp._skill){
            const sd = last+2+Math.floor(rng()*9);
            if(sd<=TODAY){ const s = createSale(L, tMY, sd, cust, sp, b); L.saleId=s.saleId; L.status='Won'; stage='sale'; }
          }
          if(L.status!=='Won'){
            if(TODAY-last<=21){ L.status='Open'; L.nextAction=NEXT[stage]; }
            else { L.status='Lost'; L.lostReason=pick(LOST); }
          }
          leads.push(L);
        }
      }
    }
  });

  /* ---------- current stock + in-transit (unsold units today) ---------- */
  const recent = MONTHS.slice(-3);
  const recentW = recent.reduce((s,M)=>s+DW[M.key].sum/(M.end-M.start+1),0)/recent.length;
  const monthsNow = (todayDate.getUTCFullYear()-2025)*12+todayDate.getUTCMonth();
  for(const b of BR) for(const t of slots){
    const d = demo[t.trimId];
    const bias = OVERSTOCK[t.modelKey] ?? 1;
    const monthly = d.vol*.36*d.mix*b.w*affinity(b.branchId,t)*recentW*Math.pow(GROWTH[t.brand]||1, monthsNow/12);
    const cover = d.dts/30*1.25;
    const make = (tt, n, ageScale, minAge, status)=>{
      for(let k=0;k<n;k++){
        const color = pickW(ref.colors, colorWeights(tt)), interior = pickW(ref.interiors,[.62,.3,.08]);
        const options = color.prem+interior.prem;
        let arr;
        if(status==='In Transit') arr = TODAY + 4 + Math.floor(rng()*40);
        else { const age = Math.round(clamp(rng()<.1 ? 75+rng()*150 : minAge + (-Math.log(1-rng()))*ageScale, 1, 330)); arr = TODAY-age; }
        const transfer = status!=='In Transit' && rng()<.05 ? pick(BR.filter(x=>x.branchId!==b.branchId)).branchId : null;
        vehicles.push({vehicleId:id('V-',++nV,6), vin:vin(tt.brand), trimId:tt.trimId, distributorId:tt.distributorId, exteriorColor:color.id, interiorColor:interior.id, branchId:b.branchId,
          arrivalDate:iso(arr), purchaseCost:Math.round(tt.msrp*(1-d.baseMargin)*(.992+rng()*.016)+options*.55), listPrice:tt.msrp+options,
          status, soldDate:null, saleId:null, reservedLeadId:null, reservationDate:null, transferFrom:transfer, transferDate: transfer ? iso(arr+Math.floor((TODAY-arr)*rng())) : null});
      }
    };
    const latest = byModelTrim[t.modelKey+'|'+t.trim][Math.max(...Object.keys(byModelTrim[t.modelKey+'|'+t.trim]).map(Number))];
    make(latest, Math.floor(monthly*cover*bias + rng()), d.dts*Math.max(.7,bias)*.6, 0, 'Available');
    if(bias<.8 || rng()<.25) make(latest, Math.floor(monthly*(bias<.8?.9:.3) + rng()), 0, 0, 'In Transit');
    // previous model-year leftovers for slow movers (only if that year exists for the model)
    const years = Object.keys(byModelTrim[t.modelKey+'|'+t.trim]).map(Number).sort();
    if(bias>1.5 && years.length>1){ const old = byModelTrim[t.modelKey+'|'+t.trim][years[years.length-2]]; make(old, Math.floor(monthly*.5*bias*rng()+rng()*.8), 45, 110, 'Available'); }
  }
  // allocate open reservations to available stock (same model/trim, same branch)
  const pool = {};
  vehicles.forEach(v=>{ if(v.status==='Available'){ const t=ref.trims.find(x=>x.trimId===v.trimId); (pool[v.branchId+'|'+t.modelKey+'|'+t.trim] ??= []).push(v); } });
  const trimById = Object.fromEntries(ref.trims.map(t=>[t.trimId,t]));
  leads.forEach(L=>{
    if(L.status==='Open' && L.reservationDate){
      const t = trimById[L.trimId]; const list = pool[L.branchId+'|'+t.modelKey+'|'+t.trim];
      const v = list && list.find(x=>x.status==='Available');
      if(v){ v.status='Reserved'; v.reservedLeadId=L.leadId; v.reservationDate=L.reservationDate; }
    }
  });

  /* ---------- marketing spend & acquisition-cost allocation ---------- */
  const marketingSpend = Object.entries(spend).map(([k,amount])=>{ const [month,source,campaignId]=k.split('|'); return {month, source, campaignId:campaignId||null, amount:Math.round(amount)}; });
  const spendBySrcMonth = {}, salesBySrcMonth = {};
  marketingSpend.forEach(r=>{ const k=r.month+'|'+r.source; spendBySrcMonth[k]=(spendBySrcMonth[k]||0)+r.amount; });
  const leadById = Object.fromEntries(leads.map(l=>[l.leadId,l]));
  sales.forEach(s=>{ const k=leadById[s.leadId].date.slice(0,7)+'|'+s.source; salesBySrcMonth[k]=(salesBySrcMonth[k]||0)+1; });
  sales.forEach(s=>{ const k=leadById[s.leadId].date.slice(0,7)+'|'+s.source; s.acquisitionCost = Math.round((spendBySrcMonth[k]||0)/salesBySrcMonth[k]); });

  return {
    branches: BR.map(({branchId,name,city,region})=>({branchId,name,city,region})),
    salespeople: salespeople.map(({_skill,_disc,...s})=>s),
    distributors: window.DISTRIBUTORS, brands: window.BRANDS,
    trims, vehicles, customers, leads, sales, payments, marketingSpend,
    campaigns: CAMPAIGNS.map(({_s,_e,...c})=>c),
    meta: {dataClass:'demo', generator:'demo-generator v2.0 (Saudi multi-brand)', seed, today:TODAY_ISO, historyStart:MONTHS[0].key}
  };
};
