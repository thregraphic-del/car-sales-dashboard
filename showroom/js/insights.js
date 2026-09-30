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
      title:`يستحوذ ${modelName(cand.k)} على ${fmt.pct(cand.invShare,0)} من قيمة المخزون، في حين لا تتجاوز حصته من المبيعات ${fmt.pct(cand.saleShare,0)}.`,
      why:'يمثّل ذلك رأس مال مجمَّداً في طراز بطيء الدوران، وتتزايد احتمالات اللجوء إلى الخصومات كلما طالت مدة بقائه في المخزون.',
      metric:`تغطية المخزون: ${cand.dos>=999?'غير محدودة':fmt.days(cand.dos)} · ${fmt.count(cand.stock,NOUN.veh)} · ${fmt.sarC(cand.value)}`,
      drill:{title:`مخزون ${modelName(cand.k)}`, add:modelPatch(cand.k), tab:'stock'}});

    // 2 — top-revenue brand with below-average margin
    if(!f.brand && S.revenue){
      const brands = [...Q.group(sales,s=>s._t.brand)].map(([b,rs])=>({b,...Q.summarize(rs)})).sort((a,b)=>b.revenue-a.revenue).slice(0,3);
      const low = brands.find(x=>x.margin < S.margin-.015 && x.revenue/S.revenue>=.08);
      if(low) out.push({tone:'watch', tag:'ربحية', icon:'percent',
        title:`تُعدّ ${low.b} من أعلى العلامات إيراداً (${fmt.pct(low.revenue/S.revenue,0)} من الإيرادات)، غير أن هامشها البالغ ${fmt.pct(low.margin)} يقل عن المتوسط العام البالغ ${fmt.pct(S.margin)}.`,
        why:'قد يحجب ارتفاع حجم المبيعات ضعفاً في الربحية؛ ومن شأن مراجعة الخصومات وتكلفة الشراء لهذه العلامة رفعُ الربح دون الحاجة إلى زيادة الحجم.',
        metric:`${fmt.count(low.units,NOUN.veh)} · إجمالي الربح ${fmt.sarC(low.gp)} · متوسط الخصم ${fmt.sarC(low.avgDiscount)}`,
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
          title:`يولّد مصدر «${L.source(gem.s)}» عدداً أقل من العملاء، إلا أن معدل تحويله إلى بيع يبلغ ${fmt.pct(gem.conv)} مقابل ${fmt.pct(loud.conv)} لمصدر «${L.source(loud.s)}» الأعلى حجماً.`,
          why:'لا يُعدّ الحجم وحده معياراً للنجاح؛ فالمصادر ذات التحويل المرتفع أقل تكلفةً في الاستحواذ وأجدر بزيادة الاستثمار.',
          metric:`العملاء المحتملون ${fmt.int(gem.leads)} ← المبيعات ${fmt.int(gem.sales)} · الإيرادات ${fmt.sarC(gem.revenue)}${gem.cac?` · تكلفة الاستحواذ ${fmt.sar(gem.cac)}`:''}`,
          drill:{title:L.source(gem.s), add:{source:gem.s}, breakdown:'model'}});
      }
    }

    // 4 — aged stock
    const St = Q.stockSummary(Q.stockAt(f,d),d);
    if(St.aged90>0) out.push({tone:'risk', tag:'مخزون متقادم', icon:'hourglass',
      title:`تجاوز بقاء ${fmt.count(St.aged90,NOUN.veh)} في المخزون 90 يوماً، بقيمة إجمالية قدرها ${fmt.sarC(St.aged90Value)}.`,
      why:'يرفع كل شهر إضافي تكلفة الاحتفاظ بالمخزون ويضغط على الهامش عند البيع؛ لذا تُعدّ هذه المركبات مرشحة لإعادة التسعير أو النقل بين الفروع.',
      metric:`${fmt.pct(St.units?St.aged90/St.units:0,0)} من المخزون · متوسط عمر المخزون: ${fmt.days(St.avgAge)}`,
      drill:{title:'مخزون تجاوز 90 يوماً', tab:'stock', stock:{ageMin:91, label:'أكثر من 90 يوماً'}}});

    // 5 — collections vs receivables direction
    if(P.prev){
      const c1 = Q.payments(f,P,'_paid').reduce((a,p)=>a+p.paidAmount,0), c0 = Q.payments(prevF(f),P.prev,'_paid').reduce((a,p)=>a+p.paidAmount,0);
      const r1 = Q.receivables(f,P.end).overdue, r0 = DB.payments.filter(p=>p._due<P.prev.end && (p._paid==null||p._paid>P.prev.end) && p._s._d<=P.prev.end && Q.saleMatch(p._s,prevF(f))).reduce((a,p)=>a+p.amount,0);
      const dc = change(c1,c0), dr = change(r1,r0);
      if(dc!=null && dr!=null && Math.abs(dc)>=3){
        const good = dc>0 && dr<0;
        out.push({tone:good?'opp':dr>0?'risk':'trend', tag:'تحصيل', icon:'wallet',
          title:`${dc>0?'ارتفع':'انخفض'} النقد المحصَّل بنسبة ${Math.abs(dc).toFixed(0)}% قياساً إلى ${P.prev.label}، ${dr<0?'في حين انخفضت':'كما ارتفعت'} المتأخرات بنسبة ${Math.abs(dr).toFixed(0)}%.`,
          why: good ? 'يسهم تحسّن جودة التحصيل في تقليص الحاجة إلى تمويل رأس المال العامل.' : 'يعني ارتفاع المتأخرات تدفقاً نقدياً أقل من المتوقع؛ مما يستلزم متابعة مباشرة للحسابات المتأخرة.',
          metric:`المحصَّل ${fmt.sarC(c1)} (مقابل ${fmt.sarC(c0)} في الفترة السابقة) · المتأخرات حتى تاريخه ${fmt.sarC(r1)}`,
          drill:{title:'المدفوعات المتأخرة', tab:'payments', pay:{status:'Overdue'}}});
      }
    }

    // 6 — overdue concentrated in one customer type
    const od = DB.payments.filter(p=>p._od && p._s._d<=P.end && Q.saleMatch(p._s,f));
    const odTot = od.reduce((a,p)=>a+p.amount,0);
    if(odTot>0 && !f.custType){
      const byT = [...Q.group(od,p=>p._s.customerType)].map(([k,ps])=>({k, v:ps.reduce((a,p)=>a+p.amount,0), n:new Set(ps.map(p=>p.saleId)).size})).sort((a,b)=>b.v-a.v)[0];
      if(byT && byT.v/odTot>=.4) out.push({tone:'watch', tag:'ذمم', icon:'landmark',
        title:`تعود ${fmt.pct(byT.v/odTot,0)} من المتأخرات إلى شريحة عملاء «${L.custType(byT.k)}».`,
        why:'يعني تركّز المتأخرات في شريحة واحدة أن إجراءً واحداً، كالمتابعة المكثفة أو تعديل شروط السداد، كفيلٌ بمعالجة معظمها.',
        metric:`${fmt.sarC(byT.v)} موزعة على ${fmt.count(byT.n,NOUN.deal)}`,
        drill:{title:`متأخرات ${L.custType(byT.k)}`, add:{custType:byT.k}, tab:'payments', pay:{status:'Overdue'}}});
    }

    // 7 — high demand, thin stock
    const medDem = median(inv.map(x=>x.dem));
    const short = inv.filter(x=>x.dem>=medDem && x.vel>=1 && x.dos<20).sort((a,b)=>b.dem-a.dem)[0];
    if(short) out.push({tone:'opp', tag:'فرصة', icon:'flame',
      title:`يشهد ${modelName(short.k)} طلباً مرتفعاً (${fmt.count(short.dem,['عميل محتمل واحد','عميلان محتملان','عملاء محتملين','عميلاً محتملاً','عميل محتمل'])} شهرياً)، في حين لا يغطي مخزونه سوى ${fmt.days(short.dos)}.`,
      why:'يؤدي نفاد المخزون إلى خسارة مبيعات لعملاء جاهزين للشراء؛ ومن شأن تسريع الطلبيات أو النقل من فروع أخرى حمايةُ الإيرادات.',
      metric:`المخزون: ${fmt.count(short.stock,NOUN.veh)} · سرعة البيع ${short.vel.toFixed(1)} شهرياً · الهامش ${fmt.pct(short.margin)}`,
      drill:{title:`مخزون ${modelName(short.k)}`, add:modelPatch(short.k), tab:'stock'}});

    // 8 — discounting pressure
    if(prev && S.discountPct!=null && prev.discountPct!=null && (S.discountPct-prev.discountPct)*100 >= .4) out.push({tone:'watch', tag:'تسعير', icon:'badge-percent',
      title:`ارتفع متوسط الخصم إلى ${fmt.pct(S.discountPct)} من سعر القائمة، مقابل ${fmt.pct(prev.discountPct)} في ${P.prev.label}.`,
      why:'تُقتطع كل نقطة خصم إضافية من الهامش مباشرةً؛ مما يستدعي تحديد الطرازات والمستشارين المسؤولين عن هذه الزيادة.',
      metric:`إجمالي الخصومات ${fmt.sarC(S.discount)} · بمتوسط ${fmt.sarC(S.avgDiscount)} للمركبة الواحدة`,
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
        title:`نقل ${fmt.count(mv.units.length,NOUN.veh)} من طراز ${modelName(mv.k)} من فرع ${L.branch(mv.from)} إلى فرع ${L.branch(mv.to)}.`,
        why:`تجاوزت مدة بقائها 60 يوماً في فرع ${L.branch(mv.from)}، في حين يرتفع الطلب عليها في فرع ${L.branch(mv.to)} ارتفاعاً واضحاً قياساً بالوحدات المتاحة.`,
        metric:`تحرير رأس مال بقيمة ${fmt.sarC(val)}`,
        drill:{title:`مخزون ${modelName(mv.k)} · ${L.branch(mv.from)}`, add:{...modelPatch(mv.k), branch:mv.from}, tab:'stock', stock:{ageMin:61, label:'أكثر من 60 يوماً'}}}); }

    // 2 — reorder fast movers before they run out
    const inv = modelInventory(f,d), medDem = median(inv.map(x=>x.dem));
    const tr = Q.group(Q.inTransit(f), v=>v._t._modelKey);
    const re = inv.map(x=>({...x, tr:(tr.get(x.k)||[]).length})).map(x=>({...x, need:Math.ceil(x.vel*1.5 - x.stock - x.tr)})).filter(x=>x.dem>=medDem && x.dos<25 && x.vel>=2 && x.need>0).sort((a,b)=>b.vel-a.vel)[0];
    if(re){ const t0=DB.trims.find(t=>t._modelKey===re.k); const price=Q.summarize(Q.sales({...f,...modelPatch(re.k)},W90)).avgPrice||t0.msrp;
      out.push({tone:'action', tag:'إعادة طلب', icon:'package-plus', impact:re.need*price,
        title:`طلب ${fmt.count(re.need,NOUN.veh)} من طراز ${modelName(re.k)} من ${L.dist(t0.distributorId)}.`,
        why:`لا يغطي المخزون الحالي (${fmt.int(re.stock)}) والوحدات قيد الشحن (${fmt.int(re.tr)}) سوى ${fmt.days(re.dos)}، في حين يبلغ معدل البيع ${re.vel.toFixed(1)} مركبة شهرياً، ويفوق الطلب القيمة الوسيطة.`,
        metric:`حماية إيرادات تقديرية بقيمة ${fmt.sarC(re.need*price)}`,
        drill:{title:`مخزون ${modelName(re.k)}`, add:modelPatch(re.k), tab:'stock'}}); }

    // 3 — targeted clearance of 120+ day stock
    const old = units.filter(v=>d-v._arr>120 && v.status==='Available');
    if(old.length){ const val=old.reduce((s,x)=>s+x.purchaseCost,0);
      out.push({tone:'action', tag:'تصفية', icon:'badge-percent', impact:val,
        title:`إطلاق عرض تصفية موجَّه على ${fmt.count(old.length,NOUN.veh)} تجاوزت مدة بقائها في المخزون 120 يوماً.`,
        why:'يرفع كل شهر إضافي تكلفة الاحتفاظ بالمخزون ويزيد الخصم المطلوب لاحقاً؛ أما التصفية المبكرة فتحرر النقد بخصم أقل.',
        metric:`تحرير نقد بقيمة ${fmt.sarC(val)} · تكلفة خصم تقديرية (4%) ≈ ${fmt.sarC(val*.04)}`,
        drill:{title:'مخزون تجاوز 120 يوماً', tab:'stock', stock:{ageMin:121, label:'أكثر من 120 يوماً'}}}); }

    // 4 — shift marketing spend from high-CAC to high-ROAS sources
    if(!f.source){
      const st = sourceStats(f,P).filter(x=>x.spend>0 && x.sales>=3);
      if(st.length>=3){
        const medCac = median(st.map(x=>x.cac)), worst=[...st].sort((a,b)=>b.cac-a.cac)[0], best=[...st].sort((a,b)=>b.roas-a.roas)[0];
        if(worst.cac>=1.6*medCac && best.s!==worst.s){ const shift=worst.spend*.3, extra=shift/best.cac;
          out.push({tone:'action', tag:'تسويق', icon:'megaphone', impact:extra*(best.revenue/Math.max(1,best.sales)),
            title:`تحويل 30% من الإنفاق التسويقي على «${L.source(worst.s)}» إلى «${L.source(best.s)}».`,
            why:`تبلغ تكلفة الاستحواذ في «${L.source(worst.s)}» ${fmt.sar(worst.cac)} لكل عملية بيع، مقابل ${fmt.sar(best.cac)} في «${L.source(best.s)}» الذي يحقق عائداً على الإنفاق قدره ${best.roas.toFixed(1)} ضعفاً.`,
            metric:`مبيعات إضافية تقديرية ≈ ${fmt.count(extra,NOUN.veh)} بالميزانية ذاتها`,
            drill:{title:L.source(worst.s), add:{source:worst.s}, breakdown:'model'}}); }
      }
    }

    // 5 — escalate 90+ day receivables
    const od90 = DB.payments.filter(p=>p._daysOverdue>90 && p._s._d<=P.end && Q.saleMatch(p._s,f));
    if(od90.length){ const v=od90.reduce((s,p)=>s+p.amount,0), n=new Set(od90.map(p=>p.saleId)).size;
      out.push({tone:'action', tag:'تحصيل', icon:'landmark', impact:v,
        title:`تصعيد إجراءات التحصيل على ${fmt.count(n,NOUN.deal)} تجاوز تأخرها 90 يوماً.`,
        why:'تُعدّ الذمم المتأخرة لأكثر من 90 يوماً الأعلى عرضةً لخطر التعثر؛ مما يستوجب متابعتها مباشرةً من الإدارة المالية أو الإدارة القانونية.',
        metric:`استرداد مبالغ متأخرة بقيمة ${fmt.sarC(v)}`,
        drill:{title:'متأخرات أكثر من 90 يوماً', tab:'payments', pay:{status:'Overdue', odMin:91, label:'أكثر من 90 يوماً'}}}); }

    // 6 — discount control
    const fs={...f}; delete fs.salesperson;
    const bySp = [...Q.group(Q.sales(fs,P), s=>s.salespersonId)].map(([k,rs])=>({k, ...Q.summarize(rs)})).filter(x=>x.units>=5);
    const team = bySp.reduce((a,x)=>a+x.discount,0)/Math.max(1,bySp.reduce((a,x)=>a+x.listValue,0));
    const hi = bySp.filter(x=>x.discountPct>team*1.5);
    if(hi.length){ const excess=hi.reduce((a,x)=>a+x.discount-team*x.listValue,0);
      out.push({tone:'action', tag:'ضبط الخصومات', icon:'user-check', impact:excess,
        title:`مراجعة صلاحيات الخصم لدى ${fmt.count(hi.length,NOUN.adv)} يتجاوز متوسط خصمهم متوسط الفريق بنسبة 50%.`,
        why:`يبلغ متوسط خصم الفريق ${fmt.pct(team)} من سعر القائمة، ويُقتطع أي خصم يتجاوزه من هامش الربح مباشرةً.`,
        metric:`خصومات تتجاوز متوسط الفريق بقيمة ${fmt.sarC(excess)}`,
        drill:{title:'الخصومات حسب المستشار', tab:'overview', breakdown:'salesperson'}}); }

    // 7 — close stale reservations
    const stale = Q.leads(f,null).filter(l=>l.status==='Open' && l._rs!=null && l._rs<=T-10);
    if(stale.length) out.push({tone:'action', tag:'حجوزات', icon:'calendar-check', impact:stale.length*avgPrice,
      title:`استكمال ${fmt.count(stale.length,NOUN.res)} ${stale.length===1?'مفتوح':stale.length===2?'مفتوحين':stale.length%100>=3&&stale.length%100<=10?'مفتوحة':'مفتوحاً'} منذ أكثر من 10 أيام.`,
      why:'يحجب الحجز المتأخر المركبة عن البيع ويرفع احتمال خسارة العميل، وغالباً ما يكون بانتظار موافقة التمويل أو استكمال المستندات.',
      metric:`إيرادات معلّقة تقديرية بقيمة ${fmt.sarC(stale.length*avgPrice)}`,
      drill:{title:'حجوزات مفتوحة', tab:'leads', leadStage:'_rs', P:{id:null, label:'جميع الحجوزات المفتوحة', start:T-120, end:T, prev:null}}});

    return out.sort((a,b)=>b.impact-a.impact).slice(0,6);
  },
  render(host){
    const recs = (App.ui.alertMode||'recs')==='recs';
    const list = recs ? Insights.recommendations() : Insights.generate();
    if(!recs) App._insights = list; else App._insights = Insights.generate();
    App._insights = list;
    host.innerHTML = list.length ? list.map((x,i)=>`<li class="ins ${x.tone}" style="animation-delay:${i*60}ms">
      <div class="ic">${ic(x.icon)}</div>
      <div><span class="tag">${x.tag}</span><p class="t">${esc(x.title)}</p><p class="why"><b>${x.tone==='action'?'السبب:':'الأهمية:'}</b> ${esc(x.why)}</p>
      <p class="metric">${ic(x.tone==='action'?'target':'chart-column')}${x.tone==='action'?'<b>الأثر المتوقع:</b> ':''}${esc(x.metric)}</p><button class="link ins-go" data-i="${i}">عرض السجلات ${ic('arrow-left')}</button></div></li>`).join('')
      : `<li class="ins-empty">${recs?'لا توجد توصيات تنفيذية ضمن عوامل التصفية الحالية':'لا توجد مؤشرات تستدعي المتابعة ضمن عوامل التصفية الحالية'} ؛ إذ لا تُعرض أي رؤية ما لم تدعمها البيانات.</li>`;
    host.onclick = e=>{ const b=e.target.closest('.ins-go'); if(b) Drill.slice(JSON.parse(JSON.stringify(list[+b.dataset.i].drill))); };
    icons();
  }
};
