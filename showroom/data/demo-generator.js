/* =====================================================================
   DEMO DATA GENERATOR  (dataClass: 'demo')
   ---------------------------------------------------------------------
   Produces a coherent, deterministic, record-level dataset that follows
   DATA_SCHEMA exactly: leads → test drives → offers → reservations →
   sales → deliveries → payment schedules, plus vehicles (VIN level),
   customers, salespeople, campaigns and marketing spend.

   Nothing here is real. It exists so the dashboard can be built and
   tested against the exact structure production data will have.
   Swap it out via DataSource (data/data-source.js).
   ===================================================================== */
window.generateDemoData = function generateDemoData(ref, opts = {}){
  const TODAY_ISO = opts.today || '2026-09-29';
  const START = {y:2024, m:10};          // lead history starts two months before reporting (Jan 2025) so the pipeline is warm
  const seed = opts.seed || 20260929;

  /* ---------- deterministic RNG & helpers ---------- */
  let a = seed;
  const rng = ()=>{ a|=0; a=a+0x6D2B79F5|0; let t=Math.imul(a^a>>>15,1|a); t=t+Math.imul(t^t>>>7,61|t)^t; return((t^t>>>14)>>>0)/4294967296; };
  const pick = arr => arr[Math.floor(rng()*arr.length)];
  const pickW = (items, weights)=>{ const tot=weights.reduce((s,x)=>s+x,0); let r=rng()*tot; for(let i=0;i<items.length;i++){ r-=weights[i]; if(r<=0) return items[i]; } return items[items.length-1]; };
  const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
  const EPOCH = Date.UTC(2024,0,1);
  const dayOf = iso => { const [y,m,d]=iso.split('-').map(Number); return Math.round((Date.UTC(y,m-1,d)-EPOCH)/864e5); };
  const iso = day => new Date(EPOCH+day*864e5).toISOString().slice(0,10);
  const addMonths = (day,k)=>{ const d=new Date(EPOCH+day*864e5); return Math.round((Date.UTC(d.getUTCFullYear(), d.getUTCMonth()+k, Math.min(d.getUTCDate(),28))-EPOCH)/864e5); };
  const TODAY = dayOf(TODAY_ISO);
  const todayDate = new Date(EPOCH+TODAY*864e5);
  const MONTHS = [];
  for(let y=START.y, m=START.m;;){
    const start = Math.round((Date.UTC(y,m,1)-EPOCH)/864e5);
    const end = Math.min(TODAY, Math.round((Date.UTC(y,m+1,1)-EPOCH)/864e5)-1);
    MONTHS.push({y, m, start, end, key:`${y}-${String(m+1).padStart(2,'0')}`});
    if(y===todayDate.getUTCFullYear() && m===todayDate.getUTCMonth()) break;
    if(++m>11){ m=0; y++; }
  }

  /* ---------- reference dimensions ---------- */
  const BR = [
    {branchId:'RUH', name:'Riyadh', city:'Riyadh', w:.34, dts:.95, sp:7},
    {branchId:'JED', name:'Jeddah', city:'Jeddah', w:.26, dts:1.0, sp:6},
    {branchId:'DMM', name:'Dammam', city:'Dammam', w:.15, dts:1.05, sp:4},
    {branchId:'KBR', name:'Khobar', city:'Khobar', w:.13, dts:1.03, sp:4},
    {branchId:'AHB', name:'Abha',   city:'Abha',   w:.12, dts:1.14, sp:3}
  ];
  const SEASON = [.95,.9,.86,1.1,1.02,.95,.86,.9,1.08,1.04,1.1,1.2]; // Ramadan dip, Eid lift, summer, National Day, year-end
  // lead source economics: w = lead share, q/td/of/rs/sl = stage pass rates, cpl = cost per lead (SAR, typical KSA automotive paid media)
  const SRC = {
    'Website':    {w:.14,q:.62,td:.50,of:.66,rs:.60,sl:.88,cpl:300, digital:true},
    'Google':     {w:.13,q:.56,td:.45,of:.62,rs:.56,sl:.87,cpl:450, digital:true},
    'Instagram':  {w:.15,q:.40,td:.36,of:.56,rs:.52,sl:.84,cpl:260, digital:true},
    'TikTok':     {w:.10,q:.26,td:.26,of:.48,rs:.45,sl:.80,cpl:150, digital:true},
    'Snapchat':   {w:.12,q:.34,td:.32,of:.54,rs:.50,sl:.82,cpl:190, digital:true},
    'WhatsApp':   {w:.09,q:.66,td:.52,of:.66,rs:.60,sl:.88,cpl:70, digital:true},
    'Facebook':   {w:.04,q:.30,td:.30,of:.52,rs:.48,sl:.82,cpl:280, digital:true},
    'Marketplace':{w:.07,q:.55,td:.46,of:.62,rs:.56,sl:.86,cpl:520,digital:true},
    'Walk-in':    {w:.06,q:.92,td:.78,of:.74,rs:.64,sl:.92,cpl:0},
    'Phone':      {w:.04,q:.72,td:.55,of:.66,rs:.58,sl:.88,cpl:0},
    'Referral':   {w:.04,q:.88,td:.70,of:.74,rs:.66,sl:.92,cpl:0},
    'Campaign':   {w:.02,q:.60,td:.50,of:.60,rs:.55,sl:.86,cpl:900},
    'Other':      {w:.02,q:.42,td:.34,of:.54,rs:.50,sl:.84,cpl:0}
  };
  const SRC_KEYS = Object.keys(SRC);
  const CAMPAIGNS = [
    {campaignId:'CMP-RMD25', name:'Ramadan 2025', sources:['Instagram','Snapchat','TikTok','Google'], start:'2025-02-25', end:'2025-03-30', alwaysOn:false},
    {campaignId:'CMP-ND25',  name:'Saudi National Day 2025', sources:['Instagram','Snapchat','TikTok','Website'], start:'2025-09-10', end:'2025-09-30', alwaysOn:false},
    {campaignId:'CMP-EOY25', name:'Year-End Offers 2025', sources:['Google','Instagram','Facebook','Marketplace'], start:'2025-11-20', end:'2025-12-31', alwaysOn:false},
    {campaignId:'CMP-RMD26', name:'Ramadan 2026', sources:['Instagram','Snapchat','TikTok','Google'], start:'2026-02-10', end:'2026-03-20', alwaysOn:false},
    {campaignId:'CMP-PTR26', name:'All-new Patrol Launch', sources:['Snapchat','TikTok','Instagram','Campaign'], start:'2026-04-05', end:'2026-05-31', alwaysOn:false, brand:'Nissan'},
    {campaignId:'CMP-SUM26', name:'Summer Offers 2026', sources:['Google','Website','Marketplace'], start:'2026-07-01', end:'2026-08-31', alwaysOn:false},
    {campaignId:'CMP-ND26',  name:'Saudi National Day 2026', sources:['Instagram','Snapchat','TikTok','Website','Campaign'], start:'2026-09-08', end:'2026-09-30', alwaysOn:false},
    {campaignId:'EVT-SHOW',  name:'Showroom Events', sources:['Campaign'], start:'2025-01-01', end:'2026-12-31', alwaysOn:true}
  ];
  SRC_KEYS.filter(s=>SRC[s].digital).forEach(s=>CAMPAIGNS.push({campaignId:'AO-'+s.toUpperCase(), name:`${s} Always-on`, sources:[s], start:'2025-01-01', end:'2026-12-31', alwaysOn:true}));
  CAMPAIGNS.forEach(c=>{ c._s=dayOf(c.start); c._e=dayOf(c.end); });
  const activeCampaign = (source, day, brand)=>CAMPAIGNS.find(c=>!c.alwaysOn && c.sources.includes(source) && day>=c._s && day<=c._e && (!c.brand||c.brand===brand));

  const MALE = ['محمد','عبدالله','فهد','خالد','سعود','فيصل','عبدالرحمن','سلطان','ناصر','تركي','ماجد','بندر','يزيد','راكان','عمر','أحمد','سلمان','مشعل','نواف','زياد'];
  const FEMALE = ['نورة','سارة','ريم','لمى','هيفاء','الجوهرة','شهد','دانة','رهف','منيرة'];
  const FAMILY = ['العتيبي','القحطاني','الشهري','الغامدي','الدوسري','الحربي','الزهراني','المطيري','الشمري','العنزي','السبيعي','العمري','الأحمدي','البقمي','الأسمري','الخالدي','التميمي','الرشيدي','الجهني','السهلي'];
  const CO_A = ['شركة','مؤسسة','مجموعة'], CO_B = ['الأفق','الرواسي','النخبة','سدير','المدار','الوفاء','الريادة','البيان','الأصالة','المستقبل','الصفوة','الجزيرة'], CO_C = ['للتجارة','القابضة','للمقاولات','للاستثمار','للخدمات اللوجستية'];
  const GOV = ['إدارة الخدمات المساندة','إدارة النقل','إدارة المشاريع','إدارة المرافق'];
  const personName = ()=> (rng()<.82?pick(MALE):pick(FEMALE))+' '+pick(FAMILY);

  /* ---------- salespeople ---------- */
  const salespeople = [];
  BR.forEach(b=>{ for(let i=0;i<b.sp;i++) salespeople.push({salespersonId:`SP-${b.branchId}-${i+1}`, name:personName(), branchId:b.branchId, _skill:.82+rng()*.36}); });
  const spByBranch = Object.fromEntries(BR.map(b=>[b.branchId, salespeople.filter(s=>s.branchId===b.branchId)]));

  /* ---------- catalog-derived demand model ---------- */
  const trims = ref.trims.map(t=>{ const {_demo, ...rest} = t; return rest; });
  const demo = Object.fromEntries(ref.trims.map(t=>[t.trimId, t._demo]));
  const trimsByKey = {};   // modelKey|trim -> {2025: trim, 2026: trim}
  ref.trims.forEach(t=>{ (trimsByKey[t.modelKey+'|'+t.trim] ??= {})[t.year] = t; });
  const interestTrims = ref.trims.filter(t=>t.year===2026);  // leads express interest by model+trim
  const OVERSTOCK = {'audi-q8':2.2,'mercedes-benz-eqs':2.4,'bmw-i7':2.2,'genesis-g90':2.5,'range-rover-velar':1.9,'audi-e-tron-gt':2.0,'cadillac-escalade':1.8,'lexus-ls':1.7,
                     'toyota-land-cruiser':.35,'nissan-patrol':.45,'porsche-911':.5,'defender-defender-110':.6,'mercedes-benz-g-class':.7};
  function affinity(b, t){
    let x=1; const br=t.brand, mk=t.modelKey;
    if(b==='RUH'){ if(br==='Range Rover'||mk==='mercedes-benz-g-class'||br==='Cadillac') x=1.2; }
    if(b==='JED'){ if(br==='Porsche'||br==='Lexus') x=1.2; }
    if(b==='DMM'||b==='KBR'){ if(mk==='nissan-patrol'||mk==='lexus-lx'||mk==='bmw-x7') x=1.2; if(/Electric/.test(t.fuelType)) x=.8; }
    if(b==='AHB'){ if(mk==='toyota-land-cruiser'||mk==='nissan-patrol'||br==='Defender') x=1.5; if(t.bodyType==='Coupe'||/Electric/.test(t.fuelType)||mk==='audi-rs-6-avant') x=.4; }
    return x;
  }
  const colorWeights = t => ref.colors.map(c=>{
    let w=c.w;
    if(t.brand==='Defender' && c.id==='green') w*=3;
    if((t.brand==='Toyota'||t.brand==='Nissan'||t.brand==='Lexus') && (c.id==='white'||c.id==='sand')) w*=1.5;
    if(t.modelKey==='porsche-911' && c.id==='silver') w*=1.8;
    if(t.modelKey==='mercedes-benz-g-class' && c.id==='black') w*=1.4;
    return w;
  });
  const funnelFor = (s, conv)=>{ const f=Math.sqrt(conv); const r=SRC[s]; return {q:r.q, td:clamp(r.td*f,0,.95), of:r.of, rs:r.rs, sl:clamp(r.sl*f,0,.97)}; };
  const pFull = (s,conv)=>{ const f=funnelFor(s,conv); return f.q*f.td*f.of*f.rs*f.sl; };
  const pAvgCache = {};
  const pAvg = conv => pAvgCache[conv] ??= SRC_KEYS.reduce((acc,s)=>acc+SRC[s].w*pFull(s,conv),0)/SRC_KEYS.reduce((acc,s)=>acc+SRC[s].w,0);
  const VIN_CH = 'ABCDEFGHJKLMNPRSTUVWXYZ0123456789';
  const vin = wmi => wmi + 'Z' + Array.from({length:13},()=>VIN_CH[Math.floor(rng()*VIN_CH.length)]).join('');

  /* ---------- output tables ---------- */
  const customers=[], leads=[], sales=[], vehicles=[], payments=[];
  const spend = {}; // key month|source|campaign -> amount
  let nC=0, nL=0, nS=0, nV=0, nP=0;
  const id = (p,n,w)=>p+String(n).padStart(w,'0');

  function newCustomer(source, city){
    const digital = SRC[source].digital;
    const type = digital ? pickW(['Individual','Corporate','Fleet'],[.9,.08,.02]) : pickW(['Individual','Corporate','Fleet','Government'],[.6,.2,.1,.1]);
    let name;
    if(type==='Individual') name = personName();
    else if(type==='Government') name = 'جهة حكومية – '+pick(GOV);
    else name = `${pick(CO_A)} ${pick(CO_B)} ${type==='Fleet'?'لتأجير السيارات':pick(CO_C)}`;
    const c = {customerId:id('C-',++nC,6), name, type, city};
    customers.push(c); return c;
  }

  function createSale(lead, t, saleDay, cust, sp, branch){
    const d = demo[t.trimId];
    // vehicle unit sold
    const base = d.dts*branch.dts*(SEASON[new Date(EPOCH+saleDay*864e5).getUTCMonth()]<.92?1.1:1);
    const dts = Math.round(clamp(base*.3 + (-Math.log(1-rng()))*base*.75, 3, 260));
    const color = pickW(ref.colors, colorWeights(t));
    const interior = pickW(ref.interiors,[.55,.3,.15]);
    const options = color.prem + interior.prem;
    const listPrice = t.msrp + options;
    const cost = Math.round(t.msrp*(1-d.baseMargin)*(.99+rng()*.02) + options*.5);
    const campaignOn = lead.campaignId && !lead.campaignId.startsWith('AO-') && lead.campaignId!=='EVT-SHOW';
    let disc = .012 + (dts>60?.015:0) + (dts>90?.02:0) + (dts>120?.02:0)
      + ({Fleet:.03,Corporate:.01,Government:.015}[cust.type]||0)
      + (SEASON[new Date(EPOCH+saleDay*864e5).getUTCMonth()]<.92?.01:0) + (campaignOn?.006:0)
      + rng()*.015 - (d.vol>=19?.009:0) + (1-sp._skill)*.02;
    disc = clamp(disc, 0, .12);
    const sellingPrice = Math.round(listPrice*(1-disc)/100)*100;
    const vehicleId = id('V-',++nV,6);
    const saleId = id('S-',++nS,5);
    vehicles.push({vehicleId, vin:vin(d.wmi), trimId:t.trimId, exteriorColor:color.id, interiorColor:interior.id, branchId:branch.branchId,
      arrivalDate:iso(saleDay-dts), purchaseCost:cost, listPrice, status:'Sold', soldDate:iso(saleDay), saleId, reservedLeadId:null});

    // payment structure
    const method = ({
      Individual:()=>pickW(['Cash','Bank Transfer','Finance','Mixed'],[.22,.2,.45,.13]),
      Corporate:()=>pickW(['Bank Transfer','Finance','Mixed'],[.55,.25,.2]),
      Fleet:()=>pickW(['Bank Transfer','Finance'],[.7,.3]),
      Government:()=>'Bank Transfer'})[cust.type]();
    const s = {saleId, date:iso(saleDay), vehicleId, trimId:t.trimId, leadId:lead.leadId, customerId:cust.customerId,
      salespersonId:sp.salespersonId, branchId:branch.branchId, source:lead.source, campaignId:lead.campaignId, customerType:cust.type,
      msrp:t.msrp, optionsPrice:options, listPrice, sellingPrice, discount:listPrice-sellingPrice, cost,
      financeIncome:0, otherIncome: rng()<.65 ? Math.round(sellingPrice*(.004+rng()*.008)) : 0, acquisitionCost:0,
      paymentMethod:method, cashAmount:0, financedAmount:0, downPayment:0, installmentAmount:0, installments:0, financeCharge:0,
      deliveryStatus:null, deliveryDate:null};
    const pay = (type, seq, due, amount, paidDay)=>payments.push({paymentId:id('P-',++nP,6), saleId, type, seq, dueDate:iso(due), amount,
      paidDate: paidDay!=null && paidDay<=TODAY ? iso(paidDay) : null, paidAmount: paidDay!=null && paidDay<=TODAY ? amount : 0});
    const P = sellingPrice;
    if(method==='Cash'){ s.cashAmount=P; pay('Cash',1,saleDay,P,saleDay); }
    else if(method==='Bank Transfer'){
      s.cashAmount=P;
      let lag = cust.type==='Government' ? 25+Math.floor(rng()*150) : cust.type==='Fleet' && rng()<.18 ? 20+Math.floor(rng()*60) : Math.floor(rng()*5);
      pay('Transfer',1,saleDay+7,P, saleDay+lag);
    } else if(method==='Mixed'){
      const cashPart = Math.round(P*(.4+rng()*.3)/100)*100; s.cashAmount=P;
      pay('Cash',1,saleDay,cashPart,saleDay);
      const r=rng(); const due=saleDay+30;
      pay('Balance',2,due,P-cashPart, r<.82 ? due-5+Math.floor(rng()*7) : r<.95 ? due+10+Math.floor(rng()*65) : null);
    } else {
      const down = Math.round(P*(.1+rng()*.2)/100)*100, financed = P-down;
      const n = pickW([24,36,48,60],[.2,.35,.25,.2]);
      const charge = Math.round(financed*.039*n/12);
      const inst = Math.round((financed+charge)/n);
      Object.assign(s,{cashAmount:down, downPayment:down, financedAmount:financed, installments:n, installmentAmount:inst, financeCharge:charge, financeIncome:charge});
      pay('Down Payment',0,saleDay,down,saleDay);
      const r=rng(); const cls = r<.84?'good':r<.95?'late':'default'; const stopAfter = 2+Math.floor(rng()*8);
      for(let k=1;k<=n;k++){
        const due = addMonths(saleDay,k); if(due>TODAY+365) break;
        let paid = due-3+Math.floor(rng()*6);
        if(cls==='late' && rng()<.35) paid = due+8+Math.floor(rng()*42);
        if(cls==='default' && k>stopAfter) paid = null;
        pay('Installment',k,due,inst,paid);
      }
    }
    const lag = 3+Math.floor(rng()*14)+(cust.type==='Government'?20:0);
    s.deliveryDate = iso(saleDay+lag); s.deliveryStatus = saleDay+lag<=TODAY ? 'Delivered' : 'Scheduled';
    sales.push(s);
    return s;
  }

  const NEXT = {lead:'Qualification call', qualified:'Schedule test drive', testDrive:'Send offer', offer:'Follow up offer', reservation:'Complete paperwork'};
  const LOST = ['Price','Chose competitor','Financing declined','No response','Vehicle unavailable','Postponed'];

  /* ---------- simulate the funnel month by month ---------- */
  MONTHS.forEach((M, mi)=>{
    const growth = M.y===2026 ? 1.06+.004*M.m : 1;
    const days = M.end-M.start+1;
    for(const b of BR){
      for(const t of interestTrims){
        const d = demo[t.trimId];
        let exp = d.vol*.8*d.mix*SEASON[M.m]*growth*b.w*affinity(b.branchId,t);
        if(/Electric/.test(t.fuelType) && M.y===2026) exp*=1.25;
        if(t.modelKey==='nissan-patrol' && (M.y>2026 || (M.y===2026 && M.m>=3))) exp*=1.3;
        exp *= days/new Date(Date.UTC(M.y,M.m+1,0)).getUTCDate();
        const nLeads = Math.floor(exp/pAvg(d.conv) + rng());
        for(let k=0;k<nLeads;k++){
          const day = M.start + Math.floor(rng()*days);
          // campaign-active sources receive extra weight
          const ws = SRC_KEYS.map(s=>SRC[s].w*(activeCampaign(s,day,t.brand)?1.4:1)*(b.branchId==='AHB'&&(s==='Walk-in'||s==='WhatsApp')?1.6:1));
          const source = pickW(SRC_KEYS, ws);
          let campaignId = null;
          if(SRC[source].digital){ const c=activeCampaign(source,day,t.brand); campaignId = c && rng()<.75 ? c.campaignId : 'AO-'+source.toUpperCase(); }
          if(source==='Campaign'){ const c=activeCampaign('Campaign',day,t.brand); campaignId = c ? c.campaignId : 'EVT-SHOW'; }
          const cost = SRC[source].cpl*(.8+rng()*.4)*(campaignId && !campaignId.startsWith('AO-') ? 1.25 : 1);
          if(cost){ const key=`${M.key}|${source}|${campaignId||''}`; spend[key]=(spend[key]||0)+cost; }
          const cust = newCustomer(source, b.city);
          const sp = pickW(spByBranch[b.branchId], spByBranch[b.branchId].map(x=>x._skill));
          // model year of the vehicle of interest
          const p26 = M.y===2026 ? .88 : M.m>=6 ? (M.m-5)/8 : 0;
          const tMY = trimsByKey[t.modelKey+'|'+t.trim][rng()<p26?2026:2025];
          const L = {leadId:id('L-',++nL,6), date:iso(day), source, campaignId, branchId:b.branchId, trimId:tMY.trimId, customerId:cust.customerId,
            salespersonId:sp.salespersonId, qualified:false, qualifiedDate:null, testDriveDate:null, offerDate:null, reservationDate:null,
            saleId:null, status:'Open', nextAction:null, lostReason:null};
          const f = funnelFor(source, d.conv);
          let stage='lead', last=day, stalled=false;
          const step = (p, gap, field, name)=>{
            if(stalled) return false;
            if(rng()>=p){ stalled=true; return false; }
            const dd = last + gap;
            if(dd>TODAY){ stalled=true; return false; }
            L[field]=iso(dd); last=dd; stage=name; return true;
          };
          if(step(f.q, rng()<.6?0:1, 'qualifiedDate','qualified')) L.qualified=true;
          step(f.td, 1+Math.floor(rng()*8), 'testDriveDate','testDrive');
          step(f.of, 1+Math.floor(rng()*6), 'offerDate','offer');
          step(f.rs, 1+Math.floor(rng()*5), 'reservationDate','reservation');
          if(!stalled && rng()<f.sl*sp._skill){
            const sd = last+2+Math.floor(rng()*10);
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

  /* ---------- current stock (unsold units on hand today) ---------- */
  const recent = MONTHS.slice(-3);
  for(const b of BR) for(const t of interestTrims){
    const d = demo[t.trimId];
    const bias = OVERSTOCK[t.modelKey] ?? 1;
    const monthly = d.vol*.8*d.mix*b.w*affinity(b.branchId,t)*recent.reduce((s,M)=>s+SEASON[M.m],0)/recent.length*1.08;
    const cover = d.dts/30*1.3;
    const make = (tt, n, ageScale, minAge)=>{
      for(let k=0;k<n;k++){
        const color = pickW(ref.colors, colorWeights(tt)), interior = pickW(ref.interiors,[.55,.3,.15]);
        const options = color.prem+interior.prem;
        // most units turn quickly, but ~10% of every model get stuck (colour/spec mismatch, cancelled deals) — a realistic long tail
        const age = Math.round(clamp(rng()<.1 ? 75+rng()*140 : minAge + (-Math.log(1-rng()))*ageScale, 1, 320));
        vehicles.push({vehicleId:id('V-',++nV,6), vin:vin(d.wmi), trimId:tt.trimId, exteriorColor:color.id, interiorColor:interior.id, branchId:b.branchId,
          arrivalDate:iso(TODAY-age), purchaseCost:Math.round(tt.msrp*(1-d.baseMargin)*(.99+rng()*.02)+options*.5), listPrice:tt.msrp+options,
          status: rng()<.05 ? 'In Service' : 'Available', soldDate:null, saleId:null, reservedLeadId:null});
      }
    };
    make(t, Math.floor(monthly*cover*bias + rng()), d.dts*Math.max(.7,bias)*.62, 0);
    if(bias>1.5){ const old = trimsByKey[t.modelKey+'|'+t.trim][2025]; make(old, Math.floor(monthly*.5*bias*rng()+rng()*.8), 45, 110); }
  }
  // allocate open reservations to stock
  const pool = {};
  vehicles.forEach(v=>{ if(v.status==='Available') (pool[v.branchId+'|'+v.trimId.replace(/-202[56]-/,'-')] ??= []).push(v); });
  leads.forEach(L=>{
    if(L.status==='Open' && L.reservationDate){
      const list = pool[L.branchId+'|'+L.trimId.replace(/-202[56]-/,'-')];
      const v = list && list.find(x=>x.status==='Available');
      if(v){ v.status='Reserved'; v.reservedLeadId=L.leadId; }
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
    branches: BR.map(({branchId,name,city})=>({branchId,name,city})),
    salespeople: salespeople.map(({_skill,...s})=>s),
    trims, vehicles, customers, leads, sales, payments, marketingSpend,
    campaigns: CAMPAIGNS.map(({_s,_e,...c})=>c),
    meta: {dataClass:'demo', generator:'demo-generator v1.0', seed, today:TODAY_ISO, historyStart:MONTHS[0].key}
  };
};
