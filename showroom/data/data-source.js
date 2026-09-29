/* =====================================================================
   DATA SOURCE — the only place the dashboard gets data from.
   ---------------------------------------------------------------------
   DEMO MODE (default): generateDemoData(CATALOG_REFERENCE)
   PRODUCTION MODE:     call DataSource.useProductionData(raw) before the
                        app boots (e.g. from an inline <script> produced by
                        your backend, or after fetching your API), where
                        `raw` has the tables defined in DATA_SCHEMA.

   Example (API):
     const raw = await fetch('/api/dealership/export').then(r=>r.json());
     DataSource.useProductionData(raw);   // then App.boot()

   Everything downstream (KPIs, charts, drawers, 3D viewer) reads the
   normalised `DB` object returned by load(): no UI code knows or cares
   whether data is demo or production.
   ===================================================================== */
window.DataSource = (function(){
  let productionRaw = null;
  const EPOCH = Date.UTC(2024,0,1);
  const day = s => { if(!s) return null; const [y,m,d]=s.split('-').map(Number); return Math.round((Date.UTC(y,m-1,d)-EPOCH)/864e5); };
  const isoOf = d => new Date(EPOCH+d*864e5).toISOString().slice(0,10);

  function validate(raw){
    const issues = [];
    for(const [table, def] of Object.entries(DATA_SCHEMA.tables)){
      const rows = raw[table];
      if(!Array.isArray(rows)){ issues.push(`Missing table: ${table}`); continue; }
      let missing = 0;
      for(const r of rows){ for(const f of def.required){ if(r[f]===undefined || r[f]===null || r[f]===''){ missing++; break; } } }
      if(missing) issues.push(`${table}: ${missing} row(s) missing required fields (${def.required.join(', ')})`);
    }
    return issues;
  }

  function normalize(raw, mode){
    const today = raw.meta?.today || new Date().toISOString().slice(0,10);
    const T = day(today);
    const DB = {
      branches: raw.branches, salespeople: raw.salespeople, trims: raw.trims, vehicles: raw.vehicles,
      customers: raw.customers, leads: raw.leads, sales: raw.sales, payments: raw.payments,
      campaigns: raw.campaigns, marketingSpend: raw.marketingSpend,
      colors: raw.colors || CATALOG_REFERENCE.colors, interiors: raw.interiors || CATALOG_REFERENCE.interiors,
      meta: { mode, dataClass: raw.meta?.dataClass || mode, today, todayDay: T, generator: raw.meta?.generator || null,
              validation: validate(raw) },
      idx: {}
    };
    const byId = (rows,key)=>{ const m=new Map(); rows.forEach(r=>m.set(r[key],r)); return m; };
    const I = DB.idx;
    I.branch = byId(DB.branches,'branchId'); I.salesperson = byId(DB.salespeople,'salespersonId');
    I.trim = byId(DB.trims,'trimId'); I.vehicle = byId(DB.vehicles,'vehicleId'); I.customer = byId(DB.customers,'customerId');
    I.lead = byId(DB.leads,'leadId'); I.sale = byId(DB.sales,'saleId'); I.campaign = byId(DB.campaigns,'campaignId');
    I.color = byId(DB.colors,'id'); I.interior = byId(DB.interiors,'id');

    // ---- trims: add model key for hierarchy navigation
    DB.trims.forEach(t=>{ t._modelKey = t.brand+'|'+t.model; });

    // ---- vehicles
    DB.vehicles.forEach(v=>{
      v._t = I.trim.get(v.trimId); v._arr = day(v.arrivalDate); v._sold = day(v.soldDate);
      v._ageToday = v._sold==null ? T - v._arr : null;
    });

    // ---- leads
    DB.leads.forEach(l=>{
      l._t = I.trim.get(l.trimId); l._d = day(l.date);
      l._q = day(l.qualifiedDate); l._td = day(l.testDriveDate); l._of = day(l.offerDate); l._rs = day(l.reservationDate);
      l._cust = I.customer.get(l.customerId);
    });

    // ---- payments grouped by sale
    const paysBySale = new Map();
    DB.payments.forEach(p=>{
      p._due = day(p.dueDate); p._paid = day(p.paidDate);
      p.status = p._paid!=null ? (p._paid > p._due+3 ? 'Paid Late' : 'Paid') : (p._due < T ? 'Overdue' : 'Scheduled');
      p._daysOverdue = p.status==='Overdue' ? T-p._due : 0;
      (paysBySale.get(p.saleId) || paysBySale.set(p.saleId,[]).get(p.saleId)).push(p);
    });
    I.paymentsBySale = paysBySale;

    // ---- sales: joins + derived financials + receivable position (as of today)
    DB.sales.forEach(s=>{
      s._d = day(s.date); s._t = I.trim.get(s.trimId); s._v = I.vehicle.get(s.vehicleId);
      s._cust = I.customer.get(s.customerId); s._lead = I.lead.get(s.leadId);
      s._delivered = day(s.deliveryDate);
      s.grossProfit = s.sellingPrice - s.cost;
      s.margin = s.sellingPrice ? s.grossProfit/s.sellingPrice : 0;
      s.contribution = s.grossProfit + (s.financeIncome||0) + (s.otherIncome||0) - (s.acquisitionCost||0);
      s.daysInInventory = s._v ? s._d - s._v._arr : null;
      const pays = paysBySale.get(s.saleId) || [];
      pays.forEach(p=>p._s=s);
      const contractTotal = s.paymentMethod==='Finance' ? s.downPayment + s.installmentAmount*s.installments : s.sellingPrice;
      const paid = pays.reduce((a,p)=>a+p.paidAmount,0);
      const overdue = pays.filter(p=>p.status==='Overdue');
      s.contractTotal = contractTotal;
      s.collected = paid;
      s.outstanding = Math.max(0, contractTotal - paid);
      s.overdueAmount = overdue.reduce((a,p)=>a+p.amount,0);
      s.maxDaysOverdue = overdue.reduce((a,p)=>Math.max(a,p._daysOverdue),0);
      const next = pays.filter(p=>p.status==='Scheduled').sort((a,b)=>a._due-b._due)[0];
      s.nextDueDate = next ? next.dueDate : null;
      s.collectionStatus = s.outstanding<=0 ? 'Collected' : s.overdueAmount>0 ? 'Overdue' : 'On Schedule';
      if(s.paymentMethod==='Finance'){
        const inst = pays.filter(p=>p.type==='Installment');
        s.installmentsPaid = inst.filter(p=>p._paid!=null).length;
        const missed = inst.filter(p=>p.status==='Overdue').length;
        s.contractStatus = s.outstanding<=0 ? 'Settled' : (s.maxDaysOverdue>60 || missed>=3) ? 'Default' : s.maxDaysOverdue>0 ? 'Late' : 'Current';
      }
    });
    DB.financeContracts = DB.sales.filter(s=>s.paymentMethod==='Finance');

    // ---- marketing spend
    DB.marketingSpend.forEach(r=>{ const [y,m]=r.month.split('-').map(Number); r._d = day(`${y}-${String(m).padStart(2,'0')}-15`); r._start = day(`${r.month}-01`); });

    // ---- helpers exposed to the app
    DB.dayOf = day; DB.isoOf = isoOf;
    DB.vehicleRecord = vehicleId => vehicleRecord(DB, vehicleId);
    DB.meta.counts = Object.fromEntries(Object.keys(DATA_SCHEMA.tables).map(k=>[k, (DB[k]||[]).length]));
    return DB;
  }

  // Flat "one vehicle" record with exactly the management field list (DATA_SCHEMA.vehicleRecordFields)
  function vehicleRecord(DB, vehicleId){
    const v = DB.idx.vehicle.get(vehicleId); if(!v) return null;
    const t = v._t, s = v.saleId ? DB.idx.sale.get(v.saleId) : null;
    const sib = DB.vehicles.filter(x=>x.trimId===v.trimId);
    const soldSib = DB.sales.filter(x=>x.trimId===v.trimId);
    const sp = s && DB.idx.salesperson.get(s.salespersonId);
    const camp = s && s.campaignId && DB.idx.campaign.get(s.campaignId);
    return {
      'Vehicle ID':v.vehicleId, 'VIN':v.vin, 'Brand':t.brand, 'Model':t.model, 'Generation':t.generation, 'Year':t.year, 'Trim':t.trim,
      'Body Type':t.bodyType, 'Segment':t.segment, 'Fuel Type':t.fuelType, 'Engine':t.engine, 'Transmission':t.transmission,
      'Exterior Color':v.exteriorColor, 'Interior Color':v.interiorColor, 'MSRP':t.msrp,
      'Selling Price':s?s.sellingPrice:null, 'Discount':s?s.discount:null, 'Cost':v.purchaseCost,
      'Gross Profit':s?s.grossProfit:null, 'Margin':s?s.margin:null,
      'Stock':sib.filter(x=>x.status==='Available').length, 'Reserved':sib.filter(x=>x.status==='Reserved').length, 'Sold':soldSib.length,
      'Days in Inventory': s ? s.daysInInventory : v._ageToday,
      'Average Days to Sell': soldSib.length ? Math.round(soldSib.reduce((a,x)=>a+x.daysInInventory,0)/soldSib.length) : null,
      'Branch':v.branchId, 'Salesperson':sp?sp.name:null, 'Lead Source':s?s.source:null, 'Campaign':camp?camp.name:null,
      'Customer Type':s?s.customerType:null, 'Payment Method':s?s.paymentMethod:null,
      'Cash Amount':s?s.cashAmount:null, 'Financed Amount':s?s.financedAmount:null, 'Down Payment':s?s.downPayment:null,
      'Installment Amount':s?s.installmentAmount:null, 'Outstanding Amount':s?s.outstanding:null,
      'Collection Status':s?s.collectionStatus:null, 'Delivery Status':s?s.deliveryStatus:null,
      'Image':t.asset.image, '3D Asset':t.asset.model3d, 'Source URL':t.asset.sourceUrl,
      'Asset License / Source Metadata':t.asset.license || t.asset.note
    };
  }

  return {
    useProductionData(raw){ productionRaw = raw; },
    load(){
      if(productionRaw) return normalize(productionRaw, 'production');
      const raw = generateDemoData(CATALOG_REFERENCE);
      return normalize(raw, 'demo');
    }
  };
})();
