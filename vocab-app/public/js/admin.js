// The owner's panel (/admin.html): numbers, customers, the team and payouts, prices and contact details.
// It talks to /api/admin/* which only the administrator account can use. Nothing here runs in the background.
const $ = (s, r = document) => r.querySelector(s);
const app = $('#app');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const riyal = (c) => `${(Number(c || 0) / 100).toLocaleString('en', { maximumFractionDigits: 2 })} ريال`;
const usd = (v) => `$${Number(v || 0).toFixed(2)}`;
const date = (iso) => String(iso || '').slice(0, 10);

async function api(method, url, body) {
  const res = await fetch(url, { method, headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || 'صار خطأ.'), { status: res.status });
  return data;
}
function toast(msg) {
  const t = document.createElement('div');
  t.className = 'toast'; t.textContent = msg; document.body.appendChild(t);
  setTimeout(() => t.remove(), 3200);
}

const TABS = [['overview', 'نظرة عامة'], ['users', 'العملاء'], ['team', 'الفريق'], ['payouts', 'طلبات التحويل'], ['settings', 'الإعدادات والأسعار']];
const TASK_AR = { translate: 'ترجمة', summary: 'ملخص', recap: 'سوالف', words: 'كلمات', explain: 'شرح', forms: 'تصريف', synonyms: 'مرادفات', suggest: 'اقتراح', ar2en: 'عربي→إنجليزي' };
let tab = (location.hash || '').replace('#', '') || 'overview';
if (!TABS.some(([k]) => k === tab)) tab = 'overview';
let pendingCount = 0;

function shell(inner) {
  app.innerHTML = `<header class="ad-top"><div class="ad-top-in">
    <div class="ad-brand">3Goal <small>لوحة التحكم</small></div>
    <nav class="ad-tabs" role="tablist">${TABS.map(([k, l]) => `<button class="ad-tab" role="tab" data-tab="${k}" aria-selected="${k === tab}">${l}${k === 'payouts' && pendingCount ? `<span class="n">${pendingCount}</span>` : ''}</button>`).join('')}</nav>
    <a class="ad-back" href="/">← الموقع</a></div></header><main>${inner}</main>`;
  app.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => { tab = b.dataset.tab; location.hash = tab; load(); }));
}

const kpi = (n, label, cls = '') => `<div class="kpi ${cls}"><b class="${/[\u0600-\u06FF]/.test(String(n)) ? '' : 'num'}">${n}</b><span>${label}</span></div>`;

/* ------------------------------------------------------------------ views */
async function overview() {
  const o = await api('GET', '/api/admin/overview');
  pendingCount = o.team.pending_requests;
  const max = Math.max(0.0001, ...o.ai.daily.map((d) => d.cost));
  const cr = o.credits;
  shell(`<h1>نظرة عامة</h1>
    <div class="kpis">
      ${kpi(o.users.total, 'عملاء مسجّلون')}${kpi(o.users.new7, 'جدد آخر ٧ أيام')}${kpi(o.users.guests, 'زوّار (ضيوف)')}
      ${kpi(o.content.sources, 'مقاطع ونصوص مضافة')}${kpi(o.content.saved_words, 'كلمات محفوظة')}
      ${kpi(usd(o.ai.today), 'تكلفة الذكاء الاصطناعي اليوم')}${kpi(usd(o.ai.month), 'تكلفته هذا الشهر')}
      ${cr ? kpi(`${cr.left ?? '—'}`, `رصيد Netlify المتبقي (من ${cr.plan})`) : ''}
    </div>
    <div class="kpis">
      ${kpi(o.team.members, 'أعضاء الفريق')}${kpi(o.team.referrals, 'سجّلوا بأكواد الفريق')}
      ${kpi(o.team.pending_requests, `طلبات تحويل معلّقة (${riyal(o.team.pending_cents)})`, o.team.pending_requests ? 'warn' : '')}${kpi(riyal(o.team.paid_cents), 'محوّل للفريق')}
    </div>
    <div class="cols">
      <section class="card"><h2>تكلفة الذكاء الاصطناعي آخر ١٤ يوم</h2>${o.ai.daily.length ? `<div class="bars">${o.ai.daily.map((d) => `<div class="bar"><span class="num">${d.day.slice(5)}</span><i style="width:${Math.max(2, (d.cost / max) * 100)}%"></i><span class="num">${usd(d.cost)}</span></div>`).join('')}</div>` : '<p class="muted">ما فيه استهلاك.</p>'}</section>
      <section class="card"><h2>هذا الشهر حسب النوع</h2>${o.ai.by_task.length ? `<div class="scroll"><table><tr><th>النوع</th><th>الطلبات</th><th>التكلفة</th></tr>${o.ai.by_task.map((t) => `<tr><td>${esc(TASK_AR[t.task] || t.task)}</td><td class="num">${t.calls}</td><td class="num">${usd(t.cost)}</td></tr>`).join('')}</table></div>` : '<p class="muted">ما فيه استهلاك.</p>'}</section>
    </div>`);
}

