/* =====================================================================
   EXECUTIVE INSIGHTS — rule-based, evidence-backed.
   Each rule fires ONLY when the filtered data satisfies its condition.
   Output: {tone, tag, title, why, metric, drill}  (drill → Drill.slice spec)
   ===================================================================== */
const Insights = {
  generate(){
    const P = Periods.get(Store.state.period), f = filtersOf(), out = [];
    const d = Math.min(P.end, DB.meta.todayDay);
    const sales = Q.sales(f,P), S = Q.summarize(sales);
    const prev = P.prev ? Q.summarize(Q.sales(prevF(f),P.prev)) : null;
    if(!S.units && !Q.stockAt(f,d).length) return out;

    // 1 — model holds a large share of inventory value but a small share of sales
    const inv = modelInventory(f,d); const invTot = inv.reduce((a,x)=>a+x.value,0);
    const byModel = Q.group(sales, s=>s._t._modelKey);
    const cand = inv.map(x=>({...x, invShare: invTot? x.value/invTot : 0, saleShare: S.units? (byModel.get(x.k)||[]).length/S.units : 0}))
      .filter(x=>x.invShare>=.05 && x.invShare >= 1.6*x.saleShare).sort((a,b)=>(b.invShare-b.saleShare)-(a.invShare-a.saleShare))[0];
    if(cand) out.push({tone:'risk', tag:'مخزون', icon:'warehouse',
      title:`${modelName(cand.k)} يمثل ${fmt.pct(cand.invShare,0)} من قيمة المخزون لكنه حقق ${fmt.pct(cand.saleShare,0)} فقط من المبيعات.`,
      why:'رأس مال مجمّد في طراز بطيء الدوران، ويرتفع احتمال الحاجة لخصومات كلما طال بقاؤه.',
      metric:`تغطية المخزون ${cand.dos>=999?'غير محدودة':Math.round(cand.dos)+' يوماً'} · ${cand.stock} مركبة · ${fmt.sarC(cand.value)}`,
      drill:{title:`مخزون ${modelName(cand.k)}`, add:modelPatch(cand.k), tab:'stock'}});

    // 2 — top-revenue brand with below-average margin
    if(!f.brand && S.revenue){
      const brands = [...Q.group(sales,s=>s._t.brand)].map(([b,rs])=>({b,...Q.summarize(rs)})).sort((a,b)=>b.revenue-a.revenue).slice(0,3);
      const low = brands.find(x=>x.margin < S.margin-.015 && x.revenue/S.revenue>=.08);
      if(low) out.push({tone:'watch', tag:'ربحية', icon:'percent',
        title:`${low.b} من أعلى العلامات إيراداً (${fmt.pct(low.revenue/S.revenue,0)} من الإيرادات) لكن هامشها ${fmt.pct(low.margin)} أقل من المتوسط ${fmt.pct(S.margin)}.`,
        why:'حجم المبيعات المرتفع قد يخفي ربحية ضعيفة؛ مراجعة الخصومات وتكلفة الشراء لهذه العلامة ترفع الربح دون زيادة الحجم.',
        metric:`${fmt.int(low.units)} مركبة · ربح ${fmt.sarC(low.gp)} · متوسط الخصم ${fmt.sarC(low.avgDiscount)}`,
        drill:{title:low.b, add:{brand:low.b}, breakdown:'model'}});
    }

    // 3 — lead source with fewer leads but much higher conversion
    if(!f.source){
      const st = sourceStats(f,P).filter(x=>x.leads>=30);
      if(st.length>=3){
        const conv = st.reduce((a,x)=>a+x.sales,0)/Math.max(1,st.reduce((a,x)=>a+x.leads,0));
        const medL = median(st.map(x=>x.leads)), loud = [...st].sort((a,b)=>b.leads-a.leads)[0];
        const gem = st.filter(x=>x.leads<medL && x.conv>=1.5*conv && x.sales>=5).sort((a,b)=>b.conv-a.conv)[0];
        if(gem && loud) out.push({tone:'opp', tag:'تسويق', icon:'target',
          title:`«${L.source(gem.s)}» يولّد عملاء أقل لكن تحويله إلى بيع ${fmt.pct(gem.conv)} مقابل ${fmt.pct(loud.conv)} لـ«${L.source(loud.s)}» الأعلى حجماً.`,
          why:'الحجم وحده لا يعني النجاح؛ المصادر عالية التحويل أرخص في تكلفة الاستحواذ وأجدر بزيادة الاستثمار.',
          metric:`${fmt.int(gem.leads)} عميل → ${fmt.int(gem.sales)} مبيعات · إيرادات ${fmt.sarC(gem.revenue)}${gem.cac?` · تكلفة استحواذ ${fmt.sar(gem.cac)}`:''}`,
          drill:{title:L.source(gem.s), add:{source:gem.s}, breakdown:'model'}});
      }
    }

    // 4 — aged stock
    const St = Q.stockSummary(Q.stockAt(f,d),d);
    if(St.aged90>0) out.push({tone:'risk', tag:'مخزون متقادم', icon:'hourglass',
      title:`${fmt.int(St.aged90)} مركبة تجاوزت 90 يوماً في المخزون بقيمة ${fmt.sarC(St.aged90Value)}.`,
      why:'كل شهر إضافي يزيد تكلفة الاحتفاظ ويضغط على الهامش عند البيع؛ هذه المركبات مرشحة لإعادة التسعير أو النقل بين الفروع.',
      metric:`${fmt.pct(St.units?St.aged90/St.units:0,0)} من المخزون · متوسط عمر المخزون ${fmt.days(St.avgAge)}`,
      drill:{title:'مخزون تجاوز 90 يوماً', tab:'stock', stock:{ageMin:91, label:'أكثر من 90 يوماً'}}});

    // 5 — collections vs receivables direction
    if(P.prev){
      const c1 = Q.payments(f,P,'_paid').reduce((a,p)=>a+p.paidAmount,0), c0 = Q.payments(prevF(f),P.prev,'_paid').reduce((a,p)=>a+p.paidAmount,0);
      const r1 = Q.receivables(f,P.end).overdue, r0 = DB.payments.filter(p=>p._due<P.prev.end && (p._paid==null||p._paid>P.prev.end) && p._s._d<=P.prev.end && Q.saleMatch(p._s,prevF(f))).reduce((a,p)=>a+p.amount,0);
      const dc = change(c1,c0), dr = change(r1,r0);
      if(dc!=null && dr!=null && Math.abs(dc)>=3){
        const good = dc>0 && dr<0;
        out.push({tone:good?'opp':dr>0?'risk':'trend', tag:'تحصيل', icon:'wallet',
          title:`النقد المحصّل ${dc>0?'ارتفع':'انخفض'} ${Math.abs(dc).toFixed(0)}% مقارنة بـ${P.prev.label}، ${dr<0?'بينما انخفضت':'وارتفعت'} المتأخرات ${Math.abs(dr).toFixed(0)}%.`,
          why: good ? 'تحسن جودة التحصيل يقلل الحاجة لتمويل رأس المال العامل.' : 'ارتفاع المتأخرات يعني نقداً أقل من المتوقع؛ تحتاج الحسابات المتأخرة لمتابعة مباشرة.',
          metric:`محصّل ${fmt.sarC(c1)} (سابقاً ${fmt.sarC(c0)}) · متأخرات اليوم ${fmt.sarC(r1)}`,
          drill:{title:'المدفوعات المتأخرة', tab:'payments', pay:{status:'Overdue'}}});
      }
    }

    // 6 — overdue concentrated in one customer type
    const od = DB.payments.filter(p=>p._od && p._s._d<=P.end && Q.saleMatch(p._s,f));
    const odTot = od.reduce((a,p)=>a+p.amount,0);
    if(odTot>0 && !f.custType){
      const byT = [...Q.group(od,p=>p._s.customerType)].map(([k,ps])=>({k, v:ps.reduce((a,p)=>a+p.amount,0), n:new Set(ps.map(p=>p.saleId)).size})).sort((a,b)=>b.v-a.v)[0];
      if(byT && byT.v/odTot>=.4) out.push({tone:'watch', tag:'ذمم', icon:'landmark',
        title:`${fmt.pct(byT.v/odTot,0)} من المتأخرات مصدرها عملاء «${L.custType(byT.k)}».`,
        why:'تركز المتأخرات في شريحة واحدة يعني أن إجراءً واحداً (متابعة أو شروط سداد مختلفة) يعالج معظم المشكلة.',
        metric:`${fmt.sarC(byT.v)} لدى ${fmt.int(byT.n)} صفقة`,
        drill:{title:`متأخرات ${L.custType(byT.k)}`, add:{custType:byT.k}, tab:'payments', pay:{status:'Overdue'}}});
    }

    // 7 — high demand, thin stock
    const medDem = median(inv.map(x=>x.dem));
    const short = inv.filter(x=>x.dem>=medDem && x.vel>=1 && x.dos<20).sort((a,b)=>b.dem-a.dem)[0];
    if(short) out.push({tone:'opp', tag:'فرصة', icon:'flame',
      title:`${modelName(short.k)}: طلب مرتفع (${short.dem.toFixed(0)} عميل/شهر) ومخزون يكفي ${Math.round(short.dos)} يوماً فقط.`,
      why:'نفاد المخزون يعني مبيعات ضائعة لعملاء جاهزين؛ تسريع الطلبيات أو النقل من فروع أخرى يحمي الإيرادات.',
      metric:`${short.stock} مركبة بالمخزون · سرعة البيع ${short.vel.toFixed(1)} / شهر · هامش ${fmt.pct(short.margin)}`,
      drill:{title:`مخزون ${modelName(short.k)}`, add:modelPatch(short.k), tab:'stock'}});

    // 8 — discounting pressure
    if(prev && S.discountPct!=null && prev.discountPct!=null && (S.discountPct-prev.discountPct)*100 >= .4) out.push({tone:'watch', tag:'تسعير', icon:'badge-percent',
      title:`متوسط الخصم ارتفع إلى ${fmt.pct(S.discountPct)} من سعر القائمة مقابل ${fmt.pct(prev.discountPct)} في ${P.prev.label}.`,
      why:'كل نقطة خصم إضافية تُقتطع مباشرة من الهامش؛ من المهم معرفة الطرازات والمستشارين المسؤولين عن الزيادة.',
      metric:`إجمالي الخصومات ${fmt.sarC(S.discount)} · متوسط ${fmt.sarC(S.avgDiscount)} للمركبة`,
      drill:{title:'الخصومات حسب الطراز', tab:'overview', breakdown:'model'}});

    const order = {risk:0, watch:1, opp:2, trend:3};
    return out.sort((a,b)=>order[a.tone]-order[b.tone]).slice(0,6);
  },
  /* ---- RECOMMENDATIONS: what management should do next (each with impact + records) ---- */
  recommendations(){
    const P = Periods.get(Store.state.period), f = filtersOf(), T = DB.meta.todayDay, d = Math.min(P.end,T), out = [];
    const W90 = {start:d-89, end:d};
    const avgPrice = Q.summarize(Q.sales(f,P)).avgPrice || 0;

    // 1 — transfer aged units to the branch where the model actually sells
    const units = Q.stockAt(f,d);
    const aged = units.filter(v=>d-v._arr>60 && v.status==='Available');
    const leads90 = Q.group(Q.leads({...f, branch:undefined},W90), l=>l._t._modelKey+'|'+l.branchId);
    const stockBy = Q.group(Q.stockAt({...f, branch:undefined},d), v=>v._t._modelKey+'|'+v.branchId);
    const moves = {};
    aged.forEach(v=>{
      const k=v._t._modelKey, here=(leads90.get(k+'|'+v.branchId)||[]).length/Math.max(1,(stockBy.get(k+'|'+v.branchId)||[]).length);
      let best=null; DB.branches.forEach(b=>{ if(b.branchId===v.branchId) return; const r=(leads90.get(k+'|'+b.branchId)||[]).length/Math.max(1,(stockBy.get(k+'|'+b.branchId)||[]).length); if(r>=Math.max(2*here,3) && (!best||r>best.r)) best={b:b.branchId,r}; });
      if(best){ const key=k+'|'+v.branchId+'|'+best.b; (moves[key] ??= {k, from:v.branchId, to:best.b, units:[]}).units.push(v); }
    });
    const mv = Object.values(moves).sort((a,b)=>b.units.reduce((s,x)=>s+x.purchaseCost,0)-a.units.reduce((s,x)=>s+x.purchaseCost,0))[0];
    if(mv){ const val=mv.units.reduce((s,x)=>s+x.purchaseCost,0);
      out.push({tone:'action', tag:'نقل مخزون', icon:'truck', impact:val,
        title:`انقل ${mv.units.length} مركبة ${modelName(mv.k)} من ${L.branch(mv.from)} إلى ${L.branch(mv.to)}.`,
        why:`تجاوزت 60 يوماً في ${L.branch(mv.from)}، بينما الطلب عليها في ${L.branch(mv.to)} أعلى بوضوح لكل وحدة متاحة.`,
        metric:`رأس مال قابل للتحرير ${fmt.sarC(val)}`,
        drill:{title:`مخزون ${modelName(mv.k)} · ${L.branch(mv.from)}`, add:{...modelPatch(mv.k), branch:mv.from}, tab:'stock', stock:{ageMin:61, label:'أكثر من 60 يوماً'}}}); }

    // 2 — reorder fast movers before they run out
    const inv = modelInventory(f,d), medDem = median(inv.map(x=>x.dem));
    const tr = Q.group(Q.inTransit(f), v=>v._t._modelKey);
    const re = inv.map(x=>({...x, tr:(tr.get(x.k)||[]).length})).map(x=>({...x, need:Math.ceil(x.vel*1.5 - x.stock - x.tr)})).filter(x=>x.dem>=medDem && x.dos<25 && x.vel>=2 && x.need>0).sort((a,b)=>b.vel-a.vel)[0];
    if(re){ const t0=DB.trims.find(t=>t._modelKey===re.k); const price=Q.summarize(Q.sales({...f,...modelPatch(re.k)},W90)).avgPrice||t0.msrp;
      out.push({tone:'action', tag:'إعادة طلب', icon:'package-plus', impact:re.need*price,
        title:`اطلب ${re.need} مركبة ${modelName(re.k)} من ${L.dist(t0.distributorId)}.`,
        why:`المخزون الحالي (${re.stock}) و${re.tr} في الطريق يغطيان ${Math.round(re.dos)} يوماً فقط، بينما يُباع ${re.vel.toFixed(1)} مركبة شهرياً والطلب فوق الوسيط.`,
        metric:`إيرادات محمية تقديرياً ${fmt.sarC(re.need*price)}`,
        drill:{title:`مخزون ${modelName(re.k)}`, add:modelPatch(re.k), tab:'stock'}}); }

    // 3 — targeted clearance of 120+ day stock
    const old = units.filter(v=>d-v._arr>120 && v.status==='Available');
    if(old.length){ const val=old.reduce((s,x)=>s+x.purchaseCost,0);
      out.push({tone:'action', tag:'تصفية', icon:'badge-percent', impact:val,
        title:`أطلق عرض تصفية مستهدفاً على ${old.length} مركبة تجاوزت 120 يوماً.`,
        why:'كل شهر إضافي يرفع تكلفة الاحتفاظ ويزيد الخصم المطلوب لاحقاً؛ التصفية المبكرة تحرر النقد بخصم أقل.',
        metric:`نقد قابل للتحرير ${fmt.sarC(val)} · تكلفة خصم تقديرية 4% ≈ ${fmt.sarC(val*.04)}`,
        drill:{title:'مخزون تجاوز 120 يوماً', tab:'stock', stock:{ageMin:121, label:'أكثر من 120 يوماً'}}}); }

    // 4 — shift marketing spend from high-CAC to high-ROAS sources
    if(!f.source){
      const st = sourceStats(f,P).filter(x=>x.spend>0 && x.sales>=3);
      if(st.length>=3){
        const medCac = median(st.map(x=>x.cac)), worst=[...st].sort((a,b)=>b.cac-a.cac)[0], best=[...st].sort((a,b)=>b.roas-a.roas)[0];
        if(worst.cac>=1.6*medCac && best.s!==worst.s){ const shift=worst.spend*.3, extra=shift/best.cac;
          out.push({tone:'action', tag:'تسويق', icon:'megaphone', impact:extra*(best.revenue/Math.max(1,best.sales)),
            title:`حوّل 30% من إنفاق «${L.source(worst.s)}» إلى «${L.source(best.s)}».`,
            why:`تكلفة الاستحواذ في ${L.source(worst.s)} ${fmt.sar(worst.cac)} لكل بيعة مقابل ${fmt.sar(best.cac)} في ${L.source(best.s)} (عائد ${fmt.x(best.roas)}).`,
            metric:`مبيعات إضافية تقديرية ≈ ${Math.round(extra)} مركبة بنفس الميزانية`,
            drill:{title:L.source(worst.s), add:{source:worst.s}, breakdown:'model'}}); }
      }
    }

    // 5 — escalate 90+ day receivables
    const od90 = DB.payments.filter(p=>p._daysOverdue>90 && p._s._d<=P.end && Q.saleMatch(p._s,f));
    if(od90.length){ const v=od90.reduce((s,p)=>s+p.amount,0), n=new Set(od90.map(p=>p.saleId)).size;
      out.push({tone:'action', tag:'تحصيل', icon:'landmark', impact:v,
        title:`صعّد تحصيل ${n} صفقة متأخرة أكثر من 90 يوماً.`,
        why:'الذمم المتأخرة +90 يوماً هي الأعلى خطراً في التعثر؛ متابعة مباشرة من الإدارة المالية أو الشؤون القانونية.',
        metric:`مبالغ متأخرة +90 يوماً ${fmt.sarC(v)}`,
        drill:{title:'متأخرات أكثر من 90 يوماً', tab:'payments', pay:{status:'Overdue', odMin:91, label:'أكثر من 90 يوماً'}}}); }

    // 6 — discount control
    const fs={...f}; delete fs.salesperson;
    const bySp = [...Q.group(Q.sales(fs,P), s=>s.salespersonId)].map(([k,rs])=>({k, ...Q.summarize(rs)})).filter(x=>x.units>=5);
    const team = bySp.reduce((a,x)=>a+x.discount,0)/Math.max(1,bySp.reduce((a,x)=>a+x.listValue,0));
    const hi = bySp.filter(x=>x.discountPct>team*1.5);
    if(hi.length){ const excess=hi.reduce((a,x)=>a+x.discount-team*x.listValue,0);
      out.push({tone:'action', tag:'ضبط الخصومات', icon:'user-check', impact:excess,
        title:`راجع صلاحيات الخصم لدى ${hi.length} ${hi.length>2?'مستشارين':'مستشار'} يتجاوز خصمهم متوسط الفريق بـ50%.`,
        why:`متوسط خصم الفريق ${fmt.pct(team)} من سعر القائمة؛ الخصم الزائد يُقتطع مباشرة من هامش الربح.`,
        metric:`خصومات زائدة عن متوسط الفريق ${fmt.sarC(excess)}`,
        drill:{title:'الخصومات حسب المستشار', tab:'overview', breakdown:'salesperson'}}); }

    // 7 — close stale reservations
    const stale = Q.leads(f,null).filter(l=>l.status==='Open' && l._rs!=null && l._rs<=T-10);
    if(stale.length) out.push({tone:'action', tag:'حجوزات', icon:'calendar-check', impact:stale.length*avgPrice,
      title:`أكمل ${stale.length} حجزاً مفتوحاً منذ أكثر من 10 أيام.`,
      why:'الحجز المتأخر يحتجز مركبة عن البيع ويرفع احتمال خسارة العميل؛ غالباً ينتظر موافقة تمويل أو مستندات.',
      metric:`إيرادات معلّقة تقديرياً ${fmt.sarC(stale.length*avgPrice)}`,
      drill:{title:'حجوزات مفتوحة', tab:'leads', leadStage:'_rs', P:{id:null, label:'كل الحجوزات المفتوحة', start:T-120, end:T, prev:null}}});

    return out.sort((a,b)=>b.impact-a.impact).slice(0,6);
  },
  render(host){
    const recs = (App.ui.alertMode||'recs')==='recs';
    const list = recs ? Insights.recommendations() : Insights.generate();
    if(!recs) App._insights = list; else App._insights = Insights.generate();
    App._insights = list;
    host.innerHTML = list.length ? list.map((x,i)=>`<li class="ins ${x.tone}" style="animation-delay:${i*60}ms">
      <div class="ic">${ic(x.icon)}</div>
      <div><span class="tag">${x.tag}</span><p class="t">${esc(x.title)}</p><p class="why"><b>${x.tone==='action'?'السبب:':'لماذا يهم؟'}</b> ${esc(x.why)}</p>
      <p class="metric">${ic(x.tone==='action'?'target':'chart-column')}${x.tone==='action'?'<b>الأثر المتوقع:</b> ':''}${esc(x.metric)}</p><button class="link ins-go" data-i="${i}">عرض السجلات ${ic('arrow-left')}</button></div></li>`).join('')
      : `<li class="ins-empty">${recs?'لا توجد توصيات تنفيذية ضمن الفلاتر الحالية':'لا توجد إشارات تستدعي الانتباه ضمن الفلاتر الحالية'} — لا تُعرض رؤى دون دليل من البيانات.</li>`;
    host.onclick = e=>{ const b=e.target.closest('.ins-go'); if(b) Drill.slice(JSON.parse(JSON.stringify(list[+b.dataset.i].drill))); };
    icons();
  }
};
