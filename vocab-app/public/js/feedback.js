// "اقتراحاتكم": learners send ideas to improve the site; the administrator reads them.
import { api } from './api.js';
import { esc, toast, openModal, closeModal, relDate, $ } from './ui.js';

const formHtml = () => `
  <label class="field">اقتراحك أو ملاحظتك
    <textarea class="input" id="fbMsg" rows="4" maxlength="2000" placeholder="مثلًا: أتمنى إضافة… / واجهت مشكلة في…"></textarea></label>
  <label class="field">وسيلة للتواصل معك (اختياري)
    <input class="input" id="fbContact" maxlength="120" placeholder="بريد أو رقم — إن أردت أن نرد عليك"></label>`;

async function send(root) {
  const message = root.querySelector('#fbMsg').value.trim();
  if (message.length < 3) {
    toast('اكتب اقتراحك أولًا');
    return false;
  }
  await api.sendFeedback({ message, contact: root.querySelector('#fbContact').value.trim(), page: location.hash.slice(0, 120) });
  toast('وصلنا اقتراحك — شكرًا لك! 💡');
  return true;
}

/** The suggestion form in a window (from the menu). */
export function openFeedback() {
  openModal(`<h2 style="margin-bottom:6px">💡 اقتراحاتكم</h2>
    <p class="small ink-2">ساعدنا نطوّر الموقع: اكتب أي فكرة أو ميزة تتمناها أو مشكلة واجهتك.</p>
    ${formHtml()}
    <div class="btn-row" style="margin-top:12px"><button class="btn primary" id="fbSend">إرسال</button><button class="btn ghost" data-close>إلغاء</button></div>`);
  const root = $('#modalRoot');
  root.querySelector('#fbMsg').focus();
  root.querySelector('#fbSend').addEventListener('click', async (e) => {
    e.target.disabled = true;
    try {
      if (await send(root)) closeModal();
    } catch (err) {
      toast(err.message);
    } finally {
      e.target.disabled = false;
    }
  });
}

/** The card on the Settings page: the form, and the administrator's inbox. */
export const feedbackCardHtml = () => `
  <div class="card stack" id="feedbackCard">
    <b>💡 اقتراحاتكم</b>
    <p class="small ink-2" style="margin:0">ساعدنا نطوّر الموقع: اكتب أي فكرة أو ميزة تتمناها أو مشكلة واجهتك.</p>
    ${formHtml()}
    <button class="btn primary sm" id="fbSend" style="justify-self:start">إرسال</button>
    <div id="fbInbox"></div>
  </div>`;

export function bindFeedbackCard(view) {
  const card = $('#feedbackCard', view);
  if (!card) return;
  const loadInbox = async () => {
    try {
      const r = await api.feedback();
      const box = card.querySelector('#fbInbox');
      if (!r.items.length) {
        box.innerHTML = '';
        return;
      }
      box.innerHTML = `<div class="divider"></div><b class="small">${r.admin ? `الاقتراحات الواصلة (${r.items.length})` : 'اقتراحاتك السابقة'}</b>
        <div class="fb-list">${r.items.map((f) => `<div class="fb-item"><div class="small" style="white-space:pre-wrap">${esc(f.message)}</div>
          <div class="tiny muted">${r.admin ? `${esc(f.username || f.name || 'زائر')} · ` : ''}${esc(relDate(f.created_at))}${f.contact ? ` · <span class="en-inline">${esc(f.contact)}</span>` : ''}</div></div>`).join('')}</div>`;
    } catch {
      /* inbox is optional */
    }
  };
  card.querySelector('#fbSend').addEventListener('click', async (e) => {
    e.target.disabled = true;
    try {
      if (await send(card)) {
        card.querySelector('#fbMsg').value = '';
        loadInbox();
      }
    } catch (err) {
      toast(err.message);
    } finally {
      e.target.disabled = false;
    }
  });
  loadInbox();
}