async function users() {
  const { users: list } = await api('GET', '/api/admin/users');
  shell(`<h1>العملاء <span class="muted tiny">(${list.length})</span></h1>
    <section class="card scroll"><table><tr><th>الاسم</th><th>المستخدم</th><th>النوع</th><th>انضم</th><th>كلمات</th><th>مقاطع</th><th>ذكاء اصطناعي (الشهر)</th></tr>
    ${list.map((u) => `<tr><td>${esc(u.name)}</td><td class="num">${esc(u.username || '—')}</td><td><span class="chip ${u.role === 'admin' ? 'good' : ''}">${u.role === 'admin' ? 'مسؤول' : u.role === 'guest' ? 'ضيف' : 'عميل'}</span></td><td class="num">${date(u.created_at)}</td><td class="num">${u.words}</td><td class="num">${u.sources}</td><td class="num">${usd(u.ai_month)}</td></tr>`).join('')}
    </table></section>`);
}

async function team() {
  const [{ members }, { settings }] = await Promise.all([api('GET', '/api/admin/team'), api('GET', '/api/admin/settings')]);
  const rule = settings.commission.value ? (settings.commission.mode === 'percent' ? `${settings.commission.value}٪ من اشتراك كل مشترك` : `${settings.commission.value} ريال عن كل مشترك`) : 'لم تُحدَّد العمولة بعد (من «الإعدادات»)';
  shell(`<h1>الفريق <span class="muted tiny">(${members.length})</span></h1>
    <p class="muted tiny" style="margin:0">قاعدة العمولة الحالية: <b>${esc(rule)}</b>. العمولة تُضاف يدويًا هنا لما يشترك أحد بكود العضو (الموقع الحين ما فيه دفع تلقائي). الحد الأدنى للتحويل ${settings.min_payout} ريال.</p>
    ${members.length ? members.map((m) => `<section class="card" data-m="${m.id}">
      <div class="row" style="justify-content:space-between"><div><b>${esc(m.name)}</b> <span class="chip num">${esc(m.code)}</span><div class="tiny muted"><span class="num">${esc(m.email)}</span> · <span class="num">+${esc(m.phone)}</span> · انضم ${date(m.joined)}</div></div>
        <div class="row"><span class="chip">سجّلوا: <b class="num">${m.referrals}</b></span><span class="chip good">إجمالي: ${riyal(m.earned)}</span><span class="chip">محوّل: ${riyal(m.paid)}</span><span class="chip warn">متاح: ${riyal(m.available)}</span>${m.pending ? `<span class="chip bad">معلّق: ${riyal(m.pending)}</span>` : ''}</div></div>
      <div class="row" style="margin-top:12px"><input class="input num" style="max-width:130px" type="number" step="0.01" placeholder="المبلغ بالريال" data-amt><input class="input" style="flex:1;min-width:160px" placeholder="ملاحظة (مثلًا: اشترك فلان)" data-note><button class="btn primary sm" data-credit="${m.id}">إضافة رصيد</button></div></section>`).join('') : '<section class="card muted">ما انضم أحد للفريق بعد. الرابط في الموقع: الإعدادات ← انضم لفريقنا.</section>'}`);
  app.querySelectorAll('[data-credit]').forEach((b) => b.addEventListener('click', async () => {
    const card = b.closest('[data-m]');
    const amount = Number($('[data-amt]', card).value);
    if (!amount) return toast('اكتب المبلغ');
    b.disabled = true;
    try { await api('POST', `/api/admin/team/${b.dataset.credit}/credit`, { amount, note: $('[data-note]', card).value }); toast('تمت الإضافة ✓'); team(); } catch (err) { toast(err.message); b.disabled = false; }
  }));
}

