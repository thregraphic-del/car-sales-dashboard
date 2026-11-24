// Settings: how to reach us (email, WhatsApp) and «انضم لفريقنا» — a code for the member, the count of people who
// signed up with it, the balance and a payout request. The owner's panel is /admin.html.
import { api } from './api.js';
import { state } from './state.js';
import { esc, toast, openModal, copyText } from './ui.js';

const SVG = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const IC = {
  mail: SVG('<rect x="3" y="5" width="18" height="14" rx="3"/><path d="m4 7 8 6 8-6"/>'),
  wa: SVG('<path d="M20 11.5a8 8 0 0 1-11.9 7L4 19.5l1.1-4A8 8 0 1 1 20 11.5z"/><path d="M9 8.5c0 3.5 3 6.5 6.5 6.5l1-1.4-2-1-1 .8a4.5 4.5 0 0 1-2-2l.8-1-1-2z"/>'),
  team: SVG('<circle cx="9" cy="8" r="3.2"/><path d="M3.5 19c.5-3.2 2.7-5 5.5-5s5 1.8 5.5 5"/><path d="M16 5.2a3 3 0 0 1 0 5.6M18.5 14.4c1.6.7 2.6 2.2 3 4.6"/>'),
  panel: SVG('<rect x="3" y="3" width="7" height="9" rx="2"/><rect x="14" y="3" width="7" height="5" rx="2"/><rect x="14" y="12" width="7" height="9" rx="2"/><rect x="3" y="16" width="7" height="5" rx="2"/>'),
  copy: SVG('<rect x="8" y="8" width="12" height="12" rx="3"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>'),
};
const riyal = (cents) => `${(Number(cents || 0) / 100).toLocaleString('en', { maximumFractionDigits: 2 })} ريال`;
const waLink = (num, text) => `https://wa.me/${encodeURIComponent(num)}${text ? `?text=${encodeURIComponent(text)}` : ''}`;

/** The «تواصل معنا» + «انضم لفريقنا» card for the settings page. */
export function teamCardHtml(cfg) {
  const c = cfg.contact || {};
  const rows = [];
  if (c.whatsapp) rows.push(`<a class="tm-contact" href="${esc(waLink(c.whatsapp, 'السلام عليكم، عندي استفسار عن 3Goal'))}" target="_blank" rel="noopener"><span class="tm-ic wa">${IC.wa}</span><span><b>واتساب</b><span class="tiny muted en-inline">+${esc(c.whatsapp)}</span></span></a>`);
  if (c.email) rows.push(`<a class="tm-contact" href="mailto:${esc(c.email)}?subject=${encodeURIComponent('استفسار عن 3Goal')}"><span class="tm-ic mail">${IC.mail}</span><span><b>الإيميل</b><span class="tiny muted en-inline">${esc(c.email)}</span></span></a>`);
  return `<div class="card stack tm-card" style="grid-column:1/-1">
    <b>تواصل معنا</b>
    ${rows.length ? `<div class="tm-contacts">${rows.join('')}</div>` : (cfg.can_set_paid ? '<p class="tiny muted" style="margin:0">أضف إيميلك ورقم الواتساب من لوحة التحكم (الإعدادات) وبيظهرون هنا لكل المستخدمين.</p>' : '<p class="tiny muted" style="margin:0">قريبًا.</p>')}
    ${cfg.can_set_paid ? '<a class="tm-join" href="/admin.html"><span class="tm-ic">'+IC.panel+'</span><span><b>لوحة التحكم</b><span class="tiny muted">العملاء والفريق والمبالغ والتحليلات والأسعار (لك أنتِ فقط)</span></span></a>' : ''}
    <button type="button" class="tm-join" id="joinTeam"><span class="tm-ic team">${IC.team}</span><span><b>انضم لفريقنا</b><span class="tiny muted">احصل على كودك الخاص واربح عمولة عن كل مشترك</span></span></button>
  </div>`;
}

export function bindTeamCard(view) {
  view.querySelector('#joinTeam')?.addEventListener('click', openTeam);
}

