// Sign in / create an account. The very first account on a new site is the
// administrator (it may need the setup code); later learners register with
// their own username (and the invite code when the site uses one).
// Reachable as /login and /register.
import { api } from '../api.js';
import { esc } from '../ui.js';

export async function render(view, { onDone, mode: initial, status: given }) {
  const status = given || await api.authStatus();
  const first = !status.owner_exists;
  let mode = first ? 'register' : initial === 'register' && status.registration !== 'closed' ? 'register' : 'login';

  const draw = () => {
    const reg = mode === 'register';
    const needCode = first ? status.setup_code_required : status.registration_code_required;
    view.className = 'view page-login';
    view.innerHTML = `
    <div class="auth-wrap">
      <div class="brand"><img class="brand-logo" src="/img/3goal-mark-64.png" alt="" width="44" height="44"><div><div class="brand-name">3Goal</div><div class="brand-sub">مفردات حقيقية من يوتيوب</div></div></div>
      <div class="card stack">
        ${first ? '' : `<div class="segmented" role="tablist" style="justify-self:start">
          <button type="button" data-mode="login" class="${reg ? '' : 'active'}" role="tab" aria-selected="${!reg}">تسجيل الدخول</button>
          ${status.registration !== 'closed' ? `<button type="button" data-mode="register" class="${reg ? 'active' : ''}" role="tab" aria-selected="${reg}">حساب جديد</button>` : ''}
        </div>`}
        <h2 style="margin:0">${first ? 'إنشاء أول حساب' : reg ? 'إنشاء حساب جديد' : 'تسجيل الدخول'}</h2>
        ${status.guest && reg ? '<div class="alert info"><span>✨ كل اللي سويته كضيف — كلماتك ومقاطعك وتقدّمك — ينتقل لحسابك الجديد.</span></div>' : ''}
        ${first
          ? `<p class="small ink-2">هذا أول حساب في الموقع، وسيكون حساب <b>المسؤول</b>. بعده يستطيع كل شخص إنشاء حسابه الخاص، ولكل حساب كلماته وتقدّمه المنفصل تمامًا.</p>
             ${needCode ? '<p class="tiny muted">تجد رمز الإعداد في حسابك على Netlify: المشروع ← Project configuration ← Environment variables ← <span class="en-inline">SETUP_CODE</span>.</p>' : ''}`
          : reg
            ? '<p class="small ink-2">لكل حساب كلماته ومجموعاته وتقدّمه الخاص — لا يراها غيرك.</p>'
            : '<p class="small ink-2">ادخل وكمّل من وين ما وقفت.</p>'}
        <form id="authForm" autocomplete="on">
          ${reg && needCode ? `<label class="field">${first ? 'رمز الإعداد' : 'رمز الدعوة'}<input class="input en" id="code" autocomplete="one-time-code" required></label>` : ''}
          ${reg ? '<label class="field">اسمك <span class="tiny muted">(اختياري)</span><input class="input" id="name" autocomplete="name" maxlength="60"></label>' : ''}
          ${reg ? '<label class="field">الإيميل <span class="tiny muted">(مهم: بدونه ما تقدر تسترجع حسابك إذا نسيت كلمة المرور)</span><input class="input en" id="email" type="email" autocomplete="email" maxlength="200"></label>' : ''}
          ${reg ? '<label class="field">رقم الجوال <span class="tiny muted">(اختياري — تقدر تدخل فيه)</span><input class="input en" id="phone" type="tel" inputmode="tel" autocomplete="tel" maxlength="20" placeholder="05xxxxxxxx"></label>' : ''}
          <label class="field">${reg ? 'اسم المستخدم' : 'اسم المستخدم أو الإيميل أو الجوال'}<input class="input en" id="user" autocomplete="username" required ${reg ? 'minlength="3" ' : ''}maxlength="${reg ? 40 : 200}"></label>
          <label class="field">كلمة المرور<span class="pw-wrap"><input class="input en" id="pass" type="password" autocomplete="${reg ? 'new-password' : 'current-password'}" required><button type="button" class="pw-eye" id="pwEye" aria-label="إظهار كلمة المرور">👁</button></span></label>
          <div class="alert bad hidden" id="err" role="alert"></div>
          <button class="btn primary" type="submit" id="go">${reg ? 'إنشاء الحساب والدخول' : 'دخول'}</button>
        </form>
        ${reg ? '' : '<button type="button" class="link-btn" id="forgot" style="justify-self:start">نسيت كلمة المرور؟</button>'}
        ${status.guest_allowed && !status.guest ? '<a class="link-btn" href="/" style="justify-self:start">أو جرّب الموقع بدون تسجيل ←</a>' : ''}
        ${status.guest ? '<a class="link-btn" href="/" style="justify-self:start">← رجوع للموقع (كضيف)</a>' : ''}
      </div>
    </div>`;
    const $ = (s) => view.querySelector(s);
    $('#user').focus();
    $('#pwEye')?.addEventListener('click', () => { const p = $('#pass'); p.type = p.type === 'password' ? 'text' : 'password'; });
    view.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => {
      mode = b.dataset.mode;
      history.replaceState(null, '', `/${mode === 'register' ? 'register' : 'login'}${location.hash}`);
      draw();
    }));
    $('#forgot')?.addEventListener('click', () => forgot($('#user').value.trim()));
    $('#authForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = $('#go');
      btn.disabled = true;
      $('#err').classList.add('hidden');
      try {
        if (reg) await api.register({ username: $('#user').value.trim(), password: $('#pass').value, name: $('#name')?.value.trim(), code: $('#code')?.value.trim(), email: $('#email')?.value.trim(), phone: $('#phone')?.value.trim() });
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
  // 🔐 «نسيت كلمة المرور»: a 6-digit code by email, then a new password
  const forgot = (login0 = '') => {
    view.innerHTML = `<div class="auth-wrap"><div class="brand"><img class="brand-logo" src="/img/3goal-mark-64.png" alt="" width="44" height="44"><div><div class="brand-name">3Goal</div></div></div>
      <div class="card stack"><h2 style="margin:0">استرجاع الحساب</h2>
        <p class="small ink-2">اكتب اسم المستخدم أو الإيميل أو الجوال، ويوصلك كود من ٦ أرقام على إيميلك.</p>
        <form id="f1"><label class="field">اسم المستخدم أو الإيميل أو الجوال<input class="input en" id="login" value="${esc(login0)}" required></label>
          <button class="btn primary" id="send">أرسل الكود</button></form>
        <form id="f2" class="hidden"><p class="small">✉️ إذا كان للحساب إيميل، وصلك كود (شيّك على السبام بعد).</p>
          <label class="field">الكود<input class="input en" id="rcode" inputmode="numeric" maxlength="6" autocomplete="one-time-code" required></label>
          <label class="field">كلمة المرور الجديدة<input class="input en" id="npass" type="password" autocomplete="new-password" required></label>
          <button class="btn primary" id="reset">غيّر كلمة المرور وادخل</button></form>
        <div class="alert bad hidden" id="ferr" role="alert"></div>
        <button type="button" class="link-btn" id="back" style="justify-self:start">↩ رجوع لتسجيل الدخول</button></div></div>`;
    const q = (s) => view.querySelector(s);
    const fail = (err) => { q('#ferr').textContent = err.message; q('#ferr').classList.remove('hidden'); };
    q('#back').addEventListener('click', draw);
    q('#f1').addEventListener('submit', async (e) => {
      e.preventDefault();
      q('#ferr').classList.add('hidden');
      q('#send').disabled = true;
      try { await api.forgotPassword(q('#login').value.trim()); q('#f2').classList.remove('hidden'); q('#rcode').focus(); } catch (err) { fail(err); }
      q('#send').disabled = false;
    });
    q('#f2').addEventListener('submit', async (e) => {
      e.preventDefault();
      q('#ferr').classList.add('hidden');
      try {
        await api.resetPassword({ login: q('#login').value.trim(), code: q('#rcode').value.trim(), password: q('#npass').value });
        if (/^\/(login|register)\/?$/.test(location.pathname)) history.replaceState(null, '', `/${location.hash}`);
        view.innerHTML = '';
        onDone();
      } catch (err) { fail(err); }
    });
  };
  draw();
}