async function payouts() {
  const { payouts: list } = await api('GET', '/api/admin/payouts');
  pendingCount = list.filter((p) => p.status === 'pending').length;
  const ST = { pending: ['بانتظارك', 'warn'], paid: ['تم التحويل', 'good'], rejected: ['مرفوض', 'bad'] };
  shell(`<h1>طلبات التحويل</h1>
    <p class="muted tiny" style="margin:0">لما توافقين: حوّلي المبلغ من حسابك البنكي للعضو (رقمه أدناه)، ثم اضغطي «تم التحويل». يوصله في حسابه شكر ودعوة لمضاعفة جهوده. الموقع ما يحوّل الفلوس بنفسه.</p>
    <section class="card scroll">${list.length ? `<table><tr><th>العضو</th><th>التواصل</th><th>المبلغ</th><th>التاريخ</th><th>الحالة</th><th></th></tr>
    ${list.map((p) => `<tr data-p="${p.id}"><td><b>${esc(p.name)}</b><div class="tiny muted num">${esc(p.code)}</div></td><td class="tiny num">+${esc(p.phone)}<br>${esc(p.email)}</td><td class="num"><b>${riyal(p.amount_cents)}</b></td><td class="num">${date(p.created_at)}</td>
      <td><span class="chip ${ST[p.status]?.[1] || ''}">${ST[p.status]?.[0] || esc(p.status)}</span>${p.note ? `<div class="tiny muted">${esc(p.note)}</div>` : ''}</td>
      <td>${p.status === 'pending' ? `<div class="row"><button class="btn good sm" data-act="paid">تم التحويل ✓</button><button class="btn bad sm" data-act="reject">رفض</button></div>` : ''}</td></tr>`).join('')}</table>` : '<p class="muted">ما فيه طلبات.</p>'}</section>`);
  app.querySelectorAll('[data-act]').forEach((b) => {
    let armed = null;
    b.addEventListener('click', async () => {
      // two taps: the first asks "are you sure"
      if (!armed) { const old = b.textContent; b.textContent = 'أكيد؟'; armed = setTimeout(() => { b.textContent = old; armed = null; }, 3500); return; }
      clearTimeout(armed);
      b.disabled = true;
      try { await api('POST', `/api/admin/payouts/${b.closest('[data-p]').dataset.p}`, { action: b.dataset.act, note: b.dataset.act === 'paid' ? 'حوّلنا لك المبلغ' : '' }); toast(b.dataset.act === 'paid' ? 'تم تسجيل التحويل ✓' : 'تم الرفض'); payouts(); } catch (err) { toast(err.message); b.disabled = false; }
    });
  });
}