export async function openTeam() {
  // not registered yet → the sign-up page first (the team code needs an account)
  if (state.user?.guest) { toast('سجّل حسابك أولًا ثم ارجع لهنا'); location.href = '/register'; return; }
  let me;
  try {
    me = (await api.teamMe()).member;
    if (!me) me = (await api.teamJoin({})).member; // automatic: name / email / phone come from the account
  } catch (err) { return toast(err.message); }
  const box = openModal('<div class="tm-modal" id="tmBody"><p class="muted"><span class="spinner"></span></p></div>');
  const body = box.querySelector('#tmBody');
  const showMe = () => {
    const link = `${location.origin}/register?ref=${encodeURIComponent(me.code)}`;
    const pct = Math.min(100, Math.round((me.available / Math.max(1, me.min_payout_cents)) * 100));
    const thanks = me.requests.find((r) => r.status === 'paid' && !r.seen);
    const declined = me.requests.find((r) => r.status === 'rejected' && !r.seen);
    const STAT = { pending: ['بانتظار التحويل', 'warn'], paid: ['تم التحويل ✓', 'good'], rejected: ['مرفوض', 'bad'] };
    body.innerHTML = `<h3 style="margin:0 0 10px">فريق 3Goal</h3>
      ${thanks ? `<div class="alert good tm-thanks">🎉 تم تحويل <b>${riyal(thanks.amount_cents)}</b> لك. شكرًا على جهودك، وندعوك لمضاعفة الجهود، كل مشترك جديد بكودك يقرّبك للمبلغ الجاي 🚀</div>` : ''}
      ${declined ? `<div class="alert bad">ما قدرنا ننفّذ آخر طلب تحويل${declined.note ? `: ${esc(declined.note)}` : ''}. تواصل معنا.</div>` : ''}
      <div class="tm-opt"><div class="tm-code"><span class="tiny muted">كودك</span><b class="en-inline" id="tmCode">${esc(me.code)}</b>
          <button type="button" class="btn sm ghost" id="tmCopy" aria-label="نسخ الكود" title="نسخ الكود">${IC.copy} نسخ</button></div>
        </div>
      <div class="tm-opt"><div class="tm-link"><div class="row" style="gap:8px"><input class="input en" id="tmLink" readonly value="${esc(link)}" aria-label="رابطك الخاص"><button type="button" class="btn sm" id="tmCopyLink">نسخ الرابط</button></div></div>
        </div>
      <p class="tm-note" style="text-align:center;margin:10px 0"><b>شاركه وبيرجع لك نقاط 🎯</b></p>
      <button type="button" class="btn lg tm-share" id="tmShare">شارك رابطك وكودك</button>
      <div class="tm-stats">
        <div><b>${me.referrals}</b><span class="tiny muted">سجّلوا بكودك</span></div>
        <div><b>${riyal(me.available)}</b><span class="tiny muted">رصيدك المتاح</span></div>
        <div><b>${riyal(me.paid)}</b><span class="tiny muted">تم تحويله لك</span></div>
      </div>
      <div class="tm-bar" aria-label="الوصول للحد الأدنى"><i style="width:${pct}%"></i></div>
      <p class="tiny muted" style="margin:4px 0 10px">الحد الأدنى للتحويل ${riyal(me.min_payout_cents)}${me.pending ? ` · بانتظار تحويل ${riyal(me.pending)}` : ''}</p>
      <button type="button" class="btn primary lg" id="tmPay" ${me.can_request ? '' : 'disabled'}>أرسل طلب تحويل${me.can_request ? ` (${riyal(me.available)})` : ''}</button>
      <div class="alert good hidden" id="tmSent" role="status"></div>
      ${me.recent.length ? `<h4 style="margin:16px 0 6px">آخر المسجّلين بكودك</h4><ul class="tm-list">${me.recent.map((r) => `<li>${esc(r.name || '—')}<span class="tiny muted">${esc(String(r.at).slice(0, 10))}</span></li>`).join('')}</ul>` : '<p class="tiny muted" style="margin-top:14px">ما سجّل أحد بكودك للحين. شارك رابطك مع أصحابك.</p>'}
      ${me.requests.length ? `<h4 style="margin:16px 0 6px">طلبات التحويل</h4><ul class="tm-list">${me.requests.map((r) => `<li>${riyal(r.amount_cents)}<span class="chip ${STAT[r.status]?.[1] || ''}">${STAT[r.status]?.[0] || r.status}</span><span class="tiny muted">${esc(String(r.created_at).slice(0, 10))}</span></li>`).join('')}</ul>` : ''}`;
    body.querySelector('#tmCopy').addEventListener('click', async () => toast((await copyText(me.code)) ? 'نسخنا الكود ✓' : 'ما قدرنا ننسخ'));
    body.querySelector('#tmShare').addEventListener('click', async () => {
      const text = `سجّل في 3Goal وتعلّم الإنجليزي من يوتيوب 🎯\nالرابط: ${link}\nأو اكتب كودي عند التسجيل: ${me.code}`;
      try { if (navigator.share) { await navigator.share({ text }); return; } } catch (err) { if (err?.name === 'AbortError') return; }
      window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
    });
    body.querySelector('#tmCopyLink').addEventListener('click', async () => toast((await copyText(link)) ? 'نسخنا الرابط ✓' : 'ما قدرنا ننسخ'));
    body.querySelector('#tmPay')?.addEventListener('click', async (e) => {
      e.currentTarget.disabled = true;
      try {
        const amount = me.available;
        me = (await api.teamPayout()).member;
        const wa = state.config?.contact?.whatsapp;
        showMe();
        const el = body.querySelector('#tmSent');
        el.innerHTML = `وصل طلبك ✓ بنراجعه ونحوّل لك المبلغ.${wa ? ` <a class="link-btn" target="_blank" rel="noopener" href="${esc(waLink(wa, `طلب تحويل ${riyal(amount)} — كودي ${me.code} — ${me.name}`))}">نبّهنا على واتساب ←</a>` : ''}`;
        el.classList.remove('hidden');
      } catch (err) { toast(err.message); e.currentTarget.disabled = false; }
    });
    if (thanks || declined) api.teamAck().catch(() => {});
  };
  showMe();
}
