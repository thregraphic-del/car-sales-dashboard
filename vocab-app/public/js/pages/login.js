// Sign in / create an account. The very first account on a new site is the
// administrator (it may need the setup code); later learners register with
// their own username (and the invite code when the site uses one).
// Reachable as /login and /register.
import { api } from '../api.js';
import { esc } from '../ui.js';

export async function render(view, { onDone, mode: initial }) {
  const status = await api.authStatus();
  const first = !status.owner_exists;
  let mode = first ? 'register' : initial === 'register' && status.registration !== 'closed' ? 'register' : 'login';

  const draw = () => {
    const reg = mode === 'register';
    const needCode = first ? status.setup_code_required : status.registration_code_required;
    view.className = 'view page-login';
    view.innerHTML = `
    <div class="auth-wrap">
      <div class="brand"><div class="brand-mark">L</div><div><div class="brand-name">LexiTube</div><div class="brand-sub">مفردات حقيقية من يوتيوب</div></div></div>
      <div class="card stack">
        ${first ? '' : `<div class="segmented" role="tablist" style="justify-self:start">
          <button type="button" data-mode="login" class="${reg ? '' : 'active'}" role="tab" aria-selected="${!reg}">تسجيل الدخول</button>
          ${status.registration !== 'closed' ? `<button type="button" data-mode="register" class="${reg ? 'active' : ''}" role="tab" aria-selected="${reg}">حساب جديد</button>` : ''}
        </div>`}
        <h2 style="margin:0">${first ? 'إنشاء أول حساب' : reg ? 'إنشاء حساب جديد' : 'تسجيل الدخول'}</h2>
        ${first
          ? `<p class="small ink-2">هذا أول حساب في الموقع، وسيكون حساب <b>المسؤول</b>. بعده يستطيع كل شخص إنشاء حسابه الخاص، ولكل حساب كلماته وتقدّمه المنفصل تمامًا.</p>
             ${needCode ? '<p class="tiny muted">تجد رمز الإعداد في حسابك على Netlify: المشروع ← Project configuration ← Environment variables ← <span class="en-inline">SETUP_CODE</span>.</p>' : ''}`
          : reg
            ? '<p class="small ink-2">لكل حساب كلماته ومجموعاته وتقدّمه الخاص — لا يراها غيرك.</p>'
            : '<p class="small ink-2">ادخل لمتابعة التعلّم من حيث توقفت.</p>'}
        <form id="authForm" autocomplete="on">
          ${reg && needCode ? `<label class="field">${first ? 'رمز الإعداد' : 'رمز الدعوة'}<input class="input en" id="code" autocomplete="one-time-code" required></label>` : ''}
          ${reg ? '<label class="field">اسمك <span class="tiny muted">(اختياري)</span><input class="input" id="name" autocomplete="name" maxlength="60"></label>' : ''}
          <label class="field">اسم المستخدم<input class="input en" id="user" autocomplete="username" required minlength="3" maxlength="40"></label>
          <label class="field">كلمة المرور${reg ? ' <span class="tiny muted">(10 أحرف على الأقل)</span>' : ''}<input class="input en" id="pass" type="password" autocomplete="${reg ? 'new-password' : 'current-password'}" required minlength="${reg ? 10 : 1}"></label>
          <div class="alert bad hidden" id="err" role="alert"></div>
          <button class="btn primary" type="submit" id="go">${reg ? 'إنشاء الحساب والدخول' : 'دخول'}</button>
        </form>
      </div>
    </div>`;
    const $ = (s) => view.querySelector(s);
    $('#user').focus();
    view.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => {
      mode = b.dataset.mode;
      history.replaceState(null, '', `/${mode === 'register' ? 'register' : 'login'}${location.hash}`);
      draw();
    }));
    $('#authForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = $('#go');
      btn.disabled = true;
      $('#err').classList.add('hidden');
      try {
        if (reg) await api.register({ username: $('#user').value.trim(), password: $('#pass').value, name: $('#name')?.value.trim(), code: $('#code')?.value.trim() });
        else await api.login($('#user').value.trim(), $('#pass').value);
        if (/^\/(login|register)\/?$/.test(location.pathname)) history.replaceState(null, '', `/${location.hash}`);
        view.innerHTML = '';
        onDone();
      } catch (err) {
        $('#err').innerHTML = esc(err.message);
        $('#err').classList.remove('hidden');
        btn.disabled = false;
      }
    });
  };
  draw();
}