async function settings() {
  const { settings: s } = await api('GET', '/api/admin/settings');
  const rows = [...s.pricing, { name: '', price: '', period: '', note: '' }];
  shell(`<h1>الإعدادات والأسعار</h1>
    <div class="cols">
      <section class="card" style="display:grid;gap:12px"><h2>عمولة الفريق</h2>
        <label class="f">طريقة الحساب<select class="input" id="cMode"><option value="fixed" ${s.commission.mode === 'fixed' ? 'selected' : ''}>مبلغ ثابت لكل مشترك (ريال)</option><option value="percent" ${s.commission.mode === 'percent' ? 'selected' : ''}>نسبة من الاشتراك (٪)</option></select></label>
        <label class="f">القيمة<input class="input num" id="cVal" type="number" min="0" step="0.5" value="${s.commission.value}"></label>
        <label class="f">الحد الأدنى لطلب التحويل (ريال)<input class="input num" id="cMin" type="number" min="1" value="${s.min_payout}"></label></section>
      <section class="card" style="display:grid;gap:12px"><h2>بيانات التواصل (تظهر لكل المستخدمين)</h2>
        <label class="f">الإيميل<input class="input num" id="ctMail" type="email" value="${esc(s.contact.email)}" placeholder="name@example.com"></label>
        <label class="f">رقم الواتساب <small>بالصيغة الدولية بدون + (مثل 9665xxxxxxxx)</small><input class="input num" id="ctWa" inputmode="tel" value="${esc(s.contact.whatsapp)}" placeholder="9665xxxxxxxx"></label></section>
    </div>
    <section class="card"><h2>الأسعار (خطط الاشتراك)</h2><p class="muted tiny" style="margin-top:0">للتوثيق والعرض الحين؛ تُستخدم لما يُربط الدفع. اترك الاسم فاضيًا لحذف الصف.</p>
      <div id="prices">${rows.map((p) => `<div class="pr-row"><input class="input" data-k="name" placeholder="اسم الخطة" value="${esc(p.name)}"><input class="input num" data-k="price" type="number" min="0" step="0.5" placeholder="السعر (ريال)" value="${p.price}"><input class="input" data-k="period" placeholder="مثل: شهري" value="${esc(p.period)}"><input class="input" data-k="note" placeholder="ملاحظة" value="${esc(p.note)}"></div>`).join('')}</div>
      <button class="btn sm" id="addRow" type="button">＋ صف</button></section>
    <div><button class="btn primary" id="save">حفظ الإعدادات</button></div>`);
  $('#addRow').addEventListener('click', () => { $('#prices').insertAdjacentHTML('beforeend', '<div class="pr-row"><input class="input" data-k="name" placeholder="اسم الخطة"><input class="input num" data-k="price" type="number" min="0" step="0.5" placeholder="السعر (ريال)"><input class="input" data-k="period" placeholder="مثل: شهري"><input class="input" data-k="note" placeholder="ملاحظة"></div>'); });
  $('#save').addEventListener('click', async (e) => {
    const pricing = [...app.querySelectorAll('.pr-row')].map((r) => Object.fromEntries([...r.querySelectorAll('[data-k]')].map((i) => [i.dataset.k, i.value]))).filter((p) => p.name.trim());
    e.currentTarget.disabled = true;
    try {
      await api('PUT', '/api/admin/settings', { commission: { mode: $('#cMode').value, value: Number($('#cVal').value) }, min_payout: Number($('#cMin').value), contact: { email: $('#ctMail').value, whatsapp: $('#ctWa').value }, pricing });
      toast('تم الحفظ ✓');
    } catch (err) { toast(err.message); }
    e.currentTarget.disabled = false;
  });
}

const VIEWS = { overview, users, team, payouts, settings };
async function load() {
  try {
    if (tab !== 'overview' && !pendingCount) { try { pendingCount = (await api('GET', '/api/admin/payouts')).payouts.filter((p) => p.status === 'pending').length; } catch { /* the view below reports it */ } }
    await VIEWS[tab]();
  } catch (err) {
    app.innerHTML = `<div class="card gate"><h1>لوحة التحكم</h1><p class="muted">${err.status === 401 ? 'سجّل الدخول من الموقع بحساب المسؤول أولًا.' : esc(err.message)}</p><a class="btn primary" href="/" style="display:inline-block;text-decoration:none">فتح الموقع</a></div>`;
  }
}
window.addEventListener('hashchange', () => { const t = location.hash.replace('#', ''); if (VIEWS[t] && t !== tab) { tab = t; load(); } });
load();
