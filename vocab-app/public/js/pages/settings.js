import { api } from '../api.js';
import { state } from '../state.js';
import { speak } from '../audio.js';
import { esc, icon, toast } from '../ui.js';
import { refreshStats } from '../app.js';

export async function render(view) {
  const cfg = await api.config();
  state.config = cfg;
  state.user = cfg.user;
  const u = cfg.user;
  let theme = 'system';
  try {
    theme = localStorage.getItem('theme') || 'system';
  } catch {
    /* storage unavailable */
  }

  view.innerHTML = `
    <div class="page-head"><div><div class="eyebrow">Settings</div><h1>الإعدادات</h1></div></div>
    <div class="grid cols-2">
      <div class="card stack">
        <b>ملفك</b>
        <label class="field">الاسم<input class="input" id="name" value="${esc(u.name)}"></label>
        <label class="field">هدف الكلمات اليومي: <span id="goalVal" class="en-inline">${u.daily_goal}</span>
          <input type="range" id="goal" min="4" max="30" value="${u.daily_goal}" style="accent-color:var(--accent)"></label>
        <p class="tiny muted">يطبّق الهدف الجديد على خطة الغد (خطة اليوم ثابتة؛ يمكنك إضافة 5 كلمات من صفحة تعلّم اليوم).</p>
        <button class="btn primary" id="saveProfile" style="justify-self:start">حفظ</button>
      </div>
      <div class="card stack">
        <b>الصوت والمظهر</b>
        <label class="field">سرعة النطق الأساسية: <span id="rateVal" class="en-inline">${u.speech_rate}×</span>
          <input type="range" id="rate" min="0.6" max="1.3" step="0.05" value="${u.speech_rate}" style="accent-color:var(--accent)"></label>
        <label class="row small" style="gap:8px"><input type="checkbox" class="check" id="ar" ${u.speak_arabic ? 'checked' : ''}> نطق المعنى العربي في صفحة الاستماع</label>
        <button class="btn sm" id="test" style="justify-self:start">${icon.speaker} جرّب الصوت</button>
        <div class="field">المظهر<div class="segmented" id="theme">${[['system', 'تلقائي'], ['light', 'فاتح'], ['dark', 'داكن']].map(([k, l]) => `<button data-t="${k}" class="${k === theme ? 'active' : ''}">${l}</button>`).join('')}</div></div>
      </div>
      <div class="card stack">
        <b>المحرّكات</b>
        <div class="row between small"><span>تحليل المفردات</span><span class="chip ar-chip ${cfg.ai.configured ? 'st-mastered' : 'st-learning'}">${cfg.ai.configured ? 'Claude — سياقي' : 'قاموس محلي'}</span></div>
        <p class="tiny muted">${cfg.ai.configured ? 'المعاني العربية تُستخرج حسب سياق كل جملة في الفيديو.' : 'لتفعيل التحليل السياقي بالذكاء الاصطناعي، اضبط ANTHROPIC_API_KEY على الخادم (ملف ‎.env). لا تُرسل المفاتيح إلى المتصفح أبدًا.'}</p>
        <div class="row between small"><span>تحويل النص إلى كلام</span><span class="chip ar-chip ${cfg.tts.server ? 'st-mastered' : 'st-learning'}">${cfg.tts.server ? esc(cfg.tts.provider) : 'أصوات المتصفح'}</span></div>
        <p class="tiny muted">لأصوات أعلى جودة اضبط TTS_PROVIDER و TTS_API_KEY على الخادم.</p>
        <div class="row between small"><span>قاعدة البيانات</span><span class="chip en-inline">${esc(cfg.database.engine)} · ${esc(cfg.database.file)}</span></div>
      </div>
      <div class="card stack">
        <b>البيانات</b>
        <a class="btn" href="/api/export" download style="justify-self:start">${icon.download} تصدير مفرداتي (JSON)</a>
        <div class="divider" style="margin:6px 0"></div>
        <p class="small ink-2">إعادة تعيين البيانات التجريبية تحذف كل شيء وتعيد إنشاء 3 فيديوهات و56 كلمة مع سجل مراجعات.</p>
        <button class="btn bad" id="reset" style="justify-self:start">${icon.trash} إعادة تعيين البيانات التجريبية</button>
      </div>
    </div>`;

  const $ = (s) => view.querySelector(s);
  $('#goal').addEventListener('input', (e) => ($('#goalVal').textContent = e.target.value));
  $('#rate').addEventListener('input', (e) => ($('#rateVal').textContent = `${e.target.value}×`));
  $('#saveProfile').addEventListener('click', async () => {
    state.user = await api.updateMe({ name: $('#name').value, daily_goal: Number($('#goal').value) });
    toast('تم الحفظ');
  });
  $('#rate').addEventListener('change', async (e) => {
    state.user = await api.updateMe({ speech_rate: Number(e.target.value) });
  });
  $('#ar').addEventListener('change', async (e) => {
    state.user = await api.updateMe({ speak_arabic: e.target.checked });
  });
  $('#test').addEventListener('click', () => speak('I was reluctant to ask for help.').catch(() => toast('الصوت غير مدعوم في هذا المتصفح')));
  $('#theme').addEventListener('click', (e) => {
    const b = e.target.closest('[data-t]');
    if (!b) return;
    const t = b.dataset.t;
    try {
      localStorage.setItem('theme', t);
    } catch {
      /* ignore */
    }
    if (t === 'system') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', t);
    view.querySelectorAll('#theme button').forEach((x) => x.classList.toggle('active', x === b));
  });
  $('#reset').addEventListener('click', async () => {
    if (!confirm('سيتم حذف كل البيانات وإعادة إنشاء البيانات التجريبية. متابعة؟')) return;
    await api.resetDemo();
    toast('تمت إعادة التعيين');
    refreshStats();
    location.hash = '#/';
  });
}
