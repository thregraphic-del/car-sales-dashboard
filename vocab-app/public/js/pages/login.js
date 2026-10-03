// Owner login, or the one-time account setup on a new site.
import { api } from '../api.js';
import { esc } from '../ui.js';

export async function render(view, { onDone }) {
  const status = await api.authStatus();
  const setup = !status.owner_exists;
  view.className = 'view page-login';
  view.innerHTML = `
    <div class="auth-wrap">
      <div class="brand"><div class="brand-mark">L</div><div><div class="brand-name">LexiTube</div><div class="brand-sub">مفردات حقيقية من يوتيوب</div></div></div>
      <div class="card stack">
        <h2 style="margin:0">${setup ? 'إنشاء حسابك' : 'تسجيل الدخول'}</h2>
        ${setup
          ? `<p class="small ink-2">هذا الموقع خاص بك. اكتب <b>رمز الإعداد</b>، ثم اختر اسم مستخدم وكلمة مرور. بعد ذلك يُغلق التسجيل نهائيًا.</p>
             <p class="tiny muted">تجد رمز الإعداد في حسابك على Netlify: المشروع ← Project configuration ← Environment variables ← <span class="en-inline">SETUP_CODE</span>.</p>
             ${status.setup_available ? '' : '<div class="alert warn">لم يُضبط رمز الإعداد على الخادم (SETUP_CODE).</div>'}`
          : '<p class="small ink-2">ادخل لمتابعة التعلّم من حيث توقفت.</p>'}
        <form id="authForm" autocomplete="on">
          ${setup ? '<label class="field">رمز الإعداد<input class="input en" id="code" autocomplete="one-time-code" required></label>' : ''}
          <label class="field">اسم المستخدم<input class="input en" id="user" autocomplete="username" required minlength="3" maxlength="40"></label>
          <label class="field">كلمة المرور${setup ? ' <span class="tiny muted">(10 أحرف على الأقل)</span>' : ''}<input class="input en" id="pass" type="password" autocomplete="${setup ? 'new-password' : 'current-password'}" required minlength="${setup ? 10 : 1}"></label>
          <div class="alert bad hidden" id="err"></div>
          <button class="btn primary" type="submit" id="go">${setup ? 'إنشاء الحساب والدخول' : 'دخول'}</button>
        </form>
      </div>
    </div>`;
  const $ = (s) => view.querySelector(s);
  $('#user').focus();
  $('#authForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('#go');
    btn.disabled = true;
    $('#err').classList.add('hidden');
    try {
      if (setup) await api.setup($('#code').value.trim(), $('#user').value.trim(), $('#pass').value);
      else await api.login($('#user').value.trim(), $('#pass').value);
      view.innerHTML = '';
      onDone();
    } catch (err) {
      $('#err').innerHTML = esc(err.message);
      $('#err').classList.remove('hidden');
      btn.disabled = false;
    }
  });
}
